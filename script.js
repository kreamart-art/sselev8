/* ============================================
   S&S ELEV8 ENTERTAINMENT
   script.js — shared interactions
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {
  initLanguageSystem();
  initCursor();
  initParticles();
  initRevealObserver();
  initStatCounters();
  initNavToggle();
  initFormBilingualAttrs();
  initSmoothAnchorScroll();
  initFormHandler();
});

/* ---- 1. Language toggle + persistence ---- */
function initLanguageSystem() {
  var html = document.documentElement;
  var current = html.getAttribute('data-lang') || 'en';
  var buttons = document.querySelectorAll('[data-set-lang]');

  function applyLang(lang) {
    html.setAttribute('data-lang', lang);
    html.setAttribute('lang', lang);
    try { localStorage.setItem('elev8_lang', lang); } catch (e) {}

    buttons.forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-set-lang') === lang);
      btn.setAttribute('aria-pressed', btn.getAttribute('data-set-lang') === lang ? 'true' : 'false');
    });

    rewriteInternalLinks(lang);
    syncBilingualAttrs(lang);
  }

  applyLang(current);

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var lang = btn.getAttribute('data-set-lang');
      if (!lang) return;
      applyLang(lang);
    });
  });
}

function rewriteInternalLinks(lang) {
  var anchors = document.querySelectorAll('a[href]');
  anchors.forEach(function (a) {
    var href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('http://') || href.startsWith('https://')) {
      try {
        var u = new URL(href, window.location.href);
        if (u.origin !== window.location.origin) return;
      } catch (e) { return; }
    }
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#') || href.startsWith('javascript:')) return;

    try {
      var url = new URL(href, window.location.href);
      url.searchParams.set('lang', lang);
      // keep relative form
      a.setAttribute('href', url.pathname.split('/').pop() + url.search + url.hash);
    } catch (e) { /* ignore malformed */ }
  });
}

function syncBilingualAttrs(lang) {
  document.querySelectorAll('[data-placeholder-en][data-placeholder-nl]').forEach(function (el) {
    el.setAttribute('placeholder', el.getAttribute('data-placeholder-' + lang) || '');
  });
  document.querySelectorAll('option[data-en][data-nl]').forEach(function (opt) {
    opt.textContent = opt.getAttribute('data-' + lang) || '';
  });
  document.querySelectorAll('[data-aria-en][data-aria-nl]').forEach(function (el) {
    el.setAttribute('aria-label', el.getAttribute('data-aria-' + lang) || '');
  });
}

function initFormBilingualAttrs() {
  var lang = document.documentElement.getAttribute('data-lang') || 'en';
  syncBilingualAttrs(lang);
}

/* ---- 2. Custom cursor ---- */
function initCursor() {
  if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;

  var dot = document.querySelector('.cursor-dot');
  var ring = document.querySelector('.cursor-ring');
  if (!dot || !ring) return;

  var x = window.innerWidth / 2;
  var y = window.innerHeight / 2;
  var rx = x;
  var ry = y;
  var visible = false;

  function show() {
    if (visible) return;
    visible = true;
    dot.style.opacity = '1';
    ring.style.opacity = '1';
  }

  window.addEventListener('mousemove', function (e) {
    x = e.clientX;
    y = e.clientY;
    dot.style.transform = 'translate3d(' + (x - 3) + 'px, ' + (y - 3) + 'px, 0)';
    show();
  });

  window.addEventListener('mouseleave', function () {
    visible = false;
    dot.style.opacity = '0';
    ring.style.opacity = '0';
  });

  function animate() {
    rx += (x - rx) * 0.18;
    ry += (y - ry) * 0.18;
    ring.style.transform = 'translate3d(' + (rx - 18) + 'px, ' + (ry - 18) + 'px, 0)';
    requestAnimationFrame(animate);
  }
  animate();

  var hoverSel = 'a, button, input, textarea, select, label, .card, .artist-card, .tba, .faq-item';
  document.body.addEventListener('mouseover', function (e) {
    if (e.target.closest(hoverSel)) ring.classList.add('is-hover');
  });
  document.body.addEventListener('mouseout', function (e) {
    if (e.target.closest(hoverSel)) ring.classList.remove('is-hover');
  });
}

/* ---- 3. Floating particles ---- */
function initParticles() {
  document.querySelectorAll('.particles').forEach(function (container) {
    var count = parseInt(container.getAttribute('data-count') || '40', 10);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var p = document.createElement('span');
      p.className = 'particle';
      var left = Math.random() * 100;
      var top = 60 + Math.random() * 40;
      var dur = 10 + Math.random() * 16;
      var delay = -Math.random() * dur;
      var dx = (Math.random() - 0.5) * 100;
      var dy = -120 - Math.random() * 260;
      var op = 0.18 + Math.random() * 0.5;
      p.style.cssText =
        'left:' + left + '%;top:' + top + '%;' +
        'animation-duration:' + dur + 's;' +
        'animation-delay:' + delay + 's;' +
        '--p-dx:' + dx + 'px;' +
        '--p-dy:' + dy + 'px;' +
        '--p-op:' + op + ';';
      frag.appendChild(p);
    }
    container.appendChild(frag);
  });
}

/* ---- 4. Reveal on scroll ---- */
function initRevealObserver() {
  var nodes = document.querySelectorAll('.reveal');
  if (!nodes.length) return;
  if (!('IntersectionObserver' in window)) {
    nodes.forEach(function (n) { n.classList.add('is-visible'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  nodes.forEach(function (n) { io.observe(n); });
}

/* ---- 5. Stat counters ---- */
function initStatCounters() {
  var nodes = document.querySelectorAll('.counter');
  if (!nodes.length) return;
  if (!('IntersectionObserver' in window)) {
    nodes.forEach(function (n) { renderCounter(n, parseFloat(n.getAttribute('data-target') || '0')); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.45 });
  nodes.forEach(function (n) { io.observe(n); });
}

function animateCounter(el) {
  var target = parseFloat(el.getAttribute('data-target') || '0');
  var dur = parseInt(el.getAttribute('data-dur') || '1600', 10);
  var start = performance.now();

  function tick(now) {
    var p = Math.min(1, (now - start) / dur);
    var eased = 1 - Math.pow(1 - p, 3);
    var val = Math.floor(target * eased);
    renderCounter(el, val);
    if (p < 1) requestAnimationFrame(tick);
    else renderCounter(el, target);
  }
  requestAnimationFrame(tick);
}

function renderCounter(el, val) {
  var pad = parseInt(el.getAttribute('data-pad') || '0', 10);
  var s = String(Math.floor(val));
  if (pad) while (s.length < pad) s = '0' + s;
  el.textContent = s;
}

/* ---- 6. Mobile nav ---- */
function initNavToggle() {
  var toggle = document.querySelector('.nav-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', function () {
    document.body.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', document.body.classList.contains('nav-open') ? 'true' : 'false');
  });
  document.querySelectorAll('.nav-menu a').forEach(function (a) {
    a.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
  });
}

/* ---- 7. Smooth anchor scrolling ---- */
function initSmoothAnchorScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length <= 1) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* ---- 8. Contact form handler (static — no backend) ---- */
function initFormHandler() {
  var form = document.querySelector('form.form');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var lang = document.documentElement.getAttribute('data-lang') || 'en';
    var data = {
      name: form.querySelector('#name') ? form.querySelector('#name').value : '',
      email: form.querySelector('#email') ? form.querySelector('#email').value : '',
      reason: form.querySelector('#reason') ? form.querySelector('#reason').value : '',
      message: form.querySelector('#message') ? form.querySelector('#message').value : ''
    };
    var subject = encodeURIComponent('[' + (data.reason || 'Inquiry') + '] ' + (data.name || ''));
    var body = encodeURIComponent(
      (lang === 'nl' ? 'Naam: ' : 'Name: ') + data.name + '\n' +
      'Email: ' + data.email + '\n' +
      (lang === 'nl' ? 'Reden: ' : 'Reason: ') + data.reason + '\n\n' +
      data.message
    );
    var to = 'info@elev8entertainment.nl';
    window.location.href = 'mailto:' + to + '?subject=' + subject + '&body=' + body;
  });
}
