/**
 * @file /tests/showcase_form.test.js
 * @description Automated regression tests for the Upload Project Brief form in showcase.html.
 * Verifies complete removal of Architectural Drawings Upload, Execution Scope checkboxes,
 * and Project Scope Notes textarea, while preserving core fields, Principal Name, and submission.
 */

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../server/app.js';

describe('Upload Project Brief Form Section Removal & Integrity', () => {
  const showcasePath = path.resolve(process.cwd(), 'public/showcase.html');
  const showcaseHtml = fs.readFileSync(showcasePath, 'utf8');

  it('1. should not contain Architectural Drawings Upload section or dropzone', () => {
    expect(showcaseHtml).not.toContain('Upload Architectural Drawings, Layouts, or RFP');
    expect(showcaseHtml).not.toContain('uploadDropzone');
    expect(showcaseHtml).not.toContain('Click or Drag & Drop Drawing / RFP Files Here');
    expect(showcaseHtml).not.toContain('projectFileInput');
    expect(showcaseHtml).not.toContain('uploadFilePill');
  });

  it('2. should not contain Required Execution Scope section or scope checkboxes', () => {
    expect(showcaseHtml).not.toContain('Required Execution Scope (Check all that apply)');
    expect(showcaseHtml).not.toContain('Turnkey Interior Contracting');
    expect(showcaseHtml).not.toContain('Factory Finished Furniture (Nalasopara)');
    expect(showcaseHtml).not.toContain('MEP & HVAC Air Balancing');
    expect(showcaseHtml).not.toContain('Kitchen Exhaust & Scrubbers');
    expect(showcaseHtml).not.toContain('Civil Contracting & Marble Work');
    expect(showcaseHtml).not.toContain('Preventive Maintenance AMC');
    expect(showcaseHtml).not.toContain('name="project_scope"');
  });

  it('3. should not contain Project Scope Notes label or briefNotes textarea', () => {
    expect(showcaseHtml).not.toContain('Project Scope Notes & Special Requirements');
    expect(showcaseHtml).not.toContain('id="briefNotes"');
    expect(showcaseHtml).not.toContain('Detail any critical handover dates');
  });

  it('4. should preserve Principal Name with placeholder "e.g. Rahul Mehta"', () => {
    expect(showcaseHtml).toContain('Principal Name *');
    expect(showcaseHtml).toContain('placeholder="e.g. Rahul Mehta"');
    expect(showcaseHtml).toContain('id="uploaderName"');
  });

  it('5. should preserve Contact Number, Email, Sector, Location, Area, Consent, and Submit button', () => {
    expect(showcaseHtml).toContain('id="uploaderPhone"');
    expect(showcaseHtml).toContain('id="uploaderEmail"');
    expect(showcaseHtml).toContain('name="upload_sector"');
    expect(showcaseHtml).toContain('id="uploaderLocation"');
    expect(showcaseHtml).toContain('id="uploaderArea"');
    expect(showcaseHtml).toContain('id="uploaderConsent"');
    expect(showcaseHtml).toContain('id="btnSubmitUpload"');
    expect(showcaseHtml).toContain('id="submitUploadText"');
  });

  it('6. should successfully submit project brief without file upload, scopes, or notes', async () => {
    const payload = {
      name: 'Rahul Mehta',
      phone: '9892699850',
      email: 'rahul.mehta@besimdesign.com',
      business_type: 'hotels',
      project_location: 'Bandra Kurla Complex, Mumbai',
      area_sqft: 12000,
      message: 'Project: 40-Key Luxury Resort\nClient/Firm: SP+A Associates\nLocation: Bandra Kurla Complex, Mumbai\nEstimated Area: 12,000 sq.ft',
      source: 'contact_form',
      consent: true,
      honeypot: '',
    };

    const res = await request(app)
      .post('/api/enquiries')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBeDefined();
    expect(res.body.whatsapp_url).toContain('919892699850');
  });
});
