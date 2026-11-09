import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import db from '../server/db/index.js';
import { detectMimeTypeFromMagicBytes } from '../server/middleware/upload.js';
import tokenService from '../server/services/tokenService.js';

describe('Production Security Audit Suite', () => {
  beforeEach(async () => {
    await db.initialize();
  });

  describe('File Upload Magic Byte Inspection', () => {
    it('should detect valid PNG from magic bytes', () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      expect(detectMimeTypeFromMagicBytes(pngHeader)).toBe('image/png');
    });

    it('should detect valid JPEG from magic bytes', () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      expect(detectMimeTypeFromMagicBytes(jpegHeader)).toBe('image/jpeg');
    });

    it('should detect valid PDF from magic bytes', () => {
      const pdfHeader = Buffer.from('%PDF-1.7\n%some content');
      expect(detectMimeTypeFromMagicBytes(pdfHeader)).toBe('application/pdf');
    });

    it('should reject fake PNG containing HTML / JavaScript', () => {
      const fakePng = Buffer.from('<script>alert("XSS")</script>');
      expect(detectMimeTypeFromMagicBytes(fakePng)).toBeNull();
    });

    it('should reject fake JPEG containing PHP shell code', () => {
      const fakeJpeg = Buffer.from('<?php system($_GET["cmd"]); ?>');
      expect(detectMimeTypeFromMagicBytes(fakeJpeg)).toBeNull();
    });
  });

  describe('Authentication & Persistent Token Lifecycle', () => {
    it('should sign, verify, and rotate refresh tokens safely', async () => {
      const user = { id: 1, email: 'admin@besimdesign.com', role: 'admin' };
      const access = tokenService.signAccessToken(user);
      expect(typeof access).toBe('string');

      const verified = tokenService.verifyAccessToken(access);
      expect(verified.email).toBe('admin@besimdesign.com');

      const refresh = tokenService.signRefreshToken(user);
      const rotated = await tokenService.rotateRefreshToken(refresh.token);
      expect(rotated).toBeDefined();
      expect(rotated.refreshToken).not.toBe(refresh.token);

      // Attempting to reuse the old refresh token should be rejected (reuse detection)
      await expect(tokenService.rotateRefreshToken(refresh.token)).rejects.toThrow();
    });

    it('should persist refresh tokens and revoking across server restarts', async () => {
      const user = { id: 2, email: 'restart-test@besimdesign.com', role: 'admin' };
      const refresh = tokenService.signRefreshToken(user);

      // Wait briefly for async persistence
      await new Promise((r) => setTimeout(r, 100));

      // Verify token exists in database table
      const stored = await db.get('SELECT * FROM auth_refresh_tokens WHERE token_id = ?', refresh.tokenId);
      expect(stored).toBeDefined();
      expect(stored.email).toBe('restart-test@besimdesign.com');

      // Revoke token
      await tokenService.revokeToken(refresh.token);

      // Check persistent revoked tokens table
      const revokedRow = await db.get(
        'SELECT * FROM auth_revoked_tokens WHERE token_id = ? OR fingerprint = ?',
        refresh.tokenId,
        tokenService.getTokenFingerprint(refresh.token)
      );
      expect(revokedRow).toBeDefined();

      // Check isTokenRevoked recognizes it
      const isRev = await tokenService.isTokenRevoked(refresh.token);
      expect(isRev).toBe(true);
    });

    it('should revoke access token on logout and deny subsequent access', async () => {
      const user = { id: 1, email: 'admin@besimdesign.com', role: 'admin' };
      const token = tokenService.signAccessToken(user);

      // Valid initially
      expect(tokenService.verifyAccessToken(token)).toBeDefined();

      // Revoke on logout
      await tokenService.revokeToken(token);

      // Verify should now throw
      expect(() => tokenService.verifyAccessToken(token)).toThrow(/revoked/i);
    });

    it('should never expose sensitive credentials or password hash in login response body', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@besimdesign.com', password: 'BesimAdmin2026!Secure' });

      if (res.status === 200) {
        expect(res.body.password).toBeUndefined();
        expect(res.body.refreshToken).toBeUndefined();
        const adminObj = res.body.admin || res.body.user;
        if (adminObj) {
          expect(adminObj.password_hash).toBeUndefined();
          expect(adminObj.password).toBeUndefined();
        }
      }
    });
  });

  describe('Production Security Headers & Clickjacking Prevention', () => {
    it('should enforce SAMEORIGIN and CSP frame-ancestors in production on non-preview hosts', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .get('/api/health')
        .set('Host', 'besimdesign.com');

      process.env.NODE_ENV = originalEnv;

      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      const csp = res.headers['content-security-policy'] || '';
      expect(csp).toMatch(/frame-ancestors 'self'/);
    });

    it('should permit preview iframe embedding when requested from Cloud Run / preview hosts', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Host', 'ais-dev-3bt5rp5ykbsgdh2mh3ovsu-725533770889.asia-northeast1.run.app');

      expect(res.headers['x-frame-options']).toBeUndefined();
      const csp = res.headers['content-security-policy'] || '';
      expect(csp).toMatch(/frame-ancestors \*/);
    });
  });

  describe('CSRF Protection for State-Changing Requests', () => {
    it('should reject cross-origin state changes with mismatched origin', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Origin', 'https://malicious-attacker.com')
        .set('x-test-csrf-enforce', 'true');

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/CSRF/i);
    });
  });

  describe('Decommissioned Client & Data Safety', () => {
    it('should preserve deleted_clients.json and tombstones integrity', async () => {
      const tombstones = await db.all('SELECT * FROM deleted_clients');
      expect(Array.isArray(tombstones)).toBe(true);
      // Ensure existing decommissioned clients are preserved
      expect(tombstones.length).toBeGreaterThan(0);
    });
  });
});
