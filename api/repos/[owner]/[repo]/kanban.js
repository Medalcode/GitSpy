import { parseBitacora } from '../../../_lib/bitacoraParser.js';


// Helper to set CORS headers
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, nav-uagent, Origin, X-Requested-With, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Helper to send normalized error responses and log full stacks
function sendError(res, status, code, message, stage, err) {
  setCorsHeaders(res); // Ensure CORS headers are on errors too
  try {
    if (err) console.error(err && (err.stack || err));
    else console.error('error:', message);
  } catch (logErr) {
    // ensure logging never throws
    console.error('failed to log error', logErr);
  }
  const body = { error: { code: code || 'internal_error', message: String(message || 'Unknown error'), stage: stage || 'internal' } };
  // Always include a body for 500-level responses
  try {
    return res.status(status || 500).json(body);
  } catch (sendErr) {
    // If JSON serialization fails, log and try to send a minimal JSON string
    console.error('failed to send error response', sendErr, 'original error:', err && (err.stack || err));
    try {
      res.status(status || 500).setHeader('content-type', 'application/json').end(JSON.stringify(body));
    } catch (finalErr) {
      console.error('final send failed', finalErr);
      // nothing else we can do
    }
    return undefined;
  }
}



async function fetchBitacoraFromGitHub(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/Bitacora.md`;
  const headers = { "User-Agent": "gitspy-vercel-function" };
  if (process.env.GITHUB_TOKEN)
    headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(url, { headers });
  const status = res.status;
  if (status === 404) return { notFound: true };
  if (status === 403) {
    const text = await res.text();
    return { rateLimited: true, text, status, contentType: res.headers.get('content-type') };
  }
  if (!res.ok) {
    const text = await res.text();
    return { error: text, status, contentType: res.headers.get('content-type') };
  }
  const json = await res.json();
  const encoding = json.encoding || "utf-8";
  let md = "";
  if (json.content) {
    if (encoding === "base64")
      md = Buffer.from(json.content, "base64").toString("utf8");
    else md = String(json.content);
  }
  return { md, sha: json.sha };
}

export default async function handler(req, res) {
  try {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (!process.env.GITHUB_TOKEN) console.warn('GITHUB_TOKEN not set in environment — requests will be unauthenticated and may be rate-limited');
    
    // Validate inputs
    const owner = req.query.owner || (req.query[0] || "").split("/")[0];
    const repo = req.query.repo || (req.query[0] || "").split("/")[1];
    if (!owner || !repo)
      return sendError(res, 400, 'bad_request', 'owner and repo required in path', 'request_validation');

    // Fetch GitHub content (guarded)
    let result;
    try {
      result = await fetchBitacoraFromGitHub(owner, repo);
    } catch (e) {
      return sendError(res, 502, 'fetch_failed', String((e && e.message) || e), 'fetch_github', e);
    }

    if (result.notFound) return sendError(res, 404, 'not_found', 'repo_or_file_not_found', 'fetch_github');
    if (result.rateLimited) return sendError(res, 429, 'rate_limited', result.text || 'rate limited', 'fetch_github');
    if (result.error) return sendError(res, result.status || 500, 'github_error', result.error || 'github error', 'fetch_github');

    const md = result.md || '';
    let kanban;
    try {
      kanban = parseBitacora(md);
    } catch (e) {
      return sendError(res, 500, 'parse_failed', String((e && e.message) || e), 'parse_bitacora', e);
    }

    const response = {
      repo: `${owner}/${repo}`,
      kanban,
      meta: { cached: false, fetchedAt: new Date().toISOString(), etag: result.sha || null }
    };
    return res.status(200).json(response);
  } catch (err) {
    // Catch-all for any other unexpected errors in the handler top-level
    return sendError(res, 500, 'internal_error', String((err && err.message) || err), 'internal', err);
  }
}
