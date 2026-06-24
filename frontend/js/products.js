/* ============================================================
   products.js — Browser Store
   Connects to GET /products with cursor-based pagination
   ============================================================ */

(function () {
  'use strict';

  // ── DOM refs ──────────────────────────────────────────────
  const navbar         = document.getElementById('navbar');
  const productsGrid   = document.getElementById('products-grid');
  const skeletonGrid   = document.getElementById('skeleton-grid');
  const emptyState     = document.getElementById('empty-state');
  const errorState     = document.getElementById('error-state');
  const errorMessage   = document.getElementById('error-message');
  const loadMoreWrapper= document.getElementById('load-more-wrapper');
  const loadMoreBtn    = document.getElementById('load-more-btn');
  const loadMoreText   = document.getElementById('load-more-text');
  const loadMoreSpinner= document.getElementById('load-more-spinner');
  const resultCount    = document.getElementById('result-count');
  const snapshotInfo   = document.getElementById('snapshot-info');
  const categoryInput  = document.getElementById('category-input');
  const clearCategory  = document.getElementById('clear-category');
  const limitSelect    = document.getElementById('limit-select');
  const applyFilterBtn = document.getElementById('apply-filter-btn');
  const activeFilters  = document.getElementById('active-filters');
  const clearFilterBtn = document.getElementById('clear-filter-btn');
  const retryBtn       = document.getElementById('retry-btn');
  const backToTop      = document.getElementById('back-to-top');

  // ── State ─────────────────────────────────────────────────
  let state = {
    products:     [],
    snapshotTime: null,
    nextCursor:   null,
    category:     '',
    limit:        20,
    loading:      false,
    totalLoaded:  0,
  };

  // ── Helpers ───────────────────────────────────────────────

  /** Build the /products URL from current state + optional cursor */
  function buildUrl(cursor = null) {
    const params = new URLSearchParams();
    params.set('limit', state.limit);
    if (state.category) params.set('category', state.category);
    if (state.snapshotTime && cursor) params.set('snapshotTime', state.snapshotTime);
    if (cursor) params.set('cursor', cursor);
    return `/products?${params.toString()}`;
  }

  /** Format an ISO date string to a readable local time */
  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  /** Format a value — numbers get locale formatting, booleans get labels */
  function fmtValue(key, val) {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'number') {
      // price / cost / amount → currency-ish
      if (/price|cost|amount|total|fee/i.test(key)) {
        return '₹ ' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      return Number(val).toLocaleString();
    }
    // ISO date strings
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) return fmtDate(val);
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return fmtDate(val);
    return String(val);
  }

  /** Derive a CSS class modifier for certain field values */
  function fieldClass(key, val) {
    if (/price|cost|amount|total|fee/i.test(key)) return 'field-price';
    if (/name|title/i.test(key)) return 'field-highlight';
    return '';
  }

  /**
   * Build a product card from whatever columns the DB returns.
   * Priority fields shown at the top; everything else in the field list.
   */
  function buildCard(product, index) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.animationDelay = `${Math.min(index, 12) * 40}ms`;

    // Identify key fields
    const id       = product.id       ?? product.product_id ?? null;
    const name     = product.name     ?? product.title      ?? product.product_name ?? null;
    const category = product.category ?? product.cat        ?? null;
    const createdAt= product.created_at ?? null;

    // Fields to skip from the detail list (shown elsewhere)
    const skipKeys = new Set(['id', 'product_id', 'name', 'title', 'product_name', 'category', 'cat', 'created_at']);

    // ── Card header (category pill + id) ──
    const header = document.createElement('div');
    header.className = 'card-header';

    if (category) {
      const pill = document.createElement('span');
      pill.className = 'card-category';
      pill.textContent = category;
      pill.title = category;
      header.appendChild(pill);
    }

    if (id !== null) {
      const idEl = document.createElement('span');
      idEl.className = 'card-id';
      idEl.textContent = `#${id}`;
      header.appendChild(idEl);
    }

    card.appendChild(header);

    // ── Card title ──
    if (name) {
      const title = document.createElement('div');
      title.className = 'card-title';
      title.textContent = name;
      card.appendChild(title);
    }

    // ── Remaining fields ──
    const remaining = Object.keys(product).filter(k => !skipKeys.has(k));

    if (remaining.length > 0) {
      const fields = document.createElement('div');
      fields.className = 'card-fields';

      remaining.forEach(key => {
        const row = document.createElement('div');
        row.className = 'card-field';

        const label = document.createElement('span');
        label.className = 'field-label';
        label.textContent = key.replace(/_/g, ' ');

        const value = document.createElement('span');
        value.className = 'field-value ' + fieldClass(key, product[key]);
        value.textContent = fmtValue(key, product[key]);
        value.title = fmtValue(key, product[key]);

        row.appendChild(label);
        row.appendChild(value);
        fields.appendChild(row);
      });

      card.appendChild(fields);
    }

    // ── Footer (created_at) ──
    if (createdAt) {
      const footer = document.createElement('div');
      footer.className = 'card-footer';
      footer.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
        <span>${fmtDate(createdAt)}</span>
      `;
      card.appendChild(footer);
    }

    return card;
  }

  // ── Render helpers ────────────────────────────────────────

  function showSkeleton() {
    skeletonGrid.style.display = 'grid';
    productsGrid.style.display = 'none';
    emptyState.style.display   = 'none';
    errorState.style.display   = 'none';
    loadMoreWrapper.style.display = 'none';
  }

  function hideSkeleton() {
    skeletonGrid.style.display = 'none';
  }

  function showError(msg) {
    hideSkeleton();
    productsGrid.style.display   = 'none';
    emptyState.style.display     = 'none';
    errorState.style.display     = 'flex';
    loadMoreWrapper.style.display= 'none';
    errorMessage.textContent     = msg || 'Could not fetch products. Please try again.';
  }

  function showEmpty() {
    hideSkeleton();
    productsGrid.style.display   = 'none';
    emptyState.style.display     = 'flex';
    errorState.style.display     = 'none';
    loadMoreWrapper.style.display= 'none';
    resultCount.textContent      = '0 products';
  }

  function setLoadMoreLoading(loading) {
    loadMoreBtn.disabled = loading;
    loadMoreText.style.display   = loading ? 'none' : 'inline';
    loadMoreSpinner.style.display= loading ? 'inline' : 'none';
  }

  function updateStatusBar() {
    resultCount.textContent = `${state.totalLoaded} product${state.totalLoaded !== 1 ? 's' : ''} loaded`;
    if (state.snapshotTime) {
      snapshotInfo.textContent = `Snapshot: ${fmtDate(state.snapshotTime)}`;
    }
  }

  function renderActiveFilters() {
    activeFilters.innerHTML = '';
    if (state.category) {
      const pill = document.createElement('div');
      pill.className = 'filter-pill';
      pill.innerHTML = `
        <span>Category: ${state.category}</span>
        <button id="remove-category-pill" aria-label="Remove category filter">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      `;
      pill.querySelector('#remove-category-pill').addEventListener('click', () => {
        categoryInput.value = '';
        clearCategory.style.display = 'none';
        applySearch('');
      });
      activeFilters.appendChild(pill);
    }
  }

  // ── API fetch ─────────────────────────────────────────────

  async function fetchProducts(cursor = null) {
    const url = buildUrl(cursor);
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  // ── Initial load ──────────────────────────────────────────

  async function loadInitial() {
    if (state.loading) return;
    state.loading = true;

    // Reset state
    state.products     = [];
    state.snapshotTime = null;
    state.nextCursor   = null;
    state.totalLoaded  = 0;

    showSkeleton();
    renderActiveFilters();

    try {
      const data = await fetchProducts(null);

      state.snapshotTime = data.snapshotTime;
      state.nextCursor   = data.nextCursor;
      state.products     = data.products || [];
      state.totalLoaded  = state.products.length;

      hideSkeleton();

      if (state.products.length === 0) {
        showEmpty();
      } else {
        productsGrid.innerHTML = '';
        productsGrid.style.display = 'grid';
        emptyState.style.display   = 'none';
        errorState.style.display   = 'none';

        state.products.forEach((p, i) => {
          productsGrid.appendChild(buildCard(p, i));
        });

        updateStatusBar();

        if (state.nextCursor) {
          loadMoreWrapper.style.display = 'flex';
        } else {
          loadMoreWrapper.style.display = 'none';
        }
      }

    } catch (err) {
      console.error('[BrowserStore] Fetch error:', err);
      showError(err.message);
    } finally {
      state.loading = false;
    }
  }

  // ── Load more ─────────────────────────────────────────────

  async function loadMore() {
    if (state.loading || !state.nextCursor) return;
    state.loading = true;
    setLoadMoreLoading(true);

    try {
      const data = await fetchProducts(state.nextCursor);

      state.nextCursor  = data.nextCursor;
      const newProducts = data.products || [];
      state.totalLoaded += newProducts.length;

      const startIndex = state.products.length;
      state.products = state.products.concat(newProducts);

      newProducts.forEach((p, i) => {
        productsGrid.appendChild(buildCard(p, startIndex + i));
      });

      updateStatusBar();

      if (!state.nextCursor) {
        loadMoreWrapper.style.display = 'none';

        // Show "all loaded" message briefly
        const allMsg = document.createElement('p');
        allMsg.style.cssText = 'text-align:center;color:var(--clr-text-faint);font-size:.82rem;padding:20px 0;';
        allMsg.textContent = '✓ All products loaded';
        loadMoreWrapper.parentNode.insertBefore(allMsg, loadMoreWrapper.nextSibling);
        setTimeout(() => allMsg.remove(), 4000);
      }

    } catch (err) {
      console.error('[BrowserStore] Load more error:', err);
      // Show inline error
      const errMsg = document.createElement('p');
      errMsg.style.cssText = 'text-align:center;color:var(--clr-error);font-size:.85rem;padding:12px 0;';
      errMsg.textContent = `⚠ ${err.message} — please try again.`;
      loadMoreWrapper.parentNode.insertBefore(errMsg, loadMoreWrapper.nextSibling);
      setTimeout(() => errMsg.remove(), 5000);
    } finally {
      state.loading = false;
      setLoadMoreLoading(false);
    }
  }

  // ── Filter / search ───────────────────────────────────────

  function applySearch(category) {
    state.category = (category || '').trim();
    state.limit    = parseInt(limitSelect.value) || 20;
    renderActiveFilters();
    loadInitial();
  }

  // ── Event listeners ───────────────────────────────────────

  // Navbar scroll
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  // Category input → show/hide clear button
  categoryInput.addEventListener('input', () => {
    clearCategory.style.display = categoryInput.value ? 'flex' : 'none';
  });

  // Clear category input
  clearCategory.addEventListener('click', () => {
    categoryInput.value = '';
    clearCategory.style.display = 'none';
    categoryInput.focus();
  });

  // Apply filter button
  applyFilterBtn.addEventListener('click', () => {
    applySearch(categoryInput.value);
  });

  // Enter key in category input
  categoryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applySearch(categoryInput.value);
  });

  // Limit change → re-fetch
  limitSelect.addEventListener('change', () => {
    applySearch(categoryInput.value);
  });

  // Clear filters (from empty state)
  clearFilterBtn.addEventListener('click', () => {
    categoryInput.value = '';
    clearCategory.style.display = 'none';
    applySearch('');
  });

  // Retry (from error state)
  retryBtn.addEventListener('click', () => {
    loadInitial();
  });

  // Load more
  loadMoreBtn.addEventListener('click', loadMore);

  // Back to top
  window.addEventListener('scroll', () => {
    const visible = window.scrollY > 400;
    backToTop.style.opacity = visible ? '1' : '0';
    backToTop.style.pointerEvents = visible ? 'auto' : 'none';
  }, { passive: true });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── Bootstrap ─────────────────────────────────────────────
  loadInitial();

})();
