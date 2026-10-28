/**
 * @file /server/db/index.js
 * @description Dual-engine database adapter supporting PostgreSQL (Supabase, Neon, Cloud SQL)
 * for permanent production persistence on Vercel, and WebAssembly SQLite (sql.js) for local development/testing.
 *
 * Provides a unified query interface with automatic dialect conversion:
 * - Parameter placeholder mapping (? -> $1, $2, ...)
 * - Timestamp function mapping (datetime('now') -> NOW(), interval expressions)
 * - Conflict handling (ON CONFLICT DO NOTHING / DO UPDATE)
 * - Result rowid extraction (RETURNING id)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import initSqlJs from 'sql.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const { Pool } = pg;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '../..');

// State flags
export const isPostgres = Boolean(env.DATABASE_URL || env.POSTGRES_URL);

let pgPool = null;
let rawDb = null;
let SQL = null;
let initPromise = null;
let inTransaction = false;

/**
 * Returns PostgreSQL Pool instance if configured.
 */
export function getPool() {
  return pgPool;
}

/**
 * Converts SQLite SQL dialect into PostgreSQL dialect.
 * Handles parameters (?, ?, ? -> $1, $2, $3) and SQLite datetime functions.
 */
export function transformSqlForPostgres(sql) {
  let paramIndex = 1;
  let out = sql.replace(/\?/g, () => `$${paramIndex++}`);

  // Datetime translations
  out = out.replace(/datetime\('now',\s*'-(\d+)\s*days'\)/gi, "(NOW() - INTERVAL '$1 days')");
  out = out.replace(/datetime\('now'\)/gi, 'NOW()');
  out = out.replace(/datetime\(created_at\)/gi, 'created_at');

  // Upsert / Conflict translations
  if (/INSERT\s+OR\s+REPLACE\s+INTO\s+_system_meta/i.test(out)) {
    out = out.replace(/INSERT\s+OR\s+REPLACE\s+INTO\s+_system_meta/i, 'INSERT INTO _system_meta');
    if (!out.includes('ON CONFLICT')) {
      out = `${out.trim().replace(/;$/, '')} ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
    }
  } else if (/INSERT\s+OR\s+REPLACE\s+INTO\s+deleted_clients/i.test(out)) {
    out = out.replace(/INSERT\s+OR\s+REPLACE\s+INTO\s+deleted_clients/i, 'INSERT INTO deleted_clients');
    if (!out.includes('ON CONFLICT')) {
      out = `${out.trim().replace(/;$/, '')} ON CONFLICT (client_name) DO UPDATE SET deleted_at = NOW(), client_id = EXCLUDED.client_id`;
    }
  } else if (/INSERT\s+OR\s+IGNORE\s+INTO\s+deleted_clients/i.test(out)) {
    out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO\s+deleted_clients/i, 'INSERT INTO deleted_clients');
    if (!out.includes('ON CONFLICT')) {
      out = `${out.trim().replace(/;$/, '')} ON CONFLICT (client_name) DO NOTHING`;
    }
  } else if (/INSERT\s+OR\s+IGNORE\s+INTO\s+admins/i.test(out)) {
    out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO\s+admins/i, 'INSERT INTO admins');
    if (!out.includes('ON CONFLICT')) {
      out = `${out.trim().replace(/;$/, '')} ON CONFLICT (email) DO NOTHING`;
    }
  }

  // If query is an INSERT and does not have RETURNING clause, add RETURNING id
  if (/^\s*INSERT\s+INTO/i.test(out) && !/RETURNING/i.test(out)) {
    out = `${out.trim().replace(/;$/, '')} RETURNING id, *`;
  }

  return out;
}

/**
 * Initializes PostgreSQL schema and indexes if not already present.
 */
async function initPostgresSchema(pool) {
  const schemaCandidates = [
    path.resolve(currentDir, 'schema.postgres.sql'),
    path.resolve(projectRoot, 'server/db/schema.postgres.sql'),
  ];
  const schemaPath = schemaCandidates.find((p) => fs.existsSync(p));

  if (schemaPath) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schemaSql);
    logger.info('PostgreSQL schema verified and synchronized from schema.postgres.sql.');
  } else {
    // Fallback inline PostgreSQL schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _system_meta (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ DEFAULT NULL
      );
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(255) DEFAULT '',
        logo_url TEXT DEFAULT '',
        website_url TEXT DEFAULT '',
        description TEXT DEFAULT '',
        is_featured SMALLINT NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_clients_featured ON clients(is_featured, sort_order);
      CREATE TABLE IF NOT EXISTS deleted_clients (
        client_name VARCHAR(255) PRIMARY KEY,
        client_id INTEGER,
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS testimonials (
        id SERIAL PRIMARY KEY,
        client_name VARCHAR(255) NOT NULL,
        business_type VARCHAR(255) NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        review TEXT NOT NULL,
        is_published SMALLINT NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_testimonials_published ON testimonials(is_published, sort_order);
      CREATE TABLE IF NOT EXISTS deleted_testimonials (
        id SERIAL PRIMARY KEY,
        testimonial_id INTEGER,
        client_name VARCHAR(255),
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        category VARCHAR(100) NOT NULL,
        client_name VARCHAR(255) DEFAULT '',
        location VARCHAR(255) DEFAULT '',
        area_sqft INTEGER DEFAULT 0,
        description TEXT NOT NULL,
        scope JSONB NOT NULL DEFAULT '[]'::jsonb,
        image_url TEXT NOT NULL,
        gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_featured SMALLINT NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_published SMALLINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
      CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
      CREATE INDEX IF NOT EXISTS idx_projects_published ON projects(is_published, sort_order);
      CREATE TABLE IF NOT EXISTS deleted_projects (
        id SERIAL PRIMARY KEY,
        project_id INTEGER,
        slug VARCHAR(255),
        title VARCHAR(255),
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS enquiries (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        business_type VARCHAR(100) NOT NULL,
        project_location VARCHAR(255) DEFAULT '',
        area_sqft INTEGER NOT NULL DEFAULT 0,
        message TEXT DEFAULT '',
        source VARCHAR(50) NOT NULL DEFAULT 'contact_form',
        calculator_data JSONB DEFAULT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'new',
        admin_notes TEXT DEFAULT '',
        consent_given SMALLINT NOT NULL DEFAULT 1,
        ip_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
      CREATE INDEX IF NOT EXISTS idx_enquiries_source ON enquiries(source);
      CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries(created_at);
      CREATE TABLE IF NOT EXISTS downloads (
        id SERIAL PRIMARY KEY,
        file_key VARCHAR(100) NOT NULL,
        ip_hash VARCHAR(255) DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_downloads_file ON downloads(file_key);
    `);
    logger.info('PostgreSQL schema initialized from fallback definitions.');
  }

  // Ensure initial tombstones are respected in PostgreSQL
  await pool.query(`
    DELETE FROM clients WHERE name IN (SELECT client_name FROM deleted_clients);
    DELETE FROM testimonials WHERE id IN (SELECT testimonial_id FROM deleted_testimonials WHERE testimonial_id IS NOT NULL)
      OR client_name IN (SELECT client_name FROM deleted_testimonials WHERE client_name IS NOT NULL);
    DELETE FROM projects WHERE id IN (SELECT project_id FROM deleted_projects WHERE project_id IS NOT NULL)
      OR slug IN (SELECT slug FROM deleted_projects WHERE slug IS NOT NULL);
  `);
}

/**
 * Persists in-memory SQLite state to the physical file on disk using atomic writes.
 * (Only active in SQLite fallback mode)
 */
function persistDb() {
  if (isPostgres || !rawDb || inTransaction) return;
  try {
    const data = rawDb.export();
    const buffer = Buffer.from(data);
    const dir = path.dirname(env.DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${env.DB_PATH}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, env.DB_PATH);
  } catch (err) {
    logger.error('Failed to persist database to disk:', err);
  }
}

/**
 * Initializes database connection (PostgreSQL when configured, otherwise SQLite).
 */
export async function initDb() {
  if (isPostgres && pgPool) return pgPool;
  if (!isPostgres && rawDb) return rawDb;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const connStr = env.DATABASE_URL || env.POSTGRES_URL;

      if (connStr) {
        logger.info('Connecting to persistent PostgreSQL database...');
        const isLocal = connStr.includes('localhost') || connStr.includes('127.0.0.1');

        pgPool = new Pool({
          connectionString: connStr,
          ssl: isLocal ? false : { rejectUnauthorized: false },
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        });

        pgPool.on('error', (err) => {
          logger.error('Unexpected idle PostgreSQL client error:', err);
        });

        // Test connection
        const testRes = await pgPool.query('SELECT NOW() as now');
        logger.info(`✅ PostgreSQL connection established successfully. Server time: ${testRes.rows[0].now}`);

        // Ensure schema and indexes exist
        await initPostgresSchema(pgPool);

        return pgPool;
      }

      // Check Vercel / Production constraint warning
      if (process.env.VERCEL || env.NODE_ENV === 'production') {
        logger.warn(
          '⚠️ CRITICAL NOTICE: No persistent PostgreSQL database configured (DATABASE_URL / POSTGRES_URL is empty). ' +
          'Vercel serverless containers are ephemeral; to ensure additions, changes, and deletions permanently survive ' +
          'redeployments and multi-region containers, please configure DATABASE_URL in Vercel project environment variables ' +
          '(e.g. from Supabase or Neon PostgreSQL).'
        );
      }

      // Local / Testing WebAssembly SQLite Initialization (sql.js)
      SQL = await initSqlJs({
        locateFile: (file) => {
          const candidates = [
            path.resolve(process.cwd(), 'node_modules/sql.js/dist', file),
            path.resolve(currentDir, '../../node_modules/sql.js/dist', file),
            path.resolve(currentDir, '../node_modules/sql.js/dist', file),
            path.resolve(currentDir, file),
            path.resolve(process.cwd(), 'server/db', file),
            path.resolve(process.cwd(), file),
          ];
          for (const c of candidates) {
            if (fs.existsSync(c)) return c;
          }
          return file;
        },
      });

      // On serverless environments (e.g. Vercel), copy packaged DB to writable path if needed
      if (!fs.existsSync(env.DB_PATH)) {
        const packagedDb = path.resolve(currentDir, 'fusion.db');
        const projectDb = path.resolve(process.cwd(), 'server/db/fusion.db');
        const sourceDb = fs.existsSync(packagedDb) ? packagedDb : (fs.existsSync(projectDb) ? projectDb : null);
        if (sourceDb) {
          try {
            const destDir = path.dirname(env.DB_PATH);
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            fs.copyFileSync(sourceDb, env.DB_PATH);
          } catch (_) {}
        }
      }

      if (fs.existsSync(env.DB_PATH)) {
        const fileBuffer = fs.readFileSync(env.DB_PATH);
        rawDb = new SQL.Database(fileBuffer);
        logger.info(`Loaded existing SQLite database from ${env.DB_PATH}`);
      } else {
        rawDb = new SQL.Database();
        logger.info(`Initialized fresh in-memory SQLite database for ${env.DB_PATH}`);
      }

      const schemaCandidates = [
        path.resolve(path.dirname(env.DB_PATH), 'schema.sql'),
        path.resolve(currentDir, 'schema.sql'),
        path.resolve(process.cwd(), 'server/db/schema.sql'),
      ];
      const schemaPath = schemaCandidates.find((p) => fs.existsSync(p));
      if (schemaPath) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        rawDb.run(schemaSql);
        persistDb();
      }

      // Ensure tombstone tables exist in SQLite
      try {
        rawDb.run(`
          CREATE TABLE IF NOT EXISTS _system_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE TABLE IF NOT EXISTS deleted_clients (
            client_name TEXT PRIMARY KEY,
            client_id INTEGER,
            deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE TABLE IF NOT EXISTS deleted_testimonials (
            testimonial_id INTEGER,
            client_name TEXT,
            deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE TABLE IF NOT EXISTS deleted_projects (
            project_id INTEGER,
            slug TEXT,
            title TEXT,
            deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `);
        rawDb.run('DELETE FROM clients WHERE name IN (SELECT client_name FROM deleted_clients);');
        rawDb.run('DELETE FROM testimonials WHERE id IN (SELECT testimonial_id FROM deleted_testimonials WHERE testimonial_id IS NOT NULL) OR client_name IN (SELECT client_name FROM deleted_testimonials WHERE client_name IS NOT NULL);');
        rawDb.run('DELETE FROM projects WHERE id IN (SELECT project_id FROM deleted_projects WHERE project_id IS NOT NULL) OR slug IN (SELECT slug FROM deleted_projects WHERE slug IS NOT NULL);');
        persistDb();
      } catch (_) {}

      return rawDb;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Extracts and normalizes bindable parameters.
 */
function extractParams(args) {
  if (args.length === 0) return [];
  if (args.length === 1) {
    const first = args[0];
    if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
      return Object.values(first);
    }
    if (Array.isArray(first)) {
      return first;
    }
    return [first];
  }
  return args;
}

/**
 * Formats JSON values for PostgreSQL query parameters (converts objects/arrays to JSON strings if needed).
 */
function normalizePgParam(p) {
  if (p === undefined) return null;
  if (p !== null && typeof p === 'object' && !(p instanceof Date) && !Buffer.isBuffer(p)) {
    return JSON.stringify(p);
  }
  return p;
}

/**
 * Unified database interface.
 * Implements better-sqlite3 style methods (.prepare, .all, .get, .run, .transaction, .exec)
 * with seamless transparent execution across both PostgreSQL and SQLite.
 */
export const db = {
  /**
   * Prepares a parameterized SQL statement with .all(), .get(), and .run() methods.
   * Works synchronously in SQLite mode (for backwards compatibility) and returns
   * Promise/Thenables in PostgreSQL mode.
   */
  prepare(sql) {
    if (isPostgres) {
      if (!pgPool) {
        throw new Error('Database not initialized! Call await initDb() on server start.');
      }
      const pgSql = transformSqlForPostgres(sql);

      return {
        all(...args) {
          const rawParams = extractParams(args);
          const params = rawParams.map(normalizePgParam);
          return pgPool.query(pgSql, params).then((res) => res.rows);
        },

        get(...args) {
          const rawParams = extractParams(args);
          const params = rawParams.map(normalizePgParam);
          return pgPool.query(pgSql, params).then((res) => res.rows[0] ?? undefined);
        },

        run(...args) {
          const rawParams = extractParams(args);
          const params = rawParams.map(normalizePgParam);
          return pgPool.query(pgSql, params).then((res) => {
            const row = res.rows && res.rows[0] ? res.rows[0] : null;
            return {
              lastInsertRowid: row ? (row.id ?? null) : null,
              changes: res.rowCount ?? 0,
              row,
            };
          });
        },
      };
    }

    // SQLite mode (sql.js)
    if (!rawDb) {
      throw new Error('Database not initialized! Call await initDb() on server start.');
    }

    return {
      all(...args) {
        const params = extractParams(args);
        const stmt = rawDb.prepare(sql);
        try {
          if (params.length > 0) stmt.bind(params);
          const results = [];
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          return results;
        } finally {
          stmt.free();
        }
      },

      get(...args) {
        const params = extractParams(args);
        const stmt = rawDb.prepare(sql);
        try {
          if (params.length > 0) stmt.bind(params);
          if (stmt.step()) {
            return stmt.getAsObject();
          }
          return undefined;
        } finally {
          stmt.free();
        }
      },

      run(...args) {
        const params = extractParams(args);
        rawDb.run(sql, params);

        let lastInsertRowid = 0;
        let changes = 0;
        try {
          const res = rawDb.exec('SELECT last_insert_rowid() as id, changes() as count;');
          if (res && res[0] && res[0].values && res[0].values[0]) {
            lastInsertRowid = res[0].values[0][0];
            changes = res[0].values[0][1];
          }
        } catch (_) {}

        persistDb();

        return {
          lastInsertRowid,
          changes,
        };
      },
    };
  },

  /**
   * Helper: Execute query and return all rows.
   */
  async all(sql, ...args) {
    const prep = this.prepare(sql);
    return await prep.all(...args);
  },

  /**
   * Helper: Execute query and return single row.
   */
  async get(sql, ...args) {
    const prep = this.prepare(sql);
    return await prep.get(...args);
  },

  /**
   * Helper: Execute query and return execution summary.
   */
  async run(sql, ...args) {
    const prep = this.prepare(sql);
    return await prep.run(...args);
  },

  /**
   * Helper: Execute raw SQL query.
   */
  async query(sql, params = []) {
    if (isPostgres) {
      if (!pgPool) await initDb();
      const pgSql = transformSqlForPostgres(sql);
      const res = await pgPool.query(pgSql, params.map(normalizePgParam));
      return { rows: res.rows, rowCount: res.rowCount };
    }
    const stmt = this.prepare(sql);
    const rows = stmt.all(...params);
    return { rows, rowCount: rows.length };
  },

  /**
   * Wraps a callback function in a single database transaction.
   */
  transaction(fn) {
    return (...args) => {
      if (isPostgres) {
        return (async () => {
          if (!pgPool) await initDb();
          const client = await pgPool.connect();
          try {
            await client.query('BEGIN');
            const result = await fn(...args);
            await client.query('COMMIT');
            return result;
          } catch (err) {
            try { await client.query('ROLLBACK'); } catch (_) {}
            throw err;
          } finally {
            client.release();
          }
        })();
      }

      if (!rawDb) throw new Error('Database not initialized!');
      inTransaction = true;
      rawDb.run('BEGIN TRANSACTION;');
      try {
        const result = fn(...args);
        if (result && typeof result.then === 'function') {
          return result
            .then((res) => {
              rawDb.run('COMMIT;');
              inTransaction = false;
              persistDb();
              return res;
            })
            .catch((err) => {
              try { rawDb.run('ROLLBACK;'); } catch (_) {}
              inTransaction = false;
              throw err;
            });
        }
        rawDb.run('COMMIT;');
        inTransaction = false;
        persistDb();
        return result;
      } catch (err) {
        try { rawDb.run('ROLLBACK;'); } catch (_) {}
        inTransaction = false;
        throw err;
      }
    };
  },

  /**
   * Executes a raw SQL string (e.g. for migrations or DDL).
   */
  async exec(sql) {
    if (isPostgres) {
      if (!pgPool) await initDb();
      await pgPool.query(sql);
      return;
    }
    if (!rawDb) throw new Error('Database not initialized!');
    rawDb.run(sql);
    persistDb();
  },

  /**
   * Explicitly flush state to disk (SQLite mode).
   */
  persist() {
    persistDb();
  },

  /**
   * Closes database cleanly.
   */
  async close() {
    if (pgPool) {
      await pgPool.end();
      pgPool = null;
    }
    if (rawDb) {
      persistDb();
      rawDb.close();
      rawDb = null;
    }
  },
};

/**
 * Record a deleted client tombstone in persistent database.
 */
export async function recordDeletedClient(name, id = null) {
  if (!name) return;
  try {
    if (isPostgres && pgPool) {
      await pgPool.query(
        'INSERT INTO deleted_clients (client_name, client_id, deleted_at) VALUES ($1, $2, NOW()) ON CONFLICT (client_name) DO UPDATE SET deleted_at = NOW(), client_id = EXCLUDED.client_id',
        [name.trim(), id]
      );
    } else if (rawDb) {
      rawDb.run("INSERT OR REPLACE INTO deleted_clients (client_name, client_id, deleted_at) VALUES (?, ?, datetime('now'))", [name.trim(), id]);
      persistDb();
    }
    syncTombstones();
  } catch (err) {
    logger.warn('Failed to record deleted client tombstone:', err);
  }
}

/**
 * Record a deleted testimonial tombstone in persistent database.
 */
export async function recordDeletedTestimonial(id, clientName = null) {
  try {
    if (isPostgres && pgPool) {
      await pgPool.query(
        'INSERT INTO deleted_testimonials (testimonial_id, client_name, deleted_at) VALUES ($1, $2, NOW())',
        [id || null, clientName || null]
      );
    } else if (rawDb) {
      rawDb.run("INSERT OR REPLACE INTO deleted_testimonials (testimonial_id, client_name, deleted_at) VALUES (?, ?, datetime('now'))", [id || null, clientName || null]);
      persistDb();
    }
    syncTombstones();
  } catch (err) {
    logger.warn('Failed to record deleted testimonial tombstone:', err);
  }
}

/**
 * Record a deleted project tombstone in persistent database.
 */
export async function recordDeletedProject(id, slug = null, title = null) {
  try {
    if (isPostgres && pgPool) {
      await pgPool.query(
        'INSERT INTO deleted_projects (project_id, slug, title, deleted_at) VALUES ($1, $2, $3, NOW())',
        [id || null, slug || null, title || null]
      );
    } else if (rawDb) {
      rawDb.run("INSERT OR REPLACE INTO deleted_projects (project_id, slug, title, deleted_at) VALUES (?, ?, ?, datetime('now'))", [id || null, slug || null, title || null]);
      persistDb();
    }
    syncTombstones();
  } catch (err) {
    logger.warn('Failed to record deleted project tombstone:', err);
  }
}

/**
 * Persists the current deleted_clients list to JSON file (for local/testing fallback).
 */
export function syncDeletedClientsFile() {
  syncTombstones();
}

/**
 * Synchronizes tombstone records to durable JSON files (for local/testing fallback).
 */
export async function syncTombstones() {
  try {
    const clientsPaths = [
      path.resolve(currentDir, 'deleted_clients.json'),
      path.resolve(process.cwd(), 'server/db/deleted_clients.json'),
    ];
    const tombstonesPaths = [
      path.resolve(currentDir, 'tombstones.json'),
      path.resolve(process.cwd(), 'server/db/tombstones.json'),
    ];

    let clientList = [];
    let testList = [];
    let projList = [];

    if (isPostgres && pgPool) {
      const cRes = await pgPool.query('SELECT client_name FROM deleted_clients ORDER BY client_name ASC');
      clientList = cRes.rows.map((r) => r.client_name).filter(Boolean);

      const tRes = await pgPool.query('SELECT testimonial_id, client_name FROM deleted_testimonials');
      testList = tRes.rows.map((r) => ({ id: r.testimonial_id, client_name: r.client_name }));

      const pRes = await pgPool.query('SELECT project_id, slug, title FROM deleted_projects');
      projList = pRes.rows.map((r) => ({ id: r.project_id, slug: r.slug, title: r.title }));
    } else if (rawDb) {
      const clientStmt = rawDb.prepare('SELECT client_name FROM deleted_clients ORDER BY client_name ASC');
      try {
        while (clientStmt.step()) {
          const obj = clientStmt.getAsObject();
          if (obj.client_name) clientList.push(obj.client_name);
        }
      } finally {
        clientStmt.free();
      }

      const testStmt = rawDb.prepare('SELECT testimonial_id, client_name FROM deleted_testimonials');
      try {
        while (testStmt.step()) {
          const obj = testStmt.getAsObject();
          testList.push({ id: obj.testimonial_id, client_name: obj.client_name });
        }
      } finally {
        testStmt.free();
      }

      const projStmt = rawDb.prepare('SELECT project_id, slug, title FROM deleted_projects');
      try {
        while (projStmt.step()) {
          const obj = projStmt.getAsObject();
          projList.push({ id: obj.project_id, slug: obj.slug, title: obj.title });
        }
      } finally {
        projStmt.free();
      }
    }

    const clientContent = JSON.stringify(clientList, null, 2);
    for (const p of clientsPaths) {
      try {
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(p, clientContent, 'utf8');
      } catch (_) {}
    }

    const tombstonePayload = {
      clients: clientList,
      testimonials: testList,
      projects: projList,
      updated_at: new Date().toISOString(),
    };
    const tombstoneContent = JSON.stringify(tombstonePayload, null, 2);
    for (const p of tombstonesPaths) {
      try {
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(p, tombstoneContent, 'utf8');
      } catch (_) {}
    }
  } catch (err) {
    logger.warn('Failed to sync tombstones:', err);
  }
}

export default db;
