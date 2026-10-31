/**
 * @file /server/controllers/client.controller.js
 * @description Controller for brand clients and partners.
 * Public read endpoints and authenticated administrative CRUD.
 * Supports both PostgreSQL and SQLite persistence.
 */

import { z } from 'zod';
import { db, recordDeletedClient, syncDeletedClientsFile } from '../db/index.js';
import AppError from '../utils/AppError.js';
import { stripHtml } from '../utils/sanitize.js';

// Client Zod validation schema
export const clientSchema = z.object({
  name: z.string().min(2, 'Client name must be at least 2 characters').max(100),
  category: z.string().max(100).default(''),
  logo_url: z.string().default(''),
  website_url: z.string().default(''),
  description: z.string().default(''),
  is_featured: z.coerce.number().min(0).max(1).default(1),
  sort_order: z.coerce.number().default(0),
});

/**
 * Public: Get published/featured clients
 */
export async function getPublishedClients(req, res, next) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
    });

    const clients = await db.all(`
      SELECT id, name, category, logo_url, website_url, description, is_featured, sort_order, created_at
      FROM clients
      WHERE is_featured = 1
        AND name NOT IN (SELECT client_name FROM deleted_clients WHERE client_name IS NOT NULL)
      ORDER BY sort_order ASC, name ASC
    `);

    return res.status(200).json({
      success: true,
      data: clients || [],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Get all clients
 */
export async function getAllClients(req, res, next) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
    });

    const clients = await db.all(`
      SELECT id, name, category, logo_url, website_url, description, is_featured, sort_order, created_at, updated_at
      FROM clients
      WHERE name NOT IN (SELECT client_name FROM deleted_clients WHERE client_name IS NOT NULL)
      ORDER BY sort_order ASC, created_at DESC
    `);

    return res.status(200).json({
      success: true,
      data: clients || [],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Create client
 */
export async function createClient(req, res, next) {
  try {
    const validated = clientSchema.parse(req.body);
    const sanitizedName = stripHtml(validated.name);
    const sanitizedCat = stripHtml(validated.category);
    const sanitizedDesc = stripHtml(validated.description);

    let newId;
    await db.withTransaction(async (tx) => {
      // If re-adding a previously deleted client, remove from tombstone table
      await tx.run('DELETE FROM deleted_clients WHERE LOWER(client_name) = LOWER(?)', sanitizedName);

      const result = await tx.run(
        `INSERT INTO clients (name, category, logo_url, website_url, description, is_featured, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        sanitizedName,
        sanitizedCat,
        validated.logo_url || '',
        validated.website_url || '',
        sanitizedDesc,
        validated.is_featured,
        validated.sort_order
      );
      newId = result.lastInsertRowid || result.row?.id;
    });

    db.persist();
    syncDeletedClientsFile();

    const created = await db.get('SELECT * FROM clients WHERE id = ?', newId);

    return res.status(201).json({
      success: true,
      message: 'Client added successfully',
      data: created || { id: newId, ...validated, name: sanitizedName },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Update client
 */
export async function updateClient(req, res, next) {
  try {
    const rawId = req.params.id;
    const numId = parseInt(rawId, 10) || 0;

    const existing = await db.get('SELECT * FROM clients WHERE id = ? OR id = ?', rawId, numId);
    if (!existing) throw new AppError('Client not found', 404);

    const partialSchema = clientSchema.partial();
    const validated = partialSchema.parse(req.body);

    const name = validated.name !== undefined ? stripHtml(validated.name) : existing.name;
    const category = validated.category !== undefined ? stripHtml(validated.category) : existing.category;
    const logo_url = validated.logo_url !== undefined ? validated.logo_url : existing.logo_url;
    const website_url = validated.website_url !== undefined ? validated.website_url : existing.website_url;
    const description = validated.description !== undefined ? stripHtml(validated.description) : existing.description;
    const is_featured = validated.is_featured !== undefined ? validated.is_featured : existing.is_featured;
    const sort_order = validated.sort_order !== undefined ? validated.sort_order : existing.sort_order;

    await db.run(
      `UPDATE clients
       SET name = ?, category = ?, logo_url = ?, website_url = ?, description = ?, is_featured = ?, sort_order = ?, updated_at = datetime('now')
       WHERE id = ?`,
      name,
      category,
      logo_url,
      website_url,
      description,
      is_featured,
      sort_order,
      existing.id
    );

    const updated = await db.get('SELECT * FROM clients WHERE id = ?', existing.id);

    return res.status(200).json({
      success: true,
      message: 'Client updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Delete client
 */
export async function deleteClient(req, res, next) {
  try {
    const rawId = req.params.id;
    const numId = parseInt(rawId, 10) || 0;

    const existing = await db.get('SELECT id, name FROM clients WHERE id = ? OR id = ?', rawId, numId);
    if (!existing) throw new AppError('Client not found', 404);

    // Atomically record tombstone and delete client inside a single transaction
    await db.withTransaction(async (tx) => {
      // 1. Permanently record in tombstone table so seed or DB recreation never resurrects it
      await recordDeletedClient(existing.name, existing.id, tx);

      // 2. Permanently delete from clients table
      await tx.run('DELETE FROM clients WHERE id = ?', existing.id);
    });

    // 3. Flush/sync tombstones
    db.persist();
    syncDeletedClientsFile();

    return res.status(200).json({
      success: true,
      message: `Client "${existing.name}" permanently deleted.`,
      deletedId: existing.id,
      deletedName: existing.name,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getPublishedClients,
  getAllClients,
  createClient,
  updateClient,
  deleteClient,
};
