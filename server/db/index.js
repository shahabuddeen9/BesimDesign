/**
 * @file /server/db/index.js
 * @description SQLite database connection and query layer.
 * Uses WebAssembly SQLite (sql.js) for 100% zero-native-build-dependency file persistence.
 * Exposes a clean, parameterized query interface identical to better-sqlite3
 * with all SQL operations localized so it can easily swap to PostgreSQL.
 */

import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

let rawDb = null;
let SQL = null;

/**
 * Persists in-memory SQLite state to the physical file on disk.
 */
function persistDb() {
  if (!rawDb) return;
  try {
    const data = rawDb.export();
    const buffer = Buffer.from(data);
    const dir = path.dirname(env.DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(env.DB_PATH, buffer);
  } catch (err) {
    logger.error('Failed to persist database to disk:', err);
  }
}

/**
 * Initializes SQLite database connection, loads disk file if present,
 * and runs schema migrations.
 */
export async function initDb() {
  if (rawDb) return rawDb;

  SQL = await initSqlJs();

  if (fs.existsSync(env.DB_PATH)) {
    const fileBuffer = fs.readFileSync(env.DB_PATH);
    rawDb = new SQL.Database(fileBuffer);
    logger.info(`Loaded existing SQLite database from ${env.DB_PATH}`);
  } else {
    rawDb = new SQL.Database();
    logger.info(`Initialized fresh in-memory SQLite database for ${env.DB_PATH}`);
  }

  // Run schema migrations
  const schemaPath = path.resolve(path.dirname(env.DB_PATH), 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    rawDb.run(schemaSql);
    persistDb();
    logger.info('Database schema verified and synced successfully.');
  }

  return rawDb;
}

/**
 * Formats parameters for sql.js prepared statements.
 * @param {Array|Object} params 
 */
function normalizeParams(params) {
  if (!params) return [];
  if (Array.isArray(params)) return params;
  if (typeof params === 'object') {
    const obj = {};
    for (const [k, v] of Object.entries(params)) {
      obj[k.startsWith(':') || k.startsWith('@') || k.startsWith('$') ? k : `:${k}`] = v;
    }
    return obj;
  }
  return [params];
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
        const params = args.length === 1 && (Array.isArray(args[0]) || typeof args[0] === 'object')
          ? normalizeParams(args[0])
          : args;

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
        const params = args.length === 1 && (Array.isArray(args[0]) || typeof args[0] === 'object')
          ? normalizeParams(args[0])
          : args;

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
        const params = args.length === 1 && (Array.isArray(args[0]) || typeof args[0] === 'object')
          ? normalizeParams(args[0])
          : args;

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
