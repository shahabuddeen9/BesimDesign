/**
 * @file /server/controllers/project.controller.js
 * @description Controller for commercial architecture project portfolio management.
 * Provides public read endpoints and authenticated administrative CRUD operations.
 */

import { z } from 'zod';
import { db } from '../db/index.js';
import AppError from '../utils/AppError.js';
import { stripHtml } from '../utils/sanitize.js';

/**
 * Safely parses JSON strings into arrays, falling back to comma-split or default array.
 */
function safeJsonParse(val, fallback = []) {
  if (Array.isArray(val)) return val;
  if (!val || typeof val !== 'string') return fallback;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_) {
    if (val.includes(',')) {
      return val.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return val.trim() ? [val.trim()] : fallback;
  }
}

// Project Zod Schema
export const projectSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(150),
  slug: z.string().min(1).max(150).regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase letters, numbers, and hyphens').optional(),
  category: z.string().min(2).max(50).default('commercial'),
  client_name: z.string().max(100).default(''),
  location: z.string().max(100).default(''),
  area_sqft: z.coerce.number().default(0),
  description: z.string().min(2, 'Description must be at least 2 characters'),
  scope: z.union([z.array(z.string()), z.string()]).default([]),
  image_url: z.string().default('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80'),
  gallery: z.union([z.array(z.string()), z.string()]).default([]),
  is_featured: z.coerce.number().min(0).max(1).default(0),
  sort_order: z.coerce.number().default(0),
  is_published: z.coerce.number().min(0).max(1).default(1),
});

/**
 * Public: Get published projects, optional ?category=
 */
export function getPublishedProjects(req, res, next) {
  try {
    let { category, exclude } = req.query;

    // Smooth category alias normalization for hyphenated values
    if (category) {
      const catLower = String(category).toLowerCase().trim();
      if (catLower === 'central-kitchen' || catLower === 'centralkitchen') {
        category = 'central_kitchen';
      }
    }

    let sql = `
      SELECT id, title, slug, category, client_name, location, area_sqft, description, scope, image_url, gallery, is_featured, sort_order, created_at
      FROM projects
      WHERE is_published = 1
    `;
    const params = [];

    if (category && category !== 'all') {
      sql += ' AND (LOWER(category) = LOWER(?) OR category LIKE ?)';
      params.push(category, `%${category}%`);
    }

    if (exclude) {
      const exclusions = exclude.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      for (const exc of exclusions) {
        sql += ' AND LOWER(category) != ? AND category NOT LIKE ?';
        params.push(exc, `%${exc}%`);
      }
    }

    sql += ' ORDER BY sort_order ASC, created_at DESC';

    const projects = db.prepare(sql).all(...params).map((p) => ({
      ...p,
      scope: safeJsonParse(p.scope),
      gallery: safeJsonParse(p.gallery),
    }));

    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Public: Get single published project by slug
 */
export function getProjectBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const project = db.prepare(`
      SELECT id, title, slug, category, description, scope, image_url, gallery, is_featured, created_at
      FROM projects
      WHERE slug = ? AND is_published = 1
    `).get(slug);

    if (!project) {
      throw new AppError(`Project with slug "${slug}" not found`, 404);
    }

    project.scope = safeJsonParse(project.scope);
    project.gallery = safeJsonParse(project.gallery);

    return res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Get all projects (including drafts/unpublished)
 */
export function getAllProjects(req, res, next) {
  try {
    const projects = db.prepare(`
      SELECT * FROM projects
      ORDER BY sort_order ASC, created_at DESC
    `).all().map((p) => ({
      ...p,
      scope: safeJsonParse(p.scope),
      gallery: safeJsonParse(p.gallery),
    }));

    return res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Create a new project
 */
export function createProject(req, res, next) {
  try {
    const rawBody = { ...req.body };
    if (!rawBody.slug && rawBody.title) {
      rawBody.slug = rawBody.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || `proj-${Date.now()}`;
    }

    const validated = projectSchema.parse(rawBody);

    // Auto-resolve slug collision by appending timestamp or counter
    let finalSlug = (validated.slug || validated.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-+|-+$/g, '') || `proj-${Date.now()}`;
    let counter = 1;
    const baseSlug = finalSlug;
    while (db.prepare('SELECT id FROM projects WHERE slug = ?').get(finalSlug)) {
      finalSlug = `${baseSlug}-${counter++}`;
    }

    const scopeJson = Array.isArray(validated.scope) ? JSON.stringify(validated.scope) : (validated.scope || '[]');
    const galleryJson = Array.isArray(validated.gallery) ? JSON.stringify(validated.gallery) : (validated.gallery || '[]');

    const result = db.prepare(`
      INSERT INTO projects (
        title, slug, category, client_name, location, area_sqft, description, scope,
        image_url, gallery, is_featured, sort_order, is_published,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        datetime('now'), datetime('now')
      )
    `).run(
      stripHtml(validated.title),
      finalSlug.toLowerCase(),
      validated.category,
      stripHtml(validated.client_name || ''),
      stripHtml(validated.location || ''),
      validated.area_sqft || 0,
      validated.description,
      scopeJson,
      validated.image_url,
      galleryJson,
      validated.is_featured,
      validated.sort_order,
      validated.is_published
    );

    const saved = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
    if (saved) {
      saved.scope = safeJsonParse(saved.scope);
      saved.gallery = safeJsonParse(saved.gallery);
    }

    return res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: saved,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Update existing project
 */
export function updateProject(req, res, next) {
  try {
    const { id } = req.params;
    const numId = parseInt(id, 10) || 0;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ? OR id = ?').get(id, numId);
    if (!existing) {
      throw new AppError(`Project #${id} not found`, 404);
    }

    const validated = projectSchema.partial().parse(req.body);

    const {
      title,
      slug,
      category,
      client_name,
      location,
      area_sqft,
      description,
      scope,
      image_url,
      gallery,
      is_featured,
      sort_order,
      is_published,
    } = validated;

    if (slug && slug !== existing.slug) {
      const slugCheck = db.prepare('SELECT id FROM projects WHERE slug = ? AND id != ? AND id != ?').get(slug, id, numId);
      if (slugCheck) {
        throw new AppError(`A project with the slug "${slug}" already exists.`, 400);
      }
    }

    const scopeJson = scope !== undefined ? (Array.isArray(scope) ? JSON.stringify(scope) : scope) : existing.scope;
    const galleryJson = gallery !== undefined ? (Array.isArray(gallery) ? JSON.stringify(gallery) : gallery) : existing.gallery;

    db.prepare(`
      UPDATE projects
      SET title = ?, slug = ?, category = ?, client_name = ?, location = ?, area_sqft = ?,
          description = ?, scope = ?, image_url = ?, gallery = ?, is_featured = ?, sort_order = ?,
          is_published = ?, updated_at = datetime('now')
      WHERE id = ? OR id = ?
    `).run(
      title ? stripHtml(title) : existing.title,
      slug ? slug.toLowerCase() : existing.slug,
      category || existing.category,
      client_name !== undefined ? stripHtml(client_name) : (existing.client_name || ''),
      location !== undefined ? stripHtml(location) : (existing.location || ''),
      area_sqft !== undefined ? Number(area_sqft) : (existing.area_sqft || 0),
      description || existing.description,
      scopeJson,
      image_url || existing.image_url,
      galleryJson,
      is_featured !== undefined ? is_featured : existing.is_featured,
      sort_order !== undefined ? sort_order : existing.sort_order,
      is_published !== undefined ? is_published : existing.is_published,
      id,
      numId
    );

    const updated = db.prepare('SELECT * FROM projects WHERE id = ? OR id = ?').get(id, numId);
    if (updated) {
      updated.scope = safeJsonParse(updated.scope);
      updated.gallery = safeJsonParse(updated.gallery);
    }

    return res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Delete project
 */
export function deleteProject(req, res, next) {
  try {
    const { id } = req.params;
    const numId = parseInt(id, 10) || 0;
    const existing = db.prepare('SELECT id FROM projects WHERE id = ? OR id = ?').get(id, numId);
    if (!existing) {
      throw new AppError(`Project #${id} not found`, 404);
    }

    db.prepare('DELETE FROM projects WHERE id = ? OR id = ?').run(id, numId);

    return res.status(200).json({
      success: true,
      message: `Project #${id} deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Reorder projects in batch
 */
export function reorderProjects(req, res, next) {
  try {
    const { orders } = req.body; // Array of { id, sort_order }
    if (!Array.isArray(orders)) {
      throw new AppError('Expected an array of { id, sort_order }', 400);
    }

    const reorderTx = db.transaction((items) => {
      const stmt = db.prepare('UPDATE projects SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?');
      for (const item of items) {
        stmt.run(item.sort_order, item.id);
      }
    });

    reorderTx(orders);

    return res.status(200).json({
      success: true,
      message: 'Projects reordered successfully',
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getPublishedProjects,
  getProjectBySlug,
  getAllProjects,
  createProject,
  updateProject,
  deleteProject,
  reorderProjects,
};
