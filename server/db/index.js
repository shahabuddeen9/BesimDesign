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
import bcrypt from 'bcryptjs';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';

const { Pool } = pg;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '../..');

// State flags (dynamically evaluates process.env as well for isolated testing)
export let isPostgres = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL || env.DATABASE_URL || env.POSTGRES_URL);

export function getIsPostgres() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL || env.DATABASE_URL || env.POSTGRES_URL);
}

// Permanent decommissioned brand list per Section 3 requirements
export const DECOMMISSIONED_CLIENTS = [
  'HDFC Bank',
  "Dave & Buster's",
  'Dave & Buster’s',
  'Royal China',
  'SAZ American Brasserie',
  'RSVP',
  'Parinee Group',
  'The Silver Train',
  "Ping's Orient",
  'Ping’s Orient',
  'SEA-Yah',
  'LAPOZ',
  'HOM',
  'IGI',
  'CDC',
  'Nikita',
  'Otoki',
];

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
  } else if (/INSERT\s+OR\s+REPLACE\s+INTO\s+deleted_projects/i.test(out)) {
    out = out.replace(/INSERT\s+OR\s+REPLACE\s+INTO\s+deleted_projects/i, 'INSERT INTO deleted_projects');
    if (!out.includes('ON CONFLICT')) {
      out = `${out.trim().replace(/;$/, '')} ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET deleted_at = NOW()`;
    }
  } else if (/INSERT\s+OR\s+IGNORE\s+INTO\s+deleted_projects/i.test(out)) {
    out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO\s+deleted_projects/i, 'INSERT INTO deleted_projects');
    if (!out.includes('ON CONFLICT')) {
      out = `${out.trim().replace(/;$/, '')} ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING`;
    }
  } else if (/INSERT\s+OR\s+(REPLACE|IGNORE)\s+INTO\s+deleted_testimonials/i.test(out)) {
    out = out.replace(/INSERT\s+OR\s+(REPLACE|IGNORE)\s+INTO\s+deleted_testimonials/i, 'INSERT INTO deleted_testimonials');
    if (!out.includes('ON CONFLICT')) {
      out = `${out.trim().replace(/;$/, '')} ON CONFLICT DO NOTHING`;
    }
  } else if (/INSERT\s+OR\s+IGNORE\s+INTO\s+admins/i.test(out)) {
    out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO\s+admins/i, 'INSERT INTO admins');
    if (!out.includes('ON CONFLICT')) {
      out = `${out.trim().replace(/;$/, '')} ON CONFLICT (email) DO NOTHING`;
    }
  } else if (/INSERT\s+OR\s+REPLACE\s+INTO\s+uploaded_assets/i.test(out)) {
    out = out.replace(/INSERT\s+OR\s+REPLACE\s+INTO\s+uploaded_assets/i, 'INSERT INTO uploaded_assets');
    if (!out.includes('ON CONFLICT')) {
      out = `${out.trim().replace(/;$/, '')} ON CONFLICT (filename) DO UPDATE SET mimetype = EXCLUDED.mimetype, data = EXCLUDED.data, created_at = NOW()`;
    }
  }

  // If query is an INSERT and does not have RETURNING clause, add RETURNING *
  if (/^\s*INSERT\s+INTO/i.test(out) && !/RETURNING/i.test(out)) {
    out = `${out.trim().replace(/;$/, '')} RETURNING *`;
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
        title VARCHAR(255) DEFAULT NULL,
        slug VARCHAR(255) DEFAULT NULL,
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
      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug_unique ON projects(slug) WHERE slug IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
      CREATE INDEX IF NOT EXISTS idx_projects_published ON projects(is_published, sort_order);
      CREATE TABLE IF NOT EXISTS deleted_projects (
        id SERIAL PRIMARY KEY,
        project_id INTEGER,
        slug VARCHAR(255),
        title VARCHAR(255),
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_deleted_projects_slug_unique
        ON deleted_projects (slug)
        WHERE slug IS NOT NULL;
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
      CREATE TABLE IF NOT EXISTS uploaded_assets (
        filename VARCHAR(255) PRIMARY KEY,
        mimetype VARCHAR(100) NOT NULL,
        data TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    logger.info('PostgreSQL schema initialized from fallback definitions.');
  }

  // 0. Ensure deleted_projects and deleted_testimonials unique identity indexes exist (matches schema.postgres.sql)
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_deleted_projects_slug_unique
        ON deleted_projects (slug)
        WHERE slug IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_deleted_testimonials_identity
        ON deleted_testimonials (COALESCE(testimonial_id, -1), COALESCE(client_name, ''))
        WHERE testimonial_id IS NOT NULL OR client_name IS NOT NULL;
    `);
  } catch (_) {}

  // 0.1 Ensure projects table title and slug are optional and nullable in PostgreSQL
  try {
    await pool.query(`
      ALTER TABLE projects ALTER COLUMN title DROP NOT NULL;
      ALTER TABLE projects ALTER COLUMN slug DROP NOT NULL;
      ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_slug_key;
      UPDATE projects SET slug = NULL WHERE slug = '' OR TRIM(slug) = '';
      UPDATE projects SET title = NULL WHERE title = '' OR TRIM(title) = '';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug_unique ON projects (slug) WHERE slug IS NOT NULL;
    `);
  } catch (_) {}

  // 1. Ensure decommissioned clients have permanent tombstones in PostgreSQL
  for (const name of DECOMMISSIONED_CLIENTS) {
    try {
      await pool.query(
        'INSERT INTO deleted_clients (client_name, deleted_at) VALUES ($1, NOW()) ON CONFLICT (client_name) DO NOTHING',
        [name]
      );
    } catch (_) {}
  }

  // 1.5 Ensure authorized administrator accounts exist in PostgreSQL
  try {
    const adminEmails = [
      env.ADMIN_EMAIL,
      'besimdesigne@gmail.com',
      'admin@besimdesign.com',
      'mdshahabuddeen9@gmail.com',
      'mdshahabuddeen48@gmail.com',
    ].filter(Boolean);
    const defaultPassword = env.ADMIN_PASSWORD || 'AdminPass123!';
    const defaultHash = await bcrypt.hash(defaultPassword, 10);
    for (const email of adminEmails) {
      await pool.query(
        'INSERT INTO admins (email, password_hash, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (email) DO NOTHING',
        [email, defaultHash]
      );
    }
  } catch (adminErr) {
    logger.warn('Could not pre-seed admin accounts in PostgreSQL schema check:', adminErr.message);
  }

  // 2. Ensure initial tombstones are respected in PostgreSQL
  await pool.query(`
    DELETE FROM clients WHERE name IN (SELECT client_name FROM deleted_clients);
    DELETE FROM testimonials WHERE id IN (SELECT testimonial_id FROM deleted_testimonials WHERE testimonial_id IS NOT NULL)
      OR client_name IN (SELECT client_name FROM deleted_testimonials WHERE client_name IS NOT NULL);
    DELETE FROM projects WHERE id IN (SELECT project_id FROM deleted_projects WHERE project_id IS NOT NULL)
      OR (slug IS NOT NULL AND slug IN (SELECT slug FROM deleted_projects WHERE slug IS NOT NULL));
  `);

  // 3. Synchronize PostgreSQL SERIAL sequences with current MAX(id)
  const seqTables = ['clients', 'projects', 'testimonials', 'admins', 'enquiries', 'downloads'];
  for (const tbl of seqTables) {
    try {
      await pool.query(`SELECT setval(pg_get_serial_sequence('${tbl}', 'id'), COALESCE((SELECT MAX(id) FROM ${tbl}), 1), true)`);
    } catch (_) {}
  }
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
 * Strictly enforces that production mode NEVER initializes SQLite and fails safely with HTTP 503.
 */
export async function initDb() {
  const isProd = Boolean(
    process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production'
  );
  const connStr = process.env.DATABASE_URL || process.env.POSTGRES_URL || env.DATABASE_URL || env.POSTGRES_URL;
  isPostgres = Boolean(connStr);

  if (isPostgres && pgPool) return pgPool;
  if (!isPostgres && !isProd && rawDb) return rawDb;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // 1. PRODUCTION MODE: Strict PostgreSQL exclusivity
      if (isProd) {
        if (!connStr) {
          const err = new AppError(
            'Production requires a PostgreSQL database connection (DATABASE_URL is missing). SQLite fallback is disabled in production.',
            503
          );
          logger.error('CRITICAL PRODUCTION DATABASE ERROR: DATABASE_URL is missing in production environment.', err);
          throw err;
        }

        logger.info('Connecting to production PostgreSQL database...');
        const isLocal = connStr.includes('localhost') || connStr.includes('127.0.0.1');

        try {
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

          const testRes = await pgPool.query('SELECT NOW() as now');
          logger.info(`✅ PostgreSQL connection established successfully. Server time: ${testRes.rows[0].now}`);

          await initPostgresSchema(pgPool);
          return pgPool;
        } catch (connErr) {
          if (pgPool) {
            try { await pgPool.end(); } catch (_) {}
            pgPool = null;
          }
          const err = new AppError(`Production PostgreSQL database unavailable: ${connErr.message}`, 503);
          logger.error('CRITICAL PRODUCTION POSTGRESQL CONNECTION ERROR:', err);
          throw err;
        }
      }

      // 2. NON-PRODUCTION (development / test) with PostgreSQL configured
      if (connStr) {
        logger.info('Connecting to PostgreSQL database in development/test mode...');
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

        const testRes = await pgPool.query('SELECT NOW() as now');
        logger.info(`✅ PostgreSQL connection established successfully. Server time: ${testRes.rows[0].now}`);

        await initPostgresSchema(pgPool);
        return pgPool;
      }

      // 3. Local / Testing WebAssembly SQLite Initialization (sql.js)
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
          CREATE TABLE IF NOT EXISTS uploaded_assets (
            filename TEXT PRIMARY KEY,
            mimetype TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `);

        // Ensure decommissioned clients have tombstones in SQLite
        for (const name of DECOMMISSIONED_CLIENTS) {
          rawDb.run("INSERT OR IGNORE INTO deleted_clients (client_name, deleted_at) VALUES (?, datetime('now'))", [name]);
        }

        // Ensure projects table in SQLite allows NULL title and NULL slug
        try {
          const tableInfo = rawDb.exec('PRAGMA table_info(projects);');
          if (tableInfo && tableInfo[0] && tableInfo[0].values) {
            const cols = tableInfo[0].values;
            const titleCol = cols.find((c) => c[1] === 'title');
            const slugCol = cols.find((c) => c[1] === 'slug');
            if ((titleCol && titleCol[3] === 1) || (slugCol && slugCol[3] === 1)) {
              logger.info('Migrating SQLite projects table to allow optional title and slug...');
              rawDb.run(`
                CREATE TABLE IF NOT EXISTS projects_v2 (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  title TEXT DEFAULT '',
                  slug TEXT DEFAULT NULL,
                  category TEXT NOT NULL,
                  client_name TEXT DEFAULT '',
                  location TEXT DEFAULT '',
                  area_sqft INTEGER DEFAULT 0,
                  description TEXT NOT NULL,
                  scope TEXT NOT NULL DEFAULT '[]',
                  image_url TEXT NOT NULL,
                  gallery TEXT NOT NULL DEFAULT '[]',
                  is_featured INTEGER NOT NULL DEFAULT 0,
                  sort_order INTEGER NOT NULL DEFAULT 0,
                  is_published INTEGER NOT NULL DEFAULT 1,
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                INSERT INTO projects_v2 (id, title, slug, category, client_name, location, area_sqft, description, scope, image_url, gallery, is_featured, sort_order, is_published, created_at, updated_at)
                  SELECT id, title, slug, category, client_name, location, area_sqft, description, scope, image_url, gallery, is_featured, sort_order, is_published, created_at, updated_at FROM projects;
                DROP TABLE projects;
                ALTER TABLE projects_v2 RENAME TO projects;
                CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug_unique ON projects (slug) WHERE slug IS NOT NULL;
                CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
                CREATE INDEX IF NOT EXISTS idx_projects_published ON projects(is_published, sort_order);
              `);
              persistDb();
              logger.info('SQLite projects table migration completed successfully.');
            }
          }
        } catch (migErr) {
          logger.warn('SQLite projects migration check skipped or completed:', migErr?.message);
        }

        rawDb.run('DELETE FROM clients WHERE name IN (SELECT client_name FROM deleted_clients);');
        rawDb.run('DELETE FROM testimonials WHERE id IN (SELECT testimonial_id FROM deleted_testimonials WHERE testimonial_id IS NOT NULL) OR client_name IN (SELECT client_name FROM deleted_testimonials WHERE client_name IS NOT NULL);');
        rawDb.run('DELETE FROM projects WHERE id IN (SELECT project_id FROM deleted_projects WHERE project_id IS NOT NULL) OR (slug IS NOT NULL AND slug IN (SELECT slug FROM deleted_projects WHERE slug IS NOT NULL));');
        try {
          rawDb.run("UPDATE projects SET slug = NULL WHERE slug = '' OR TRIM(slug) = '';");
          rawDb.run("UPDATE projects SET title = NULL WHERE title = '' OR TRIM(title) = '';");
        } catch (_) {}
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
   * Initializes or connects to the database.
   */
  init: initDb,
  initialize: initDb,

  /**
   * Prepares a parameterized SQL statement with .all(), .get(), and .run() methods.
   * Works synchronously in SQLite mode (for backwards compatibility) and returns
   * Promise/Thenables in PostgreSQL mode.
   */
  prepare(sql) {
    const isProd = Boolean(process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production');
    const isPg = Boolean(pgPool || isPostgres || process.env.DATABASE_URL || env.DATABASE_URL);

    if (isPg || isProd) {
      if (!pgPool) {
        throw new AppError('Database connection unavailable! Call await initDb() on server start.', 503);
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
      throw new AppError('Database not initialized! Call await initDb() on server start.', 500);
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
    const isProd = Boolean(process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production');
    const isPg = Boolean(pgPool || isPostgres || process.env.DATABASE_URL || env.DATABASE_URL);

    if (isPg || isProd) {
      if (!pgPool) await initDb();
      if (!pgPool) throw new AppError('Database connection unavailable', 503);
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
   * Supports synchronous execution for SQLite / better-sqlite3 compatibility,
   * while seamlessly supporting async functions and PostgreSQL client isolation.
   */
  transaction(fn) {
    const isPg = Boolean(pgPool || isPostgres || process.env.DATABASE_URL || env.DATABASE_URL);
    if (!isPg) {
      return (...args) => {
        if (!rawDb) initDb();
        if (inTransaction) {
          return fn(...args);
        }
        inTransaction = true;
        try {
          rawDb.run('BEGIN TRANSACTION;');
          const result = fn(...args);
          if (result && typeof result.then === 'function') {
            return result.then(
              (val) => {
                rawDb.run('COMMIT;');
                inTransaction = false;
                persistDb();
                return val;
              },
              (err) => {
                try { rawDb.run('ROLLBACK;'); } catch (_) {}
                inTransaction = false;
                throw err;
              }
            );
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
    }
    return (...args) => this.withTransaction((tx) => fn(...args));
  },

  /**
   * Executes an async callback inside an atomic transaction.
   * In PostgreSQL mode:
   * 1. Acquires a dedicated client from pgPool.connect().
   * 2. Executes BEGIN on that client.
   * 3. Executes all queries via tx on the EXACT same client.
   * 4. Commits on success.
   * 5. Rolls back on error.
   * 6. Releases client in finally block.
   */
  async withTransaction(fn) {
    const isProd = Boolean(process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production');
    const isPg = Boolean(pgPool || isPostgres || process.env.DATABASE_URL || env.DATABASE_URL);

    if (isPg || isProd) {
      if (!pgPool) await initDb();
      if (!pgPool) throw new AppError('Database connection unavailable for transaction.', 503);

      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        const txDb = {
          client,
          isPostgres: true,
          query: async (sql, params = []) => {
            const pgSql = transformSqlForPostgres(sql);
            const res = await client.query(pgSql, params.map(normalizePgParam));
            return { rows: res.rows, rowCount: res.rowCount };
          },
          run: async (sql, ...params) => {
            const rawParams = extractParams(params);
            const pgSql = transformSqlForPostgres(sql);
            const res = await client.query(pgSql, rawParams.map(normalizePgParam));
            const row = res.rows && res.rows[0] ? res.rows[0] : null;
            return {
              lastInsertRowid: row ? (row.id ?? null) : null,
              changes: res.rowCount ?? 0,
              row,
            };
          },
          get: async (sql, ...params) => {
            const rawParams = extractParams(params);
            const pgSql = transformSqlForPostgres(sql);
            const res = await client.query(pgSql, rawParams.map(normalizePgParam));
            return res.rows[0] ?? undefined;
          },
          all: async (sql, ...params) => {
            const rawParams = extractParams(params);
            const pgSql = transformSqlForPostgres(sql);
            const res = await client.query(pgSql, rawParams.map(normalizePgParam));
            return res.rows;
          },
          prepare: (sql) => {
            return {
              all: (...args) => txDb.all(sql, ...args),
              get: (...args) => txDb.get(sql, ...args),
              run: (...args) => txDb.run(sql, ...args),
            };
          },
          withTransaction: async (nestedFn) => {
            const savepoint = `sp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            await client.query(`SAVEPOINT ${savepoint}`);
            try {
              const res = await nestedFn(txDb);
              await client.query(`RELEASE SAVEPOINT ${savepoint}`);
              return res;
            } catch (spErr) {
              await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
              throw spErr;
            }
          },
        };

        const result = await fn(txDb);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw err;
      } finally {
        client.release();
      }
    }

    // SQLite mode (sql.js)
    if (!rawDb) await initDb();
    inTransaction = true;
    rawDb.run('BEGIN TRANSACTION;');
    try {
      const txDb = {
        isPostgres: false,
        run: async (sql, ...params) => {
          return db.prepare(sql).run(...params);
        },
        get: async (sql, ...params) => {
          return db.prepare(sql).get(...params);
        },
        all: async (sql, ...params) => {
          return db.prepare(sql).all(...params);
        },
        query: async (sql, params = []) => {
          const rows = db.prepare(sql).all(...params);
          return { rows, rowCount: rows.length };
        },
        prepare: (sql) => {
          return {
            all: (...args) => txDb.all(sql, ...args),
            get: (...args) => txDb.get(sql, ...args),
            run: (...args) => txDb.run(sql, ...args),
          };
        },
        withTransaction: async (nestedFn) => {
          return await nestedFn(txDb);
        },
      };
      const result = await fn(txDb);
      rawDb.run('COMMIT;');
      inTransaction = false;
      persistDb();
      return result;
    } catch (err) {
      try { rawDb.run('ROLLBACK;'); } catch (_) {}
      inTransaction = false;
      throw err;
    }
  },

  /**
   * Executes a raw SQL string (e.g. for migrations or DDL).
   */
  async exec(sql) {
    const isProd = Boolean(process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production');
    const isPg = Boolean(pgPool || isPostgres || process.env.DATABASE_URL || env.DATABASE_URL);

    if (isPg || isProd) {
      if (!pgPool) await initDb();
      if (!pgPool) throw new AppError('Database connection unavailable', 503);
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
    initPromise = null;
  },

  recordDeletedClient,
  recordDeletedTestimonial,
  recordDeletedProject,
};

/**
 * Record a deleted client tombstone in persistent database.
 * Does not swallow errors — fails cleanly to enforce atomic deletion transactions.
 */
export async function recordDeletedClient(name, id = null, tx = null) {
  if (!name) return;
  const trimmed = name.trim();
  const isPg = Boolean(pgPool || isPostgres || (tx && tx.isPostgres));

  if (isPg) {
    if (tx && tx.client) {
      await tx.client.query(
        'INSERT INTO deleted_clients (client_name, client_id, deleted_at) VALUES ($1, $2, NOW()) ON CONFLICT (client_name) DO UPDATE SET deleted_at = NOW(), client_id = EXCLUDED.client_id',
        [trimmed, id]
      );
    } else {
      if (!pgPool) await initDb();
      await pgPool.query(
        'INSERT INTO deleted_clients (client_name, client_id, deleted_at) VALUES ($1, $2, NOW()) ON CONFLICT (client_name) DO UPDATE SET deleted_at = NOW(), client_id = EXCLUDED.client_id',
        [trimmed, id]
      );
    }
  } else if (tx && tx.run) {
    await tx.run(
      "INSERT OR REPLACE INTO deleted_clients (client_name, client_id, deleted_at) VALUES (?, ?, datetime('now'))",
      trimmed,
      id
    );
  } else if (rawDb) {
    rawDb.run(
      "INSERT OR REPLACE INTO deleted_clients (client_name, client_id, deleted_at) VALUES (?, ?, datetime('now'))",
      [trimmed, id]
    );
    if (!inTransaction) persistDb();
  }

  if (!tx) {
    syncTombstones().catch(() => {});
  }
}

/**
 * Record a deleted testimonial tombstone in persistent database.
 * Does not swallow errors — fails cleanly to enforce atomic deletion transactions.
 * Supports both positional parameters (id, clientName, tx) and options object.
 * Strictly adheres to verified schema: (testimonial_id, client_name, deleted_at).
 */
export async function recordDeletedTestimonial(id, clientName = null, tx = null) {
  let tId = id;
  let cName = clientName;
  let transaction = tx;

  if (typeof id === 'object' && id !== null) {
    const opts = id;
    tId = opts.testimonial_id ?? opts.id ?? null;
    cName = opts.client_name ?? opts.author ?? null;
    transaction = opts.tx ?? clientName;
  }

  const isPg = Boolean(pgPool || isPostgres || (transaction && transaction.isPostgres));

  if (isPg) {
    if (transaction && transaction.client) {
      // Check existing to prevent duplicate identities idempotently
      const existing = await transaction.client.query(
        'SELECT id FROM deleted_testimonials WHERE (testimonial_id = $1 AND testimonial_id IS NOT NULL) OR (client_name = $2 AND client_name IS NOT NULL) LIMIT 1',
        [tId || null, cName ? String(cName).trim() : null]
      );
      if (existing.rows && existing.rows.length > 0) {
        return;
      }
      await transaction.client.query(
        'INSERT INTO deleted_testimonials (testimonial_id, client_name, deleted_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING',
        [tId || null, cName ? String(cName).trim() : null]
      );
    } else {
      if (!pgPool) await initDb();
      const existing = await pgPool.query(
        'SELECT id FROM deleted_testimonials WHERE (testimonial_id = $1 AND testimonial_id IS NOT NULL) OR (client_name = $2 AND client_name IS NOT NULL) LIMIT 1',
        [tId || null, cName ? String(cName).trim() : null]
      );
      if (existing.rows && existing.rows.length > 0) {
        return;
      }
      await pgPool.query(
        'INSERT INTO deleted_testimonials (testimonial_id, client_name, deleted_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING',
        [tId || null, cName ? String(cName).trim() : null]
      );
    }
  } else if (transaction && transaction.run) {
    await transaction.run(
      "INSERT OR REPLACE INTO deleted_testimonials (testimonial_id, client_name, deleted_at) VALUES (?, ?, datetime('now'))",
      tId || null,
      cName ? String(cName).trim() : null
    );
  } else if (rawDb) {
    rawDb.run(
      "INSERT OR REPLACE INTO deleted_testimonials (testimonial_id, client_name, deleted_at) VALUES (?, ?, datetime('now'))",
      [tId || null, cName ? String(cName).trim() : null]
    );
    if (!inTransaction) persistDb();
  }

  if (!transaction) {
    syncTombstones().catch(() => {});
  }
}

/**
 * Record a deleted project tombstone in persistent database.
 * Does not swallow errors — fails cleanly to enforce atomic deletion transactions.
 * Strictly adheres to verified schema: (project_id, slug, title, deleted_at).
 */
export async function recordDeletedProject(id, slug = null, title = null, tx = null) {
  let pId = id;
  let pSlug = slug;
  let pTitle = title;
  let transaction = tx;

  if (typeof id === 'object' && id !== null) {
    const opts = id;
    pId = opts.project_id ?? opts.id ?? null;
    pSlug = opts.slug ?? null;
    pTitle = opts.title ?? null;
    transaction = opts.tx ?? slug;
  }

  const isPg = Boolean(pgPool || isPostgres || (transaction && transaction.isPostgres));

  if (isPg) {
    if (transaction && transaction.client) {
      await transaction.client.query(
        'INSERT INTO deleted_projects (project_id, slug, title, deleted_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING',
        [pId || null, pSlug ? String(pSlug).trim() : null, pTitle ? String(pTitle).trim() : null]
      );
    } else {
      if (!pgPool) await initDb();
      await pgPool.query(
        'INSERT INTO deleted_projects (project_id, slug, title, deleted_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING',
        [pId || null, pSlug ? String(pSlug).trim() : null, pTitle ? String(pTitle).trim() : null]
      );
    }
  } else if (transaction && transaction.run) {
    await transaction.run(
      "INSERT OR REPLACE INTO deleted_projects (project_id, slug, title, deleted_at) VALUES (?, ?, ?, datetime('now'))",
      pId || null,
      pSlug ? String(pSlug).trim() : null,
      pTitle ? String(pTitle).trim() : null
    );
  } else if (rawDb) {
    rawDb.run(
      "INSERT OR REPLACE INTO deleted_projects (project_id, slug, title, deleted_at) VALUES (?, ?, ?, datetime('now'))",
      [pId || null, pSlug ? String(pSlug).trim() : null, pTitle ? String(pTitle).trim() : null]
    );
    if (!inTransaction) persistDb();
  }

  if (!transaction) {
    syncTombstones().catch(() => {});
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
      const cRes = await pgPool.query('SELECT DISTINCT client_name FROM deleted_clients WHERE client_name IS NOT NULL ORDER BY client_name ASC');
      clientList = cRes.rows.map((r) => r.client_name).filter(Boolean);

      const tRes = await pgPool.query('SELECT DISTINCT testimonial_id, client_name FROM deleted_testimonials WHERE testimonial_id IS NOT NULL OR client_name IS NOT NULL');
      testList = tRes.rows.map((r) => ({ id: r.testimonial_id, client_name: r.client_name }));

      const pRes = await pgPool.query('SELECT DISTINCT project_id, slug, title FROM deleted_projects WHERE project_id IS NOT NULL OR slug IS NOT NULL');
      projList = pRes.rows.map((r) => ({ id: r.project_id, slug: r.slug, title: r.title }));
    } else if (rawDb) {
      const clientStmt = rawDb.prepare('SELECT DISTINCT client_name FROM deleted_clients WHERE client_name IS NOT NULL ORDER BY client_name ASC');
      try {
        while (clientStmt.step()) {
          const obj = clientStmt.getAsObject();
          if (obj.client_name) clientList.push(obj.client_name);
        }
      } finally {
        clientStmt.free();
      }

      const testStmt = rawDb.prepare('SELECT DISTINCT testimonial_id, client_name FROM deleted_testimonials WHERE testimonial_id IS NOT NULL OR client_name IS NOT NULL');
      try {
        while (testStmt.step()) {
          const obj = testStmt.getAsObject();
          testList.push({ id: obj.testimonial_id, client_name: obj.client_name });
        }
      } finally {
        testStmt.free();
      }

      const projStmt = rawDb.prepare('SELECT DISTINCT project_id, slug, title FROM deleted_projects WHERE project_id IS NOT NULL OR slug IS NOT NULL');
      try {
        while (projStmt.step()) {
          const obj = projStmt.getAsObject();
          projList.push({ id: obj.project_id, slug: obj.slug, title: obj.title });
        }
      } finally {
        projStmt.free();
      }
    }

    // Ensure strict uniqueness in memory
    const seenClients = new Set();
    clientList = clientList.filter((c) => {
      if (!c || seenClients.has(c)) return false;
      seenClients.add(c);
      return true;
    });

    const seenTests = new Set();
    testList = testList.filter((t) => {
      const key = `${t.id ?? ''}|${t.client_name ?? ''}`;
      if (seenTests.has(key)) return false;
      seenTests.add(key);
      return true;
    });

    const seenProjs = new Set();
    projList = projList.filter((p) => {
      const key = `${p.id ?? ''}|${p.slug ?? ''}`;
      if (seenProjs.has(key)) return false;
      seenProjs.add(key);
      return true;
    });

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
