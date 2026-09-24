<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '@/composables/useAuth'

const PASSWORD_MIN_LEN = 6
const PASSWORD_MAX_LEN = 64

const emit = defineEmits<{ (e: 'close'): void; (e: 'success'): void }>()

const { api } = useAuth()

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = ''

  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    error.value = '请填写完整'
    return
  }
  if (newPassword.value.length < PASSWORD_MIN_LEN || newPassword.value.length > PASSWORD_MAX_LEN) {
    error.value = `新密码长度须为 ${PASSWORD_MIN_LEN}-${PASSWORD_MAX_LEN} 位`
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的新密码不一致'
    return
  }

  submitting.value = true
  try {
    await api.post('/auth/change-password', {
      oldPassword: oldPassword.value,
      newPassword: newPassword.value
    })
    emit('success')
  } catch (err: any) {
    error.value = err?.response?.data?.error || '修改失败，请重试'
  } finally {
    submitting.value = false
  }
}

function close() {
  if (submitting.value) return
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/30 p-4" @click.self="close">
    <div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-bold tracking-[0.16em] text-[#d78248]">PASSWORD</p>
          <h2 class="mt-1 font-serif text-2xl font-bold text-[#422d20]">修改密码</h2>
        </div>
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100" aria-label="关闭" @click="close">
          <span class="material-symbols-rounded text-[20px]">close</span>
        </button>
      </div>

      <p class="mt-4 text-sm text-[#9a735d]">修改后请使用新密码登录，当前登录状态保持有效。</p>

      <div class="mt-4 space-y-3">
        <input
          v-model="oldPassword"
          type="password"
          :maxlength="PASSWORD_MAX_LEN"
          autocomplete="current-password"
          placeholder="原密码"
          class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-400"
          @keyup.enter="submit"
        />
        <input
          v-model="newPassword"
          type="password"
          :maxlength="PASSWORD_MAX_LEN"
          autocomplete="new-password"
          :placeholder="`新密码（至少 ${PASSWORD_MIN_LEN} 位）`"
          class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-400"
          @keyup.enter="submit"
        />
        <input
          v-model="confirmPassword"
          type="password"
          :maxlength="PASSWORD_MAX_LEN"
          autocomplete="new-password"
          placeholder="确认新密码"
          class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-400"
          @keyup.enter="submit"
        />
      </div>

      <p v-if="error" class="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{{ error }}</p>

      <div class="mt-5 flex items-center justify-end gap-2 border-t border-[#f3f0ec] pt-4">
        <button type="button" class="px-4 py-2 text-sm" :disabled="submitting" @click="close">取消</button>
        <button type="button" class="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60" :disabled="submitting" @click="submit">
          {{ submitting ? '提交中…' : '确认修改' }}
        </button>
      </div>
    </div>
  </div>
</template>
