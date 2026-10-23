/**
 * @file /public/js/showcase.js
 * @description Dedicated Showcase Controller for Besim Design.
 * Handles sector filtering (Hotels, Hospitality, Residential, Central Kitchens),
 * URL deep-linking, blueprint modal rendering, file uploads, and project brief submissions.
 */

const CONFIG = {
  API_BASE_URL: window.location.origin,
};

const SECTOR_META = {
  hotels: {
    name: 'Hotels & Boutique Resorts',
    badge: '★ Architectural Showcase • Hotels & Resorts',
    title: 'Hotels & Boutique Resorts Portfolio',
    subtitle: 'Explore our turnkey hotel fit-outs, luxury suites, grand double-height lobbies, acoustic guest corridors, and coastal resort developments executed across India.',
    icon: '🏨',
    defaultBriefNote: 'I am planning a hotel / boutique resort development and would like to consult on turnkey architectural fit-out and millwork.',
  },
  hospitality: {
    name: 'Hospitality & Fine Dining',
    badge: '★ Architectural Showcase • Hospitality & F&B',
    title: 'Hospitality & Fine Dining Portfolio',
    subtitle: 'Discover Mumbai’s most celebrated restaurants, high-energy cocktail lounges, artisan cafes, and culinary theatres delivered on schedule with flawless finishes.',
    icon: '🍽️',
    defaultBriefNote: 'I am launching a hospitality / dining venue and require turnkey interior contracting and specialized kitchen ventilation.',
  },
  residential: {
    name: 'Luxury Residential',
    badge: '★ Architectural Showcase • Luxury Living',
    title: 'Luxury Residential Portfolio',
    subtitle: 'Step into bespoke duplex sky villas, panoramic sea-facing penthouses, and private estates featuring Italian marble and custom factory joinery.',
    icon: '🏡',
    defaultBriefNote: 'I am looking for turnkey execution for a high-end luxury residential penthouse / villa project.',
  },
  central_kitchen: {
    name: 'Central Kitchens',
    badge: '★ Architectural Showcase • Culinary Infrastructure',
    title: 'Central Kitchens & Commissaries Portfolio',
    subtitle: 'High-capacity industrial commissaries, blast freezing chambers, stainless steel fabrication, fresh air makeup, and HACCP compliance.',
    icon: '🏭',
    defaultBriefNote: 'I require turnkey engineering and execution for a central production kitchen / food processing hub.',
  },
  all: {
    name: 'All Sectors',
    badge: '★ Comprehensive Architectural Portfolio',
    title: 'Complete Turnkey Architectural Portfolio',
    subtitle: 'Browse all executed landmarks across Hotels, Hospitality, Luxury Residential, and Central Kitchens delivered by Besim Design.',
    icon: '🌐',
    defaultBriefNote: 'I would like to explore turnkey architectural fit-out solutions for my upcoming project.',
  },
};

const state = {
  activeCategory: 'hotels',
  projects: [],
  uploadedFile: null,
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
// URL Parameter & Tab Synchronization
// =============================================================================

function getInitialCategory() {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get('category');
  if (cat && (SECTOR_META[cat] || cat === 'hotel' || cat === 'restaurant')) {
    if (cat === 'hotel') return 'hotels';
    if (cat === 'restaurant') return 'hospitality';
    return cat;
  }
  return 'hotels'; // Default showcase focus
}

function updateHeroMeta(category) {
  const meta = SECTOR_META[category] || SECTOR_META.all;
  const badgeEl = document.getElementById('showcaseBadge');
  const titleEl = document.getElementById('showcaseTitle');
  const subtitleEl = document.getElementById('showcaseSubtitle');
  const breadcrumbEl = document.getElementById('breadcrumbCategory');
  const uploadSectorTitle = document.getElementById('uploadSectorTitle');

  if (badgeEl) badgeEl.textContent = meta.badge;
  if (titleEl) titleEl.textContent = meta.title;
  if (subtitleEl) subtitleEl.textContent = meta.subtitle;
  if (breadcrumbEl) breadcrumbEl.textContent = meta.name;
  if (uploadSectorTitle) {
    uploadSectorTitle.textContent = category === 'all'
      ? 'Submit & Upload Your Project Brief or Layout Drawings'
      : `Submit & Upload Your ${meta.name} Project Brief / Drawings`;
  }

  // Preselect sector radio in upload form
  const sectorRadios = document.querySelectorAll('input[name="upload_sector"]');
  sectorRadios.forEach((radio) => {
    radio.checked = (radio.value === category || (category === 'all' && radio.value === 'hotels'));
  });

  document.title = `${meta.name} | Besim Design Architectural Showcase`;
}

function setCategory(category, pushHistory = true) {
  state.activeCategory = category;

  if (pushHistory) {
    const newUrl = `${window.location.pathname}?category=${category}`;
    window.history.pushState({ category }, '', newUrl);
  }

  // Update tabs
  document.querySelectorAll('.showcase-tab').forEach((tab) => {
    if (tab.dataset.category === category) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  updateHeroMeta(category);
  renderProjects(state.projects);
}

// =============================================================================
// Projects Rendering
// =============================================================================

async function loadProjects() {
  const grid = document.getElementById('showcaseGrid');
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
    console.warn('API error loading showcase projects:', err);
    renderProjects(state.projects);
  }
}

function matchesCategory(projectCat, activeCat) {
  if (activeCat === 'all') return true;
  if (activeCat === 'hotels') return projectCat === 'hotels' || projectCat === 'hotel';
  if (activeCat === 'hospitality') {
    return projectCat === 'hospitality' || projectCat === 'restaurant' || projectCat === 'bar' || projectCat === 'cafe';
  }
  if (activeCat === 'residential') return projectCat === 'residential';
  if (activeCat === 'central_kitchen') return projectCat === 'central_kitchen' || projectCat === 'cloud_kitchen' || projectCat === 'industrial';
  return projectCat === activeCat;
}

function renderProjects(projectsList) {
  const grid = document.getElementById('showcaseGrid');
  if (!grid) return;

  const filtered = projectsList.filter((p) => matchesCategory(p.category, state.activeCategory));

  if (filtered.length === 0) {
    const meta = SECTOR_META[state.activeCategory] || SECTOR_META.all;
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border-gold); border-radius: var(--radius-md);">
        <div style="font-size: 2.4rem; margin-bottom: 12px;">${meta.icon}</div>
        <h3 style="font-family: var(--font-serif); font-size: 1.4rem; color: #fff; margin-bottom: 8px;">
          Architectural Projects in ${meta.name}
        </h3>
        <p style="color: var(--text-muted); max-width: 500px; margin: 0 auto 20px;">
          Additional project landmarks are currently under confidential execution or ready to be initiated with your brief.
        </p>
        <a href="#uploadSection" class="btn btn-primary btn-sm">Upload Your Project Brief Here ↓</a>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map((p) => {
    let scopes = [];
    if (Array.isArray(p.scope)) {
      scopes = p.scope;
    } else if (typeof p.scope === 'string') {
      try { scopes = JSON.parse(p.scope); } catch (_) { scopes = p.scope.split(',').map(s => s.trim()); }
    }

    const scopeBadges = scopes.slice(0, 3).map(s => `<span class="project-scope-item">${escapeHtml(s)}</span>`).join('');
    const catLabel = (SECTOR_META[p.category]?.name || p.category).toUpperCase();

    return `
      <div class="project-card" data-category="${escapeHtml(p.category)}">
        <div class="project-img-wrap">
          <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.title)}" loading="lazy">
          <span class="project-cat-badge">${catLabel}</span>
        </div>
        <div class="project-body">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
            <span style="font-size: 0.75rem; color: var(--accent-gold); font-weight: 600; text-transform: uppercase;">
              ${escapeHtml(p.client_name || 'Bespoke Architectural Landmark')}
            </span>
          </div>
          <h3 class="project-title">${escapeHtml(p.title)}</h3>
          ${p.location ? `<div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px;">📍 ${escapeHtml(p.location)}</div>` : ''}
          <p class="project-desc">${escapeHtml(p.description)}</p>
          <div class="project-scope-list">
            ${scopeBadges}
          </div>
          <div class="project-card-footer">
            <button class="btn-link view-blueprint-btn" data-slug="${escapeHtml(p.slug)}">
              View Blueprint & Gallery →
            </button>
            <button class="btn btn-gold btn-xs upload-similar-btn" data-slug="${escapeHtml(p.slug)}" data-title="${escapeHtml(p.title)}" data-category="${escapeHtml(p.category)}" title="Upload brief for a project like this">
              Upload Similar Brief ↗
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  attachCardListeners();
}

function attachCardListeners() {
  // Blueprint buttons
  document.querySelectorAll('.view-blueprint-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.slug;
      const project = state.projects.find((p) => p.slug === slug);
      if (project) openProjectModal(project);
    });
  });

  // Upload similar buttons
  document.querySelectorAll('.upload-similar-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const title = btn.dataset.title;
      const category = btn.dataset.category;

      const uploadSec = document.getElementById('uploadSection');
      const projectNotes = document.getElementById('briefNotes');
      const projectName = document.getElementById('projectTitleInput');

      if (projectName && !projectName.value) {
        projectName.value = `Fit-out inspired by ${title}`;
      }

      if (projectNotes) {
        projectNotes.value = `We are looking for turnkey architectural fit-out and engineering similar to the "${title}" project. Please review our requirements.`;
      }

      // Sync category
      setCategory(category, false);

      if (uploadSec) {
        uploadSec.scrollIntoView({ behavior: 'smooth' });
        uploadSec.style.outline = '2px solid var(--accent-gold)';
        setTimeout(() => { uploadSec.style.outline = 'none'; }, 2000);
      }

      showToast(`Ready to upload your brief inspired by ${title}!`, 'success');
    });
  });
}

// =============================================================================
// Project Blueprint Modal
// =============================================================================

function openProjectModal(project) {
  const modal = document.getElementById('projectModal');
  const modalBody = document.getElementById('modalBody');
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

  let scopes = [];
  if (Array.isArray(project.scope)) {
    scopes = project.scope;
  } else if (typeof project.scope === 'string') {
    try { scopes = JSON.parse(project.scope); } catch (_) { scopes = project.scope.split(',').map(s => s.trim()); }
  }

  const galleryImagesHtml = allPhotos.map((img, idx) => `
    <div style="border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-subtle); height: 180px; position: relative; background: #000;">
      <a href="${escapeHtml(img)}" target="_blank" rel="noopener noreferrer" title="Click to view high-resolution photo ${idx + 1}" style="display: block; width: 100%; height: 100%;">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(project.title)} - Gallery ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;">
      </a>
      <span style="position: absolute; bottom: 6px; right: 6px; background: rgba(0,0,0,0.75); color: var(--accent-gold); font-size: 0.7rem; font-weight: 600; padding: 2px 6px; border-radius: 3px; border: 1px solid rgba(197, 168, 128, 0.3);">
        Photo ${idx + 1} of ${allPhotos.length}
      </span>
    </div>
  `).join('');

  const scopeListHtml = scopes.map((s) => `
    <li style="margin-bottom: 6px; display: flex; align-items: baseline; gap: 8px;">
      <span style="color: var(--accent-gold);">✓</span>
      <span>${escapeHtml(s)}</span>
    </li>
  `).join('');

  modalBody.innerHTML = `
    <div style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 20px; margin-bottom: 24px;">
      <div class="section-badge" style="margin-bottom: 10px;">${escapeHtml(project.category.toUpperCase())} BLUEPRINT</div>
      <h2 style="font-family: var(--font-serif); font-size: 1.8rem; color: #fff; margin-bottom: 8px;">
        ${escapeHtml(project.title)}
      </h2>
      <div style="display: flex; gap: 20px; flex-wrap: wrap; color: var(--text-dim); font-size: 0.85rem;">
        ${project.client_name ? `<span>🏛️ Client: <strong>${escapeHtml(project.client_name)}</strong></span>` : ''}
        ${project.location ? `<span>📍 Location: <strong>${escapeHtml(project.location)}</strong></span>` : ''}
      </div>
    </div>

    <div style="margin-bottom: 24px;">
      <h4 style="font-family: var(--font-serif); font-size: 1.1rem; color: var(--accent-gold); margin-bottom: 8px;">Architectural Overview</h4>
      <p style="color: var(--text-muted); line-height: 1.8; font-size: 0.95rem;">${escapeHtml(project.description)}</p>
    </div>

    ${scopes.length > 0 ? `
      <div style="margin-bottom: 24px; background: rgba(255,255,255,0.02); padding: 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
        <h4 style="font-family: var(--font-serif); font-size: 1.05rem; color: var(--text-main); margin-bottom: 12px;">Turnkey Engineering Scope</h4>
        <ul style="list-style: none; padding: 0; color: var(--text-muted); font-size: 0.88rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px;">
          ${scopeListHtml}
        </ul>
      </div>
    ` : ''}

    <div style="margin-bottom: 28px;">
      <h4 style="font-family: var(--font-serif); font-size: 1.05rem; color: var(--text-main); margin-bottom: 14px;">Project Gallery & Material Finishes</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;">
        ${galleryImagesHtml}
      </div>
    </div>

    <div style="display: flex; gap: 14px; justify-content: flex-end; padding-top: 18px; border-top: 1px solid var(--border-subtle); flex-wrap: wrap;">
      <button class="btn btn-secondary btn-sm" id="modalCloseAction">Close Blueprint</button>
      <button class="btn btn-primary btn-sm" id="modalUploadBriefAction">Upload Brief for Similar Project →</button>
    </div>
  `;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  const closeBtn = document.getElementById('modalCloseAction');
  if (closeBtn) closeBtn.onclick = closeModal;

  const uploadActionBtn = document.getElementById('modalUploadBriefAction');
  if (uploadActionBtn) {
    uploadActionBtn.onclick = () => {
      closeModal();
      const uploadSec = document.getElementById('uploadSection');
      const projectNotes = document.getElementById('briefNotes');
      const projectName = document.getElementById('projectTitleInput');

      if (projectName && !projectName.value) {
        projectName.value = `Project similar to ${project.title}`;
      }
      if (projectNotes) {
        projectNotes.value = `We are interested in turnkey fit-out execution similar to "${project.title}" (${project.category.toUpperCase()}). Please review our specifications.`;
      }
      setCategory(project.category, false);

      if (uploadSec) {
        uploadSec.scrollIntoView({ behavior: 'smooth' });
      }
    };
  }
}

function closeModal() {
  const modal = document.getElementById('projectModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// =============================================================================
// File Upload & Project Brief Submission
// =============================================================================

function initUploadSystem() {
  const dropzone = document.getElementById('uploadDropzone');
  const fileInput = document.getElementById('projectFileInput');
  const filePill = document.getElementById('uploadFilePill');
  const fileNameDisplay = document.getElementById('uploadFileName');
  const removeFileBtn = document.getElementById('btnRemoveFile');
  const form = document.getElementById('projectUploadForm');

  if (!dropzone || !fileInput) return;

  // Click to select
  dropzone.addEventListener('click', (e) => {
    if (e.target !== removeFileBtn) {
      fileInput.click();
    }
  });

  // Drag and drop events
  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFileSelected(fileInput.files[0]);
    }
  });

  function handleFileSelected(file) {
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    if (!validExtensions.includes(ext)) {
      showToast('Please select a JPG, PNG, WebP image or PDF drawing document.', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('File size exceeds the 10MB limit.', 'error');
      return;
    }

    state.uploadedFile = file;
    if (fileNameDisplay) fileNameDisplay.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    if (filePill) filePill.style.display = 'inline-flex';
    showToast(`Attached "${file.name}" for upload!`, 'success');
  }

  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.uploadedFile = null;
      fileInput.value = '';
      if (filePill) filePill.style.display = 'none';
    });
  }

  // Handle Form Submission
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const btnSubmit = document.getElementById('btnSubmitUpload');
      const submitText = document.getElementById('submitUploadText');
      const submitSpinner = document.getElementById('submitUploadSpinner');

      // Extract values
      const name = document.getElementById('uploaderName')?.value.trim();
      const phone = document.getElementById('uploaderPhone')?.value.trim();
      const email = document.getElementById('uploaderEmail')?.value.trim();
      const projectTitle = document.getElementById('projectTitleInput')?.value.trim();
      const clientFirm = document.getElementById('uploaderFirm')?.value.trim();
      const location = document.getElementById('uploaderLocation')?.value.trim();
      const area = parseFloat(document.getElementById('uploaderArea')?.value) || 0;
      const notes = document.getElementById('briefNotes')?.value.trim();
      const consent = document.getElementById('uploaderConsent')?.checked;

      // Selected sector
      const sectorRadio = document.querySelector('input[name="upload_sector"]:checked');
      const sector = sectorRadio ? sectorRadio.value : state.activeCategory;

      // Scopes checked
      const checkedScopes = [];
      document.querySelectorAll('input[name="project_scope"]:checked').forEach((cb) => {
        checkedScopes.push(cb.value);
      });

      if (!name || !phone || !email) {
        showToast('Please provide your name, phone number, and email.', 'error');
        return;
      }

      if (!consent) {
        showToast('Please consent to receive architectural project correspondence.', 'error');
        return;
      }

      try {
        if (btnSubmit) btnSubmit.disabled = true;
        if (submitText) submitText.style.display = 'none';
        if (submitSpinner) submitSpinner.style.display = 'inline';

        let uploadedFileUrl = '';

        // Upload file first if attached
        if (state.uploadedFile) {
          const formData = new FormData();
          formData.append('file', state.uploadedFile);

          const uploadRes = await fetch(`${CONFIG.API_BASE_URL}/api/upload`, {
            method: 'POST',
            body: formData,
          });

          if (!uploadRes.ok) {
            const uploadErr = await uploadRes.json();
            throw new Error(uploadErr.message || 'File upload failed');
          }

          const uploadData = await uploadRes.json();
          uploadedFileUrl = uploadData.url;
        }

        // Construct lead payload
        const fullMessage = [
          projectTitle ? `Project: ${projectTitle}` : '',
          clientFirm ? `Client/Firm: ${clientFirm}` : '',
          location ? `Location: ${location}` : '',
          checkedScopes.length > 0 ? `Required Scope: ${checkedScopes.join(', ')}` : '',
          uploadedFileUrl ? `Attached Drawing/Document: ${CONFIG.API_BASE_URL}${uploadedFileUrl}` : '',
          notes ? `\nProject Notes:\n${notes}` : '',
        ].filter(Boolean).join('\n');

        const payload = {
          name,
          phone,
          email,
          business_type: sector === 'all' ? 'hospitality' : sector,
          project_location: location,
          area_sqft: area,
          message: fullMessage,
          source: 'contact_form',
          consent: true,
          honeypot: '',
        };

        const res = await fetch(`${CONFIG.API_BASE_URL}/api/enquiries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.message || 'Failed to submit project brief');
        }

        // WhatsApp integration for +91 98926 99850
        const waPhone = '919892699850';
        const formattedId = json.id ? `#MSF-${json.id.toString().padStart(4, '0')}` : '';
        const waLines = [
          `*🏛️ BESIM DESIGN - PROJECT BRIEF SUBMISSION* ${formattedId}`,
          `*Client:* ${name}`,
          `*Phone:* ${phone}`,
          `*Email:* ${email}`,
          projectTitle ? `*Project Title:* ${projectTitle}` : '',
          clientFirm ? `*Client / Firm:* ${clientFirm}` : '',
          `*Sector:* ${(sector === 'all' ? 'Hospitality & Turnkey Fit-out' : sector).toUpperCase()}`,
          location ? `*Location:* ${location}` : '',
          area ? `*Area:* ${area.toLocaleString()} sq.ft` : '',
          checkedScopes.length > 0 ? `*Scope Required:* ${checkedScopes.join(', ')}` : '',
          uploadedFileUrl ? `*Uploaded Document/Drawings:* ${CONFIG.API_BASE_URL}${uploadedFileUrl}` : '',
          notes ? `\n*Project Brief & Notes:*\n${notes}` : '',
        ].filter(Boolean).join('\n');

        const waUrl = json.whatsapp_url || `https://wa.me/${waPhone}?text=${encodeURIComponent(waLines)}`;

        // Show clean minimal confirmation message
        const resultContainer = document.getElementById('uploadResultContainer');
        if (resultContainer) {
          resultContainer.innerHTML = `
            <div style="margin-top: 20px; padding: 18px; background: rgba(197, 168, 128, 0.08); border: 1px solid var(--border-gold); border-radius: var(--radius-sm); text-align: center;">
              <h4 style="font-family: var(--font-serif); color: #fff; margin-bottom: 6px;">Brief Submitted (${formattedId})</h4>
              <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 12px;">Connecting you automatically to WhatsApp (+91 98926 99850)...</p>
              <a href="${waUrl}" class="btn btn-primary btn-sm">Click here if not redirected automatically →</a>
            </div>
          `;
          resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        showToast(`✓ Brief ${formattedId} submitted!`, 'success');

        form.reset();
        state.uploadedFile = null;
        if (filePill) filePill.style.display = 'none';

        // Re-select current category
        setCategory(state.activeCategory, false);

        try {
          window.open(waUrl, '_blank', 'noopener,noreferrer');
        } catch (_) {}

      } catch (err) {
        showToast(err.message || 'Failed to submit. Please check your network.', 'error');
      } finally {
        if (btnSubmit) btnSubmit.disabled = false;
        if (submitText) submitText.style.display = 'inline';
        if (submitSpinner) submitSpinner.style.display = 'none';
      }
    });
  }
}

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. Determine active category from URL
  const initialCat = getInitialCategory();
  setCategory(initialCat, false);

  // 2. Setup category tabs
  document.querySelectorAll('.showcase-tab').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const cat = tab.dataset.category;
      setCategory(cat, true);
    });
  });

  // 3. Setup sector radio change in upload form
  document.querySelectorAll('input[name="upload_sector"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      setCategory(radio.value, true);
    });
  });

  // 4. Modal close handlers
  const modalClose = document.getElementById('modalClose');
  const projectModal = document.getElementById('projectModal');
  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (projectModal) {
    projectModal.addEventListener('click', (e) => {
      if (e.target === projectModal) closeModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // 5. Handle browser Back/Forward navigation
  window.addEventListener('popstate', (e) => {
    const cat = e.state?.category || getInitialCategory();
    setCategory(cat, false);
  });

  // 7. Initialize File Upload & Brief Submission
  initUploadSystem();

  // 8. Load Projects from API
  loadProjects();
});
