(function () {
  const REPO = 'GhostESP-Revival/GhostESP';
  const BRANCHES_API = `https://api.github.com/repos/${REPO}/branches?per_page=100`;
  const CACHE_TTL = 5 * 60 * 1000;
  const DEFAULT_BRANCH = 'Development-deki';

  const branchSelect = document.getElementById('changelog-branch');
  const contentEl = document.getElementById('changelog-content');
  const githubLink = document.getElementById('changelog-github-link');

  function cacheKey(branch) {
    return `ghostesp-changelog-${branch}`;
  }

  function cacheBranchesKey() {
    return 'ghostesp-changelog-branches';
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function inlineFormat(text) {
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/@(\w[\w-]*)/g, '<a href="https://github.com/$1" target="_blank" rel="noopener">@$1</a>')
      .replace(/\(#(\d+)\)/g, '(<a href="https://github.com/' + REPO + '/issues/$1" target="_blank" rel="noopener">#$1</a>)');
  }

  function parseChangelog(md) {
    const lines = md.split('\n');
    const versions = [];
    let current = null;
    let currentCategory = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // version header: ## Revival v1.9.10
      const versionMatch = line.match(/^##\s+(.+)/);
      if (versionMatch) {
        if (current) versions.push(current);
        current = {
          title: versionMatch[1].trim(),
          tldr: null,
          categories: []
        };
        currentCategory = null;
        continue;
      }

      if (!current) continue;

      // skip the top-level # title
      if (line.match(/^#\s/)) continue;

      // category header: ### Added, ### Changed, ### Fixed, ### TL;DR, etc.
      const catMatch = line.match(/^###\s+(.+)/);
      if (catMatch) {
        const catName = catMatch[1].trim();
        // TL;DR / TLDR sections store as tldr text, not a category
        if (/^tl;?dr$/i.test(catName)) {
          currentCategory = { name: catName, items: [], isTldr: true };
          current.categories.push(currentCategory);
        } else {
          currentCategory = { name: catName, items: [], isTldr: false };
          current.categories.push(currentCategory);
        }
        continue;
      }

      // list item
      const itemMatch = line.match(/^\s*[-*]\s+(.+)/);
      if (itemMatch && currentCategory) {
        currentCategory.items.push(itemMatch[1].trim());
        continue;
      }

      // continuation of previous list item (indented)
      const contMatch = line.match(/^\s{2,}(.+)/);
      if (contMatch && currentCategory && currentCategory.items.length > 0) {
        currentCategory.items[currentCategory.items.length - 1] += ' ' + contMatch[1].trim();
        continue;
      }

      // TL;DR paragraph text (non-empty, non-header, non-list under a tldr category)
      if (currentCategory && currentCategory.isTldr && line.trim() && !line.match(/^#/)) {
        if (current.tldr) {
          current.tldr += ' ' + line.trim();
        } else {
          current.tldr = line.trim();
        }
      }
    }

    if (current) versions.push(current);
    return versions;
  }

  function renderVersion(version, index) {
    let html = `<div class="changelog-version" data-version="${index}">`;
    html += `<h2>${inlineFormat(escapeHtml(version.title))}</h2>`;

    if (version.tldr) {
      html += `<div class="changelog-tldr">${inlineFormat(escapeHtml(version.tldr))}</div>`;
    }

    for (const cat of version.categories) {
      if (cat.isTldr) continue;
      if (cat.items.length === 0) continue;

      html += `<h3>${escapeHtml(cat.name)}</h3>`;
      html += '<ul>';
      for (const item of cat.items) {
        html += `<li>${inlineFormat(escapeHtml(item))}</li>`;
      }
      html += '</ul>';
    }

    html += '</div>';
    return html;
  }

  async function fetchWithCache(url, cacheKeyValue, ttl) {
    const cached = sessionStorage.getItem(cacheKeyValue);
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < ttl) return data;
      } catch (e) {}
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
    const data = await response.text();

    sessionStorage.setItem(cacheKeyValue, JSON.stringify({
      data,
      timestamp: Date.now()
    }));

    return data;
  }

  async function fetchBranches() {
    const cached = sessionStorage.getItem(cacheBranchesKey());
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) return data;
      } catch (e) {}
    }

    const response = await fetch(BRANCHES_API);
    if (!response.ok) throw new Error('Failed to fetch branches');
    const branches = await response.json();
    const names = branches.map(b => b.name);

    sessionStorage.setItem(cacheBranchesKey(), JSON.stringify({
      data: names,
      timestamp: Date.now()
    }));

    return names;
  }

  async function loadChangelog(branch) {
    contentEl.innerHTML = '<div class="changelog-loading"><span class="spinner"></span> Loading changelog...</div>';

    try {
      const url = `https://raw.githubusercontent.com/${REPO}/${branch}/CHANGELOG.md`;
      const md = await fetchWithCache(url, cacheKey(branch), CACHE_TTL);
      const versions = parseChangelog(md);

      if (versions.length === 0) {
        contentEl.innerHTML = '<div class="changelog-empty">No changelog entries found for this branch.</div>';
        return;
      }

      contentEl.innerHTML = versions.map((v, i) => renderVersion(v, i)).join('');
    } catch (err) {
      contentEl.innerHTML = `<div class="changelog-empty">Failed to load changelog. <br><small>${escapeHtml(err.message)}</small></div>`;
      console.error('Changelog fetch error:', err);
    }
  }

  function updateGithubLink(branch) {
    githubLink.href = `https://github.com/${REPO}/blob/${branch}/CHANGELOG.md`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    let branches = [];

    try {
      branches = await fetchBranches();
    } catch (err) {
      console.error('Branch fetch error:', err);
      branches = [DEFAULT_BRANCH];
    }

    // populate branch select
    branchSelect.innerHTML = '';
    for (const branch of branches) {
      const opt = document.createElement('option');
      opt.value = branch;
      opt.textContent = branch;
      if (branch === DEFAULT_BRANCH) opt.selected = true;
      branchSelect.appendChild(opt);
    }

    // if DEFAULT_BRANCH not in list, select first
    if (!branches.includes(DEFAULT_BRANCH) && branches.length > 0) {
      branchSelect.value = branches[0];
    }

    const selected = branchSelect.value;
    updateGithubLink(selected);
    loadChangelog(selected);

    branchSelect.addEventListener('change', () => {
      const branch = branchSelect.value;
      updateGithubLink(branch);
      loadChangelog(branch);
    });
  });
})();
