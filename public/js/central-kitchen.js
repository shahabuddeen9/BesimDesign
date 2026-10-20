/**
 * @file /public/js/central-kitchen.js
 * @description Dedicated frontend logic for the Central Kitchen & Commissary engineering showcase page.
 * Loads and displays exclusively Central Kitchen projects from /api/projects?category=central_kitchen,
 * provides project blueprint modal inspection, and handles dedicated commissary consultation submissions.
 */

const CONFIG = {
  API_BASE_URL: window.location.origin,
};

const state = {
  projects: [],
  selectedProject: null,
};

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
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
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// =============================================================================
// Load & Render Central Kitchen Projects Exclusively
// =============================================================================

async function loadCentralKitchenProjects() {
  const grid = document.getElementById('centralKitchenGrid');
  if (!grid) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/projects?category=central_kitchen`);
    if (!res.ok) throw new Error('Failed to fetch central kitchen projects');
    const json = await res.json();

    if (json.success && Array.isArray(json.data) && json.data.length > 0) {
      state.projects = json.data;
      renderCentralKitchenProjects(state.projects);
    }
  } catch (err) {
    console.warn('API unavailable; retaining curated static commissary fallbacks.', err);
  }
}

function renderCentralKitchenProjects(projectsList) {
  const grid = document.getElementById('centralKitchenGrid');
  if (!grid) return;

  grid.innerHTML = projectsList.map((p) => {
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

    const escapedTitle = escapeHtml(p.title);
    const escapedDesc = escapeHtml(p.description);
    const escapedClient = escapeHtml(p.client_name || 'Commercial Client');
    const escapedLocation = escapeHtml(p.location || 'Mumbai Hub');
    const escapedImg = escapeHtml(p.image_url);
    const escapedSlug = escapeHtml(p.slug);

    return `
      <div class="project-card" data-category="central_kitchen">
        <div class="project-img-wrap">
          <img src="${escapedImg}" alt="${escapedTitle}" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80'">
          <span class="project-cat-badge">CENTRAL KITCHEN</span>
        </div>
        <div class="project-body">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
            <span style="font-size: 0.75rem; color: var(--accent-gold); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">Client: ${escapedClient}</span>
            ${p.area_sqft ? `<span style="font-size: 0.75rem; color: var(--text-dim);">${Number(p.area_sqft).toLocaleString()} sq.ft</span>` : ''}
          </div>
          <h3 class="project-title">${escapedTitle}</h3>
          ${escapedLocation ? `<div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px;">📍 ${escapedLocation}</div>` : ''}
          <p class="project-desc">${escapedDesc}</p>
          <div class="project-scope-list">
            ${scopes.slice(0, 5).map((s) => `<span class="project-scope-item">${escapeHtml(s)}</span>`).join('')}
          </div>
          <div class="project-card-footer">
            <button class="btn-link view-project-btn" data-slug="${escapedSlug}">
              View Project Blueprint →
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  attachProjectModalTriggers();
}

// =============================================================================
// Project Blueprint Modal
// =============================================================================

function attachProjectModalTriggers() {
  document.querySelectorAll('.view-project-btn').forEach((btn) => {
    btn.onclick = () => {
      const slug = btn.getAttribute('data-slug');
      if (slug) openProjectModal(slug);
    };
  });
}

async function openProjectModal(slug) {
  const modal = document.getElementById('projectModal');
  const modalBody = document.getElementById('modalBody');
  if (!modal || !modalBody) return;

  // Check local state first
  let project = state.projects.find((p) => p.slug === slug);

  if (!project) {
    try {
      const res = await fetch(`${CONFIG.API_BASE_URL}/api/projects/${slug}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          project = json.data;
        }
      }
    } catch (_) {}
  }

  if (!project) {
    showToast('Project blueprint details are currently unavailable.', 'error');
    return;
  }

  let scopes = [];
  if (Array.isArray(project.scope)) {
    scopes = project.scope;
  } else if (typeof project.scope === 'string') {
    try {
      const parsed = JSON.parse(project.scope);
      scopes = Array.isArray(parsed) ? parsed : [project.scope];
    } catch (_) {
      scopes = project.scope.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  let gallery = [];
  if (Array.isArray(project.gallery)) {
    gallery = project.gallery;
  } else if (typeof project.gallery === 'string') {
    try {
      const parsed = JSON.parse(project.gallery);
      gallery = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      gallery = [];
    }
  }

  const escapedTitle = escapeHtml(project.title);
  const escapedClient = escapeHtml(project.client_name || 'Confidential Client');
  const escapedLocation = escapeHtml(project.location || 'Maharashtra, India');
  const escapedDesc = escapeHtml(project.description);
  const escapedImg = escapeHtml(project.image_url);

  modalBody.innerHTML = `
    <div style="position: relative; height: 320px; overflow: hidden; border-radius: var(--radius-sm); margin-bottom: 24px;">
      <img src="${escapedImg}" alt="${escapedTitle}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80'">
      <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 24px; background: linear-gradient(to top, rgba(8,11,17,0.95), transparent);">
        <span class="project-cat-badge" style="position: static; margin-bottom: 8px; display: inline-block;">CENTRAL KITCHEN SPECIALIZATION</span>
        <h2 style="font-size: 1.6rem; color: #fff; margin-top: 4px;">${escapedTitle}</h2>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border-subtle);">
      <div>
        <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Client</div>
        <div style="font-weight: 600; color: var(--accent-gold);">${escapedClient}</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Facility Location</div>
        <div style="font-weight: 500;">📍 ${escapedLocation}</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Production Scale</div>
        <div style="font-weight: 600; color: #fff;">${project.area_sqft ? Number(project.area_sqft).toLocaleString() + ' sq.ft' : 'Commercial Scale'}</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">HACCP Compliance</div>
        <div style="font-weight: 500; color: #34d399;">✓ Verified & Inspected</div>
      </div>
    </div>

    <div style="margin-bottom: 24px;">
      <h4 style="font-size: 1.1rem; margin-bottom: 8px;">Facility Architectural Brief</h4>
      <p style="color: var(--text-muted); line-height: 1.7;">${escapedDesc}</p>
    </div>

    <div style="margin-bottom: 28px;">
      <h4 style="font-size: 1.1rem; margin-bottom: 12px;">Turnkey Scope of Engineering</h4>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        ${scopes.map((s) => `
          <span style="font-size: 0.8rem; padding: 6px 14px; background: rgba(197, 168, 128, 0.1); border: 1px solid var(--border-gold); border-radius: var(--radius-sm); color: var(--accent-gold);">
            ✓ ${escapeHtml(s)}
          </span>
        `).join('')}
      </div>
    </div>

    ${gallery.length > 0 ? `
      <div>
        <h4 style="font-size: 1.1rem; margin-bottom: 14px;">Technical Blueprint & Site Gallery</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;">
          ${gallery.map((g) => `
            <div style="height: 160px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-subtle);">
              <img src="${escapeHtml(g)}" alt="${escapedTitle} Detail" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div style="margin-top: 32px; padding: 20px; background: rgba(15, 20, 32, 0.7); border: 1px solid var(--border-gold); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center; flex-wrap: gap; gap: 16px;">
      <div>
        <strong style="color: #fff; font-size: 0.95rem;">Planning a similar central commissary facility?</strong>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 2px 0 0 0;">Consult with our turnkey food service architects and MEP engineering team.</p>
      </div>
      <a href="#consultation" class="btn btn-gold btn-sm" onclick="closeProjectModal();">Request Technical Layout →</a>
    </div>
  `;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeProjectModal() {
  const modal = document.getElementById('projectModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// =============================================================================
// Dedicated Central Kitchen Consultation Form
// =============================================================================

function initCentralKitchenForm() {
  const form = document.getElementById('ckContactForm');
  if (!form) return;

  const alertBox = document.getElementById('ckFormAlert');
  const submitBtn = document.getElementById('btnSubmitCk');
  const btnText = document.getElementById('btnTextCk');
  const btnSpinner = document.getElementById('btnSpinnerCk');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertBox) alertBox.style.display = 'none';

    const name = document.getElementById('ckName')?.value.trim();
    const phone = document.getElementById('ckPhone')?.value.trim();
    const email = document.getElementById('ckEmail')?.value.trim();
    const area = document.getElementById('ckArea')?.value;
    const location = document.getElementById('ckLocation')?.value.trim();
    const message = document.getElementById('ckMessage')?.value.trim();
    const consent = document.getElementById('ckConsent')?.checked;
    const honeypot = document.getElementById('ckHoneypot')?.value;

    if (!name || !phone || !email) {
      displayFormError('Please enter your Name, Phone Number, and Email Address.');
      return;
    }

    if (!consent) {
      displayFormError('Please confirm your consent for our team to contact you.');
      return;
    }

    const payload = {
      name,
      phone,
      email,
      business_type: 'central_kitchen',
      project_location: location || '',
      area_sqft: parseInt(area, 10) || 0,
      message: message || '',
      source: 'contact_form',
      consent: true,
      honeypot: honeypot || '',
    };

    submitBtn.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (btnSpinner) btnSpinner.style.display = 'inline';

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/enquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        form.reset();
        displayFormSuccess(
          `Thank you, ${name}! Your Central Kitchen enquiry (#BD-${result.id.toString().padStart(4, '0')}) has been registered. Our principal culinary engineering team will contact you within 1 business day.`
        );
        showToast('Enquiry submitted successfully! Confirmation sent to your email.', 'success');
      } else {
        let errorMsg = result.message || 'Unable to submit enquiry. Please check your inputs.';
        if (result.errors && Array.isArray(result.errors)) {
          errorMsg = result.errors.map((e) => e.message).join(' | ');
        }
        displayFormError(errorMsg);
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      console.error('Submission failed:', err);
      const networkMsg = 'Network connectivity issue. Please reach us directly at besimdesigne@gmail.com.';
      displayFormError(networkMsg);
      showToast(networkMsg, 'error');
    } finally {
      submitBtn.disabled = false;
      if (btnText) btnText.style.display = 'inline';
      if (btnSpinner) btnSpinner.style.display = 'none';
    }
  });

  function displayFormError(msg) {
    if (!alertBox) return;
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(239, 68, 68, 0.12)';
    alertBox.style.border = '1px solid #ef4444';
    alertBox.style.color = '#fca5a5';
    alertBox.style.padding = '14px 18px';
    alertBox.style.borderRadius = 'var(--radius-sm)';
    alertBox.style.fontSize = '0.9rem';
    alertBox.innerHTML = `<strong>Submission Error:</strong> ${msg}`;
  }

  function displayFormSuccess(msg) {
    if (!alertBox) return;
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(16, 185, 129, 0.12)';
    alertBox.style.border = '1px solid #10b981';
    alertBox.style.color = '#6ee7b7';
    alertBox.style.padding = '18px 20px';
    alertBox.style.borderRadius = 'var(--radius-sm)';
    alertBox.style.fontSize = '0.95rem';
    alertBox.style.lineHeight = '1.6';
    alertBox.innerHTML = `<strong>Commissary Enquiry Confirmed ✓</strong><br>${msg}`;
  }
}

// =============================================================================
// DOM Initializer
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Mobile Nav Toggle
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });

    document.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
      });
    });
  }

  // Modal event listeners
  const modal = document.getElementById('projectModal');
  const modalClose = document.getElementById('modalClose');
  if (modal && modalClose) {
    modalClose.addEventListener('click', closeProjectModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeProjectModal();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeProjectModal();
  });

  // Sticky Navbar scroll
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (!navbar) return;
    if (window.scrollY > 30) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }, { passive: true });

  // Initialize
  attachProjectModalTriggers();
  initCentralKitchenForm();
  loadCentralKitchenProjects();
});
