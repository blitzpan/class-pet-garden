<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ classId: string; className: string; code: string; link: string }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'updated', code: string): void }>()

const { api } = useAuth()
const toast = useToast()
const currentCode = ref(props.code)
const busy = ref(false)

async function copyCode() {
  const lines = [
    `邀请你加入「${props.className}」，和我一起进步吧。`,
    `点击链接加入，输入邀请码 ${props.code} 加入。`,
  ]
  if (props.link) lines.push(props.link)
  const text = lines.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    toast.success(props.link ? '邀请信息已复制' : '邀请信息已复制（未配置家长端域名，链接缺失）')
  } catch {
    toast.error('复制失败，请手动复制')
  }
}

async function regenerate() {
  if (busy.value) return
  busy.value = true
  try {
    const res = await api.put<{ inviteCode: string }>(`/classes/${props.classId}/invite-code`)
    currentCode.value = res.data.inviteCode
    emit('updated', currentCode.value)
    toast.success('邀请码已重新生成')
  } catch (e: any) {
    toast.error(e?.response?.data?.error || '重新生成失败')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" @click.self="emit('close')">
    <div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
      <p class="text-sm font-bold tracking-wider text-orange-600">INVITE</p>
      <h2 class="mt-1 font-serif text-2xl font-bold">邀请家长加入</h2>
      <p class="mt-2 text-sm text-[#806b5b]">
        把邀请码发给「{{ className }}」的家长，家长在家长端选择本团队并输入邀请码即可加入。
      </p>

      <div class="mt-5 flex items-center justify-center gap-3 rounded-2xl bg-[#fff8f2] py-5">
        <span class="text-3xl font-bold tracking-[0.5em] text-gradient">{{ currentCode }}</span>
      </div>

      <div class="mt-4 flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-700"
          @click="copyCode"
        >
          复制邀请信息
        </button>
        <button
          type="button"
          class="flex-1 rounded-xl border border-[#f0e5da] px-4 py-2.5 text-sm font-semibold text-[#765f50] transition hover:bg-[#fff7f1] disabled:opacity-50"
          :disabled="busy"
          @click="regenerate"
        >
          {{ busy ? '生成中…' : '重新生成' }}
        </button>
      </div>

      <p class="mt-3 text-xs leading-relaxed text-[#a1836d]">
        重新生成后，旧邀请码立即失效，已加入的家长不受影响。
      </p>

      <div class="mt-5 flex justify-end">
        <button type="button" class="px-4 py-2 text-sm" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>
