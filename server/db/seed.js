/**
 * @file /server/db/seed.js
 * @description Seeds initial administrator account and realistic portfolio projects,
 * client testimonials, and FAQs for MS Fusion Architects.
 * Enforces production security: refuses default admin passwords when NODE_ENV === 'production'.
 */

import bcrypt from 'bcryptjs';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { db, initDb } from './index.js';

export async function runSeed() {
  await initDb();
  logger.info('Starting database seeding...');

  // 1. Validate Admin Password in Production
  if (env.NODE_ENV === 'production' && env.ADMIN_PASSWORD === 'AdminPass123!') {
    logger.error('FATAL: Refusing to seed admin user with default password in production environment!');
    throw new Error('SECURITY VIOLATION: ADMIN_PASSWORD must be changed from the default in production.');
  }

  // 2. Seed Admin User
  const existingAdmin = db.prepare('SELECT id FROM admins WHERE email = ?').get(env.ADMIN_EMAIL);
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
    db.prepare(`
      INSERT INTO admins (email, password_hash, created_at)
      VALUES (?, ?, datetime('now'))
    `).run(env.ADMIN_EMAIL, passwordHash);
    logger.info(`Seeded administrator account: ${env.ADMIN_EMAIL}`);
  } else {
    logger.info(`Admin ${env.ADMIN_EMAIL} already exists. Skipping admin insert.`);
  }

  // 3. Seed Projects
  const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get();
  if (projectCount.count === 0) {
    const sampleProjects = [
      {
        title: 'The Brass Peacock Fine Dining & Lounge',
        slug: 'the-brass-peacock-lounge',
        category: 'restaurant',
        description: 'A luxurious 6,200 sq.ft contemporary Indian fine-dining restaurant featuring handcrafted brass fixtures, custom acoustic ceiling baffles, and an integrated open-hearth culinary theatre.',
        scope: JSON.stringify(['Architectural Space Planning', 'HVAC & Kitchen Exhaust Engineering', 'Acoustic Wall Treatment', 'Custom Brass Lighting Fabrication', 'FF&E Sourcing']),
        image_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
        gallery: JSON.stringify([
          'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=80'
        ]),
        is_featured: 1,
        sort_order: 1,
        is_published: 1,
      },
      {
        title: 'Solstice Sanctuary Boutique Resort & Spa',
        slug: 'solstice-sanctuary-resort',
        category: 'hotel',
        description: '45-key cliffside boutique hotel master plan in Udaipur. Natural stone masonry, energy-efficient passive cooling corridors, infinity pool terrace, and luxury suites tailored for destination hospitality.',
        scope: JSON.stringify(['Master Planning', 'Landscape Integration', 'Civil & MEP Design', 'Interior Architecture', 'Local Stone Craftsmanship']),
        image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
        gallery: JSON.stringify([
          'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80'
        ]),
        is_featured: 1,
        sort_order: 2,
        is_published: 1,
      },
      {
        title: 'Obsidian Taphouse & Speakeasy Bar',
        slug: 'obsidian-taphouse-speakeasy',
        category: 'bar',
        description: 'An immersive 3,800 sq.ft industrial-chic cocktail sanctuary with a 24-tap glycol-chilled beer dispensing system, fluted amber glass accents, and hidden VIP mezzanine.',
        scope: JSON.stringify(['Interior Architecture', 'Bar Flow & Ergonomic Station Design', 'Lighting Programming (DMX)', 'Sound Isolation', 'Fire & Safety Life Safety Audits']),
        image_url: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=80',
        gallery: JSON.stringify([
          'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&w=800&q=80'
        ]),
        is_featured: 1,
        sort_order: 3,
        is_published: 1,
      },
      {
        title: 'Novatech High-Precision Logistics & Processing Hub',
        slug: 'novatech-logistics-hub',
        category: 'industrial',
        description: 'A 55,000 sq.ft pre-engineered steel industrial complex with automated racking aisles, LEED Silver green envelope, insulated clean rooms, and integrated administrative office block.',
        scope: JSON.stringify(['PEB Structural Design', 'Industrial Flooring (FM2 Grade)', 'Dock Leveller & Loading Bay Layout', 'Fire Hydrant & Sprinkler Engineering', 'Green Building Compliance']),
        image_url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80',
        gallery: JSON.stringify([
          'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=800&q=80'
        ]),
        is_featured: 1,
        sort_order: 4,
        is_published: 1,
      },
      {
        title: 'Botanica Rooftop Bistro & Terrace',
        slug: 'botanica-rooftop-bistro',
        category: 'restaurant',
        description: 'Biophilic 4,500 sq.ft rooftop dining pavilion with retractable glass pergolas, panoramic skyline views, living moss feature walls, and high-efficiency commercial kitchen layout.',
        scope: JSON.stringify(['Rooftop Structural Load Calculation', 'Biophilic Planting Integration', 'All-Weather Canopy Design', 'Commercial Kitchen Planning']),
        image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80',
        gallery: JSON.stringify([
          'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=80'
        ]),
        is_featured: 0,
        sort_order: 5,
        is_published: 1,
      },
      {
        title: 'The Foundry Craft Microbrewery & Gastropub',
        slug: 'the-foundry-craft-brewery',
        category: 'bar',
        description: 'A converted warehouse featuring visible 1000L stainless brewing vessels, exposed brickwork, polished concrete floors, and custom timber communal tables.',
        scope: JSON.stringify(['Brewery Equipment Layout', 'Heavy Drainage & Chemical-Resistant Flooring', 'Atmospheric Lighting', 'Acoustics & Ventilation']),
        image_url: 'https://images.unsplash.com/photo-1574096079513-d8259312b785?auto=format&fit=crop&w=1200&q=80',
        gallery: JSON.stringify([
          'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=800&q=80'
        ]),
        is_featured: 0,
        sort_order: 6,
        is_published: 1,
      }
    ];

    const insertProj = db.prepare(`
      INSERT INTO projects (title, slug, category, description, scope, image_url, gallery, is_featured, sort_order, is_published, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    for (const p of sampleProjects) {
      insertProj.run(p.title, p.slug, p.category, p.description, p.scope, p.image_url, p.gallery, p.is_featured, p.sort_order, p.is_published);
    }
    logger.info(`Seeded ${sampleProjects.length} commercial architecture projects.`);
  }

  // 4. Seed Testimonials
  const testCount = db.prepare('SELECT COUNT(*) as count FROM testimonials').get();
  if (testCount.count === 0) {
    const sampleTestimonials = [
      {
        client_name: 'Rajeev Malhotra',
        business_type: 'The Brass Peacock Hospitality Group',
        rating: 5,
        review: 'MS Fusion transformed our flagship property from an empty shell into one of the city’s highest-grossing dining spaces. Their mastery of kitchen MEP workflow and acoustic dampening kept our covers high and our operations completely silent.',
        sort_order: 1,
        is_published: 1,
      },
      {
        client_name: 'Ananya Singhania',
        business_type: 'Solstice Luxury Resorts',
        rating: 5,
        review: 'Working with MS Fusion on our cliffside resort was effortless. Their 3D walkthroughs were millimeter-accurate, and their contractor oversight saved us over ₹35 lakhs in civil rework costs.',
        sort_order: 2,
        is_published: 1,
      },
      {
        client_name: 'Vikramaditya Chawla',
        business_type: 'Obsidian Nightlife & Speakeasies',
        rating: 5,
        review: 'The bar flow ergonomics they designed doubled our bartender ticket speed on weekend rushes. Guests are consistently awestruck by the brass fluting and dramatic lighting.',
        sort_order: 3,
        is_published: 1,
      },
      {
        client_name: 'Harpreet Singh Sethi',
        business_type: 'Novatech Supply Chain Logistics',
        rating: 5,
        review: 'On-time delivery of a 55,000 sq.ft industrial facility during monsoon season is nearly unheard of. MS Fusion managed statutory approvals, PEB erection, and FM2 flooring without a single safety incident.',
        sort_order: 4,
        is_published: 1,
      }
    ];

    const insertTestimonial = db.prepare(`
      INSERT INTO testimonials (client_name, business_type, rating, review, is_published, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    for (const t of sampleTestimonials) {
      insertTestimonial.run(t.client_name, t.business_type, t.rating, t.review, t.is_published, t.sort_order);
    }
    logger.info(`Seeded ${sampleTestimonials.length} verified testimonials.`);
  }

  // 5. Seed FAQs
  const faqCount = db.prepare('SELECT COUNT(*) as count FROM faqs').get();
  if (faqCount.count === 0) {
    const sampleFaqs = [
      {
        question: 'What is MS Fusion’s typical turnaround time from concept to handover?',
        answer: 'For boutique hospitality spaces (3,000–6,000 sq.ft), architectural concept to tender documentation takes 3 to 5 weeks. Fit-out execution runs 8 to 14 weeks depending on kitchen MEP complexity. For large industrial PEB builds, turnaround averages 5 to 7 months.',
        sort_order: 1,
        is_published: 1,
      },
      {
        question: 'Do you provide turnkey architectural and fit-out execution or only design?',
        answer: 'We provide both models. Our Turnkey Delivery package covers end-to-end design, municipal clearances, procurement, MEP contracting, and site supervision with single-point accountability. We also offer Design & PMC consulting for clients with existing general contractors.',
        sort_order: 2,
        is_published: 1,
      },
      {
        question: 'How do you handle commercial kitchen, bar flow, and statutory fire clearances?',
        answer: 'Commercial hospitality requires specialized engineering. Our in-house MEP engineers design kitchen exhaust scrubbers, fresh-air intake balancing, grease traps, fire suppression (NFPA / NBC norms), and bar plumbing to guarantee compliance with municipal and health authorities on first inspection.',
        sort_order: 3,
        is_published: 1,
      },
      {
        question: 'What areas and regions do you service across India?',
        answer: 'Our principal studio handles projects nationwide. We have completed active hospitality and industrial projects in Delhi NCR, Mumbai, Bengaluru, Goa, Udaipur, Pune, and Hyderabad with dedicated on-site project management teams.',
        sort_order: 4,
        is_published: 1,
      },
      {
        question: 'How does your Space & Budget Estimation Calculator work?',
        answer: 'Our interactive calculator uses empirical construction and interior fit-out benchmarks tailored for India (Grade-A restaurants: ₹2,200–₹4,200/sq.ft; Boutique hotels: ₹3,500–₹6,000/sq.ft; Industrial shells: ₹1,200–₹2,000/sq.ft). Submitting your parameters produces a detailed breakdown with scope itemization.',
        sort_order: 5,
        is_published: 1,
      }
    ];

    const insertFaq = db.prepare(`
      INSERT INTO faqs (question, answer, sort_order, is_published, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    for (const f of sampleFaqs) {
      insertFaq.run(f.question, f.answer, f.sort_order, f.is_published);
    }
    logger.info(`Seeded ${sampleFaqs.length} architectural FAQs.`);
  }

  // 6. Seed Sample Enquiries for CRM testing
  const enquiryCount = db.prepare('SELECT COUNT(*) as count FROM enquiries').get();
  if (enquiryCount.count === 0) {
    const sampleEnquiries = [
      {
        name: 'Kabir Oberoi',
        phone: '9820145678',
        email: 'kabir@oberoihospitality.in',
        business_type: 'restaurant',
        project_location: 'Indiranagar, Bengaluru',
        area_sqft: 4800,
        message: 'Looking for turnkey interior architecture for a 120-cover modern Mediterranean restaurant and bar. Site possession in 30 days.',
        source: 'calculator',
        calculator_data: JSON.stringify({
          estimated_cost_min: 12000000,
          estimated_cost_max: 16800000,
          covers: 120,
          tier: 'Premium Hospitality'
        }),
        status: 'new',
        admin_notes: 'Urgent timeline. Requires site visit next Tuesday.',
        consent_given: 1,
        ip_hash: 'sample-salted-hash-seed-1',
      },
      {
        name: 'Pooja Deshmukh',
        phone: '9890234567',
        email: 'pooja.d@auragroup.com',
        business_type: 'hotel',
        project_location: 'Candolim, North Goa',
        area_sqft: 28000,
        message: 'Boutique hotel redevelopment. Requesting company portfolio and architectural credentials for investor deck presentation.',
        source: 'contact_form',
        calculator_data: null,
        status: 'contacted',
        admin_notes: 'Spoke with Pooja on phone. Sent preliminary hospitality credentials deck.',
        consent_given: 1,
        ip_hash: 'sample-salted-hash-seed-2',
      }
    ];

    const insertEnquiry = db.prepare(`
      INSERT INTO enquiries (name, phone, email, business_type, project_location, area_sqft, message, source, calculator_data, status, admin_notes, consent_given, ip_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    for (const e of sampleEnquiries) {
      insertEnquiry.run(e.name, e.phone, e.email, e.business_type, e.project_location, e.area_sqft, e.message, e.source, e.calculator_data, e.status, e.admin_notes, e.consent_given, e.ip_hash);
    }
    logger.info(`Seeded ${sampleEnquiries.length} sample client enquiries.`);
  }

  logger.info('Database seeding completed successfully.');
}

// Allow standalone execution: node server/db/seed.js
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  runSeed()
    .then(() => {
      logger.info('Seed script finished.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Seed script encountered fatal error:', err);
      process.exit(1);
    });
}

export default runSeed;
