const ALLOWED_PREFIXES = [
  'https://gesp.fuckyourcdn.com/',
  'https://raw.githubusercontent.com/GhostESP-Revival/',
  'https://github.com/GhostESP-Revival/GhostESP/releases/download/'
];

const MAX_CHUNK_BYTES = 512 * 1024;
const MAX_HEAD_URLS = 120;

function json(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: Object.assign(
      { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      extraHeaders || {}
    ),
    body: JSON.stringify(body)
  };
}

// Resolves Last-Modified for a list of allowlisted URLs, concurrently.
async function handleHeads(raw) {
  let urls;
  try {
    urls = JSON.parse(raw);
  } catch (error) {
    return json(400, { message: 'Invalid heads payload' });
  }

  if (!Array.isArray(urls) || !urls.length || urls.length > MAX_HEAD_URLS) {
    return json(400, { message: 'Invalid heads list' });
  }

  const items = await Promise.all(urls.map(async (target) => {
    if (typeof target !== 'string' || !ALLOWED_PREFIXES.some((prefix) => target.startsWith(prefix))) {
      return null;
    }
    try {
      const response = await fetch(target, {
        method: 'HEAD',
        headers: { 'User-Agent': 'GhostESP-website' }
      });
      if (!response.ok) return null;
      return { url: target, lastModified: response.headers.get('last-modified') || '' };
    } catch (error) {
      return null;
    }
  }));

  // Cached on the CDN edge since publish dates only move when a release ships.
  return json(200, { ok: true, items: items.filter(Boolean) }, { 'Cache-Control': 'public, max-age=600' });
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const url = params.url;

  // Batched HEAD lookup used by the store's "Recently updated" sort. The CDN
  // sends an uncacheable Last-Modified per package, and it cannot be read from
  // the browser directly (no Access-Control-Allow-Origin on the CDN), so the
  // publish dates are resolved here and returned in one round trip.
  if (!url && params.heads) {
    return handleHeads(params.heads);
  }

  if (!url || typeof url !== 'string' || !ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return json(400, { message: 'Invalid URL' });
  }

  try {
    if (params.start !== undefined) {
      const start = parseInt(params.start, 10);
      const length = Math.min(parseInt(params.length, 10) || MAX_CHUNK_BYTES, MAX_CHUNK_BYTES);
      if (!Number.isFinite(start) || start < 0 || !Number.isFinite(length) || length <= 0) {
        return json(400, { message: 'Invalid range' });
      }

      const response = await fetch(url, {
        headers: {
          Range: `bytes=${start}-${start + length - 1}`,
          'User-Agent': 'GhostESP-website'
        }
      });

      if (!response.ok) {
        return json(response.status, { message: `Upstream HTTP ${response.status}` });
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          ok: true,
          start,
          chunkLength: buffer.length,
          data: buffer.toString('base64')
        })
      };
    }

    const head = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'GhostESP-website' }
    });

    if (!head.ok) {
      return json(head.status, { message: `Upstream HTTP ${head.status}` });
    }

    const total = parseInt(head.headers.get('content-length') || '0', 10) || 0;
    const acceptRanges = (head.headers.get('accept-ranges') || '').toLowerCase() === 'bytes';

    return json(200, { ok: true, total, acceptRanges }, { 'Cache-Control': 'public, max-age=300' });
  } catch (error) {
    return json(502, { message: 'Unable to reach upstream' });
  }
};
