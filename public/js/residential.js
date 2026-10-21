/**
 * @file /public/js/residential.js
 * @description Dedicated Controller for Luxury Residential & Penthouse Showcase.
 * Fetches exclusively category=residential from /api/projects, renders luxury residential landmarks,
 * manages interactive architectural blueprint modals, and submits residential project briefs to /api/enquiries.
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
// Load & Render Residential Projects
// =============================================================================

async function loadResidentialProjects() {
  const grid = document.getElementById('residentialGrid');
  if (!grid) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/projects?category=residential`);
    if (!res.ok) throw new Error('Failed to load residential projects');
    const json = await res.json();

    if (json.success && Array.isArray(json.data) && json.data.length > 0) {
      state.projects = json.data;
      renderProjects(state.projects);
    }
  } catch (err) {
    console.warn('API unavailable or empty; retaining fallback residential landmarks.', err);
  }
}

function renderProjects(projectsList) {
  const grid = document.getElementById('residentialGrid');
  if (!grid) return;

  grid.innerHTML = projectsList.map((project) => {
    const scopes = Array.isArray(project.scope) ? project.scope : [];
    const scopeHtml = scopes.slice(0, 4).map(s => `<span class="project-scope-item">${escapeHtml(s)}</span>`).join('');
    const area = project.area_sqft ? `${Number(project.area_sqft).toLocaleString()} sq.ft` : 'Turnkey Scope';

    return `
      <div class="project-card" data-category="residential">
        <div class="project-img-wrap">
          <img src="${escapeHtml(project.image_url)}" alt="${escapeHtml(project.title)}" loading="lazy">
          <span class="project-cat-badge">LUXURY RESIDENTIAL</span>
        </div>
        <div class="project-body">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
            <span style="font-size: 0.75rem; color: var(--accent-gold); font-weight: 600; text-transform: uppercase;">
              ${escapeHtml(project.client_name || 'Bespoke Private Residence')}
            </span>
          </div>
          <h3 class="project-title">${escapeHtml(project.title)}</h3>
          <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px;">
            📍 ${escapeHtml(project.location || 'Mumbai, Maharashtra')}
          </div>
          <p class="project-desc">${escapeHtml(project.description)}</p>
          <div class="project-scope-list">
            ${scopeHtml}
          </div>
          <div class="project-card-footer">
            <button class="btn-link view-residential-blueprint-btn" data-slug="${escapeHtml(project.slug)}">
              View Architectural Blueprint →
            </button>
            <button class="btn btn-gold btn-xs request-residential-brief-btn" data-title="${escapeHtml(project.title)}" data-area="${escapeHtml(project.area_sqft || '')}">
              Upload Residence Brief ↗
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  bindCardActionEvents();
}

function bindCardActionEvents() {
  document.querySelectorAll('.view-residential-blueprint-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const slug = btn.getAttribute('data-slug');
      const found = state.projects.find(p => p.slug === slug);
      if (found) {
        openBlueprintModal(found);
      } else {
        openFallbackModal(slug);
      }
    });
  });

  document.querySelectorAll('.request-residential-brief-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const title = btn.getAttribute('data-title');
      const area = btn.getAttribute('data-area');
      
      const formSection = document.getElementById('residentialBriefSection');
      if (formSection) {
        formSection.scrollIntoView({ behavior: 'smooth' });
      }

      const notesField = document.getElementById('residentialMessage');
      if (notesField && title) {
        notesField.value = `Inquiry benchmarked against "${title}" (Luxury Turnkey Scope). We are looking for turnkey interior execution and factory-crafted furniture fit-out.`;
        notesField.focus();
      }

      if (area) {
        const areaInput = document.getElementById('residentialArea');
        if (areaInput) areaInput.value = area;
      }
    });
  });
}

// =============================================================================
// Blueprint Modal Logic
// =============================================================================

function openBlueprintModal(project) {
  const modal = document.getElementById('residentialModal');
  const modalBody = document.getElementById('residentialModalBody');
  if (!modal || !modalBody) return;

  const scopes = Array.isArray(project.scope) ? project.scope : [];
  let rawGallery = [];
  if (Array.isArray(project.gallery)) {
    rawGallery = project.gallery;
  } else if (typeof project.gallery === 'string') {
    try { rawGallery = JSON.parse(project.gallery); } catch (_) { rawGallery = []; }
  }

  const allPhotos = [];
  if (project.image_url) allPhotos.push(project.image_url);
  rawGallery.forEach((img) => {
    if (img && !allPhotos.includes(img)) allPhotos.push(img);
  });

  let galleryHtml = '';
  if (allPhotos.length > 0) {
    galleryHtml = `
      <div style="margin-top: 24px;">
        <h4 style="font-family: var(--font-serif); font-size: 1.1rem; color: var(--accent-gold); margin-bottom: 12px;">
          Architectural Gallery & Site Details (${allPhotos.length} Photos)
        </h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
          ${allPhotos.map((img, idx) => `
            <div style="border-radius: var(--radius-sm); overflow: hidden; position: relative; border: 1px solid var(--border-subtle); height: 130px; background: #000;">
              <a href="${escapeHtml(img)}" target="_blank" rel="noopener noreferrer" title="Click to view high-resolution photo ${idx + 1}" style="display: block; width: 100%; height: 100%;">
                <img src="${escapeHtml(img)}" alt="${escapeHtml(project.title)} - View ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.3s ease;">
              </a>
              <span style="position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.75); color: var(--accent-gold); font-size: 0.65rem; font-weight: 600; padding: 2px 5px; border-radius: 3px; border: 1px solid rgba(197, 168, 128, 0.3);">
                Photo ${idx + 1}
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  modalBody.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px;">
      <div>
        <span class="section-badge" style="margin-bottom: 8px;">Architectural Blueprint & Spec</span>
        <h2 style="font-family: var(--font-serif); font-size: 1.8rem; color: #fff; margin-bottom: 4px;">
          ${escapeHtml(project.title)}
        </h2>
        <div style="font-size: 0.88rem; color: var(--text-dim);">
          Client: <strong style="color: #fff;">${escapeHtml(project.client_name || 'Bespoke Private Residence')}</strong> • 📍 ${escapeHtml(project.location || 'Mumbai')}
        </div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 24px; background: rgba(18, 20, 24, 0.6); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
      <div>
        <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Scale & Typology</div>
        <div style="font-size: 1.25rem; font-weight: 700; color: var(--accent-gold); font-family: var(--font-serif);">
          Turnkey Luxury
        </div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Millwork Origin</div>
        <div style="font-size: 1.1rem; font-weight: 600; color: #fff;">Nalasopara Factory</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Flooring Spec</div>
        <div style="font-size: 1.1rem; font-weight: 600; color: #fff;">Book-matched Italian Marble</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Contract Model</div>
        <div style="font-size: 1.1rem; font-weight: 600; color: #fff;">Turnkey Bare-Shell to Handover</div>
      </div>
    </div>

    <div style="border-radius: var(--radius-md); overflow: hidden; margin-bottom: 24px; border: 1px solid var(--border-subtle); max-height: 380px;">
      <img src="${escapeHtml(project.image_url)}" alt="${escapeHtml(project.title)}" style="width: 100%; height: 100%; object-fit: cover; display: block;">
    </div>

    <h4 style="font-family: var(--font-serif); font-size: 1.1rem; color: var(--accent-gold); margin-bottom: 8px;">
      Design Intent & Spatial Execution
    </h4>
    <p style="color: var(--text-muted); line-height: 1.8; font-size: 0.95rem; margin-bottom: 20px;">
      ${escapeHtml(project.description)}
    </p>

    <h4 style="font-family: var(--font-serif); font-size: 1.1rem; color: var(--accent-gold); margin-bottom: 8px;">
      Engineering & Turnkey Scope
    </h4>
    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px;">
      ${scopes.map(s => `<span class="project-scope-item" style="font-size: 0.82rem; padding: 6px 12px;">${escapeHtml(s)}</span>`).join('')}
    </div>

    ${galleryHtml}

    <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
      <button class="btn btn-secondary btn-sm" id="closeResidentialModalBtn">Close Blueprint</button>
      <button class="btn btn-gold btn-sm" id="modalPlanResidentialBtn" data-title="${escapeHtml(project.title)}" data-area="${escapeHtml(project.area_sqft || '')}">
        Upload Residence Brief & Drawings →
      </button>
    </div>
  `;

  modal.classList.add('active');

  const closeBtn = document.getElementById('closeResidentialModalBtn');
  if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');

  const planBtn = document.getElementById('modalPlanResidentialBtn');
  if (planBtn) {
    planBtn.onclick = () => {
      modal.classList.remove('active');
      const formSection = document.getElementById('residentialBriefSection');
      if (formSection) formSection.scrollIntoView({ behavior: 'smooth' });

      const notesField = document.getElementById('residentialMessage');
      if (notesField) {
        notesField.value = `Inquiry inspired by ${project.title}. Looking for end-to-end turnkey residential architecture and factory finished joinery.`;
        notesField.focus();
      }
    };
  }
}

function openFallbackModal(slug) {
  const fallbackProjects = {
    'sky-villa-parinee-bkc': {
      title: 'The Sky Villa at Parinee Crescenzo',
      client_name: 'Parinee Group HNI Penthouse',
      location: 'Bandra Kurla Complex, Mumbai',
      area_sqft: 7500,
      description: 'Turnkey duplex sky villa fit-out with imported Italian marble flooring, bespoke walnut veneer wardrobes produced in our Nalasopara factory, smart home automation, and acoustic master bedrooms.',
      scope: ['Complete Turnkey Execution', 'Italian Marble Cladding', 'Bespoke Factory Wardrobes', 'Home Automation Integration', 'Architectural Lighting'],
      image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      gallery: [
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&w=800&q=80'
      ]
    },
    'sea-facing-penthouse-worli': {
      title: 'Sea-Facing Luxury Penthouse Residence',
      client_name: 'Private HNI Residence',
      location: 'Worli Sea Face, Mumbai',
      area_sqft: 6000,
      description: 'Ultra-luxury sea-facing apartment renovation featuring panoramic glass walls, fluted oak timber paneling, concealed climate air conditioning, imported kitchen cabinetry, and custom vanity suites.',
      scope: ['Turnkey Architectural Renovation', 'Custom Fluted Oak Paneling', 'Smart VRV Air Conditioning', 'Modular Dry Kitchen', 'Luxury Bath Suites'],
      image_url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
      gallery: [
        'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80'
      ]
    }
  };

  const project = fallbackProjects[slug] || fallbackProjects['sky-villa-parinee-bkc'];
  openBlueprintModal(project);
}

// =============================================================================
// File Upload & Residential Brief Form Submission
// =============================================================================

function setupFileUpload() {
  const dropzone = document.getElementById('residentialDropzone');
  const fileInput = document.getElementById('residentialFileInput');
  const fileStatus = document.getElementById('residentialFileStatus');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      handleFileSelected(fileInput.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFileSelected(fileInput.files[0]);
    }
  });

  function handleFileSelected(file) {
    if (!file) return;
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    if (file.size > 10 * 1024 * 1024) {
      showToast('File exceeds 10MB limit. Please upload a smaller file.', 'error');
      fileInput.value = '';
      if (fileStatus) fileStatus.innerHTML = '';
      return;
    }
    if (fileStatus) {
      fileStatus.innerHTML = `
        <div style="margin-top: 10px; font-size: 0.82rem; color: var(--accent-gold); display: flex; align-items: center; gap: 8px;">
          <span>📎</span>
          <span><strong>${escapeHtml(file.name)}</strong> (${sizeMb} MB) ready for upload</span>
        </div>
      `;
    }
  }
}

function setupResidentialForm() {
  const form = document.getElementById('residentialBriefForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const honeypot = document.getElementById('residentialHoneypot');
    if (honeypot && honeypot.value.trim() !== '') {
      console.warn('Spam detected via honeypot');
      return;
    }

    const name = document.getElementById('residentialName')?.value.trim();
    const email = document.getElementById('residentialEmail')?.value.trim();
    const phone = document.getElementById('residentialPhone')?.value.trim();
    const propertyType = document.getElementById('residentialPropertyType')?.value || 'Luxury Villa / Penthouse';
    const location = document.getElementById('residentialLocation')?.value.trim();
    const areaSqft = document.getElementById('residentialArea')?.value.trim();
    const timeline = document.getElementById('residentialTimeline')?.value || '3-6 months';
    const message = document.getElementById('residentialMessage')?.value.trim();
    const fileInput = document.getElementById('residentialFileInput');

    if (!name || !email || !phone) {
      showToast('Please fill in your name, email, and phone number.', 'error');
      return;
    }

    // Phone validation
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      showToast('Please enter a valid 10-digit mobile number.', 'error');
      return;
    }

    const scopeCheckboxes = document.querySelectorAll('input[name="resScope"]:checked');
    const selectedScopes = Array.from(scopeCheckboxes).map(cb => cb.value);

    const submitBtn = document.getElementById('btnSubmitResidential');
    const submitText = document.getElementById('btnSubmitResidentialText');
    const submitSpinner = document.getElementById('btnSubmitResidentialSpinner');

    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.style.display = 'none';
    if (submitSpinner) submitSpinner.style.display = 'inline-block';

    let uploadedFileUrl = null;

    // Optional File Upload
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      try {
        const formData = new FormData();
        formData.append('image', fileInput.files[0]);

        const uploadRes = await fetch(`${CONFIG.API_BASE_URL}/api/upload`, {
          method: 'POST',
          body: formData,
        });

        if (uploadRes.ok) {
          const uploadJson = await uploadRes.json();
          if (uploadJson.success && uploadJson.data?.imageUrl) {
            uploadedFileUrl = uploadJson.data.imageUrl;
          }
        }
      } catch (err) {
        console.warn('File upload skipped or non-fatal:', err);
      }
    }

    const fullMessage = `
[LUXURY RESIDENTIAL ARCHITECTURAL BRIEF]
Property Type: ${propertyType}
Target Handover: ${timeline}
Carpet Area: ${areaSqft ? areaSqft + ' sq.ft' : 'Unspecified'}
Project Location: ${location || 'Mumbai'}
Selected Turnkey Scope: ${selectedScopes.length > 0 ? selectedScopes.join(', ') : 'Turnkey Bare-Shell to Handover'}
${uploadedFileUrl ? 'Attached Architectural Drawing: ' + uploadedFileUrl : ''}

Project Details:
${message || 'Requesting architectural consultation and turnkey interior quotation.'}
    `.trim();

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/enquiries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          business_type: 'residential',
          area_sqft: areaSqft ? Number(areaSqft) : 5000,
          location: location || 'Mumbai, Maharashtra',
          message: fullMessage,
          source: 'quote',
        }),
      });

      const json = await response.json();

      if (response.ok && json.success) {
        const waPhone = '919892699850';
        const formattedId = json.id ? `#MSF-${json.id.toString().padStart(4, '0')}` : '';
        const waLines = [
          `*🏛️ BESIM DESIGN - LUXURY RESIDENTIAL BRIEF* ${formattedId}`,
          `*Client:* ${name}`,
          `*Phone:* ${phone}`,
          `*Email:* ${email}`,
          `*Sector:* LUXURY RESIDENTIAL`,
          propertyType ? `*Property Type:* ${propertyType}` : '',
          location ? `*Location:* ${location}` : '',
          areaSqft ? `*Carpet Area:* ${areaSqft} sq.ft` : '',
          timeline ? `*Timeline:* ${timeline}` : '',
          selectedScopes.length > 0 ? `*Scope:* ${selectedScopes.join(', ')}` : '',
          uploadedFileUrl ? `*Drawings:* ${CONFIG.API_BASE_URL}${uploadedFileUrl}` : '',
          message ? `\n*Details:*\n${message}` : '',
        ].filter(Boolean).join('\n');

        const waUrl = json.whatsapp_url || `https://wa.me/${waPhone}?text=${encodeURIComponent(waLines)}`;

        showToast('✓ Luxury Residential brief registered! Opening WhatsApp...', 'success');
        form.reset();
        const fileStatus = document.getElementById('residentialFileStatus');
        if (fileStatus) fileStatus.innerHTML = '';

        setTimeout(() => {
          window.location.href = waUrl;
        }, 300);
      } else {
        throw new Error(json.message || 'Submission failed. Please check inputs.');
      }
    } catch (err) {
      showToast(err.message || 'Failed to submit residence brief. Please try again or call us directly.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (submitText) submitText.style.display = 'inline-block';
      if (submitSpinner) submitSpinner.style.display = 'none';
    }
  });
}

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  loadResidentialProjects();
  setupFileUpload();
  setupResidentialForm();

  // Modal backdrop close
  const modal = document.getElementById('residentialModal');
  const modalClose = document.getElementById('residentialModalClose');
  if (modalClose && modal) {
    modalClose.addEventListener('click', () => modal.classList.remove('active'));
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }

  // Mobile nav toggle & smooth dropdown handling
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
});
