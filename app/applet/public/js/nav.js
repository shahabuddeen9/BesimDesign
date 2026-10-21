/**
 * @file /public/js/nav.js
 * @description Universal, pristine navigation controller for Besim Design.
 * Handles fixed header offset scrolling, mobile menu toggle, smooth dropdown interaction,
 * scrollspy active state tracking, and cross-page anchor positioning.
 */

(function () {
  const HEADER_OFFSET = 85;

  function initNav() {
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');

    function closeMobileMenu() {
      if (navLinks && navLinks.classList.contains('active')) {
        navLinks.classList.remove('active');
        document.body.style.overflow = '';
        if (navToggle) {
          navToggle.textContent = '☰';
          navToggle.setAttribute('aria-expanded', 'false');
        }
      }
    }

    // 1. Mobile Menu Toggle
    if (navToggle && navLinks) {
      navToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !navLinks.classList.contains('active');
        if (willOpen) {
          navLinks.classList.add('active');
          document.body.style.overflow = 'hidden';
          navToggle.textContent = '✕';
          navToggle.setAttribute('aria-expanded', 'true');
        } else {
          closeMobileMenu();
        }
      });

      // Close mobile menu when clicking outside navbar
      document.addEventListener('click', (e) => {
        if (navbar && !navbar.contains(e.target) && navLinks.classList.contains('active')) {
          closeMobileMenu();
        }
      });
    }

    // 2. Mobile Dropdown Toggle (for "Project" menu item)
    document.querySelectorAll('.nav-item-dropdown > .nav-link').forEach((dropdownLink) => {
      dropdownLink.addEventListener('click', (e) => {
        if (window.innerWidth <= 992) {
          const parent = dropdownLink.closest('.nav-item-dropdown');
          if (parent) {
            e.preventDefault();
            e.stopPropagation();
            parent.classList.toggle('open');
          }
        }
      });
    });

    // 3. Smooth in-page anchor scrolling with fixed header offset
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', function (e) {
        const hash = this.getAttribute('href');
        if (!hash || hash === '#') return;

        // If mobile and clicking the dropdown parent, let mobile dropdown logic handle it
        if (window.innerWidth <= 992 && this.classList.contains('nav-link') && this.closest('.nav-item-dropdown')) {
          return;
        }

        const target = document.querySelector(hash);
        if (target) {
          e.preventDefault();
          closeMobileMenu();

          const topPos = target.getBoundingClientRect().top + window.pageYOffset - HEADER_OFFSET;
          window.scrollTo({
            top: topPos,
            behavior: 'smooth',
          });

          if (window.history.pushState) {
            window.history.pushState(null, '', hash);
          }
        }
      });
    });

    // Also close mobile menu on clicking any regular link or dropdown item
    document.querySelectorAll('.nav-link:not(.nav-item-dropdown > .nav-link), .dropdown-item').forEach((link) => {
      link.addEventListener('click', () => {
        closeMobileMenu();
      });
    });

    // 4. Sticky Header Blur & ScrollSpy
    const sections = document.querySelectorAll('section[id]');
    const navAnchors = document.querySelectorAll('.nav-links .nav-link');

    function onScroll() {
      if (!navbar) return;
      if (window.scrollY > 25) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }

      // ScrollSpy on homepage where section anchors exist
      if (sections.length > 0 && (window.location.pathname === '/' || window.location.pathname.endsWith('index.html'))) {
        const scrollPos = window.scrollY + HEADER_OFFSET + 35;
        sections.forEach((sec) => {
          const top = sec.offsetTop;
          const height = sec.offsetHeight;
          const id = sec.getAttribute('id');
          if (scrollPos >= top && scrollPos < top + height) {
            navAnchors.forEach((link) => {
              const href = link.getAttribute('href');
              if (href === `#${id}` || href === `/index.html#${id}`) {
                link.classList.add('active');
              } else if (!link.closest('.nav-item-dropdown') || href !== '#projects') {
                link.classList.remove('active');
              }
            });
          }
        });
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // 5. Cross-page initial hash jump smooth offset correction
    if (window.location.hash) {
      const hash = window.location.hash;
      const target = document.querySelector(hash);
      if (target) {
        setTimeout(() => {
          const topPos = target.getBoundingClientRect().top + window.pageYOffset - HEADER_OFFSET;
          window.scrollTo({
            top: topPos,
            behavior: 'smooth',
          });
        }, 120);
      }
    }

    // 6. Stealth Admin shortcut (Alt+A or Ctrl+Shift+A) & Escape key
    window.addEventListener('keydown', (e) => {
      if ((e.altKey && e.key.toLowerCase() === 'a') || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a')) {
        e.preventDefault();
        window.location.href = '/admin/dashboard.html?tab=projects';
      }
      if (e.key === 'Escape') {
        closeMobileMenu();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();
