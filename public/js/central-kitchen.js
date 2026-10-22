/**
 * @file /public/js/central-kitchen.js
 * @description Dedicated Controller for Central Kitchen & Commercial Commissary Showcase.
 * Fetches exclusively category=central_kitchen from /api/projects, renders technical blueprints,
 * manages interactive facility modals, and submits commissary feasibility briefs to /api/enquiries.
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
// Load & Render Central Kitchen Projects
// =============================================================================

async function loadCentralKitchenProjects() {
  const grid = document.getElementById('centralKitchenGrid');
  if (!grid) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/projects?category=central_kitchen`);
    if (!res.ok) throw new Error('Failed to load central kitchen projects');
    const json = await res.json();

    if (json.success && Array.isArray(json.data) && json.data.length > 0) {
      state.projects = json.data;
      renderProjects(state.projects);
    }
  } catch (err) {
    console.warn('API unavailable or empty; preserving fallback facilities.', err);
  }
}

function renderProjects(projectsList) {
  const grid = document.getElementById('centralKitchenGrid');
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
      <div class="project-card" data-category="central_kitchen">
        <div class="project-img-wrap">
          <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.title)}" loading="lazy">
          <span class="project-cat-badge">CENTRAL COMMISSARY</span>
        </div>
        <div class="project-body">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
            <span style="font-size: 0.75rem; color: var(--accent-gold); font-weight: 600; text-transform: uppercase;">
              ${escapeHtml(p.client_name || 'Commercial Food Hub')}
            </span>
          </div>
          <h3 class="project-title">${escapeHtml(p.title)}</h3>
          ${p.location ? `<div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px;">📍 ${escapeHtml(p.location)}</div>` : ''}
          <p class="project-desc">${escapeHtml(p.description)}</p>
          <div class="project-scope-list">
            ${scopeBadges}
          </div>
          <div class="project-card-footer">
            <button class="btn-link view-ck-blueprint-btn" data-slug="${escapeHtml(p.slug)}">
              View Technical Blueprint & Specs →
            </button>
            <button class="btn btn-gold btn-xs request-similar-btn" data-title="${escapeHtml(p.title)}" data-area="${p.area_sqft || ''}">
              Request Facility Tender ↗
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  attachListeners();
}

function attachListeners() {
  // Technical Blueprint Modals
  document.querySelectorAll('.view-ck-blueprint-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.slug;
      const project = state.projects.find((p) => p.slug === slug);
      if (project) openTechnicalModal(project);
    });
  });

  // Tender Request Pre-fill
  document.querySelectorAll('.request-similar-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const title = btn.dataset.title;
      const area = btn.dataset.area;

      const formSec = document.getElementById('feasibilitySection');
      const messageEl = document.getElementById('ckMessage');
      const areaEl = document.getElementById('ckArea');

      if (area && areaEl && !areaEl.value) {
        areaEl.value = area;
      }

      if (messageEl) {
        messageEl.value = `I am inquiring about a turnkey commercial central kitchen tender similar to "${title}". We require engineering layout, MEP air balance, blast freezing calculations, and equipment fit-out.`;
      }

      if (formSec) {
        formSec.scrollIntoView({ behavior: 'smooth' });
        formSec.style.outline = '2px solid var(--accent-gold)';
        setTimeout(() => { formSec.style.outline = 'none'; }, 2000);
      }

      showToast(`Form pre-filled with ${title} tender parameters!`, 'success');
    });
  });
}

// =============================================================================
// Blueprint Modal
// =============================================================================

function openTechnicalModal(project) {
  const modal = document.getElementById('technicalModal');
  const modalBody = document.getElementById('technicalModalBody');
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
        <img src="${escapeHtml(img)}" alt="${escapeHtml(project.title)} - Facility View ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;">
      </a>
      <span style="position: absolute; bottom: 6px; right: 6px; background: rgba(0,0,0,0.75); color: var(--accent-gold); font-size: 0.7rem; font-weight: 600; padding: 2px 6px; border-radius: 3px; border: 1px solid rgba(197, 168, 128, 0.3);">
        Photo ${idx + 1} of ${allPhotos.length}
      </span>
    </div>
  `).join('');

  let scopes = [];
  if (Array.isArray(project.scope)) {
    scopes = project.scope;
  } else if (typeof project.scope === 'string') {
    try {
      scopes = JSON.parse(project.scope);
    } catch (_) {
      scopes = project.scope.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  const scopesHtml = scopes.map((s) => `
    <li style="margin-bottom: 8px; display: flex; align-items: baseline; gap: 8px;">
      <span style="color: var(--accent-gold);">⚡</span>
      <span>${escapeHtml(s)}</span>
    </li>
  `).join('');

  modalBody.innerHTML = `
    <div style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 20px; margin-bottom: 24px;">
      <div class="section-badge" style="margin-bottom: 10px;">CENTRAL COMMISSARY TECHNICAL BLUEPRINT</div>
      <h2 style="font-family: var(--font-serif); font-size: 1.85rem; color: #fff; margin-bottom: 8px;">
        ${escapeHtml(project.title)}
      </h2>
      <div style="display: flex; gap: 20px; flex-wrap: wrap; color: var(--text-dim); font-size: 0.85rem;">
        ${project.client_name ? `<span>🏢 Client: <strong>${escapeHtml(project.client_name)}</strong></span>` : ''}
        ${project.location ? `<span>📍 Location: <strong>${escapeHtml(project.location)}</strong></span>` : ''}
      </div>
    </div>

    <div style="margin-bottom: 24px;">
      <h4 style="font-family: var(--font-serif); font-size: 1.15rem; color: var(--accent-gold); margin-bottom: 8px;">
        Culinary Infrastructure & Spatial Engineering
      </h4>
      <p style="color: var(--text-muted); line-height: 1.8; font-size: 0.95rem;">
        ${escapeHtml(project.description)}
      </p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 18px;">
        <h5 style="color: var(--accent-gold); font-size: 0.9rem; text-transform: uppercase; margin-bottom: 8px;">HACCP Drainage & Cold Chain</h5>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0; line-height: 1.6;">Integrated stainless 304 drainage trenches, dual grease separators, blast chilling at -40°C, and insulated PIR wall paneling.</p>
      </div>
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 18px;">
        <h5 style="color: var(--accent-gold); font-size: 0.9rem; text-transform: uppercase; margin-bottom: 8px;">High-CFM Ecology Exhaust</h5>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0; line-height: 1.6;">Multi-stage grease filtration, electrostatic precipitators (ESP), active odor scrubbers, and fresh air makeup balancing.</p>
      </div>
    </div>

    ${scopes.length > 0 ? `
      <div style="margin-bottom: 24px; background: rgba(197, 168, 128, 0.04); padding: 20px; border-radius: var(--radius-sm); border: 1px solid var(--border-gold);">
        <h4 style="font-family: var(--font-serif); font-size: 1.05rem; color: #fff; margin-bottom: 12px;">Turnkey Engineering Scope</h4>
        <ul style="list-style: none; padding: 0; color: var(--text-muted); font-size: 0.88rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px;">
          ${scopesHtml}
        </ul>
      </div>
    ` : ''}

    <div style="margin-bottom: 28px;">
      <h4 style="font-family: var(--font-serif); font-size: 1.05rem; color: var(--text-main); margin-bottom: 14px;">Facility Execution Gallery</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;">
        ${galleryHtml}
      </div>
    </div>

    <div style="display: flex; gap: 14px; justify-content: flex-end; padding-top: 18px; border-top: 1px solid var(--border-subtle); flex-wrap: wrap;">
      <button class="btn btn-secondary btn-sm" id="modalCloseAction">Close Blueprint</button>
      <button class="btn btn-primary btn-sm" id="modalRequestTenderAction">Inquire For This Facility Blueprint →</button>
    </div>
  `;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  const closeBtn = document.getElementById('modalCloseAction');
  if (closeBtn) closeBtn.onclick = closeTechnicalModal;

  const requestBtn = document.getElementById('modalRequestTenderAction');
  if (requestBtn) {
    requestBtn.onclick = () => {
      closeTechnicalModal();
      const formSec = document.getElementById('feasibilitySection');
      const messageEl = document.getElementById('ckMessage');
      const areaEl = document.getElementById('ckArea');

      if (project.area_sqft && areaEl && !areaEl.value) {
        areaEl.value = project.area_sqft;
      }
      if (messageEl) {
        messageEl.value = `We are requesting a turnkey commissary engineering tender based on the "${project.title}" facility blueprint. Please contact us with cost estimates and timelines.`;
      }
      if (formSec) {
        formSec.scrollIntoView({ behavior: 'smooth' });
      }
    };
  }
}

function closeTechnicalModal() {
  const modal = document.getElementById('technicalModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// =============================================================================
// Dedicated Feasibility Form Submission
// =============================================================================

function initFeasibilityForm() {
  const form = document.getElementById('ckFeasibilityForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('btnSubmitCk');
    const submitText = document.getElementById('btnSubmitCkText');
    const submitSpinner = document.getElementById('btnSubmitCkSpinner');

    const name = document.getElementById('ckName')?.value.trim();
    const phone = document.getElementById('ckPhone')?.value.trim();
    const email = document.getElementById('ckEmail')?.value.trim();
    const brand = document.getElementById('ckBrand')?.value.trim();
    const location = document.getElementById('ckLocation')?.value.trim();
    const area = parseFloat(document.getElementById('ckArea')?.value) || 0;
    const notes = document.getElementById('ckMessage')?.value.trim();
    const consent = document.getElementById('ckConsent')?.checked;

    // Checked scopes
    const scopes = [];
    document.querySelectorAll('input[name="ck_scope"]:checked').forEach((cb) => {
      scopes.push(cb.value);
    });

    if (!name || !phone || !email) {
      showToast('Please provide your name, phone number, and email address.', 'error');
      return;
    }

    if (!consent) {
      showToast('Please consent to receive architectural consultation.', 'error');
      return;
    }

    try {
      if (submitBtn) submitBtn.disabled = true;
      if (submitText) submitText.style.display = 'none';
      if (submitSpinner) submitSpinner.style.display = 'inline';

      const fullMessage = [
        brand ? `Brand / Organization: ${brand}` : '',
        location ? `Proposed Facility Location: ${location}` : '',
        scopes.length > 0 ? `Required Modules: ${scopes.join(', ')}` : '',
        notes ? `\nFacility Specifications:\n${notes}` : '',
      ].filter(Boolean).join('\n');

      const payload = {
        name,
        phone,
        email,
        business_type: 'central_kitchen',
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
        `*🏛️ BESIM DESIGN - CENTRAL KITCHEN BRIEF* ${formattedId}`,
        `*Client:* ${name}`,
        `*Phone:* ${phone}`,
        `*Email:* ${email}`,
        `*Sector:* CENTRAL KITCHEN & COMMISSARY`,
        facilityName ? `*Brand / Entity:* ${facilityName}` : '',
        location ? `*Location:* ${location}` : '',
        area ? `*Area:* ${area} sq.ft` : '',
        scopes.length > 0 ? `*Required Scope:* ${scopes.join(', ')}` : '',
        notes ? `\n*Technical Specs:*\n${notes}` : '',
      ].filter(Boolean).join('\n');

      const waUrl = json.whatsapp_url || `https://wa.me/${waPhone}?text=${encodeURIComponent(waLines)}`;

      showToast(`✓ Central Kitchen brief received!`, 'success');
      form.reset();

      try {
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      } catch (_) {}
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
  // Modal close handlers
  const modalClose = document.getElementById('technicalModalClose');
  const modal = document.getElementById('technicalModal');
  if (modalClose) modalClose.addEventListener('click', closeTechnicalModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeTechnicalModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTechnicalModal();
  });

  // Attach card listeners on existing static fallback items immediately
  attachListeners();

  // Initialize feasibility form
  initFeasibilityForm();

  // Fetch live Central Kitchen projects from API
  loadCentralKitchenProjects();
});
