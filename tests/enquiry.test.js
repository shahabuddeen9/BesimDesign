/**
 * @file /tests/enquiry.test.js
 * @description Test suite for public enquiry submission endpoint (/api/enquiries).
 * Tests input validation, Indian phone number verification, honeypot spam protection,
 * and DPDP consent enforcement.
 */

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../server/app.js';

describe('Public Enquiries API (POST /api/enquiries)', () => {
  it('should successfully submit a valid enquiry with correct Indian phone', async () => {
    const payload = {
      name: 'Rohan Sharma',
      phone: '9876543210',
      email: 'rohan.sharma@example.com',
      business_type: 'restaurant',
      project_location: 'Connaught Place, New Delhi',
      area_sqft: 4500,
      message: 'Looking for turnkey interior architecture for our new restaurant.',
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
    expect(typeof res.body.id).toBe('number');
  });

  it('should accept phone numbers with +91 prefix', async () => {
    const payload = {
      name: 'Vikram Mehta',
      phone: '+919812345678',
      email: 'vikram@example.com',
      business_type: 'hotel',
      area_sqft: 15000,
      consent: true,
    };

    const res = await request(app)
      .post('/api/enquiries')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should reject invalid Indian phone numbers (less than 10 digits or starts with 1-5)', async () => {
    const payload = {
      name: 'Anita Roy',
      phone: '1234567890', // invalid: does not start with 6-9
      email: 'anita@example.com',
      business_type: 'bar',
      consent: true,
    };

    const res = await request(app)
      .post('/api/enquiries')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.some((e) => e.field === 'phone')).toBe(true);
  });

  it('should reject submissions where honeypot field is filled (bot detection)', async () => {
    const payload = {
      name: 'Spam Bot',
      phone: '9876543210',
      email: 'bot@spammer.com',
      business_type: 'restaurant',
      honeypot: 'http://spamsite.com', // Filled honeypot
      consent: true,
    };

    const res = await request(app)
      .post('/api/enquiries')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject submissions without explicit consent (DPDP Act compliance)', async () => {
    const payload = {
      name: 'No Consent User',
      phone: '9876543210',
      email: 'user@example.com',
      business_type: 'bar',
      consent: false,
    };

    const res = await request(app)
      .post('/api/enquiries')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.some((e) => e.field === 'consent')).toBe(true);
  });

  it('should reject unallowed business types', async () => {
    const payload = {
      name: 'Test Client',
      phone: '9876543210',
      email: 'test@example.com',
      business_type: 'invalid_type_xyz',
      consent: true,
    };

    const res = await request(app)
      .post('/api/enquiries')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
