var SocialProof = (function() {
  var GITHUB_REPO = 'GhostESP-Revival/GhostESP';
  var DISCORD_INVITE = 'https://discord.gg/5cyNmUMgwh';
  var DISCORD_INVITE_CODE = '5cyNmUMgwh';
  var counts = { stars: null, discord: null };
  var fetched = false;

  function formatCount(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  function fetchCounts() {
    if (fetched) return Promise.resolve(counts);
    fetched = true;
    return Promise.all([
      fetch('https://api.github.com/repos/' + GITHUB_REPO).then(function(r) { return r.json(); }).catch(function() { return null; }),
      fetch('https://discord.com/api/invites/' + DISCORD_INVITE_CODE + '?with_counts=true').then(function(r) { return r.json(); }).catch(function() { return null; })
    ]).then(function(results) {
      if (results[0] && results[0].stargazers_count != null) counts.stars = results[0].stargazers_count;
      if (results[1] && results[1].approximate_presence_count != null) counts.discord = results[1].approximate_presence_count;
      return counts;
    });
  }

  function renderNavStars() {
    var container = document.getElementById('nav-star-count');
    if (!container) return;
    if (counts.stars != null) {
      container.innerHTML = '<a href="https://github.com/' + GITHUB_REPO + '" target="_blank" rel="noopener" class="nav-star-btn" title="Star on GitHub">' +
        '<i data-lucide="star" style="width:15px;height:15px;fill:currentColor;stroke:currentColor;"></i>' +
        '<span>' + formatCount(counts.stars) + '</span></a>';
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [container] });
    }
  }

  function renderDiscordWidget() {
    var container = document.getElementById('discord-widget-section');
    if (!container) return;
    var memberText = counts.discord != null ? '<div class="discord-widget-count"><span class="discord-online-dot"></span>' + counts.discord + ' members online</div>' : '';
    container.innerHTML = '<div class="discord-widget-card" data-aos="fade-up">' +
      '<div class="discord-widget-header"><svg viewBox="0 0 24 24" width="24" height="24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>' +
      '<h3>Join the Community</h3></div>' +
      '<p class="discord-widget-desc">Get help, share projects, and stay updated with the latest GhostESP developments.</p>' +
      memberText +
      '<a href="' + DISCORD_INVITE + '" target="_blank" rel="noopener" class="btn btn-primary" style="margin-top:1rem;">Join Discord Server</a>' +
      '</div>';
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [container] });
  }

  function renderFloatingDiscord() {
    if (document.getElementById('floating-discord')) return;
    var el = document.createElement('a');
    el.id = 'floating-discord';
    el.href = DISCORD_INVITE;
    el.target = '_blank';
    el.rel = 'noopener';
    el.className = 'floating-discord-btn';
    el.title = 'Join our Discord';
    el.setAttribute('aria-label', 'Join our Discord server');
    el.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>';
    document.body.appendChild(el);
  }

  function showPostFlashModal() {
    if (document.getElementById('post-flash-modal')) return;
    var modal = document.createElement('div');
    modal.id = 'post-flash-modal';
    modal.className = 'post-flash-overlay';
    modal.innerHTML = '<div class="post-flash-modal">' +
      '<button class="post-flash-close" aria-label="Close">&times;</button>' +
      '<div class="post-flash-icon">&#10003;</div>' +
      '<h3>Flash Complete!</h3>' +
      '<p>Your device is ready. Join the Discord community for help, tips, and to share what you build.</p>' +
      '<a href="' + DISCORD_INVITE + '" target="_blank" rel="noopener" class="btn btn-primary" style="width:100%;margin-bottom:0.75rem;">Join Discord Server</a>' +
      '<button class="btn btn-secondary post-flash-dismiss" style="width:100%;">Maybe Later</button>' +
      '</div>';
    document.body.appendChild(modal);

    modal.querySelector('.post-flash-close').addEventListener('click', function() { modal.remove(); });
    modal.querySelector('.post-flash-dismiss').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    try { sessionStorage.setItem('ghostesp_flash_discord_shown', '1'); } catch(e) {}
  }

  function init() {
    renderFloatingDiscord();
    fetchCounts().then(function() {
      renderNavStars();
      renderDiscordWidget();
    });
  }

  return {
    init: init,
    showPostFlashModal: showPostFlashModal,
    fetchCounts: fetchCounts,
    renderNavStars: renderNavStars,
    renderDiscordWidget: renderDiscordWidget
  };
})();

document.addEventListener('DOMContentLoaded', function() {
  SocialProof.init();
});
