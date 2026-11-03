/* ==========================================================================
   Mistigrip — main.js
   JavaScript natif, sans dépendance. Aucun texte n'est injecté :
   tout le contenu est dans le HTML, le script ne fait qu'afficher, masquer
   et mettre à jour des chiffres (quantités, prix).
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
  var CART_OPEN_DELAY = 600;       // laisse voir « Ajouté » et le rebond du compteur

  /* ------------------------------------------------------------------------
     Outils
     ------------------------------------------------------------------------ */
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var desktop = window.matchMedia('(min-width: 64em)');
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
  thumbs.forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      var target = thumb.getAttribute('aria-controls');
      slides.forEach(function (slide) { slide.hidden = slide.id !== target; });
      thumbs.forEach(function (t) { t.setAttribute('aria-pressed', String(t === thumb)); });
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

  function renderCart() {
    var count = totalCount();
    var subtotal = count * PRICE_CENTS;
    var remaining = Math.max(0, FREE_SHIPPING_CENTS - subtotal);

    countEls.forEach(function (el) { el.textContent = String(count); });

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
      renderCart();

      addBtn.classList.add('is-added');
      window.clearTimeout(addedTimer);
      addedTimer = window.setTimeout(function () { addBtn.classList.remove('is-added'); }, 1500);
      bumpCounter();

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
})();
