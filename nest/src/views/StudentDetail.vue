<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
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
const records = ref<EvalRecord[]>([])
const levelConfig = ref<number[]>([40, 60, 80, 100, 120, 140, 160])
const rules = ref<Rule[]>([])
const loading = ref(true)
const error = ref('')

const showAuth = ref(false)
const showAdopt = ref(false)
const showChangePwd = ref(false)

const sameStudent = computed(() => auth.isLoggedIn && auth.studentId === studentId)
const otherLogin = computed(() => auth.isLoggedIn && auth.studentId !== studentId)

const progress = computed(() => {
  if (!student.value) return { level: 1, current: 0, required: 0, pct: 0, isMax: false }
  const exp = student.value.pet_exp
  const cfg = levelConfig.value
  let level = 1
  let prev = 0
  for (let i = 0; i < cfg.length; i++) {
    if (exp >= prev + cfg[i]) {
      level++
      prev += cfg[i]
    } else break
  }
  const required = cfg[level - 1] || 0
  const current = exp - prev
  const isMax = level >= 8
  return {
    level,
    current,
    required,
    pct: isMax ? 100 : Math.min(100, (current / required) * 100),
    isMax,
  }
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const d = await getStudentShare(studentId)
    student.value = d.student
    hasPet.value = d.hasPet
    records.value = d.records
    if (Array.isArray(d.levelConfig) && d.levelConfig.length) levelConfig.value = d.levelConfig
    if (auth.isLoggedIn) rules.value = await getRules()
  } catch (e: any) {
    error.value = e?.response?.data?.error || '加载失败'
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

onMounted(load)
</script>

<template>
  <div class="min-h-full bg-gray-100">
    <header class="bg-gradient-to-r from-amber-400 to-orange-400 text-white px-4 py-4 shadow flex items-center">
      <router-link to="/" class="mr-3 text-2xl leading-none text-white/90">‹</router-link>
      <div class="flex-1 min-w-0">
        <h1 class="text-lg font-bold truncate">{{ student?.name || '学生' }} 的宠物</h1>
        <p class="text-xs opacity-90">{{ student?.class_name }}</p>
      </div>
      <button
        v-if="!auth.isLoggedIn"
        @click="showAuth = true"
        class="bg-white/20 rounded-full px-3 py-1.5 text-sm"
      >
        家长登录
      </button>
      <button
        v-else-if="sameStudent"
        @click="auth.logout()"
        class="bg-white/20 rounded-full px-3 py-1.5 text-sm"
      >
        登出
      </button>
    </header>

    <p v-if="loading && !student" class="text-center text-gray-400 py-10">加载中…</p>

    <main v-else-if="student" class="p-3 space-y-3">
      <div
        v-if="otherLogin"
        class="bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm rounded-xl px-3 py-2"
      >
        当前登录的是另一名学生的家长账号，请先
        <button @click="auth.logout()" class="underline ml-1">登出</button>
        再操作本页。
      </div>

      <!-- 学生信息 -->
      <section class="bg-white rounded-2xl shadow-sm p-4">
        <div class="flex items-center">
          <div class="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-3xl mr-3">
            👤
          </div>
          <div class="min-w-0">
            <div class="font-bold text-lg">{{ student.name }}</div>
            <div class="text-xs text-gray-400">
              学号 {{ student.student_no || '—' }} · 总积分 {{ student.total_points }}
            </div>
          </div>
        </div>
      </section>

      <!-- 宠物 -->
      <section class="bg-white rounded-2xl shadow-sm p-4">
        <template v-if="hasPet">
          <div class="flex items-center">
            <div
              class="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center text-4xl mr-3"
            >
              🐾
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-semibold">宠物（Lv.{{ progress.level }}）</div>
              <div class="text-xs text-gray-400">成长值 {{ student.pet_exp }}</div>
            </div>
          </div>
          <div class="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full bg-orange-400" :style="{ width: progress.pct + '%' }"></div>
          </div>
          <div class="text-[11px] text-gray-400 mt-1">
            {{ progress.isMax ? '已满级' : `距离下一级还需 ${progress.required - progress.current} 成长值` }}
          </div>
        </template>
        <template v-else>
          <div class="text-center py-4">
            <div class="text-4xl mb-2">🥚</div>
            <p class="text-gray-500 text-sm">还没有领养宠物</p>
            <button
              v-if="sameStudent"
              @click="showAdopt = true"
              class="mt-3 bg-orange-500 text-white rounded-xl px-5 py-2 text-sm font-semibold"
            >
              领取宠物
            </button>
            <p v-else class="text-xs text-gray-400 mt-2">家长登录后可领取</p>
          </div>
        </template>
      </section>

      <!-- 家长操作区 -->
      <section v-if="sameStudent" class="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <ScorePanel v-if="rules.length" :rules="rules" @scored="load" />
        <button @click="showChangePwd = true" class="text-sm text-gray-500 underline">
          修改密码
        </button>
      </section>

      <!-- 记录 -->
      <section class="bg-white rounded-2xl shadow-sm p-4">
        <h4 class="font-semibold text-gray-700 mb-2">最近记录</h4>
        <p v-if="records.length === 0" class="text-sm text-gray-400">暂无记录</p>
        <ul class="space-y-1">
          <li v-for="r in records" :key="r.id" class="flex items-center text-sm">
            <span
              :class="[
                'w-10 text-right font-semibold mr-2',
                r.points >= 0 ? 'text-green-600' : 'text-red-500',
              ]"
            >
              {{ r.points >= 0 ? '+' : '' }}{{ r.points }}
            </span>
            <span class="flex-1 truncate">{{ r.reason }}</span>
            <span class="text-[11px] text-gray-300">{{ new Date(r.timestamp).toLocaleDateString() }}</span>
          </li>
        </ul>
      </section>
    </main>

    <p v-else class="text-center text-red-400 py-10">{{ error }}</p>

    <AuthModal
      v-if="showAuth"
      :student-id="studentId"
      @success="onAuthSuccess"
      @close="showAuth = false"
    />
    <AdoptModal v-if="showAdopt" @done="onAdoptDone" @close="showAdopt = false" />
    <ChangePasswordModal v-if="showChangePwd" @done="showChangePwd = false" @close="showChangePwd = false" />
  </div>
</template>
