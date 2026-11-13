/**
 * @file /public/js/hospitality.js
 * @description Controller for One Long-Scroll Hospitality Projects Portfolio.
 * Directly renders all active hospitality projects in continuous full-detail format
 * (3-column top section + 4-photo horizontal gallery below) matching reference screenshots,
 * with jump navigation, independent gallery carousels, fullscreen lightbox, and tender RFP prefilling.
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
// Load & Render Hospitality Projects (Continuous Long Scroll)
// =============================================================================

async function loadHospitalityProjects() {
  const container = document.getElementById('hospitalityProjectsContainer');
  if (!container) return;

  if (Array.isArray(window.__INITIAL_CATEGORY_PROJECTS__) && window.__INITIAL_CATEGORY_PROJECTS__.length > 0) {
    state.projects = window.__INITIAL_CATEGORY_PROJECTS__;
    attachPortfolioListeners();
  }

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/projects?category=hospitality&_t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to load hospitality projects');
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      state.projects = json.data;
      renderLongScrollProjects(state.projects);

      // Handle anchor scroll if URL has hash (e.g. #the-nutcracker-jio-mall-bkc)
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
    console.warn('API error loading hospitality projects:', err);
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px 20px; color: #ef4444;">
          Failed to load hospitality projects. Please refresh the page.
        </div>
      `;
    }
  }
}

function renderLongScrollProjects(projectsList) {
  const container = document.getElementById('hospitalityProjectsContainer');
  if (!container) return;

  if (projectsList.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 20px; color: #6b7280; background: #f9fafb; border-radius: 8px; border: 1px dashed #e5e7eb;">
        <p style="font-size: 1.05rem; margin-bottom: 8px; color: #111827; font-weight: 600;">No hospitality projects are currently published.</p>
        <p style="font-size: 0.88rem; color: #6b7280;">Add or publish projects in the Admin Dashboard to feature them here.</p>
      </div>
    `;
    return;
  }

  // Render Each Project in Continuous Full-Detail Format
  container.innerHTML = projectsList
    .map((p, pIdx) => {
      // Extract scope strictly for duration metadata
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

      // Formatted Title: "Title – City" if city not already present in title
      const safeTitle = p.title || (p.client_name ? `${p.client_name} Dining Venue` : 'Hospitality & Dining Project');
      const safeSlug = p.slug || `proj-${p.id}`;
      let displayHeading = safeTitle;
      if (p.location && p.title && !p.title.toLowerCase().includes(p.location.toLowerCase().split(',')[0])) {
        const city = p.location.split(',')[0].trim();
        displayHeading = `${p.title} – ${city}`;
      }

      // Duration lookup in scope
      const durationMatch = scopes.find((s) =>
        /day|month|week|handover|schedule|fast-track/i.test(s)
      );
      const durationText = durationMatch || '90 Days (Turnkey Fast-Track Handover)';

      // All Photos (Cover + Gallery)
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

      // Gallery Items HTML (showing 4 across desktop)
      const galleryItemsHtml = allPhotos
        .map(
          (imgUrl, imgIdx) => `
          <div class="gallery-item" data-project="${safeSlug}" data-index="${imgIdx}">
            <img
              src="${escapeHtml(imgUrl)}"
              alt="${escapeHtml(safeTitle)} – Photograph ${imgIdx + 1}"
              class="gallery-img"
              loading="lazy"
              onclick="openPortfolioLightbox('${safeSlug}', ${imgIdx})"
            >
            <span style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.72); color: #fff; font-size: 0.72rem; padding: 2px 6px; border-radius: 3px; pointer-events: none;">
              ${imgIdx + 1}/${allPhotos.length}
            </span>
          </div>
        `
        )
        .join('');

      // Carousel Dots
      const dotsHtml = Array.from({ length: Math.max(1, allPhotos.length) })
        .map(
          (_, dIdx) => `
          <button
            class="gallery-dot ${dIdx === 0 ? 'active' : ''}"
            id="dot-${safeSlug}-${dIdx}"
            aria-label="Go to photo ${dIdx + 1}"
            onclick="scrollProjectGalleryToIndex('${safeSlug}', ${dIdx})"
          ></button>
        `
        )
        .join('');

      const detailHref = p.slug ? `/hospitality/${p.slug}` : null;
      const headingMarkup = detailHref
        ? `<a href="${escapeHtml(detailHref)}" style="color: inherit; text-decoration: none;">${escapeHtml(displayHeading)}</a>`
        : escapeHtml(displayHeading);

      return `
        <article class="hospitality-project-block" id="${safeSlug}" data-slug="${safeSlug}">
          <!-- Top Section: 3-Column Layout -->
          <div class="hospitality-detail-grid">
            
            <!-- LEFT COLUMN: Project Identity -->
            <div class="col-identity">
              <span class="hospitality-kicker">HOSPITALITY PROJECT</span>
              <h2 class="hospitality-main-title">${headingMarkup}</h2>
              <div class="hospitality-green-line"></div>
              ${p.description ? `<p style="color: #4b5563; font-size: 0.9rem; line-height: 1.65; margin-top: 12px;">${escapeHtml(p.description)}</p>` : ''}
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
                <span class="project-info-value">${escapeHtml(p.location || 'Mumbai, Maharashtra')}</span>
              </div>

              <div class="project-info-item">
                <span class="project-info-label">PROJECT DURATION:</span>
                <span class="project-info-accent"></span>
                <span class="project-info-value">${escapeHtml(durationText)}</span>
              </div>
            </div>

            <!-- RIGHT COLUMN: Main Featured Cover Photograph -->
            <div class="col-cover">
              <div class="cover-img-wrapper" onclick="openPortfolioLightbox('${safeSlug}', 0)">
                <img
                  src="${escapeHtml(p.image_url)}"
                  alt="${escapeHtml(safeTitle)} – Featured Cover Photograph"
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

            <div class="gallery-carousel-wrapper" data-slug="${safeSlug}">
              <button class="gallery-nav-btn gallery-nav-prev" onclick="scrollProjectGallery('${safeSlug}', -1)" aria-label="Previous photograph">
                ‹
              </button>

              <div class="gallery-track" id="gallery-track-${safeSlug}">
                ${galleryItemsHtml}
              </div>

              <button class="gallery-nav-btn gallery-nav-next" onclick="scrollProjectGallery('${safeSlug}', 1)" aria-label="Next photograph">
                ›
              </button>
            </div>

            <!-- Carousel Indicators -->
            <div class="gallery-dots" id="gallery-dots-${safeSlug}">
              ${dotsHtml}
            </div>
          </div>

          <!-- Bottom Action Bar for Project -->
          <div style="display: flex; justify-content: flex-end; align-items: center; padding: 12px 0; margin-top: 8px; flex-wrap: wrap; gap: 10px;">
            ${detailHref ? `<a href="${escapeHtml(detailHref)}" style="font-size: 0.84rem; color: #111827; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin-right: 20px;">View Project Case Study →</a>` : ''}
            <a
              href="https://wa.me/919892699850?text=Hello%20Besim%20Design%2C%20I%20am%20interested%20in%20a%20hospitality%20architectural%20fit-out%20inspired%20by%20${encodeURIComponent(safeTitle)}."
              target="_blank"
              rel="noopener noreferrer"
              style="font-size: 0.84rem; color: #16a34a; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"
            >
              Discuss ${escapeHtml(safeTitle)} on WhatsApp 💬
            </a>
          </div>
        </article>
      `;
    })
    .join('');

  attachPortfolioListeners();
}

function attachPortfolioListeners() {
  // Attach scroll listeners to each gallery track to update its active dot
  state.projects.forEach((p) => {
    const slugOrId = p.slug || `proj-${p.id}`;
    const track = document.getElementById(`gallery-track-${slugOrId}`);
    if (!track) return;

    track.addEventListener(
      'scroll',
      () => {
        const itemWidth = track.firstElementChild
          ? track.firstElementChild.getBoundingClientRect().width + 16
          : 280;
        const activeIdx = Math.round(track.scrollLeft / itemWidth);
        const dots = document.querySelectorAll(`#gallery-dots-${slugOrId} .gallery-dot`);
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

window.openPortfolioLightbox = function (slugOrId, index) {
  const project = state.projects.find((p) => (p.slug && p.slug === slugOrId) || `proj-${p.id}` === slugOrId || p.id?.toString() === slugOrId?.toString());
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

  const safeTitle = project.title || (project.client_name ? `${project.client_name} Dining Venue` : 'Hospitality & Dining Project');
  state.activeLightboxSlug = slugOrId;
  state.activeLightboxIndex = index >= 0 && index < allPhotos.length ? index : 0;

  const modal = document.getElementById('portfolioLightboxModal');
  const img = document.getElementById('portfolioLightboxImg');
  const counter = document.getElementById('portfolioLightboxCounter');

  if (!modal || !img) return;

  img.src = allPhotos[state.activeLightboxIndex];
  img.alt = `${safeTitle} – Photo ${state.activeLightboxIndex + 1}`;

  if (counter) {
    counter.textContent = `Photo ${state.activeLightboxIndex + 1} of ${allPhotos.length} — ${safeTitle}`;
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
  const project = state.projects.find((p) => (p.slug && p.slug === state.activeLightboxSlug) || `proj-${p.id}` === state.activeLightboxSlug || p.id?.toString() === state.activeLightboxSlug?.toString());
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
  const project = state.projects.find((p) => (p.slug && p.slug === state.activeLightboxSlug) || `proj-${p.id}` === state.activeLightboxSlug || p.id?.toString() === state.activeLightboxSlug?.toString());
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

      showToast(`✓ Hospitality project brief ${formattedId} received!`, 'success');
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
  // Lightbox close/controls listeners
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

  initHospitalityForm();
  loadHospitalityProjects();
});
