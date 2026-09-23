<script setup lang="ts">
import { ref } from 'vue'
import { adopt } from '@/api/parent'
import { PET_TYPES, getPetLevel1Image } from '@/data/pets'

const props = defineProps<{ mode?: 'adopt' | 'change' }>()
const emit = defineEmits<{ (e: 'done'): void; (e: 'close'): void }>()
const selected = ref('')
const error = ref('')
const busy = ref(false)

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
            selected === p.id ? 'border-orange-400 bg-[#fff9f3] ring-2 ring-orange-100' : 'border-slate-100 hover:border-orange-300 hover:shadow-sm'
          ]"
        >
          <span v-if="p.category === 'mythical'" class="absolute right-1.5 top-1.5 z-10 rounded-full bg-white px-1.5 py-0.5 text-xs font-semibold text-[#ae6b44]">神兽</span>
          <img :src="getPetLevel1Image(p.id)" :alt="p.name" class="aspect-square w-full object-contain" />
          <span class="mt-1 block text-sm font-bold" :class="selected === p.id ? 'text-[#b85e25]' : ''">{{ p.name }}</span>
        </button>
      </div>
      <p v-if="error" class="mt-3 text-sm text-red-500">{{ error }}</p>
      <button
        @click="confirm"
        :disabled="busy"
        class="mt-4 w-full rounded-xl bg-orange-500 py-2.5 font-semibold text-white disabled:opacity-50"
      >
        {{ mode === 'change' ? '确认更换' : '确认领取' }}
      </button>
    </div>
  </div>
</template>
