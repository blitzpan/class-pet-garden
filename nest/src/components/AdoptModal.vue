<script setup lang="ts">
import { ref } from 'vue'
import { adopt } from '@/api/parent'
import { PET_TYPES } from '@/data/pets'

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
    <div class="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5">
      <h3 class="text-lg font-bold mb-3">领取宠物</h3>
      <div class="grid grid-cols-3 gap-2 mb-3">
        <button
          v-for="p in PET_TYPES"
          :key="p.id"
          @click="selected = p.id"
          :class="[
            'flex flex-col items-center border rounded-xl py-2',
            selected === p.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200',
          ]"
        >
          <span class="text-2xl">{{ p.mythical ? '✨' : '🐾' }}</span>
          <span class="text-xs mt-1">{{ p.name }}</span>
        </button>
      </div>
      <p v-if="error" class="text-sm text-red-500 mb-2">{{ error }}</p>
      <button
        @click="confirm"
        :disabled="busy"
        class="w-full bg-orange-500 text-white rounded-xl py-2.5 font-semibold disabled:opacity-50"
      >
        确认领取
      </button>
      <button @click="emit('close')" class="w-full text-center text-sm text-gray-400 mt-2">取消</button>
    </div>
  </div>
</template>
