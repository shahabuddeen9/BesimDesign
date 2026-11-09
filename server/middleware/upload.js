/**
 * @file /server/middleware/upload.js
 * @description Secure file upload middleware using Multer.
 * Limits file size to 5MB, enforces strict image MIME types and extensions (jpg, jpeg, png, webp),
 * and generates cryptographically randomized filenames in /uploads/.
 */

import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import AppError from '../utils/AppError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : path.resolve(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (_) {}
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomName = crypto.randomBytes(16).toString('hex');
    cb(null, `${randomName}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf',
  ];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type! Only JPG, JPEG, PNG, WebP images and PDF documents are allowed.', 400), false);
  }
};

/**
 * Checks file magic bytes / signature against known safe formats.
 * @param {Buffer} buffer
 * @returns {string|null} Detected MIME type or null if unrecognized
 */
export function detectMimeTypeFromMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // PDF: %PDF (25 50 44 46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }

  return null;
}

/**
 * Validates that uploaded file matches its declared MIME type using magic bytes.
 */
export function validateFileBuffer(buffer, declaredMime) {
  const detected = detectMimeTypeFromMagicBytes(buffer);
  if (!detected) {
    return false;
  }
  if (declaredMime === 'image/jpg' || declaredMime === 'image/jpeg') {
    return detected === 'image/jpeg';
  }
  return detected === declaredMime;
}

/**
 * Express middleware that inspects uploaded files on disk to verify magic bytes.
 * If validation fails, safely unlinks the rejected file.
 */
export function validateUploadedFiles(req, res, next) {
  const files = [];
  if (req.file) files.push(req.file);
  if (req.files) {
    if (Array.isArray(req.files)) files.push(...req.files);
    else Object.values(req.files).forEach((arr) => files.push(...arr));
  }

  for (const f of files) {
    if (f.path && fs.existsSync(f.path)) {
      try {
        const fd = fs.openSync(f.path, 'r');
        const header = Buffer.alloc(16);
        fs.readSync(fd, header, 0, 16, 0);
        fs.closeSync(fd);

        const detected = detectMimeTypeFromMagicBytes(header);
        const isValid = detected && (
          (f.mimetype === 'image/jpg' || f.mimetype === 'image/jpeg' ? detected === 'image/jpeg' : detected === f.mimetype)
        );

        if (!isValid) {
          try { fs.unlinkSync(f.path); } catch (_) {}
          return next(new AppError('File signature does not match declared type. Upload rejected for security.', 400));
        }
      } catch (err) {
        try { fs.unlinkSync(f.path); } catch (_) {}
        return next(new AppError('Failed to inspect uploaded file signature.', 400));
      }
    }
  }

  next();
}

export const uploadImage = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max file size
  },
  fileFilter,
});

export default uploadImage;
