<template>
  <div class="record-detail">
    <h2>
      <button class="close-btn" @click="emit('close')" title="Close">✕</button>
      {{ title }}
    </h2>

    <table class="field-table">
      <tbody>
        <tr v-for="field in displayFields" :key="field">
          <th>{{ label(field) }}</th>
          <td>{{ fieldValue(field) }}</td>
        </tr>
      </tbody>
    </table>

    <div v-if="record.excerpt" class="excerpt">{{ record.excerpt }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  record: { type: Object, required: true },
  config: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const titleField = computed(() => props.config.title_field || 'title')

const title = computed(() => String(props.record.fields[titleField.value] || props.record.path))

const displayFields = computed(() => {
  const cols = props.config.columns || []
  return cols.filter(f => f !== titleField.value)
})

function label(field) {
  return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function fieldValue(field) {
  const v = props.record.fields[field]
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}
</script>
