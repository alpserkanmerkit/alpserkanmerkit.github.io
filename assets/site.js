/* ==========================================================================
   site.js — shared behaviour for every v5 page (classic script, loaded last via _shell/scripts-common.html)
   Needs: gsap + ScrollTrigger + lenis (CDN, loaded before this file) and the head inline script from
   _shell/head-common.html (it records the incoming View Transition as window.__vtP).
   Public API for page scripts:  window.ASM = { REDUCED, lenis, ready, pass(on), scrollTo(target) }
     ASM.ready  → Promise; resolves once the page may start its own entry motion (3D print, hero video):
                  after the Home loader has left AND after an incoming View Transition has finished (or at once).
     ASM.pass(true|false) → turns the top progress bar green (Software page: after the gate moment).
   Contract details: /_shell/README.md
   ========================================================================== */
(() => {
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HOVER = matchMedia('(hover: hover)').matches;
  const ASM = (window.ASM = window.ASM || {});
  ASM.REDUCED = REDUCED;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- active nav tab from location.pathname ---------- */
  const norm = p => p.replace(/index\.html$/, '').replace(/\/?$/, '/');
  const here = norm(location.pathname);
  $$('.site-nav ul a').forEach(a => {
    const h = a.getAttribute('href');
    if (h && h[0] === '/' && norm(new URL(h, location.href).pathname) === here) a.setAttribute('aria-current', 'page');
  });

  /* ---------- nav turns into a solid glass bar once the page has scrolled ---------- */
  const nav = $('.site-nav');
  if (nav) { const onS = () => nav.classList.toggle('scrolled', scrollY > 40); addEventListener('scroll', onS, { passive: true }); onS(); }

  /* ---------- sequencing: incoming View Transition (from the head script) + Home loader ---------- */
  const vtDone = (window.__vtP || Promise.resolve(null)).then(vt => vt ? vt.finished.then(() => vt, () => vt) : null);
  const loader = $('#loader');
  let seen = false;
  try { seen = sessionStorage.getItem('asm-seen') === '1'; sessionStorage.setItem('asm-seen', '1'); } catch (e) {}

  const G = window.gsap, ST = window.ScrollTrigger;
  if (!G || !ST) {                                   // CDN failed: show everything, keep links working
    document.documentElement.classList.add('no-gsap');
    if (loader) loader.remove();
    ASM.ready = vtDone; ASM.pass = () => {}; ASM.scrollTo = t => { const el = typeof t === 'string' ? $(t) : t; el && el.scrollIntoView(); };
    vtDone.then(() => dispatchEvent(new Event('asm:ready')));
    return;
  }
  G.registerPlugin(ST);

  const loaderDone = new Promise(res => {
    if (!loader) return res();
    if (seen || REDUCED) { loader.remove(); return res(); }
    const c = { v: 0 }, count = $('.count', loader), bar = $('.bar', loader);
    G.to(c, { v: 100, duration: 1.4, ease: 'power2.inOut',
      onUpdate: () => { count.textContent = Math.round(c.v); bar.style.width = c.v + '%'; },
      onComplete: () => G.to(loader, { yPercent: -100, duration: .9, ease: 'expo.inOut', onComplete: () => { loader.remove(); res(); } }) });
  });
  ASM.ready = Promise.all([vtDone, loaderDone]).then(([vt]) => {
    window.__introDone = true; dispatchEvent(new Event('asm:ready')); return vt;
  });

  /* ---------- smooth scroll (off under reduced motion) ---------- */
  let lenis = null;
  if (!REDUCED && window.Lenis) {
    lenis = new Lenis({ lerp: 0.12, smoothWheel: true });
    lenis.on('scroll', ST.update);
    G.ticker.add(t => lenis.raf(t * 1000));
    G.ticker.lagSmoothing(0);
  }
  ASM.lenis = lenis;
  const yOf = el => el.getBoundingClientRect().top + scrollY;
  ASM.scrollTo = (t, opts = {}) => {
    const el = typeof t === 'string' ? $(t) : t; if (!el) return;
    if (lenis) lenis.scrollTo(opts.immediate ? yOf(el) : el, opts.immediate ? { immediate: true } : { duration: 1.6 });
    else scrollTo({ top: yOf(el), behavior: opts.immediate || REDUCED ? 'auto' : 'smooth' });
  };
  /* same-page anchors (#contact etc.) */
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href'); if (id.length < 2) return;
    const el = $(id); if (!el) return;
    e.preventDefault(); ASM.scrollTo(el); history.replaceState(null, '', id);
  }));

  /* ---------- text splitting: [data-split] → letters (.ch), [data-words] → words (.w) ---------- */
  $$('[data-split]').forEach(el => {
    el.innerHTML = [...el.textContent].map(c => `<span class="ch">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  });
  $$('[data-words]').forEach(p => {
    const walk = n => [...n.childNodes].forEach(c => {
      if (c.nodeType !== 3) return walk(c);
      const frag = document.createDocumentFragment();
      c.textContent.split(/(\s+)/).forEach(w => {
        if (!w) return;
        if (/^\s+$/.test(w)) return frag.append(w);
        const s = document.createElement('span'); s.className = 'w'; s.textContent = w; frag.append(s);
      });
      c.replaceWith(frag);
    });
    walk(p);
  });
  /* entry motion of split hero letters and [data-intro] blocks — after ASM.ready */
  ASM.ready.then(() => {
    const tl = G.timeline();
    if ($('[data-split] .ch')) tl.to('[data-split] .ch', { y: 0, duration: 1.05, ease: 'expo.out', stagger: .032 });
    if ($('[data-intro]')) tl.to('[data-intro]', { opacity: 1, y: 0, duration: .8, stagger: .12 }, $('[data-split] .ch') ? '-=.7' : 0);
  });

  /* ---------- cursor, magnetic buttons, door glow (pointer devices only) ---------- */
  const dot = $('.cursor'), ring = $('.cursor-ring');
  if (HOVER && dot && ring) {
    const xr = G.quickTo(ring, 'x', { duration: .45, ease: 'power3' }), yr = G.quickTo(ring, 'y', { duration: .45, ease: 'power3' });
    addEventListener('pointermove', e => { G.set(dot, { x: e.clientX, y: e.clientY }); xr(e.clientX); yr(e.clientY); });
    addEventListener('pointermove', () => document.documentElement.classList.add('pointer'), { once: true });
    $$('a,button,[data-lightbox]').forEach(el => {
      el.addEventListener('pointerenter', () => ring.classList.add('hover'));
      el.addEventListener('pointerleave', () => ring.classList.remove('hover'));
    });
    $$('.magnetic').forEach(b => {
      b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); G.to(b, { x: (e.clientX - r.left - r.width / 2) * .3, y: (e.clientY - r.top - r.height / 2) * .4, duration: .4 }); });
      b.addEventListener('pointerleave', () => G.to(b, { x: 0, y: 0, duration: .6, ease: 'elastic.out(1,.4)' }));
    });
  }
  /* touch screens have no hover: a door "prints" its image once it is mostly in view */
  if (!HOVER) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('door-printed'); io.unobserve(e.target); } }), { threshold: .6 });
    $$('.door').forEach(d => io.observe(d));
  }

  /* ---------- reveal + heading print-wipe (scroll-driven → kept under reduced motion) ---------- */
  $$('.reveal').forEach(el => G.to(el, { opacity: 1, duration: .9, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 88%' } }));
  const WIPE = '.sec-head h2, [data-wipe], .site-footer h2';
  $$(WIPE).forEach(h => {
    const inner = document.createElement('span'), edge = document.createElement('span');
    inner.className = 'hw-in'; edge.className = 'hw-edge'; edge.setAttribute('aria-hidden', 'true');
    while (h.firstChild) inner.append(h.firstChild);
    h.classList.add('hw'); h.append(inner, edge);
    G.timeline({ scrollTrigger: { trigger: h, start: 'top 88%' } })
      .set(edge, { opacity: 1 })
      .to(inner, { clipPath: 'inset(-25% -10% -25% -10%)', duration: .9, ease: 'power3.inOut' }, 0)
      .fromTo(edge, { top: '100%' }, { top: '0%', duration: .9, ease: 'power3.inOut' }, 0)
      .to(edge, { opacity: 0, duration: .35 });
  });
  /* manifesto-style word fill */
  $$('[data-words]').forEach(p => G.to($$('.w', p), { opacity: 1, stagger: .05, ease: 'none',
    scrollTrigger: { trigger: p, start: 'top 80%', end: 'bottom 55%', scrub: true } }));

  /* ---------- counters: <span data-count="0.086" data-dec="3">0</span> ---------- */
  $$('[data-count]').forEach(el => {
    const end = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), o = { v: 0 };
    el.textContent = (0).toFixed(dec);              // markup holds the real value (no-JS / no-CDN fallback)
    ST.create({ trigger: el, start: 'top 92%', once: true,
      onEnter: () => G.to(o, { v: end, duration: 1.6, ease: 'power3.out', onUpdate: () => el.textContent = o.v.toFixed(dec) }) });
  });

  /* ---------- page progress bar (+ green "pass" state) ---------- */
  const sprog = $('.sprog');
  if (sprog) G.to(sprog, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .3 } });
  ASM.pass = on => sprog && sprog.classList.toggle('pass', !!on);

  /* ---------- stacked transitions (track pages, desktop): main > section[data-stack] ----------
     each participant is held + dimmed while the next slides over it as a rounded card. Transform/filter are applied
     only while held — on an ancestor they would break a pinned (position:fixed) child. */
  const secs = $$('main > section');
  const stack = secs.filter(s => s.hasAttribute('data-stack'));
  if (stack.length > 1) {
    secs.forEach((sec, i) => { sec.style.zIndex = i + 1; });
    ST.matchMedia({ '(min-width: 900px)': () => {
      stack.forEach((sec, i) => {
        if (i > 0) {
          sec.classList.add('stack-in');
          G.fromTo(sec, { y: 40 }, { y: 0, ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'top 45%', scrub: true } });
        }
        if (i < stack.length - 1)
          G.fromTo(sec, { scale: 1, filter: 'brightness(1)' }, { scale: .94, filter: 'brightness(0.3)', ease: 'none', transformOrigin: '50% 100%', immediateRender: false,
            scrollTrigger: { trigger: sec, start: 'bottom bottom', end: 'bottom top', scrub: true, pin: true, pinSpacing: false,
              onLeaveBack: () => G.set(sec, { clearProps: 'transform,filter,scale,translate,rotate' }),
              onRefresh: st => { if (st.progress === 0) G.set(sec, { clearProps: 'transform,filter,scale,translate,rotate' }); } } });
      });
      return () => stack.forEach(s => s.classList.remove('stack-in'));
    } });
  }

  /* ---------- HUD: "NN / TT — NAME" from [data-hud] blocks; it steps aside while a heading crosses the bottom 80px ---------- */
  const hud = $('.hud'), huds = $$('[data-hud]');
  if (hud && huds.length) {
    const hn = $('.hud-n', hud), ht = $('.hud-t', hud);
    $('.hud-total', hud).textContent = String(huds.length - 1).padStart(2, '0');
    huds.forEach((sec, i) => ST.create({ trigger: sec, start: 'top 55%', end: 'bottom 55%',
      onToggle: st => { if (st.isActive) { hn.textContent = String(i).padStart(2, '0'); ht.textContent = sec.dataset.hud; } } }));
    const block = new Set();
    $$(WIPE).forEach(el => ST.create({ trigger: el, start: 'top bottom', end: 'bottom bottom-=80',
      onToggle: st => { st.isActive ? block.add(el) : block.delete(el); hud.classList.toggle('hide', block.size > 0); } }));
  }

  /* ---------- videos: src arrives late (data-src), play only while visible ---------- */
  /* the two observers fire in no guaranteed order: whichever runs second must still start a visible video */
  /* video[data-hover] is skipped: the page plays it on hover (or in view on touch) with its own script */
  const vids = $$('video:not([data-hover])'), shown = new WeakSet();
  const arm = v => { if (v.dataset.src) { v.src = v.dataset.src; v.removeAttribute('data-src'); } };
  /* video[data-t0]: start (and loop back) that many seconds in */
  vids.filter(v => v.dataset.t0).forEach(v => { const t0 = +v.dataset.t0, skip = () => { if (v.currentTime < t0) v.currentTime = t0; };
    v.addEventListener('loadedmetadata', skip); v.addEventListener('timeupdate', skip); });
  const go = v => { const p = v.play(); if (p) p.catch(() => {}); };
  const load = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const v = e.target; load.unobserve(v); arm(v);
    if (shown.has(v)) go(v);
  }), { rootMargin: '300px 0px' });
  const play = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target;
    if (e.isIntersecting) { shown.add(v); arm(v); go(v); } else { shown.delete(v); v.pause(); }
  }), { threshold: .15 });
  vids.forEach(v => { load.observe(v); play.observe(v); });

  /* ---------- lightbox ---------- */
  const lb = $('.lightbox');
  if (lb) {
    const big = $('img', lb), close = () => lb.classList.remove('on');
    $$('[data-lightbox] img').forEach(img => {
      const fig = img.closest('[data-lightbox]');
      const open = () => { big.src = img.currentSrc || img.src; big.alt = img.alt; lb.classList.add('on'); };
      fig.tabIndex = 0; fig.setAttribute('role', 'button'); fig.setAttribute('aria-label', 'Enlarge: ' + img.alt);
      fig.addEventListener('click', open);
      fig.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    lb.addEventListener('click', close);
    addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  /* ---------- View Transition: door → track hero morph (outgoing side) ----------
     The clicked a[data-door] gets view-transition-name "door" (+ "door-title" on its .door-title) just before the
     page swaps. A track page's own #track-hero carries those names statically, so it gives them up first. */
  let doorClicked = null;
  document.addEventListener('click', e => { doorClicked = e.target.closest && e.target.closest('a[data-door]'); }, true);
  addEventListener('pageswap', e => {
    const vt = e.viewTransition; if (!vt || !e.activation || !e.activation.entry) return;
    const to = new URL(e.activation.entry.url), named = [];
    const name = (el, n) => { if (el) { el.style.viewTransitionName = n; named.push(el); } };
    const door = doorClicked && norm(new URL(doorClicked.href).pathname) === norm(to.pathname) ? doorClicked : null;
    const hero = $('#track-hero');
    if (hero) {
      const r = hero.getBoundingClientRect();
      if (door || r.bottom < 0 || r.top > innerHeight) { name(hero, 'none'); name($('h1', hero), 'none'); }
    }
    if (door) { name(door, 'door'); name($('.door-title', door), 'door-title'); }
    vt.finished.finally(() => named.forEach(el => { el.style.viewTransitionName = ''; }));
  });
  addEventListener('pageshow', e => {
    doorClicked = null;
    if (e.persisted) { $$('[style*="view-transition-name"]').forEach(el => { el.style.viewTransitionName = ''; }); ST.refresh(); }
  });

  /* opening/closing a Details changes section heights → re-measure pins (else the next stacked section covers it) */
  document.addEventListener('toggle', e => { if (e.target.tagName === 'DETAILS') ST.refresh(); }, true);

  /* ---------- deep links: land on #hash after pins/spacers exist ---------- */
  addEventListener('load', () => {
    ST.refresh();
    const id = location.hash; if (id.length < 2) return;
    let el = null; try { el = $(id); } catch (err) {}
    if (el) requestAnimationFrame(() => ASM.scrollTo(el, { immediate: true }));
  });
})();
