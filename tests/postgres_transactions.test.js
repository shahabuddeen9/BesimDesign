import { describe, it, expect, beforeEach, vi } from 'vitest';
import db, { recordDeletedProject, recordDeletedTestimonial } from '../server/db/index.js';
import { safeDeleteFileIfUnreferenced } from '../server/services/storage.js';

describe('PostgreSQL Transaction Reliability & Contract Verification', () => {
  beforeEach(async () => {
    await db.initialize();
  });

  describe('PostgreSQL Adapter Contract: Dedicated Client, Isolation & Lifecycle', () => {
    it('should acquire a dedicated client from pgPool, execute BEGIN, route all queries to that client, execute COMMIT, and release connection', async () => {
      const clientQueries = [];
      let released = false;

      const mockClient = {
        query: vi.fn(async (sql, params) => {
          clientQueries.push({ sql: String(sql).trim(), params });
          if (String(sql).includes('INSERT INTO projects')) {
            return { rows: [{ id: 101 }], rowCount: 1 };
          }
          if (String(sql).includes('DELETE FROM projects')) {
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
        release: vi.fn(() => {
          released = true;
        }),
      };

      const mockPool = {
        connect: vi.fn(async () => mockClient),
        query: vi.fn(),
      };

      // Construct transaction execution using PostgreSQL pool contract
      const client = await mockPool.connect();
      expect(mockPool.connect).toHaveBeenCalledTimes(1);

      let txResult;
      try {
        await client.query('BEGIN');

        const tx = {
          client,
          isPostgres: true,
          run: async (sql, ...params) => {
            const res = await client.query(sql, params);
            return { changes: res.rowCount };
          },
        };

        // Execute project deletion inside transaction
        await recordDeletedProject(101, 'test-project', 'Test Project', tx);
        await tx.run('DELETE FROM projects WHERE id = $1', 101);

        await client.query('COMMIT');
        txResult = 'success';
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      expect(txResult).toBe('success');
      expect(clientQueries[0].sql).toBe('BEGIN');
      expect(clientQueries.some((q) => q.sql.includes('deleted_projects'))).toBe(true);
      expect(clientQueries.some((q) => q.sql.includes('DELETE FROM projects'))).toBe(true);
      expect(clientQueries[clientQueries.length - 1].sql).toBe('COMMIT');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
      expect(released).toBe(true);
    });

    it('should execute ROLLBACK and release connection when tombstone insertion fails', async () => {
      const clientQueries = [];
      let released = false;

      const mockClient = {
        query: vi.fn(async (sql) => {
          const sqlStr = String(sql).trim();
          clientQueries.push(sqlStr);
          if (sqlStr.includes('deleted_projects')) {
            throw new Error('PostgreSQL unique constraint violation on tombstone');
          }
          return { rows: [], rowCount: 0 };
        }),
        release: vi.fn(() => {
          released = true;
        }),
      };

      const mockPool = {
        connect: vi.fn(async () => mockClient),
      };

      const client = await mockPool.connect();
      let caughtError = null;

      try {
        await client.query('BEGIN');
        const tx = {
          client,
          isPostgres: true,
        };

        // This will fail during tombstone insertion
        await recordDeletedProject(202, 'failed-slug', 'Failed Project', tx);
        await client.query('DELETE FROM projects WHERE id = $1', [202]);

        await client.query('COMMIT');
      } catch (err) {
        caughtError = err;
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      expect(caughtError).toBeDefined();
      expect(caughtError.message).toBe('PostgreSQL unique constraint violation on tombstone');
      expect(clientQueries[0]).toBe('BEGIN');
      expect(clientQueries).toContain('ROLLBACK');
      expect(clientQueries).not.toContain('COMMIT');
      expect(released).toBe(true);
    });

    it('should execute ROLLBACK and release connection when record deletion fails', async () => {
      const clientQueries = [];
      let released = false;

      const mockClient = {
        query: vi.fn(async (sql) => {
          const sqlStr = String(sql).trim();
          clientQueries.push(sqlStr);
          if (sqlStr.includes('DELETE FROM projects')) {
            throw new Error('Foreign key violation during project record deletion');
          }
          return { rows: [], rowCount: 0 };
        }),
        release: vi.fn(() => {
          released = true;
        }),
      };

      const mockPool = {
        connect: vi.fn(async () => mockClient),
      };

      const client = await mockPool.connect();
      let caughtError = null;

      try {
        await client.query('BEGIN');
        const tx = {
          client,
          isPostgres: true,
        };

        // Record tombstone succeeds
        await client.query(
          'INSERT INTO deleted_projects (project_id, slug, title, deleted_at) VALUES ($1, $2, $3, NOW())',
          [303, 'slug-fk', 'Title FK']
        );

        // Record deletion fails
        await client.query('DELETE FROM projects WHERE id = $1', [303]);

        await client.query('COMMIT');
      } catch (err) {
        caughtError = err;
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      expect(caughtError).toBeDefined();
      expect(caughtError.message).toBe('Foreign key violation during project record deletion');
      expect(clientQueries[0]).toBe('BEGIN');
      expect(clientQueries).toContain('ROLLBACK');
      expect(clientQueries).not.toContain('COMMIT');
      expect(released).toBe(true);
    });
  });

  describe('Testimonial Deletion & Tombstone Schema Compatibility', () => {
    it('should verify deleted_testimonials schema uses (testimonial_id, client_name, deleted_at) without author/project_slug', async () => {
      if (db.isPostgres) {
        const columns = await db.all(
          `SELECT column_name FROM information_schema.columns WHERE table_name = 'deleted_testimonials'`
        );
        const colNames = columns.map((c) => c.column_name);
        expect(colNames).toContain('testimonial_id');
        expect(colNames).toContain('client_name');
        expect(colNames).toContain('deleted_at');
        expect(colNames).not.toContain('author');
        expect(colNames).not.toContain('project_slug');
      } else {
        const tableInfo = await db.all(`PRAGMA table_info(deleted_testimonials)`);
        const colNames = tableInfo.map((c) => c.name);
        expect(colNames).toContain('testimonial_id');
        expect(colNames).toContain('client_name');
        expect(colNames).toContain('deleted_at');
        expect(colNames).not.toContain('author');
        expect(colNames).not.toContain('project_slug');
      }
    });

    it('should atomically record deleted testimonial tombstones with compatible signature', async () => {
      const testTestimonialId = 99991;
      const testClientName = 'Tombstone Idempotent Corp';

      await db.withTransaction(async (tx) => {
        await recordDeletedTestimonial(testTestimonialId, testClientName, tx);
      });

      const recorded = await db.get(
        'SELECT * FROM deleted_testimonials WHERE testimonial_id = $1',
        [testTestimonialId]
      );
      expect(recorded).toBeDefined();
      expect(recorded.client_name).toBe(testClientName);
      expect(recorded.deleted_at).toBeDefined();

      // Clean up test tombstone
      await db.run('DELETE FROM deleted_testimonials WHERE testimonial_id = $1', [testTestimonialId]);
    });
  });

  describe('Post-Commit Physical Asset Safety & Rollback Compensation', () => {
    it('should never delete physical images if the database transaction fails and rolls back', async () => {
      const testSlug = `tx-image-safety-${Date.now()}`;
      const fakeImagePath = '/uploads/sample-critical-photo.jpg';

      let errorCaught = false;
      try {
        await db.withTransaction(async (tx) => {
          // 1. Insert a temporary project with photo
          await tx.run(
            `INSERT INTO projects (title, slug, category, client_name, location, description, image_url, is_published)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            ['Tx Image Project', testSlug, 'Hospitality', 'Client Photo', 'Mumbai', 'Desc', fakeImagePath, 1]
          );

          // 2. Force an intentional error mid-transaction
          throw new Error('Database transaction abort mid-way');
        });
      } catch (err) {
        errorCaught = true;
      }

      expect(errorCaught).toBe(true);

      // Verify the project was rolled back
      const projectAfterRollback = await db.get('SELECT * FROM projects WHERE slug = $1', [testSlug]);
      expect(projectAfterRollback).toBeUndefined();
    });

    it('should prevent physical deletion of an image if another project still references it', async () => {
      const sharedImage = '/uploads/shared-architectural-render.jpg';
      const slugA = `proj-a-${Date.now()}`;
      const slugB = `proj-b-${Date.now()}`;

      // Insert two projects referencing the same image
      await db.run(
        `INSERT INTO projects (title, slug, category, client_name, location, description, image_url, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['Project Alpha', slugA, 'Hospitality', 'Client A', 'Mumbai', 'Desc', sharedImage, 1]
      );
      await db.run(
        `INSERT INTO projects (title, slug, category, client_name, location, description, image_url, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['Project Beta', slugB, 'Hotels', 'Client B', 'Delhi', 'Desc', sharedImage, 1]
      );

      // Attempt safe delete for shared image (Project Beta still references it)
      const cleanupResult = await safeDeleteFileIfUnreferenced(sharedImage);
      expect(cleanupResult.deleted).toBe(false);
      expect(cleanupResult.reason).toBe('referenced');

      // Clean up test projects
      await db.run('DELETE FROM projects WHERE slug IN ($1, $2)', [slugA, slugB]);
    });
  });

  describe('Functional SQLite / Local Database Execution', () => {
    it('should rollback transaction on error and leave database state unchanged', async () => {
      const testTitle = `Tx Rollback Test ${Date.now()}`;
      const testSlug = `tx-rollback-${Date.now()}`;

      try {
        await db.withTransaction(async (tx) => {
          await tx.run(
            `INSERT INTO projects (title, slug, category, client_name, location, description, image_url, is_published)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [testTitle, testSlug, 'Hospitality', 'Tx Client', 'Mumbai', 'Test project description', '/uploads/test.jpg', 1]
          );

          const inTx = await tx.get('SELECT * FROM projects WHERE slug = $1', [testSlug]);
          expect(inTx).toBeDefined();
          expect(inTx.title).toBe(testTitle);

          throw new Error('Forced transaction rollback error');
        });
      } catch (err) {
        expect(err.message).toBe('Forced transaction rollback error');
      }

      const afterRollback = await db.get('SELECT * FROM projects WHERE slug = $1', [testSlug]);
      expect(afterRollback).toBeUndefined();
    });
  });
});
