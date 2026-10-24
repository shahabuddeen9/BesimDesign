/**
 * @file /server/routes/admin.routes.js
 * @description Authenticated administrative API routes for CRM leads,
 * portfolio management, reviews, clients, file uploads, and analytics.
 */

import fs from 'fs';
import { Router } from 'express';
import {
  deleteEnquiry,
  exportEnquiriesCsv,
  getEnquiries,
  getEnquiryById,
  updateEnquiry,
} from '../controllers/enquiry.controller.js';
import {
  addProjectPhotos,
  createProject,
  deleteProject,
  deleteProjectPhoto,
  getAllProjects,
  reorderProjects,
  setProjectCoverPhoto,
  updateProject,
} from '../controllers/project.controller.js';
import { getStats } from '../controllers/stats.controller.js';
import {
  createClient,
  deleteClient,
  getAllClients,
  updateClient,
} from '../controllers/client.controller.js';
import {
  createTestimonial,
  deleteTestimonial,
  getAllTestimonials,
  updateTestimonial,
} from '../controllers/testimonial.controller.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { uploadImage } from '../middleware/upload.js';
import AppError from '../utils/AppError.js';

export const adminRouter = Router();

// Protect ALL admin routes with JWT authentication
adminRouter.use(authenticateAdmin);

// ==========================================
// 1. CRM ENQUIRIES & LEADS
// ==========================================
// CSV export MUST precede parameterized /:id route
adminRouter.get('/enquiries/export.csv', exportEnquiriesCsv);
adminRouter.get('/enquiries', getEnquiries);
adminRouter.get('/enquiries/:id', getEnquiryById);
adminRouter.patch('/enquiries/:id', updateEnquiry);
adminRouter.delete('/enquiries/:id', deleteEnquiry);

// ==========================================
// 2. PORTFOLIO PROJECTS CRUD & PHOTOS
// ==========================================
adminRouter.get('/projects', getAllProjects);
adminRouter.post('/projects', createProject);
adminRouter.post('/projects/reorder', reorderProjects);
adminRouter.post('/projects/:id/photos', addProjectPhotos);
adminRouter.delete('/projects/:id/photos', deleteProjectPhoto);
adminRouter.patch('/projects/:id/photos/cover', setProjectCoverPhoto);
adminRouter.patch('/projects/:id', updateProject);
adminRouter.delete('/projects/:id', deleteProject);

// ==========================================
// 2.5 CLIENTS & BRANDS CRUD
// ==========================================
adminRouter.get('/clients', getAllClients);
adminRouter.post('/clients', createClient);
adminRouter.patch('/clients/:id', updateClient);
adminRouter.delete('/clients/:id', deleteClient);

// ==========================================
// 3. TESTIMONIALS CRUD
// ==========================================
adminRouter.get('/testimonials', getAllTestimonials);
adminRouter.post('/testimonials', createTestimonial);
adminRouter.patch('/testimonials/:id', updateTestimonial);
adminRouter.delete('/testimonials/:id', deleteTestimonial);

// ==========================================
// 5. ASSET IMAGE UPLOAD (Single & Multiple: 10MB max, JPG/PNG/WebP)
// ==========================================
adminRouter.post('/upload', uploadImage.single('image'), (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No image file uploaded or file rejected by validator.', 400);
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    let dataUri = null;
    try {
      if (req.file.path && fs.existsSync(req.file.path) && req.file.mimetype.startsWith('image/')) {
        const buf = fs.readFileSync(req.file.path);
        if (buf.length <= 4 * 1024 * 1024) {
          dataUri = `data:${req.file.mimetype};base64,${buf.toString('base64')}`;
        }
      }
    } catch (_) {}

    // When deployed on Vercel or ephemeral serverless, dataUri ensures zero asset loss across container recycles
    const primaryUrl = (process.env.VERCEL || !fileUrl.startsWith('/uploads/')) && dataUri ? dataUri : (dataUri || fileUrl);

    return res.status(200).json({
      success: true,
      message: 'Image uploaded successfully.',
      url: primaryUrl,
      localUrl: fileUrl,
      dataUri: dataUri,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/upload-multiple', uploadImage.array('images', 10), (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new AppError('No image files uploaded or files rejected by validator.', 400);
    }

    const uploaded = req.files.map((f) => {
      const fileUrl = `/uploads/${f.filename}`;
      let dataUri = null;
      try {
        if (f.path && fs.existsSync(f.path) && f.mimetype.startsWith('image/')) {
          const buf = fs.readFileSync(f.path);
          if (buf.length <= 4 * 1024 * 1024) {
            dataUri = `data:${f.mimetype};base64,${buf.toString('base64')}`;
          }
        }
      } catch (_) {}

      const primaryUrl = (process.env.VERCEL || !fileUrl.startsWith('/uploads/')) && dataUri ? dataUri : (dataUri || fileUrl);

      return {
        url: primaryUrl,
        localUrl: fileUrl,
        dataUri: dataUri,
        filename: f.filename,
        size: f.size,
        mimetype: f.mimetype,
      };
    });

    return res.status(200).json({
      success: true,
      message: `${uploaded.length} image(s) uploaded successfully.`,
      files: uploaded,
      urls: uploaded.map((u) => u.url),
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 6. DASHBOARD ANALYTICS & STATS
// ==========================================
adminRouter.get('/stats', getStats);

export default adminRouter;
