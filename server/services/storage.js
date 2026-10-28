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
 * On Vercel / serverless environments without cloud bucket credentials, converts
 * to an inline Data URI so the image is stored in PostgreSQL and survives redeployments.
 *
 * @param {object} file Multer file object
 * @returns {Promise<{ url: string, localUrl: string, isDataUri: boolean }>}
 */
export async function processUploadedFile(file) {
  if (!file) {
    throw new Error('No file provided');
  }

  const localUrl = `/uploads/${file.filename}`;
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
    const cloudUrl = await uploadToSupabaseStorage(buffer, file.filename, file.mimetype);
    if (cloudUrl) {
      return {
        url: cloudUrl,
        localUrl,
        isDataUri: false,
      };
    }
  }

  // 2. If on Vercel or serverless (where disk in /tmp is wiped), use Data URI for bulletproof permanence
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (buffer && file.mimetype && file.mimetype.startsWith('image/')) {
    const dataUri = `data:${file.mimetype};base64,${buffer.toString('base64')}`;
    return {
      url: isServerless ? dataUri : localUrl,
      localUrl,
      dataUri,
      isDataUri: isServerless,
    };
  }

  return {
    url: localUrl,
    localUrl,
    isDataUri: false,
  };
}

export default {
  uploadToSupabaseStorage,
  processUploadedFile,
};
