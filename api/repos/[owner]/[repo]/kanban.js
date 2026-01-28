// Dynamically import parser from local api/_lib to ensure availability in Vercel runtime

// ESM-friendly Vercel Serverless Function
// Uses static import for correct bundling.

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
    return { rateLimited: true, text };
  }
  if (!res.ok) {
    const text = await res.text();
    return { error: text, status };
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
    const owner = req.query.owner || (req.query[0] || "").split("/")[0];
    const repo = req.query.repo || (req.query[0] || "").split("/")[1];
    if (!owner || !repo)
      return res.status(400).json({ error: { code: 'bad_request', message: 'owner and repo required in path', stage: 'internal' } });

    // Dynamically import parser from api/_lib (included with function bundle)
    let parseBitacora = null;
    try {
      const parserMod = await import(new URL('../_lib/bitacoraParser.js', import.meta.url).href);
      parseBitacora = parserMod.parseBitacora || (parserMod.default && parserMod.default.parseBitacora) || parserMod.default;
      if (!parseBitacora) throw new Error('parseBitacora export not found');
    } catch (e) {
      console.error('parser import failed', e);
      return res.status(500).json({ error: { code: 'parser_import_failed', message: String((e && e.message) || e), stage: 'internal' } });
    }

    // Fetch GitHub content (guarded)
    let result;
    try {
      result = await fetchBitacoraFromGitHub(owner, repo);
    } catch (e) {
      console.error('fetchBitacoraFromGitHub failed', e);
      return res.status(502).json({ error: { code: 'fetch_failed', message: String((e && e.message) || e), stage: 'fetch_github' } });
    }

    if (result.notFound) return res.status(404).json({ error: { code: 'not_found', message: 'repo_or_file_not_found', stage: 'fetch_github' } });
    if (result.rateLimited) return res.status(429).json({ error: { code: 'rate_limited', message: result.text || 'rate limited', stage: 'fetch_github' } });
    if (result.error) return res.status(result.status || 500).json({ error: { code: 'github_error', message: result.error || 'github error', stage: 'fetch_github' } });

    const md = result.md || '';
    let kanban;
    try {
      kanban = parseBitacora(md);
    } catch (e) {
      console.error('parseBitacora failed', e);
      return res.status(500).json({ error: { code: 'parse_failed', message: String((e && e.message) || e), stage: 'parse_bitacora' } });
    }

    const response = {
      repo: `${owner}/${repo}`,
      kanban,
      meta: { cached: false, fetchedAt: new Date().toISOString(), etag: result.sha || null }
    };
    return res.status(200).json(response);
  } catch (err) {
    console.error('serverless kanban unexpected error', err);
    return res.status(500).json({ error: { code: 'internal_error', message: String((err && err.message) || err), stage: 'internal' } });
  }
}
