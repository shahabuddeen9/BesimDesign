/**
 * @file /server/db/migrate-to-postgres.js
 * @description Safe, repeatable, non-destructive migration script from SQLite (fusion.db)
 * to managed PostgreSQL (Supabase / Neon / Cloud SQL).
 *
 * Usage:
 *   DATABASE_URL="postgresql://user:pass@host:5432/dbname" npm run db:migrate
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

async function runMigration() {
  const connStr = env.DATABASE_URL || env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!connStr) {
    console.error('❌ ERROR: DATABASE_URL or POSTGRES_URL environment variable is required to run migration.');
    console.error('Example: DATABASE_URL="postgresql://user:pass@host:5432/postgres?sslmode=require" npm run db:migrate');
    process.exit(1);
  }

  // Require an explicitly selected, verified source DB. Never assume the public repository's
  // packaged fusion.db is the complete or correct production source.
  const sqlitePath = process.env.SQLITE_SOURCE_PATH ? path.resolve(process.env.SQLITE_SOURCE_PATH) : null;
  if (!sqlitePath) {
    console.error('❌ ERROR: SQLITE_SOURCE_PATH is required.');
    console.error('Point it to a verified backup/copy of the intended SQLite source database.');
    process.exit(1);
  }
  if (!fs.existsSync(sqlitePath)) {
    console.error('❌ ERROR: SQLite source file not found at SQLITE_SOURCE_PATH.');
    process.exit(1);
  }
  const sqliteHeader = fs.readFileSync(sqlitePath).subarray(0, 16).toString('binary');
  if (sqliteHeader !== 'SQLite format 3\u0000') {
    console.error('❌ ERROR: SQLITE_SOURCE_PATH is not a valid SQLite database file.');
    process.exit(1);
  }

  console.log('🔄 Initializing migration to PostgreSQL...');
  console.log(`Connecting to: ${connStr.replace(/:([^:@]+)@/, ':****@')}`);

  const isLocal = connStr.includes('localhost') || connStr.includes('127.0.0.1');
  const pool = new Pool({
    connectionString: connStr,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  try {
    // 1. Verify PostgreSQL connection
    const testRes = await pool.query('SELECT NOW() as now');
    console.log(`✅ Connected to PostgreSQL. Server timestamp: ${testRes.rows[0].now}`);

    // 2. Run schema setup
    const schemaPath = path.resolve(currentDir, 'schema.postgres.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schemaSql);
      console.log('✅ PostgreSQL schema verified and applied.');
    }

    // 3. Load source SQLite database
    const SQL = await initSqlJs();
    const fileBuffer = fs.readFileSync(sqlitePath);
    const sqlite = new SQL.Database(fileBuffer);
    console.log(`✅ Loaded source SQLite database (${(fileBuffer.length / 1024).toFixed(1)} KB).`);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Helper to extract rows from SQLite statement
      function getSqliteRows(sql) {
        const stmt = sqlite.prepare(sql);
        const rows = [];
        try {
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
        } finally {
          stmt.free();
        }
        return rows;
      }

      // --- A. System Metadata ---
      const metaRows = getSqliteRows('SELECT * FROM _system_meta');
      for (const r of metaRows) {
        await client.query(
          `INSERT INTO _system_meta (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO NOTHING`,
          [r.key, r.value]
        );
      }
      console.log(`✓ Migrated ${metaRows.length} system meta record(s).`);

      // --- B. Admin Accounts ---
      const adminRows = getSqliteRows('SELECT * FROM admins');
      for (const r of adminRows) {
        await client.query(
          `INSERT INTO admins (id, email, password_hash, created_at, last_login_at)
           VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()), $5::timestamptz)
           ON CONFLICT (email) DO NOTHING`,
          [r.id, r.email, r.password_hash, r.created_at || null, r.last_login_at || null]
        );
      }
      await client.query("SELECT setval('admins_id_seq', COALESCE((SELECT MAX(id) FROM admins), 1))");
      console.log(`✓ Migrated ${adminRows.length} admin account(s).`);

      // --- C. Deleted Clients Tombstones ---
      let deletedClientsCount = 0;
      try {
        const delClientRows = getSqliteRows('SELECT * FROM deleted_clients');
        for (const r of delClientRows) {
          if (r.client_name) {
            await client.query(
              `INSERT INTO deleted_clients (client_name, client_id, deleted_at)
               VALUES ($1, $2, COALESCE($3::timestamptz, NOW()))
               ON CONFLICT (client_name) DO NOTHING`,
              [r.client_name, r.client_id || null, r.deleted_at || null]
            );
            deletedClientsCount++;
          }
        }
      } catch (_) {}
      console.log(`✓ Migrated ${deletedClientsCount} deleted client tombstone(s).`);

      // --- D. Clients ---
      const clientRows = getSqliteRows('SELECT * FROM clients');
      let clientsMigrated = 0;
      for (const r of clientRows) {
        await client.query(
          `INSERT INTO clients (id, name, category, logo_url, website_url, description, is_featured, sort_order, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), COALESCE($10::timestamptz, NOW()))
           ON CONFLICT (id) DO NOTHING`,
          [
            r.id,
            r.name,
            r.category || '',
            r.logo_url || '',
            r.website_url || '',
            r.description || '',
            r.is_featured !== undefined ? Number(r.is_featured) : 1,
            r.sort_order || 0,
            r.created_at || null,
            r.updated_at || null,
          ]
        );
        clientsMigrated++;
      }
      await client.query("SELECT setval('clients_id_seq', COALESCE((SELECT MAX(id) FROM clients), 1))");
      console.log(`✓ Migrated ${clientsMigrated} client record(s).`);

      // --- E. Deleted Testimonials Tombstones ---
      let deletedTestCount = 0;
      try {
        const delTestRows = getSqliteRows('SELECT * FROM deleted_testimonials');
        for (const r of delTestRows) {
          await client.query(
            `INSERT INTO deleted_testimonials (testimonial_id, client_name, deleted_at)
             VALUES ($1, $2, COALESCE($3::timestamptz, NOW()))`,
            [r.testimonial_id || null, r.client_name || null, r.deleted_at || null]
          );
          deletedTestCount++;
        }
      } catch (_) {}
      console.log(`✓ Migrated ${deletedTestCount} deleted testimonial tombstone(s).`);

      // --- F. Testimonials ---
      const testRows = getSqliteRows('SELECT * FROM testimonials');
      let testMigrated = 0;
      for (const r of testRows) {
        await client.query(
          `INSERT INTO testimonials (id, client_name, business_type, rating, review, is_published, sort_order, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()), COALESCE($9::timestamptz, NOW()))
           ON CONFLICT (id) DO NOTHING`,
          [
            r.id,
            r.client_name,
            r.business_type || '',
            r.rating || 5,
            r.review || '',
            r.is_published !== undefined ? Number(r.is_published) : 1,
            r.sort_order || 0,
            r.created_at || null,
            r.updated_at || null,
          ]
        );
        testMigrated++;
      }
      await client.query("SELECT setval('testimonials_id_seq', COALESCE((SELECT MAX(id) FROM testimonials), 1))");
      console.log(`✓ Migrated ${testMigrated} testimonial(s).`);

      // --- G. Deleted Projects Tombstones ---
      let deletedProjCount = 0;
      try {
        const delProjRows = getSqliteRows('SELECT * FROM deleted_projects');
        for (const r of delProjRows) {
          await client.query(
            `INSERT INTO deleted_projects (project_id, slug, title, deleted_at)
             VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))
             ON CONFLICT (slug) DO NOTHING`,
            [r.project_id || null, r.slug || null, r.title || null, r.deleted_at || null]
          );
          deletedProjCount++;
        }
      } catch (_) {}
      console.log(`✓ Migrated ${deletedProjCount} deleted project tombstone(s).`);

      // --- H. Projects ---
      const projRows = getSqliteRows('SELECT * FROM projects');
      let projMigrated = 0;
      for (const r of projRows) {
        let scopeVal = r.scope;
        if (typeof scopeVal === 'string') {
          try { scopeVal = JSON.parse(scopeVal); } catch (_) { scopeVal = [scopeVal]; }
        }
        let galleryVal = r.gallery;
        if (typeof galleryVal === 'string') {
          try { galleryVal = JSON.parse(galleryVal); } catch (_) { galleryVal = [galleryVal]; }
        }

        await client.query(
          `INSERT INTO projects (id, title, slug, category, client_name, location, area_sqft, description, scope, image_url, gallery, is_featured, sort_order, is_published, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15::timestamptz, NOW()), COALESCE($16::timestamptz, NOW()))
           ON CONFLICT (slug) DO NOTHING`,
          [
            r.id,
            r.title,
            r.slug,
            r.category,
            r.client_name || '',
            r.location || '',
            r.area_sqft || 0,
            r.description || '',
            JSON.stringify(scopeVal || []),
            r.image_url,
            JSON.stringify(galleryVal || []),
            r.is_featured !== undefined ? Number(r.is_featured) : 0,
            r.sort_order || 0,
            r.is_published !== undefined ? Number(r.is_published) : 1,
            r.created_at || null,
            r.updated_at || null,
          ]
        );
        projMigrated++;
      }
      await client.query("SELECT setval('projects_id_seq', COALESCE((SELECT MAX(id) FROM projects), 1))");
      console.log(`✓ Migrated ${projMigrated} project(s).`);

      // --- I. Enquiries ---
      const enqRows = getSqliteRows('SELECT * FROM enquiries');
      let enqMigrated = 0;
      for (const r of enqRows) {
        let calcVal = r.calculator_data;
        if (calcVal && typeof calcVal === 'string') {
          try { calcVal = JSON.parse(calcVal); } catch (_) {}
        }
        await client.query(
          `INSERT INTO enquiries (id, name, phone, email, business_type, project_location, area_sqft, message, source, calculator_data, status, admin_notes, consent_given, ip_hash, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15::timestamptz, NOW()), COALESCE($16::timestamptz, NOW()))
           ON CONFLICT (id) DO NOTHING`,
          [
            r.id,
            r.name,
            r.phone,
            r.email,
            r.business_type,
            r.project_location || '',
            r.area_sqft || 0,
            r.message || '',
            r.source || 'contact_form',
            calcVal ? JSON.stringify(calcVal) : null,
            r.status || 'new',
            r.admin_notes || '',
            r.consent_given !== undefined ? Number(r.consent_given) : 1,
            r.ip_hash || '',
            r.created_at || null,
            r.updated_at || null,
          ]
        );
        enqMigrated++;
      }
      await client.query("SELECT setval('enquiries_id_seq', COALESCE((SELECT MAX(id) FROM enquiries), 1))");
      console.log(`✓ Migrated ${enqMigrated} enquiry lead(s).`);

      // Mark initial seed completed in PostgreSQL
      await client.query(`
        INSERT INTO _system_meta (key, value, updated_at)
        VALUES ('initial_seed_completed', 'true', NOW())
        ON CONFLICT (key) DO NOTHING
      `);

      await client.query('COMMIT');
      console.log('\n🎉 SUCCESS: All existing records and tombstones migrated to PostgreSQL!');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
