<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getClasses, getLeaderboard } from '@/api/public'
import type { ClassItem, LeaderboardStudent } from '@/types'
import ClassSwitcher from '@/components/ClassSwitcher.vue'

const route = useRoute()
const router = useRouter()
const classes = ref<ClassItem[]>([])
const selectedClass = ref<string>('')
const students = ref<LeaderboardStudent[]>([])
const loading = ref(false)

async function loadClasses() {
  classes.value = await getClasses()
  if (classes.value.length === 0) return
  const fromQuery = route.query.class as string | undefined
  selectedClass.value =
    fromQuery && classes.value.some((c) => c.id === fromQuery) ? fromQuery : classes.value[0].id
  await loadLeaderboard()
}

async function loadLeaderboard() {
  if (!selectedClass.value) return
  loading.value = true
  try {
    students.value = await getLeaderboard(selectedClass.value)
  } finally {
    loading.value = false
  }
}

function onSelect(id: string) {
  selectedClass.value = id
  router.replace({ query: { ...route.query, class: id } })
  loadLeaderboard()
}

onMounted(loadClasses)
watch(
  () => route.query.class,
  (v) => {
    const id = v as string | undefined
    if (id && id !== selectedClass.value && classes.value.some((c) => c.id === id)) {
      selectedClass.value = id
      loadLeaderboard()
    }
  }
)
</script>

<template>
  <div class="min-h-full bg-gray-100">
    <header class="bg-gradient-to-r from-amber-400 to-orange-400 text-white px-4 py-4 shadow">
      <h1 class="text-xl font-bold">🐾 宠物花园 · 排行榜</h1>
      <p class="text-sm opacity-90 mt-1">选择班级，查看孩子们的成长积分</p>
    </header>

    <div class="px-3 pt-3">
      <ClassSwitcher :classes="classes" :model-value="selectedClass" @select="onSelect" />
    </div>

    <main class="p-3 space-y-2">
      <p v-if="loading" class="text-center text-gray-400 py-8">加载中…</p>
      <p v-else-if="students.length === 0" class="text-center text-gray-400 py-8">该班级暂无学生</p>
      <router-link
        v-for="s in students"
        :key="s.studentId"
        :to="`/student/${s.studentId}`"
        class="flex items-center bg-white rounded-2xl shadow-sm px-4 py-3 active:scale-[0.99] transition"
      >
        <div class="w-8 text-center font-bold text-gray-400">{{ s.rank }}</div>
        <div
          class="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center text-2xl mr-3"
        >
          {{ s.pet_type ? '🐾' : '👤' }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold truncate">{{ s.name }}</div>
          <div class="text-xs text-gray-400">等级 {{ s.pet_level }} · 积分 {{ s.total_points }}</div>
        </div>
        <div class="text-amber-500 font-bold">{{ s.total_points }}</div>
      </router-link>
    </main>
  </div>
</template>
