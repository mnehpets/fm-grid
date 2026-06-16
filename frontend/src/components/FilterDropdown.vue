<template>
  <div class="filter-dropdown" ref="rootEl">
    <button class="filter-btn" :class="{ active: modelValue.length }" @click.stop="open = !open">
      {{ label }}<span v-if="modelValue.length"> ({{ modelValue.length }})</span> ▾
    </button>
    <div v-if="open" class="filter-panel" @click.stop>
      <label v-for="opt in options" :key="opt" class="filter-option">
        <input type="checkbox" :checked="modelValue.includes(opt)" @change="toggle(opt)" />
        {{ opt }}
      </label>
      <button v-if="modelValue.length" class="clear-btn" @click="emit('update:modelValue', [])">
        Clear
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  options: { type: Array, required: true },
  modelValue: { type: Array, required: true },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const rootEl = ref(null)

function toggle(opt) {
  const next = props.modelValue.includes(opt)
    ? props.modelValue.filter(v => v !== opt)
    : [...props.modelValue, opt]
  emit('update:modelValue', next)
}

function onDocClick(e) {
  if (!rootEl.value?.contains(e.target)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>
