/**
 * @file /server/controllers/project.controller.js
 * @description Controller for commercial architecture project portfolio management.
 * Provides public read endpoints and authenticated administrative CRUD operations.
 */

import { z } from 'zod';
import { db } from '../db/index.js';
import AppError from '../utils/AppError.js';
import { stripHtml } from '../utils/sanitize.js';

// Project Zod Schema
export const projectSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(150),
  slug: z.string().min(2).max(150).regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase letters, numbers, and hyphens'),
  category: z.string().min(2).max(50),
  client_name: z.string().max(100).default(''),
  location: z.string().max(100).default(''),
  area_sqft: z.coerce.number().default(0),
  description: z.string().min(2, 'Description must be at least 2 characters'),
  scope: z.union([z.array(z.string()), z.string()]).default([]),
  image_url: z.string().min(1, 'Cover image URL or upload path is required'),
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
    const { category } = req.query;
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

    sql += ' ORDER BY sort_order ASC, created_at DESC';

    const projects = db.prepare(sql).all(...params).map((p) => ({
      ...p,
      scope: typeof p.scope === 'string' ? JSON.parse(p.scope || '[]') : p.scope,
      gallery: typeof p.gallery === 'string' ? JSON.parse(p.gallery || '[]') : p.gallery,
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

    project.scope = typeof project.scope === 'string' ? JSON.parse(project.scope || '[]') : project.scope;
    project.gallery = typeof project.gallery === 'string' ? JSON.parse(project.gallery || '[]') : project.gallery;

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
      scope: typeof p.scope === 'string' ? JSON.parse(p.scope || '[]') : p.scope,
      gallery: typeof p.gallery === 'string' ? JSON.parse(p.gallery || '[]') : p.gallery,
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
    const validated = projectSchema.parse(req.body);

    // Check slug collision
    const existing = db.prepare('SELECT id FROM projects WHERE slug = ?').get(validated.slug);
    if (existing) {
      throw new AppError(`A project with the slug "${validated.slug}" already exists.`, 400);
    }

    const scopeJson = Array.isArray(validated.scope) ? JSON.stringify(validated.scope) : validated.scope;
    const galleryJson = Array.isArray(validated.gallery) ? JSON.stringify(validated.gallery) : validated.gallery;

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
      validated.slug.toLowerCase(),
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
    } = req.body;

    if (slug && slug !== existing.slug) {
      const slugCheck = db.prepare('SELECT id FROM projects WHERE slug = ? AND id != ? AND id != ?').get(slug, id, numId);
      if (slugCheck) {
        throw new AppError(`A project with the slug "${slug}" already exists.`, 400);
      }
    }

    const scopeJson = scope ? (Array.isArray(scope) ? JSON.stringify(scope) : scope) : existing.scope;
    const galleryJson = gallery ? (Array.isArray(gallery) ? JSON.stringify(gallery) : gallery) : existing.gallery;

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

    const stmt = db.prepare('UPDATE projects SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?');
    for (const item of orders) {
      stmt.run(item.sort_order, item.id);
    }

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
