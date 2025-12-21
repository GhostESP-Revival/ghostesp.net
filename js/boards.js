document.addEventListener('DOMContentLoaded', () => {
  const filterContainer = document.getElementById('board-tag-filter');
  const cards = Array.from(document.querySelectorAll('.board-card-full'));
  if (!filterContainer || !cards.length) {
    return;
  }

  const tagSet = new Set();
  cards.forEach((card) => {
    const tagNames = Array.from(card.querySelectorAll('.board-tag'))
      .map((span) => span.textContent.trim())
      .filter(Boolean);
    card.dataset.tags = tagNames.join(',');
    tagNames.forEach((tag) => tagSet.add(tag));
  });

  const buttons = [];

  const createButton = (tag) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag-filter-btn';
    button.dataset.tag = tag;
    button.textContent = tag;
    filterContainer.appendChild(button);
    buttons.push(button);
    return button;
  };

  const allButton = createButton('All');
  allButton.classList.add('active');

  const sortedTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  sortedTags.forEach((tag) => {
    createButton(tag);
  });

  filterContainer.addEventListener('click', (event) => {
    const target = event.target.closest('[data-tag]');
    if (!target) {
      return;
    }

    buttons.forEach((button) => {
      button.classList.toggle('active', button === target);
    });

    const selectedTag = target.dataset.tag;
    cards.forEach((card) => {
      const tags = card.dataset.tags
        ? card.dataset.tags.split(',').map((tag) => tag.trim())
        : [];
      card.style.display = selectedTag === 'All' || tags.includes(selectedTag) ? '' : 'none';
    });
  });
});
