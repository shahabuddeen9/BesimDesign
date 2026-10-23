/**
 * @file /public/js/main.js
 * @description Client-side controller for Besim Design.
 * Handles API data fetching with static HTML fallbacks, interactive space & budget calculator,
 * modal dialogs, FAQ accordions, toast alerts, and lead submission to /api/enquiries.
 */

// Global Configuration
const CONFIG = {
  API_BASE_URL: window.location.origin,
};

// State Store
const state = {
  projects: [],
  activeCategory: 'all',
  calculator: {
    sector: 'restaurant',
    area: 4500,
    tierMultiplier: 1.0,
    costMinPerSqft: 2400,
    costMaxPerSqft: 3800,
    turnaroundWeeks: 12,
  },
};

// =============================================================================
// DOM Utility Functions & Toast System
// =============================================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : '⚠️'}</span>
    <div>${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

function formatCurrencyINR(amount) {
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} Lakh`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

// =============================================================================
// Interactive Estimation Calculator
// =============================================================================

function initCalculator() {
  const typeCards = document.querySelectorAll('.calc-type-card');
  const areaSlider = document.getElementById('areaSlider');
  const areaDisplay = document.getElementById('areaDisplay');
  const specTier = document.getElementById('specTier');
  const estBudgetDisplay = document.getElementById('estBudgetDisplay');
  const estTimeDisplay = document.getElementById('estTimeDisplay');
  const estCapacityDisplay = document.getElementById('estCapacityDisplay');
  const estMepDisplay = document.getElementById('estMepDisplay');
  const btnUseEstimate = document.getElementById('btnUseEstimate');

  if (!areaSlider) return;

  function recalculate() {
    const area = parseInt(areaSlider.value, 10);
    const tier = parseFloat(specTier.value) || 1.0;
    state.calculator.area = area;
    state.calculator.tierMultiplier = tier;

    areaDisplay.textContent = `${area.toLocaleString()} sq.ft`;

    // Calculate budget min & max
    const totalMin = Math.round(area * state.calculator.costMinPerSqft * tier);
    const totalMax = Math.round(area * state.calculator.costMaxPerSqft * tier);

    estBudgetDisplay.textContent = `${formatCurrencyINR(totalMin)} — ${formatCurrencyINR(totalMax)}`;

    // Time estimate based on area and sector
    let baseWeeks = state.calculator.turnaroundWeeks;
    if (area > 10000) baseWeeks += 6;
    else if (area > 5000) baseWeeks += 3;
    estTimeDisplay.textContent = `${baseWeeks} - ${baseWeeks + 3} Weeks`;

    // Capacity estimation
    if (state.calculator.sector === 'restaurant') {
      const covers = Math.round(area / 38);
      estCapacityDisplay.textContent = `${covers} - ${Math.round(covers * 1.2)} Covers`;
      const trLoad = Math.round(area / 120);
      estMepDisplay.textContent = `${trLoad} - ${trLoad + 10} TR Load`;
    } else if (state.calculator.sector === 'hotel') {
      const keys = Math.round(area / 450);
      estCapacityDisplay.textContent = `${keys} Luxury Keys`;
      estMepDisplay.textContent = `Central Chiller Plant`;
    } else if (state.calculator.sector === 'bar') {
      const patrons = Math.round(area / 25);
      estCapacityDisplay.textContent = `${patrons} - ${Math.round(patrons * 1.25)} Patrons`;
      estMepDisplay.textContent = `Glycol + 40 TR HVAC`;
    } else if (state.calculator.sector === 'industrial') {
      estCapacityDisplay.textContent = `FM2 Super-Flat Floor`;
      estMepDisplay.textContent = `High-Bay LED & Transformers`;
    }
  }

  // Sector Card Selection
  typeCards.forEach((card) => {
    card.addEventListener('click', () => {
      typeCards.forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      state.calculator.sector = card.dataset.type;
      state.calculator.costMinPerSqft = parseInt(card.dataset.min, 10);
      state.calculator.costMaxPerSqft = parseInt(card.dataset.max, 10);
      state.calculator.turnaroundWeeks = parseInt(card.dataset.speed, 10);

      recalculate();
    });
  });

  areaSlider.addEventListener('input', recalculate);
  specTier.addEventListener('change', recalculate);

  // Initial calculation
  recalculate();

  // "Get a Detailed Layout & Scope PDF" button
  if (btnUseEstimate) {
    btnUseEstimate.addEventListener('click', () => {
      const contactSection = document.getElementById('contact');
      const formSource = document.getElementById('formSource');
      const formCalcData = document.getElementById('formCalcData') || document.getElementById('formCalculatorData');
      const businessTypeSelect = document.getElementById('businessType');
      const areaInput = document.getElementById('areaSqft');
      const messageTextarea = document.getElementById('projectMessage') || document.getElementById('clientMessage');

      // Populate form fields from calculator state
      if (businessTypeSelect) {
        // Map calculator sectors to business type options
        const sectorMap = {
          restaurant: 'hospitality',
          hotel: 'hotels',
          bar: 'hospitality',
          industrial: 'central_kitchen',
        };
        businessTypeSelect.value = sectorMap[state.calculator.sector] || state.calculator.sector;
      }
      if (areaInput) areaInput.value = state.calculator.area;
      if (formSource) formSource.value = 'calculator';

      const calcPayload = {
        sector: state.calculator.sector,
        area_sqft: state.calculator.area,
        tier: specTier ? specTier.options[specTier.selectedIndex]?.text : 'Standard',
        estimated_budget: estBudgetDisplay ? estBudgetDisplay.textContent : '',
        turnaround: estTimeDisplay ? estTimeDisplay.textContent : '',
        capacity: estCapacityDisplay ? estCapacityDisplay.textContent : '',
      };

      if (formCalcData) formCalcData.value = JSON.stringify(calcPayload);

      if (messageTextarea && !messageTextarea.value) {
        messageTextarea.value = `I generated an architectural estimate for a ${state.calculator.area.toLocaleString()} sq.ft ${state.calculator.sector.toUpperCase()} project (${estBudgetDisplay ? estBudgetDisplay.textContent : ''}). Please contact me with a detailed layout plan and turnkey tender.`;
      }

      // Smooth scroll to form
      if (contactSection) {
        contactSection.scrollIntoView({ behavior: 'smooth' });
      }

      // Highlight form card
      const formCard = document.querySelector('.contact-form-card');
      if (formCard) {
        formCard.style.outline = '2px solid var(--accent-gold)';
        setTimeout(() => {
          formCard.style.outline = 'none';
        }, 2000);
      }

      showToast('Calculator parameters applied to your project brief below!', 'success');
    });
  }
}

// =============================================================================
// Dynamic API Fetch with Static Fallback
// =============================================================================

async function loadProjects() {
  const grid = document.getElementById('portfolioGrid');
  if (!grid) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/projects?_t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to fetch projects');
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      state.projects = json.data;
      renderProjects(state.projects);
    }
  } catch (err) {
    console.warn('API error loading portfolio projects:', err);
  }
}

function renderProjects(projectsList) {
  const grid = document.getElementById('portfolioGrid');
  if (!grid) return;

  const cat = state.activeCategory || 'all';
  const filtered = cat === 'all'
    ? projectsList
    : projectsList.filter((p) => {
        const pCat = (p.category || '').toLowerCase();
        if (cat === 'hotels') return pCat === 'hotels' || pCat === 'hotel';
        if (cat === 'hospitality') return pCat === 'hospitality' || pCat === 'restaurant' || pCat === 'bar';
        if (cat === 'residential') return pCat === 'residential';
        if (cat === 'central_kitchen' || cat === 'central-kitchen') return pCat === 'central_kitchen' || pCat === 'central-kitchen';
        return pCat === cat;
      });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted);">
        <p>No projects found in this sector yet.</p>
        <a href="/admin/dashboard.html?tab=projects&action=new" class="btn btn-gold btn-sm" style="margin-top: 14px; text-decoration: none; display: inline-block;">
          ➕ Add First Project in this Sector
        </a>
      </div>
    `;
    return;
  }

  const projectCardsHtml = filtered.map((p) => {
    let scopes = [];
    if (Array.isArray(p.scope)) {
      scopes = p.scope;
    } else if (typeof p.scope === 'string') {
      try {
        const parsed = JSON.parse(p.scope);
        scopes = Array.isArray(parsed) ? parsed : [p.scope];
      } catch (_) {
        scopes = p.scope.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    const formattedCat = p.category ? escapeHtml(p.category.replace('_', ' ').toUpperCase()) : 'ARCHITECTURE';
    const escapedTitle = escapeHtml(p.title);
    const escapedDesc = escapeHtml(p.description);
    const escapedClient = escapeHtml(p.client_name || '');
    const escapedLocation = escapeHtml(p.location || '');
    const escapedImg = escapeHtml(p.image_url);
    const escapedSlug = escapeHtml(p.slug);

    return `
      <div class="project-card" data-category="${escapeHtml(p.category)}">
        <div class="project-img-wrap">
          <img src="${escapedImg}" alt="${escapedTitle}" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80'">
          <span class="project-cat-badge">${formattedCat}</span>
        </div>
        <div class="project-body">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
            <span style="font-size: 0.75rem; color: var(--accent-gold); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">${escapedClient ? `Client: ${escapedClient}` : formattedCat}</span>
          </div>
          <h3 class="project-title">${escapedTitle}</h3>
          ${escapedLocation ? `<div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px;">📍 ${escapedLocation}</div>` : ''}
          <p class="project-desc">${escapedDesc}</p>
          <div class="project-scope-list">
            ${scopes.slice(0, 4).map((s) => `<span class="project-scope-item">${escapeHtml(s)}</span>`).join('')}
          </div>
          <div class="project-card-footer">
            <button class="btn-link view-project-btn" data-slug="${escapedSlug}">
              View Project Blueprint →
            </button>
          </div>
          <!-- Admin Access Quick Controls (Add / Modify / Delete) -->
          <div class="project-admin-card-actions" style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed rgba(197, 168, 128, 0.25); display: flex; gap: 8px; align-items: center; justify-content: space-between;">
            <span style="font-size: 0.72rem; color: var(--accent-gold); font-weight: 600; letter-spacing: 0.04em;">ADMIN ACCESS</span>
            <div style="display: flex; gap: 6px;">
              <a href="/admin/dashboard.html?tab=projects&edit=${p.id}" class="btn-admin-card-edit" style="background: rgba(197, 168, 128, 0.12); border: 1px solid var(--border-gold, rgba(197, 168, 128, 0.4)); color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; font-weight: 500;" title="Modify this project in Admin Portal">
                ✏️ Modify
              </a>
              <a href="/admin/dashboard.html?tab=projects&delete=${p.id}" class="btn-admin-card-delete" style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; font-weight: 500;" title="Delete this project in Admin Portal">
                🗑️ Delete
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const addProjectCard = `
    <div class="project-card add-project-card" style="border: 2px dashed rgba(197, 168, 128, 0.35); background: rgba(197, 168, 128, 0.03); display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 36px 20px; text-align: center; min-height: 380px;">
      <div style="width: 52px; height: 52px; border-radius: 50%; background: rgba(197, 168, 128, 0.12); border: 1px solid var(--border-gold, rgba(197, 168, 128, 0.4)); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; margin-bottom: 14px; color: var(--accent-gold);">
        ➕
      </div>
      <h4 style="font-family: var(--font-serif); font-size: 1.15rem; color: #fff; margin-bottom: 8px;">Add Architecture Project</h4>
      <p style="color: var(--text-muted); font-size: 0.82rem; max-width: 240px; margin-bottom: 18px; line-height: 1.5;">
        Expand the live website portfolio with new turnkey hotels, restaurants, residences, or kitchens.
      </p>
      <a href="/admin/dashboard.html?tab=projects&action=new" class="btn btn-gold btn-sm" style="font-weight: 600; text-decoration: none; padding: 8px 16px; border-radius: 6px; font-size: 0.82rem;">
        ➕ Add New Project
      </a>
    </div>
  `;

  grid.innerHTML = projectCardsHtml + addProjectCard;

  attachProjectModalTriggers();
}

async function loadClients() {
  const container = document.getElementById('clientsGrid');
  if (!container) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/clients?_t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Clients API offline');
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      if (json.data.length === 0) {
        container.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 32px; color: var(--text-muted);">
            <p>No client logos currently listed.</p>
          </div>
        `;
      } else {
        container.innerHTML = json.data.map((c) => `
          <div class="client-logo-card">
            ${c.logo_url ? `<img src="${c.logo_url}" alt="${c.name}" class="client-logo-img" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='<span class=\\'client-logo-text\\'>${c.name}</span>';">` : `<span class="client-logo-text">${c.name}</span>`}
            <span class="client-name-label">${c.name}</span>
            ${c.category ? `<span class="client-cat-label">${c.category}</span>` : ''}
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.warn('Clients API unavailable; keeping static fallback.', err);
  }
}

// Project Modal Trigger Listener
function attachProjectModalTriggers() {
  const buttons = document.querySelectorAll('.view-project-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const slug = btn.dataset.slug;
      await openProjectModal(slug);
    });
  });
}

function closeProjectModal() {
  const modal = document.getElementById('projectModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

async function openProjectModal(slug) {
  const modal = document.getElementById('projectModal');
  const modalBody = document.getElementById('modalBody');
  if (!modal || !modalBody) return;

  // Find project in state or fetch by slug
  let project = state.projects.find((p) => p.slug === slug);

  if (!project) {
    try {
      const res = await fetch(`${CONFIG.API_BASE_URL}/api/projects/${slug}`);
      if (res.ok) {
        const json = await res.json();
        project = json.data;
      }
    } catch (_) {}
  }

  if (!project) {
    modalBody.innerHTML = `
      <h3 style="margin-bottom: 12px; font-family: var(--font-serif);">Commercial Project Blueprint</h3>
      <p style="color: var(--text-muted); margin-bottom: 24px;">Detailed technical drawings, MEP schematics, and photographic walkthroughs are available upon request during initial feasibility consultations.</p>
      <a href="#contact" class="btn btn-primary btn-sm" onclick="closeProjectModal();">Schedule a Technical Consultation</a>
    `;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    return;
  }

  const scopes = Array.isArray(project.scope) ? project.scope : [];
  let rawGallery = [];
  if (Array.isArray(project.gallery)) {
    rawGallery = project.gallery;
  } else if (typeof project.gallery === 'string') {
    try { rawGallery = JSON.parse(project.gallery); } catch (_) { rawGallery = [project.image_url]; }
  }

  const allPhotos = [];
  if (project.image_url) allPhotos.push(project.image_url);
  rawGallery.forEach((img) => {
    if (img && !allPhotos.includes(img)) allPhotos.push(img);
  });

  modalBody.innerHTML = `
    <div style="margin-bottom: 20px;">
      <span class="section-badge" style="margin-bottom: 8px;">${escapeHtml(project.category.toUpperCase())}</span>
      <h2 style="font-size: 1.8rem; margin-top: 8px; font-family: var(--font-serif);">${escapeHtml(project.title)}</h2>
    </div>

    <div style="border-radius: var(--radius-sm); overflow: hidden; margin-bottom: 24px; position: relative; background: #000;">
      <img id="mainModalHeroImg" src="${escapeHtml(project.image_url)}" alt="${escapeHtml(project.title)}" style="width: 100%; height: 340px; object-fit: cover; transition: opacity 0.25s ease;" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80'">
    </div>

    <p style="color: var(--text-muted); line-height: 1.7; margin-bottom: 24px; font-size: 1rem;">
      ${escapeHtml(project.description)}
    </p>

    <div style="margin-bottom: 24px;">
      <h4 style="font-size: 1rem; color: var(--accent-gold); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">Architectural & Engineering Scope</h4>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        ${scopes.map((s) => `<span style="background: rgba(255,255,255,0.06); padding: 5px 12px; border-radius: var(--radius-sm); font-size: 0.85rem; border: 1px solid var(--border-subtle);">${escapeHtml(s)}</span>`).join('')}
      </div>
    </div>

    ${allPhotos.length > 0 ? `
      <div style="margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px;">
          <h4 style="font-size: 1rem; color: var(--accent-gold); text-transform: uppercase; letter-spacing: 0.08em; margin: 0;">Photographic Walkthrough (${allPhotos.length} Photos)</h4>
          <span style="font-size: 0.78rem; color: var(--text-dim);">Click any photo to preview</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
          ${allPhotos.map((img, idx) => `
            <div style="border-radius: var(--radius-sm); overflow: hidden; position: relative; border: 1px solid var(--border-subtle); height: 110px; cursor: pointer; background: #000;" onclick="const hero = document.getElementById('mainModalHeroImg'); if (hero) hero.src='${escapeHtml(img)}';">
              <img src="${escapeHtml(img)}" alt="Photo ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.25s ease;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80'">
              <span style="position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.75); color: var(--accent-gold); font-size: 0.65rem; font-weight: 600; padding: 1px 5px; border-radius: 3px;">
                #${idx + 1}
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div style="border-top: 1px solid var(--border-subtle); padding-top: 20px; display: flex; justify-content: flex-end;">
      <a href="#contact" class="btn btn-primary btn-sm" onclick="closeProjectModal();">
        Enquire About Similar Project →
      </a>
    </div>
  `;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// =============================================================================
// Testimonials & FAQs Dynamic Loading
// =============================================================================

async function loadTestimonials() {
  const container = document.getElementById('testimonialsGrid');
  if (!container) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/testimonials?_t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Testimonials API offline');
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      if (json.data.length === 0) {
        container.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 36px; color: var(--text-muted);">
            <p>Client reviews are currently being updated.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = json.data.map((t) => {
        const ratingNum = Math.min(5, Math.max(1, parseInt(t.rating, 10) || 5));
        return `
          <div class="testimonial-card">
            <div>
              <div class="testimonial-rating">${'★'.repeat(ratingNum)}</div>
              <p class="testimonial-text">"${escapeHtml(t.review)}"</p>
            </div>
            <div class="testimonial-author">
              <h5>${escapeHtml(t.client_name)}</h5>
              <p>${escapeHtml(t.business_type)}</p>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.warn('API error loading testimonials:', err);
  }
}

async function loadFaqs() {
  const container = document.getElementById('faqAccordion');
  if (!container) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/faqs?_t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('FAQs API offline');
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      if (json.data.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 36px; color: var(--text-muted); background: var(--bg-card); border-radius: 8px;">
            <p>No architectural FAQs are currently published.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = json.data.map((f, idx) => `
        <div class="faq-item ${idx === 0 ? 'active' : ''}">
          <button class="faq-question">
            <span>${escapeHtml(f.question)}</span>
            <span class="faq-icon">+</span>
          </button>
          <div class="faq-answer">
            <p>${escapeHtml(f.answer)}</p>
          </div>
        </div>
      `).join('');
      attachFaqAccordion();
    }
  } catch (err) {
    console.warn('API error loading FAQs:', err);
    attachFaqAccordion();
  }
}

function attachFaqAccordion() {
  const questions = document.querySelectorAll('.faq-question');
  questions.forEach((q) => {
    q.onclick = () => {
      const item = q.parentElement;
      const wasActive = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('active'));
      if (!wasActive) {
        item.classList.add('active');
      }
    };
  });
}

// =============================================================================
// Lead Capture Form Submission
// =============================================================================

function initContactForm() {
  const form = document.getElementById('enquiryForm');
  const submitBtn = document.getElementById('btnSubmitForm');
  const btnText = document.getElementById('btnSubmitText');
  const btnSpinner = document.getElementById('btnSubmitSpinner');
  const alertBox = document.getElementById('formAlertBox');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Reset alert box
    alertBox.style.display = 'none';
    alertBox.className = '';
    alertBox.innerHTML = '';

    // Extract form data
    const formData = new FormData(form);
    const honeypot = formData.get('website_url_hp');
    if (honeypot) {
      console.warn('Honeypot filled; aborting spam bot submission.');
      return;
    }

    const name = formData.get('name')?.toString().trim();
    const phone = formData.get('phone')?.toString().trim();
    const email = formData.get('email')?.toString().trim();
    const businessType = formData.get('business_type')?.toString();
    const projectLocation = formData.get('project_location')?.toString().trim();
    const areaSqft = parseInt(formData.get('area_sqft')?.toString(), 10) || 0;
    const message = formData.get('message')?.toString().trim();
    const source = formData.get('source')?.toString() || 'contact_form';
    const consent = formData.get('consent') === 'on' || formData.get('consent') === 'true';
    const rawCalcData = formData.get('calculator_data')?.toString();

    let calcData = null;
    if (rawCalcData) {
      try {
        calcData = JSON.parse(rawCalcData);
      } catch (_) {
        calcData = rawCalcData;
      }
    }

    // Client-side Validation Checks
    if (!name || name.length < 2) {
      displayFormError('Please enter your full name (minimum 2 characters).');
      return;
    }

    const indianPhoneRegex = /^(?:\+91[\s-]?)?[6-9]\d{9}$/;
    if (!phone || !indianPhoneRegex.test(phone)) {
      displayFormError('Please provide a valid 10-digit Indian mobile number (e.g. 9820145678).');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      displayFormError('Please enter a valid business email address.');
      return;
    }

    if (!consent) {
      displayFormError('Please tick the consent checkbox to permit our architectural team to contact you.');
      return;
    }

    // Payload construction
    const payload = {
      name,
      phone,
      email,
      business_type: businessType,
      project_location: projectLocation,
      area_sqft: areaSqft,
      message,
      source,
      consent,
      calculator_data: calcData,
      honeypot: '',
    };

    // UI Loading State
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline';

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/enquiries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Build WhatsApp URL
        const waPhone = '919892699850';
        const formattedId = `#MSF-${result.id.toString().padStart(4, '0')}`;
        const waLines = [
          `*🏛️ BESIM DESIGN - NEW PROJECT ENQUIRY* (${formattedId})`,
          `*Client:* ${name}`,
          `*Phone:* ${phone}`,
          `*Email:* ${email}`,
          `*Sector:* ${(businessType || '').toUpperCase()}`,
          projectLocation ? `*Location:* ${projectLocation}` : '',
          areaSqft ? `*Area:* ${areaSqft.toLocaleString()} sq.ft` : '',
          message ? `\n*Message / Requirements:*\n${message}` : '',
          calcData && calcData.estimated_budget ? `*Estimated Budget:* ${calcData.estimated_budget}` : '',
        ].filter(Boolean).join('\n');

        const waUrl = result.whatsapp_url || `https://wa.me/${waPhone}?text=${encodeURIComponent(waLines)}`;

        // Success state
        form.reset();
        displayFormSuccess(
          `Thank you, ${name}! Your brief (${formattedId}) has been registered with Besim Design. Our turnkey architectural team will review your specifications.`,
          waUrl
        );
        showToast(`✓ Project brief ${formattedId} registered!`, 'success');

        // Gracefully attempt opening WhatsApp in a new tab without leaving the site
        try {
          window.open(waUrl, '_blank', 'noopener,noreferrer');
        } catch (_) {}
      } else {
        // Server validation or rate limit error
        let errorMsg = result.message || 'Unable to submit enquiry. Please check your inputs and try again.';
        if (result.errors && Array.isArray(result.errors)) {
          errorMsg = result.errors.map((e) => e.message).join(' | ');
        }
        displayFormError(errorMsg);
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      console.error('Lead submission request failed:', err);
      const networkMsg = 'Network connectivity issue. Please check your connection or contact us directly at besimdesigne@gmail.com.';
      displayFormError(networkMsg);
      showToast(networkMsg, 'error');
    } finally {
      submitBtn.disabled = false;
      btnText.style.display = 'inline';
      btnSpinner.style.display = 'none';
    }
  });

  function displayFormError(msg) {
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(239, 68, 68, 0.12)';
    alertBox.style.border = '1px solid #ef4444';
    alertBox.style.color = '#fca5a5';
    alertBox.style.padding = '14px 18px';
    alertBox.style.borderRadius = 'var(--radius-sm)';
    alertBox.style.fontSize = '0.9rem';
    alertBox.innerHTML = `<strong>Submission Error:</strong> ${msg}`;
  }

  function displayFormSuccess(msg, waUrl) {
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(16, 185, 129, 0.12)';
    alertBox.style.border = '1px solid #10b981';
    alertBox.style.color = '#6ee7b7';
    alertBox.style.padding = '18px 20px';
    alertBox.style.borderRadius = 'var(--radius-sm)';
    alertBox.style.fontSize = '0.95rem';
    alertBox.style.lineHeight = '1.6';
    alertBox.innerHTML = `
      <div style="font-size: 1.4rem; margin-bottom: 6px;">💬 ✓</div>
      <strong>Enquiry Confirmed</strong><br>${msg}
      ${waUrl ? `
        <div style="margin-top: 14px;">
          <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-sm" style="font-weight: 700; text-decoration: none;">
            💬 Open Details in WhatsApp (+91 98926 99850) →
          </a>
        </div>
      ` : ''}
    `;
  }
}

// =============================================================================
// Global Initializer
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Portfolio Category Filter Buttons
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.category;
      if (cat === 'central_kitchen') {
        window.location.href = '/central-kitchen.html';
        return;
      }
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeCategory = cat;

      if (state.projects.length > 0) {
        renderProjects(state.projects);
      } else {
        // Filter static DOM fallback cards
        const cards = document.querySelectorAll('.project-card');
        cards.forEach((card) => {
          if (state.activeCategory === 'all' || card.dataset.category === state.activeCategory) {
            card.style.display = 'flex';
          } else {
            card.style.display = 'none';
          }
        });
      }
    });
  });

  // 2. Modal Close handlers & Escape key
  const modal = document.getElementById('projectModal');
  const modalClose = document.getElementById('modalClose');
  if (modal && modalClose) {
    modalClose.addEventListener('click', closeProjectModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeProjectModal();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProjectModal();
    }
  });

  // 3. Initialize Interactive Components
  attachProjectModalTriggers();
  attachFaqAccordion();
  initCalculator();
  initContactForm();

  // 4. Fetch Dynamic API Data
  loadProjects();
  loadClients();
  loadTestimonials();
  loadFaqs();
});

