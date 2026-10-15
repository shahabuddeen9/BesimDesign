/**
 * @file /server/controllers/faq.controller.js
 * @description Controller for managing architectural and statutory clearance FAQs.
 */

import { z } from 'zod';
import { db } from '../db/index.js';
import AppError from '../utils/AppError.js';
import { stripHtml } from '../utils/sanitize.js';

export const faqSchema = z.object({
  question: z.string().min(5, 'Question must be at least 5 characters').max(300),
  answer: z.string().min(10, 'Answer must be at least 10 characters').max(2000),
  sort_order: z.coerce.number().default(0),
  is_published: z.coerce.number().min(0).max(1).default(1),
});

/**
 * Public: Get published FAQs
 */
export function getPublishedFaqs(req, res, next) {
  try {
    const faqs = db.prepare(`
      SELECT id, question, answer, sort_order
      FROM faqs
      WHERE is_published = 1
      ORDER BY sort_order ASC, created_at ASC
    `).all();

    return res.status(200).json({
      success: true,
      data: faqs,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Get all FAQs
 */
export function getAllFaqs(req, res, next) {
  try {
    const faqs = db.prepare(`
      SELECT * FROM faqs
      ORDER BY sort_order ASC, created_at ASC
    `).all();

    return res.status(200).json({
      success: true,
      data: faqs,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Create FAQ
 */
export function createFaq(req, res, next) {
  try {
    const validated = faqSchema.parse(req.body);

    const result = db.prepare(`
      INSERT INTO faqs (question, answer, sort_order, is_published, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      stripHtml(validated.question),
      stripHtml(validated.answer),
      validated.sort_order,
      validated.is_published
    );

    const saved = db.prepare('SELECT * FROM faqs WHERE id = ?').get(result.lastInsertRowid);

    return res.status(201).json({
      success: true,
      message: 'FAQ created successfully',
      data: saved,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Update FAQ
 */
export function updateFaq(req, res, next) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM faqs WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(`FAQ #${id} not found`, 404);
    }

    const { question, answer, sort_order, is_published } = req.body;

    db.prepare(`
      UPDATE faqs
      SET question = ?, answer = ?, sort_order = ?, is_published = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      question ? stripHtml(question) : existing.question,
      answer ? stripHtml(answer) : existing.answer,
      sort_order !== undefined ? Number(sort_order) : existing.sort_order,
      is_published !== undefined ? Number(is_published) : existing.is_published,
      id
    );

    const updated = db.prepare('SELECT * FROM faqs WHERE id = ?').get(id);

    return res.status(200).json({
      success: true,
      message: 'FAQ updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Delete FAQ
 */
export function deleteFaq(req, res, next) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM faqs WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(`FAQ #${id} not found`, 404);
    }

    db.prepare('DELETE FROM faqs WHERE id = ?').run(id);

    return res.status(200).json({
      success: true,
      message: `FAQ #${id} deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getPublishedFaqs,
  getAllFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
};
