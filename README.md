# fm-grid

A read-only data grid for collections of markdown files with YAML frontmatter. Point it at a directory of `.md` files, define a schema, and get a sortable, filterable, groupable browser view.

## How it works

Each record is a markdown file. Fields are YAML frontmatter. The body is an excerpt shown in a detail pane.

A `schema.yaml` file defines the dataset:

- which fields to display as columns
- controlled vocabularies (enforced at index time; invalid values go to an errors list rather than silently appearing)
- named views (preset filter + group-by + sort combinations)

`indexgen` walks the source directory, validates the schema, and writes `index.json`. The frontend (`frontend/`) is a static Vue 3 SPA that reads `index.json` and renders the grid.

## Structure

```
indexgen/     Go CLI — generates index.json from a schema.yaml + source directory
frontend/     Vue 3 + Vite + Tabulator SPA — served as static files
```

## Usage

```sh
# Generate the index
cd indexgen
go run . --config /path/to/schema.yaml

# Build the frontend
cd frontend
pnpm install && pnpm build
# serve dist/ from any static path, e.g. /fm-grid/
```

The frontend reads the index URL from a `?src=` query parameter (same-origin only), defaulting to `./index.json` if omitted.

## Schema

```yaml
source_dir: ./records
output: records.index.json
id_field: id
title_field: title
columns: [id, title, status, priority, due]
controlled_fields:
  status: [Todo, Doing, Done]
  priority: [High, Medium, Low]
excerpt_lines: 3
views:
  - name: Active
    filters:
      status: [Todo, Doing]
    group_by: status
    sort_by: due
    sort_dir: asc
  - name: All
```
