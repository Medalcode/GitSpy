// Pure, deterministic parser for Bitacora.md -> KanbanBoard JSON
// Exposes: parseBitacora(mdContent: string) -> KanbanBoard object

function normalizeNewlines(s) {
  // Remove BOM, normalize CRLF -> LF
  if (!s) return '';
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n?/g, '\n');
}

function tokenizeLines(mdContent) {
  const normalized = normalizeNewlines(mdContent);
  return normalized.split('\n').map((text, idx) => ({ line: idx + 1, text }));
}

function parseGlobalMetadata(lines, warnings) {
  // Look for YAML-like front matter starting at first non-empty line === '---'
  const meta = {};
  let i = 0;
  while (i < lines.length && lines[i].text.trim() === '') i++;
  if (i < lines.length && lines[i].text.trim() === '---') {
    i++;
    const startLine = lines[i - 1].line;
    for (; i < lines.length; i++) {
      const t = lines[i].text;
      if (t.trim() === '---') {
        return { meta, nextLine: i + 1 };
      }
      const m = t.match(/^\s*([^:]+):\s*(.*)$/);
      if (m) {
        const key = m[1].trim();
        let val = m[2].trim();
        // simple parsing for lists in form [a, b]
        if (/^\[.*\]$/.test(val)) {
          try {
            const inner = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
            meta[key] = inner;
          } catch (e) {
            meta[key] = val;
          }
        } else {
          meta[key] = val;
        }
      } else {
        if (t.trim() !== '') warnings.push({ line: lines[i].line, reason: 'invalid front matter line' });
      }
    }
    warnings.push({ line: startLine, reason: 'front matter not closed with ---' });
    return { meta, nextLine: i };
  }
  return { meta, nextLine: 1 };
}

function isCanonicalSectionHeader(text) {
  // Accept headings containing either the emoji or the Spanish canonical name
  const map = {
    'pendiente': 'pending',
    'en desarrollo': 'in_progress',
    'completadas': 'completed'
  };
  const emojis = {
    '\uD83D\uDFE1': 'pending', // yellow circle 🟡 (surrogate pair)
    '\uD83D\uDD35': 'in_progress', // large blue circle 🔵
    '\uD83D\uDFE2': 'completed' // green circle 🟢
  };
  const trimmed = text.trim();
  // Remove leading hashes
  const headingMatch = trimmed.match(/^#{1,6}\s*(.*)$/);
  if (!headingMatch) return null;
  let content = headingMatch[1].trim();
  // Try emoji first
  for (const e in emojis) {
    if (content.indexOf(e) !== -1) return emojis[e];
  }
  // Try matching canonical Spanish names (case-insensitive)
  const lowered = content.toLowerCase();
  for (const k in map) {
    if (lowered.indexOf(k) !== -1) return map[k];
  }
  return null;
}

function groupSections(lines, warnings) {
  const sections = {}; // canonical -> array of {line,text}
  let current = null;
  for (const ln of lines) {
    const s = ln.text;
    const maybe = isCanonicalSectionHeader(s);
    if (maybe) {
      current = maybe;
      if (!sections[current]) sections[current] = [];
      continue;
    }
    // collect lines only if within a canonical section
    if (current) sections[current].push(ln);
    else {
      // ignore non-section lines but warn if they look like headings
      if (/^#{1,6}\s+/.test(s)) {
        // a non-canonical heading; warn
        warnings.push({ line: ln.line, reason: `non-canonical section header: ${s.trim()}` });
      }
    }
  }
  return sections;
}

function parseInlineMetaFromPipes(text, lineNum, warnings) {
  // find all | ... | fragments and parse key: value pairs
  const meta = {};
  const pipeRegex = /\|([^|]+)\|/g;
  let m;
  let found = false;
  while ((m = pipeRegex.exec(text)) !== null) {
    found = true;
    const chunk = m[1].trim();
    // pairs separated by comma but respect commas inside quotes (simple)
    const pairs = chunk.split(',').map(s => s.trim()).filter(Boolean);
    for (const p of pairs) {
      const kv = p.split(':');
      if (kv.length < 2) {
        warnings.push({ line: lineNum, reason: `invalid meta pair '${p}'` });
        continue;
      }
      const key = kv.shift().trim().toLowerCase();
      const value = kv.join(':').trim();
      if (key === 'tags') {
        // split by comma inside value
        const spl = value.split(',').map(x => x.trim()).filter(Boolean);
        meta[key] = spl;
      } else {
        meta[key] = value;
      }
    }
  }
  return { meta, hasMeta: found };
}

function parseFeatureLine(ln, warnings) {
  const raw = ln.text;
  // bullet with optional checkbox
  const m = raw.match(/^\s*-\s*(?:\[([ xX])\]\s*)?(.*)$/);
  if (!m) {
    warnings.push({ line: ln.line, reason: 'line not a bullet (ignored)' });
    return null;
  }
  const checkbox = m[1];
  let rest = m[2].trim();
  // extract inline meta between pipes
  const { meta, hasMeta } = parseInlineMetaFromPipes(rest, ln.line, warnings);
  if (hasMeta) {
    // remove all |...| occurrences from rest
    rest = rest.replace(/\|[^|]+\|/g, '').trim();
  }
  const title = rest.replace(/\s+$/,'');
  if (!title) {
    warnings.push({ line: ln.line, reason: 'bullet with empty title' });
    return null;
  }
  const done = checkbox && checkbox.toLowerCase() === 'x';
  // normalize meta keys to lowercase already done
  return {
    title,
    done,
    metadata: meta,
    raw,
    line: ln.line
  };
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
}

function simpleHash(s) {
  // djb2
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  // to unsigned hex
  return (h >>> 0).toString(16).padStart(8, '0');
}

function deriveIdFrom(title, line) {
  const base = slugify(title || 'item');
  const h = simpleHash(title + '|' + line);
  return `${base}-${h.slice(0,8)}`;
}

function buildKanban(mdContent) {
  const warnings = [];
  const errors = [];
  const lines = tokenizeLines(mdContent);
  const { meta: globalMeta, nextLine } = parseGlobalMetadata(lines, warnings);
  const remaining = lines.slice(nextLine - 1);
  const sections = groupSections(remaining, warnings);

  const canonicalStates = ['pending', 'in_progress', 'completed'];
  const states = { pending: [], in_progress: [], completed: [] };
  const features = [];
  const seenIds = new Map();

  for (const st of canonicalStates) {
    const sectLines = sections[st] || [];
    // scan for bullets
    for (const ln of sectLines) {
      if (/^\s*-\s*/.test(ln.text)) {
        const item = parseFeatureLine(ln, warnings);
        if (!item) continue;
        // determine id
        let id = null;
        if (item.metadata && item.metadata.id) id = String(item.metadata.id);
        else id = deriveIdFrom(item.title, ln.line);
        if (seenIds.has(id)) {
          errors.push(`duplicate id '${id}' at line ${ln.line} previously at line ${seenIds.get(id)}`);
          warnings.push({ line: ln.line, reason: `duplicate id '${id}'` });
        } else seenIds.set(id, ln.line);

        // normalize metadata keys: convert known due/dueDate keys to dueDate
        const normalizedMeta = {};
        for (const k in (item.metadata || {})) {
          const lk = k.toLowerCase();
          let v = item.metadata[k];
          if (lk === 'due' || lk === 'duedate' || lk === 'due_date') {
            normalizedMeta['dueDate'] = v;
          } else if (lk === 'tags' && Array.isArray(v)) {
            normalizedMeta['tags'] = v;
          } else {
            normalizedMeta[lk] = v;
          }
        }

        const feat = {
          id,
          title: item.title,
          derivedId: (item.metadata && item.metadata.id) ? null : id,
          state: st,
          rawCheckbox: item.done ? '[x]' : '[ ]',
          description: null,
          metadata: normalizedMeta,
          flags: {
            done: st === 'completed' || item.done === true,
            blocked: !!(normalizedMeta.blocked === 'true' || normalizedMeta.blocked === true),
            urgent: (normalizedMeta.priority && String(normalizedMeta.priority).toLowerCase() === 'high') || (Array.isArray(normalizedMeta.tags) && normalizedMeta.tags.includes('urgent'))
          },
          timestamps: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: st === 'completed' ? new Date().toISOString() : null,
            dueDate: normalizedMeta.dueDate || null
          },
          metrics: {},
          references: [],
          sourceLocation: { filePath: 'Bitacora.md', startLine: ln.line, endLine: ln.line },
          raw: item.raw
        };

        features.push(feat);
        states[st].push(id);
      }
    }
  }

  const board = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    repository: { provider: null, owner: null, name: null, url: null, commitSha: null, ref: null },
    source: { filePath: 'Bitacora.md', parserVersion: 'bitacoraParser-1.0.0', fileVersion: { frontMatterVersion: globalMeta.version || null } },
    globalMeta: Object.keys(globalMeta).length ? globalMeta : null,
    states,
    features,
    warnings,
    errors
  };

  return board;
}

function parseBitacora(mdContent) {
  if (typeof mdContent !== 'string') throw new TypeError('mdContent must be a string');
  return buildKanban(mdContent);
}

module.exports = { parseBitacora, tokenizeLines, parseGlobalMetadata, groupSections, parseFeatureLine, buildKanban };
