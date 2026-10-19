/**
 * @file /public/admin/admin.js
 * @description Administrative dashboard controller for Besim Design CRM.
 * Manages authenticated sessions, metric cards, enquiries CRM, portfolio CRUD,
 * file uploads, testimonials, and FAQs. Auto-redirects to login on 401.
 */

const state = {
  activeTab: 'enquiries',
  enquiries: [],
  projects: [],
  clients: [],
  testimonials: [],
  faqs: [],
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  },
  filters: {
    search: '',
    status: 'all',
    source: 'all',
  },
};

// =============================================================================
// Session Verification & Logout
// =============================================================================

async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.replace('/admin/login.html');
      return false;
    }
    const data = await res.json();
    if (data.success && data.admin) {
      const emailEl = document.getElementById('loggedAdminEmail');
      if (emailEl) emailEl.textContent = data.admin.email;
      return true;
    }
    window.location.replace('/admin/login.html');
    return false;
  } catch (_) {
    window.location.replace('/admin/login.html');
    return false;
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.replace('/admin/login.html');
  }
}

// =============================================================================
// Modal Helpers & In-Dashboard Toasts
// =============================================================================

function showAdminToast(message, type = 'success') {
  let toastContainer = document.getElementById('adminToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'adminToastContainer';
    toastContainer.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 99999; display: flex; flex-direction: column; gap: 10px;';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const isErr = type === 'error';
  toast.style.cssText = `
    padding: 14px 20px;
    background: ${isErr ? 'rgba(239, 68, 68, 0.95)' : 'rgba(21, 27, 43, 0.95)'};
    color: #fff;
    border: 1px solid ${isErr ? '#ef4444' : 'var(--gold, #c5a880)'};
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    font-size: 0.88rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: all 0.3s ease;
  `;
  toast.innerHTML = `<span>${isErr ? '⚠️' : '✓'}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

// =============================================================================
// Tab Switching & Deep Linking
// =============================================================================

function switchTab(tabName) {
  const navBtns = document.querySelectorAll('.nav-btn');
  const panes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('pageTitle');

  navBtns.forEach((b) => {
    if (b.dataset.tab === tabName) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  panes.forEach((p) => {
    p.style.display = p.id === `pane-${tabName}` ? 'block' : 'none';
  });

  state.activeTab = tabName;

  if (tabName === 'enquiries') {
    if (pageTitle) pageTitle.textContent = 'CRM Enquiries & Leads';
    loadEnquiries();
    loadStats();
  } else if (tabName === 'projects') {
    if (pageTitle) pageTitle.textContent = 'Projects Portfolio Management (Change & Delete)';
    loadAdminProjects();
  } else if (tabName === 'clients') {
    if (pageTitle) pageTitle.textContent = 'Client Brands & Partnerships (Change & Delete)';
    loadAdminClients();
  } else if (tabName === 'testimonials') {
    if (pageTitle) pageTitle.textContent = 'Client Reviews & Testimonials';
    loadAdminTestimonials();
  } else if (tabName === 'faqs') {
    if (pageTitle) pageTitle.textContent = 'Architectural FAQs';
    loadAdminFaqs();
  }

  // Sync hash in browser without page jump
  try {
    history.replaceState(null, '', `#${tabName}`);
  } catch (_) {}

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
}

function initTabs() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Attach quick navigation buttons
  document.querySelectorAll('.quick-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.target));
  });

  // Support direct URL query or hash navigation: e.g. ?tab=projects or #projects
  const params = new URLSearchParams(window.location.search);
  const targetTab = params.get('tab') || window.location.hash.replace('#', '');
  if (['projects', 'clients', 'enquiries', 'testimonials', 'faqs'].includes(targetTab)) {
    switchTab(targetTab);
  } else {
    loadEnquiries();
    loadStats();
  }
}

// =============================================================================
// CRM Enquiries & Analytics
// =============================================================================

async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats');
    if (res.status === 401) return window.location.replace('/admin/login.html');
    if (!res.ok) return;

    const data = await res.json();
    if (data.success && data.stats) {
      const s = data.stats;
      document.getElementById('statTotalEnquiries').textContent = s.totalEnquiries;
      document.getElementById('statNewThisWeek').textContent = `${s.newThisWeek} new this week`;
      document.getElementById('statActivePipeline').textContent = `${s.byStatus.won || 0} Won`;
      document.getElementById('statStatusBreakdown').textContent = `${s.byStatus.new || 0} New • ${s.byStatus.contacted || 0} Contacted`;
      document.getElementById('statCalculatorLeads').textContent = `${s.bySource.calculator || 0} Calc`;
      document.getElementById('statSourceBreakdown').textContent = `${s.bySource.contact_form || 0} Forms • ${s.bySource.quote || 0} Quotes`;
      document.getElementById('statDownloads').textContent = s.totalDownloads;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadEnquiries() {
  const tbody = document.getElementById('enquiriesTableBody');
  if (!tbody) return;

  const { page, limit } = state.pagination;
  const { search, status, source } = state.filters;

  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (search) params.append('search', search);
  if (status && status !== 'all') params.append('status', status);
  if (source && source !== 'all') params.append('source', source);

  tbody.innerHTML = `
    <tr>
      <td colspan="9" style="text-align: center; padding: 32px; color: var(--text-dim);">
        Fetching enquiries...
      </td>
    </tr>
  `;

  try {
    const res = await fetch(`/api/admin/enquiries?${params.toString()}`);
    if (res.status === 401) return window.location.replace('/admin/login.html');
    const json = await res.json();

    if (json.success) {
      state.enquiries = json.data;
      state.pagination = json.pagination;
      renderEnquiriesTable(json.data);
      updatePaginationControls();
    }
  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 24px; color: #f87171;">
          Failed to load enquiries. Please refresh.
        </td>
      </tr>
    `;
  }
}

function renderEnquiriesTable(records) {
  const tbody = document.getElementById('enquiriesTableBody');
  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 48px; color: var(--text-dim);">
          No enquiries matching current filters found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map((r) => {
    const dateFormatted = new Date(r.created_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return `
      <tr>
        <td><strong>#${r.id}</strong></td>
        <td>
          <strong style="color: var(--text-primary);">${r.name}</strong>
        </td>
        <td>
          <a href="tel:+91${r.phone}" style="color: var(--gold); display: block; font-weight: 500;">+91 ${r.phone}</a>
          <a href="mailto:${r.email}" style="color: var(--text-muted); font-size: 0.8rem;">${r.email}</a>
        </td>
        <td style="text-transform: capitalize;">${r.business_type}</td>
        <td>
          <div>${r.project_location || '—'}</div>
          <span style="font-size: 0.78rem; color: var(--text-dim);">${r.area_sqft ? r.area_sqft.toLocaleString() + ' sq.ft' : ''}</span>
        </td>
        <td>
          <span style="font-size: 0.78rem; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">
            ${r.source}
          </span>
        </td>
        <td>
          <select class="filter-select quick-status-select" data-id="${r.id}" style="padding: 4px 8px; font-size: 0.78rem;">
            <option value="new" ${r.status === 'new' ? 'selected' : ''}>New Lead</option>
            <option value="contacted" ${r.status === 'contacted' ? 'selected' : ''}>Contacted</option>
            <option value="quoted" ${r.status === 'quoted' ? 'selected' : ''}>Quoted</option>
            <option value="won" ${r.status === 'won' ? 'selected' : ''}>Won (Closed)</option>
            <option value="lost" ${r.status === 'lost' ? 'selected' : ''}>Lost</option>
          </select>
        </td>
        <td style="font-size: 0.8rem; color: var(--text-dim);">${dateFormatted}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-outline btn-sm btn-view-enquiry" data-id="${r.id}" title="View Details & Notes">
              Notes
            </button>
            <button class="btn btn-danger btn-sm btn-delete-enquiry" data-id="${r.id}" title="Delete Lead">
              ✕
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach quick status listeners
  document.querySelectorAll('.quick-status-select').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      const newStatus = e.target.value;
      await updateEnquiryStatus(id, newStatus);
    });
  });

  // Attach view details listeners
  document.querySelectorAll('.btn-view-enquiry').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      openEnquiryDetails(id);
    });
  });

  // Attach delete listeners
  document.querySelectorAll('.btn-delete-enquiry').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      deleteEnquiry(id);
    });
  });
}

function updatePaginationControls() {
  const info = document.getElementById('paginationInfo');
  const btnPrev = document.getElementById('btnPrevPage');
  const btnNext = document.getElementById('btnNextPage');

  const { page, total, limit, totalPages } = state.pagination;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  info.textContent = `Showing ${start} - ${end} of ${total} records (Page ${page} of ${totalPages || 1})`;

  btnPrev.disabled = page <= 1;
  btnNext.disabled = page >= totalPages;
}

async function updateEnquiryStatus(id, status) {
  try {
    const res = await fetch(`/api/admin/enquiries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      loadStats();
    }
  } catch (err) {
    console.error('Failed to update enquiry status:', err);
  }
}

function openEnquiryDetails(id) {
  const enquiry = state.enquiries.find((e) => e.id.toString() === id.toString());
  if (!enquiry) return;

  document.getElementById('editEnquiryId').value = enquiry.id;
  document.getElementById('modalEnquiryTitle').textContent = `Enquiry #${enquiry.id}: ${enquiry.name}`;
  document.getElementById('modalEnquiryMeta').textContent = `Submitted on ${new Date(enquiry.created_at).toLocaleString()}`;
  document.getElementById('modalEnquiryPhone').innerHTML = `<a href="tel:+91${enquiry.phone}" style="color: var(--gold);">+91 ${enquiry.phone}</a>`;
  document.getElementById('modalEnquiryEmail').innerHTML = `<a href="mailto:${enquiry.email}" style="color: var(--gold);">${enquiry.email}</a>`;
  document.getElementById('modalEnquirySector').textContent = enquiry.business_type.toUpperCase();
  document.getElementById('modalEnquiryLocation').textContent = enquiry.project_location || 'Not specified';
  document.getElementById('modalEnquiryArea').textContent = enquiry.area_sqft ? `${enquiry.area_sqft.toLocaleString()} sq.ft` : 'Not specified';
  document.getElementById('modalEnquirySource').textContent = enquiry.source;
  document.getElementById('modalEnquiryMessage').textContent = enquiry.message || 'No additional project brief provided.';

  // Calculator data display
  const calcWrapper = document.getElementById('modalEnquiryCalculatorWrapper');
  const calcDataEl = document.getElementById('modalEnquiryCalculatorData');
  if (enquiry.calculator_data) {
    try {
      const parsed = typeof enquiry.calculator_data === 'string' ? JSON.parse(enquiry.calculator_data) : enquiry.calculator_data;
      calcDataEl.innerHTML = Object.entries(parsed).map(([k, v]) => `
        <div style="margin-bottom: 4px;"><strong>${k.replace(/_/g, ' ')}:</strong> ${typeof v === 'object' ? JSON.stringify(v) : v}</div>
      `).join('');
      calcWrapper.style.display = 'block';
    } catch (_) {
      calcDataEl.textContent = enquiry.calculator_data;
      calcWrapper.style.display = 'block';
    }
  } else {
    calcWrapper.style.display = 'none';
  }

  document.getElementById('editEnquiryStatus').value = enquiry.status;
  document.getElementById('editEnquiryNotes').value = enquiry.admin_notes || '';

  openModal('modalEnquiry');
}

async function deleteEnquiry(id) {
  if (!confirm(`Are you sure you want to permanently delete lead #${id}? This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/enquiries/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadEnquiries();
      loadStats();
    }
  } catch (err) {
    console.error('Failed to delete enquiry:', err);
  }
}

// =============================================================================
// Portfolio Projects CRUD
// =============================================================================

async function loadAdminProjects() {
  const tbody = document.getElementById('projectsTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-dim);">Loading projects...</td></tr>`;

  try {
    const res = await fetch('/api/admin/projects');
    if (res.status === 401) return window.location.replace('/admin/login.html');
    const json = await res.json();

    if (json.success) {
      state.projects = json.data;
      renderAdminProjectsTable(json.data);
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #f87171;">Failed to load projects.</td></tr>`;
  }
}

function renderAdminProjectsTable(projects) {
  const tbody = document.getElementById('projectsTableBody');
  if (!tbody) return;

  if (projects.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px;">No projects created yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = projects.map((p) => `
    <tr>
      <td style="width: 80px;">
        <img src="${p.image_url}" alt="${p.title}" style="width: 64px; height: 48px; object-fit: cover; border-radius: 4px; border: 1px solid var(--admin-border);" onerror="this.src='https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80'">
      </td>
      <td>
        <strong style="color: #fff; font-size: 0.95rem;">${p.title}</strong>
        ${p.client_name ? `<div style="font-size: 0.78rem; color: var(--gold);">Client: ${p.client_name}</div>` : ''}
        <div style="font-size: 0.75rem; color: var(--text-dim);">slug: ${p.slug} • ${p.location || 'Mumbai'}</div>
      </td>
      <td style="text-transform: uppercase; font-size: 0.8rem; color: var(--gold); font-weight: 600;">${p.category}</td>
      <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 250px;">
        ${(Array.isArray(p.scope) ? p.scope : []).slice(0, 3).join(', ')}
      </td>
      <td>${p.sort_order}</td>
      <td>
        <span class="badge-status ${p.is_published ? 'badge-won' : 'badge-lost'}">
          ${p.is_published ? 'Live' : 'Draft'}
        </span>
        ${p.is_featured ? '<span style="color: var(--gold); margin-left: 6px;">★</span>' : ''}
      </td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-outline btn-sm btn-edit-proj" data-id="${p.id}" style="padding: 5px 12px; font-weight: 500;">
            ✏️ Change
          </button>
          <button class="btn btn-danger btn-sm btn-del-proj" data-id="${p.id}" style="padding: 5px 12px; font-weight: 500;">
            🗑️ Delete
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.btn-edit-proj').forEach((b) => {
    b.onclick = () => editProject(b.dataset.id);
  });
  document.querySelectorAll('.btn-del-proj').forEach((b) => {
    b.onclick = () => deleteProject(b.dataset.id);
  });
}

function editProject(id) {
  const p = state.projects.find((item) => item.id.toString() === id.toString());
  if (!p) return;

  document.getElementById('modalProjectTitle').textContent = `Change / Edit Project: ${p.title}`;
  document.getElementById('editProjectId').value = p.id;
  document.getElementById('projTitle').value = p.title;
  document.getElementById('projSlug').value = p.slug;

  const categorySelect = document.getElementById('projCategory');
  if (categorySelect) {
    categorySelect.value = p.category;
    if (categorySelect.value !== p.category) {
      const opt = document.createElement('option');
      opt.value = p.category;
      opt.textContent = p.category.replace('_', ' ').toUpperCase();
      categorySelect.appendChild(opt);
      categorySelect.value = p.category;
    }
  }

  const clientInput = document.getElementById('projClientName');
  if (clientInput) clientInput.value = p.client_name || '';
  const locInput = document.getElementById('projLocation');
  if (locInput) locInput.value = p.location || '';
  const areaInput = document.getElementById('projAreaSqft');
  if (areaInput) areaInput.value = p.area_sqft || 0;
  document.getElementById('projDesc').value = p.description || '';
  document.getElementById('projImageUrl').value = p.image_url || '';
  document.getElementById('projScope').value = Array.isArray(p.scope) ? p.scope.join(', ') : (p.scope || '');
  document.getElementById('projGallery').value = Array.isArray(p.gallery) ? p.gallery.join(', ') : (p.gallery || '');
  document.getElementById('projSort').value = p.sort_order ?? 0;
  document.getElementById('projFeatured').value = p.is_featured ?? 0;
  document.getElementById('projPublished').value = p.is_published ?? 1;

  const uploadStatus = document.getElementById('uploadStatusText');
  if (uploadStatus) uploadStatus.textContent = '';

  openModal('modalProject');
}

async function deleteProject(id) {
  const p = state.projects.find((item) => item.id.toString() === id.toString());
  const title = p ? `"${p.title}"` : `Project #${id}`;

  if (!confirm(`Are you sure you want to permanently delete ${title}?\n\nThis will remove it from the live website immediately.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/projects/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));

    if (res.ok && json.success) {
      showAdminToast(`Project ${title} deleted successfully.`);
      loadAdminProjects();
    } else {
      showAdminToast(json.message || 'Failed to delete project.', 'error');
    }
  } catch (err) {
    console.error('Failed to delete project:', err);
    showAdminToast('Network error while deleting project.', 'error');
  }
}

// =============================================================================
// Clients & Brand Partnerships CRUD
// =============================================================================

async function loadAdminClients() {
  const tbody = document.getElementById('clientsTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-dim);">Loading clients...</td></tr>`;

  try {
    const res = await fetch('/api/admin/clients');
    if (res.status === 401) return window.location.replace('/admin/login.html');
    const json = await res.json();

    if (json.success) {
      state.clients = json.data;
      renderAdminClientsTable(json.data);
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #f87171;">Failed to load clients.</td></tr>`;
  }
}

function renderAdminClientsTable(clients) {
  const tbody = document.getElementById('clientsTableBody');
  if (!tbody) return;

  if (clients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px;">No clients created yet. Click "+ Add New Client" above.</td></tr>`;
    return;
  }

  tbody.innerHTML = clients.map((c) => `
    <tr>
      <td style="width: 80px;">
        ${c.logo_url ? `<img src="${c.logo_url}" alt="${c.name}" style="width: 60px; height: 40px; object-fit: contain; background: #fff; padding: 4px; border-radius: 4px; border: 1px solid var(--admin-border);" onerror="this.onerror=null;this.parentElement.innerHTML='<span style=\\'font-size:0.7rem;color:var(--gold);\\'>LOGO</span>';">` : '<div style="width: 60px; height: 40px; background: rgba(255,255,255,0.05); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: var(--text-dim);">No logo</div>'}
      </td>
      <td>
        <strong style="color: #fff; font-size: 0.95rem;">${c.name}</strong>
        ${c.description ? `<div style="font-size: 0.78rem; color: var(--text-dim); max-width: 250px;">${c.description}</div>` : ''}
      </td>
      <td style="font-size: 0.82rem; color: var(--gold); font-weight: 600;">${c.category || 'General'}</td>
      <td style="font-size: 0.8rem;">
        ${c.website_url ? `<a href="${c.website_url}" target="_blank" style="color: var(--gold); text-decoration: underline;">${c.website_url.replace(/^https?:\/\//, '')}</a>` : '<span style="color: var(--text-dim);">—</span>'}
      </td>
      <td>
        <span class="badge-status ${c.is_featured ? 'badge-won' : 'badge-lost'}">
          ${c.is_featured ? 'Showcase ★' : 'Hidden'}
        </span>
      </td>
      <td>${c.sort_order}</td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-outline btn-sm btn-edit-client" data-id="${c.id}" style="padding: 5px 12px; font-weight: 500;">
            ✏️ Change
          </button>
          <button class="btn btn-danger btn-sm btn-del-client" data-id="${c.id}" style="padding: 5px 12px; font-weight: 500;">
            🗑️ Delete
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.btn-edit-client').forEach((b) => {
    b.onclick = () => editClient(b.dataset.id);
  });
  document.querySelectorAll('.btn-del-client').forEach((b) => {
    b.onclick = () => deleteClient(b.dataset.id);
  });
}

function editClient(id) {
  const c = state.clients.find((item) => item.id.toString() === id.toString());
  if (!c) return;

  document.getElementById('modalClientTitle').textContent = `Change / Edit Client: ${c.name}`;
  document.getElementById('editClientId').value = c.id;
  document.getElementById('clientName').value = c.name;
  document.getElementById('clientCategory').value = c.category || '';
  document.getElementById('clientLogoUrl').value = c.logo_url || '';
  document.getElementById('clientWebsite').value = c.website_url || '';
  document.getElementById('clientDesc').value = c.description || '';
  document.getElementById('clientSort').value = c.sort_order || 0;
  document.getElementById('clientFeatured').value = c.is_featured !== undefined ? c.is_featured : 1;
  const statusEl = document.getElementById('clientUploadStatus');
  if (statusEl) statusEl.textContent = '';

  openModal('modalClient');
}

async function deleteClient(id) {
  const c = state.clients.find((item) => item.id.toString() === id.toString());
  const name = c ? `"${c.name}"` : `Client #${id}`;

  if (!confirm(`Are you sure you want to permanently delete client ${name}?\n\nThis will remove it from the website client showcase.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/clients/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));

    if (res.ok && json.success) {
      showAdminToast(`Client ${name} deleted successfully.`);
      loadAdminClients();
    } else {
      showAdminToast(json.message || 'Failed to delete client.', 'error');
    }
  } catch (err) {
    console.error('Failed to delete client:', err);
    showAdminToast('Network error while deleting client.', 'error');
  }
}

// =============================================================================
// Testimonials CRUD
// =============================================================================

async function loadAdminTestimonials() {
  const tbody = document.getElementById('testimonialsTableBody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/testimonials');
    if (res.status === 401) return window.location.replace('/admin/login.html');
    const json = await res.json();

    if (json.success) {
      state.testimonials = json.data;
      tbody.innerHTML = json.data.map((t) => `
        <tr>
          <td><strong>${t.client_name}</strong></td>
          <td>${t.business_type}</td>
          <td style="color: var(--gold);">${'★'.repeat(t.rating)}</td>
          <td style="font-size: 0.85rem; color: var(--text-muted); max-width: 320px;">"${t.review}"</td>
          <td>
            <span class="badge-status ${t.is_published ? 'badge-won' : 'badge-lost'}">
              ${t.is_published ? 'Published' : 'Hidden'}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-outline btn-sm btn-edit-test" data-id="${t.id}">Edit</button>
              <button class="btn btn-danger btn-sm btn-del-test" data-id="${t.id}">✕</button>
            </div>
          </td>
        </tr>
      `).join('');

      document.querySelectorAll('.btn-edit-test').forEach((b) => {
        b.onclick = () => {
          const item = state.testimonials.find((x) => x.id.toString() === b.dataset.id);
          if (!item) return;
          document.getElementById('modalTestimonialTitle').textContent = 'Edit Testimonial';
          document.getElementById('editTestimonialId').value = item.id;
          document.getElementById('testClient').value = item.client_name;
          document.getElementById('testBusiness').value = item.business_type;
          document.getElementById('testRating').value = item.rating;
          document.getElementById('testReview').value = item.review;
          openModal('modalTestimonial');
        };
      });

      document.querySelectorAll('.btn-del-test').forEach((b) => {
        b.onclick = async () => {
          if (!confirm('Delete this client testimonial?')) return;
          await fetch(`/api/admin/testimonials/${b.dataset.id}`, { method: 'DELETE' });
          loadAdminTestimonials();
        };
      });
    }
  } catch (err) {
    console.error('Failed to load testimonials:', err);
  }
}

// =============================================================================
// FAQs CRUD
// =============================================================================

async function loadAdminFaqs() {
  const tbody = document.getElementById('faqsTableBody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/faqs');
    if (res.status === 401) return window.location.replace('/admin/login.html');
    const json = await res.json();

    if (json.success) {
      state.faqs = json.data;
      tbody.innerHTML = json.data.map((f) => `
        <tr>
          <td>${f.sort_order}</td>
          <td><strong>${f.question}</strong></td>
          <td style="font-size: 0.85rem; color: var(--text-muted); max-width: 380px;">${f.answer}</td>
          <td>
            <span class="badge-status ${f.is_published ? 'badge-won' : 'badge-lost'}">
              ${f.is_published ? 'Published' : 'Hidden'}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-outline btn-sm btn-edit-faq" data-id="${f.id}">Edit</button>
              <button class="btn btn-danger btn-sm btn-del-faq" data-id="${f.id}">✕</button>
            </div>
          </td>
        </tr>
      `).join('');

      document.querySelectorAll('.btn-edit-faq').forEach((b) => {
        b.onclick = () => {
          const item = state.faqs.find((x) => x.id.toString() === b.dataset.id);
          if (!item) return;
          document.getElementById('modalFaqTitle').textContent = 'Edit FAQ';
          document.getElementById('editFaqId').value = item.id;
          document.getElementById('faqQuestion').value = item.question;
          document.getElementById('faqAnswer').value = item.answer;
          document.getElementById('faqSort').value = item.sort_order;
          openModal('modalFaq');
        };
      });

      document.querySelectorAll('.btn-del-faq').forEach((b) => {
        b.onclick = async () => {
          if (!confirm('Delete this architectural FAQ?')) return;
          await fetch(`/api/admin/faqs/${b.dataset.id}`, { method: 'DELETE' });
          loadAdminFaqs();
        };
      });
    }
  } catch (err) {
    console.error('Failed to load FAQs:', err);
  }
}

// =============================================================================
// DOM Initialization & Event Wiring
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const isAuth = await checkSession();
  if (!isAuth) return;

  initTabs();

  // Logout button
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', handleLogout);

  // Mobile menu toggle
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.getElementById('sidebar');
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  // Modal close handlers (data-close attributes)
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.close);
    });
  });

  // Close modals on overlay background click
  document.querySelectorAll('.admin-modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });

  // Filter Bar Handlers
  const searchInput = document.getElementById('searchEnquiry');
  const filterStatus = document.getElementById('filterStatus');
  const filterSource = document.getElementById('filterSource');
  const btnExportCsv = document.getElementById('btnExportCsv');

  let debounceTimer;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.filters.search = e.target.value.trim();
        state.pagination.page = 1;
        loadEnquiries();
      }, 300);
    });
  }

  if (filterStatus) {
    filterStatus.addEventListener('change', (e) => {
      state.filters.status = e.target.value;
      state.pagination.page = 1;
      loadEnquiries();
    });
  }

  if (filterSource) {
    filterSource.addEventListener('change', (e) => {
      state.filters.source = e.target.value;
      state.pagination.page = 1;
      loadEnquiries();
    });
  }

  // CSV Export
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      const p = new URLSearchParams();
      if (state.filters.status !== 'all') p.append('status', state.filters.status);
      if (state.filters.source !== 'all') p.append('source', state.filters.source);
      window.location.href = `/api/admin/enquiries/export.csv?${p.toString()}`;
    });
  }

  // Pagination buttons
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');
  if (btnPrevPage && btnNextPage) {
    btnPrevPage.addEventListener('click', () => {
      if (state.pagination.page > 1) {
        state.pagination.page -= 1;
        loadEnquiries();
      }
    });
    btnNextPage.addEventListener('click', () => {
      if (state.pagination.page < state.pagination.totalPages) {
        state.pagination.page += 1;
        loadEnquiries();
      }
    });
  }

  // Update Enquiry Form Handler
  const formUpdateEnquiry = document.getElementById('formUpdateEnquiry');
  if (formUpdateEnquiry) {
    formUpdateEnquiry.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editEnquiryId').value;
      const status = document.getElementById('editEnquiryStatus').value;
      const admin_notes = document.getElementById('editEnquiryNotes').value;

      try {
        const res = await fetch(`/api/admin/enquiries/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, admin_notes }),
        });
        if (res.ok) {
          closeModal('modalEnquiry');
          loadEnquiries();
          loadStats();
        }
      } catch (err) {
        console.error('Failed to update enquiry:', err);
      }
    });
  }

  // Image Upload Button (Projects modal)
  const btnUploadImage = document.getElementById('btnUploadImage');
  const fileInput = document.getElementById('projImageFile');
  const uploadStatus = document.getElementById('uploadStatusText');

  if (btnUploadImage && fileInput) {
    btnUploadImage.addEventListener('click', async () => {
      if (!fileInput.files || fileInput.files.length === 0) {
        uploadStatus.textContent = 'Please choose an image file first.';
        uploadStatus.style.color = '#ef4444';
        return;
      }

      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append('image', file);

      uploadStatus.textContent = 'Uploading image...';
      uploadStatus.style.color = 'var(--gold)';

      try {
        const res = await fetch('/api/admin/upload', {
          method: 'POST',
          body: formData,
        });

        const json = await res.json();
        if (res.ok && json.success) {
          document.getElementById('projImageUrl').value = json.url;
          uploadStatus.textContent = `Upload successful: ${json.filename}`;
          uploadStatus.style.color = '#10b981';
        } else {
          uploadStatus.textContent = json.message || 'Upload failed.';
          uploadStatus.style.color = '#ef4444';
        }
      } catch (err) {
        uploadStatus.textContent = 'Upload network error.';
        uploadStatus.style.color = '#ef4444';
      }
    });
  }

  // Add / Edit Project Form
  const btnNewProject = document.getElementById('btnNewProject');
  const formProject = document.getElementById('formProject');
  if (btnNewProject) {
    btnNewProject.addEventListener('click', () => {
      formProject.reset();
      document.getElementById('editProjectId').value = '';
      document.getElementById('modalProjectTitle').textContent = 'Add Architecture Project';
      if (uploadStatus) uploadStatus.textContent = '';
      openModal('modalProject');
    });
  }

  if (formProject) {
    formProject.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editProjectId').value;
      const title = document.getElementById('projTitle').value.trim();
      const slug = document.getElementById('projSlug').value.trim();
      const category = document.getElementById('projCategory').value;
      const client_name = document.getElementById('projClientName')?.value.trim() || '';
      const location = document.getElementById('projLocation')?.value.trim() || '';
      const area_sqft = parseInt(document.getElementById('projAreaSqft')?.value, 10) || 0;
      const description = document.getElementById('projDesc').value.trim();
      const image_url = document.getElementById('projImageUrl').value.trim();
      const rawScope = document.getElementById('projScope').value.trim();
      const rawGallery = document.getElementById('projGallery').value.trim();
      const sort_order = parseInt(document.getElementById('projSort').value, 10) || 0;
      const is_featured = parseInt(document.getElementById('projFeatured').value, 10) || 0;
      const is_published = parseInt(document.getElementById('projPublished').value, 10) || 1;

      const scope = rawScope ? rawScope.split(',').map((s) => s.trim()).filter(Boolean) : [];
      const gallery = rawGallery ? rawGallery.split(',').map((g) => g.trim()).filter(Boolean) : [];

      const payload = {
        title,
        slug,
        category,
        client_name,
        location,
        area_sqft,
        description,
        image_url,
        scope,
        gallery,
        sort_order,
        is_featured,
        is_published,
      };

      const url = id ? `/api/admin/projects/${id}` : '/api/admin/projects';
      const method = id ? 'PATCH' : 'POST';

      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (res.ok && json.success) {
          closeModal('modalProject');
          showAdminToast(id ? 'Project updated successfully.' : 'New architecture project created successfully.');
          loadAdminProjects();
        } else {
          showAdminToast(json.message || 'Failed to save project.', 'error');
          alert(json.message || 'Failed to save project. Please check required fields.');
        }
      } catch (err) {
        console.error('Project save error:', err);
        showAdminToast('Network error while saving project.', 'error');
      }
    });
  }

  // Client Logo Upload
  const btnUploadClientLogo = document.getElementById('btnUploadClientLogo');
  const clientFileInput = document.getElementById('clientLogoFile');
  const clientUploadStatus = document.getElementById('clientUploadStatus');

  if (btnUploadClientLogo && clientFileInput) {
    btnUploadClientLogo.addEventListener('click', async () => {
      if (!clientFileInput.files || clientFileInput.files.length === 0) {
        clientUploadStatus.textContent = 'Please choose an image file first.';
        clientUploadStatus.style.color = '#ef4444';
        return;
      }

      const file = clientFileInput.files[0];
      const formData = new FormData();
      formData.append('image', file);

      clientUploadStatus.textContent = 'Uploading logo...';
      clientUploadStatus.style.color = 'var(--gold)';

      try {
        const res = await fetch('/api/admin/upload', {
          method: 'POST',
          body: formData,
        });

        const json = await res.json();
        if (res.ok && json.success) {
          document.getElementById('clientLogoUrl').value = json.url;
          clientUploadStatus.textContent = `Upload successful: ${json.filename}`;
          clientUploadStatus.style.color = '#10b981';
        } else {
          clientUploadStatus.textContent = json.message || 'Upload failed.';
          clientUploadStatus.style.color = '#ef4444';
        }
      } catch (err) {
        clientUploadStatus.textContent = 'Upload network error.';
        clientUploadStatus.style.color = '#ef4444';
      }
    });
  }

  // Add / Edit Client Form
  const btnNewClient = document.getElementById('btnNewClient');
  const formClient = document.getElementById('formClient');
  if (btnNewClient && formClient) {
    btnNewClient.addEventListener('click', () => {
      formClient.reset();
      document.getElementById('editClientId').value = '';
      document.getElementById('modalClientTitle').textContent = 'Add Brand Client';
      if (clientUploadStatus) clientUploadStatus.textContent = '';
      openModal('modalClient');
    });
  }

  if (formClient) {
    formClient.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editClientId').value;
      const name = document.getElementById('clientName').value.trim();
      const category = document.getElementById('clientCategory').value.trim();
      const logo_url = document.getElementById('clientLogoUrl').value.trim();
      const website_url = document.getElementById('clientWebsite').value.trim();
      const description = document.getElementById('clientDesc').value.trim();
      const sort_order = parseInt(document.getElementById('clientSort').value, 10) || 0;
      const is_featured = parseInt(document.getElementById('clientFeatured').value, 10) || 1;

      const payload = {
        name,
        category,
        logo_url,
        website_url,
        description,
        sort_order,
        is_featured,
      };

      const url = id ? `/api/admin/clients/${id}` : '/api/admin/clients';
      const method = id ? 'PATCH' : 'POST';

      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (res.ok && json.success) {
          closeModal('modalClient');
          showAdminToast(id ? 'Client updated successfully.' : 'New brand client added successfully.');
          loadAdminClients();
        } else {
          showAdminToast(json.message || 'Failed to save client.', 'error');
          alert(json.message || 'Failed to save client. Please check required fields.');
        }
      } catch (err) {
        console.error('Client save error:', err);
        showAdminToast('Network error while saving client.', 'error');
      }
    });
  }

  // Add Testimonial Form
  const btnNewTestimonial = document.getElementById('btnNewTestimonial');
  const formTestimonial = document.getElementById('formTestimonial');
  if (btnNewTestimonial) {
    btnNewTestimonial.addEventListener('click', () => {
      formTestimonial.reset();
      document.getElementById('editTestimonialId').value = '';
      document.getElementById('modalTestimonialTitle').textContent = 'Add Client Testimonial';
      openModal('modalTestimonial');
    });
  }

  if (formTestimonial) {
    formTestimonial.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editTestimonialId').value;
      const client_name = document.getElementById('testClient').value.trim();
      const business_type = document.getElementById('testBusiness').value.trim();
      const rating = parseInt(document.getElementById('testRating').value, 10);
      const review = document.getElementById('testReview').value.trim();

      const payload = { client_name, business_type, rating, review, is_published: 1 };
      const url = id ? `/api/admin/testimonials/${id}` : '/api/admin/testimonials';
      const method = id ? 'PATCH' : 'POST';

      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          closeModal('modalTestimonial');
          loadAdminTestimonials();
        }
      } catch (err) {
        console.error('Testimonial save error:', err);
      }
    });
  }

  // Add FAQ Form
  const btnNewFaq = document.getElementById('btnNewFaq');
  const formFaq = document.getElementById('formFaq');
  if (btnNewFaq) {
    btnNewFaq.addEventListener('click', () => {
      formFaq.reset();
      document.getElementById('editFaqId').value = '';
      document.getElementById('modalFaqTitle').textContent = 'Add Architectural FAQ';
      openModal('modalFaq');
    });
  }

  if (formFaq) {
    formFaq.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editFaqId').value;
      const question = document.getElementById('faqQuestion').value.trim();
      const answer = document.getElementById('faqAnswer').value.trim();
      const sort_order = parseInt(document.getElementById('faqSort').value, 10) || 0;

      const payload = { question, answer, sort_order, is_published: 1 };
      const url = id ? `/api/admin/faqs/${id}` : '/api/admin/faqs';
      const method = id ? 'PATCH' : 'POST';

      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          closeModal('modalFaq');
          loadAdminFaqs();
        }
      } catch (err) {
        console.error('FAQ save error:', err);
      }
    });
  }

  // Initial Load
  loadStats();
  loadEnquiries();
});
