<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Rule } from '@/types'
import { score } from '@/api/parent'

const props = defineProps<{ rules: Rule[] }>()
const emit = defineEmits<{ (e: 'scored'): void }>()

const grouped = computed(() => {
  const map: Record<string, Rule[]> = {}
  for (const r of props.rules) {
    ;(map[r.category] ||= []).push(r)
  }
  return Object.entries(map)
})

const busy = ref<string | null>(null)
const error = ref('')

async function doScore(rule: Rule) {
  busy.value = rule.id
  error.value = ''
  try {
    await score(rule.id)
    emit('scored')
  } catch (e: any) {
    error.value = e?.response?.data?.error || '操作失败'
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div>
    <h4 class="font-semibold text-gray-700 mb-2">加分 / 减分</h4>
    <p v-if="error" class="text-sm text-red-500 mb-2">{{ error }}</p>
    <div v-for="[cat, rules] in grouped" :key="cat" class="mb-3">
      <div class="text-xs text-gray-400 mb-1">{{ cat }}</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="r in rules"
          :key="r.id"
          @click="doScore(r)"
          :disabled="busy === r.id"
          :class="[
            'px-3 py-2 rounded-xl text-sm font-medium border',
            r.points >= 0
              ? 'bg-green-50 border-green-300 text-green-700'
              : 'bg-red-50 border-red-300 text-red-700',
            busy === r.id && 'opacity-50',
          ]"
        >
          {{ r.name }} {{ r.points >= 0 ? '+' : '' }}{{ r.points }}
        </button>
      </div>
    </div>
  </div>
</template>
