/**
 * @file /server/controllers/stats.controller.js
 * @description Controller for aggregating studio CRM statistics, analytics,
 * and company credentials deck download metrics.
 * Supports both PostgreSQL and SQLite persistence.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/index.js';
import logger from '../utils/logger.js';
import { hashIp } from '../utils/sanitize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

/**
 * Admin: Get aggregated CRM analytics
 */
export async function getStats(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    // 1. Total Enquiries
    const totalEnquiriesRow = await db.get('SELECT COUNT(*) as count FROM enquiries');
    const totalEnquiries = Number(totalEnquiriesRow?.count ?? 0);

    // 2. New This Week (last 7 days)
    const newThisWeekRow = await db.get(`
      SELECT COUNT(*) as count
      FROM enquiries
      WHERE datetime(created_at) >= datetime('now', '-7 days')
    `);
    const newThisWeek = Number(newThisWeekRow?.count ?? 0);

    // 3. Breakdown by Source
    const bySourceRows = (await db.all(`
      SELECT source, COUNT(*) as count
      FROM enquiries
      GROUP BY source
    `)) || [];
    const bySource = { contact_form: 0, quote: 0, calculator: 0 };
    bySourceRows.forEach((r) => {
      bySource[r.source] = Number(r.count);
    });

    // 4. Breakdown by Business Type
    const byBusinessTypeRows = (await db.all(`
      SELECT business_type, COUNT(*) as count
      FROM enquiries
      GROUP BY business_type
    `)) || [];
    const byBusinessType = {};
    byBusinessTypeRows.forEach((r) => {
      byBusinessType[r.business_type] = Number(r.count);
    });

    // 5. Breakdown by Pipeline Status
    const byStatusRows = (await db.all(`
      SELECT status, COUNT(*) as count
      FROM enquiries
      GROUP BY status
    `)) || [];
    const byStatus = { new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 };
    byStatusRows.forEach((r) => {
      byStatus[r.status] = Number(r.count);
    });

    // 6. Downloads count
    const totalDownloadsRow = await db.get('SELECT COUNT(*) as count FROM downloads');
    const totalDownloads = Number(totalDownloadsRow?.count ?? 0);

    // 7. Total Projects, Clients, Testimonials
    const totalProjectsRow = await db.get('SELECT COUNT(*) as count FROM projects');
    const totalClientsRow = await db.get('SELECT COUNT(*) as count FROM clients');
    const totalTestimonialsRow = await db.get('SELECT COUNT(*) as count FROM testimonials');

    const totalProjects = Number(totalProjectsRow?.count ?? 0);
    const totalClients = Number(totalClientsRow?.count ?? 0);
    const totalTestimonials = Number(totalTestimonialsRow?.count ?? 0);

    return res.status(200).json({
      success: true,
      stats: {
        totalEnquiries,
        newThisWeek,
        totalDownloads,
        totalProjects,
        totalClients,
        totalTestimonials,
        bySource,
        byBusinessType,
        byStatus,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Public: Track and stream company credentials PDF download
 */
export async function downloadCompanyProfile(req, res, next) {
  try {
    const rawIp = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || req.ip;
    const ipHash = hashIp(rawIp);

    await db.run(
      "INSERT INTO downloads (file_key, ip_hash, created_at) VALUES ('company-profile', ?, datetime('now'))",
      ipHash
    );

    logger.info(`Recorded company profile download from hash: ${ipHash.substring(0, 8)}...`);

    const assetsDir = path.resolve(projectRoot, 'public/assets');
    const pdfPath = path.resolve(assetsDir, 'company-profile.pdf');

    if (!fs.existsSync(pdfPath)) {
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }
      const minimalPdfContent = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF`;
      fs.writeFileSync(pdfPath, minimalPdfContent, 'utf8');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Besim-Design-Company-Profile.pdf"');

    const readStream = fs.createReadStream(pdfPath);
    readStream.pipe(res);
  } catch (error) {
    next(error);
  }
}

export default {
  getStats,
  downloadCompanyProfile,
};
