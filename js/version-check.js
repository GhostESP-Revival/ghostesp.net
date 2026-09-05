(function () {
  const page = document.querySelector('.version-check-page');
  if (!page) return;

  const answerEl = document.getElementById('version-check-answer');
  const summaryEl = document.getElementById('version-check-summary');
  const stableEl = document.getElementById('version-check-stable');
  const prereleaseEl = document.getElementById('version-check-prerelease');
  const timeEl = document.getElementById('version-check-time');
  const errorEl = document.getElementById('version-check-error');
  const stableLink = stableEl ? stableEl.closest('a') : null;
  const prereleaseLink = prereleaseEl ? prereleaseEl.closest('a') : null;

  function formatCheckedTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not available';
    return `${date.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
  }

  function render(data) {
    if (!data || !data.ok) throw new Error((data && data.error) || 'The release check is unavailable');

    answerEl.textContent = data.answer;
    summaryEl.textContent = `${data.answer}. Compare the latest GhostESP stable and prerelease versions.`;
    stableEl.textContent = data.stable.tag;
    prereleaseEl.textContent = data.prerelease.tag;
    stableLink.href = data.stable.url;
    prereleaseLink.href = data.prerelease.url;
    timeEl.textContent = formatCheckedTime(data.checkedAt);
    page.dataset.status = `is-${data.winner}`;
    document.title = `${data.answer} | GhostESP`;
    errorEl.hidden = true;
  }

  async function refresh() {
    try {
      const response = await fetch('/.netlify/functions/version-check?format=json', {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      const data = await response.json();
      render(data);
    } catch (error) {
      errorEl.textContent = 'Could not refresh the live check. Try again in a moment.';
      errorEl.hidden = false;
      console.warn('Version check refresh error:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', refresh);
})();
