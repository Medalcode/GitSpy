// ARCHITECTURE NOTE: Static import is REQUIRED for Vercel to correctly bundle the parser from _lib.
// Dynamic imports or runtime fs reads often fail in Serverless environments due to tracing limitations.
// DO NOT refactor to dynamic import without verifying the production bundle (vercel build).
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
  // PERMITIR ACCESO PÚBLICO: No enviamos token para evitar 401 si el token del servidor es inválido.
  // Esto garantiza que el kanban sea visible en repos públicos.
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(url, { headers });
  const status = res.status;

  // Granular GitHub Error Mapping
  if (status === 404) {
    // 404 implies file missing OR repo is private (hidden by GitHub to anonymous users)
    // We return 404 to the user. We do NOT return 401 because we cannot distinguish.
    return { error: 'Bitacora.md not found or Repo accessible', code: 'not_found', status: 404 };
  }
  
  if (status === 403) {
    const text = await res.text();
    const isRateLimit = res.headers.get('x-ratelimit-remaining') === '0';
    if (isRateLimit) {
         return { error: 'GitHub Rate Limit Exceeded', code: 'rate_limited', status: 429 };
    }
    // Generic forbidden
    return { error: 'Forbidden access to Repository', code: 'forbidden', status: 403, details: text };
  }

  if (status === 401) {
    // 401 from GitHub means our SERVER token is bad. This is a Server Config Error (500).
    // NEVER return 401 to the user for a server config issue.
    return { error: 'Internal Upstream Auth Configuration Error', code: 'upstream_auth_error', status: 500 }; 
  }

  if (!res.ok) {
    const text = await res.text();
    return { error: `Unexpected GitHub Error: ${text}`, code: 'upstream_error', status: 502 };
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
  console.log('HANDLER_START', req.url);
  try {
    setCorsHeaders(res);
    
    // Guardrail: Ensure parser is loaded in production
    if (process.env.VERCEL === '1' && typeof parseBitacora !== 'function') {
      console.error('PARSER_CHECK_FAILED: parseBitacora is', typeof parseBitacora);
      return sendError(res, 500, 'parser_not_loaded', 'Bitacora parser not correctly loaded in bundle', 'init_check');
    }

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

    // Unified error handling from fetch step
    if (result.error) {
      return sendError(res, result.status, result.code, result.error, 'fetch_github', result.details);
    }

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
    const stack = (err && err.stack) || String(err);
    console.error('HANDLER_CRASH:', stack);
    return sendError(res, 500, 'internal_error', 'Internal Server Error detected inside handler', 'internal', err);
  }
}
