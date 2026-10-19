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
    projectSearch: '',
    projectCategory: 'all',
    clientSearch: '',
  },
};
// =============================================================================
// Security & Sanitization Helpers
// =============================================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// =============================================================================
// Token & Session Management
// =============================================================================

function getStoredToken() {
  try {
    // 1. Check window global in-memory token first
    if (window.__BESIM_TOKEN && window.__BESIM_TOKEN !== 'null' && window.__BESIM_TOKEN !== 'undefined') {
      return window.__BESIM_TOKEN;
    }

    // 2. Check URL parameters (critical for reliable cross-page redirect in iframes)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('auth_token') || urlParams.get('token');
    if (urlToken && urlToken !== 'null' && urlToken !== 'undefined') {
      window.__BESIM_TOKEN = urlToken;
      try {
        localStorage.setItem('besim_admin_token', urlToken);
        sessionStorage.setItem('besim_admin_token', urlToken);
        document.cookie = `token=${urlToken}; path=/; max-age=604800; SameSite=Lax`;
      } catch (_) {}
      return urlToken;
    }

    // 3. Check localStorage
    const local = localStorage.getItem('besim_admin_token');
    if (local && local !== 'null' && local !== 'undefined') {
      window.__BESIM_TOKEN = local;
      return local;
    }

    // 4. Check sessionStorage
    const session = sessionStorage.getItem('besim_admin_token');
    if (session && session !== 'null' && session !== 'undefined') {
      window.__BESIM_TOKEN = session;
      return session;
    }

    // 5. Check cookies
    if (document.cookie) {
      const match = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
      if (match && match[1] && match[1] !== 'null' && match[1] !== 'undefined') {
        const cookieToken = decodeURIComponent(match[1]);
        window.__BESIM_TOKEN = cookieToken;
        return cookieToken;
      }
    }
  } catch (err) {
    console.warn('Token read warning:', err);
  }

  return window.__BESIM_TOKEN || '';
}

function persistStoredToken(token, email) {
  if (!token) return;
  try {
    window.__BESIM_TOKEN = token;
    localStorage.setItem('besim_admin_token', token);
    sessionStorage.setItem('besim_admin_token', token);
    document.cookie = `token=${token}; path=/; max-age=604800; SameSite=Lax`;
    if (email) {
      localStorage.setItem('besim_admin_email', email);
      sessionStorage.setItem('besim_admin_email', email);
    }
  } catch (_) {}
}

function clearStoredToken() {
  try {
    delete window.__BESIM_TOKEN;
    localStorage.removeItem('besim_admin_token');
    localStorage.removeItem('besim_admin_email');
    sessionStorage.removeItem('besim_admin_token');
    sessionStorage.removeItem('besim_admin_email');
    document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
  } catch (_) {}
}

/**
 * Universal authenticated fetch wrapper for all admin API endpoints.
 * Automatically injects Bearer token, passes credentials, and preserves active sessions.
 */
async function adminFetch(url, options = {}) {
  const token = getStoredToken();
  const headers = { ...(options.headers || {}) };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Set application/json only when sending body and not FormData
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Also include auth_token query param as bulletproof iframe fallback
  let fetchUrl = url;
  if (token && !url.includes('auth_token=') && !url.includes('token=')) {
    const sep = url.includes('?') ? '&' : '?';
    fetchUrl = `${url}${sep}auth_token=${encodeURIComponent(token)}`;
  }

  const res = await fetch(fetchUrl, {
    ...options,
    headers,
    credentials: 'include',
  });

  return res;
}

let sessionCheckInProgress = false;

async function checkSession() {
  if (sessionCheckInProgress) return true;
  sessionCheckInProgress = true;

  const token = getStoredToken();
  const hasCookie = document.cookie && document.cookie.includes('token=');

  if (!token && !hasCookie) {
    sessionCheckInProgress = false;
    clearStoredToken();
    window.location.replace('/admin/login.html');
    return false;
  }

  try {
    // 1. Initial attempt to verify session
    let res = await adminFetch('/api/auth/me');

    // 2. If initial call fails but we have token, retry once with explicit header after brief pause
    if (!res.ok && token) {
      await new Promise((r) => setTimeout(r, 250));
      res = await fetch(`/api/auth/me?auth_token=${encodeURIComponent(token)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
    }

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('401 Unauthorized');
      }
      // If server returned non-401 (e.g. temporary 502/503 during reload), keep session
      console.warn(`Session check returned ${res.status}, maintaining active session.`);
      sessionCheckInProgress = false;
      return true;
    }

    const data = await res.json();
    if (data.success && data.admin) {
      persistStoredToken(token, data.admin.email);
      const emailEl = document.getElementById('loggedAdminEmail');
      if (emailEl) {
        // Display User ID as clean username
        const username = data.admin.email ? data.admin.email.split('@')[0] : 'admin';
        emailEl.textContent = username;
        emailEl.title = data.admin.email;
      }
      sessionCheckInProgress = false;
      return true;
    }

    sessionCheckInProgress = false;
    return true;
  } catch (err) {
    sessionCheckInProgress = false;
    console.warn('Session verification caught error:', err.message);

    // Only redirect if explicitly 401 confirmed
    if (err.message && err.message.includes('401')) {
      clearStoredToken();
      window.location.replace('/admin/login.html?session_expired=1');
      return false;
    }

    // Do NOT kick user out on temporary errors
    return true;
  }
}

async function handleLogout() {
  try {
    await adminFetch('/api/auth/logout', { method: 'POST' });
  } catch (_) {
  } finally {
    clearStoredToken();
    window.location.replace('/admin/login.html?logged_out=1');
  }
}

// =============================================================================
// Modal Helpers & In-Dashboard Confirmations & Toasts
// =============================================================================

function showAdminToast(message, type = 'success') {
  let toastContainer = document.getElementById('adminToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'adminToastContainer';
    toastContainer.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 99999; display: flex; flex-direction: column; gap: 10px; pointer-events: none;';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const isErr = type === 'error';
  toast.style.cssText = `
    padding: 12px 18px;
    background: ${isErr ? 'rgba(239, 68, 68, 0.96)' : 'rgba(20, 27, 44, 0.96)'};
    color: #fff;
    border: 1px solid ${isErr ? '#ef4444' : 'var(--gold, #c5a880)'};
    border-radius: 6px;
    box-shadow: 0 10px 28px rgba(0,0,0,0.5);
    font-size: 0.86rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: all 0.25s ease;
    pointer-events: auto;
  `;
  toast.innerHTML = `<span>${isErr ? '⚠️' : '✓'}</span><span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

// In-app custom confirmation dialog to avoid window.confirm() in iframe environments
let confirmResolver = null;

function confirmDialog({ title, message, proceedText = 'Proceed Permanently', isDanger = true }) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    const modal = document.getElementById('modalConfirm');
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl = document.getElementById('confirmModalMessage');
    const btnProceed = document.getElementById('btnConfirmProceed');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (btnProceed) {
      btnProceed.textContent = proceedText;
      btnProceed.className = isDanger ? 'btn btn-danger' : 'btn btn-gold';
    }

    openModal('modalConfirm');
  });
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

  // Sync URL hash without jumping page
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
    const res = await adminFetch('/api/admin/stats');
    if (!res.ok) return;

    const data = await res.json();
    if (data.success && data.stats) {
      const s = data.stats;
      const elTotal = document.getElementById('statTotalEnquiries');
      const elNewWeek = document.getElementById('statNewThisWeek');
      const elPipeline = document.getElementById('statActivePipeline');
      const elStatus = document.getElementById('statStatusBreakdown');
      const elCalc = document.getElementById('statCalculatorLeads');
      const elSource = document.getElementById('statSourceBreakdown');
      const elDownloads = document.getElementById('statDownloads');

      if (elTotal) elTotal.textContent = s.totalEnquiries;
      if (elNewWeek) elNewWeek.textContent = `${s.newThisWeek} new this week`;
      if (elPipeline) elPipeline.textContent = `${s.byStatus?.won || 0} Won`;
      if (elStatus) elStatus.textContent = `${s.byStatus?.new || 0} New • ${s.byStatus?.contacted || 0} Contacted`;
      if (elCalc) elCalc.textContent = `${s.bySource?.calculator || 0} Calc`;
      if (elSource) elSource.textContent = `${s.bySource?.contact_form || 0} Forms • ${s.bySource?.quote || 0} Quotes`;
      if (elDownloads) elDownloads.textContent = s.totalDownloads;
    }
  } catch (err) {
    if (err.message !== 'Authentication required') {
      console.error('Failed to load stats:', err);
    }
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
    const res = await adminFetch(`/api/admin/enquiries?${params.toString()}`);
    const json = await res.json();

    if (json.success) {
      state.enquiries = json.data;
      state.pagination = json.pagination;
      renderEnquiriesTable(json.data);
      updatePaginationControls();
    }
  } catch (err) {
    if (err.message !== 'Authentication required') {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 24px; color: #f87171;">
            Failed to load enquiries. Please refresh.
          </td>
        </tr>
      `;
    }
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
    let dateFormatted = '—';
    try {
      if (r.created_at) {
        const iso = r.created_at.includes('T') ? r.created_at : r.created_at.replace(' ', 'T') + 'Z';
        const d = new Date(iso);
        dateFormatted = !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }) : (r.created_at || '—');
      }
    } catch (_) {
      dateFormatted = r.created_at || '—';
    }

    return `
      <tr>
        <td><strong>#${escapeHtml(r.id)}</strong></td>
        <td>
          <strong style="color: var(--text-primary); font-size: 0.92rem;">${escapeHtml(r.name)}</strong>
        </td>
        <td>
          <a href="tel:+91${encodeURIComponent(r.phone)}" style="color: var(--gold); display: block; font-weight: 500; font-size: 0.85rem;">+91 ${escapeHtml(r.phone)}</a>
          <a href="mailto:${encodeURIComponent(r.email)}" style="color: var(--text-muted); font-size: 0.78rem;">${escapeHtml(r.email)}</a>
        </td>
        <td style="text-transform: capitalize; font-size: 0.85rem;">${escapeHtml(r.business_type)}</td>
        <td>
          <div style="font-size: 0.85rem;">${escapeHtml(r.project_location) || '—'}</div>
          <span style="font-size: 0.75rem; color: var(--text-dim);">${r.area_sqft ? Number(r.area_sqft).toLocaleString() + ' sq.ft' : ''}</span>
        </td>
        <td>
          <span style="font-size: 0.75rem; background: rgba(255,255,255,0.06); padding: 3px 7px; border-radius: 4px; color: var(--text-muted);">
            ${escapeHtml(r.source)}
          </span>
        </td>
        <td>
          <select class="filter-select quick-status-select" data-id="${escapeHtml(r.id)}" style="padding: 4px 8px; font-size: 0.78rem;">
            <option value="new" ${r.status === 'new' ? 'selected' : ''}>New Lead</option>
            <option value="contacted" ${r.status === 'contacted' ? 'selected' : ''}>Contacted</option>
            <option value="quoted" ${r.status === 'quoted' ? 'selected' : ''}>Quoted</option>
            <option value="won" ${r.status === 'won' ? 'selected' : ''}>Won (Closed)</option>
            <option value="lost" ${r.status === 'lost' ? 'selected' : ''}>Lost</option>
          </select>
        </td>
        <td style="font-size: 0.78rem; color: var(--text-dim);">${escapeHtml(dateFormatted)}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-outline btn-sm btn-view-enquiry" data-id="${escapeHtml(r.id)}" title="View Details & Notes" style="padding: 4px 10px; font-size: 0.8rem;">
              Notes
            </button>
            <button class="btn btn-danger btn-sm btn-delete-enquiry" data-id="${escapeHtml(r.id)}" title="Delete Lead" style="padding: 4px 8px; font-size: 0.8rem;">
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

  if (!info || !btnPrev || !btnNext) return;

  const { page, total, limit, totalPages } = state.pagination;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  info.textContent = `Showing ${start} - ${end} of ${total} records (Page ${page} of ${totalPages || 1})`;

  btnPrev.disabled = page <= 1;
  btnNext.disabled = page >= totalPages;
}

async function updateEnquiryStatus(id, status) {
  try {
    const res = await adminFetch(`/api/admin/enquiries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      showAdminToast(`Lead #${id} status updated to ${status}.`);
      loadStats();
    }
  } catch (err) {
    if (err.message !== 'Authentication required') {
      console.error('Failed to update enquiry status:', err);
      showAdminToast('Failed to update status.', 'error');
    }
  }
}

function openEnquiryDetails(id) {
  const enquiry = state.enquiries.find((e) => e.id.toString() === id.toString());
  if (!enquiry) return;

  document.getElementById('editEnquiryId').value = enquiry.id;
  document.getElementById('modalEnquiryTitle').textContent = `Enquiry #${enquiry.id}: ${enquiry.name}`;
  let formattedDate = '—';
  try {
    formattedDate = new Date(enquiry.created_at).toLocaleString();
  } catch (_) {
    formattedDate = enquiry.created_at || '—';
  }
  document.getElementById('modalEnquiryMeta').textContent = `Submitted on ${formattedDate}`;
  
  const phoneEl = document.getElementById('modalEnquiryPhone');
  if (phoneEl) {
    phoneEl.innerHTML = `<a href="tel:+91${encodeURIComponent(enquiry.phone)}" style="color: var(--gold); text-decoration: underline;">+91 ${escapeHtml(enquiry.phone)}</a>`;
  }
  const emailEl = document.getElementById('modalEnquiryEmail');
  if (emailEl) {
    emailEl.innerHTML = `<a href="mailto:${encodeURIComponent(enquiry.email)}" style="color: var(--gold); text-decoration: underline;">${escapeHtml(enquiry.email)}</a>`;
  }

  document.getElementById('modalEnquirySector').textContent = (enquiry.business_type || '').toUpperCase();
  document.getElementById('modalEnquiryLocation').textContent = enquiry.project_location || 'Not specified';
  document.getElementById('modalEnquiryArea').textContent = enquiry.area_sqft ? `${Number(enquiry.area_sqft).toLocaleString()} sq.ft` : 'Not specified';
  document.getElementById('modalEnquirySource').textContent = enquiry.source || 'contact_form';
  document.getElementById('modalEnquiryMessage').textContent = enquiry.message || 'No additional project brief provided.';

  // Calculator data display
  const calcWrapper = document.getElementById('modalEnquiryCalculatorWrapper');
  const calcDataEl = document.getElementById('modalEnquiryCalculatorData');
  if (enquiry.calculator_data) {
    try {
      const parsed = typeof enquiry.calculator_data === 'string' ? JSON.parse(enquiry.calculator_data) : enquiry.calculator_data;
      calcDataEl.innerHTML = Object.entries(parsed).map(([k, v]) => `
        <div style="margin-bottom: 4px;"><strong>${escapeHtml(k.replace(/_/g, ' '))}:</strong> ${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : String(v))}</div>
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
  const confirmed = await confirmDialog({
    title: 'Delete CRM Lead',
    message: `Are you sure you want to permanently delete lead #${id}? This action cannot be undone.`,
    proceedText: 'Delete Lead 🗑️',
    isDanger: true,
  });

  if (!confirmed) return;

  try {
    const res = await adminFetch(`/api/admin/enquiries/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showAdminToast(`Lead #${id} deleted.`);
      loadEnquiries();
      loadStats();
    }
  } catch (err) {
    if (err.message !== 'Authentication required') {
      console.error('Failed to delete enquiry:', err);
      showAdminToast('Failed to delete lead.', 'error');
    }
  }
}

// =============================================================================
// Portfolio Projects CRUD (Change & Delete)
// =============================================================================

async function loadAdminProjects() {
  const tbody = document.getElementById('projectsTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-dim);">Loading projects...</td></tr>`;

  try {
    const res = await adminFetch('/api/admin/projects');
    const json = await res.json();

    if (json.success) {
      state.projects = json.data;
      filterAndRenderProjects();
    }
  } catch (err) {
    if (err.message !== 'Authentication required') {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #f87171;">Failed to load projects.</td></tr>`;
    }
  }
}

function filterAndRenderProjects() {
  const search = (state.filters.projectSearch || '').toLowerCase().trim();
  const cat = state.filters.projectCategory || 'all';

  let list = state.projects || [];
  if (cat !== 'all') {
    list = list.filter((p) => (p.category || '').toLowerCase() === cat.toLowerCase());
  }
  if (search) {
    list = list.filter((p) => {
      const titleMatch = (p.title || '').toLowerCase().includes(search);
      const clientMatch = (p.client_name || '').toLowerCase().includes(search);
      const locMatch = (p.location || '').toLowerCase().includes(search);
      const slugMatch = (p.slug || '').toLowerCase().includes(search);
      return titleMatch || clientMatch || locMatch || slugMatch;
    });
  }

  renderAdminProjectsTable(list);
}

function renderAdminProjectsTable(projects) {
  const tbody = document.getElementById('projectsTableBody');
  if (!tbody) return;

  if (projects.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-dim);">No matching projects found. Click "+ Add Architecture Project" above.</td></tr>`;
    return;
  }

  tbody.innerHTML = projects.map((p) => `
    <tr>
      <td style="width: 80px;">
        <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.title)}" style="width: 64px; height: 48px; object-fit: cover; border-radius: 4px; border: 1px solid var(--admin-border);" onerror="this.src='https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80'">
      </td>
      <td>
        <strong style="color: #fff; font-size: 0.95rem;">${escapeHtml(p.title)}</strong>
        ${p.client_name ? `<div style="font-size: 0.78rem; color: var(--gold);">Client: ${escapeHtml(p.client_name)}</div>` : ''}
        <div style="font-size: 0.75rem; color: var(--text-dim);">slug: ${escapeHtml(p.slug)} • ${escapeHtml(p.location || 'Mumbai')}</div>
      </td>
      <td style="text-transform: uppercase; font-size: 0.8rem; color: var(--gold); font-weight: 600;">${escapeHtml(p.category)}</td>
      <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 250px;">
        ${(Array.isArray(p.scope) ? p.scope : []).slice(0, 3).map(escapeHtml).join(', ')}
      </td>
      <td>${Number(p.sort_order || 0)}</td>
      <td>
        <span class="badge-status ${p.is_published ? 'badge-won' : 'badge-lost'}">
          ${p.is_published ? 'Live' : 'Draft'}
        </span>
        ${p.is_featured ? '<span style="color: var(--gold); margin-left: 6px;">★</span>' : ''}
      </td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-outline btn-sm btn-edit-proj" data-id="${escapeHtml(p.id)}" style="padding: 5px 12px; font-weight: 500;">
            ✏️ Change
          </button>
          <button class="btn btn-danger btn-sm btn-del-proj" data-id="${escapeHtml(p.id)}" style="padding: 5px 12px; font-weight: 500;">
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

  const confirmed = await confirmDialog({
    title: 'Delete Architecture Project',
    message: `Are you sure you want to permanently delete ${title}?\n\nThis will remove it from the live website portfolio immediately.`,
    proceedText: 'Delete Project 🗑️',
    isDanger: true,
  });

  if (!confirmed) return;

  try {
    const res = await adminFetch(`/api/admin/projects/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));

    if (res.ok && json.success) {
      showAdminToast(`Project ${title} deleted successfully.`);
      loadAdminProjects();
    } else {
      showAdminToast(json.message || 'Failed to delete project.', 'error');
    }
  } catch (err) {
    if (err.message !== 'Authentication required') {
      console.error('Failed to delete project:', err);
      showAdminToast('Network error while deleting project.', 'error');
    }
  }
}

// =============================================================================
// Clients & Brand Partnerships CRUD (Change & Delete)
// =============================================================================

async function loadAdminClients() {
  const tbody = document.getElementById('clientsTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-dim);">Loading clients...</td></tr>`;

  try {
    const res = await adminFetch('/api/admin/clients');
    const json = await res.json();

    if (json.success) {
      state.clients = json.data;
      filterAndRenderClients();
    }
  } catch (err) {
    if (err.message !== 'Authentication required') {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #f87171;">Failed to load clients.</td></tr>`;
    }
  }
}

function filterAndRenderClients() {
  const search = (state.filters.clientSearch || '').toLowerCase().trim();
  let list = state.clients || [];
  if (search) {
    list = list.filter((c) => {
      const nameMatch = (c.name || '').toLowerCase().includes(search);
      const catMatch = (c.category || '').toLowerCase().includes(search);
      const descMatch = (c.description || '').toLowerCase().includes(search);
      return nameMatch || catMatch || descMatch;
    });
  }
  renderAdminClientsTable(list);
}

function renderAdminClientsTable(clients) {
  const tbody = document.getElementById('clientsTableBody');
  if (!tbody) return;

  if (clients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-dim);">No clients created yet. Click "+ Add New Client" above.</td></tr>`;
    return;
  }

  tbody.innerHTML = clients.map((c) => `
    <tr>
      <td style="width: 80px;">
        ${c.logo_url ? `<img src="${escapeHtml(c.logo_url)}" alt="${escapeHtml(c.name)}" style="width: 60px; height: 40px; object-fit: contain; background: #fff; padding: 4px; border-radius: 4px; border: 1px solid var(--admin-border);" onerror="this.onerror=null;this.parentElement.innerHTML='<span style=\\'font-size:0.7rem;color:var(--gold);\\'>LOGO</span>';">` : '<div style="width: 60px; height: 40px; background: rgba(255,255,255,0.05); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: var(--text-dim);">No logo</div>'}
      </td>
      <td>
        <strong style="color: #fff; font-size: 0.95rem;">${escapeHtml(c.name)}</strong>
        ${c.description ? `<div style="font-size: 0.78rem; color: var(--text-dim); max-width: 250px;">${escapeHtml(c.description)}</div>` : ''}
      </td>
      <td style="font-size: 0.82rem; color: var(--gold); font-weight: 600;">${escapeHtml(c.category || 'General')}</td>
      <td style="font-size: 0.8rem;">
        ${c.website_url ? `<a href="${escapeHtml(c.website_url)}" target="_blank" rel="noopener noreferrer" style="color: var(--gold); text-decoration: underline;">${escapeHtml(c.website_url.replace(/^https?:\/\//, ''))}</a>` : '<span style="color: var(--text-dim);">—</span>'}
      </td>
      <td>
        <span class="badge-status ${c.is_featured ? 'badge-won' : 'badge-lost'}">
          ${c.is_featured ? 'Showcase ★' : 'Hidden'}
        </span>
      </td>
      <td>${Number(c.sort_order || 0)}</td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-outline btn-sm btn-edit-client" data-id="${escapeHtml(c.id)}" style="padding: 5px 12px; font-weight: 500;">
            ✏️ Change
          </button>
          <button class="btn btn-danger btn-sm btn-del-client" data-id="${escapeHtml(c.id)}" style="padding: 5px 12px; font-weight: 500;">
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

  const confirmed = await confirmDialog({
    title: 'Delete Client Brand',
    message: `Are you sure you want to permanently delete client ${name}?\n\nThis will remove it from the live website partner showcase immediately.`,
    proceedText: 'Delete Client 🗑️',
    isDanger: true,
  });

  if (!confirmed) return;

  try {
    const res = await adminFetch(`/api/admin/clients/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));

    if (res.ok && json.success) {
      showAdminToast(`Client ${name} deleted successfully.`);
      loadAdminClients();
    } else {
      showAdminToast(json.message || 'Failed to delete client.', 'error');
    }
  } catch (err) {
    if (err.message !== 'Authentication required') {
      console.error('Failed to delete client:', err);
      showAdminToast('Network error while deleting client.', 'error');
    }
  }
}

// =============================================================================
// Testimonials CRUD
// =============================================================================

async function loadAdminTestimonials() {
  const tbody = document.getElementById('testimonialsTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-dim);">Loading testimonials...</td></tr>`;

  try {
    const res = await adminFetch('/api/admin/testimonials');
    const json = await res.json();

    if (json.success) {
      state.testimonials = json.data;
      renderAdminTestimonials(json.data);
    }
  } catch (err) {
    if (err.message !== 'Authentication required') {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: #f87171;">Failed to load reviews.</td></tr>`;
    }
  }
}

function renderAdminTestimonials(reviews) {
  const tbody = document.getElementById('testimonialsTableBody');
  if (!tbody) return;

  if (reviews.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-dim);">No testimonials created yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = reviews.map((t) => `
    <tr>
      <td><strong style="color: #fff;">${t.client_name}</strong></td>
      <td style="color: var(--gold);">${t.business_type}</td>
      <td>${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</td>
      <td style="max-width: 320px; font-size: 0.82rem; color: var(--text-muted);">${t.review}</td>
      <td>
        <span class="badge-status ${t.is_published ? 'badge-won' : 'badge-lost'}">
          ${t.is_published ? 'Published' : 'Hidden'}
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-outline btn-sm btn-edit-test" data-id="${t.id}">✏️ Change</button>
          <button class="btn btn-danger btn-sm btn-del-test" data-id="${t.id}">🗑️ Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.btn-edit-test').forEach((b) => {
    b.onclick = () => {
      const t = state.testimonials.find((item) => item.id.toString() === b.dataset.id.toString());
      if (!t) return;
      document.getElementById('editTestimonialId').value = t.id;
      document.getElementById('testClient').value = t.client_name;
      document.getElementById('testBusiness').value = t.business_type;
      document.getElementById('testRating').value = t.rating;
      document.getElementById('testReview').value = t.review;
      document.getElementById('modalTestimonialTitle').textContent = `Edit Testimonial: ${t.client_name}`;
      openModal('modalTestimonial');
    };
  });

  document.querySelectorAll('.btn-del-test').forEach((b) => {
    b.onclick = async () => {
      const confirmed = await confirmDialog({
        title: 'Delete Client Review',
        message: 'Are you sure you want to permanently delete this testimonial?',
        proceedText: 'Delete Review 🗑️',
        isDanger: true,
      });

      if (!confirmed) return;

      try {
        await adminFetch(`/api/admin/testimonials/${b.dataset.id}`, { method: 'DELETE' });
        showAdminToast('Testimonial deleted successfully.');
        loadAdminTestimonials();
      } catch (_) {}
    };
  });
}

// =============================================================================
// FAQs CRUD
// =============================================================================

async function loadAdminFaqs() {
  const tbody = document.getElementById('faqsTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 32px; color: var(--text-dim);">Loading FAQs...</td></tr>`;

  try {
    const res = await adminFetch('/api/admin/faqs');
    const json = await res.json();

    if (json.success) {
      state.faqs = json.data;
      renderAdminFaqs(json.data);
    }
  } catch (err) {
    if (err.message !== 'Authentication required') {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: #f87171;">Failed to load FAQs.</td></tr>`;
    }
  }
}

function renderAdminFaqs(faqs) {
  const tbody = document.getElementById('faqsTableBody');
  if (!tbody) return;

  if (faqs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 32px; color: var(--text-dim);">No architectural FAQs configured.</td></tr>`;
    return;
  }

  tbody.innerHTML = faqs.map((f) => `
    <tr>
      <td>${f.sort_order}</td>
      <td style="font-weight: 600; color: #fff;">${f.question}</td>
      <td style="max-width: 320px; font-size: 0.82rem; color: var(--text-muted);">${f.answer}</td>
      <td>
        <span class="badge-status ${f.is_published ? 'badge-won' : 'badge-lost'}">
          ${f.is_published ? 'Published' : 'Hidden'}
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-outline btn-sm btn-edit-faq" data-id="${f.id}">✏️ Change</button>
          <button class="btn btn-danger btn-sm btn-del-faq" data-id="${f.id}">🗑️ Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.btn-edit-faq').forEach((b) => {
    b.onclick = () => {
      const f = state.faqs.find((item) => item.id.toString() === b.dataset.id.toString());
      if (!f) return;
      document.getElementById('editFaqId').value = f.id;
      document.getElementById('faqQuestion').value = f.question;
      document.getElementById('faqAnswer').value = f.answer;
      document.getElementById('faqSort').value = f.sort_order;
      document.getElementById('modalFaqTitle').textContent = 'Edit Architectural FAQ';
      openModal('modalFaq');
    };
  });

  document.querySelectorAll('.btn-del-faq').forEach((b) => {
    b.onclick = async () => {
      const confirmed = await confirmDialog({
        title: 'Delete FAQ',
        message: 'Are you sure you want to delete this architectural FAQ?',
        proceedText: 'Delete FAQ 🗑️',
        isDanger: true,
      });

      if (!confirmed) return;

      try {
        await adminFetch(`/api/admin/faqs/${b.dataset.id}`, { method: 'DELETE' });
        showAdminToast('FAQ deleted successfully.');
        loadAdminFaqs();
      } catch (_) {}
    };
  });
}

// =============================================================================
// DOM Initialization & Event Wiring
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const isAuth = await checkSession();
  if (!isAuth) return;

  const authLoader = document.getElementById('adminAuthLoader');
  if (authLoader) {
    authLoader.classList.add('hidden');
    setTimeout(() => authLoader.remove(), 350);
  }

  initTabs();

  // Wire custom confirm modal buttons
  const btnProceed = document.getElementById('btnConfirmProceed');
  const btnCancel = document.getElementById('btnConfirmCancel');
  if (btnProceed) {
    btnProceed.addEventListener('click', () => {
      closeModal('modalConfirm');
      if (confirmResolver) {
        confirmResolver(true);
        confirmResolver = null;
      }
    });
  }
  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      closeModal('modalConfirm');
      if (confirmResolver) {
        confirmResolver(false);
        confirmResolver = null;
      }
    });
  }

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
      if (btn.dataset.close === 'modalConfirm' && confirmResolver) {
        confirmResolver(false);
        confirmResolver = null;
      }
    });
  });

  // Close modals on overlay background click
  document.querySelectorAll('.admin-modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
        if (overlay.id === 'modalConfirm' && confirmResolver) {
          confirmResolver(false);
          confirmResolver = null;
        }
      }
    });
  });

  // Filter Bar Handlers - Enquiries
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

  // Filter Bar Handlers - Projects
  const searchProjInput = document.getElementById('searchProject');
  const filterProjCategory = document.getElementById('filterProjectCategory');

  if (searchProjInput) {
    searchProjInput.addEventListener('input', (e) => {
      state.filters.projectSearch = e.target.value;
      filterAndRenderProjects();
    });
  }

  if (filterProjCategory) {
    filterProjCategory.addEventListener('change', (e) => {
      state.filters.projectCategory = e.target.value;
      filterAndRenderProjects();
    });
  }

  // Filter Bar Handlers - Clients
  const searchClientInput = document.getElementById('searchClient');
  if (searchClientInput) {
    searchClientInput.addEventListener('input', (e) => {
      state.filters.clientSearch = e.target.value;
      filterAndRenderClients();
    });
  }

  // CSV Export with blob download & Bearer support
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', async () => {
      const p = new URLSearchParams();
      if (state.filters.status !== 'all') p.append('status', state.filters.status);
      if (state.filters.source !== 'all') p.append('source', state.filters.source);

      const origText = btnExportCsv.innerHTML;
      btnExportCsv.innerHTML = 'Generating CSV...';
      btnExportCsv.disabled = true;

      try {
        const res = await adminFetch(`/api/admin/enquiries/export.csv?${p.toString()}`);
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `besim_crm_leads_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
        showAdminToast('CSV export downloaded successfully.');
      } catch (err) {
        if (err.message !== 'Authentication required') {
          showAdminToast('Failed to export CSV.', 'error');
        }
      } finally {
        btnExportCsv.innerHTML = origText;
        btnExportCsv.disabled = false;
      }
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
      const admin_notes = document.getElementById('editEnquiryNotes').value.trim();

      try {
        const res = await adminFetch(`/api/admin/enquiries/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status, admin_notes }),
        });

        if (res.ok) {
          closeModal('modalEnquiry');
          showAdminToast(`Enquiry #${id} notes saved.`);
          loadEnquiries();
          loadStats();
        } else {
          showAdminToast('Failed to save enquiry notes.', 'error');
        }
      } catch (err) {
        if (err.message !== 'Authentication required') {
          showAdminToast('Network error while saving notes.', 'error');
        }
      }
    });
  }

  // Auto-generate clean URL slug from Project Title
  const projTitleInput = document.getElementById('projTitle');
  const projSlugInput = document.getElementById('projSlug');
  if (projTitleInput && projSlugInput) {
    projTitleInput.addEventListener('input', () => {
      const editId = document.getElementById('editProjectId')?.value;
      if (!editId) {
        projSlugInput.value = projTitleInput.value
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_-]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }
    });

    projSlugInput.addEventListener('blur', () => {
      projSlugInput.value = projSlugInput.value
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    });
  }

  // Project Image File Upload
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
        const res = await adminFetch('/api/admin/upload', {
          method: 'POST',
          body: formData,
        });

        const json = await res.json();
        if (res.ok && json.success) {
          document.getElementById('projImageUrl').value = json.url;
          uploadStatus.textContent = `Upload successful: ${json.filename}`;
          uploadStatus.style.color = '#10b981';
          showAdminToast('Project image uploaded.');
        } else {
          uploadStatus.textContent = json.message || 'Upload failed.';
          uploadStatus.style.color = '#ef4444';
        }
      } catch (err) {
        if (err.message !== 'Authentication required') {
          uploadStatus.textContent = 'Upload network error.';
          uploadStatus.style.color = '#ef4444';
        }
      }
    });
  }

  // Add / Edit Project Form
  const btnNewProject = document.getElementById('btnNewProject');
  const formProject = document.getElementById('formProject');
  if (btnNewProject && formProject) {
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
      let slug = document.getElementById('projSlug').value.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-');
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

      if (!title || !slug || !description || !image_url) {
        showAdminToast('Please fill all required project fields (*).', 'error');
        return;
      }

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
        const res = await adminFetch(url, {
          method,
          body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (res.ok && json.success) {
          closeModal('modalProject');
          showAdminToast(id ? 'Project updated successfully.' : 'New architecture project created successfully.');
          loadAdminProjects();
        } else {
          showAdminToast(json.message || 'Failed to save project.', 'error');
        }
      } catch (err) {
        if (err.message !== 'Authentication required') {
          console.error('Project save error:', err);
          showAdminToast('Network error while saving project.', 'error');
        }
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
        const res = await adminFetch('/api/admin/upload', {
          method: 'POST',
          body: formData,
        });

        const json = await res.json();
        if (res.ok && json.success) {
          document.getElementById('clientLogoUrl').value = json.url;
          clientUploadStatus.textContent = `Upload successful: ${json.filename}`;
          clientUploadStatus.style.color = '#10b981';
          showAdminToast('Client logo uploaded.');
        } else {
          clientUploadStatus.textContent = json.message || 'Upload failed.';
          clientUploadStatus.style.color = '#ef4444';
        }
      } catch (err) {
        if (err.message !== 'Authentication required') {
          clientUploadStatus.textContent = 'Upload network error.';
          clientUploadStatus.style.color = '#ef4444';
        }
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

      if (!name) {
        showAdminToast('Please provide a client brand name.', 'error');
        return;
      }

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
        const res = await adminFetch(url, {
          method,
          body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (res.ok && json.success) {
          closeModal('modalClient');
          showAdminToast(id ? 'Client updated successfully.' : 'New brand client added successfully.');
          loadAdminClients();
        } else {
          showAdminToast(json.message || 'Failed to save client.', 'error');
        }
      } catch (err) {
        if (err.message !== 'Authentication required') {
          console.error('Client save error:', err);
          showAdminToast('Network error while saving client.', 'error');
        }
      }
    });
  }

  // Add / Edit Testimonial Form
  const btnNewTestimonial = document.getElementById('btnNewTestimonial');
  const formTestimonial = document.getElementById('formTestimonial');
  if (btnNewTestimonial && formTestimonial) {
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

      if (!client_name || !business_type || !review) {
        showAdminToast('Please fill all required testimonial fields (*).', 'error');
        return;
      }

      const payload = { client_name, business_type, rating, review, is_published: 1 };
      const url = id ? `/api/admin/testimonials/${id}` : '/api/admin/testimonials';
      const method = id ? 'PATCH' : 'POST';

      try {
        const res = await adminFetch(url, {
          method,
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          closeModal('modalTestimonial');
          showAdminToast(id ? 'Testimonial updated.' : 'Testimonial created.');
          loadAdminTestimonials();
        } else {
          showAdminToast('Failed to save testimonial.', 'error');
        }
      } catch (err) {
        if (err.message !== 'Authentication required') {
          console.error('Testimonial save error:', err);
          showAdminToast('Failed to save testimonial.', 'error');
        }
      }
    });
  }

  // Add / Edit FAQ Form
  const btnNewFaq = document.getElementById('btnNewFaq');
  const formFaq = document.getElementById('formFaq');
  if (btnNewFaq && formFaq) {
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

      if (!question || !answer) {
        showAdminToast('Please provide both question and answer.', 'error');
        return;
      }

      const payload = { question, answer, sort_order, is_published: 1 };
      const url = id ? `/api/admin/faqs/${id}` : '/api/admin/faqs';
      const method = id ? 'PATCH' : 'POST';

      try {
        const res = await adminFetch(url, {
          method,
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          closeModal('modalFaq');
          showAdminToast(id ? 'FAQ updated.' : 'FAQ added.');
          loadAdminFaqs();
        } else {
          showAdminToast('Failed to save FAQ.', 'error');
        }
      } catch (err) {
        if (err.message !== 'Authentication required') {
          console.error('FAQ save error:', err);
          showAdminToast('Failed to save FAQ.', 'error');
        }
      }
    });
  }
});
