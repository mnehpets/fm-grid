<template>
  <div id="app">
    <header class="app-header">
      <h1>{{ index?.config?.title || 'FM Grid' }}</h1>
      <div class="controls" v-if="index">
        <input
          v-model="textFilter"
          type="search"
          :placeholder="`Search ${titleField}…`"
        />
        <FilterDropdown
          v-for="(vocab, field) in index.config.controlled_fields"
          :key="field"
          :label="fieldLabel(field)"
          :options="vocab"
          v-model="filters[field]"
        />
        <select v-model="groupByField" class="group-select">
          <option value="">No grouping</option>
          <option v-for="col in index.config.columns" :key="col" :value="col">
            Group by {{ fieldLabel(col) }}
          </option>
        </select>
      </div>
    </header>

    <nav class="views-bar" v-if="index?.config?.views?.length">
      <button
        v-for="view in index.config.views"
        :key="view.name"
        class="view-btn"
        :class="{ active: activeView === view.name }"
        @click="selectView(view)"
      >
        {{ view.name }}
      </button>
    </nav>

    <div class="app-body">
      <div class="grid-pane">
        <div v-if="loadError" class="state-msg">{{ loadError }}</div>
        <div v-else-if="!index" class="state-msg">Loading…</div>
        <template v-else>
          <details v-if="index.errors?.length" class="error-banner">
            <summary>{{ index.errors.length }} parse error(s)</summary>
            <ul>
              <li v-for="e in index.errors" :key="e.path">
                <strong>{{ e.path }}</strong>: {{ e.error }}
              </li>
            </ul>
          </details>
          <details v-if="index.warnings?.length" class="warning-banner">
            <summary>{{ index.warnings.length }} validation warning(s)</summary>
            <ul>
              <li v-for="w in index.warnings" :key="w.path + w.warning">
                <strong>{{ w.path }}</strong>: {{ w.warning }}
              </li>
            </ul>
          </details>
          <RecordGrid
            ref="gridRef"
            :records="filteredRecords"
            :config="index.config"
            :group-by="groupByField"
            @select="selectedRecord = $event"
          />
        </template>
      </div>

      <div class="detail-pane" v-if="selectedRecord">
        <RecordDetail
          :record="selectedRecord"
          :config="index.config"
          @close="selectedRecord = null"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import RecordGrid from './components/RecordGrid.vue'
import RecordDetail from './components/RecordDetail.vue'
import FilterDropdown from './components/FilterDropdown.vue'
import { loadSchema, webdavSource } from './sources/index.js'

const index = ref(null)
const loadError = ref(null)
const selectedRecord = ref(null)
const textFilter = ref('')
const filters = ref({})
const groupByField = ref('')
const activeView = ref(null)
const sort = ref([])
const gridRef = ref(null)
let applyingView = false

const titleField = computed(() => index.value?.config?.title_field || 'title')

function fieldLabel(field) {
  return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function emptyFilters(cf) {
  return Object.fromEntries(Object.keys(cf || {}).map(k => [k, []]))
}

watch(() => index.value?.config?.controlled_fields, cf => {
  if (!cf) return
  const next = emptyFilters(cf)
  for (const k of Object.keys(next)) next[k] = filters.value[k] ?? []
  filters.value = next
}, { immediate: true })

// Deselect active view when user manually changes filters, grouping, or sort
watch([filters, groupByField, sort], () => {
  if (!applyingView) activeView.value = null
}, { deep: true })

function selectView(view) {
  applyingView = true
  const cf = index.value?.config?.controlled_fields || {}
  filters.value = { ...emptyFilters(cf), ...(view.filters || {}) }
  groupByField.value = view.group_by || ''
  sort.value = view.sort || []
  activeView.value = view.name
  nextTick(() => {
    gridRef.value?.clearSort()
    applyingView = false
  })
}

const filteredRecords = computed(() => {
  if (!index.value) return []
  let records = index.value.records

  const text = textFilter.value.trim().toLowerCase()
  if (text) {
    const tf = titleField.value
    records = records.filter(r => String(r.fields[tf] || '').toLowerCase().includes(text))
  }

  for (const [field, selected] of Object.entries(filters.value)) {
    if (selected.length) {
      records = records.filter(r => selected.includes(r.fields[field]))
    }
  }

  if (sort.value.length) {
    const cf = index.value.config.controlled_fields || {}
    const vocabOrders = {}
    for (const { field } of sort.value) {
      if (cf[field]) vocabOrders[field] = Object.fromEntries(cf[field].map((v, i) => [String(v), i]))
    }
    records = [...records].sort((a, b) => {
      for (const { field, dir } of sort.value) {
        const av = a.fields[field]
        const bv = b.fields[field]
        let cmp
        if (vocabOrders[field]) {
          cmp = (vocabOrders[field][String(av)] ?? Infinity) - (vocabOrders[field][String(bv)] ?? Infinity)
        } else {
          cmp = String(av ?? '').localeCompare(String(bv ?? ''))
        }
        if (cmp !== 0) return dir === 'desc' ? -cmp : cmp
      }
      return 0
    })
  }

  return records
})

// Resolve param (or fallback) to a same-origin absolute URL.
function sameOriginUrl(param, fallback) {
  const url = new URL(param || fallback, window.location.href)
  if (url.origin !== window.location.origin) throw new Error(`cross-origin URL rejected: ${url.href}`)
  return url.href
}

// The schema (?src=, default ./schema.yaml) is the entry point: it supplies the
// display config and, via source_dir, where the source tree is served. The grid
// then PROPFINDs that collection (?dav= to override) for a live file list and
// parses each .md client-side.
onMounted(async () => {
  try {
    const params = new URLSearchParams(window.location.search)

    const schemaUrl = sameOriginUrl(params.get('src'), './schema.yaml')
    const schema = await loadSchema(schemaUrl)

    // source_dir resolves against the schema's location, so the served .md tree
    // (the WebDAV collection) lines up by construction.
    const srcDir = String(schema.source_dir || '.').replace(/\/?$/, '/')
    const collectionUrl = sameOriginUrl(params.get('dav'), new URL(srcDir, schemaUrl).href)

    index.value = await webdavSource(collectionUrl, schema).list()

    if (schema.title) document.title = schema.title

    const defaultViewName = schema.default_view
    if (defaultViewName) {
      const view = (schema.views || []).find(v => v.name === defaultViewName)
      if (view) selectView(view)
    }
  } catch (e) {
    loadError.value = e.message
  }
})
</script>
