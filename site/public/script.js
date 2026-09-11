(function () {
  'use strict';
  var html = document.documentElement;
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
  var lang = function () { return html.getAttribute('data-lang') === 'en' ? 'en' : 'nl'; };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  var T = {
    sending: { nl: 'Versturen…', en: 'Sending…' },
    contactOk: { nl: 'Dank je, je bericht is verstuurd. We nemen snel contact met je op.', en: 'Thank you, your message has been sent. We will get back to you soon.' },
    subOk: { nl: 'Dank je, je bent aangemeld.', en: 'Thank you, you are subscribed.' },
    email: { nl: 'Vul een geldig e-mailadres in.', en: 'Please enter a valid email address.' },
    required: { nl: 'Vul je naam, e-mailadres en bericht in.', en: 'Please fill in your name, email and message.' },
    rate: { nl: 'Even rustig aan, probeer het zo nog eens.', en: 'Please wait a moment and try again.' },
    error: { nl: 'Er ging iets mis. Probeer het opnieuw of mail ons.', en: 'Something went wrong. Please try again or email us.' },
    copied: { nl: 'Link gekopieerd', en: 'Link copied' }
  };
  var t = function (k) { return T[k][lang()]; };
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* language */
  function applyLang(l) {
    html.setAttribute('data-lang', l);
    html.setAttribute('lang', l);
    store.set('elev8_lang', l);
    $$('[data-set-lang]').forEach(function (b) {
      var on = b.getAttribute('data-set-lang') === l;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('[data-placeholder-nl]').forEach(function (el) { el.setAttribute('placeholder', el.getAttribute('data-placeholder-' + l) || ''); });
    $$('option[data-nl]').forEach(function (o) { o.textContent = o.getAttribute('data-' + l) || o.textContent; });
    $$('[data-aria-nl]').forEach(function (el) { el.setAttribute('aria-label', el.getAttribute('data-aria-' + l) || ''); });
  }
  applyLang(lang());
  $$('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () { applyLang(b.getAttribute('data-set-lang')); });
  });

  /* header */
  var header = $('.site-header');
  function measure() { if (header) html.style.setProperty('--header-h', header.offsetHeight + 'px'); }
  function onScroll() {
    if (header) header.classList.toggle('is-solid', window.scrollY > 12 || document.body.classList.contains('nav-open'));
  }

  var ann = $('.announce');
  if (ann) {
    var annId = ann.getAttribute('data-announce');
    if (store.get('elev8_announce') === annId) {
      ann.remove();
    } else {
      $('.announce-close', ann).addEventListener('click', function () {
        store.set('elev8_announce', annId);
        ann.remove();
        measure();
      });
    }
  }
  measure();
  onScroll();
  window.addEventListener('resize', measure);
  window.addEventListener('scroll', onScroll, { passive: true });

  /* mobile menu */
  var toggle = $('.nav-toggle');
  if (toggle) {
    var setOpen = function (open) {
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      onScroll();
    };
    toggle.addEventListener('click', function () { setOpen(!document.body.classList.contains('nav-open')); });
    $$('.nav-menu a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { setOpen(false); toggle.focus(); }
    });
  }

  /* forms */
  function post(url, data) {
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return { ok: r.ok, status: r.status }; });
  }
  function say(form, text, isError) {
    var m = $('.form-msg', form);
    if (!m) return;
    m.textContent = text;
    m.classList.toggle('is-error', Boolean(isError));
  }
  function track(name, params) { if (window.__gaLoaded && window.gtag) window.gtag('event', name, params || {}); }

  $$('form[data-contact]').forEach(function (form) {
    var f = form.elements;
    var q = new URLSearchParams(location.search);
    var topics = { booking: 'Booking', demo: 'Muziek', muziek: 'Muziek', management: 'Management', events: 'Events', development: 'Artist development', samenwerking: 'Samenwerking' };
    var topic = topics[(q.get('topic') || '').toLowerCase()];
    if (topic) f.namedItem('topic').value = topic;
    var artist = (q.get('artist') || '').replace(/[^a-z0-9-]/gi, '');
    if (artist && !f.namedItem('message').value) {
      f.namedItem('message').value = (lang() === 'en' ? 'Booking inquiry for ' : 'Booking aanvraag voor ') + artist.toUpperCase() + '\n\n';
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        name: f.namedItem('name').value.trim(),
        email: f.namedItem('email').value.trim(),
        topic: f.namedItem('topic').value,
        message: f.namedItem('message').value.trim(),
        website: f.namedItem('website').value,
        lang: lang()
      };
      if (!data.name || !data.message) return say(form, t('required'), true);
      if (!EMAIL.test(data.email)) return say(form, t('email'), true);
      var btn = $('button[type=submit]', form);
      btn.disabled = true;
      say(form, t('sending'));
      post('/api/contact', data)
        .then(function (r) {
          if (r.ok) { form.reset(); say(form, t('contactOk')); track('generate_lead', { form: 'contact' }); }
          else say(form, r.status === 429 ? t('rate') : t('error'), true);
        })
        .catch(function () { say(form, t('error'), true); })
        .then(function () { btn.disabled = false; });
    });
  });

  $$('form[data-subscribe]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements;
      var email = f.namedItem('email').value.trim();
      if (!EMAIL.test(email)) return say(form, t('email'), true);
      var btn = $('button[type=submit]', form);
      btn.disabled = true;
      post('/api/subscribe', { email: email, website: f.namedItem('website').value, lang: lang() })
        .then(function (r) {
          if (r.ok) { form.reset(); say(form, t('subOk')); track('sign_up', { method: 'newsletter' }); }
          else say(form, r.status === 429 ? t('rate') : t('error'), true);
        })
        .catch(function () { say(form, t('error'), true); })
        .then(function () { btn.disabled = false; });
    });
  });

  /* share */
  $$('[data-copy-link]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = location.origin + location.pathname;
      var done = function () {
        var old = b.innerHTML;
        b.textContent = t('copied');
        setTimeout(function () { b.innerHTML = old; }, 1800);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { window.prompt('', url); });
      else window.prompt('', url);
    });
  });

  /* consent + Google Analytics: nothing loads before an explicit yes */
  var GA = window.ELEV8_GA;
  var box = $('[data-consent]');
  function loadGA() {
    if (!GA || window.__gaLoaded) return;
    window.__gaLoaded = true;
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA);
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', GA);
  }
  function clearGaCookies() {
    var parts = location.hostname.split('.');
    var domains = ['', location.hostname, '.' + location.hostname, '.' + parts.slice(-2).join('.')];
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (!/^_ga/.test(name)) return;
      domains.forEach(function (d) { document.cookie = name + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : ''); });
    });
  }
  if (GA && box) {
    var choice = store.get('elev8_consent');
    if (choice === 'granted') loadGA();
    else if (choice !== 'denied') box.hidden = false;
    $('[data-consent-accept]', box).addEventListener('click', function () {
      store.set('elev8_consent', 'granted');
      box.hidden = true;
      loadGA();
    });
    $('[data-consent-decline]', box).addEventListener('click', function () {
      store.set('elev8_consent', 'denied');
      box.hidden = true;
      if (window.__gaLoaded) window.gtag('consent', 'update', { analytics_storage: 'denied' });
      clearGaCookies();
    });
    $$('[data-consent-open]').forEach(function (b) {
      b.addEventListener('click', function () { box.hidden = false; $('[data-consent-accept]', box).focus(); });
    });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="mailto:"]');
    if (a) track('contact_email');
  });
})();
