-- =====================================================================
-- Besim Design PostgreSQL Database Schema
-- Production-ready schema for Supabase / Neon / Cloud SQL PostgreSQL
-- =====================================================================

-- 1. SYSTEM METADATA TABLE (Tracks initialization and migration state)
CREATE TABLE IF NOT EXISTS _system_meta (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ADMINISTRATORS TABLE
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ DEFAULT NULL
);

-- 3. CLIENTS TABLE
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(255) DEFAULT '',
  logo_url TEXT DEFAULT '',
  website_url TEXT DEFAULT '',
  description TEXT DEFAULT '',
  is_featured SMALLINT NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_featured ON clients(is_featured, sort_order);

-- 3.1 DELETED CLIENTS TOMBSTONE TABLE
CREATE TABLE IF NOT EXISTS deleted_clients (
  client_name VARCHAR(255) PRIMARY KEY,
  client_id INTEGER,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TESTIMONIALS TABLE
CREATE TABLE IF NOT EXISTS testimonials (
  id SERIAL PRIMARY KEY,
  client_name VARCHAR(255) NOT NULL,
  business_type VARCHAR(255) NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT NOT NULL,
  is_published SMALLINT NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_testimonials_published ON testimonials(is_published, sort_order);

-- 4.1 DELETED TESTIMONIALS TOMBSTONE TABLE
CREATE TABLE IF NOT EXISTS deleted_testimonials (
  id SERIAL PRIMARY KEY,
  testimonial_id INTEGER,
  client_name VARCHAR(255),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PROJECTS TABLE
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL,
  client_name VARCHAR(255) DEFAULT '',
  location VARCHAR(255) DEFAULT '',
  area_sqft INTEGER DEFAULT 0,
  description TEXT NOT NULL,
  scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_url TEXT NOT NULL,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_featured SMALLINT NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
CREATE INDEX IF NOT EXISTS idx_projects_published ON projects(is_published, sort_order);

-- 5.1 DELETED PROJECTS TOMBSTONE TABLE
CREATE TABLE IF NOT EXISTS deleted_projects (
  id SERIAL PRIMARY KEY,
  project_id INTEGER,
  slug VARCHAR(255),
  title VARCHAR(255),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A slug is a durable identity for a deleted project. The partial index permits
-- multiple tombstones without a known slug while allowing safe ON CONFLICT handling.
CREATE UNIQUE INDEX IF NOT EXISTS idx_deleted_projects_slug_unique
  ON deleted_projects (slug)
  WHERE slug IS NOT NULL;

-- 6. ENQUIRIES TABLE
CREATE TABLE IF NOT EXISTS enquiries (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  business_type VARCHAR(100) NOT NULL,
  project_location VARCHAR(255) DEFAULT '',
  area_sqft INTEGER NOT NULL DEFAULT 0,
  message TEXT DEFAULT '',
  source VARCHAR(50) NOT NULL DEFAULT 'contact_form',
  calculator_data JSONB DEFAULT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'new',
  admin_notes TEXT DEFAULT '',
  consent_given SMALLINT NOT NULL DEFAULT 1,
  ip_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
CREATE INDEX IF NOT EXISTS idx_enquiries_source ON enquiries(source);
CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries(created_at);

-- 7. DOWNLOADS TABLE
CREATE TABLE IF NOT EXISTS downloads (
  id SERIAL PRIMARY KEY,
  file_key VARCHAR(100) NOT NULL,
  ip_hash VARCHAR(255) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_downloads_file ON downloads(file_key);
