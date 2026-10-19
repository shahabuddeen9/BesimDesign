/**
 * @file /public/js/main.js
 * @description Client-side controller for Besim Design.
 * Handles API data fetching with static HTML fallbacks, interactive space & budget calculator,
 * modal dialogs, FAQ accordions, toast alerts, and lead submission to /api/enquiries.
 */

// Global Configuration
const CONFIG = {
  API_BASE_URL: window.location.origin,
};

// State Store
const state = {
  projects: [],
  activeCategory: 'all',
  calculator: {
    sector: 'restaurant',
    area: 4500,
    tierMultiplier: 1.0,
    costMinPerSqft: 2400,
    costMaxPerSqft: 3800,
    turnaroundWeeks: 12,
  },
};

// =============================================================================
// DOM Utility Functions & Toast System
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

function formatCurrencyINR(amount) {
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} Lakh`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

// =============================================================================
// Interactive Estimation Calculator
// =============================================================================

function initCalculator() {
  const typeCards = document.querySelectorAll('.calc-type-card');
  const areaSlider = document.getElementById('areaSlider');
  const areaDisplay = document.getElementById('areaDisplay');
  const specTier = document.getElementById('specTier');
  const estBudgetDisplay = document.getElementById('estBudgetDisplay');
  const estTimeDisplay = document.getElementById('estTimeDisplay');
  const estCapacityDisplay = document.getElementById('estCapacityDisplay');
  const estMepDisplay = document.getElementById('estMepDisplay');
  const btnUseEstimate = document.getElementById('btnUseEstimate');

  if (!areaSlider) return;

  function recalculate() {
    const area = parseInt(areaSlider.value, 10);
    const tier = parseFloat(specTier.value) || 1.0;
    state.calculator.area = area;
    state.calculator.tierMultiplier = tier;

    areaDisplay.textContent = `${area.toLocaleString()} sq.ft`;

    // Calculate budget min & max
    const totalMin = Math.round(area * state.calculator.costMinPerSqft * tier);
    const totalMax = Math.round(area * state.calculator.costMaxPerSqft * tier);

    estBudgetDisplay.textContent = `${formatCurrencyINR(totalMin)} — ${formatCurrencyINR(totalMax)}`;

    // Time estimate based on area and sector
    let baseWeeks = state.calculator.turnaroundWeeks;
    if (area > 10000) baseWeeks += 6;
    else if (area > 5000) baseWeeks += 3;
    estTimeDisplay.textContent = `${baseWeeks} - ${baseWeeks + 3} Weeks`;

    // Capacity estimation
    if (state.calculator.sector === 'restaurant') {
      const covers = Math.round(area / 38);
      estCapacityDisplay.textContent = `${covers} - ${Math.round(covers * 1.2)} Covers`;
      const trLoad = Math.round(area / 120);
      estMepDisplay.textContent = `${trLoad} - ${trLoad + 10} TR Load`;
    } else if (state.calculator.sector === 'hotel') {
      const keys = Math.round(area / 450);
      estCapacityDisplay.textContent = `${keys} Luxury Keys`;
      estMepDisplay.textContent = `Central Chiller Plant`;
    } else if (state.calculator.sector === 'bar') {
      const patrons = Math.round(area / 25);
      estCapacityDisplay.textContent = `${patrons} - ${Math.round(patrons * 1.25)} Patrons`;
      estMepDisplay.textContent = `Glycol + 40 TR HVAC`;
    } else if (state.calculator.sector === 'industrial') {
      estCapacityDisplay.textContent = `FM2 Super-Flat Floor`;
      estMepDisplay.textContent = `High-Bay LED & Transformers`;
    }
  }

  // Sector Card Selection
  typeCards.forEach((card) => {
    card.addEventListener('click', () => {
      typeCards.forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      state.calculator.sector = card.dataset.type;
      state.calculator.costMinPerSqft = parseInt(card.dataset.min, 10);
      state.calculator.costMaxPerSqft = parseInt(card.dataset.max, 10);
      state.calculator.turnaroundWeeks = parseInt(card.dataset.speed, 10);

      recalculate();
    });
  });

  areaSlider.addEventListener('input', recalculate);
  specTier.addEventListener('change', recalculate);

  // Initial calculation
  recalculate();

  // "Get a Detailed Layout & Scope PDF" button
  if (btnUseEstimate) {
    btnUseEstimate.addEventListener('click', () => {
      const contactSection = document.getElementById('contact');
      const formSource = document.getElementById('formSource');
      const formCalcData = document.getElementById('formCalcData') || document.getElementById('formCalculatorData');
      const businessTypeSelect = document.getElementById('businessType');
      const areaInput = document.getElementById('areaSqft');
      const messageTextarea = document.getElementById('projectMessage') || document.getElementById('clientMessage');

      // Populate form fields from calculator state
      if (businessTypeSelect) {
        // Map calculator sectors to business type options
        const sectorMap = {
          restaurant: 'hospitality',
          hotel: 'hotels',
          bar: 'hospitality',
          industrial: 'central_kitchen',
        };
        businessTypeSelect.value = sectorMap[state.calculator.sector] || state.calculator.sector;
      }
      if (areaInput) areaInput.value = state.calculator.area;
      if (formSource) formSource.value = 'calculator';

      const calcPayload = {
        sector: state.calculator.sector,
        area_sqft: state.calculator.area,
        tier: specTier ? specTier.options[specTier.selectedIndex]?.text : 'Standard',
        estimated_budget: estBudgetDisplay ? estBudgetDisplay.textContent : '',
        turnaround: estTimeDisplay ? estTimeDisplay.textContent : '',
        capacity: estCapacityDisplay ? estCapacityDisplay.textContent : '',
      };

      if (formCalcData) formCalcData.value = JSON.stringify(calcPayload);

      if (messageTextarea && !messageTextarea.value) {
        messageTextarea.value = `I generated an architectural estimate for a ${state.calculator.area.toLocaleString()} sq.ft ${state.calculator.sector.toUpperCase()} project (${estBudgetDisplay ? estBudgetDisplay.textContent : ''}). Please contact me with a detailed layout plan and turnkey tender.`;
      }

      // Smooth scroll to form
      if (contactSection) {
        contactSection.scrollIntoView({ behavior: 'smooth' });
      }

      // Highlight form card
      const formCard = document.querySelector('.contact-form-card');
      if (formCard) {
        formCard.style.outline = '2px solid var(--accent-gold)';
        setTimeout(() => {
          formCard.style.outline = 'none';
        }, 2000);
      }

      showToast('Calculator parameters applied to your project brief below!', 'success');
    });
  }
}

// =============================================================================
// Dynamic API Fetch with Static Fallback
// =============================================================================

async function loadProjects() {
  const grid = document.getElementById('portfolioGrid');
  if (!grid) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/projects`);
    if (!res.ok) throw new Error('Failed to fetch projects');
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      state.projects = json.data;
      renderProjects(state.projects);
    }
  } catch (err) {
    console.warn('API unavailable; retaining static portfolio fallbacks.', err);
  }
}

function renderProjects(projectsList) {
  const grid = document.getElementById('portfolioGrid');
  if (!grid) return;

  const filtered = state.activeCategory === 'all'
    ? projectsList
    : projectsList.filter((p) => p.category === state.activeCategory || (state.activeCategory === 'hotels' && p.category === 'hotel') || (state.activeCategory === 'hospitality' && (p.category === 'hospitality' || p.category === 'restaurant' || p.category === 'bar')));

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted);">
        <p>No projects found in this sector yet.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map((p) => {
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
    const formattedCat = p.category ? escapeHtml(p.category.replace('_', ' ').toUpperCase()) : 'ARCHITECTURE';
    const escapedTitle = escapeHtml(p.title);
    const escapedDesc = escapeHtml(p.description);
    const escapedClient = escapeHtml(p.client_name || '');
    const escapedLocation = escapeHtml(p.location || '');
    const escapedImg = escapeHtml(p.image_url);
    const escapedSlug = escapeHtml(p.slug);

    return `
      <div class="project-card" data-category="${escapeHtml(p.category)}">
        <div class="project-img-wrap">
          <img src="${escapedImg}" alt="${escapedTitle}" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80'">
          <span class="project-cat-badge">${formattedCat}</span>
        </div>
        <div class="project-body">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
            <span style="font-size: 0.75rem; color: var(--accent-gold); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">${escapedClient ? `Client: ${escapedClient}` : formattedCat}</span>
            ${p.area_sqft ? `<span style="font-size: 0.75rem; color: var(--text-dim);">${Number(p.area_sqft).toLocaleString()} sq.ft</span>` : ''}
          </div>
          <h3 class="project-title">${escapedTitle}</h3>
          ${escapedLocation ? `<div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px;">📍 ${escapedLocation}</div>` : ''}
          <p class="project-desc">${escapedDesc}</p>
          <div class="project-scope-list">
            ${scopes.slice(0, 4).map((s) => `<span class="project-scope-item">${escapeHtml(s)}</span>`).join('')}
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

async function loadClients() {
  const container = document.getElementById('clientsGrid');
  if (!container) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/clients`);
    if (!res.ok) throw new Error('Clients API offline');
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      if (json.data.length === 0) {
        container.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 32px; color: var(--text-muted);">
            <p>No client logos currently listed.</p>
          </div>
        `;
      } else {
        container.innerHTML = json.data.map((c) => `
          <div class="client-logo-card">
            ${c.logo_url ? `<img src="${c.logo_url}" alt="${c.name}" class="client-logo-img" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='<span class=\\'client-logo-text\\'>${c.name}</span>';">` : `<span class="client-logo-text">${c.name}</span>`}
            <span class="client-name-label">${c.name}</span>
            ${c.category ? `<span class="client-cat-label">${c.category}</span>` : ''}
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.warn('Clients API unavailable; keeping static fallback.', err);
  }
}

// Project Modal Trigger Listener
function attachProjectModalTriggers() {
  const buttons = document.querySelectorAll('.view-project-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const slug = btn.dataset.slug;
      await openProjectModal(slug);
    });
  });
}

function closeProjectModal() {
  const modal = document.getElementById('projectModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

async function openProjectModal(slug) {
  const modal = document.getElementById('projectModal');
  const modalBody = document.getElementById('modalBody');
  if (!modal || !modalBody) return;

  // Find project in state or fetch by slug
  let project = state.projects.find((p) => p.slug === slug);

  if (!project) {
    try {
      const res = await fetch(`${CONFIG.API_BASE_URL}/api/projects/${slug}`);
      if (res.ok) {
        const json = await res.json();
        project = json.data;
      }
    } catch (_) {}
  }

  if (!project) {
    modalBody.innerHTML = `
      <h3 style="margin-bottom: 12px; font-family: var(--font-serif);">Commercial Project Blueprint</h3>
      <p style="color: var(--text-muted); margin-bottom: 24px;">Detailed technical drawings, MEP schematics, and photographic walkthroughs are available upon request during initial feasibility consultations.</p>
      <a href="#contact" class="btn btn-primary btn-sm" onclick="closeProjectModal();">Schedule a Technical Consultation</a>
    `;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    return;
  }

  const scopes = Array.isArray(project.scope) ? project.scope : [];
  const gallery = Array.isArray(project.gallery) ? project.gallery : [];

  modalBody.innerHTML = `
    <div style="margin-bottom: 20px;">
      <span class="section-badge" style="margin-bottom: 8px;">${escapeHtml(project.category.toUpperCase())}</span>
      <h2 style="font-size: 1.8rem; margin-top: 8px; font-family: var(--font-serif);">${escapeHtml(project.title)}</h2>
    </div>

    <div style="border-radius: var(--radius-sm); overflow: hidden; margin-bottom: 24px;">
      <img src="${escapeHtml(project.image_url)}" alt="${escapeHtml(project.title)}" style="width: 100%; height: 320px; object-fit: cover;" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80'">
    </div>

    <p style="color: var(--text-muted); line-height: 1.7; margin-bottom: 24px; font-size: 1rem;">
      ${escapeHtml(project.description)}
    </p>

    <div style="margin-bottom: 24px;">
      <h4 style="font-size: 1rem; color: var(--accent-gold); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">Architectural & Engineering Scope</h4>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        ${scopes.map((s) => `<span style="background: rgba(255,255,255,0.06); padding: 5px 12px; border-radius: var(--radius-sm); font-size: 0.85rem; border: 1px solid var(--border-subtle);">${escapeHtml(s)}</span>`).join('')}
      </div>
    </div>

    ${gallery.length > 0 ? `
      <div style="margin-bottom: 24px;">
        <h4 style="font-size: 1rem; color: var(--accent-gold); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">Photographic Walkthrough</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
          ${gallery.map((img) => `<img src="${escapeHtml(img)}" style="width: 100%; height: 140px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80'">`).join('')}
        </div>
      </div>
    ` : ''}

    <div style="border-top: 1px solid var(--border-subtle); padding-top: 20px; display: flex; justify-content: flex-end;">
      <a href="#contact" class="btn btn-primary btn-sm" onclick="closeProjectModal();">
        Enquire About Similar Project →
      </a>
    </div>
  `;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// =============================================================================
// Testimonials & FAQs Dynamic Loading
// =============================================================================

async function loadTestimonials() {
  const container = document.getElementById('testimonialsGrid');
  if (!container) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/testimonials`);
    if (!res.ok) throw new Error('Testimonials API offline');
    const json = await res.json();

    if (json.success && Array.isArray(json.data) && json.data.length > 0) {
      container.innerHTML = json.data.map((t) => {
        const ratingNum = Math.min(5, Math.max(1, parseInt(t.rating, 10) || 5));
        return `
          <div class="testimonial-card">
            <div>
              <div class="testimonial-rating">${'★'.repeat(ratingNum)}</div>
              <p class="testimonial-text">"${escapeHtml(t.review)}"</p>
            </div>
            <div class="testimonial-author">
              <h5>${escapeHtml(t.client_name)}</h5>
              <p>${escapeHtml(t.business_type)}</p>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.warn('API unavailable; retaining static testimonial fallbacks.', err);
  }
}

async function loadFaqs() {
  const container = document.getElementById('faqAccordion');
  if (!container) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/faqs`);
    if (!res.ok) throw new Error('FAQs API offline');
    const json = await res.json();

    if (json.success && Array.isArray(json.data) && json.data.length > 0) {
      container.innerHTML = json.data.map((f, idx) => `
        <div class="faq-item ${idx === 0 ? 'active' : ''}">
          <button class="faq-question">
            <span>${escapeHtml(f.question)}</span>
            <span class="faq-icon">+</span>
          </button>
          <div class="faq-answer">
            <p>${escapeHtml(f.answer)}</p>
          </div>
        </div>
      `).join('');
      attachFaqAccordion();
    }
  } catch (err) {
    console.warn('API unavailable; retaining static FAQ fallbacks.', err);
    attachFaqAccordion();
  }
}

function attachFaqAccordion() {
  const questions = document.querySelectorAll('.faq-question');
  questions.forEach((q) => {
    q.onclick = () => {
      const item = q.parentElement;
      const wasActive = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('active'));
      if (!wasActive) {
        item.classList.add('active');
      }
    };
  });
}

// =============================================================================
// Lead Capture Form Submission
// =============================================================================

function initContactForm() {
  const form = document.getElementById('enquiryForm');
  const submitBtn = document.getElementById('btnSubmitForm');
  const btnText = document.getElementById('btnSubmitText');
  const btnSpinner = document.getElementById('btnSubmitSpinner');
  const alertBox = document.getElementById('formAlertBox');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Reset alert box
    alertBox.style.display = 'none';
    alertBox.className = '';
    alertBox.innerHTML = '';

    // Extract form data
    const formData = new FormData(form);
    const honeypot = formData.get('website_url_hp');
    if (honeypot) {
      console.warn('Honeypot filled; aborting spam bot submission.');
      return;
    }

    const name = formData.get('name')?.toString().trim();
    const phone = formData.get('phone')?.toString().trim();
    const email = formData.get('email')?.toString().trim();
    const businessType = formData.get('business_type')?.toString();
    const projectLocation = formData.get('project_location')?.toString().trim();
    const areaSqft = parseInt(formData.get('area_sqft')?.toString(), 10) || 0;
    const message = formData.get('message')?.toString().trim();
    const source = formData.get('source')?.toString() || 'contact_form';
    const consent = formData.get('consent') === 'on' || formData.get('consent') === 'true';
    const rawCalcData = formData.get('calculator_data')?.toString();

    let calcData = null;
    if (rawCalcData) {
      try {
        calcData = JSON.parse(rawCalcData);
      } catch (_) {
        calcData = rawCalcData;
      }
    }

    // Client-side Validation Checks
    if (!name || name.length < 2) {
      displayFormError('Please enter your full name (minimum 2 characters).');
      return;
    }

    const indianPhoneRegex = /^(?:\+91[\s-]?)?[6-9]\d{9}$/;
    if (!phone || !indianPhoneRegex.test(phone)) {
      displayFormError('Please provide a valid 10-digit Indian mobile number (e.g. 9820145678).');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      displayFormError('Please enter a valid business email address.');
      return;
    }

    if (!consent) {
      displayFormError('Please tick the consent checkbox to permit our architectural team to contact you.');
      return;
    }

    // Payload construction
    const payload = {
      name,
      phone,
      email,
      business_type: businessType,
      project_location: projectLocation,
      area_sqft: areaSqft,
      message,
      source,
      consent,
      calculator_data: calcData,
      honeypot: '',
    };

    // UI Loading State
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline';

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/enquiries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Success state
        form.reset();
        displayFormSuccess(
          `Thank you, ${name}! Your enquiry (#MSF-${result.id.toString().padStart(4, '0')}) has been registered. Our principal team will review your brief and contact you within 1 business day.`
        );
        showToast('Enquiry submitted successfully! Confirmation sent to your email.', 'success');
      } else {
        // Server validation or rate limit error
        let errorMsg = result.message || 'Unable to submit enquiry. Please check your inputs and try again.';
        if (result.errors && Array.isArray(result.errors)) {
          errorMsg = result.errors.map((e) => e.message).join(' | ');
        }
        displayFormError(errorMsg);
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      console.error('Lead submission request failed:', err);
      const networkMsg = 'Network connectivity issue. Please check your connection or contact us directly at besimdesigne@gmail.com.';
      displayFormError(networkMsg);
      showToast(networkMsg, 'error');
    } finally {
      submitBtn.disabled = false;
      btnText.style.display = 'inline';
      btnSpinner.style.display = 'none';
    }
  });

  function displayFormError(msg) {
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
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(16, 185, 129, 0.12)';
    alertBox.style.border = '1px solid #10b981';
    alertBox.style.color = '#6ee7b7';
    alertBox.style.padding = '18px 20px';
    alertBox.style.borderRadius = 'var(--radius-sm)';
    alertBox.style.fontSize = '0.95rem';
    alertBox.style.lineHeight = '1.6';
    alertBox.innerHTML = `<strong>Enquiry Confirmed ✓</strong><br>${msg}`;
  }
}

// =============================================================================
// Global Initializer
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile navigation toggle
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

  // 2. Portfolio Category Filter Buttons
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeCategory = btn.dataset.category;

      if (state.projects.length > 0) {
        renderProjects(state.projects);
      } else {
        // Filter static DOM fallback cards
        const cards = document.querySelectorAll('.project-card');
        cards.forEach((card) => {
          if (state.activeCategory === 'all' || card.dataset.category === state.activeCategory) {
            card.style.display = 'flex';
          } else {
            card.style.display = 'none';
          }
        });
      }
    });
  });

  // 3. Modal Close handlers & Escape key
  const modal = document.getElementById('projectModal');
  const modalClose = document.getElementById('modalClose');
  if (modal && modalClose) {
    modalClose.addEventListener('click', closeProjectModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeProjectModal();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProjectModal();
    }
  });

  // 4. Smooth Navbar Scroll & Active Link Tracking
  const navbar = document.getElementById('navbar');
  const sections = document.querySelectorAll('section[id]');
  const navLinkEls = document.querySelectorAll('.nav-link');

  function handleNavbarScroll() {
    if (!navbar) return;
    if (window.scrollY > 30) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }

    // ScrollSpy
    const scrollPos = window.scrollY + 120;
    sections.forEach((sec) => {
      const top = sec.offsetTop;
      const height = sec.offsetHeight;
      const id = sec.getAttribute('id');
      if (scrollPos >= top && scrollPos < top + height) {
        navLinkEls.forEach((link) => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }

  window.addEventListener('scroll', handleNavbarScroll, { passive: true });
  handleNavbarScroll();

  // 5. Initialize Components
  attachProjectModalTriggers();
  attachFaqAccordion();
  initCalculator();
  initContactForm();

  // 6. Fetch dynamic API data
  loadProjects();
  loadClients();
  loadTestimonials();
  loadFaqs();

  // 7. Stealth Admin Portal keyboard shortcut (Alt+A or Ctrl+Shift+A)
  window.addEventListener('keydown', (e) => {
    if ((e.altKey && e.key.toLowerCase() === 'a') || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a')) {
      e.preventDefault();
      window.location.href = '/admin/login.html';
    }
  });
});

