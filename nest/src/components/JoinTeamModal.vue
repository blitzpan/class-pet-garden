<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getCaptcha, join } from '@/api/parent'
import { useAuthStore } from '@/stores/auth'
import {
  isValidChildName,
  isValidPassword,
  NAME_MAX_LEN,
  PASSWORD_MAX_LEN,
  PASSWORD_MIN_LEN,
} from '@/utils/sanitize'

const props = defineProps<{ classId: string; className: string }>()
const emit = defineEmits<{
  (e: 'success', payload: { token: string; studentId: string }): void
  (e: 'close'): void
}>()

const auth = useAuthStore()

type Step = 'form' | 'confirm'
const step = ref<Step>('form')

const childName = ref('')
const inviteCode = ref('')
const password = ref('')
const confirmPassword = ref('')
const captcha = ref<{ token: string; a: number; b: number } | null>(null)
const captchaAnswer = ref('')
const error = ref('')
const busy = ref(false)

async function loadCaptcha() {
  captcha.value = await getCaptcha()
  captchaAnswer.value = ''
}

onMounted(loadCaptcha)

function onlyDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 6)
}

function goConfirm() {
  error.value = ''
  // 姓名不过滤按键（会打断输入法组词），改为提交时校验
  if (!isValidChildName(childName.value)) {
    error.value = `请输入孩子姓名，1-${NAME_MAX_LEN} 个中文字符`
    return
  }
  if (inviteCode.value.length !== 6) {
    error.value = '请输入 6 位邀请码'
    return
  }
  if (!isValidPassword(password.value)) {
    error.value = `家长密码需 ${PASSWORD_MIN_LEN}-${PASSWORD_MAX_LEN} 位`
    return
  }
  if (confirmPassword.value !== password.value) {
    error.value = '两次输入的家长密码不一致'
    return
  }
  step.value = 'confirm'
}

async function confirmJoin() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const r = await join({
      classId: props.classId,
      name: childName.value.trim(),
      inviteCode: inviteCode.value,
      password: password.value,
      captchaToken: captcha.value?.token || '',
      captchaAnswer: captchaAnswer.value,
    })
    emit('success', { token: r.token, studentId: r.studentId })
  } catch (e: any) {
    const d = e?.response?.data
    if (d?.code === 'ALREADY_JOINED') {
      error.value = '该学生已加入，请直接登录孩子账号。'
    } else {
      error.value = d?.error || '加入失败，请重试'
    }
    // 校验失败（含验证码），回到表单重新填写
    await loadCaptcha()
    step.value = 'form'
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
      <!-- 步骤一：填写信息 -->
      <template v-if="step === 'form'">
        <h3 class="text-lg font-bold mb-1">加入「{{ className }}」</h3>
        <p class="mb-3 rounded-xl bg-orange-50 px-3 py-2 text-xs leading-relaxed text-orange-700">
          填写孩子姓名与老师提供的 6 位邀请码，并设置您的家长密码。
        </p>

        <label class="text-sm text-gray-600">孩子姓名（中文，最多 {{ NAME_MAX_LEN }} 个字）</label>
        <input
          v-model="childName"
          type="text"
          :maxlength="NAME_MAX_LEN"
          class="w-full border rounded-xl px-3 py-2 mt-1 mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="请输入孩子姓名"
        />

        <label class="text-sm text-gray-600">邀请码（6 位数字）</label>
        <input
          :value="inviteCode"
          @input="inviteCode = onlyDigits(($event.target as HTMLInputElement).value)"
          inputmode="numeric"
          maxlength="6"
          class="w-full border rounded-xl px-3 py-2 mt-1 mb-3 tracking-[0.4em] text-center text-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="······"
        />

        <label class="text-sm text-gray-600">家长密码</label>
        <input
          v-model="password"
          type="password"
          :maxlength="PASSWORD_MAX_LEN"
          class="w-full border rounded-xl px-3 py-2 mt-1 mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="4-20 位，用于登录孩子账号"
        />

        <label class="text-sm text-gray-600">确认家长密码</label>
        <input
          v-model="confirmPassword"
          type="password"
          :maxlength="PASSWORD_MAX_LEN"
          class="w-full border rounded-xl px-3 py-2 mt-1 mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="请再次输入家长密码"
        />

        <template v-if="captcha">
          <label class="text-sm text-gray-600">验证码：{{ captcha.a }} × {{ captcha.b }} = ?</label>
          <input
            v-model="captchaAnswer"
            inputmode="numeric"
            class="w-full border rounded-xl px-3 py-2 mt-1 mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="请计算结果"
          />
        </template>

        <p v-if="error" class="text-sm text-red-500 mb-2">{{ error }}</p>

        <button
          @click="goConfirm"
          class="w-full bg-orange-500 text-white rounded-xl py-2.5 font-semibold hover:bg-orange-600"
        >
          下一步
        </button>
        <button class="w-full text-center text-sm mt-3 text-gray-400" @click="emit('close')">
          取消
        </button>
      </template>

      <!-- 步骤二：二次提醒 -->
      <template v-else>
        <span class="material-symbols-rounded text-[40px] leading-none text-orange-400">help</span>
        <h3 class="text-lg font-bold mt-2 mb-1">确认加入「{{ className }}」？</h3>
        <p class="text-sm text-gray-600 leading-relaxed mb-4">
          请牢记您设置的家长密码，之后需用此密码登录孩子账号，查看成长与加减分。
        </p>

        <p v-if="error" class="text-sm text-red-500 mb-2">{{ error }}</p>

        <button
          @click="confirmJoin"
          :disabled="busy"
          class="w-full bg-orange-500 text-white rounded-xl py-2.5 font-semibold disabled:opacity-50 hover:bg-orange-600"
        >
          {{ busy ? '加入中…' : '确认加入' }}
        </button>
        <button
          class="w-full text-center text-sm mt-3 text-gray-400"
          :disabled="busy"
          @click="step = 'form'"
        >
          返回修改
        </button>
      </template>
    </div>
  </div>
</template>
