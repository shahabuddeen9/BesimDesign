/**
 * @file /server/controllers/project.controller.js
 * @description Controller for commercial architecture project portfolio management.
 * Provides public read endpoints and authenticated administrative CRUD operations.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { db } from '../db/index.js';
import AppError from '../utils/AppError.js';
import { stripHtml } from '../utils/sanitize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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

    const b = req.body || {};
    const title = b.title !== undefined ? stripHtml(String(b.title).trim()) : existing.title;
    const slug = b.slug !== undefined ? String(b.slug).trim().toLowerCase() : existing.slug;
    const category = b.category !== undefined ? String(b.category).trim() : existing.category;
    const client_name = b.client_name !== undefined ? stripHtml(String(b.client_name).trim()) : (existing.client_name || '');
    const location = b.location !== undefined ? stripHtml(String(b.location).trim()) : (existing.location || '');
    const area_sqft = b.area_sqft !== undefined ? Number(b.area_sqft) || 0 : (existing.area_sqft || 0);
    const description = b.description !== undefined ? String(b.description).trim() : existing.description;
    const image_url = b.image_url !== undefined ? String(b.image_url).trim() : existing.image_url;
    const is_featured = b.is_featured !== undefined ? (Number(b.is_featured) ? 1 : 0) : existing.is_featured;
    const sort_order = b.sort_order !== undefined ? Number(b.sort_order) || 0 : (existing.sort_order || 0);
    const is_published = b.is_published !== undefined ? (Number(b.is_published) ? 1 : 0) : existing.is_published;

    let scopeJson = existing.scope;
    if (b.scope !== undefined) {
      scopeJson = Array.isArray(b.scope) ? JSON.stringify(b.scope) : String(b.scope);
    }

    let galleryJson = existing.gallery;
    if (b.gallery !== undefined) {
      galleryJson = Array.isArray(b.gallery) ? JSON.stringify(b.gallery) : String(b.gallery);
    }

    if (slug && slug !== existing.slug) {
      const slugCheck = db.prepare('SELECT id FROM projects WHERE slug = ? AND id != ? AND id != ?').get(slug, id, numId);
      if (slugCheck) {
        throw new AppError(`A project with the slug "${slug}" already exists.`, 400);
      }
    }

    db.prepare(`
      UPDATE projects
      SET title = ?, slug = ?, category = ?, client_name = ?, location = ?, area_sqft = ?,
          description = ?, scope = ?, image_url = ?, gallery = ?, is_featured = ?, sort_order = ?,
          is_published = ?, updated_at = datetime('now')
      WHERE id = ? OR id = ?
    `).run(
      title,
      slug,
      category,
      client_name,
      location,
      area_sqft,
      description,
      scopeJson,
      image_url,
      galleryJson,
      is_featured,
      sort_order,
      is_published,
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

/**
 * Admin: Add photo(s) to a selected project's gallery
 */
export function addProjectPhotos(req, res, next) {
  try {
    const { id } = req.params;
    const numId = parseInt(id, 10) || 0;
    const project = db.prepare('SELECT * FROM projects WHERE id = ? OR id = ?').get(id, numId);
    if (!project) throw new AppError(`Project #${id} not found`, 404);

    let incoming = req.body.urls || req.body.url || req.body.photos;
    if (!incoming) throw new AppError('Please provide photo URL(s) to add', 400);
    if (!Array.isArray(incoming)) incoming = [incoming];
    incoming = incoming.map((s) => String(s).trim()).filter(Boolean);

    if (incoming.length === 0) {
      throw new AppError('No valid photo URLs provided', 400);
    }

    let gallery = safeJsonParse(project.gallery);
    for (const url of incoming) {
      if (!gallery.includes(url) && url !== project.image_url) {
        gallery.push(url);
      }
    }

    let imageUrl = project.image_url;
    if (!imageUrl || imageUrl.includes('unsplash.com/photo-1600585154340') && incoming.length > 0) {
      imageUrl = incoming[0];
    }

    db.prepare(`
      UPDATE projects
      SET gallery = ?, image_url = ?, updated_at = datetime('now')
      WHERE id = ? OR id = ?
    `).run(JSON.stringify(gallery), imageUrl, id, numId);

    const updated = db.prepare('SELECT * FROM projects WHERE id = ? OR id = ?').get(id, numId);
    if (updated) {
      updated.scope = safeJsonParse(updated.scope);
      updated.gallery = safeJsonParse(updated.gallery);
    }

    return res.status(200).json({
      success: true,
      message: `${incoming.length} photo(s) added successfully`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Delete a photo from a selected project
 */
export function deleteProjectPhoto(req, res, next) {
  try {
    const { id } = req.params;
    const numId = parseInt(id, 10) || 0;
    const project = db.prepare('SELECT * FROM projects WHERE id = ? OR id = ?').get(id, numId);
    if (!project) throw new AppError(`Project #${id} not found`, 404);

    const photoUrl = (req.body?.url || req.query?.url || '').trim();
    if (!photoUrl) throw new AppError('Photo URL to delete is required', 400);

    let gallery = safeJsonParse(project.gallery);
    // Remove target photo from gallery
    gallery = gallery.filter((item) => item !== photoUrl);

    let imageUrl = (project.image_url || '').trim();

    // Check if the photo to delete is the primary cover photo
    if (imageUrl === photoUrl) {
      if (gallery.length > 0) {
        imageUrl = gallery[0];
      } else {
        imageUrl = 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80';
      }
    }

    // If local uploaded file, safely remove from disk
    if (photoUrl.startsWith('/uploads/')) {
      try {
        const filePath = path.resolve(__dirname, '../../uploads', path.basename(photoUrl));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.warn('Could not remove file from disk:', err?.message);
      }
    }

    db.prepare(`
      UPDATE projects
      SET gallery = ?, image_url = ?, updated_at = datetime('now')
      WHERE id = ? OR id = ?
    `).run(JSON.stringify(gallery), imageUrl, id, numId);

    const updated = db.prepare('SELECT * FROM projects WHERE id = ? OR id = ?').get(id, numId);
    if (updated) {
      updated.scope = safeJsonParse(updated.scope);
      updated.gallery = safeJsonParse(updated.gallery);
    }

    return res.status(200).json({
      success: true,
      message: 'Photo deleted successfully from project',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Set a specific photo as primary cover for selected project
 */
export function setProjectCoverPhoto(req, res, next) {
  try {
    const { id } = req.params;
    const numId = parseInt(id, 10) || 0;
    const project = db.prepare('SELECT * FROM projects WHERE id = ? OR id = ?').get(id, numId);
    if (!project) throw new AppError(`Project #${id} not found`, 404);

    const { url } = req.body;
    if (!url) throw new AppError('Cover photo URL is required', 400);

    let gallery = safeJsonParse(project.gallery);
    const oldCover = project.image_url;

    // Remove new cover from gallery if present
    gallery = gallery.filter((item) => item !== url);

    // If old cover was valid and different, preserve in gallery
    if (oldCover && oldCover !== url && !gallery.includes(oldCover)) {
      gallery.unshift(oldCover);
    }

    db.prepare(`
      UPDATE projects
      SET image_url = ?, gallery = ?, updated_at = datetime('now')
      WHERE id = ? OR id = ?
    `).run(url, JSON.stringify(gallery), id, numId);

    const updated = db.prepare('SELECT * FROM projects WHERE id = ? OR id = ?').get(id, numId);
    if (updated) {
      updated.scope = safeJsonParse(updated.scope);
      updated.gallery = safeJsonParse(updated.gallery);
    }

    return res.status(200).json({
      success: true,
      message: 'Cover photo updated successfully',
      data: updated,
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
  addProjectPhotos,
  deleteProjectPhoto,
  setProjectCoverPhoto,
};
