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
})
const emit = defineEmits(['select'])

const tableEl = ref(null)
let tabulator = null

function columnLabel(field) {
  return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function vocabSorter(vocab) {
  const order = Object.fromEntries(vocab.map((v, i) => [String(v), i]))
  return (a, b) => (order[String(a)] ?? vocab.length) - (order[String(b)] ?? vocab.length)
}

function buildColumns(config) {
  return (config.columns || []).map(field => {
    const vocab = config.controlled_fields?.[field]
    return {
      title: columnLabel(field),
      field: `fields.${field}`,
      sorter: vocab?.length ? vocabSorter(vocab) : 'string',
      ...(field === config.id_field ? { width: 80, frozen: true } : {}),
      ...(field === config.title_field ? { widthGrow: 3 } : {}),
    }
  })
}

function applyGroupBy(field) {
  if (!tabulator) return
  if (!field) {
    tabulator.setGroupBy(false)
    tabulator.setGroupValues([])
  } else {
    const vocab = props.config.controlled_fields?.[field]
    tabulator.setGroupBy(`fields.${field}`)
    tabulator.setGroupValues(vocab?.length ? [vocab] : [])
  }
}

function clearSort() {
  tabulator?.clearSort()
}

defineExpose({ clearSort })

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
})

watch(() => props.records, records => tabulator?.setData(records))
watch(() => props.groupBy, applyGroupBy)
</script>
