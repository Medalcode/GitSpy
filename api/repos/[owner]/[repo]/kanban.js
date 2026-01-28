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
      return res.status(400).json({ error: "owner and repo required in path" });

    // Dynamically import parser from api/_lib (included with function bundle)
    const parserMod = await import(new URL('../_lib/bitacoraParser.js', import.meta.url).href);
    const parseBitacora = parserMod.parseBitacora || (parserMod.default && parserMod.default.parseBitacora) || parserMod.default;
    if (!parseBitacora) {
      console.error('parseBitacora not available in api/_lib/bitacoraParser.js', Object.keys(parserMod));
      return res.status(500).json({ error: 'parser_unavailable' });
    }


    const result = await fetchBitacoraFromGitHub(owner, repo);
    if (result.notFound)
      return res.status(404).json({ error: "repo_or_file_not_found" });
    if (result.rateLimited)
      return res
        .status(429)
        .json({ error: "rate_limited", detail: result.text });
    if (result.error)
      return res
        .status(result.status || 500)
        .json({ error: "github_error", detail: result.error });

    const md = result.md || "";
    const kanban = parseBitacora(md);
    const response = {
      repo: `${owner}/${repo}`,
      kanban,
      meta: {
        cached: false,
        fetchedAt: new Date().toISOString(),
        etag: result.sha || null,
      },
    };
    return res.status(200).json(response);
  } catch (err) {
    console.error("serverless kanban error", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
