/**
 * @file /server/services/storage.js
 * @description Persistent file and image storage service.
 * Supports:
 * 1. Supabase Storage (if SUPABASE_URL & SUPABASE_KEY/SUPABASE_SERVICE_ROLE_KEY are set)
 * 2. Permanent Data URI storage directly in PostgreSQL (zero-dependency persistent storage on Vercel)
 * 3. Local disk storage in development (/uploads/)
 */

import fs from 'fs';
import path from 'path';
import env from '../config/env.js';
import { db } from '../db/index.js';
import { validateFileBuffer } from '../middleware/upload.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * Uploads a local file buffer to Supabase Storage if configured.
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string} mimeType
 * @returns {Promise<string|null>} Public URL or null if Supabase is not configured
 */
export async function uploadToSupabaseStorage(buffer, filename, mimeType) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const bucket = 'besim-assets';
    const cleanUrl = supabaseUrl.replace(/\/$/, '');
    const uploadEndpoint = `${cleanUrl}/storage/v1/object/${bucket}/${filename}`;

    const res = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': mimeType || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: buffer,
    });

    if (res.ok) {
      const publicUrl = `${cleanUrl}/storage/v1/object/public/${bucket}/${filename}`;
      logger.info(`Uploaded asset to Supabase Storage: ${publicUrl}`);
      return publicUrl;
    } else {
      const errText = await res.text();
      logger.warn(`Supabase Storage upload returned status ${res.status}: ${errText}`);
    }
  } catch (err) {
    logger.warn('Failed to upload to Supabase Storage:', err);
  }

  return null;
}

/**
 * Processes an uploaded file from Multer and returns a permanent, persistent URL.
 * Never returns raw Base64 Data URIs as the URL to prevent Request Entity Too Large (413)
 * errors on subsequent form saves. Instead, saves to cloud storage or stores in the database
 * fallback table while returning a clean URL or relative path (/uploads/...).
 *
 * @param {object} file Multer file object
 * @returns {Promise<{ url: string, localUrl: string, filename: string, isDataUri: boolean }>}
 */
export async function processUploadedFile(file) {
  if (!file) {
    throw new Error('No file provided');
  }

  const filename = file.filename;
  const localUrl = `/uploads/${filename}`;
  let buffer = null;

  if (file.path && fs.existsSync(file.path)) {
    try {
      buffer = fs.readFileSync(file.path);
    } catch (_) {}
  } else if (file.buffer) {
    buffer = file.buffer;
  }

  if (buffer && file.mimetype) {
    const isValid = validateFileBuffer(buffer, file.mimetype);
    if (!isValid) {
      if (file.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch (_) {}
      }
      throw new AppError('File signature does not match declared MIME type. Upload rejected for security.', 400);
    }
  }

  // 1. Try Supabase Storage if configured
  if (buffer) {
    const cloudUrl = await uploadToSupabaseStorage(buffer, filename, file.mimetype);
    if (cloudUrl) {
      return {
        url: cloudUrl,
        localUrl,
        filename,
        isDataUri: false,
      };
    }
  }

  // 2. Ensure physical copies exist in disk upload directories (uploads and public/uploads)
  if (buffer) {
    try {
      const diskDirs = [
        path.resolve(process.cwd(), 'uploads'),
        path.resolve(process.cwd(), 'public/uploads'),
      ];
      for (const dir of diskDirs) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const filePath = path.resolve(dir, filename);
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, buffer);
        }
      }
    } catch (_) {}
  }

  // 3. Persist to database fallback table for bulletproof permanence across serverless restarts
  if (buffer && file.mimetype) {
    try {
      const base64Data = buffer.toString('base64');
      await db.run(
        `INSERT OR REPLACE INTO uploaded_assets (filename, mimetype, data, created_at)
         VALUES (?, ?, ?, datetime('now'))`,
        filename,
        file.mimetype,
        base64Data
      );
      db.persist();
    } catch (err) {
      logger.warn('Failed to persist uploaded asset to database:', err);
    }
  }

  return {
    url: localUrl,
    localUrl,
    filename,
    isDataUri: false,
  };
}

/**
 * Safely deletes a physical asset file only if no other project or client references it.
 * Designed for post-commit cleanup to guarantee that transaction rollbacks never leave broken references.
 *
 * @param {string} fileUrlOrName Relative URL (/uploads/xyz.png) or bare filename
 * @returns {Promise<{ deleted: boolean, reason?: string, filename?: string }>}
 */
export async function safeDeleteFileIfUnreferenced(fileUrlOrName) {
  if (!fileUrlOrName || typeof fileUrlOrName !== 'string') {
    return { deleted: false, reason: 'invalid_argument' };
  }

  const trimmed = fileUrlOrName.trim();
  // Don't attempt to delete external unsplash or cloud images
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (!trimmed.includes('/uploads/')) {
      return { deleted: false, reason: 'external_url' };
    }
  }

  const filename = path.basename(trimmed);
  if (!filename || filename === '.' || filename === '..') {
    return { deleted: false, reason: 'invalid_filename' };
  }

  try {
    // 1. Check if any project still references this file
    const projCheck = await db.get(
      'SELECT COUNT(*) as count FROM projects WHERE image_url LIKE ? OR gallery LIKE ?',
      `%${filename}%`,
      `%${filename}%`
    );
    const projCount = Number(projCheck?.count || projCheck?.['COUNT(*)'] || 0);

    // 2. Check if any client logo references this file
    const clientCheck = await db.get(
      'SELECT COUNT(*) as count FROM clients WHERE logo_url LIKE ?',
      `%${filename}%`
    );
    const clientCount = Number(clientCheck?.count || clientCheck?.['COUNT(*)'] || 0);

    if (projCount + clientCount > 0) {
      logger.info(`Asset ${filename} still referenced by ${projCount + clientCount} record(s). Preserving physical file.`);
      return { deleted: false, reason: 'referenced', referenceCount: projCount + clientCount };
    }

    // 3. Unreferenced: Safe physical deletion from disk
    const diskPaths = [
      path.resolve(process.cwd(), 'uploads', filename),
      path.resolve(process.cwd(), 'public/uploads', filename),
    ];

    let physicallyRemoved = false;
    for (const p of diskPaths) {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
          physicallyRemoved = true;
        } catch (err) {
          logger.warn(`Could not remove physical file from disk (${p}): ${err.message}`);
        }
      }
    }

    // 4. Remove from database uploaded_assets fallback table if present
    try {
      await db.run('DELETE FROM uploaded_assets WHERE filename = ?', filename);
    } catch (_) {}

    return { deleted: physicallyRemoved, filename };
  } catch (err) {
    logger.warn(`Error during safe file cleanup check for ${filename}:`, err);
    return { deleted: false, reason: 'error', error: err.message };
  }
}

export default {
  uploadToSupabaseStorage,
  processUploadedFile,
  safeDeleteFileIfUnreferenced,
};

