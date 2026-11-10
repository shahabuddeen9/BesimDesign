import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { db, recordDeletedProject, syncTombstones } from '../db/index.js';
import { safeDeleteFileIfUnreferenced } from '../services/storage.js';
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
  title: z.string().max(150).optional().nullable(),
  slug: z.string().max(150).regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase letters, numbers, and hyphens').optional().nullable(),
  category: z.string().min(2, 'Category must be selected').max(50).default('commercial'),
  client_name: z.string().max(100).optional().nullable().default(''),
  location: z.string().max(100).optional().nullable().default(''),
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
export async function getPublishedProjects(req, res, next) {
  try {
    let { category, exclude } = req.query;

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
        AND id NOT IN (SELECT project_id FROM deleted_projects WHERE project_id IS NOT NULL)
        AND (slug IS NULL OR slug NOT IN (SELECT slug FROM deleted_projects WHERE slug IS NOT NULL))
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

    const rawProjects = await db.all(sql, ...params);
    const projects = (rawProjects || []).map((p) => ({
      ...p,
      scope: safeJsonParse(p.scope),
      gallery: safeJsonParse(p.gallery),
    }));

    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
    });
    return res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error) {
    next(error);
  }
}

// Slug aliases for clean backward-compatible URL resolving
const SLUG_ALIASES = {
  'the-nutcracker': 'the-nutcracker-jio-mall-bkc',
  'the-nutcracker-cafe': 'the-nutcracker-jio-mall-bkc',
  'foo': 'foo-asian-tapas-bkc',
  'foo-asian-tapas': 'foo-asian-tapas-bkc',
  'royal-china': 'royal-china-bandra',
  'grand-pavilion': 'grand-pavilion-luxury-hotel',
  'solstice-bay': 'solstice-bay-boutique-hotel',
  'sky-villa': 'sky-villa-parinee-bkc',
  'sea-facing-penthouse': 'sea-facing-penthouse-worli',
  'cloud-culinary': 'cloud-culinary-central-kitchen',
  'artisan-confectionery': 'artisan-confectionery-central-kitchen',
};

/**
 * Public: Get single published project by slug
 */
export async function getProjectBySlug(req, res, next) {
  try {
    const rawSlug = req.params.slug;
    const cleanSlug = String(rawSlug || '').toLowerCase().trim().replace(/\.html$/, '');

    // 1. Exact match
    let project = await db.get(`
      SELECT id, title, slug, category, client_name, location, area_sqft, description, scope, image_url, gallery, is_featured, created_at
      FROM projects
      WHERE LOWER(slug) = ?
        AND is_published = 1
        AND id NOT IN (SELECT project_id FROM deleted_projects WHERE project_id IS NOT NULL)
        AND slug NOT IN (SELECT slug FROM deleted_projects WHERE slug IS NOT NULL)
    `, cleanSlug);

    // 2. Alias match
    if (!project && SLUG_ALIASES[cleanSlug]) {
      const aliasTarget = SLUG_ALIASES[cleanSlug];
      project = await db.get(`
        SELECT id, title, slug, category, client_name, location, area_sqft, description, scope, image_url, gallery, is_featured, created_at
        FROM projects
        WHERE LOWER(slug) = ?
          AND is_published = 1
          AND id NOT IN (SELECT project_id FROM deleted_projects WHERE project_id IS NOT NULL)
          AND slug NOT IN (SELECT slug FROM deleted_projects WHERE slug IS NOT NULL)
      `, aliasTarget);
    }

    // 3. Fallback prefix match (e.g. "sky-villa" -> "sky-villa-parinee-bkc")
    if (!project && cleanSlug.length >= 3) {
      project = await db.get(`
        SELECT id, title, slug, category, client_name, location, area_sqft, description, scope, image_url, gallery, is_featured, created_at
        FROM projects
        WHERE LOWER(slug) LIKE ?
          AND is_published = 1
          AND id NOT IN (SELECT project_id FROM deleted_projects WHERE project_id IS NOT NULL)
          AND slug NOT IN (SELECT slug FROM deleted_projects WHERE slug IS NOT NULL)
        LIMIT 1
      `, `${cleanSlug}%`);
    }

    if (!project) {
      throw new AppError(`Project with slug "${cleanSlug}" not found`, 404);
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
export async function getAllProjects(req, res, next) {
  try {
    const rawProjects = await db.all(`
      SELECT * FROM projects
      WHERE id NOT IN (SELECT project_id FROM deleted_projects WHERE project_id IS NOT NULL)
        AND (slug IS NULL OR slug NOT IN (SELECT slug FROM deleted_projects WHERE slug IS NOT NULL))
      ORDER BY sort_order ASC, created_at DESC
    `);
    const projects = (rawProjects || []).map((p) => ({
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
export async function createProject(req, res, next) {
  try {
    const rawBody = { ...req.body };

    // Normalize empty title to null
    if (typeof rawBody.title === 'string') {
      const trimmedTitle = rawBody.title.trim();
      rawBody.title = trimmedTitle || null;
    } else if (!rawBody.title) {
      rawBody.title = null;
    }

    // Normalize empty slug to null (Do NOT auto-generate a slug from title or empty input)
    if (typeof rawBody.slug === 'string') {
      const trimmedSlug = rawBody.slug
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      rawBody.slug = trimmedSlug || null;
    } else if (!rawBody.slug) {
      rawBody.slug = null;
    }

    const validated = projectSchema.parse(rawBody);

    let finalTitle = validated.title ? stripHtml(String(validated.title).trim()) || null : null;
    let finalSlug = validated.slug ? String(validated.slug).trim().toLowerCase() || null : null;

    if (finalSlug) {
      let counter = 1;
      const baseSlug = finalSlug;
      while (await db.get('SELECT id FROM projects WHERE slug = ?', finalSlug)) {
        finalSlug = `${baseSlug}-${counter++}`;
      }
    }

    try {
      if (finalSlug && finalTitle) {
        await db.run('DELETE FROM deleted_projects WHERE slug = ? OR title = ?', finalSlug, finalTitle);
      } else if (finalSlug) {
        await db.run('DELETE FROM deleted_projects WHERE slug = ?', finalSlug);
      } else if (finalTitle) {
        await db.run('DELETE FROM deleted_projects WHERE title = ?', finalTitle);
      }
      await syncTombstones();
    } catch (_) {}

    const scopeJson = Array.isArray(validated.scope) ? JSON.stringify(validated.scope) : (validated.scope || '[]');
    const galleryJson = Array.isArray(validated.gallery) ? JSON.stringify(validated.gallery) : (validated.gallery || '[]');

    const result = await db.run(`
      INSERT INTO projects (
        title, slug, category, client_name, location, area_sqft, description, scope,
        image_url, gallery, is_featured, sort_order, is_published,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        datetime('now'), datetime('now')
      )
    `,
      finalTitle,
      finalSlug,
      validated.category,
      validated.client_name ? stripHtml(validated.client_name) : '',
      validated.location ? stripHtml(validated.location) : '',
      validated.area_sqft || 0,
      validated.description,
      scopeJson,
      validated.image_url,
      galleryJson,
      validated.is_featured,
      validated.sort_order,
      validated.is_published
    );

    db.persist();

    const newId = result.lastInsertRowid || result.row?.id;
    if (newId) {
      try {
        await db.run('DELETE FROM deleted_projects WHERE project_id = ?', newId);
        await syncTombstones();
      } catch (_) {}
    }
    const saved = await db.get('SELECT * FROM projects WHERE id = ?', newId);
    if (saved) {
      saved.scope = safeJsonParse(saved.scope);
      saved.gallery = safeJsonParse(saved.gallery);
    }

    return res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: saved || { id: newId, ...validated, title: finalTitle, slug: finalSlug },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Update existing project
 */
export async function updateProject(req, res, next) {
  try {
    const { id } = req.params;
    const numId = parseInt(id, 10) || 0;
    const existing = await db.get('SELECT * FROM projects WHERE id = ? OR id = ?', id, numId);
    if (!existing) {
      throw new AppError(`Project #${id} not found`, 404);
    }

    const b = req.body || {};
    let title = existing.title;
    if (b.title !== undefined) {
      if (b.title === null || String(b.title).trim() === '') {
        title = null;
      } else {
        title = stripHtml(String(b.title).trim());
      }
    }

    let slug = existing.slug;
    if (b.slug !== undefined) {
      if (b.slug === null || String(b.slug).trim() === '') {
        slug = null;
      } else {
        slug = String(b.slug).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || null;
      }
    }

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
      const slugCheck = await db.get('SELECT id FROM projects WHERE slug = ? AND id != ?', slug, existing.id);
      if (slugCheck) {
        throw new AppError(`A project with the slug "${slug}" already exists.`, 400);
      }
    }

    await db.run(`
      UPDATE projects
      SET title = ?, slug = ?, category = ?, client_name = ?, location = ?, area_sqft = ?,
          description = ?, scope = ?, image_url = ?, gallery = ?, is_featured = ?, sort_order = ?,
          is_published = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
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
      existing.id
    );

    db.persist();

    const updated = await db.get('SELECT * FROM projects WHERE id = ?', existing.id);
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
export async function deleteProject(req, res, next) {
  try {
    const { id } = req.params;
    const numId = parseInt(id, 10) || 0;
    const existing = await db.get('SELECT id, slug, title, image_url, gallery FROM projects WHERE id = ? OR id = ?', id, numId);
    if (!existing) {
      throw new AppError(`Project #${id} not found`, 404);
    }

    // Collect candidate photos for post-commit cleanup
    const candidatePhotos = [];
    if (existing.image_url) candidatePhotos.push(existing.image_url);
    const existingGallery = safeJsonParse(existing.gallery);
    for (const g of existingGallery) {
      if (g && !candidatePhotos.includes(g)) candidatePhotos.push(g);
    }

    // Atomically write tombstone and delete inside a database transaction
    await db.withTransaction(async (tx) => {
      // 1. Record tombstone
      await recordDeletedProject(existing.id, existing.slug, existing.title, tx);

      // 2. Delete project from database
      await tx.run('DELETE FROM projects WHERE id = ?', existing.id);
    });

    db.persist();

    // 3. POST-COMMIT SAFE CLEANUP:
    // Only executed after successful transaction commit. If transaction rolled back, original files are never lost!
    for (const photo of candidatePhotos) {
      try {
        await safeDeleteFileIfUnreferenced(photo);
      } catch (cleanupErr) {
        console.warn(`Post-commit photo cleanup skipped for ${photo}:`, cleanupErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Project #${id} deleted successfully`,
      deletedId: existing.id,
      deletedSlug: existing.slug,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Reorder projects in batch
 */
export async function reorderProjects(req, res, next) {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders)) {
      throw new AppError('Expected an array of { id, sort_order }', 400);
    }

    for (const item of orders) {
      await db.run("UPDATE projects SET sort_order = ?, updated_at = datetime('now') WHERE id = ?", item.sort_order, item.id);
    }
    db.persist();

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
export async function addProjectPhotos(req, res, next) {
  try {
    const { id } = req.params;
    const numId = parseInt(id, 10) || 0;
    const project = await db.get('SELECT * FROM projects WHERE id = ? OR id = ?', id, numId);
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
    if (!imageUrl || (imageUrl.includes('unsplash.com/photo-1600585154340') && incoming.length > 0)) {
      imageUrl = incoming[0];
    }

    await db.run(`
      UPDATE projects
      SET gallery = ?, image_url = ?, updated_at = datetime('now')
      WHERE id = ?
    `, JSON.stringify(gallery), imageUrl, project.id);
    db.persist();

    const updated = await db.get('SELECT * FROM projects WHERE id = ?', project.id);
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
export async function deleteProjectPhoto(req, res, next) {
  try {
    const { id } = req.params;
    const numId = parseInt(id, 10) || 0;
    const project = await db.get('SELECT * FROM projects WHERE id = ? OR id = ?', id, numId);
    if (!project) throw new AppError(`Project #${id} not found`, 404);

    const photoUrl = (req.body?.url || req.query?.url || '').trim();
    if (!photoUrl) throw new AppError('Photo URL to delete is required', 400);

    let gallery = safeJsonParse(project.gallery);
    gallery = gallery.filter((item) => item !== photoUrl);

    let imageUrl = (project.image_url || '').trim();
    if (imageUrl === photoUrl) {
      if (gallery.length > 0) {
        imageUrl = gallery[0];
      } else {
        imageUrl = 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80';
      }
    }

    // 1. Update database FIRST (metadata remains consistent if update fails)
    await db.run(`
      UPDATE projects
      SET gallery = ?, image_url = ?, updated_at = datetime('now')
      WHERE id = ?
    `, JSON.stringify(gallery), imageUrl, project.id);
    db.persist();

    // 2. POST-UPDATE SAFE CLEANUP:
    // Only after database update succeeds, check if photo is still referenced elsewhere before removing
    try {
      await safeDeleteFileIfUnreferenced(photoUrl);
    } catch (cleanupErr) {
      console.warn('Post-commit photo cleanup error:', cleanupErr.message);
    }

    const updated = await db.get('SELECT * FROM projects WHERE id = ?', project.id);
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
export async function setProjectCoverPhoto(req, res, next) {
  try {
    const { id } = req.params;
    const numId = parseInt(id, 10) || 0;
    const project = await db.get('SELECT * FROM projects WHERE id = ? OR id = ?', id, numId);
    if (!project) throw new AppError(`Project #${id} not found`, 404);

    const { url } = req.body;
    if (!url) throw new AppError('Cover photo URL is required', 400);

    let gallery = safeJsonParse(project.gallery);
    const oldCover = project.image_url;

    gallery = gallery.filter((item) => item !== url);

    if (oldCover && oldCover !== url && !gallery.includes(oldCover)) {
      gallery.unshift(oldCover);
    }

    await db.run(`
      UPDATE projects
      SET image_url = ?, gallery = ?, updated_at = datetime('now')
      WHERE id = ?
    `, url, JSON.stringify(gallery), project.id);
    db.persist();

    const updated = await db.get('SELECT * FROM projects WHERE id = ?', project.id);
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
