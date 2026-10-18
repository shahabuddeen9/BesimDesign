/**
 * @file /server/controllers/client.controller.js
 * @description Controller for brand clients and partners.
 * Public read endpoints and authenticated administrative CRUD.
 */

import { z } from 'zod';
import { db } from '../db/index.js';
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
export function getPublishedClients(req, res, next) {
  try {
    const clients = db.prepare(`
      SELECT id, name, category, logo_url, website_url, description, is_featured, sort_order, created_at
      FROM clients
      ORDER BY sort_order ASC, name ASC
    `).all();

    return res.status(200).json({
      success: true,
      data: clients,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Get all clients
 */
export function getAllClients(req, res, next) {
  try {
    const clients = db.prepare(`
      SELECT id, name, category, logo_url, website_url, description, is_featured, sort_order, created_at, updated_at
      FROM clients
      ORDER BY sort_order ASC, created_at DESC
    `).all();

    return res.status(200).json({
      success: true,
      data: clients,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Create client
 */
export function createClient(req, res, next) {
  try {
    const validated = clientSchema.parse(req.body);
    const sanitizedName = stripHtml(validated.name);
    const sanitizedCat = stripHtml(validated.category);
    const sanitizedDesc = stripHtml(validated.description);

    const result = db.prepare(`
      INSERT INTO clients (name, category, logo_url, website_url, description, is_featured, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      sanitizedName,
      sanitizedCat,
      validated.logo_url || '',
      validated.website_url || '',
      sanitizedDesc,
      validated.is_featured,
      validated.sort_order
    );

    const created = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);

    return res.status(201).json({
      success: true,
      message: 'Client added successfully',
      data: created,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Update client
 */
export function updateClient(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) throw new AppError('Invalid client ID', 400);

    const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
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

    db.prepare(`
      UPDATE clients
      SET name = ?, category = ?, logo_url = ?, website_url = ?, description = ?, is_featured = ?, sort_order = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, category, logo_url, website_url, description, is_featured, sort_order, id);

    const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);

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
export function deleteClient(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) throw new AppError('Invalid client ID', 400);

    const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(id);
    if (!existing) throw new AppError('Client not found', 404);

    db.prepare('DELETE FROM clients WHERE id = ?').run(id);

    return res.status(200).json({
      success: true,
      message: 'Client deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}
