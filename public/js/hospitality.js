/**
 * @file /public/js/hospitality.js
 * @description Dedicated Controller for Hospitality, Restaurants & Dining Showcase.
 * Fetches exclusively category=hospitality from /api/projects, renders dining landmarks,
 * manages interactive F&B layout blueprint modals, and submits restaurant tender briefs to /api/enquiries.
 */

const CONFIG = {
  API_BASE_URL: window.location.origin,
};

const state = {
  projects: [],
};

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

// =============================================================================
// Load & Render Hospitality Projects
// =============================================================================

async function loadHospitalityProjects() {
  const grid = document.getElementById('hospitalityGrid');
  if (!grid) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/projects?category=hospitality`);
    if (!res.ok) throw new Error('Failed to load hospitality projects');
    const json = await res.json();

    if (json.success && Array.isArray(json.data) && json.data.length > 0) {
      state.projects = json.data;
      renderProjects(state.projects);
    }
  } catch (err) {
    console.warn('API unavailable or empty; retaining fallback hospitality landmarks.', err);
  }
}

function renderProjects(projectsList) {
  const grid = document.getElementById('hospitalityGrid');
  if (!grid) return;

  grid.innerHTML = projectsList.map((p) => {
    let scopes = [];
    if (Array.isArray(p.scope)) {
      scopes = p.scope;
    } else if (typeof p.scope === 'string') {
      try { scopes = JSON.parse(p.scope); } catch (_) { scopes = p.scope.split(',').map(s => s.trim()); }
    }

    const scopeBadges = scopes.map(s => `<span class="project-scope-item">${escapeHtml(s)}</span>`).join('');

    return `
      <div class="project-card" data-category="hospitality">
        <div class="project-img-wrap">
          <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.title)}" loading="lazy">
          <span class="project-cat-badge">HOSPITALITY & DINING</span>
        </div>
        <div class="project-body">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
            <span style="font-size: 0.75rem; color: var(--accent-gold); font-weight: 600; text-transform: uppercase;">
              ${escapeHtml(p.client_name || 'Iconic Dining Landmark')}
            </span>
          </div>
          <h3 class="project-title">${escapeHtml(p.title)}</h3>
          ${p.location ? `<div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px;">📍 ${escapeHtml(p.location)}</div>` : ''}
          <p class="project-desc">${escapeHtml(p.description)}</p>
          <div class="project-scope-list">
            ${scopeBadges}
          </div>
          <div class="project-card-footer">
            <button class="btn-link view-dining-blueprint-btn" data-slug="${escapeHtml(p.slug)}">
              View Dining Blueprint →
            </button>
            <button class="btn btn-gold btn-xs request-hospitality-rfp-btn" data-title="${escapeHtml(p.title)}" data-area="${p.area_sqft || ''}">
              Request Dining Tender ↗
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  attachListeners();
}

function attachListeners() {
  document.querySelectorAll('.view-dining-blueprint-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.slug;
      const project = state.projects.find((p) => p.slug === slug);
      if (project) openHospitalityModal(project);
    });
  });

  document.querySelectorAll('.request-hospitality-rfp-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const title = btn.dataset.title;
      const area = btn.dataset.area;

      const formSec = document.getElementById('hospitalityRfpSection');
      const messageEl = document.getElementById('hospitalityMessage');
      const areaEl = document.getElementById('hospitalityArea');

      if (area && areaEl && !areaEl.value) {
        areaEl.value = area;
      }

      if (messageEl) {
        messageEl.value = `We are planning a high-end restaurant / hospitality project inspired by "${title}". We require turnkey civil fit-out, acoustic treatment, specialized kitchen exhaust scrubbers, and bespoke factory banquette seating.`;
      }

      if (formSec) {
        formSec.scrollIntoView({ behavior: 'smooth' });
        formSec.style.outline = '2px solid var(--accent-gold)';
        setTimeout(() => { formSec.style.outline = 'none'; }, 2000);
      }

      showToast(`Form pre-filled with ${title} specifications!`, 'success');
    });
  });
}

// =============================================================================
// Blueprint Modal
// =============================================================================

function openHospitalityModal(project) {
  const modal = document.getElementById('hospitalityModal');
  const modalBody = document.getElementById('hospitalityModalBody');
  if (!modal || !modalBody) return;

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

  const galleryHtml = allPhotos.map((img, idx) => `
    <div style="border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-subtle); height: 190px; position: relative; background: #000;">
      <a href="${escapeHtml(img)}" target="_blank" rel="noopener noreferrer" title="Click to view high-resolution photo ${idx + 1}" style="display: block; width: 100%; height: 100%;">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(project.title)} - View ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;">
      </a>
      <span style="position: absolute; bottom: 6px; right: 6px; background: rgba(0,0,0,0.75); color: var(--accent-gold); font-size: 0.7rem; font-weight: 600; padding: 2px 6px; border-radius: 3px; border: 1px solid rgba(197, 168, 128, 0.3);">
        Photo ${idx + 1} of ${allPhotos.length}
      </span>
    </div>
  `).join('');

  const scopesHtml = scopes.map((s) => `
    <li style="margin-bottom: 8px; display: flex; align-items: baseline; gap: 8px;">
      <span style="color: var(--accent-gold);">✓</span>
      <span>${escapeHtml(s)}</span>
    </li>
  `).join('');

  modalBody.innerHTML = `
    <div style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 20px; margin-bottom: 24px;">
      <div class="section-badge" style="margin-bottom: 10px;">HOSPITALITY ARCHITECTURAL BLUEPRINT</div>
      <h2 style="font-family: var(--font-serif); font-size: 1.85rem; color: #fff; margin-bottom: 8px;">
        ${escapeHtml(project.title)}
      </h2>
      <div style="display: flex; gap: 20px; flex-wrap: wrap; color: var(--text-dim); font-size: 0.85rem;">
        ${project.client_name ? `<span>🍽️ Hospitality Client: <strong>${escapeHtml(project.client_name)}</strong></span>` : ''}
        ${project.location ? `<span>📍 Location: <strong>${escapeHtml(project.location)}</strong></span>` : ''}
      </div>
    </div>

    <div style="margin-bottom: 24px;">
      <h4 style="font-family: var(--font-serif); font-size: 1.15rem; color: var(--accent-gold); margin-bottom: 8px;">
        Culinary Theatre & Architectural Fit-Out
      </h4>
      <p style="color: var(--text-muted); line-height: 1.8; font-size: 0.95rem;">
        ${escapeHtml(project.description)}
      </p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 18px;">
        <h5 style="color: var(--accent-gold); font-size: 0.9rem; text-transform: uppercase; margin-bottom: 8px;">Kitchen Exhaust & Scrubbers</h5>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0; line-height: 1.6;">High-velocity grease hood extraction, wet ecology scrubbers, and precision air-makeup avoiding drafty dining zones.</p>
      </div>
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 18px;">
        <h5 style="color: var(--accent-gold); font-size: 0.9rem; text-transform: uppercase; margin-bottom: 8px;">Bespoke Factory Banquettes</h5>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0; line-height: 1.6;">Contract-grade upholstery, custom fluted timber paneling, brass trims, and cocktail bar stations made in Nalasopara.</p>
      </div>
    </div>

    ${scopes.length > 0 ? `
      <div style="margin-bottom: 24px; background: rgba(197, 168, 128, 0.04); padding: 20px; border-radius: var(--radius-sm); border: 1px solid var(--border-gold);">
        <h4 style="font-family: var(--font-serif); font-size: 1.05rem; color: #fff; margin-bottom: 12px;">Turnkey Hospitality Scope</h4>
        <ul style="list-style: none; padding: 0; color: var(--text-muted); font-size: 0.88rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px;">
          ${scopesHtml}
        </ul>
      </div>
    ` : ''}

    <div style="margin-bottom: 28px;">
      <h4 style="font-family: var(--font-serif); font-size: 1.05rem; color: var(--text-main); margin-bottom: 14px;">Dining Architecture Gallery</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;">
        ${galleryHtml}
      </div>
    </div>

    <div style="display: flex; gap: 14px; justify-content: flex-end; padding-top: 18px; border-top: 1px solid var(--border-subtle); flex-wrap: wrap;">
      <button class="btn btn-secondary btn-sm" id="modalCloseAction">Close Blueprint</button>
      <button class="btn btn-primary btn-sm" id="modalRequestRfpAction">Submit Dining Tender RFP →</button>
    </div>
  `;

  modal.classList.add('active');

  const closeBtn = document.getElementById('modalCloseAction');
  if (closeBtn) closeBtn.onclick = closeHospitalityModal;

  const requestBtn = document.getElementById('modalRequestRfpAction');
  if (requestBtn) {
    requestBtn.onclick = () => {
      closeHospitalityModal();
      const formSec = document.getElementById('hospitalityRfpSection');
      const messageEl = document.getElementById('hospitalityMessage');
      const areaEl = document.getElementById('hospitalityArea');

      if (project.area_sqft && areaEl && !areaEl.value) {
        areaEl.value = project.area_sqft;
      }
      if (messageEl) {
        messageEl.value = `We are preparing a turnkey fit-out tender for a hospitality venue inspired by "${project.title}". Please review our dining covers, kitchen extraction requirements, and launch timeline.`;
      }
      if (formSec) {
        formSec.scrollIntoView({ behavior: 'smooth' });
      }
    };
  }
}

function closeHospitalityModal() {
  const modal = document.getElementById('hospitalityModal');
  if (modal) modal.classList.remove('active');
}

// =============================================================================
// Hospitality RFP Form Submission
// =============================================================================

function initHospitalityForm() {
  const form = document.getElementById('hospitalityRfpForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('btnSubmitHospitality');
    const submitText = document.getElementById('btnSubmitHospitalityText');
    const submitSpinner = document.getElementById('btnSubmitHospitalitySpinner');

    const name = document.getElementById('hospitalityName')?.value.trim();
    const phone = document.getElementById('hospitalityPhone')?.value.trim();
    const email = document.getElementById('hospitalityEmail')?.value.trim();
    const restaurantName = document.getElementById('hospitalityVenueName')?.value.trim();
    const location = document.getElementById('hospitalityLocation')?.value.trim();
    const area = parseFloat(document.getElementById('hospitalityArea')?.value) || 0;
    const notes = document.getElementById('hospitalityMessage')?.value.trim();
    const consent = document.getElementById('hospitalityConsent')?.checked;

    const scopes = [];
    document.querySelectorAll('input[name="hospitality_scope"]:checked').forEach((cb) => {
      scopes.push(cb.value);
    });

    if (!name || !phone || !email) {
      showToast('Please provide your name, phone number, and email address.', 'error');
      return;
    }

    if (!consent) {
      showToast('Please accept privacy terms to submit your hospitality tender inquiry.', 'error');
      return;
    }

    try {
      if (submitBtn) submitBtn.disabled = true;
      if (submitText) submitText.style.display = 'none';
      if (submitSpinner) submitSpinner.style.display = 'inline';

      const fullMessage = [
        restaurantName ? `Restaurant / Hospitality Venue: ${restaurantName}` : '',
        location ? `Location / City: ${location}` : '',
        scopes.length > 0 ? `Required Scope: ${scopes.join(', ')}` : '',
        notes ? `\nVenue Specifications:\n${notes}` : '',
      ].filter(Boolean).join('\n');

      const payload = {
        name,
        phone,
        email,
        business_type: 'hospitality',
        project_location: location,
        area_sqft: area,
        message: fullMessage,
        source: 'contact_form',
        consent: true,
        honeypot: '',
      };

      const res = await fetch(`${CONFIG.API_BASE_URL}/api/enquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Submission failed');
      }

      const waPhone = '919892699850';
      const formattedId = json.id ? `#MSF-${json.id.toString().padStart(4, '0')}` : '';
      const waLines = [
        `*🏛️ BESIM DESIGN - HOSPITALITY & DINING BRIEF* ${formattedId}`,
        `*Client:* ${name}`,
        `*Phone:* ${phone}`,
        `*Email:* ${email}`,
        `*Sector:* HOSPITALITY & FINE DINING`,
        restaurantName ? `*Venue / Brand:* ${restaurantName}` : '',
        location ? `*Location:* ${location}` : '',
        area ? `*Area:* ${area} sq.ft` : '',
        scopes.length > 0 ? `*Required Scope:* ${scopes.join(', ')}` : '',
        notes ? `\n*Venue Specifications:*\n${notes}` : '',
      ].filter(Boolean).join('\n');

      const waUrl = json.whatsapp_url || `https://wa.me/${waPhone}?text=${encodeURIComponent(waLines)}`;

      showToast('✓ Hospitality project brief received! Opening WhatsApp...', 'success');
      form.reset();

      setTimeout(() => {
        window.location.href = waUrl;
      }, 300);

    } catch (err) {
      showToast(err.message || 'Failed to submit. Please verify details.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (submitText) submitText.style.display = 'inline';
      if (submitSpinner) submitSpinner.style.display = 'none';
    }
  });
}

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  const navbarEl = document.getElementById('navbar');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navLinks.classList.toggle('active');
      navToggle.textContent = isOpen ? '✕' : '☰';
    });

    document.querySelectorAll('.nav-item-dropdown > .nav-link').forEach((dropdownLink) => {
      dropdownLink.addEventListener('click', (e) => {
        if (window.innerWidth <= 992) {
          e.preventDefault();
          const parent = dropdownLink.closest('.nav-item-dropdown');
          if (parent) parent.classList.toggle('open');
        }
      });
    });

    document.querySelectorAll('.nav-link:not(.nav-item-dropdown > .nav-link), .dropdown-item').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        if (navToggle) navToggle.textContent = '☰';
      });
    });

    document.addEventListener('click', (e) => {
      if (navbarEl && !navbarEl.contains(e.target) && navLinks.classList.contains('active')) {
        navLinks.classList.remove('active');
        if (navToggle) navToggle.textContent = '☰';
      }
    });
  }

  const modalClose = document.getElementById('hospitalityModalClose');
  const modal = document.getElementById('hospitalityModal');
  if (modalClose) modalClose.addEventListener('click', closeHospitalityModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeHospitalityModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHospitalityModal();
  });

  attachListeners();
  initHospitalityForm();
  loadHospitalityProjects();
});
