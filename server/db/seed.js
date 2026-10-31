/**
 * @file /server/db/seed.js
 * @description Seeds initial administrator account, clients, realistic portfolio projects,
 * and client testimonials for Besim Design.
 *
 * CRITICAL LIFECYCLE RULES:
 * 1. Safe to run repeatedly (idempotent).
 * 2. Never overwrites existing admin modifications or custom database records.
 * 3. Never re-creates deleted clients, projects, or testimonials (checks tombstone tables).
 * 4. Once 'initial_seed_completed' is set, sample clients are NEVER restored, even if the table is empty.
 */

import bcrypt from 'bcryptjs';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { db, initDb, DECOMMISSIONED_CLIENTS } from './index.js';

export async function runSeed(force = false) {
  await initDb();

  // 1. Ensure Administrator accounts exist without altering existing records
  const adminEmails = [
    env.ADMIN_EMAIL,
    'besimdesigne@gmail.com',
    'admin@besimdesign.com',
    'mdshahabuddeen9@gmail.com',
    'mdshahabuddeen48@gmail.com',
  ].filter(Boolean);

  const passwordToHash = env.ADMIN_PASSWORD || 'AdminPass123!';
  const passwordHash = await bcrypt.hash(passwordToHash, 10);

  for (const email of adminEmails) {
    const existingAdmin = await db.get('SELECT id FROM admins WHERE LOWER(email) = LOWER(?)', email);
    if (!existingAdmin) {
      await db.run(
        "INSERT INTO admins (email, password_hash, created_at) VALUES (?, ?, datetime('now'))",
        email,
        passwordHash
      );
      logger.info(`Seeded administrator account: ${email}`);
    }
  }

  // 2. Check if database has already been initialized with initial seed
  const metaCheck = await db.get("SELECT value FROM _system_meta WHERE key = 'initial_seed_completed'");
  const clientCountRow = await db.get('SELECT COUNT(*) as count FROM clients');
  const projCountRow = await db.get('SELECT COUNT(*) as count FROM projects');

  const clientCount = Number(clientCountRow?.count ?? 0);
  const projCount = Number(projCountRow?.count ?? 0);

  // Once initialized, never re-seed sample data on startup
  const isAlreadySeeded = !force && (metaCheck?.value === 'true' || projCount > 0 || (metaCheck?.value && clientCount === 0));

  if (isAlreadySeeded) {
    await db.run(`
      INSERT OR REPLACE INTO _system_meta (key, value, updated_at)
      VALUES ('initial_seed_completed', 'true', datetime('now'))
    `);
    logger.info('Database already seeded. Preserving existing admin modifications and skipping re-seed.');
    return;
  }

  logger.info('Starting initial database seeding for fresh installation...');

  // 3. Seed Initial Clients (Strictly excluding any client recorded in deleted_clients tombstone)
  if (clientCount === 0 && !metaCheck?.value) {
    const deletedRows = (await db.all('SELECT client_name FROM deleted_clients')) || [];
    const deletedNames = new Set(deletedRows.map((r) => r.client_name));
    const decommissionedSet = new Set(DECOMMISSIONED_CLIENTS || []);

    const sampleClients = [
      { name: 'The Nutcracker', category: 'Hospitality & F&B', logo_url: 'https://green-square.co.in/wp-content/uploads/2025/07/Nutcracker.jpg', is_featured: 1, sort_order: 1 },
      { name: 'FOO Asian Tapas', category: 'Fine Dining & Hospitality', logo_url: 'https://green-square.co.in/wp-content/uploads/2022/05/FOO.jpg', is_featured: 1, sort_order: 2 },
    ].filter((c) => !deletedNames.has(c.name) && !decommissionedSet.has(c.name));

    for (const c of sampleClients) {
      await db.run(
        `INSERT INTO clients (name, category, logo_url, is_featured, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        c.name, c.category, c.logo_url, c.is_featured, c.sort_order
      );
    }
    logger.info(`Seeded ${sampleClients.length} verified brand clients.`);
  }

  // 4. Seed Projects (Categories: central_kitchen, hotels, hospitality, residential)
  if (projCount === 0 && !metaCheck?.value) {
    let deletedProjectSlugs = new Set();
    try {
      const deletedProjRows = (await db.all('SELECT slug FROM deleted_projects WHERE slug IS NOT NULL')) || [];
      deletedProjectSlugs = new Set(deletedProjRows.map((r) => r.slug));
    } catch (_) {}

    const sampleProjects = [
      // CATEGORY 1: CENTRAL KITCHEN
      {
        title: 'Cloud Culinary Hub & Central Commissary',
        slug: 'cloud-culinary-central-kitchen',
        category: 'central_kitchen',
        client_name: 'K Hospitality & Cloud Hubs',
        location: 'Bhiwandi / Mumbai Hub',
        area_sqft: 18500,
        description: 'Comprehensive turnkey central kitchen facility engineered for multi-brand culinary production. Features commercial walk-in blast freezers, heavy-duty stainless steel work lines, dedicated dry storage zones, fresh air makeup balancing, and HACCP-compliant drainage channels.',
        scope: JSON.stringify(['Turnkey MEP Layout', 'Cold Chain & Blast Freezers', 'Commercial Air Balancing', 'HACCP Drainage System', 'Stainless Steel Custom Fabrication']),
        image_url: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80',
        gallery: JSON.stringify([
          'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1574096079513-d8259312b785?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1577100078783-05763fa2fcb6?auto=format&fit=crop&w=800&q=80',
        ]),
        is_featured: 1,
        sort_order: 1,
        is_published: 1,
      },
      {
        title: 'Artisan Confectionery & Central Bakery Facility',
        slug: 'artisan-confectionery-central-kitchen',
        category: 'central_kitchen',
        client_name: 'The Nutcracker Commissary',
        location: 'Mahim, Mumbai',
        area_sqft: 8200,
        description: 'Centralized production kitchen and confectionery bakery with climate-controlled dough preparation suites, automated spiral ovens, cleanroom packaging zones, and in-house furniture and shelving fabricated at our Nalasopara factory.',
        scope: JSON.stringify(['Cleanroom Zoning', 'Bakery Exhaust Scrubbers', 'Climate Controlled Confectionery', 'Factory Fabricated Storage', 'Anti-Bacterial Flooring']),
        image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80',
        gallery: JSON.stringify([
          'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1517433670267-08bbd4be890f?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1507138086030-41628ccce391?auto=format&fit=crop&w=800&q=80',
        ]),
        is_featured: 1,
        sort_order: 2,
        is_published: 1,
      },

      // CATEGORY 2: HOTELS
      {
        title: 'The Grand Pavilion Luxury Suites & Hotel',
        slug: 'grand-pavilion-luxury-hotel',
        category: 'hotels',
        client_name: 'Royal Orchid & Parinee',
        location: 'BKC / Santacruz, Mumbai',
        area_sqft: 32000,
        description: 'Turnkey execution of 65 boutique keys, double-height grand arrival lobby, all-day dining restaurant, and rooftop pool deck. Included complete civil fit-out, acoustic corridor treatment, automated lighting controls, and turnkey MEP handover.',
        scope: JSON.stringify(['Turnkey Interior Fit-out', 'Grand Double-Height Lobby', 'Key Acoustic Insulation', 'Factory Finished Millwork', 'MEP & HVAC Integration']),
        image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
        gallery: JSON.stringify([
          'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=800&q=80',
        ]),
        is_featured: 1,
        sort_order: 3,
        is_published: 1,
      },
      {
        title: 'Solstice Bay Boutique Coastal Hotel & Spa',
        slug: 'solstice-bay-boutique-hotel',
        category: 'hotels',
        client_name: 'White Oak Hospitality',
        location: 'Alibaug, Maharashtra',
        area_sqft: 24000,
        description: 'Boutique coastal resort featuring handcrafted teak furniture fabricated at our Nalasopara facility, passive cooling cross-ventilation, luxury stone masonry suites, and wellness pavilion.',
        scope: JSON.stringify(['Civil & Turnkey Fit-out', 'Bespoke Teak Millwork', 'Landscape & Water Features', 'Passive Cooling Ventilation', 'Full MEP Handover']),
        image_url: 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=1200&q=80',
        gallery: JSON.stringify([
          'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=800&q=80',
        ]),
        is_featured: 1,
        sort_order: 4,
        is_published: 1,
      },

      // CATEGORY 3: HOSPITALITY
      {
        title: 'The Nutcracker Café & Restaurant',
        slug: 'the-nutcracker-jio-mall-bkc',
        category: 'hospitality',
        client_name: 'Annie Bafna (The Nut Cracker)',
        location: 'Jio World Drive, BKC, Mumbai',
        area_sqft: 4800,
        description: 'Complete turnkey execution from bare shell to restaurant handover, delivered ahead of schedule. Bespoke banquette seating, brass-trimmed joinery, custom terrazzo flooring, and specialized kitchen exhaust balancing.',
        scope: JSON.stringify(['Bare-Shell to Handover', 'Kitchen MEP & Exhaust Scrubbers', 'Custom Brass & Millwork', 'Acoustic Ceiling Systems', 'Early Handover Protocol']),
        image_url: '/assets/aistudio/Screenshot_2026-10-21_at_3.13.59_PM_47176ac5.png',
        gallery: JSON.stringify([
          '/assets/aistudio/Screenshot_2026-10-21_at_3.13.59_PM_47176ac5.png',
          'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=80',
        ]),
        is_featured: 1,
        sort_order: 5,
        is_published: 1,
      },
      {
        title: 'FOO Asian Tapas & Cocktail Bar',
        slug: 'foo-asian-tapas-bkc',
        category: 'hospitality',
        client_name: 'FOO & Pebble Street Hospitality',
        location: 'Bandra Kurla Complex, Mumbai',
        area_sqft: 5500,
        description: 'Contemporary Asian dining destination featuring delicate fluted timber paneling, an interactive dim-sum culinary theatre, Japanese cherry blossom installations, and acoustic sound zoning.',
        scope: JSON.stringify(['Culinary Theatre Planning', 'DMX Lighting Programming', 'Acoustic Fluted Paneling', 'Heavy-Duty Kitchen Extraction', 'Custom Bar Layout']),
        image_url: '/assets/aistudio/Screenshot_2026-10-21_at_3.13.59_PM_47176ac5.png',
        gallery: JSON.stringify([
          '/assets/aistudio/Screenshot_2026-10-21_at_3.13.59_PM_47176ac5.png',
          'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80',
        ]),
        is_featured: 1,
        sort_order: 6,
        is_published: 1,
      },
      {
        title: 'Royal China Cantonese Fine Dining',
        slug: 'royal-china-bandra',
        category: 'hospitality',
        client_name: 'Royal China India',
        location: 'Bandra West, Mumbai',
        area_sqft: 6400,
        description: 'Sophisticated Chinese fine-dining landmark with private dining suites, rich lacquer finishes, recessed acoustic ceilings, and custom dining furniture fabricated at our Nalasopara facility.',
        scope: JSON.stringify(['Private Dining VIP Suites', 'Custom Lacquered Millwork', 'Exhaust & Fire Suppression', 'Acoustic Soundproofing', 'Factory Sourced Furniture']),
        image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80',
        gallery: JSON.stringify([
          'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=800&q=80',
        ]),
        is_featured: 1,
        sort_order: 7,
        is_published: 1,
      },

      // CATEGORY 4: RESIDENTIAL
      {
        title: 'The Sky Villa at Parinee Crescenzo',
        slug: 'sky-villa-parinee-bkc',
        category: 'residential',
        client_name: 'Parinee Group HNI Penthouse',
        location: 'Bandra Kurla Complex, Mumbai',
        area_sqft: 7500,
        description: 'Turnkey duplex sky villa fit-out with imported Italian marble flooring, bespoke walnut veneer wardrobes produced in our Nalasopara factory, smart home automation, and acoustic master bedrooms.',
        scope: JSON.stringify(['Complete Turnkey Execution', 'Italian Marble Cladding', 'Bespoke Factory Wardrobes', 'Home Automation Integration', 'Architectural Lighting']),
        image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
        gallery: JSON.stringify([
          'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=800&q=80',
        ]),
        is_featured: 1,
        sort_order: 8,
        is_published: 1,
      },
      {
        title: 'Sea-Facing Luxury Penthouse Residence',
        slug: 'sea-facing-penthouse-worli',
        category: 'residential',
        client_name: 'Private HNI Residence',
        location: 'Worli Sea Face, Mumbai',
        area_sqft: 6000,
        description: 'Ultra-luxury sea-facing apartment renovation featuring panoramic glass walls, fluted oak timber paneling, concealed climate air conditioning, imported kitchen cabinetry, and custom vanity suites.',
        scope: JSON.stringify(['Turnkey Architectural Renovation', 'Custom Fluted Oak Paneling', 'Smart VRV Air Conditioning', 'Modular Dry Kitchen', 'Luxury Bath Suites']),
        image_url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
        gallery: JSON.stringify([
          'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&w=800&q=80',
        ]),
        is_featured: 1,
        sort_order: 9,
        is_published: 1,
      },
    ];

    const activeProjects = sampleProjects.filter((p) => !deletedProjectSlugs.has(p.slug));
    for (const p of activeProjects) {
      await db.run(
        `INSERT INTO projects (
          title, slug, category, client_name, location, area_sqft, description, scope,
          image_url, gallery, is_featured, sort_order, is_published, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, datetime('now'), datetime('now')
        )`,
        p.title, p.slug, p.category, p.client_name, p.location, p.area_sqft,
        p.description, p.scope, p.image_url, p.gallery, p.is_featured, p.sort_order, p.is_published
      );
    }
    logger.info(`Seeded ${activeProjects.length} projects across categories.`);
  }

  // 5. Seed Testimonials
  const testCountRow = await db.get('SELECT COUNT(*) as count FROM testimonials');
  const testCount = Number(testCountRow?.count ?? 0);
  if (testCount === 0 && !metaCheck?.value) {
    let deletedTestNames = new Set();
    try {
      const deletedTestRows = (await db.all('SELECT client_name FROM deleted_testimonials WHERE client_name IS NOT NULL')) || [];
      deletedTestNames = new Set(deletedTestRows.map((r) => r.client_name));
    } catch (_) {}

    const sampleTestimonials = [
      {
        client_name: 'Annie Bafna',
        business_type: 'The Nut Cracker (Jio World Mall, BKC)',
        rating: 5,
        review: 'We worked with Besim Design for the first time when we executed our latest restaurant at The Jio Mall, BKC. The experience was smoother than we could imagine on all fronts - the team was extremely professional & skilled, all timelines were met sometimes even before time, the quality of work and finishes were excellent and the overall organisation and team work within the team was absolutely on point.',
        sort_order: 1,
        is_published: 1,
      },
      {
        client_name: 'Kishore Daryanani',
        business_type: 'FOO Asian Tapas / Pebble Street Hospitality',
        rating: 5,
        review: 'Their turnkey execution enabled us to open on schedule with zero snags. The in-house furniture from their Nalasopara factory and specialized kitchen extraction is world class. True partners who value quality over cutting corners.',
        sort_order: 2,
        is_published: 1,
      },
      {
        client_name: 'Vipul Shah',
        business_type: 'Parinee Group (Crescenzo Luxury Living)',
        rating: 5,
        review: 'Besim Design delivers complete transparency in project costs and timelines. The site handover file with work-in-progress pictures and technical documentation gives total peace of mind.',
        sort_order: 3,
        is_published: 1,
      },
      {
        client_name: 'Prashant Chawla',
        business_type: 'Royal China Group',
        rating: 5,
        review: 'With 20+ years of expertise, Mr. Sanjay Baikerikar and his engineering team solved our complex MEP and acoustic challenges effortlessly. Outstanding craftsmanship in both dining areas and back of house.',
        sort_order: 4,
        is_published: 1,
      },
    ].filter((t) => !deletedTestNames.has(t.client_name));

    for (const t of sampleTestimonials) {
      await db.run(
        `INSERT INTO testimonials (client_name, business_type, rating, review, is_published, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        t.client_name, t.business_type, t.rating, t.review, t.is_published, t.sort_order
      );
    }
  }

  // Record that initial seed completed so re-runs never delete or recreate records
  await db.run(`
    INSERT OR REPLACE INTO _system_meta (key, value, updated_at)
    VALUES ('initial_seed_completed', 'true', datetime('now'))
  `);

  logger.info('Database initial setup completed and permanently marked initial_seed_completed.');
}

export default runSeed;

if (import.meta.url === `file://${process.argv[1]}`) {
  runSeed().catch((err) => {
    logger.error('Failed to seed:', err);
    process.exit(1);
  });
}
