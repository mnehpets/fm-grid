import yaml from 'js-yaml'
import { parseFrontmatter, excerpt, sha256Hex, idLess } from './frontmatter.js'

// The WebDAV source. list() returns { generated_at, config, records, errors };
// the grid, filters, sort, and detail view depend only on that shape.

async function fetchOk(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res
}

// loadSchema parses the dataset's schema.yaml. Its field names match what the
// grid consumes (columns, controlled_fields, views, id_field, title_field,
// excerpt_lines) and it carries source_dir, used to locate the WebDAV
// collection. The schema is the single config source of truth.
export async function loadSchema(schemaUrl) {
  const text = await (await fetchOk(schemaUrl)).text()
  const schema = yaml.load(text)
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error(`invalid schema: ${schemaUrl}`)
  }
  return schema
}

// webdavSource — enumerate the collection with a WebDAV PROPFIND (Depth: 1),
// then GET and parse each .md client-side. The directory listing is live, so
// newly added (and removed) files are picked up. Config comes from the schema;
// collectionUrl is the WebDAV mount (defaults to the schema's source_dir).
const PROPFIND_BODY =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<propfind xmlns="DAV:"><prop><resourcetype/><getetag/></prop></propfind>'

export function webdavSource(collectionUrl, config) {
  return {
    async list() {
      const res = await fetch(collectionUrl, {
        method: 'PROPFIND',
        headers: { Depth: '1', 'Content-Type': 'application/xml' },
        body: PROPFIND_BODY,
      })
      if (!res.ok) throw new Error(`PROPFIND HTTP ${res.status}: ${collectionUrl}`)
      const entries = parseMultistatus(await res.text(), collectionUrl)

      const controlled = config.controlled_fields || {}
      const excerptLines = config.excerpt_lines || 3
      const records = []
      const errors = []

      await Promise.all(entries.map(async ({ path, url, etag }) => {
        let text
        try {
          text = await (await fetchOk(url)).text()
        } catch (e) {
          errors.push({ path, error: e.message })
          return
        }

        const parsed = parseFrontmatter(text)
        if (!parsed) {
          errors.push({ path, error: 'no frontmatter' })
          return
        }

        const bad = validateControlled(parsed.fields, controlled)
        if (bad) {
          errors.push({ path, error: bad })
          return
        }

        records.push({
          path,
          etag: etag || (await sha256Hex(text)),
          fields: parsed.fields,
          excerpt: excerpt(parsed.body, excerptLines),
          body: parsed.body,
        })
      }))

      const idField = config.id_field
      if (idField) {
        records.sort((a, b) =>
          idLess(String(a.fields[idField] ?? ''), String(b.fields[idField] ?? '')))
      }
      errors.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

      return { generated_at: new Date().toISOString(), config, records, errors }
    },
  }
}

// Parse a WebDAV 207 multistatus into { path, url, etag } per .md file, skipping
// the collection itself and any subcollections. Uses namespaced lookups so it is
// agnostic to the server's DAV: prefix. `path` is made relative to the
// collection (the file's source_dir-relative path) for use as the record key.
function parseMultistatus(xml, collectionUrl) {
  const NS = 'DAV:'
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('invalid PROPFIND XML response')
  }

  const basePath = new URL(collectionUrl).pathname
  const out = []
  for (const r of Array.from(doc.getElementsByTagNameNS(NS, 'response'))) {
    const href = r.getElementsByTagNameNS(NS, 'href')[0]?.textContent?.trim()
    if (!href) continue
    if (r.getElementsByTagNameNS(NS, 'collection').length) continue // skip dirs

    const url = new URL(href, collectionUrl)
    let path = decodeURIComponent(url.pathname)
    if (path.startsWith(basePath)) path = path.slice(basePath.length)
    if (!path.toLowerCase().endsWith('.md')) continue

    const etag = r.getElementsByTagNameNS(NS, 'getetag')[0]?.textContent?.trim()
    out.push({ path, url: url.href, etag: etag ? etag.replace(/^"(.*)"$/, '$1') : '' })
  }
  return out
}

// Drops a record and records an error when a controlled field carries a value
// outside its vocabulary, so drift is surfaced instead of silently shown.
function validateControlled(fields, controlled) {
  for (const [field, vocab] of Object.entries(controlled)) {
    if (!(field in fields)) continue
    const v = fields[field]
    if (typeof v !== 'string' || !vocab.includes(v)) {
      return `field ${JSON.stringify(field)} value ${JSON.stringify(v)} not in vocabulary`
    }
  }
  return null
}
