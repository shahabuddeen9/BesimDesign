/**
 * @file /server/controllers/testimonial.controller.js
 * @description Controller for managing client testimonials, star ratings, and published states.
 */

import { z } from 'zod';
import { db } from '../db/index.js';
import AppError from '../utils/AppError.js';
import { stripHtml } from '../utils/sanitize.js';

export const testimonialSchema = z.object({
  client_name: z.string().min(2, 'Client name must be at least 2 characters').max(100),
  business_type: z.string().min(2).max(100),
  rating: z.coerce.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
  review: z.string().min(10, 'Review must be at least 10 characters').max(1000),
  is_published: z.coerce.number().min(0).max(1).default(1),
  sort_order: z.coerce.number().default(0),
});

/**
 * Public: Get published testimonials
 */
export function getPublishedTestimonials(req, res, next) {
  try {
    const testimonials = db.prepare(`
      SELECT id, client_name, business_type, rating, review, sort_order, created_at
      FROM testimonials
      WHERE is_published = 1
      ORDER BY sort_order ASC, created_at DESC
    `).all();

    return res.status(200).json({
      success: true,
      data: testimonials,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Get all testimonials
 */
export function getAllTestimonials(req, res, next) {
  try {
    const testimonials = db.prepare(`
      SELECT * FROM testimonials
      ORDER BY sort_order ASC, created_at DESC
    `).all();

    return res.status(200).json({
      success: true,
      data: testimonials,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Create testimonial
 */
export function createTestimonial(req, res, next) {
  try {
    const validated = testimonialSchema.parse(req.body);

    const result = db.prepare(`
      INSERT INTO testimonials (
        client_name, business_type, rating, review,
        is_published, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      stripHtml(validated.client_name),
      stripHtml(validated.business_type),
      validated.rating,
      stripHtml(validated.review),
      validated.is_published,
      validated.sort_order
    );

    const saved = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(result.lastInsertRowid);

    return res.status(201).json({
      success: true,
      message: 'Testimonial added successfully',
      data: saved,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Update testimonial
 */
export function updateTestimonial(req, res, next) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(`Testimonial #${id} not found`, 404);
    }

    const validated = testimonialSchema.partial().parse(req.body);
    const { client_name, business_type, rating, review, is_published, sort_order } = validated;

    db.prepare(`
      UPDATE testimonials
      SET client_name = ?, business_type = ?, rating = ?, review = ?,
          is_published = ?, sort_order = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      client_name ? stripHtml(client_name) : existing.client_name,
      business_type ? stripHtml(business_type) : existing.business_type,
      rating !== undefined ? Number(rating) : existing.rating,
      review ? stripHtml(review) : existing.review,
      is_published !== undefined ? Number(is_published) : existing.is_published,
      sort_order !== undefined ? Number(sort_order) : existing.sort_order,
      id
    );

    const updated = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id);

    return res.status(200).json({
      success: true,
      message: 'Testimonial updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Delete testimonial
 */
export function deleteTestimonial(req, res, next) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM testimonials WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError(`Testimonial #${id} not found`, 404);
    }

    db.prepare('DELETE FROM testimonials WHERE id = ?').run(id);

    return res.status(200).json({
      success: true,
      message: `Testimonial #${id} deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getPublishedTestimonials,
  getAllTestimonials,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
};
