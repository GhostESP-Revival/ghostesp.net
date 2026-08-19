document.addEventListener('DOMContentLoaded', () => {
  const tagFilterContainer = document.getElementById('board-tag-filter');
  const vendorFilterContainer = document.getElementById('board-vendor-filter');
  const grid = document.querySelector('.board-grid');
  const resultsCountEl = document.getElementById('board-results-count');
  const emptyStateEl = document.getElementById('board-empty-state');
  const cards = Array.from(document.querySelectorAll('.board-card-full'));
  if (!tagFilterContainer || !cards.length) {
    return;
  }

  const tagCounts = new Map();
  const vendorCounts = new Map();
  cards.forEach((card) => {
    const tagNames = Array.from(card.querySelectorAll('.board-tag'))
      .map((span) => span.textContent.trim())
      .filter(Boolean);
    card.dataset.tags = tagNames.join(',');
    tagNames.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));

    const vendorEl = card.querySelector('.board-card-partner');
    const vendor = vendorEl ? vendorEl.textContent.trim() : 'Generic';
    card.dataset.vendor = vendor;
    vendorCounts.set(vendor, (vendorCounts.get(vendor) || 0) + 1);
  });

  let activeTag = 'All';
  let activeVendor = null;

  const tagButtons = [];
  const vendorButtons = [];

  const createButton = (container, buttons, tag, count) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag-filter-btn';
    button.dataset.tag = tag;
    button.setAttribute('aria-pressed', 'false');

    const label = document.createElement('span');
    label.className = 'tag-filter-btn-label';
    label.textContent = tag;
    button.appendChild(label);

    if (count != null) {
      const badge = document.createElement('span');
      badge.className = 'tag-filter-btn-count';
      badge.textContent = count;
      button.appendChild(badge);
    }

    container.appendChild(button);
    buttons.push(button);
    return button;
  };

  const setActive = (buttons, target) => {
    buttons.forEach((button) => {
      const active = button === target;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };

  const allTagButton = createButton(tagFilterContainer, tagButtons, 'All', cards.length);
  allTagButton.classList.add('active');
  allTagButton.setAttribute('aria-pressed', 'true');

  const sortedTags = Array.from(tagCounts.keys()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
  sortedTags.forEach((tag) => createButton(tagFilterContainer, tagButtons, tag, tagCounts.get(tag)));

  if (vendorFilterContainer) {
    const allVendorButton = createButton(vendorFilterContainer, vendorButtons, 'All', cards.length);
    allVendorButton.classList.add('active');
    allVendorButton.setAttribute('aria-pressed', 'true');

    const sortedVendors = Array.from(vendorCounts.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
    sortedVendors.forEach((vendor) =>
      createButton(vendorFilterContainer, vendorButtons, vendor, vendorCounts.get(vendor))
    );
  }

  function applyFilters() {
    cards.forEach((card) => {
      const tags = card.dataset.tags ? card.dataset.tags.split(',').map((tag) => tag.trim()) : [];
      const tagOk = activeTag === 'All' || tags.includes(activeTag);
      const vendorOk = activeVendor === null || card.dataset.vendor === activeVendor;
      const visible = tagOk && vendorOk;
      card.style.display = visible ? '' : 'none';
      card.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
    render();
  }

  function render() {
    const anyFilter = activeTag !== 'All' || activeVendor !== null;
    const visibleCount = cards.filter((card) => card.style.display !== 'none').length;
    const isEmpty = anyFilter && visibleCount === 0;

    if (resultsCountEl) {
      if (isEmpty) {
        resultsCountEl.textContent = 'No boards match this filter';
        resultsCountEl.classList.add('is-empty');
      } else if (anyFilter) {
        resultsCountEl.textContent = `Showing ${visibleCount} of ${cards.length} boards`;
        resultsCountEl.classList.remove('is-empty');
      } else {
        resultsCountEl.textContent = `${cards.length} boards`;
        resultsCountEl.classList.remove('is-empty');
      }
    }

    if (emptyStateEl) {
      emptyStateEl.hidden = !isEmpty;
    }
    if (grid) {
      grid.classList.toggle('board-grid-empty', isEmpty);
    }
  }

  tagFilterContainer.addEventListener('click', (event) => {
    const target = event.target.closest('[data-tag]');
    if (!target) {
      return;
    }
    setActive(tagButtons, target);
    activeTag = target.dataset.tag;
    applyFilters();
  });

  vendorFilterContainer?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-tag]');
    if (!target) {
      return;
    }
    setActive(vendorButtons, target);
    activeVendor = target.dataset.tag === 'All' ? null : target.dataset.tag;
    applyFilters();
  });

  render();

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-affiliate]');
    if (!link || window.__gaLoaded !== true || !window.gtag) {
      return;
    }

    const card = link.closest('.board-card-full');
    const boardName = card ? card.querySelector('h3').textContent.trim() : 'Unknown board';
    window.gtag('event', 'affiliate_click', {
      affiliate_partner: link.dataset.affiliate,
      board_name: boardName,
      link_url: link.href
    });
  });
});