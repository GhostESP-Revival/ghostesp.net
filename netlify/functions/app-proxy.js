const ALLOWED_PREFIXES = [
  'https://gesp.fuckyourcdn.com/',
  'https://raw.githubusercontent.com/GhostESP-Revival/'
];

const MAX_CHUNK_BYTES = 512 * 1024;

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

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const url = params.url;

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
