const ALLOWED_OWNER = 'GhostESP-Revival';

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const owner = params.owner;
  const repo = params.repo;

  if (owner !== ALLOWED_OWNER || !/^[A-Za-z0-9_.-]+$/.test(repo || '')) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Invalid repository' })
    };
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'GhostESP-website'
      }
    });

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': response.ok ? 'public, max-age=300, s-maxage=3600' : 'no-store'
      },
      body: await response.text()
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ message: 'Unable to reach GitHub' })
    };
  }
};
