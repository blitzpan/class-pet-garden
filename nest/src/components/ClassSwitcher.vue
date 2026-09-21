<script setup lang="ts">
import type { ClassItem } from '@/types'

defineProps<{ classes: ClassItem[]; modelValue: string }>()
const emit = defineEmits<{ (e: 'select', id: string): void }>()
</script>

<template>
  <div class="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
    <button
      v-for="c in classes"
      :key="c.id"
      @click="emit('select', c.id)"
      :class="[
        'whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium border',
        c.id === modelValue
          ? 'bg-orange-500 text-white border-orange-500'
          : 'bg-white text-gray-600 border-gray-200',
      ]"
    >
      {{ c.name }}
    </button>
    <p v-if="classes.length === 0" class="text-sm text-gray-400 py-2">暂无班级</p>
  </div>
</template>
