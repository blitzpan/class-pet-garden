<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Rule } from '@/types'
import { score } from '@/api/parent'

const props = defineProps<{ rules: Rule[] }>()
const emit = defineEmits<{ (e: 'scored'): void }>()

const categories = computed(() => [...new Set(props.rules.map((r) => r.category))])
const active = ref('')
const current = computed(() => {
  const cat = active.value || categories.value[0] || ''
  return props.rules.filter((r) => r.category === cat)
})

const busy = ref<string | null>(null)
const error = ref('')
const pending = ref<Rule | null>(null)

function askScore(rule: Rule) {
  error.value = ''
  pending.value = rule
}

async function confirmScore() {
  const rule = pending.value
  if (!rule) return
  busy.value = rule.id
  error.value = ''
  try {
    await score(rule.id)
    pending.value = null
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
    <div v-if="categories.length" class="mt-3 flex flex-wrap gap-1.5">
      <button
        v-for="cat in categories"
        :key="cat"
        type="button"
        class="rounded-full border px-2.5 py-1 text-sm transition"
        :class="(active || categories[0]) === cat ? 'border-orange-400 bg-orange-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-orange-50'"
        @click="active = cat"
      >
        {{ cat }}
      </button>
    </div>
    <p v-if="error" class="mt-2 text-sm text-red-500">{{ error }}</p>
    <div class="mt-3 flex flex-wrap gap-2">
      <button
        v-for="r in current"
        :key="r.id"
        type="button"
        class="inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed"
        :class="[
          busy === r.id ? 'opacity-50' : '',
          r.points >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
        ]"
        :disabled="busy === r.id"
        @click="askScore(r)"
      >
        <span class="min-w-0 truncate">{{ r.name }}</span>
        <span class="shrink-0 font-bold tabular-nums">{{ r.points > 0 ? '+' : '' }}{{ r.points }}</span>
      </button>
    </div>

    <div
      v-if="pending"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      @click.self="pending = null"
    >
      <div class="w-full rounded-t-3xl bg-white p-5 sm:max-w-sm sm:rounded-3xl">
        <h3 class="text-lg font-bold">确认{{ pending.points >= 0 ? '加分' : '减分' }}？</h3>
        <p class="mt-2 text-sm text-gray-600">
          项目「<span class="font-semibold text-gray-800">{{ pending.name }}</span>」，
          <span :class="pending.points >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-rose-600'">
            {{ pending.points > 0 ? '+' : '' }}{{ pending.points }} 分
          </span>
        </p>
        <p v-if="error" class="mt-2 text-sm text-red-500">{{ error }}</p>
        <button
          type="button"
          class="mt-4 w-full rounded-xl bg-orange-500 py-2.5 font-semibold text-white disabled:opacity-50"
          :disabled="busy !== null"
          @click="confirmScore"
        >
          {{ busy !== null ? '提交中…' : '确认' }}
        </button>
        <button
          type="button"
          class="mt-2 w-full text-center text-sm text-gray-400"
          :disabled="busy !== null"
          @click="pending = null"
        >
          取消
        </button>
      </div>
    </div>
  </div>
</template>
