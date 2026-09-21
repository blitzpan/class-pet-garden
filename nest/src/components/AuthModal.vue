<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getCaptcha, login as apiLogin, setupPassword } from '@/api/parent'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ studentId: string }>()
const emit = defineEmits<{ (e: 'success'): void; (e: 'close'): void }>()
const auth = useAuthStore()

const mode = ref<'login' | 'setup'>('login')
const password = ref('')
const captcha = ref<{ token: string; a: number; b: number } | null>(null)
const captchaAnswer = ref<string>('')
const error = ref('')
const busy = ref(false)

async function loadCaptcha() {
  captcha.value = await getCaptcha()
  captchaAnswer.value = ''
}
onMounted(loadCaptcha)

async function submit() {
  error.value = ''
  if (!password.value) {
    error.value = '请输入密码'
    return
  }
  busy.value = true
  try {
    if (mode.value === 'setup') {
      if (!captchaAnswer.value) {
        error.value = '请完成验证码'
        return
      }
      if (!captcha.value) {
        error.value = '验证码加载失败'
        return
      }
      await auth.setup(props.studentId, password.value, captcha.value.token, captchaAnswer.value)
      emit('success')
    } else {
      await auth.login(props.studentId, password.value)
      emit('success')
    }
  } catch (e: any) {
    const d = e?.response?.data
    if (mode.value === 'login' && d?.code === 'NO_PASSWORD_SET') {
      mode.value = 'setup'
      await loadCaptcha()
      error.value = '该学生尚未设置家长密码，请先设置（完成验证码）'
    } else {
      error.value = d?.error || '操作失败'
    }
  } finally {
    busy.value = false
  }
}

function switchMode() {
  mode.value = mode.value === 'login' ? 'setup' : 'login'
  error.value = ''
  if (mode.value === 'setup') loadCaptcha()
}
</script>

<template>
  <div
    class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
    @click.self="emit('close')"
  >
    <div class="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5">
      <h3 class="text-lg font-bold mb-1">{{ mode === 'login' ? '家长登录' : '首次设置家长密码' }}</h3>
      <p class="text-xs text-gray-400 mb-3">仅有一个密码，无账号。忘记密码请联系管理员重置。</p>

      <label class="text-sm text-gray-600">密码</label>
      <input
        v-model="password"
        type="password"
        class="w-full border rounded-xl px-3 py-2 mt-1 mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
        placeholder="请输入密码（至少 4 位）"
      />

      <template v-if="mode === 'setup' && captcha">
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
        @click="submit"
        :disabled="busy"
        class="w-full bg-orange-500 text-white rounded-xl py-2.5 font-semibold disabled:opacity-50"
      >
        {{ busy ? '处理中…' : mode === 'login' ? '登录' : '设置密码并登录' }}
      </button>
      <button @click="switchMode" class="w-full text-center text-sm text-gray-500 mt-3">
        {{ mode === 'login' ? '还没有密码？点此设置' : '已有密码？返回登录' }}
      </button>
      <button @click="emit('close')" class="w-full text-center text-sm text-gray-400 mt-1">取消</button>
    </div>
  </div>
</template>
