/**
 * @file /server/routes/public.routes.js
 * @description Public unauthenticated API routes for clients and visitors.
 * All routes are rate-limited and protected with input validation.
 */

import { Router } from 'express';
import { createEnquiry } from '../controllers/enquiry.controller.js';
import { getPublishedFaqs } from '../controllers/faq.controller.js';
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

// 3. Client Testimonials
publicRouter.get('/testimonials', getPublishedTestimonials);

// 4. Studio FAQs
publicRouter.get('/faqs', getPublishedFaqs);

// 5. Download Company Profile Deck
publicRouter.get('/download/company-profile', downloadCompanyProfile);

export default publicRouter;
