/* ==========================================================================
   Mistigrip — main.js
   JavaScript natif, sans dépendance. Aucun texte n'est injecté :
   tout le contenu est dans le HTML, le script ne fait qu'afficher, masquer
   et mettre à jour des chiffres (quantités, prix).
   Mouvement au défilement et 3D : section 11 (dont la chaussette en kit,
   qui se monte pièce par pièce). Le défilement reste natif, et tout est
   coupé si l'utilisateur demande à réduire les animations.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     Réglages commerciaux
     ------------------------------------------------------------------------ */
  var PRICE_CENTS = 1490;          // À VALIDER : prix du lot de 4 (14,90 €)
  var FREE_SHIPPING_CENTS = 2900;  // À VALIDER : seuil de livraison offerte (29 €)
  var MAX_QTY = 10;
  var SIZES = ['S', 'M', 'L'];
  var STORAGE_KEY = 'mistigrip-panier-v1';
  var CART_OPEN_DELAY = 900;       // laisse voir « Ajouté », le picot volant et le rebond du compteur

  /* ------------------------------------------------------------------------
     Outils
     ------------------------------------------------------------------------ */
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var desktop = window.matchMedia('(min-width: 64em)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var motion = {
    on: false, ready: false, items: [], tilts: [], hero: null, kit: null, floors: null, raf: 0,
    lastY: 0, lastScrollAt: 0, vh: window.innerHeight, maxScroll: 0,
    spring: { x: 0, v: 0 }
  };
  var motionOn = function () { return motion.on; };
  var money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  var formatCents = function (cents) { return money.format(cents / 100); };
  var clampQty = function (value) {
    var n = parseInt(value, 10);
    if (isNaN(n)) n = 1;
    return Math.min(MAX_QTY, Math.max(1, n));
  };

  var root = document.documentElement;
  var header = $('#header');
  var announce = $('#announce');
  var main = $('#contenu');
  var footer = $('.footer');
  var buybar = $('#buybar');

  /* Éléments focusables visibles d'un conteneur (pour piéger le focus) */
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), [tabindex]:not([tabindex="-1"])';
  function focusables(container) {
    return $$(FOCUSABLE, container).filter(function (el) {
      return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    });
  }
  function trapFocus(event, container) {
    if (event.key !== 'Tab') return;
    var items = focusables(container);
    if (!items.length) { event.preventDefault(); return; }
    var first = items[0];
    var last = items[items.length - 1];
    var active = document.activeElement;
    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !container.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }
  function setInert(elements, value) {
    elements.forEach(function (el) { if (el) el.inert = value; });
  }
  function lockScroll(value) {
    root.classList.toggle('is-locked', value);
  }

  var state = { menuOpen: false, cartOpen: false };


  /* ========================================================================
     1. HEADER : s'affine dès que la barre d'annonce sort de l'écran
     ======================================================================== */
  if (header && announce && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      header.classList.toggle('is-scrolled', !entries[0].isIntersecting);
    }).observe(announce);
  }


  /* ========================================================================
     2. MENU MOBILE PLEIN ÉCRAN
     ======================================================================== */
  var burger = $('#burger');
  var nav = $('#nav');
  var headerBar = $('.header__bar');

  function onMenuKeydown(event) {
    if (event.key === 'Escape') {
      closeMenu(true);
      return;
    }
    trapFocus(event, headerBar);
  }
  function openMenu() {
    state.menuOpen = true;
    // Le menu démarre juste sous la barre visible (la barre d'annonce peut encore être affichée)
    nav.style.setProperty('--menu-top', Math.round(headerBar.getBoundingClientRect().bottom) + 'px');
    burger.setAttribute('aria-expanded', 'true');
    nav.classList.add('is-open');
    header.classList.add('is-menu-open');
    setInert([announce, main, footer, buybar], true);
    lockScroll(true);
    document.addEventListener('keydown', onMenuKeydown);
    var firstLink = $('.nav__link', nav);
    if (firstLink) firstLink.focus();
    updateBuybar();
  }
  function closeMenu(restoreFocus) {
    if (!state.menuOpen) return;
    state.menuOpen = false;
    burger.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
    header.classList.remove('is-menu-open');
    setInert([announce, main, footer], false);
    lockScroll(false);
    document.removeEventListener('keydown', onMenuKeydown);
    if (restoreFocus) burger.focus();
    updateBuybar();
  }
  if (burger && nav) {
    burger.addEventListener('click', function () {
      if (state.menuOpen) closeMenu(true); else openMenu();
    });
    // Un lien du menu ferme le menu avant que le navigateur ne défile vers l'ancre
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) closeMenu(false);
    });
    // Passage en desktop : le menu plein écran n'a plus lieu d'être
    desktop.addEventListener('change', function (event) {
      if (event.matches) closeMenu(false);
    });
  }


  /* ========================================================================
     3. MODULE « SANS / AVEC MISTIGRIP » (role="switch")
     ======================================================================== */
  var compareSwitch = $('#compare-switch');
  var scene = $('#compare-scene');
  if (compareSwitch && scene) {
    var captions = $$('.compare__caption');
    compareSwitch.addEventListener('click', function () {
      var checked = compareSwitch.getAttribute('aria-checked') !== 'true';
      var mode = checked ? 'avec' : 'sans';
      compareSwitch.setAttribute('aria-checked', String(checked));
      // Changer d'état change le nom de l'animation CSS : elle repart de zéro
      scene.classList.add('is-animated');
      scene.setAttribute('data-state', mode);
      captions.forEach(function (caption) {
        caption.hidden = caption.getAttribute('data-state') !== mode;
      });
    });
  }


  /* ========================================================================
     4. DE L’ÉTAPE 1 À L’ÉTAPE 2 : le poids présélectionne la taille
     ======================================================================== */
  var weightInputs = $$('.weight__input');
  var sizeInputs = $$('.size__input');
  var sizesField = $('#sizes');
  var sizeError = $('#size-error');
  var sizeHints = $$('.sizes__hint');
  var weightMessages = $$('.weights__msg');

  function selectedSize() {
    var checked = sizeInputs.filter(function (input) { return input.checked; })[0];
    return checked ? checked.value : '';
  }
  function applySize(size, fromWeight) {
    sizeInputs.forEach(function (input) { input.checked = input.value === size; });
    weightInputs.forEach(function (input) { input.checked = input.value === size; });
    sizeHints.forEach(function (hint) { hint.hidden = hint.getAttribute('data-size') !== size; });
    weightMessages.forEach(function (msg) {
      msg.hidden = !fromWeight || msg.getAttribute('data-size') !== size;
    });
    if (size && sizeError) {
      sizeError.hidden = true;
      sizesField.classList.remove('has-error');
    }
  }
  weightInputs.forEach(function (input) {
    input.addEventListener('change', function () { applySize(input.value, true); });
  });
  sizeInputs.forEach(function (input) {
    input.addEventListener('change', function () { applySize(input.value, false); });
  });


  /* ========================================================================
     5. GALERIE PRODUIT (changement au clic uniquement)
     ======================================================================== */
  var thumbs = $$('.thumb');
  var slides = $$('.gallery__slide');
  var flipTimer = null;
  function showSlide(next) {
    slides.forEach(function (slide) {
      slide.hidden = slide !== next;
      slide.classList.remove('is-flip-out', 'is-flip-in');
    });
  }
  thumbs.forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      var next = document.getElementById(thumb.getAttribute('aria-controls'));
      var current = slides.filter(function (slide) { return !slide.hidden; })[0];
      thumbs.forEach(function (t) { t.setAttribute('aria-pressed', String(t === thumb)); });
      window.clearTimeout(flipTimer);
      if (!next) return;
      if (next === current || !current || !motionOn()) {
        showSlide(next);
        return;
      }
      // Avec le mouvement : la photo pivote, change à mi-course, puis accroche
      current.classList.remove('is-flip-in', 'is-flip-out');
      void current.offsetWidth; // relance l'animation
      current.classList.add('is-flip-out');
      flipTimer = window.setTimeout(function () {
        showSlide(next);
        next.classList.add('is-flip-in');
        flipTimer = window.setTimeout(function () { next.classList.remove('is-flip-in'); }, 520);
      }, 200);
    });
  });


  /* ========================================================================
     6. QUANTITÉ (bloc produit)
     ======================================================================== */
  var qtyInput = $('#qty');
  if (qtyInput) {
    $$('[data-qty-step]').forEach(function (button) {
      button.addEventListener('click', function () {
        qtyInput.value = clampQty(Number(qtyInput.value) + Number(button.getAttribute('data-qty-step')));
      });
    });
    qtyInput.addEventListener('change', function () { qtyInput.value = clampQty(qtyInput.value); });
  }


  /* ========================================================================
     7. PANIER : état, sauvegarde (localStorage dans un try/catch), rendu
     ======================================================================== */
  function emptyCart() { return { S: 0, M: 0, L: 0 }; }
  function sanitize(data) {
    var clean = emptyCart();
    if (data && typeof data === 'object') {
      SIZES.forEach(function (size) {
        var n = parseInt(data[size], 10);
        clean[size] = isNaN(n) ? 0 : Math.min(MAX_QTY, Math.max(0, n));
      });
    }
    return clean;
  }
  function loadCart() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? sanitize(JSON.parse(raw)) : emptyCart();
    } catch (error) {
      return emptyCart();
    }
  }
  function saveCart() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (error) {
      /* Stockage indisponible (navigation privée, quota) : le panier reste en mémoire. */
    }
  }

  var cart = loadCart();
  var cartEl = $('#cart');
  var cartPanel = $('.cart__panel');
  var cartOpenBtn = $('#cart-open');
  var countEls = $$('.js-cart-count');
  var lines = $$('.line');
  var emptyEl = $('.js-cart-empty');
  var footEl = $('.js-cart-foot');
  var subtotalEl = $('.js-cart-subtotal');
  var remainingEl = $('.js-cart-remaining');
  var gaugeEl = $('.js-cart-gauge');
  var shipTodo = $('[data-ship="todo"]');
  var shipDone = $('[data-ship="done"]');

  function totalCount() {
    return SIZES.reduce(function (sum, size) { return sum + cart[size]; }, 0);
  }

  function updateCount(count) {
    countEls.forEach(function (el) { el.textContent = String(count); });
  }

  function renderCart(options) {
    var count = totalCount();
    var subtotal = count * PRICE_CENTS;
    var remaining = Math.max(0, FREE_SHIPPING_CENTS - subtotal);

    if (!(options && options.deferCount)) updateCount(count);

    lines.forEach(function (line) {
      var size = line.getAttribute('data-size');
      var qty = cart[size];
      line.hidden = qty === 0;
      if (!qty) return;
      $('[data-line-input]', line).value = qty;
      $('[data-line-total]', line).textContent = formatCents(qty * PRICE_CENTS);
      $('[data-line-step="-1"]', line).setAttribute('aria-disabled', String(qty <= 1));
      $('[data-line-step="1"]', line).setAttribute('aria-disabled', String(qty >= MAX_QTY));
    });

    if (emptyEl) emptyEl.hidden = count > 0;
    if (footEl) footEl.hidden = count === 0;
    if (subtotalEl) subtotalEl.textContent = formatCents(subtotal);
    if (remainingEl) remainingEl.textContent = formatCents(remaining);
    if (shipTodo) shipTodo.hidden = remaining === 0;
    if (shipDone) shipDone.hidden = remaining > 0;
    if (gaugeEl) gaugeEl.style.transform = 'scaleX(' + Math.min(1, subtotal / FREE_SHIPPING_CENTS) + ')';
  }

  function setLineQty(size, qty) {
    cart[size] = Math.min(MAX_QTY, Math.max(0, qty));
    saveCart();
    renderCart();
  }

  /* Ouverture / fermeture du panneau */
  var lastFocus = null;
  function onCartKeydown(event) {
    if (event.key === 'Escape') {
      closeCart(true);
      return;
    }
    trapFocus(event, cartPanel);
  }
  function openCart(trigger) {
    if (!cartEl || state.cartOpen) return;
    if (state.menuOpen) closeMenu(false);
    state.cartOpen = true;
    lastFocus = trigger || document.activeElement;
    cartEl.classList.add('is-open');
    if (cartOpenBtn) cartOpenBtn.setAttribute('aria-expanded', 'true');
    setInert([announce, header, main, footer, buybar], true);
    lockScroll(true);
    document.addEventListener('keydown', onCartKeydown);
    window.requestAnimationFrame(function () { cartPanel.focus(); });
    updateBuybar();
  }
  function closeCart(restoreFocus) {
    if (!state.cartOpen) return;
    state.cartOpen = false;
    cartEl.classList.remove('is-open');
    if (cartOpenBtn) cartOpenBtn.setAttribute('aria-expanded', 'false');
    setInert([announce, header, main, footer], false);
    lockScroll(false);
    document.removeEventListener('keydown', onCartKeydown);
    if (restoreFocus && lastFocus && document.contains(lastFocus)) lastFocus.focus();
    updateBuybar();
  }

  if (cartEl) {
    if (cartOpenBtn) cartOpenBtn.addEventListener('click', function () { openCart(cartOpenBtn); });

    // Fermeture : bouton, clic sur le fond, lien « Choisir ma taille » du panier vide
    $$('[data-cart-close]', cartEl).forEach(function (el) {
      el.addEventListener('click', function () {
        closeCart(!el.hasAttribute('data-no-restore'));
      });
    });

    // Lignes du panier : quantité modifiable, suppression
    lines.forEach(function (line) {
      var size = line.getAttribute('data-size');
      $$('[data-line-step]', line).forEach(function (button) {
        button.addEventListener('click', function () {
          if (button.getAttribute('aria-disabled') === 'true') return;
          setLineQty(size, cart[size] + Number(button.getAttribute('data-line-step')));
        });
      });
      var input = $('[data-line-input]', line);
      input.addEventListener('change', function () { setLineQty(size, clampQty(input.value)); });
      $('[data-line-remove]', line).addEventListener('click', function () {
        setLineQty(size, 0);
        cartPanel.focus(); // la ligne disparaît : le focus reste dans le panneau
      });
    });

    // Lien « Commander » vide pour l'instant
    var checkout = $('#checkout');
    if (checkout) {
      checkout.addEventListener('click', function (event) {
        if (checkout.getAttribute('href') === '#') event.preventDefault();
      });
    }

    // Panier synchronisé entre plusieurs onglets
    window.addEventListener('storage', function (event) {
      if (event.key === STORAGE_KEY) {
        cart = loadCart();
        renderCart();
      }
    });
  }

  renderCart();


  /* ========================================================================
     8. AJOUT AU PANIER
     « Ajouté » + coche pendant 1,5 s, rebond du compteur, ouverture du panneau
     ======================================================================== */
  var buyForm = $('#buy-form');
  var addBtn = $('#add-to-cart');
  var addedTimer = null;

  function bumpCounter() {
    countEls.forEach(function (el) {
      var badge = el.closest('.cart-btn__count');
      if (!badge) return;
      badge.classList.remove('is-bumping');
      void badge.offsetWidth; // relance l'animation
      badge.classList.add('is-bumping');
    });
  }
  $$('.cart-btn__count').forEach(function (badge) {
    badge.addEventListener('animationend', function () { badge.classList.remove('is-bumping'); });
  });

  /* Un picot vole du bouton jusqu'au compteur du panier, en cloche.
     Élément purement décoratif, sans texte, retiré à l'arrivée. */
  function flyToCart(from, onArrive) {
    var badge = $('.cart-btn__count');
    if (!motionOn() || !badge || !from.animate) {
      onArrive();
      return;
    }
    var a = from.getBoundingClientRect();
    var b = badge.getBoundingClientRect();
    var x0 = a.left + a.width / 2;
    var y0 = a.top + a.height / 2;
    var x1 = b.left + b.width / 2;
    var y1 = b.top + b.height / 2;
    var peak = Math.min(y0, y1) - Math.min(160, Math.abs(y0 - y1) * 0.35 + 60);
    var flyer = document.createElement('span');
    var dot = document.createElement('span');
    flyer.className = 'fly-picot';
    dot.className = 'fly-picot__dot';
    flyer.setAttribute('aria-hidden', 'true');
    flyer.appendChild(dot);
    document.body.appendChild(flyer);
    // L'axe horizontal avance régulièrement, l'axe vertical monte puis retombe
    flyer.animate(
      [{ transform: 'translateX(' + x0 + 'px)' }, { transform: 'translateX(' + x1 + 'px)' }],
      { duration: 700, easing: 'cubic-bezier(.4, 0, .6, 1)', fill: 'forwards' }
    );
    var fall = dot.animate([
      { transform: 'translateY(' + y0 + 'px) scale(.5)', easing: 'cubic-bezier(.2, .7, .4, 1)' },
      { transform: 'translateY(' + peak + 'px) scale(1.25)', offset: 0.4, easing: 'cubic-bezier(.6, 0, .8, .4)' },
      { transform: 'translateY(' + y1 + 'px) scale(.7)' }
    ], { duration: 700, fill: 'forwards' });
    fall.onfinish = function () {
      flyer.remove();
      onArrive();
    };
  }

  if (buyForm && addBtn) {
    buyForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var size = selectedSize();
      if (!size) {
        sizeError.hidden = false;
        sizesField.classList.add('has-error');
        sizeInputs[0].focus();
        return;
      }
      var qty = clampQty(qtyInput ? qtyInput.value : 1);
      cart[size] = Math.min(MAX_QTY, cart[size] + qty);
      saveCart();
      // Avec le mouvement, le compteur change à l'arrivée du picot volant
      renderCart({ deferCount: motionOn() });

      addBtn.classList.add('is-added');
      window.clearTimeout(addedTimer);
      addedTimer = window.setTimeout(function () { addBtn.classList.remove('is-added'); }, 1500);
      flyToCart(addBtn, function () {
        updateCount(totalCount());
        bumpCounter();
      });

      window.setTimeout(function () { openCart(addBtn); }, reducedMotion.matches ? 0 : CART_OPEN_DELAY);
    });
  }


  /* ========================================================================
     9. BARRE D'ACHAT MOBILE
     Visible quand le bouton du hero est passé et hors de la section achat
     ======================================================================== */
  var heroCta = $('#hero-cta');
  var buySection = $('#acheter');
  var heroCtaPassed = false;
  var inBuySection = false;

  function updateBuybar() {
    if (!buybar) return;
    var show = heroCtaPassed && !inBuySection && !state.menuOpen && !state.cartOpen;
    buybar.classList.toggle('is-visible', show);
    buybar.inert = !show;
  }
  if (buybar && heroCta && buySection && 'IntersectionObserver' in window) {
    var buybarObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.target === heroCta) {
          // « Passé » = sorti par le haut de l'écran (pas encore atteint ne compte pas)
          heroCtaPassed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        } else {
          inBuySection = entry.isIntersecting;
        }
      });
      updateBuybar();
    });
    buybarObserver.observe(heroCta);
    buybarObserver.observe(buySection);
  }


  /* ========================================================================
     10. NEWSLETTER (aucun envoi réel pour l'instant)
     ======================================================================== */
  var newsletter = $('#newsletter-form');
  if (newsletter) {
    var email = $('#nl-email');
    var okMsg = $('.newsletter__ok', newsletter);
    var errorMsg = $('#nl-error');
    newsletter.addEventListener('submit', function (event) {
      event.preventDefault();
      var valid = email.value.trim() !== '' && email.checkValidity();
      errorMsg.hidden = valid;
      okMsg.hidden = !valid;
      if (!valid) {
        email.setAttribute('aria-invalid', 'true');
        email.setAttribute('aria-describedby', 'nl-help nl-error');
        email.focus();
        return;
      }
      email.removeAttribute('aria-invalid');
      email.setAttribute('aria-describedby', 'nl-help');
      // À VALIDER : brancher ici l'outil d'e-mailing (Brevo, Mailchimp…)
      newsletter.reset();
    });
  }

  /* ========================================================================
     11. MOUVEMENT AU DÉFILEMENT ET 3D
     Le défilement reste natif (jamais détourné) : à chaque image, on lit sa
     position et sa vitesse, puis on écrit des variables CSS que les transform
     utilisent (style.css, section 21). Rien ne bouge tout seul : tout suit le
     défilement ou le pointeur. Coupé net avec prefers-reduced-motion.
     ======================================================================== */
  function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  // Courbe « ça glisse… puis ça accroche » : dépasse sa cible de 2 % environ, puis revient
  function grip(t) { var u = t - 1; return 1 + 1.8 * u * u * u + 0.8 * u * u; }
  // Même idée, étalée sur toute la course (pièces de la chaussette en kit) :
  // la pièce glisse régulièrement, dépasse sa place de 4 % puis accroche
  function slideGrip(t) { return t < 0.8 ? 1.04 * smoothstep(t / 0.8) : 1.04 - 0.04 * smoothstep((t - 0.8) / 0.2); }
  // Position dans la page sans tenir compte des transform déjà appliqués
  function docTop(el) {
    var y = 0;
    while (el) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  }
  // N'écrit la variable que si sa valeur a changé (moins de recalculs de style)
  function setVar(target, name, value) {
    var v = Math.round(value * 1000) / 1000;
    if (target.cache[name] !== v) {
      target.cache[name] = v;
      target.el.style.setProperty(name, String(v));
    }
  }

  function measureMotion() {
    motion.vh = window.innerHeight;
    measureFloors(); // d'abord : la longueur de sa piste décale tout ce qui suit
    motion.maxScroll = Math.max(0, root.scrollHeight - motion.vh);
    motion.items.forEach(function (item) {
      item.top = docTop(item.ref);
      item.h = item.ref.offsetHeight;
    });
    if (motion.hero) motion.hero.h = motion.hero.el.offsetHeight;
    measureKit();
  }

  /* Bandeau des sols : sa piste est aussi longue que le trajet horizontal
     des mots. Pendant qu'on la parcourt, le bandeau reste figé au milieu de
     l'écran et les rangées glissent en sens contraire jusqu'au dernier mot. */
  function measureFloors() {
    var f = motion.floors;
    if (!f) return;
    var width = f.band.clientWidth;
    f.travel = f.rows.map(function (row) { return Math.max(0, row.offsetWidth - width); });
    var run = Math.round(Math.max.apply(null, f.travel) * 0.9);
    if (f.run !== run) {
      f.run = run;
      f.el.style.setProperty('--floors-run', run + 'px');
    }
    f.top = docTop(f.el);
    f.h = f.el.offsetHeight;
    f.stickTop = parseFloat(window.getComputedStyle(f.band).top) || 0;
  }

  function floorsFrame(y, vh) {
    var f = motion.floors;
    var top = f.top - y;
    if (top > vh * 1.3 || top + f.h < -vh * 0.3) return; // hors champ
    // 0 quand le bandeau se fige, 1 quand le dernier mot est arrivé
    var p = f.run ? clamp((y + f.stickTop - f.top) / f.run, 0, 1) : 0;
    setVar(f, '--x1', -p * f.travel[0]);         // fin de la 1re rangée : elle part vers la gauche
    setVar(f, '--x2', -(1 - p) * f.travel[1]);   // 2e rangée : elle part de sa fin, vers la droite
  }

  /* La chaussette en kit : chaque pièce suit la position de son texte.
     Desktop : le texte défile à côté de la scène collante.
     Mobile : la scène reste en haut, le texte passe dessous. */
  function measureKit() {
    var kit = motion.kit;
    if (!kit) return;
    kit.top = docTop(kit.el);
    kit.h = kit.el.offsetHeight;
    kit.steps.forEach(function (step) { step.top = docTop(step.el); });
    kit.stacked = !desktop.matches;
    kit.stageBottom = (parseFloat(window.getComputedStyle(kit.stage.el).top) || 0) + kit.stage.el.offsetHeight;
  }

  function kitFrame(y, vh) {
    var kit = motion.kit;
    var top = kit.top - y;
    if (top > vh * 1.3 || top + kit.h < -vh * 0.3) return; // hors champ
    // Le haut du texte d'une étape passe de « start » à « end » : sa pièce va de 0 (éclatée) à 1 (en place)
    // (sur mobile, le départ est au-dessus de la barre d'achat, qui masque le bas de l'écran)
    var start = kit.stacked ? vh * 0.88 : vh * 0.85;
    var end = kit.stacked ? kit.stageBottom + (vh - kit.stageBottom) * 0.15 : vh * 0.4;
    var span = Math.max(1, start - end);
    kit.steps.forEach(function (step, i) {
      var t = clamp((start - (step.top - y)) / span, 0, 1);
      var n = i + 1;
      setVar(step, '--t', t);
      setVar(kit.stage, '--k' + n, slideGrip(t));
      setVar(kit.stage, '--k' + n + 's', smoothstep(t));
      var locked = t >= 1;
      if (step.locked !== locked) { // la pièce accroche (ou se décroche si l'on remonte)
        step.locked = locked;
        step.el.classList.toggle('is-locked', locked);
        kit.stage.el.classList.toggle('is-l' + n, locked);
      }
    });
    // Progression globale : la caméra tourne pendant tout le montage
    var first = kit.steps[0].top;
    var last = kit.steps[kit.steps.length - 1].top;
    setVar(kit.stage, '--kp', clamp((start - (first - y)) / Math.max(1, last - first + span), 0, 1));
  }

  // Retour à la chaussette montée (mouvement coupé en cours de visite)
  function resetKit() {
    var kit = motion.kit;
    if (!kit) return;
    [kit.stage].concat(kit.steps).forEach(function (item) {
      Object.keys(item.cache).forEach(function (name) { item.el.style.removeProperty(name); });
      item.cache = {};
    });
    kit.steps.forEach(function (step, i) {
      step.locked = false;
      step.el.classList.remove('is-locked');
      kit.stage.el.classList.remove('is-l' + (i + 1));
    });
  }

  function requestMotionFrame() {
    if (motion.on && !motion.raf) motion.raf = window.requestAnimationFrame(motionFrame);
  }

  function motionFrame(now) {
    motion.raf = 0;
    var y = window.scrollY;
    var vh = motion.vh;
    var spring = motion.spring;
    var delta = y - motion.lastY;
    motion.lastY = y;

    // Ressort amorti : la vitesse fait glisser, l'arrêt fait accrocher avec un petit rebond
    spring.v = (spring.v + (clamp(delta * 0.8, -30, 30) - spring.x) * 0.09) * 0.76;
    spring.x += spring.v;
    var settled = now - motion.lastScrollAt > 150 && Math.abs(spring.x) < 0.05 && Math.abs(spring.v) < 0.05;
    if (settled) {
      spring.x = 0;
      spring.v = 0;
    }

    motion.items.forEach(function (item) {
      var top = item.top - y;
      if (top > vh * 1.3 || top + item.h < -vh * 0.3) return; // hors champ : rien à écrire
      // Entrée : 0 quand l'élément arrive en bas de l'écran, 1 quand il est installé
      // (toujours atteignable, même pour les éléments tout en bas de la page)
      var end = Math.max(vh * (1 - item.span), item.top - motion.maxScroll + 2);
      var enter = clamp((vh - top) / Math.max(1, vh - end), 0, 1);
      if (item.glide) setVar(item, '--g', grip(enter));
      if (item.rise) setVar(item, '--s', smoothstep(enter));
      if (item.parallax) setVar(item, '--c', clamp((top + item.h / 2 - vh / 2) / (vh / 2 + item.h / 2), -1, 1));
      if (item.stagger) {
        var count = item.children.length;
        var step = 0.7 / Math.max(1, count - 1);
        item.children.forEach(function (child, i) {
          var rank = item.reverse ? count - 1 - i : i; // à l'envers : les lettres s'écartent au lieu de se chevaucher
          setVar(child, '--wg', grip(clamp(enter * 1.7 - rank * step, 0, 1)));
        });
      }
      if (item.drift) setVar(item, '--dx', spring.x);
    });

    if (motion.kit) kitFrame(y, vh);
    if (motion.floors) floorsFrame(y, vh);

    // Hero : progression de sortie (l'accroche glisse, la photo se décolle)
    var heroProgress = 0;
    if (motion.hero) {
      heroProgress = clamp(y / Math.max(1, motion.hero.h), 0, 1);
      setVar(motion.hero, '--x', heroProgress);
    }

    // Cartes 3D : on rejoint doucement l'inclinaison visée par le pointeur
    var tiltsSettled = true;
    motion.tilts.forEach(function (tilt) {
      tilt.rx += (tilt.tx - tilt.rx) * 0.1;
      tilt.ry += (tilt.ty - tilt.ry) * 0.1;
      if (Math.abs(tilt.tx - tilt.rx) > 0.02 || Math.abs(tilt.ty - tilt.ry) > 0.02) tiltsSettled = false;
      var lift = tilt.isHero ? heroProgress : 0;
      setVar(tilt, '--rx', tilt.rx + lift * 12);
      setVar(tilt, '--ry', tilt.ry);
      setVar(tilt, '--lift', lift * 36);
    });

    // La boucle s'arrête d'elle-même quand tout est immobile
    if (!settled || !tiltsSettled) requestMotionFrame();
  }

  function setupMotion() {
    motion.ready = true;
    motion.items = $$('[data-motion], [data-drift]').filter(function (el) {
      return el.getAttribute('data-motion') !== 'hero';
    }).map(function (el) {
      var types = (el.getAttribute('data-motion') || '').split(' ');
      var is = function (type) { return types.indexOf(type) !== -1; };
      var refSelector = el.getAttribute('data-motion-ref'); // évite de mesurer un élément sticky
      return {
        el: el,
        cache: {},
        ref: (refSelector && el.closest(refSelector)) || el,
        top: 0,
        h: 0,
        span: is('stagger') ? 0.9 : is('rise') ? 0.55 : 0.6,
        glide: is('glide'),
        rise: is('rise') || is('scene'),
        parallax: is('parallax'),
        stagger: is('stagger'),
        reverse: el.getAttribute('data-stagger') === 'reverse',
        drift: el.hasAttribute('data-drift'),
        children: is('stagger') ? $$('.final__line, .l', el).map(function (child) { return { el: child, cache: {} }; }) : []
      };
    });

    var heroEl = $('[data-motion="hero"]');
    if (heroEl) motion.hero = { el: heroEl, cache: {}, h: 0 };

    var floorsEl = $('.floors');
    if (floorsEl) {
      motion.floors = {
        el: floorsEl, cache: {}, top: 0, h: 0, run: -1, stickTop: 0, travel: [0, 0],
        band: $('.floors__band', floorsEl),
        rows: $$('.floors__row', floorsEl)
      };
    }

    var kitEl = $('.kit');
    var kitStage = kitEl && $('.kit__stage', kitEl);
    if (kitStage) {
      motion.kit = {
        el: kitEl, top: 0, h: 0, stacked: false, stageBottom: 0,
        stage: { el: kitStage, cache: {} },
        steps: $$('[data-kit-step]', kitEl).map(function (el) {
          return { el: el, cache: {}, top: 0, locked: false };
        })
      };
    }

    // Inclinaison au pointeur (souris uniquement : rien au doigt)
    motion.tilts = $$('[data-tilt]').map(function (el) {
      var tilt = { el: el, cache: {}, rx: 0, ry: 0, tx: 0, ty: 0, isHero: el.getAttribute('data-tilt') === 'hero' };
      var area = el.parentElement;
      if (finePointer.matches) {
        area.addEventListener('pointermove', function (event) {
          var r = area.getBoundingClientRect();
          tilt.ty = clamp((event.clientX - r.left) / r.width - 0.5, -0.5, 0.5) * 18;
          tilt.tx = clamp(0.5 - (event.clientY - r.top) / r.height, -0.5, 0.5) * 14;
          requestMotionFrame();
        });
        area.addEventListener('pointerleave', function () {
          tilt.tx = 0;
          tilt.ty = 0;
          requestMotionFrame();
        });
      }
      return tilt;
    });

    window.addEventListener('scroll', function () {
      motion.lastScrollAt = window.performance.now();
      requestMotionFrame();
    }, { passive: true });

    // Les positions changent avec la mise en page : polices, redimensionnement, FAQ ouverte…
    var remeasure = function () {
      if (!motion.on) return;
      measureMotion();
      requestMotionFrame();
    };
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(remeasure, 120);
    });
    window.addEventListener('load', remeasure);
    if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  }

  function startMotion() {
    if (motion.on || reducedMotion.matches) return;
    motion.on = true;
    root.classList.add('has-motion');
    if (!motion.ready) setupMotion();
    measureMotion();
    motion.lastY = window.scrollY;
    requestMotionFrame();
  }

  function stopMotion() {
    motion.on = false;
    root.classList.remove('has-motion');
    resetKit();
    if (motion.raf) {
      window.cancelAnimationFrame(motion.raf);
      motion.raf = 0;
    }
  }

  startMotion();
  reducedMotion.addEventListener('change', function (event) {
    if (event.matches) stopMotion(); else startMotion();
  });
})();
