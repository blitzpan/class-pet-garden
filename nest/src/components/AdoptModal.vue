<script setup lang="ts">
import { computed, ref } from 'vue'
import { adopt } from '@/api/parent'
import { PET_TYPES, getPetLevel1Image } from '@/data/pets'

const props = defineProps<{ mode?: 'adopt' | 'change' }>()
const emit = defineEmits<{ (e: 'done'): void; (e: 'close'): void }>()
const selected = ref('')
const error = ref('')
const busy = ref(false)

const isChange = computed(() => props.mode === 'change')

async function confirm() {
  if (!selected.value) {
    error.value = '请选择一只宠物'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await adopt(selected.value)
    emit('done')
  } catch (e: any) {
    error.value = e?.response?.data?.error || '领取失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
    @click.self="emit('close')"
  >
    <div class="bg-white w-full sm:max-w-sm max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold">{{ mode === 'change' ? '更换宠物' : '领取宠物' }}</h3>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100"
          @click="emit('close')"
        >
          <span class="material-symbols-rounded text-[20px]">close</span>
        </button>
      </div>
      <div class="mt-4 grid grid-cols-3 gap-3">
        <button
          v-for="p in PET_TYPES"
          :key="p.id"
          type="button"
          @click="selected = p.id"
          :class="[
            'relative rounded-2xl border p-2 transition',
            selected === p.id
              ? 'border-orange-400 bg-[#fff9f3] ring-2 ring-orange-100 shadow-[0_10px_24px_rgba(184,94,37,0.16)]'
              : 'border-slate-100 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-[0_12px_22px_rgba(162,95,48,0.1)]'
          ]"
        >
          <span v-if="p.category === 'mythical'" class="absolute right-1.5 top-1.5 z-10 rounded-full bg-white px-1.5 py-0.5 text-xs font-semibold text-[#ae6b44]">神兽</span>
          <div
            class="aspect-square overflow-hidden rounded-xl p-1.5 transition"
            :class="selected === p.id ? 'bg-[#ffe9d2]' : 'bg-[#fff5eb]'"
          >
            <img :src="getPetLevel1Image(p.id)" :alt="p.name" class="h-full w-full object-contain" />
          </div>
          <span
            class="mt-2 block text-sm font-bold"
            :class="selected === p.id ? 'text-[#b85e25]' : 'text-[#4d3527]'"
          >{{ p.name }}</span>
        </button>
      </div>
      <div v-if="isChange" class="mt-4 flex gap-2.5 rounded-2xl bg-rose-50 px-3.5 py-3 ring-1 ring-rose-100">
        <!-- 图标用内联 SVG：项目里的 Material Symbols 是按需裁剪的子集（仅十几 KB），没有 warning 字形 -->
        <svg
          class="mt-px h-4 w-4 shrink-0 text-rose-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div class="min-w-0 text-xs leading-5">
          <p class="font-bold text-rose-600">更换宠物后，等级与积分将清零</p>
          <p class="mt-0.5 text-rose-500">清零后无法恢复，需要从头重新培养。</p>
        </div>
      </div>

      <p v-if="error" class="mt-3 text-sm text-red-500">{{ error }}</p>
      <button
        @click="confirm"
        :disabled="busy"
        class="mt-4 w-full rounded-xl py-2.5 font-semibold text-white transition disabled:opacity-50"
        :class="isChange ? 'bg-rose-500 hover:bg-rose-600' : 'bg-orange-500 hover:bg-orange-600'"
      >
        {{ isChange ? '确认更换' : '确认领取' }}
      </button>
    </div>
  </div>
</template>
