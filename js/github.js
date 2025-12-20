// github api utilities
const github = {
  async fetchLatestRelease(owner, repo) {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
      if (!response.ok) throw new Error('failed to fetch release');
      return await response.json();
    } catch (error) {
      console.error('github fetch error:', error);
      throw error;
    }
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
          <p>Failed to load release data. Please try again later.</p>
        </div>
      `;
    }
  }
};
