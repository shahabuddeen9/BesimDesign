/**
 * @file /public/js/hotels.js
 * @description Dedicated Controller for Hotels & Boutique Resorts Showcase.
 * Fetches exclusively category=hotels from /api/projects, renders turnkey hotel landmarks,
 * manages interactive suite & lobby blueprint modals, and submits RFP briefs to /api/enquiries.
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
// Load & Render Hotel Projects
// =============================================================================

async function loadHotelProjects() {
  const grid = document.getElementById('hotelsGrid');
  if (!grid) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/projects?category=hotels`);
    if (!res.ok) throw new Error('Failed to load hotel projects');
    const json = await res.json();

    if (json.success && Array.isArray(json.data) && json.data.length > 0) {
      state.projects = json.data;
      renderProjects(state.projects);
    }
  } catch (err) {
    console.warn('API unavailable or empty; retaining fallback hotel landmarks.', err);
  }
}

function renderProjects(projectsList) {
  const grid = document.getElementById('hotelsGrid');
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
      <div class="project-card" data-category="hotels">
        <div class="project-img-wrap">
          <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.title)}" loading="lazy">
          <span class="project-cat-badge">HOTEL LANDMARK</span>
        </div>
        <div class="project-body">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
            <span style="font-size: 0.75rem; color: var(--accent-gold); font-weight: 600; text-transform: uppercase;">
              ${escapeHtml(p.client_name || 'Boutique Hotel & Resort')}
            </span>
          </div>
          <h3 class="project-title">${escapeHtml(p.title)}</h3>
          ${p.location ? `<div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px;">📍 ${escapeHtml(p.location)}</div>` : ''}
          <p class="project-desc">${escapeHtml(p.description)}</p>
          <div class="project-scope-list">
            ${scopeBadges}
          </div>
          <div class="project-card-footer">
            <button class="btn-link view-hotel-blueprint-btn" data-slug="${escapeHtml(p.slug)}">
              View Architectural Blueprint →
            </button>
            <button class="btn btn-gold btn-xs request-hotel-rfp-btn" data-title="${escapeHtml(p.title)}" data-area="${p.area_sqft || ''}">
              Request Hotel RFP ↗
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  attachListeners();
}

function attachListeners() {
  document.querySelectorAll('.view-hotel-blueprint-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.slug;
      const project = state.projects.find((p) => p.slug === slug);
      if (project) openHotelModal(project);
    });
  });

  document.querySelectorAll('.request-hotel-rfp-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const title = btn.dataset.title;
      const area = btn.dataset.area;

      const formSec = document.getElementById('hotelRfpSection');
      const messageEl = document.getElementById('hotelMessage');
      const areaEl = document.getElementById('hotelArea');

      if (area && areaEl && !areaEl.value) {
        areaEl.value = area;
      }

      if (messageEl) {
        messageEl.value = `We are seeking turnkey architectural fit-out and engineering for a hotel property similar to "${title}". We require guest room mockups, acoustic STC 55+ corridor isolation, lobby millwork, and full MEP handover.`;
      }

      if (formSec) {
        formSec.scrollIntoView({ behavior: 'smooth' });
        formSec.style.outline = '2px solid var(--accent-gold)';
        setTimeout(() => { formSec.style.outline = 'none'; }, 2000);
      }

      showToast(`Form pre-filled with ${title} hotel specifications!`, 'success');
    });
  });
}

// =============================================================================
// Blueprint Modal
// =============================================================================

function openHotelModal(project) {
  const modal = document.getElementById('hotelModal');
  const modalBody = document.getElementById('hotelModalBody');
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
        <img src="${escapeHtml(img)}" alt="${escapeHtml(project.title)} - Suite View ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;">
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
      <span style="color: var(--accent-gold);">✓</span>
      <span>${escapeHtml(s)}</span>
    </li>
  `).join('');

  modalBody.innerHTML = `
    <div style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 20px; margin-bottom: 24px;">
      <div class="section-badge" style="margin-bottom: 10px;">HOTEL ARCHITECTURAL BLUEPRINT</div>
      <h2 style="font-family: var(--font-serif); font-size: 1.85rem; color: #fff; margin-bottom: 8px;">
        ${escapeHtml(project.title)}
      </h2>
      <div style="display: flex; gap: 20px; flex-wrap: wrap; color: var(--text-dim); font-size: 0.85rem;">
        ${project.client_name ? `<span>🏨 Hospitality Client: <strong>${escapeHtml(project.client_name)}</strong></span>` : ''}
        ${project.location ? `<span>📍 Location: <strong>${escapeHtml(project.location)}</strong></span>` : ''}
      </div>
    </div>

    <div style="margin-bottom: 24px;">
      <h4 style="font-family: var(--font-serif); font-size: 1.15rem; color: var(--accent-gold); margin-bottom: 8px;">
        Architectural Execution & Spatial Engineering
      </h4>
      <p style="color: var(--text-muted); line-height: 1.8; font-size: 0.95rem;">
        ${escapeHtml(project.description)}
      </p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 18px;">
        <h5 style="color: var(--accent-gold); font-size: 0.9rem; text-transform: uppercase; margin-bottom: 8px;">Acoustic Isolation (STC 55+)</h5>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0; line-height: 1.6;">High-performance acoustic wall assemblies, drop-down door seals, and corridor sound-baffling for guest privacy.</p>
      </div>
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 18px;">
        <h5 style="color: var(--accent-gold); font-size: 0.9rem; text-transform: uppercase; margin-bottom: 8px;">Factory Millwork & Teak Joinery</h5>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0; line-height: 1.6;">Precision-manufactured headboards, vanities, luggage credenzas, and entry portal frames crafted in Nalasopara.</p>
      </div>
    </div>

    ${scopes.length > 0 ? `
      <div style="margin-bottom: 24px; background: rgba(197, 168, 128, 0.04); padding: 20px; border-radius: var(--radius-sm); border: 1px solid var(--border-gold);">
        <h4 style="font-family: var(--font-serif); font-size: 1.05rem; color: #fff; margin-bottom: 12px;">Turnkey Hotel Fit-Out Scope</h4>
        <ul style="list-style: none; padding: 0; color: var(--text-muted); font-size: 0.88rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px;">
          ${scopesHtml}
        </ul>
      </div>
    ` : ''}

    <div style="margin-bottom: 28px;">
      <h4 style="font-family: var(--font-serif); font-size: 1.05rem; color: var(--text-main); margin-bottom: 14px;">Hotel Architecture & Finishes Gallery</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;">
        ${galleryHtml}
      </div>
    </div>

    <div style="display: flex; gap: 14px; justify-content: flex-end; padding-top: 18px; border-top: 1px solid var(--border-subtle); flex-wrap: wrap;">
      <button class="btn btn-secondary btn-sm" id="modalCloseAction">Close Blueprint</button>
      <button class="btn btn-primary btn-sm" id="modalRequestRfpAction">Submit Hotel RFP For This Standard →</button>
    </div>
  `;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  const closeBtn = document.getElementById('modalCloseAction');
  if (closeBtn) closeBtn.onclick = closeHotelModal;

  const requestBtn = document.getElementById('modalRequestRfpAction');
  if (requestBtn) {
    requestBtn.onclick = () => {
      closeHotelModal();
      const formSec = document.getElementById('hotelRfpSection');
      const messageEl = document.getElementById('hotelMessage');
      const areaEl = document.getElementById('hotelArea');

      if (project.area_sqft && areaEl && !areaEl.value) {
        areaEl.value = project.area_sqft;
      }
      if (messageEl) {
        messageEl.value = `We are preparing a turnkey tender for a boutique hotel development inspired by "${project.title}". Please review our room count, lobby architecture, and project timeline.`;
      }
      if (formSec) {
        formSec.scrollIntoView({ behavior: 'smooth' });
      }
    };
  }
}

function closeHotelModal() {
  const modal = document.getElementById('hotelModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// =============================================================================
// Hotel RFP Form Submission
// =============================================================================

function initHotelForm() {
  const form = document.getElementById('hotelRfpForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('btnSubmitHotel');
    const submitText = document.getElementById('btnSubmitHotelText');
    const submitSpinner = document.getElementById('btnSubmitHotelSpinner');

    const name = document.getElementById('hotelName')?.value.trim();
    const phone = document.getElementById('hotelPhone')?.value.trim();
    const email = document.getElementById('hotelEmail')?.value.trim();
    const propertyName = document.getElementById('hotelPropertyName')?.value.trim();
    const location = document.getElementById('hotelLocation')?.value.trim();
    const area = parseFloat(document.getElementById('hotelArea')?.value) || 0;
    const notes = document.getElementById('hotelMessage')?.value.trim();
    const consent = document.getElementById('hotelConsent')?.checked;

    const scopes = [];
    document.querySelectorAll('input[name="hotel_scope"]:checked').forEach((cb) => {
      scopes.push(cb.value);
    });

    if (!name || !phone || !email) {
      showToast('Please provide your name, phone number, and email address.', 'error');
      return;
    }

    if (!consent) {
      showToast('Please accept privacy terms to submit your hotel tender inquiry.', 'error');
      return;
    }

    try {
      if (submitBtn) submitBtn.disabled = true;
      if (submitText) submitText.style.display = 'none';
      if (submitSpinner) submitSpinner.style.display = 'inline';

      const fullMessage = [
        propertyName ? `Hotel Property / Chain: ${propertyName}` : '',
        location ? `Location / City: ${location}` : '',
        scopes.length > 0 ? `Required Scope: ${scopes.join(', ')}` : '',
        notes ? `\nHotel Specifications:\n${notes}` : '',
      ].filter(Boolean).join('\n');

      const payload = {
        name,
        phone,
        email,
        business_type: 'hotels',
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
        `*🏛️ BESIM DESIGN - HOTEL DEVELOPMENT BRIEF* ${formattedId}`,
        `*Client:* ${name}`,
        `*Phone:* ${phone}`,
        `*Email:* ${email}`,
        `*Sector:* HOTELS & RESORTS`,
        propertyName ? `*Hotel / Chain:* ${propertyName}` : '',
        location ? `*Location:* ${location}` : '',
        area ? `*Area / Keys:* ${area} sq.ft` : '',
        scopes.length > 0 ? `*Required Scope:* ${scopes.join(', ')}` : '',
        notes ? `\n*Specifications:*\n${notes}` : '',
      ].filter(Boolean).join('\n');

      const waUrl = json.whatsapp_url || `https://wa.me/${waPhone}?text=${encodeURIComponent(waLines)}`;

      showToast(`✓ Hotel development brief ${formattedId} received!`, 'success');
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
  const modalClose = document.getElementById('hotelModalClose');
  const modal = document.getElementById('hotelModal');
  if (modalClose) modalClose.addEventListener('click', closeHotelModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeHotelModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHotelModal();
  });

  attachListeners();
  initHotelForm();
  loadHotelProjects();
});
