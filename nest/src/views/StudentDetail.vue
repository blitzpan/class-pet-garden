<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { calculateLevel, getLevelProgress, getPetType, getPetLevelImage } from '@/data/pets'
import { getStudentShare, getRules } from '@/api/public'
import type { StudentDetail as SD, EvalRecord, Rule } from '@/types'
import { useAuthStore } from '@/stores/auth'
import AuthModal from '@/components/AuthModal.vue'
import AdoptModal from '@/components/AdoptModal.vue'
import ScorePanel from '@/components/ScorePanel.vue'
import ChangePasswordModal from '@/components/ChangePasswordModal.vue'

const route = useRoute()
const studentId = route.params.studentId as string
const auth = useAuthStore()

const student = ref<SD | null>(null)
const hasPet = ref(false)
const hasParentPassword = ref(false)
const records = ref<EvalRecord[]>([])
const rules = ref<Rule[]>([])
const classId = ref<string>('')
const loading = ref(true)
const notFound = ref(false)

const showAuth = ref(false)
const showAdopt = ref(false)
const adoptMode = ref<'adopt' | 'change'>('adopt')
const showChangePwd = ref(false)

const sameStudent = computed(() => auth.isLoggedIn && auth.studentId === studentId)
const otherLogin = computed(() => auth.isLoggedIn && auth.studentId !== studentId)

const displayLevel = computed(() => (student.value ? calculateLevel(student.value.pet_exp) : 1))
const levelProgress = computed(() => (student.value ? getLevelProgress(student.value.pet_exp) : getLevelProgress(0)))
const petImage = computed(() => {
  if (!student.value?.pet_type) return ''
  return getPetLevelImage(student.value.pet_type, student.value.pet_level)
})

// 成长记录：取「有打卡记录的最后的 7 天」（按天倒序，不要求连续）
const displayRecords = computed<EvalRecord[]>(() => {
  const days = new Set<string>()
  const result: EvalRecord[] = []
  for (const r of records.value) {
    const d = new Date(r.timestamp)
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    if (!days.has(key)) {
      if (days.size >= 7) break
      days.add(key)
    }
    result.push(r)
  }
  return result
})

const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function showToast(msg: string) {
  toastMsg.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastMsg.value = ''), 2000)
}

const shareUrl = computed(() => window.location.href)
async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    showToast('分享链接已复制')
  } catch {
    showToast('复制失败，请手动复制地址栏链接')
  }
}

async function load() {
  loading.value = true
  try {
    const d = await getStudentShare(studentId)
    student.value = d.student
    classId.value = d.student.class_id || ''
    hasPet.value = d.hasPet
    hasParentPassword.value = d.hasParentPassword
    records.value = d.records
    if (auth.isLoggedIn) rules.value = await getRules(classId.value)
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }
}

function onAuthSuccess() {
  showAuth.value = false
  load()
}
function onAdoptDone() {
  showAdopt.value = false
  load()
}

function formatRecordTime(timestamp?: number) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return isToday ? `今天 ${time}` : date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-[#fffaf5] font-sans text-[#38281f]">
    <div class="mx-auto max-w-2xl px-4 pt-6 pb-24 sm:px-6 sm:pt-10 sm:pb-24">
      <div v-if="loading" class="rounded-3xl bg-white px-6 py-16 text-center text-sm text-[#9a735d] shadow-sm">加载中…</div>

      <div v-else-if="notFound || !student" class="rounded-3xl bg-white px-6 py-16 text-center shadow-sm">
        <span class="material-symbols-rounded text-[48px] text-[#e8c9ae]">pets</span>
        <p class="mt-4 text-lg font-bold text-[#422d20]">成长记录不存在</p>
        <p class="mt-2 text-sm text-[#9a735d]">链接可能已失效，请联系老师获取最新分享链接。</p>
        <router-link to="/" class="mt-6 inline-flex text-sm font-semibold text-orange-600 hover:text-orange-700">返回排行榜</router-link>
      </div>

      <template v-else>
        <section class="overflow-hidden rounded-3xl bg-white shadow-[0_12px_40px_rgba(101,71,45,0.08)]">
          <div class="bg-orange-600 px-6 pb-4 pt-5 text-white">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h1 class="font-serif text-3xl font-bold">{{ student.name }}</h1>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  class="inline-flex h-9 items-center gap-1 rounded-full bg-white/10 px-3 text-sm font-semibold text-white transition hover:bg-white/20"
                  @click="copyShareLink"
                >
                  <span class="material-symbols-rounded text-[18px]">share</span>
                  <span class="hidden sm:inline">复制链接</span>
                </button>
                <button
                  v-if="!auth.isLoggedIn"
                  type="button"
                  class="inline-flex h-9 items-center gap-1 rounded-full bg-white/25 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-white/35"
                  @click="showAuth = true"
                >
                  <span class="material-symbols-rounded text-[18px]">login</span>
                  <span>家长登录</span>
                </button>
                <template v-else>
                  <button
                    type="button"
                    class="inline-flex h-9 items-center gap-1 rounded-full bg-white/15 px-3 text-sm font-semibold text-white transition hover:bg-white/25"
                    @click="showChangePwd = true"
                  >
                    <span class="material-symbols-rounded text-[18px]">lock</span>
                    <span class="hidden sm:inline">修改密码</span>
                  </button>
                  <button
                    type="button"
                    class="inline-flex h-9 items-center gap-1 rounded-full bg-white/15 px-3 text-sm font-semibold text-white transition hover:bg-white/25"
                    @click="auth.logout()"
                  >
                    <span class="material-symbols-rounded text-[18px]">logout</span>
                    <span>登出</span>
                  </button>
                </template>
              </div>
            </div>

            <div class="mt-4 flex gap-4">
              <div class="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/20 sm:h-28 sm:w-28">
                <img v-if="student.pet_type" :src="petImage" :alt="getPetType(student.pet_type)?.name" class="h-full w-full rounded-2xl object-contain" />
                <span v-else class="text-4xl">?</span>
              </div>
              <div class="min-w-0 flex-1 pt-1">
                <div class="mb-1 flex items-center justify-between text-xs text-orange-100">
                  <span>成长进度</span>
                  <span>Lv.{{ displayLevel }} · {{ levelProgress.current }}/{{ levelProgress.required }}</span>
                </div>
                <div class="h-2.5 overflow-hidden rounded-full bg-white/30">
                  <div class="h-full rounded-full bg-white" :style="{ width: `${levelProgress.percentage}%` }" />
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-2 text-sm text-orange-100">
                  <template v-if="student.pet_type">
                    <span>{{ getPetType(student.pet_type)?.name }}</span>
                    <button
                      v-if="sameStudent"
                      type="button"
                      class="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/30"
                      @click="adoptMode = 'change'; showAdopt = true"
                    >
                      更换宠物
                    </button>
                  </template>
                  <button
                    v-else-if="sameStudent"
                    type="button"
                    class="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold text-white transition hover:bg-white/30"
                    @click="adoptMode = 'adopt'; showAdopt = true"
                  >
                    领养宠物
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="p-6">
            <div v-if="otherLogin" class="mb-4 rounded-xl bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
              当前登录的是另一名学生的家长账号，请先
              <button type="button" class="underline ml-1" @click="auth.logout()">登出</button>
              再操作本页。
            </div>

            <!-- 家长操作区（快速评价，类比教师端） -->
            <section v-if="sameStudent" class="mb-5 rounded-2xl border border-[#f1e5db] bg-[#fffdf9] p-4 shadow-[0_10px_30px_rgba(101,71,45,0.04)]">
              <div class="flex items-center justify-between">
                <h2 class="font-serif text-xl font-bold text-[#422d20]">快速评价</h2>
                <span class="text-sm text-[#9a735d]">{{ rules.length }} 条规则</span>
              </div>
              <ScorePanel v-if="rules.length" :rules="rules" @scored="load" />
              <p v-else class="text-sm text-[#9a735d]">该班级暂无可用的评价规则。</p>
            </section>

            <!-- 成长记录 -->
            <div class="flex items-center justify-between">
              <h2 class="font-serif text-xl font-bold text-[#422d20]">成长记录</h2>
              <span class="text-sm text-[#9a735d]">近 7 个打卡日 · 共 {{ displayRecords.length }} 条</span>
            </div>

            <div v-if="displayRecords.length" class="mt-4 space-y-2">
              <article
                v-for="record in displayRecords"
                :key="record.id"
                class="flex items-center justify-between rounded-xl bg-[#fff8f2] px-4 py-3"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-[#4d3527]">{{ record.reason }}</p>
                  <p class="mt-1 text-sm text-[#b0927c]">{{ record.category }} · {{ formatRecordTime(record.timestamp) }}</p>
                </div>
                <span
                  class="ml-3 shrink-0 text-sm font-bold tabular-nums"
                  :class="record.points > 0 ? 'text-emerald-600' : record.points < 0 ? 'text-rose-600' : 'text-slate-500'"
                >
                  {{ record.points > 0 ? '+' : '' }}{{ record.points }}
                </span>
              </article>
            </div>
            <p v-else class="mt-6 rounded-2xl bg-[#fff8f2] px-4 py-10 text-center text-sm text-[#9a735d]">还没有成长记录，继续加油！</p>

            <router-link to="/" class="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-orange-700">
              <span class="material-symbols-rounded text-[18px]">arrow_back</span>返回排行榜
            </router-link>
          </div>
        </section>

        <p class="mt-6 text-center text-sm text-[#9a735d]">每一次进步都在被看见。</p>
      </template>
    </div>

    <Transition>
      <div v-if="toastMsg" class="fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4">
        <div class="rounded-full bg-[#38281f] px-4 py-2 text-sm font-medium text-white shadow-lg">{{ toastMsg }}</div>
      </div>
    </Transition>

    <AuthModal v-if="showAuth" :student-id="studentId" :has-parent-password="hasParentPassword" @success="onAuthSuccess" @close="showAuth = false" />
    <AdoptModal v-if="showAdopt" :mode="adoptMode" @done="onAdoptDone" @close="showAdopt = false" />
    <ChangePasswordModal v-if="showChangePwd" @done="showChangePwd = false" @close="showChangePwd = false" />
  </div>
</template>
