<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import RankListRow from '@/components/ranking/RankListRow.vue'
import RankPodium from '@/components/ranking/RankPodium.vue'
import JoinTeamModal from '@/components/JoinTeamModal.vue'
import { getClasses, getLeaderboard } from '@/api/public'
import { useAuthStore } from '@/stores/auth'
import type { RankingStudent } from '@/utils/ranking'
import type { ClassItem } from '@/types'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const classes = ref<ClassItem[]>([])
const currentClass = ref<ClassItem | null>(null)
const ranking = ref<RankingStudent[]>([])
const loading = ref(true)

const CLASS_STORAGE_KEY = 'nest_current_class'

function persistClass(id: string) {
  localStorage.setItem(CLASS_STORAGE_KEY, id)
}

async function selectClass(cls: ClassItem) {
  currentClass.value = cls
  persistClass(cls.id)
  await loadRanking()
}

async function loadRanking() {
  if (!currentClass.value) {
    ranking.value = []
    return
  }
  loading.value = true
  try {
    const students = await getLeaderboard(currentClass.value.id)
    ranking.value = students.map(s => ({
      id: s.studentId,
      name: s.name,
      student_no: s.student_no,
      total_points: s.total_points,
      pet_type: s.pet_type,
      pet_level: s.pet_level,
    }))
  } catch {
    ranking.value = []
  } finally {
    loading.value = false
  }
}

function openStudent(student: RankingStudent) {
  router.push({ name: 'student', params: { studentId: student.id } })
}

// 加入团队：打开弹窗，基于当前选中的班级加入
const showJoinModal = ref(false)

function joinTeam() {
  if (!currentClass.value) return
  showJoinModal.value = true
}

function onJoined(payload: { token: string; studentId: string }) {
  auth.apply(payload.token, payload.studentId)
  showJoinModal.value = false
  router.push({ name: 'student', params: { studentId: payload.studentId } })
}

onMounted(async () => {
  loading.value = true
  try {
    classes.value = await getClasses()
    if (!classes.value.length) {
      loading.value = false
      return
    }
    // 邀请链接带 classId 时，优先预选对应班级（仍需家长手动点“加入”并输入邀请码）
    const urlClassId = typeof route.query.classId === 'string' ? route.query.classId : ''
    const urlClass = urlClassId ? classes.value.find(c => c.id === urlClassId) : null
    const savedId = localStorage.getItem(CLASS_STORAGE_KEY)
    const saved = savedId ? classes.value.find(c => c.id === savedId) : null
    await selectClass(urlClass || saved || classes.value[0])
  } catch {
    loading.value = false
  }
})
</script>

<template>
  <AppShell active-page="leaderboard" title="排行榜" eyebrow="LEADERBOARD">
    <div class="mx-auto w-full max-w-2xl">
      <main>
        <section class="overflow-hidden rounded-[1.75rem] bg-white shadow-[0_16px_40px_-16px_rgba(120,80,40,0.18)] ring-1 ring-[#f1e7db]">
          <!-- 团队切换 -->
          <div class="flex items-center gap-2 border-b border-[#f5ece1] bg-gradient-to-r from-[#fffaf4] to-[#fff5ec] px-4 py-3 sm:px-5">
            <span class="flex shrink-0 items-center gap-1.5">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#ffeccf]">
                <span class="material-symbols-rounded text-[18px] text-[#f59e0b]">groups</span>
              </span>
              <span class="text-sm font-bold text-[#8a5a33]">团队</span>
            </span>
            <div class="relative min-w-0 flex-1">
              <select
                class="w-full appearance-none rounded-xl border border-[#ecdccb] bg-white py-2.5 pl-3 pr-9 text-sm font-semibold text-[#3d2c1f] outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                :value="currentClass?.id"
                @change="selectClass(classes.find(cls => cls.id === ($event.target as HTMLSelectElement).value)!)"
              >
                <option v-for="cls in classes" :key="cls.id" :value="cls.id">{{ cls.name }}</option>
              </select>
              <span class="pointer-events-none absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-[#b08968]">
                <span class="material-symbols-rounded text-[20px] leading-none">expand_more</span>
              </span>
            </div>
            <button
              type="button"
              class="h-10 shrink-0 rounded-xl border border-[#ffd9b8] bg-[#fff3e8] px-4 text-sm font-semibold text-[#d9540d] transition hover:bg-[#ffe6d2] active:scale-[0.98]"
              @click="joinTeam"
            >
              加入
            </button>
          </div>

          <div class="p-4 sm:p-5">
            <div v-if="!classes.length" class="rounded-2xl bg-[#fff8f2] px-5 py-14 text-center">
              <p class="text-sm font-medium text-[#9a735d]">还没有团队，无法查看排行榜</p>
            </div>

            <div v-else-if="loading" class="rounded-2xl bg-[#fff8f2] px-5 py-14 text-center text-sm text-[#a1836d]">加载中…</div>

            <template v-else-if="!ranking.length">
              <div class="rounded-2xl bg-[#fff8f2] px-5 py-14 text-center">
                <span class="material-symbols-rounded text-[40px] text-[#e8c9ae]">emoji_events</span>
                <p class="mt-3 text-sm font-medium text-[#9a735d]">团队还没有成员，榜单空空如也</p>
              </div>
            </template>

            <template v-else>
              <!-- 前三甲 -->
              <div class="rounded-[1.5rem] bg-gradient-to-b from-[#fff8f1] to-[#fff3e9] p-4 ring-1 ring-[#f6e7d8] sm:p-6">
                <div class="mb-4 flex items-center gap-2">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#ffeccf]">
                    <span class="material-symbols-rounded text-[18px] text-[#f59e0b]">emoji_events</span>
                  </span>
                  <h3 class="text-base font-extrabold tracking-tight text-[#2d2118]">前三甲</h3>
                  <span class="ml-1 rounded-full bg-amber-100/70 px-2 py-0.5 text-xs font-bold text-amber-600">TOP 3</span>
                </div>
                <RankPodium :students="ranking" @select="openStudent" />
              </div>

              <!-- 总榜 -->
              <div class="mt-5 overflow-hidden rounded-2xl border border-[#f1e7db] bg-white">
                <div class="flex items-center gap-2 border-b border-[#f3ece4] px-4 py-3">
                  <span class="material-symbols-rounded text-[20px] leading-none text-[#c9a06b]">format_list_numbered</span>
                  <h3 class="text-base font-extrabold tracking-tight text-[#2d2118]">总榜</h3>
                  <span class="ml-auto rounded-full bg-[#f7efe6] px-2.5 py-0.5 text-xs font-bold text-[#a07c55]">{{ ranking.slice(3).length }} 人</span>
                </div>
                <div class="flex flex-col gap-0.5 p-2">
                  <RankListRow
                    v-for="(student, index) in ranking.slice(3)"
                    :key="student.id"
                    :student="student"
                    :index="index + 3"
                    @select="openStudent"
                  />
                </div>
              </div>
            </template>
          </div>
        </section>
      </main>
    </div>

    <JoinTeamModal
      v-if="showJoinModal && currentClass"
      :class-id="currentClass.id"
      :class-name="currentClass.name"
      @success="onJoined"
      @close="showJoinModal = false"
    />
  </AppShell>
</template>
