const REPO = 'GhostESP-Revival/GhostESP';
const PAGE_URL = 'https://ghostesp.net/isprereleasethelatest';
const IMAGE_URL = 'https://ghostesp.net/images/IMG_1178.webp';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseVersion(tag) {
  const match = String(tag || '').trim().match(/^[vV]?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : []
  };
}

function compareVersions(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let i = 0; i < length; i += 1) {
    if (left.prerelease[i] === undefined) return -1;
    if (right.prerelease[i] === undefined) return 1;

    const leftNumeric = /^\d+$/.test(left.prerelease[i]);
    const rightNumeric = /^\d+$/.test(right.prerelease[i]);
    if (leftNumeric && rightNumeric) {
      const difference = Number(left.prerelease[i]) - Number(right.prerelease[i]);
      if (difference !== 0) return difference > 0 ? 1 : -1;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else if (left.prerelease[i] !== right.prerelease[i]) {
      return left.prerelease[i] > right.prerelease[i] ? 1 : -1;
    }
  }

  return 0;
}

function releaseDate(release) {
  return Date.parse(release.published_at || release.created_at || '') || 0;
}

function newestRelease(releases) {
  return releases
    .map((release) => ({ release, version: parseVersion(release.tag_name) }))
    .filter((item) => item.version)
    .sort((left, right) => {
      const versionOrder = compareVersions(right.version, left.version);
      return versionOrder || releaseDate(right.release) - releaseDate(left.release);
    })[0] || null;
}

async function getComparison() {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'GhostESP-website'
    }
  });

  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  const releases = await response.json();
  const published = releases.filter((release) => !release.draft && release.tag_name);
  const stable = newestRelease(published.filter((release) => !release.prerelease));
  const prerelease = newestRelease(published.filter((release) => release.prerelease));

  if (!stable || !prerelease) {
    throw new Error('GitHub did not return both a stable and prerelease version');
  }

  const order = compareVersions(prerelease.version, stable.version);
  const winner = order > 0 ? 'prerelease' : order < 0 ? 'stable' : 'tie';
  const stableTag = stable.release.tag_name;
  const prereleaseTag = prerelease.release.tag_name;
  const answer = winner === 'prerelease'
    ? `YES — prerelease ${prereleaseTag} is newer`
    : winner === 'stable'
      ? `NO — stable ${stableTag} is newer`
      : `TIED — both are ${stableTag}`;

  return {
    ok: true,
    winner,
    answer,
    stable: { tag: stableTag, url: stable.release.html_url, publishedAt: stable.release.published_at },
    prerelease: { tag: prereleaseTag, url: prerelease.release.html_url, publishedAt: prerelease.release.published_at },
    checkedAt: new Date().toISOString()
  };
}

function fallbackComparison(error) {
  return {
    ok: false,
    answer: 'Unable to check GitHub releases right now',
    error: error && error.message ? error.message : 'Unknown error'
  };
}

function renderPage(data) {
  const title = data.ok ? `${data.answer} | GhostESP` : 'GhostESP Stable vs Prerelease Version Check';
  const description = data.ok
    ? `${data.answer}. Compare the latest GhostESP stable and prerelease versions.`
    : 'Check whether the latest GhostESP prerelease is newer than the latest stable release.';
  const statusClass = data.ok ? `is-${data.winner}` : 'is-error';
  const stable = data.stable || { tag: 'Unavailable', url: '#' };
  const prerelease = data.prerelease || { tag: 'Unavailable', url: '#' };
  const checked = data.checkedAt
    ? new Date(data.checkedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
    : 'Not available';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#000000">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${PAGE_URL}">
  <meta property="og:site_name" content="GhostESP">
  <meta property="og:image" content="${IMAGE_URL}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${IMAGE_URL}">
  <link rel="canonical" href="${PAGE_URL}">
  <link rel="icon" type="image/x-icon" href="/images/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/main.css">
  <link rel="stylesheet" href="/css/version-check.css">
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to content</a>
  <canvas id="dotTerrain"></canvas>
  <script src="/js/dot-terrain.js"></script>
  <nav id="nav"><noscript><a href="/">Home</a> <a href="/flasher">Flasher</a> <a href="/changelog">Changelog</a></noscript></nav>
  <main id="main-content" class="version-check-page" data-status="${escapeHtml(statusClass)}">
    <div class="container">
      <p class="version-check-kicker">GhostESP / release telemetry</p>
      <h1>Is prerelease the latest?</h1>
      <p class="version-check-lead">A quick answer for the people who want the newest build without guessing which channel is ahead.</p>
      <section class="version-check-card" aria-labelledby="version-check-answer">
        <div class="version-check-card-top">
          <span class="version-check-live"><span></span> Live GitHub check</span>
          <span class="version-check-repo">${REPO}</span>
        </div>
        <p id="version-check-answer" class="version-check-answer">${escapeHtml(data.answer)}</p>
        <p id="version-check-summary" class="version-check-summary">${escapeHtml(description)}</p>
        <div class="version-check-versions">
          <a class="version-check-version" href="${escapeHtml(stable.url)}" target="_blank" rel="noopener"><span class="version-check-version-label">Stable</span><strong id="version-check-stable">${escapeHtml(stable.tag)}</strong></a>
          <div class="version-check-versus" aria-hidden="true">vs</div>
          <a class="version-check-version" href="${escapeHtml(prerelease.url)}" target="_blank" rel="noopener"><span class="version-check-version-label">Prerelease</span><strong id="version-check-prerelease">${escapeHtml(prerelease.tag)}</strong></a>
        </div>
        <p class="version-check-updated">Compared by semantic version · Checked <time id="version-check-time">${escapeHtml(checked)}</time></p>
        <p id="version-check-error" class="version-check-error" role="status" hidden></p>
      </section>
      <div class="version-check-actions"><a class="btn btn-secondary" href="/flasher">Open the flasher</a><a class="btn btn-secondary" href="https://github.com/${REPO}/releases" target="_blank" rel="noopener">View all releases</a></div>
      <p class="version-check-share-note">Share this URL when someone asks which GhostESP channel is ahead.</p>
    </div>
  </main>
  <footer class="footer"><div class="container"><div class="footer-links"><a href="https://discord.gg/5cyNmUMgwh" target="_blank" rel="noopener" class="icon-link">Discord</a><a href="https://github.com/${REPO}" target="_blank" rel="noopener" class="icon-link">GitHub</a><a href="/privacy" class="cookie-settings-link">Privacy Policy</a></div></div></footer>
  <script src="/js/components.js" defer></script>
  <script src="/js/version-check.js" defer></script>
  <script src="/js/main.js" defer></script>
</body>
</html>`;
}

exports.handler = async (event) => {
  let data;
  try {
    data = await getComparison();
  } catch (error) {
    console.error('Version check error:', error);
    data = fallbackComparison(error);
  }

  const wantsJson = event.queryStringParameters && event.queryStringParameters.format === 'json';
  if (wantsJson || (event.headers && (event.headers.accept || '').includes('application/json'))) {
    return {
      statusCode: data.ok ? 200 : 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': data.ok ? 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' : 'no-store'
      },
      body: JSON.stringify(data)
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': data.ok ? 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' : 'no-store'
    },
    body: renderPage(data)
  };
};
