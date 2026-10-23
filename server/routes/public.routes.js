/**
 * @file /server/routes/public.routes.js
 * @description Public unauthenticated API routes for clients and visitors.
 * All routes are rate-limited and protected with input validation.
 */

import { Router } from 'express';
import { createEnquiry } from '../controllers/enquiry.controller.js';
import { getPublishedClients } from '../controllers/client.controller.js';
import { getProjectBySlug, getPublishedProjects } from '../controllers/project.controller.js';
import { downloadCompanyProfile } from '../controllers/stats.controller.js';
import { getPublishedTestimonials } from '../controllers/testimonial.controller.js';
import { enquiryLimiter } from '../middleware/rateLimit.js';

export const publicRouter = Router();

// 1. Submit lead enquiry / quotation / calculator request (rate limit: 5/hr/IP)
publicRouter.post('/enquiries', enquiryLimiter, createEnquiry);

// 2. Portfolio Projects
publicRouter.get('/projects', getPublishedProjects);
publicRouter.get('/projects/:slug', getProjectBySlug);

// 2.5 Clients & Brands
publicRouter.get('/clients', getPublishedClients);

// 3. Client Testimonials
publicRouter.get('/testimonials', getPublishedTestimonials);

import { uploadImage } from '../middleware/upload.js';
import AppError from '../utils/AppError.js';

// 5. Download Company Profile Deck
publicRouter.get('/download/company-profile', downloadCompanyProfile);

// 6. Upload Project Brief / Drawings (JPG, PNG, WebP, PDF up to 10MB)
publicRouter.post('/upload', uploadImage.single('file'), (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No drawing or document file uploaded.', 400);
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    return res.status(200).json({
      success: true,
      message: 'Project file uploaded successfully.',
      url: fileUrl,
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    next(error);
  }
});

export default publicRouter;
