/**
 * @file /public/js/hotels.js
 * @description Dedicated Controller for Hotels & Boutique Resorts Long-Scroll Portfolio.
 * Directly renders all active hotel & resort projects in continuous full-detail format
 * (3-column top section + 4-photo horizontal gallery below) matching the finalized Hospitality portfolio,
 * with independent gallery carousels, fullscreen lightbox, WhatsApp discussion, and RFP tender submission.
 */

const CONFIG = {
  API_BASE_URL: window.location.origin,
};

const state = {
  projects: [],
  activeLightboxSlug: null,
  activeLightboxIndex: 0,
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
// Load & Render Hotel Projects (Continuous Long Scroll)
// =============================================================================

async function loadHotelProjects() {
  const container = document.getElementById('hotelsProjectsContainer');
  if (!container) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/projects?category=hotels&_t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to load hotel projects');
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      state.projects = json.data;
      renderLongScrollProjects(state.projects);

      if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        setTimeout(() => {
          const target = document.getElementById(hash) || document.getElementById(`project-${hash}`);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
          }
        }, 150);
      }
    }
  } catch (err) {
    console.warn('API error loading hotel projects:', err);
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px 20px; color: #ef4444;">
          Failed to load hotel & resort projects. Please refresh the page.
        </div>
      `;
    }
  }
}

function renderLongScrollProjects(projectsList) {
  const container = document.getElementById('hotelsProjectsContainer');
  if (!container) return;

  if (projectsList.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 20px; color: #6b7280; background: #f9fafb; border-radius: 8px; border: 1px dashed #e5e7eb;">
        <p style="font-size: 1.05rem; margin-bottom: 8px; color: #111827; font-weight: 600;">No hotel projects are currently published.</p>
        <p style="font-size: 0.88rem; color: #6b7280;">Add or publish hotel projects in the Admin Dashboard to feature them here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = projectsList
    .map((p, pIdx) => {
      let scopes = [];
      if (Array.isArray(p.scope)) {
        scopes = p.scope;
      } else if (typeof p.scope === 'string') {
        try {
          scopes = JSON.parse(p.scope);
        } catch (_) {
          scopes = p.scope.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }

      let displayHeading = p.title;
      if (p.location && !p.title.toLowerCase().includes(p.location.toLowerCase().split(',')[0])) {
        const city = p.location.split(',')[0].trim();
        displayHeading = `${p.title} – ${city}`;
      }

      const durationMatch = scopes.find((s) =>
        /day|month|week|handover|schedule|fast-track/i.test(s)
      );
      const durationText = durationMatch || '120 Days (Turnkey Architectural Handover)';

      const allPhotos = [];
      if (p.image_url) allPhotos.push(p.image_url);
      let rawGallery = [];
      if (Array.isArray(p.gallery)) {
        rawGallery = p.gallery;
      } else if (typeof p.gallery === 'string') {
        try {
          rawGallery = JSON.parse(p.gallery);
        } catch (_) {
          rawGallery = [p.gallery];
        }
      }
      rawGallery.forEach((img) => {
        if (img && typeof img === 'string' && !allPhotos.includes(img)) {
          allPhotos.push(img);
        }
      });

      const galleryItemsHtml = allPhotos
        .map(
          (imgUrl, imgIdx) => `
          <div class="gallery-item" data-project="${p.slug}" data-index="${imgIdx}">
            <img
              src="${escapeHtml(imgUrl)}"
              alt="${escapeHtml(p.title)} – Photograph ${imgIdx + 1}"
              class="gallery-img"
              loading="lazy"
              onclick="openPortfolioLightbox('${p.slug}', ${imgIdx})"
            >
            <span style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.72); color: #fff; font-size: 0.72rem; padding: 2px 6px; border-radius: 3px; pointer-events: none;">
              ${imgIdx + 1}/${allPhotos.length}
            </span>
          </div>
        `
        )
        .join('');

      const dotsHtml = Array.from({ length: Math.max(1, allPhotos.length) })
        .map(
          (_, dIdx) => `
          <button
            class="gallery-dot ${dIdx === 0 ? 'active' : ''}"
            id="dot-${p.slug}-${dIdx}"
            aria-label="Go to photo ${dIdx + 1}"
            onclick="scrollProjectGalleryToIndex('${p.slug}', ${dIdx})"
          ></button>
        `
        )
        .join('');

      return `
        <article class="hospitality-project-block" id="${p.slug}" data-slug="${p.slug}">
          <!-- Top Section: 3-Column Layout -->
          <div class="hospitality-detail-grid">
            
            <!-- LEFT COLUMN: Project Identity -->
            <div class="col-identity">
              <span class="hospitality-kicker">HOTEL PROJECT</span>
              <h2 class="hospitality-main-title">${escapeHtml(displayHeading)}</h2>
              <div class="hospitality-green-line"></div>
            </div>

            <!-- MIDDLE COLUMN: Project Information -->
            <div class="col-info">
              <div class="project-info-header">PROJECT INFORMATION</div>

              <div class="project-info-item">
                <span class="project-info-label">EXECUTED BY:</span>
                <span class="project-info-accent"></span>
                <span class="project-info-value">Besim Design (Turnkey Architectural Execution)</span>
              </div>

              <div class="project-info-item">
                <span class="project-info-label">DESIGNED BY:</span>
                <span class="project-info-accent"></span>
                <span class="project-info-value">${escapeHtml(p.client_name || 'Besim Design Architecture Studio')}</span>
              </div>

              <div class="project-info-item">
                <span class="project-info-label">AREA:</span>
                <span class="project-info-accent"></span>
                <span class="project-info-value">${p.area_sqft ? Number(p.area_sqft).toLocaleString() + ' Sq. Ft.' : '—'}</span>
              </div>

              <div class="project-info-item">
                <span class="project-info-label">LOCATION:</span>
                <span class="project-info-accent"></span>
                <span class="project-info-value">${escapeHtml(p.location || 'Goa / Mumbai')}</span>
              </div>

              <div class="project-info-item">
                <span class="project-info-label">PROJECT DURATION:</span>
                <span class="project-info-accent"></span>
                <span class="project-info-value">${escapeHtml(durationText)}</span>
              </div>
            </div>

            <!-- RIGHT COLUMN: Main Featured Cover Photograph -->
            <div class="col-cover">
              <div class="cover-img-wrapper" onclick="openPortfolioLightbox('${p.slug}', 0)">
                <img
                  src="${escapeHtml(p.image_url)}"
                  alt="${escapeHtml(p.title)} – Featured Cover Photograph"
                  class="project-featured-cover"
                  loading="${pIdx === 0 ? 'eager' : 'lazy'}"
                >
                <div class="cover-zoom-hint">🔍 View Fullscreen</div>
              </div>
            </div>

          </div>

          <!-- Photographic Gallery Below (Wide Horizontal Strip) -->
          <div class="hospitality-gallery-section" style="padding: 36px 0 20px 0;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; border-bottom: 1px solid #f3f4f6; padding-bottom: 10px;">
              <span style="font-size: 0.82rem; font-weight: 700; color: #16a34a; letter-spacing: 0.08em; text-transform: uppercase;">
                PROJECT PHOTOGRAPHIC GALLERY
              </span>
              <span style="font-size: 0.82rem; color: #6b7280;">
                ${allPhotos.length} High-Resolution Photographs
              </span>
            </div>

            <div class="gallery-carousel-wrapper" data-slug="${p.slug}">
              <button class="gallery-nav-btn gallery-nav-prev" onclick="scrollProjectGallery('${p.slug}', -1)" aria-label="Previous photograph">
                ‹
              </button>

              <div class="gallery-track" id="gallery-track-${p.slug}">
                ${galleryItemsHtml}
              </div>

              <button class="gallery-nav-btn gallery-nav-next" onclick="scrollProjectGallery('${p.slug}', 1)" aria-label="Next photograph">
                ›
              </button>
            </div>

            <!-- Carousel Indicators -->
            <div class="gallery-dots" id="gallery-dots-${p.slug}">
              ${dotsHtml}
            </div>
          </div>

          <!-- Bottom Action Bar for Project -->
          <div style="display: flex; justify-content: flex-end; align-items: center; padding: 12px 0; margin-top: 8px;">
            <a
              href="https://wa.me/919892699850?text=Hello%20Besim%20Design%2C%20I%20am%20interested%20in%20a%20hotel%20architectural%20fit-out%20inspired%20by%20${encodeURIComponent(p.title)}."
              target="_blank"
              rel="noopener noreferrer"
              style="font-size: 0.84rem; color: #16a34a; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"
            >
              Discuss ${escapeHtml(p.title)} on WhatsApp 💬
            </a>
          </div>
        </article>
      `;
    })
    .join('');

  attachPortfolioListeners();
}

function attachPortfolioListeners() {
  state.projects.forEach((p) => {
    const track = document.getElementById(`gallery-track-${p.slug}`);
    if (!track) return;

    track.addEventListener(
      'scroll',
      () => {
        const itemWidth = track.firstElementChild
          ? track.firstElementChild.getBoundingClientRect().width + 16
          : 280;
        const activeIdx = Math.round(track.scrollLeft / itemWidth);
        const dots = document.querySelectorAll(`#gallery-dots-${p.slug} .gallery-dot`);
        dots.forEach((dot, idx) => {
          if (idx === Math.min(activeIdx, dots.length - 1)) {
            dot.classList.add('active');
          } else {
            dot.classList.remove('active');
          }
        });
      },
      { passive: true }
    );
  });
}

// =============================================================================
// Carousel Scrolling Helpers
// =============================================================================

window.scrollProjectGallery = function (slug, direction) {
  const track = document.getElementById(`gallery-track-${slug}`);
  if (!track) return;
  const itemWidth = track.firstElementChild
    ? track.firstElementChild.getBoundingClientRect().width + 16
    : 300;
  track.scrollBy({ left: direction * itemWidth, behavior: 'smooth' });
};

window.scrollProjectGalleryToIndex = function (slug, index) {
  const track = document.getElementById(`gallery-track-${slug}`);
  if (!track) return;
  const item = track.children[index];
  if (item) {
    item.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }
};

// =============================================================================
// Fullscreen Lightbox for Portfolio Gallery
// =============================================================================

window.openPortfolioLightbox = function (slug, index) {
  const project = state.projects.find((p) => p.slug === slug);
  if (!project) return;

  const allPhotos = [];
  if (project.image_url) allPhotos.push(project.image_url);
  let rawGallery = [];
  if (Array.isArray(project.gallery)) {
    rawGallery = project.gallery;
  } else if (typeof project.gallery === 'string') {
    try {
      rawGallery = JSON.parse(project.gallery);
    } catch (_) {
      rawGallery = [project.gallery];
    }
  }
  rawGallery.forEach((img) => {
    if (img && typeof img === 'string' && !allPhotos.includes(img)) {
      allPhotos.push(img);
    }
  });

  if (allPhotos.length === 0) return;

  state.activeLightboxSlug = slug;
  state.activeLightboxIndex = index >= 0 && index < allPhotos.length ? index : 0;

  const modal = document.getElementById('portfolioLightboxModal');
  const img = document.getElementById('portfolioLightboxImg');
  const counter = document.getElementById('portfolioLightboxCounter');

  if (!modal || !img) return;

  img.src = allPhotos[state.activeLightboxIndex];
  img.alt = `${project.title} – Photo ${state.activeLightboxIndex + 1}`;

  if (counter) {
    counter.textContent = `Photo ${state.activeLightboxIndex + 1} of ${allPhotos.length} — ${project.title}`;
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closePortfolioLightbox = function () {
  const modal = document.getElementById('portfolioLightboxModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
};

window.portfolioLightboxPrev = function () {
  if (!state.activeLightboxSlug) return;
  const project = state.projects.find((p) => p.slug === state.activeLightboxSlug);
  if (!project) return;

  const allPhotos = [];
  if (project.image_url) allPhotos.push(project.image_url);
  let raw = Array.isArray(project.gallery) ? project.gallery : [];
  raw.forEach((img) => {
    if (img && !allPhotos.includes(img)) allPhotos.push(img);
  });

  state.activeLightboxIndex = (state.activeLightboxIndex - 1 + allPhotos.length) % allPhotos.length;
  window.openPortfolioLightbox(state.activeLightboxSlug, state.activeLightboxIndex);
};

window.portfolioLightboxNext = function () {
  if (!state.activeLightboxSlug) return;
  const project = state.projects.find((p) => p.slug === state.activeLightboxSlug);
  if (!project) return;

  const allPhotos = [];
  if (project.image_url) allPhotos.push(project.image_url);
  let raw = Array.isArray(project.gallery) ? project.gallery : [];
  raw.forEach((img) => {
    if (img && !allPhotos.includes(img)) allPhotos.push(img);
  });

  state.activeLightboxIndex = (state.activeLightboxIndex + 1) % allPhotos.length;
  window.openPortfolioLightbox(state.activeLightboxSlug, state.activeLightboxIndex);
};

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
        propertyName ? `Hotel / Resort Property: ${propertyName}` : '',
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
        `*🏛️ BESIM DESIGN - HOTEL & RESORT BRIEF* ${formattedId}`,
        `*Client:* ${name}`,
        `*Phone:* ${phone}`,
        `*Email:* ${email}`,
        `*Sector:* HOTELS & BOUTIQUE RESORTS`,
        propertyName ? `*Property / Brand:* ${propertyName}` : '',
        location ? `*Location:* ${location}` : '',
        area ? `*Area:* ${area} sq.ft` : '',
        scopes.length > 0 ? `*Required Scope:* ${scopes.join(', ')}` : '',
        notes ? `\n*Hotel Specifications:*\n${notes}` : '',
      ].filter(Boolean).join('\n');

      const waUrl = json.whatsapp_url || `https://wa.me/${waPhone}?text=${encodeURIComponent(waLines)}`;

      showToast(`✓ Hotel project tender inquiry ${formattedId} received!`, 'success');
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
// Lifecycle Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('portfolioLightboxClose');
  if (closeBtn) closeBtn.onclick = closePortfolioLightbox;

  const prevBtn = document.getElementById('portfolioLightboxPrev');
  if (prevBtn) prevBtn.onclick = portfolioLightboxPrev;

  const nextBtn = document.getElementById('portfolioLightboxNext');
  if (nextBtn) nextBtn.onclick = portfolioLightboxNext;

  const modal = document.getElementById('portfolioLightboxModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closePortfolioLightbox();
    });
  }

  document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('portfolioLightboxModal');
    if (lb && lb.classList.contains('active')) {
      if (e.key === 'Escape') closePortfolioLightbox();
      if (e.key === 'ArrowLeft') portfolioLightboxPrev();
      if (e.key === 'ArrowRight') portfolioLightboxNext();
    }
  });

  initHotelForm();
  loadHotelProjects();
});
