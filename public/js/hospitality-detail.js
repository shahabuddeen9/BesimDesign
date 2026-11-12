/**
 * @file /public/js/hospitality-detail.js
 * @description Controller for Individual Hospitality Project Detail Page.
 * Matches reference screenshots: 3-column top section (Left: Project identity with green underline,
 * Middle: Structured project information with green accents, Right: Portrait featured cover photograph)
 * and horizontal 4-photo photographic gallery with carousel arrows, dots, swipe, and fullscreen lightbox.
 */

const CONFIG = {
  API_BASE_URL: window.location.origin,
};

const state = {
  project: null,
  allPhotos: [],
  currentLightboxIndex: 0,
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

function getSlugFromUrl() {
  const path = window.location.pathname.replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);

  // e.g. /hospitality/the-nutcracker-jio-mall-bkc, /hotels/grand-pavilion-luxury-hotel, etc.
  const validCategories = ['hospitality', 'hotels', 'residential', 'central-kitchen'];
  if (segments.length >= 2 && validCategories.includes(segments[0].toLowerCase())) {
    const rawSlug = segments[1].replace(/\.html$/, '');
    return decodeURIComponent(rawSlug);
  }

  // Fallback query param: ?slug=...
  const params = new URLSearchParams(window.location.search);
  if (params.get('slug')) {
    return params.get('slug').replace(/\.html$/, '');
  }

  // Fallback to default hospitality project if on detail template directly
  return 'the-nutcracker-jio-mall-bkc';
}

async function loadProjectDetail() {
  const slug = getSlugFromUrl();
  const loadingEl = document.getElementById('projectLoadingState');
  const contentEl = document.getElementById('projectContentState');
  const errorEl = document.getElementById('projectErrorState');

  if (!slug) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'block';
    return;
  }

  // If page was server-rendered, hydrate immediately from __INITIAL_PROJECT__
  if (window.__INITIAL_PROJECT__ && (window.__INITIAL_PROJECT__.slug === slug || !slug)) {
    state.project = window.__INITIAL_PROJECT__;
    renderProject(state.project);
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
    return;
  }

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/projects/${encodeURIComponent(slug)}?_t=${Date.now()}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Project "${slug}" not found`);
    }

    const json = await res.json();
    if (!json.success || !json.data) {
      throw new Error('Invalid project response');
    }

    state.project = json.data;
    renderProject(state.project);

    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
  } catch (err) {
    console.warn('Error loading project details:', err);
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'block';
      const msg = document.getElementById('projectErrorMessage');
      if (msg) msg.textContent = `The requested project "${slug}" could not be found or has been moved.`;
    }
  }
}

function renderProject(p) {
  const categoryConfig = {
    'hospitality': { name: 'Hospitality & Dining', url: '/hospitality', kicker: 'HOSPITALITY PROJECT' },
    'hotels': { name: 'Hotels & Resorts', url: '/hotels', kicker: 'HOTEL & RESORT ARCHITECTURE' },
    'residential': { name: 'Residential Architecture', url: '/residential', kicker: 'RESIDENTIAL ARCHITECTURE' },
    'central_kitchen': { name: 'Central Kitchens & Hubs', url: '/central-kitchen', kicker: 'COMMISSARY & CENTRAL KITCHEN' },
    'central-kitchen': { name: 'Central Kitchens & Hubs', url: '/central-kitchen', kicker: 'COMMISSARY & CENTRAL KITCHEN' },
    'restaurant': { name: 'Hospitality & Dining', url: '/hospitality', kicker: 'HOSPITALITY PROJECT' },
    'commercial': { name: 'Commercial Architecture', url: '/hospitality', kicker: 'COMMERCIAL ARCHITECTURE' },
  };

  const path = window.location.pathname.replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);
  const pathCat = segments.length >= 2 ? segments[0].toLowerCase() : null;
  const rawCat = (p.category || '').toLowerCase();
  const matchedKey = (pathCat && categoryConfig[pathCat]) ? pathCat : (categoryConfig[rawCat] ? rawCat : 'hospitality');
  const catInfo = categoryConfig[matchedKey] || categoryConfig['hospitality'];
  const catSlugPrefix = matchedKey === 'central_kitchen' ? 'central-kitchen' : matchedKey;

  // 1. Update Document Title & SEO Metadata
  const cleanTitle = p.title || 'Architectural Project';
  document.title = `${cleanTitle} | ${catInfo.name} | Besim Design`;

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute(
      'content',
      p.description ? p.description.slice(0, 155) : `Explore ${cleanTitle} turnkey ${catInfo.name.toLowerCase()} fit-out by Besim Design Mumbai.`
    );
  }

  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    canonical.setAttribute('href', `https://www.besimdesign.com/${catSlugPrefix}/${p.slug}`);
  }

  // 2. Breadcrumb & Kicker
  const breadcrumbCatEl = document.getElementById('projectBreadcrumbCategory');
  if (breadcrumbCatEl) {
    breadcrumbCatEl.textContent = catInfo.name;
    breadcrumbCatEl.setAttribute('href', catInfo.url);
  }

  const kickerEl = document.getElementById('projectKicker');
  if (kickerEl) {
    kickerEl.textContent = catInfo.kicker;
  }

  const backLinkEl = document.getElementById('projectBackLink');
  if (backLinkEl) {
    backLinkEl.textContent = `← Back to ${catInfo.name} Portfolio`;
    backLinkEl.setAttribute('href', catInfo.url);
  }

  const breadcrumbEl = document.getElementById('projectBreadcrumbTitle');
  if (breadcrumbEl) breadcrumbEl.textContent = cleanTitle;

  // 3. Left Column: Project Identity
  const titleEl = document.getElementById('projectTitle');
  if (titleEl) {
    // Format: "Title – Location" if location isn't already included in title
    let displayHeading = cleanTitle;
    if (p.location && !cleanTitle.toLowerCase().includes(p.location.toLowerCase().split(',')[0])) {
      const city = p.location.split(',')[0].trim();
      displayHeading = `${cleanTitle} – ${city}`;
    }
    titleEl.textContent = displayHeading;
  }

  const narrativeEl = document.getElementById('projectNarrative');
  if (narrativeEl) {
    narrativeEl.textContent = p.description || '';
  }

  // Parse Scope items
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

  const scopesContainer = document.getElementById('projectScopeTags');
  if (scopesContainer) {
    if (scopes.length > 0) {
      scopesContainer.innerHTML = scopes
        .map(
          (s) => `
          <span style="display: inline-block; font-size: 0.8rem; background: #f3f4f6; color: #374151; padding: 4px 10px; border-radius: 4px; margin-right: 6px; margin-bottom: 6px; border: 1px solid #e5e7eb;">
            ✓ ${escapeHtml(s)}
          </span>
        `
        )
        .join('');
    } else {
      scopesContainer.innerHTML = '';
    }
  }

  // 4. Middle Column: Project Information
  const executedByVal = document.getElementById('infoExecutedBy');
  if (executedByVal) {
    executedByVal.textContent = 'Besim Design (Turnkey Architectural Execution)';
  }

  const designedByVal = document.getElementById('infoDesignedBy');
  if (designedByVal) {
    if (p.client_name) {
      designedByVal.textContent = p.client_name;
    } else {
      designedByVal.textContent = 'Besim Design Architecture Studio';
    }
  }

  const areaVal = document.getElementById('infoArea');
  if (areaVal) {
    areaVal.textContent = p.area_sqft ? `${Number(p.area_sqft).toLocaleString()} Sq. Ft.` : '—';
  }

  const locationVal = document.getElementById('infoLocation');
  if (locationVal) {
    locationVal.textContent = p.location || 'Mumbai, Maharashtra';
  }

  const durationVal = document.getElementById('infoDuration');
  if (durationVal) {
    // Check if duration is specified in scope (e.g. "90 Days" or "Scheduled Early Handover")
    const durationMatch = scopes.find(
      (s) => /day|month|week|handover|schedule|fast-track/i.test(s)
    );
    if (durationMatch) {
      durationVal.textContent = durationMatch;
    } else {
      durationVal.textContent = '90 Days (Fast-Track Turnkey Handover)';
    }
  }

  // 5. Right Column: Main Featured Cover Photograph
  const coverImg = document.getElementById('projectCoverImg');
  if (coverImg && p.image_url) {
    coverImg.src = p.image_url;
    coverImg.alt = `${cleanTitle} – Featured Hospitality Cover Photograph`;
    coverImg.onclick = () => openLightbox(0);
  }

  // 6. Build Photo Gallery (allPhotos)
  state.allPhotos = [];
  if (p.image_url) state.allPhotos.push(p.image_url);

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
    if (img && typeof img === 'string' && !state.allPhotos.includes(img)) {
      state.allPhotos.push(img);
    }
  });

  renderGallery(state.allPhotos, cleanTitle);

  // 7. CTA prefill text
  const ctaBtn = document.getElementById('projectRfpCtaBtn');
  if (ctaBtn) {
    ctaBtn.href = `/hospitality.html#hospitalityRfpSection`;
  }
}

function renderGallery(photos, projectTitle) {
  const track = document.getElementById('galleryTrack');
  const dotsContainer = document.getElementById('galleryDots');
  const countEl = document.getElementById('galleryCountText');

  if (!track) return;

  if (countEl) {
    countEl.textContent = `${photos.length} High-Resolution Photographs`;
  }

  if (photos.length === 0) {
    track.innerHTML = `
      <div style="padding: 32px; color: #6b7280; text-align: center; width: 100%;">
        Additional gallery photographs for this project are currently being curated.
      </div>
    `;
    return;
  }

  track.innerHTML = photos
    .map(
      (url, index) => `
      <div class="gallery-item" data-index="${index}">
        <img
          src="${escapeHtml(url)}"
          alt="${escapeHtml(projectTitle)} – View ${index + 1}"
          class="gallery-img"
          loading="lazy"
          onclick="openLightbox(${index})"
        >
        <span style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); color: #fff; font-size: 0.72rem; padding: 2px 6px; border-radius: 3px; pointer-events: none;">
          ${index + 1}/${photos.length}
        </span>
      </div>
    `
    )
    .join('');

  // Render Carousel Dots
  if (dotsContainer) {
    const numDots = Math.max(1, photos.length);
    dotsContainer.innerHTML = Array.from({ length: numDots })
      .map(
        (_, i) => `
        <button
          class="gallery-dot ${i === 0 ? 'active' : ''}"
          aria-label="Go to slide ${i + 1}"
          onclick="scrollToGalleryIndex(${i})"
        ></button>
      `
      )
      .join('');
  }

  // Set up carousel controls
  initGalleryCarousel();
}

function initGalleryCarousel() {
  const track = document.getElementById('galleryTrack');
  const prevBtn = document.getElementById('galleryPrevBtn');
  const nextBtn = document.getElementById('galleryNextBtn');
  const dots = document.querySelectorAll('.gallery-dot');

  if (!track) return;

  if (prevBtn) {
    prevBtn.onclick = () => {
      const itemWidth = track.firstElementChild ? track.firstElementChild.getBoundingClientRect().width + 16 : 300;
      track.scrollBy({ left: -itemWidth, behavior: 'smooth' });
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      const itemWidth = track.firstElementChild ? track.firstElementChild.getBoundingClientRect().width + 16 : 300;
      track.scrollBy({ left: itemWidth, behavior: 'smooth' });
    };
  }

  // Update active dot on scroll
  track.addEventListener(
    'scroll',
    () => {
      if (dots.length === 0) return;
      const scrollLeft = track.scrollLeft;
      const itemWidth = track.firstElementChild ? track.firstElementChild.getBoundingClientRect().width + 16 : 300;
      const activeIdx = Math.round(scrollLeft / itemWidth);

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
}

window.scrollToGalleryIndex = function (index) {
  const track = document.getElementById('galleryTrack');
  if (!track) return;
  const item = track.children[index];
  if (item) {
    item.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }
};

// =============================================================================
// Fullscreen Lightbox
// =============================================================================

window.openLightbox = function (index) {
  if (!state.allPhotos || state.allPhotos.length === 0) return;
  state.currentLightboxIndex = index >= 0 && index < state.allPhotos.length ? index : 0;

  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  const counter = document.getElementById('lightboxCounter');

  if (!modal || !img) return;

  img.src = state.allPhotos[state.currentLightboxIndex];
  img.alt = `${state.project?.title || 'Hospitality Project'} – Photo ${state.currentLightboxIndex + 1}`;

  if (counter) {
    counter.textContent = `Photo ${state.currentLightboxIndex + 1} of ${state.allPhotos.length}`;
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeLightbox = function () {
  const modal = document.getElementById('lightboxModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
};

window.lightboxPrev = function () {
  if (!state.allPhotos || state.allPhotos.length === 0) return;
  state.currentLightboxIndex = (state.currentLightboxIndex - 1 + state.allPhotos.length) % state.allPhotos.length;
  window.openLightbox(state.currentLightboxIndex);
};

window.lightboxNext = function () {
  if (!state.allPhotos || state.allPhotos.length === 0) return;
  state.currentLightboxIndex = (state.currentLightboxIndex + 1) % state.allPhotos.length;
  window.openLightbox(state.currentLightboxIndex);
};

// Keyboard listener for Lightbox
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('lightboxModal');
  if (!modal || !modal.classList.contains('active')) return;

  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') lightboxPrev();
  if (e.key === 'ArrowRight') lightboxNext();
});

// =============================================================================
// Lifecycle Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('lightboxModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeLightbox();
    });
  }

  loadProjectDetail();
});
