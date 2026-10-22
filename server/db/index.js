/**
 * @file /server/db/index.js
 * @description SQLite database connection and query layer.
 * Uses WebAssembly SQLite (sql.js) for 100% zero-native-build-dependency file persistence.
 * Exposes a clean, parameterized query interface identical to better-sqlite3
 * with all SQL operations localized so it can easily swap to PostgreSQL.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

let rawDb = null;
let SQL = null;
let initPromise = null;
let inTransaction = false;

/**
 * Persists in-memory SQLite state to the physical file on disk using atomic writes.
 * Skips export if a transaction is currently in flight to avoid aborting the transaction.
 */
function persistDb() {
  if (!rawDb || inTransaction) return;
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
 * Initializes SQLite database connection, loads disk file if present,
 * and runs schema migrations. Safe against concurrent invocations.
 */
export async function initDb() {
  if (rawDb) return rawDb;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      SQL = await initSqlJs({
        locateFile: (file) => {
          const candidates = [
            path.resolve(process.cwd(), 'node_modules/sql.js/dist', file),
            path.resolve(currentDir, '../../node_modules/sql.js/dist', file),
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
            logger.info(`Copied packaged SQLite database from ${sourceDb} to ${env.DB_PATH}`);
          } catch (copyErr) {
            logger.warn('Could not copy packaged database file, will load in-memory:', copyErr);
          }
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

      // Run schema migrations from potential paths
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
        logger.info('Database schema verified and synced successfully.');
      }

      return rawDb;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Formats parameters for sql.js prepared statements.
 * Correctly distinguishes between named parameter objects, arrays, and primitives (including null/0/false).
 * @param {any} params 
 */
function normalizeParams(params) {
  if (params === null || params === undefined) return [];
  if (Array.isArray(params)) return params;
  if (typeof params === 'object' && !(params instanceof Uint8Array) && !(params instanceof Buffer)) {
    const obj = {};
    for (const [k, v] of Object.entries(params)) {
      obj[k.startsWith(':') || k.startsWith('@') || k.startsWith('$') ? k : `:${k}`] = v;
    }
    return obj;
  }
  return [params];
}

/**
 * Extracts bindable parameters from method arguments.
 * Handles:
 * - .run([a, b, c]) -> positional array
 * - .run({ a: 1 })   -> named object
 * - .run(a, b, c)    -> positional args
 * - .run(null)       -> single null param [null]
 */
function extractParams(args) {
  if (args.length === 0) return [];
  if (args.length === 1) {
    const first = args[0];
    if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
      return normalizeParams(first);
    }
    if (Array.isArray(first)) {
      return first;
    }
    return [first];
  }
  return args;
}

/**
 * better-sqlite3 compatible database abstraction layer.
 */
export const db = {
  /**
   * Prepares a parameterized SQL statement with .all(), .get(), and .run() methods.
   * @param {string} sql 
   */
  prepare(sql) {
    if (!rawDb) {
      throw new Error('Database not initialized! Call await initDb() on server start.');
    }

    return {
      all(...args) {
        const params = extractParams(args);
        const stmt = rawDb.prepare(sql);
        try {
          if (Array.isArray(params) ? params.length > 0 : Object.keys(params).length > 0) {
            stmt.bind(params);
          }
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
          if (Array.isArray(params) ? params.length > 0 : Object.keys(params).length > 0) {
            stmt.bind(params);
          }
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
        
        // Retrieve last_insert_rowid and changes
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
   * Wraps a callback function in a single SQLite transaction and persists on commit.
   * @param {Function} fn 
   */
  transaction(fn) {
    return (...args) => {
      if (!rawDb) throw new Error('Database not initialized!');
      inTransaction = true;
      rawDb.run('BEGIN TRANSACTION;');
      try {
        const result = fn(...args);
        rawDb.run('COMMIT;');
        inTransaction = false;
        persistDb();
        return result;
      } catch (err) {
        try {
          rawDb.run('ROLLBACK;');
        } catch (_) {}
        inTransaction = false;
        throw err;
      }
    };
  },

  /**
   * Executes a raw SQL string (e.g. for migrations or DDL).
   * @param {string} sql 
   */
  exec(sql) {
    if (!rawDb) throw new Error('Database not initialized!');
    rawDb.run(sql);
    persistDb();
  },

  /**
   * Explicitly flush state to disk.
   */
  persist() {
    persistDb();
  },

  /**
   * Closes database and saves final copy.
   */
  close() {
    if (rawDb) {
      persistDb();
      rawDb.close();
      rawDb = null;
    }
  }
};

export default db;
