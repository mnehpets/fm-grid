<template>
  <div ref="tableEl"></div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { TabulatorFull as Tabulator } from 'tabulator-tables'

const props = defineProps({
  records: { type: Array, required: true },
  config: { type: Object, required: true },
  groupBy: { type: String, default: '' },
  sortBy: { type: String, default: '' },
  sortDir: { type: String, default: 'asc' },
})
const emit = defineEmits(['select'])

const tableEl = ref(null)
let tabulator = null

function columnLabel(field) {
  return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function buildColumns(config) {
  return (config.columns || []).map(field => ({
    title: columnLabel(field),
    field: `fields.${field}`,
    sorter: 'string',
    ...(field === config.id_field ? { width: 80, frozen: true } : {}),
    ...(field === config.title_field ? { widthGrow: 3 } : {}),
  }))
}

function applyGroupBy(field) {
  if (!tabulator) return
  if (!field) {
    tabulator.setGroupBy(false)
    return
  }
  const vocab = props.config.controlled_fields?.[field]
  tabulator.setGroupBy(`fields.${field}`)
  if (vocab?.length) tabulator.setGroupValues([vocab])
}

onMounted(() => {
  tabulator = new Tabulator(tableEl.value, {
    data: props.records,
    columns: buildColumns(props.config),
    layout: 'fitColumns',
    pagination: true,
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100],
    movableColumns: true,
    rowClick(_e, row) {
      emit('select', row.getData())
    },
  })
  if (props.groupBy) applyGroupBy(props.groupBy)
  if (props.sortBy) applySort(props.sortBy, props.sortDir)
})

function applySort(field, dir) {
  if (!tabulator) return
  if (field) {
    tabulator.setSort([{ column: `fields.${field}`, dir: dir || 'asc' }])
  } else {
    tabulator.clearSort()
  }
}

watch(() => props.records, records => tabulator?.setData(records))
watch(() => props.groupBy, applyGroupBy)
watch([() => props.sortBy, () => props.sortDir], ([field, dir]) => applySort(field, dir))
</script>
