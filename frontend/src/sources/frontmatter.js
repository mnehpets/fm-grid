import yaml from 'js-yaml'

// Client-side frontmatter parsing for the markdown task files. Semantics mirror
// github.com/mnehpets/workspace-mcp (the reference parser that Obsidian, Claude,
// and tree_search agree on), so the grid interprets a file the same way they do.

// parseFrontmatter returns { fields, body } or null when there is no parseable
// frontmatter block: requires a leading "---\n", then a closing "\n---\n" (body
// after) or a trailing "\n---" (frontmatter only, no body).
export function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return null
  const rest = text.slice(4)
  let end = rest.indexOf('\n---\n')
  let body = ''
  if (end < 0) {
    if (rest.endsWith('\n---')) {
      end = rest.length - 4
    } else {
      return null
    }
  } else {
    body = rest.slice(end + 5)
  }

  let fields
  try {
    fields = yaml.load(rest.slice(0, end))
  } catch {
    return null
  }
  if (fields == null) fields = {}
  if (typeof fields !== 'object' || Array.isArray(fields)) return null

  normalizeDates(fields)
  return { fields, body }
}

// YAML timestamps parse to Date; render as YYYY-MM-DD in UTC. Using UTC getters
// avoids the midnight-UTC-shows-as-the-previous-day locale bug.
export function normalizeDates(fields) {
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Date) fields[k] = formatDate(v)
  }
}

function formatDate(d) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// excerpt joins the first n non-blank, non-heading body lines (a plain-text
// fallback for the detail pane when the rendered body is empty).
export function excerpt(body, n) {
  const out = []
  for (let line of body.trim().split('\n')) {
    line = line.trim()
    if (line === '' || line.startsWith('#')) continue
    out.push(line)
    if (out.length >= n) break
  }
  return out.join(' ')
}

// sha256Hex hex-encodes the SHA-256 of the file text — the fallback etag when
// the WebDAV server does not return a getetag for a file.
export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// idLess orders by trailing numeric suffix when present (T-1 < T-2 < T-10),
// else lexically.
export function idLess(a, b) {
  const an = idNum(a)
  const bn = idNum(b)
  if (an != null && bn != null) return an - bn
  return a < b ? -1 : a > b ? 1 : 0
}

function idNum(id) {
  const m = /(\d+)$/.exec(id || '')
  return m ? parseInt(m[1], 10) : null
}
