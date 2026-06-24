# fm-grid

A read-only data grid for collections of markdown files with YAML frontmatter. Point it at a WebDAV-served directory of `.md` files, define a schema, and get a sortable, filterable, groupable browser view.

## How it works

Each record is a markdown file. Fields are YAML frontmatter. The body is rendered as markdown in a detail pane (a plain-text excerpt is used as a fallback when the body is empty).

A `schema.yaml` file defines the dataset:

- which fields to display as columns
- controlled vocabularies (invalid values go to an errors list rather than silently appearing)
- named views (preset filter + group-by + sort combinations)

The frontend (`frontend/`) is a static Vue 3 SPA. It parses `schema.yaml` for the config, enumerates the source directory over WebDAV (`PROPFIND`), then fetches and parses each `.md` in the browser. There is no build/index step and no server-side app logic — the backend is a generic WebDAV mount that serves raw `.md` bytes.

## Structure

```
frontend/     Vue 3 + Vite + Tabulator SPA — served as static files
```

## Usage

```sh
cd frontend
pnpm install && pnpm build
# serve dist/ from any static path, e.g. /fm-grid/
```

The frontend is driven by query parameters (all same-origin only):

- `?src=` — the **`schema.yaml`** (default `./schema.yaml`). The frontend parses it for the display config (columns, controlled vocabularies, views) and for `source_dir`.
- `?dav=` — the WebDAV collection to list (default: the schema's `source_dir`, resolved relative to the schema).

The frontend enumerates the collection with a `PROPFIND` (Depth: 1), then `GET`s and parses each `.md` in the browser. The listing is live, so added and removed files are picked up on reload. Each record's `path` is taken relative to the collection. The `.md` tree must be served (raw, as `text/markdown`) from `source_dir`'s URL relative to the schema — or wherever `?dav=` points.

## Schema

```yaml
title: My Tasks          # optional — replaces "FM Grid" in the header and page title
source_dir: ./records
id_field: id
title_field: title
columns: [id, title, status, priority, due]
controlled_fields:
  status: [Todo, Doing, Done]
  priority: [High, Medium, Low]
excerpt_lines: 3
default_view: Active     # optional — view applied automatically on load
views:
  - name: Active
    filters:
      status: [Todo, Doing]
    group_by: status
    sort:
      - field: priority
        dir: asc
      - field: due
        dir: asc
  - name: All
```
