<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const emit = defineEmits<{ (e: 'done'): void; (e: 'close'): void }>()
const auth = useAuthStore()
const oldP = ref('')
const newP = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  if (!oldP.value || !newP.value) {
    error.value = '请填写完整'
    return
  }
  busy.value = true
  try {
    await auth.changePassword(oldP.value, newP.value)
    emit('done')
  } catch (e: any) {
    error.value = e?.response?.data?.error || '修改失败'
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
      <h3 class="text-lg font-bold mb-3">修改密码</h3>
      <input
        v-model="oldP"
        type="password"
        placeholder="原密码"
        class="w-full border rounded-xl px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      <input
        v-model="newP"
        type="password"
        placeholder="新密码（至少 4 位）"
        class="w-full border rounded-xl px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      <p v-if="error" class="text-sm text-red-500 mb-2">{{ error }}</p>
      <button
        @click="submit"
        :disabled="busy"
        class="w-full bg-orange-500 text-white rounded-xl py-2.5 font-semibold disabled:opacity-50"
      >
        确认修改
      </button>
      <button @click="emit('close')" class="w-full text-center text-sm text-gray-400 mt-2">取消</button>
    </div>
  </div>
</template>
