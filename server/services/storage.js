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

export default {
  uploadToSupabaseStorage,
  processUploadedFile,
};

