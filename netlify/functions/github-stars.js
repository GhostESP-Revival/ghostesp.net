const ALLOWED_OWNER = 'GhostESP-Revival';
const ALLOWED_REPO = 'GhostESP';

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const owner = params.owner || ALLOWED_OWNER;
  const repo = params.repo || ALLOWED_REPO;

  if (owner !== ALLOWED_OWNER || repo !== ALLOWED_REPO) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Invalid repository' })
    };
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'GhostESP-website'
      }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: await response.text()
      };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=3600'
      },
      body: JSON.stringify({ stargazers_count: data.stargazers_count || 0 })
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ message: 'Unable to reach GitHub' })
    };
  }
};
