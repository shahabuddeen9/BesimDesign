/**
 * @file /server/controllers/enquiry.controller.js
 * @description Controller for public lead submissions (forms, quotes, calculator)
 * and administrator CRM lead management, status updates, notes, and CSV exports.
 */

import { z } from 'zod';
import { db } from '../db/index.js';
import { generateEnquiriesCsv } from '../services/csvExport.js';
import { sendEnquiryEmails } from '../services/mailer.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';
import { hashIp, normalizeIndianPhone, stripHtml } from '../utils/sanitize.js';

// Allowed business types for commercial architecture
export const ALLOWED_BUSINESS_TYPES = [
  'restaurant',
  'hotel',
  'industrial',
  'bar',
  'cafe',
  'commercial_office',
  'cloud_kitchen',
  'other',
];

// Zod Validation Schema for Enquiry Submissions
export const enquirySubmissionSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(80, 'Name must not exceed 80 characters'),
  phone: z
    .string()
    .regex(/^(?:\+91[\s-]?)?[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number (starts with 6-9)'),
  email: z
    .string()
    .email('Please enter a valid email address'),
  business_type: z
    .string()
    .refine((val) => ALLOWED_BUSINESS_TYPES.includes(val.toLowerCase()), {
      message: `Business type must be one of: ${ALLOWED_BUSINESS_TYPES.join(', ')}`,
    }),
  project_location: z
    .string()
    .max(150, 'Location must not exceed 150 characters')
    .optional()
    .default(''),
  area_sqft: z.coerce
    .number()
    .min(0, 'Area must be at least 0 sq.ft')
    .max(100000, 'Area must not exceed 100,000 sq.ft')
    .default(0),
  message: z
    .string()
    .max(2000, 'Message cannot exceed 2000 characters')
    .optional()
    .default(''),
  source: z
    .enum(['contact_form', 'quote', 'calculator'])
    .default('contact_form'),
  calculator_data: z
    .union([z.record(z.any()), z.string(), z.null()])
    .optional()
    .default(null),
  honeypot: z
    .string()
    .max(0, 'Bot submission rejected.')
    .optional()
    .default(''),
  consent: z
    .union([z.boolean(), z.string()])
    .refine((v) => v === true || v === 'true' || v === '1' || v === 1, {
      message: 'You must agree to be contacted regarding your enquiry.',
    }),
});

/**
 * Public: Submit a new enquiry, quote request, or calculator estimation lead.
 */
export async function createEnquiry(req, res, next) {
  try {
    const rawIp = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || req.ip;
    const ipHash = hashIp(rawIp);

    // Validate body
    const validated = enquirySubmissionSchema.parse(req.body);

    // Strip HTML and sanitize inputs
    const sanitizedName = stripHtml(validated.name);
    const sanitizedEmail = stripHtml(validated.email).toLowerCase();
    const sanitizedPhone = normalizeIndianPhone(validated.phone);
    const sanitizedBusinessType = stripHtml(validated.business_type).toLowerCase();
    const sanitizedLocation = stripHtml(validated.project_location || '');
    const sanitizedMessage = stripHtml(validated.message || '');
    const calculatorJson = validated.calculator_data
      ? typeof validated.calculator_data === 'string'
        ? validated.calculator_data
        : JSON.stringify(validated.calculator_data)
      : null;

    // Insert enquiry into SQLite database
    const insertStmt = db.prepare(`
      INSERT INTO enquiries (
        name, phone, email, business_type, project_location,
        area_sqft, message, source, calculator_data, status,
        admin_notes, consent_given, ip_hash, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, 'new',
        '', 1, ?, datetime('now'), datetime('now')
      )
    `);

    const result = insertStmt.run(
      sanitizedName,
      sanitizedPhone,
      sanitizedEmail,
      sanitizedBusinessType,
      sanitizedLocation,
      validated.area_sqft,
      sanitizedMessage,
      validated.source,
      calculatorJson,
      ipHash
    );

    const savedId = result.lastInsertRowid;
    logger.info(`Saved enquiry #${savedId} from ${sanitizedName} (${sanitizedBusinessType})`);

    // Fetch newly saved record for email dispatch
    const savedEnquiry = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(savedId);

    // Asynchronously dispatch emails without blocking client response
    sendEnquiryEmails(savedEnquiry).catch((err) => {
      logger.error('Background email dispatch failed for enquiry #' + savedId, err);
    });

    return res.status(201).json({
      success: true,
      id: savedId,
      message: 'Thank you! Your project enquiry has been submitted. Our architectural team will reach out shortly.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Get paginated list of enquiries with filtering and search.
 */
export function getEnquiries(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { status, source, search, startDate, endDate } = req.query;

    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }

    if (source && source !== 'all') {
      conditions.push('source = ?');
      params.push(source);
    }

    if (startDate) {
      conditions.push('date(created_at) >= date(?)');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('date(created_at) <= date(?)');
      params.push(endDate);
    }

    if (search && search.trim()) {
      conditions.push('(name LIKE ? OR phone LIKE ? OR email LIKE ? OR project_location LIKE ? OR message LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count for pagination
    const totalRow = db.prepare(`SELECT COUNT(*) as count FROM enquiries ${whereClause}`).get(...params);
    const total = totalRow ? totalRow.count : 0;

    // Paginated records
    const records = db.prepare(`
      SELECT id, name, phone, email, business_type, project_location,
             area_sqft, message, source, calculator_data, status,
             admin_notes, consent_given, created_at, updated_at
      FROM enquiries
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return res.status(200).json({
      success: true,
      data: records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Retrieve a single enquiry by ID.
 */
export function getEnquiryById(req, res, next) {
  try {
    const { id } = req.params;
    const enquiry = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(id);

    if (!enquiry) {
      throw new AppError(`Enquiry #${id} not found`, 404);
    }

    return res.status(200).json({
      success: true,
      data: enquiry,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Update enquiry status and administrative notes.
 */
export function updateEnquiry(req, res, next) {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    const existing = db.prepare('SELECT id FROM enquiries WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(`Enquiry #${id} not found`, 404);
    }

    const validStatuses = ['new', 'contacted', 'quoted', 'won', 'lost'];
    if (status && !validStatuses.includes(status)) {
      throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const updates = [];
    const params = [];

    if (status) {
      updates.push('status = ?');
      params.push(status);
    }

    if (typeof admin_notes === 'string') {
      updates.push('admin_notes = ?');
      params.push(stripHtml(admin_notes));
    }

    updates.push("updated_at = datetime('now')");

    db.prepare(`
      UPDATE enquiries
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params, id);

    const updated = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(id);

    return res.status(200).json({
      success: true,
      message: 'Enquiry updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Delete an enquiry.
 */
export function deleteEnquiry(req, res, next) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM enquiries WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(`Enquiry #${id} not found`, 404);
    }

    db.prepare('DELETE FROM enquiries WHERE id = ?').run(id);

    return res.status(200).json({
      success: true,
      message: `Enquiry #${id} has been deleted.`,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Export all filtered enquiries as RFC 4180 CSV.
 */
export function exportEnquiriesCsv(req, res, next) {
  try {
    const { status, source } = req.query;
    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (source && source !== 'all') {
      conditions.push('source = ?');
      params.push(source);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const records = db.prepare(`SELECT * FROM enquiries ${whereClause} ORDER BY created_at DESC`).all(...params);

    const csvData = generateEnquiriesCsv(records);
    const filename = `besim-design-enquiries-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvData);
  } catch (error) {
    next(error);
  }
}

export default {
  createEnquiry,
  getEnquiries,
  getEnquiryById,
  updateEnquiry,
  deleteEnquiry,
  exportEnquiriesCsv,
};
