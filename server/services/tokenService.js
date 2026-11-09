/**
 * @file /server/services/tokenService.js
 * @description Secure token service handling:
 * 1. Access-token and refresh-token signing and verification
 * 2. Persistent token revocation and blacklist checking across server restarts & multi-instance Vercel serverless
 * 3. Refresh-token rotation and family revocation on reuse
 * 4. Automatic cleanup of expired revoked tokens
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import db from '../db/index.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';

// Fast local in-memory token revocation and refresh token tracking cache
const revokedTokens = new Map();
const refreshTokens = new Map();

let tablesInitialized = false;

/**
 * Ensures token persistence tables exist in database.
 * Created safely with IF NOT EXISTS without requiring manual migrations.
 */
export async function ensureTokenTables() {
  if (tablesInitialized) return;
  try {
    const isPg = Boolean(db.isPostgres || process.env.DATABASE_URL || env.DATABASE_URL);
    if (isPg) {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
          token_id VARCHAR(64) PRIMARY KEY,
          admin_id INTEGER NOT NULL,
          email VARCHAR(255) NOT NULL,
          family_id VARCHAR(64) NOT NULL,
          is_used SMALLINT NOT NULL DEFAULT 0,
          expires_at BIGINT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_auth_refresh_family ON auth_refresh_tokens(family_id);

        CREATE TABLE IF NOT EXISTS auth_revoked_tokens (
          fingerprint VARCHAR(64) PRIMARY KEY,
          token_id VARCHAR(64),
          expires_at BIGINT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    } else {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
          token_id TEXT PRIMARY KEY,
          admin_id INTEGER NOT NULL,
          email TEXT NOT NULL,
          family_id TEXT NOT NULL,
          is_used INTEGER NOT NULL DEFAULT 0,
          expires_at INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_auth_refresh_family ON auth_refresh_tokens(family_id);

        CREATE TABLE IF NOT EXISTS auth_revoked_tokens (
          fingerprint TEXT PRIMARY KEY,
          token_id TEXT,
          expires_at INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    }
    tablesInitialized = true;
  } catch (err) {
    // If DB is temporarily unavailable or initializing, log and continue with in-memory store
    logger.warn('Could not initialize persistent token tables in database:', err.message);
  }
}

/**
 * Periodically purge expired revoked tokens to prevent unbounded storage growth.
 */
export async function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [key, expiresAt] of revokedTokens.entries()) {
    if (expiresAt <= now) {
      revokedTokens.delete(key);
    }
  }
  for (const [tokenId, record] of refreshTokens.entries()) {
    if (record.expiresAt <= now) {
      refreshTokens.delete(tokenId);
    }
  }

  try {
    await ensureTokenTables();
    await db.run('DELETE FROM auth_refresh_tokens WHERE expires_at <= ?', now);
    await db.run('DELETE FROM auth_revoked_tokens WHERE expires_at <= ?', now);
    db.persist?.();
  } catch (_) {}
}

// Run cleanup every 15 minutes
setInterval(cleanupExpiredTokens, 15 * 60 * 1000).unref();

/**
 * Generates an SHA-256 fingerprint for a token to store in revocation set without keeping the full string.
 */
export function getTokenFingerprint(token) {
  return crypto.createHash('sha256').update(String(token).trim()).digest('hex');
}

/**
 * Signs a short-lived access token (default 1 hour).
 */
export function signAccessToken(payload, expiresIn = '1h') {
  const jti = crypto.randomBytes(16).toString('hex');
  return jwt.sign(
    { ...payload, jti, type: 'access' },
    env.JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Signs a refresh token associated with a persistent token family.
 */
export function signRefreshToken(payload, familyId = null, expiresIn = '7d') {
  const tokenId = crypto.randomBytes(24).toString('hex');
  const tokenFamily = familyId || crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  // 1. In-memory cache
  refreshTokens.set(tokenId, {
    adminId: payload.id,
    email: payload.email,
    familyId: tokenFamily,
    isUsed: false,
    expiresAt,
  });

  // 2. Persistent storage (asynchronously writes to database)
  ensureTokenTables().then(async () => {
    try {
      await db.run(
        `INSERT INTO auth_refresh_tokens (token_id, admin_id, email, family_id, is_used, expires_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
        tokenId,
        payload.id || 0,
        payload.email || '',
        tokenFamily,
        expiresAt
      );
      db.persist?.();
    } catch (err) {
      logger.warn('Failed to persist refresh token to database:', err.message);
    }
  }).catch(() => {});

  const token = jwt.sign(
    { id: payload.id, email: payload.email, jti: tokenId, familyId: tokenFamily, type: 'refresh' },
    env.JWT_SECRET,
    { expiresIn }
  );

  return { token, tokenId, familyId: tokenFamily };
}

/**
 * Checks if a token has been revoked, querying both memory cache and persistent database.
 */
export async function isTokenRevoked(token) {
  if (!token) return true;
  const fingerprint = getTokenFingerprint(token);
  if (revokedTokens.has(fingerprint)) return true;

  try {
    const decoded = jwt.decode(token);
    if (decoded && decoded.jti && revokedTokens.has(decoded.jti)) {
      return true;
    }

    await ensureTokenTables();
    const row = await db.get(
      'SELECT fingerprint FROM auth_revoked_tokens WHERE fingerprint = ? OR token_id = ?',
      fingerprint,
      decoded?.jti || ''
    );
    if (row) {
      revokedTokens.set(fingerprint, Date.now() + 7 * 24 * 60 * 60 * 1000);
      return true;
    }
  } catch (_) {}

  return false;
}

/**
 * Verifies an access token and checks revocation list synchronously.
 */
export function verifyAccessToken(token) {
  if (!token) throw new AppError('No token provided.', 401);

  const fingerprint = getTokenFingerprint(token);
  if (revokedTokens.has(fingerprint)) {
    throw new AppError('Session has been revoked or logged out.', 401);
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (decoded.jti && revokedTokens.has(decoded.jti)) {
      throw new AppError('Session has been revoked or logged out.', 401);
    }
    return decoded;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Session expired. Please log in again.', 401);
    }
    throw new AppError('Invalid or corrupted authentication credentials.', 401);
  }
}

/**
 * Rotates a refresh token persistently.
 * If a previously used refresh token is presented again (reuse attack), revokes the entire token family!
 */
export async function rotateRefreshToken(token) {
  if (!token) throw new AppError('Refresh token required.', 401);

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    throw new AppError('Invalid or expired refresh token.', 401);
  }

  if (decoded.type !== 'refresh' || !decoded.jti) {
    throw new AppError('Invalid refresh token type.', 401);
  }

  await ensureTokenTables();

  // 1. Retrieve token record from memory cache or persistent database
  let record = refreshTokens.get(decoded.jti);
  if (!record) {
    try {
      const dbRow = await db.get(
        'SELECT * FROM auth_refresh_tokens WHERE token_id = ?',
        decoded.jti
      );
      if (dbRow) {
        record = {
          adminId: dbRow.admin_id,
          email: dbRow.email,
          familyId: dbRow.family_id,
          isUsed: Boolean(dbRow.is_used),
          expiresAt: Number(dbRow.expires_at),
        };
        refreshTokens.set(decoded.jti, record);
      }
    } catch (_) {}
  }

  // If token record doesn't exist or expired
  if (!record || record.expiresAt <= Date.now()) {
    throw new AppError('Invalid or expired refresh token.', 401);
  }

  // 2. REUSE DETECTION: If token was already marked as used, someone is attempting to reuse it!
  // Revoke the entire family immediately across all server instances to protect the user account.
  if (record.isUsed) {
    await revokeTokenFamily(record.familyId);
    throw new AppError('Compromised session detected. All sessions in this family have been revoked.', 401);
  }

  // 3. Mark current refresh token as used in memory and persistent database
  record.isUsed = true;
  refreshTokens.set(decoded.jti, record);
  try {
    await db.run('UPDATE auth_refresh_tokens SET is_used = 1 WHERE token_id = ?', decoded.jti);
    db.persist?.();
  } catch (err) {
    logger.warn('Failed to mark refresh token as used in database:', err.message);
  }

  // 4. Issue new access token and rotated refresh token
  const newAccessToken = signAccessToken({ id: record.adminId, email: record.email });
  const newRefreshTokenObj = signRefreshToken(
    { id: record.adminId, email: record.email },
    record.familyId
  );

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshTokenObj.token,
    admin: { id: record.adminId, email: record.email },
  };
}

/**
 * Revokes an individual token (e.g. upon logout) persistently.
 */
export async function revokeToken(token) {
  if (!token) return;
  const fingerprint = getTokenFingerprint(token);
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

  revokedTokens.set(fingerprint, expiry);

  let jti = null;
  let familyId = null;
  try {
    const decoded = jwt.decode(token);
    if (decoded) {
      if (decoded.jti) {
        jti = decoded.jti;
        revokedTokens.set(jti, expiry);
      }
      if (decoded.familyId) {
        familyId = decoded.familyId;
      }
    }
  } catch (_) {}

  try {
    await ensureTokenTables();
    await db.run(
      'INSERT INTO auth_revoked_tokens (fingerprint, token_id, expires_at) VALUES (?, ?, ?)',
      fingerprint,
      jti,
      expiry
    );
    if (familyId) {
      await revokeTokenFamily(familyId);
    }
    db.persist?.();
  } catch (err) {
    logger.warn('Failed to persist revoked token to database:', err.message);
  }
}

/**
 * Revokes all refresh tokens in a given family (called upon reuse detection or global logout).
 */
export async function revokeTokenFamily(familyId) {
  if (!familyId) return;

  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

  for (const [tokenId, record] of refreshTokens.entries()) {
    if (record.familyId === familyId) {
      refreshTokens.delete(tokenId);
      revokedTokens.set(tokenId, expiry);
    }
  }

  try {
    await ensureTokenTables();
    await db.run('UPDATE auth_refresh_tokens SET is_used = 1 WHERE family_id = ?', familyId);
    db.persist?.();
  } catch (err) {
    logger.warn(`Failed to revoke token family ${familyId} in database:`, err.message);
  }
}

/**
 * Clears all tokens (for test cleanup).
 */
export async function resetTokenStore() {
  revokedTokens.clear();
  refreshTokens.clear();
  try {
    await ensureTokenTables();
    await db.run('DELETE FROM auth_refresh_tokens');
    await db.run('DELETE FROM auth_revoked_tokens');
    db.persist?.();
  } catch (_) {}
}

export default {
  ensureTokenTables,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  isTokenRevoked,
  rotateRefreshToken,
  revokeToken,
  revokeTokenFamily,
  resetTokenStore,
  cleanupExpiredTokens,
  getTokenFingerprint,
};
