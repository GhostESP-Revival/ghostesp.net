// github api utilities
const github = {
  async fetchLatestRelease(owner, repo) {
    const query = `?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`;
    let response = await fetch(`/.netlify/functions/github-release${query}`, {
      headers: { Accept: 'application/json' }
    });

    // Keep local static-server development working when Netlify Functions are unavailable.
    if (response.status === 404) {
      response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
    }

    if (!response.ok) throw new Error(`GitHub release request failed (${response.status})`);
    return await response.json();
  },

  async renderRelease(containerId, owner, repo) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = components.loading();

    try {
      const release = await this.fetchLatestRelease(owner, repo);
      container.innerHTML = components.releaseCard(release, containerId);
      if (window.lucide) {
        window.lucide.createIcons();
      }
    } catch (error) {
      container.innerHTML = `
        <div class="card" style="text-align: center; color: var(--text-dim);">
          <p>Release details are temporarily unavailable.</p>
          <a href="https://github.com/${owner}/${repo}/releases" target="_blank" rel="noopener">View releases on GitHub</a>
        </div>
      `;
    }
  }
};
