<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getLeaderboard, getStudentShare } from '@/api/public'
import { calculateLevel, getLevelProgress, getPetLevelImage, getPetType } from '@/data/pets'
import { pickQuote } from '@/data/shareQuotes'
import { renderShareCard, type ShareCardData } from '@/utils/shareCard'
import type { EvalRecord, StudentDetail as SD } from '@/types'

const route = useRoute()
const studentId = route.params.studentId as string

const student = ref<SD | null>(null)
const records = ref<EvalRecord[]>([])
const checkinDays = ref(0)
const rank = ref<number | null>(null)
const classSize = ref<number | null>(null)

const loading = ref(true)
const notFound = ref(false)
const drawing = ref(false)
const cardUrl = ref('')
const cardBlob = ref<Blob | null>(null)
const quote = ref('')

const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function showToast(msg: string) {
  toastMsg.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastMsg.value = ''), 2000)
}

const isWechat = /micromessenger/i.test(navigator.userAgent)

const displayLevel = computed(() => (student.value ? calculateLevel(student.value.pet_exp) : 1))
const progress = computed(() => getLevelProgress(student.value?.pet_exp || 0))
const petImageUrl = computed(() =>
  student.value?.pet_type ? getPetLevelImage(student.value.pet_type, displayLevel.value) : '',
)
const petName = computed(() => {
  if (!student.value?.pet_type) return '等待一位小伙伴'
  const name = getPetType(student.value.pet_type)?.name || '宠物'
  return `${name} Lv.${displayLevel.value}`
})

const quoteCtx = computed(() => ({
  hasPet: !!student.value?.pet_type,
  totalPoints: student.value?.total_points ?? 0,
  rank: rank.value,
}))

const dateText = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
})
const fileStamp = computed(() => dateText.value.replace(/\./g, ''))
const fileName = computed(() => `成长卡-${student.value?.name || '宠物花园'}-${fileStamp.value}.jpg`)
const siteText = computed(() => window.location.host)

const canShareFiles = computed(
  () => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && !isWechat,
)

function buildCardData(): ShareCardData {
  const s = student.value!
  const latest = records.value[0]
  return {
    name: s.name,
    className: s.class_name || '',
    totalPoints: s.total_points || 0,
    petImageUrl: petImageUrl.value,
    petName: petName.value,
    levelText: `Lv.${displayLevel.value}`,
    progressPercent: progress.value.percentage,
    rank: rank.value,
    classSize: classSize.value,
    checkinDays: checkinDays.value,
    latest: latest ? { reason: latest.reason, points: latest.points } : null,
    quote: quote.value,
    dateText: dateText.value,
    siteText: siteText.value,
  }
}

async function draw() {
  if (!student.value) return
  drawing.value = true
  try {
    const blob = await renderShareCard(buildCardData())
    if (cardUrl.value) URL.revokeObjectURL(cardUrl.value)
    cardBlob.value = blob
    cardUrl.value = URL.createObjectURL(blob)
  } catch {
    showToast('图片生成失败，请重试')
  } finally {
    drawing.value = false
  }
}

async function load() {
  loading.value = true
  try {
    const d = await getStudentShare(studentId)
    student.value = d.student
    records.value = d.records || []
    checkinDays.value = d.checkinDays || 0

    // 排名：用公开的排行榜接口现算（拿不到就留空，卡片会自动降级）
    try {
      const list = await getLeaderboard(d.student.class_id)
      classSize.value = list.length
      const idx = list.findIndex((s) => s.studentId === studentId)
      rank.value = idx >= 0 ? idx + 1 : null
    } catch {
      rank.value = null
    }

    quote.value = pickQuote(quoteCtx.value)
    await draw()
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }
}

async function onSave() {
  if (!cardBlob.value || !cardUrl.value) return
  const file = new File([cardBlob.value], fileName.value, { type: 'image/jpeg' })

  if (canShareFiles.value) {
    try {
      await navigator.share({ files: [file], title: `${student.value?.name || ''}的成长卡`, text: '每一次进步都在被看见' })
      return
    } catch (e: any) {
      if (e?.name === 'AbortError') return // 用户取消，不再走下载
    }
  }

  const a = document.createElement('a')
  a.href = cardUrl.value
  a.download = fileName.value
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (isWechat) showToast('若未自动保存，请长按图片保存')
}

async function onCopyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    showToast('分享链接已复制')
  } catch {
    showToast('复制失败，请手动复制地址栏链接')
  }
}

onMounted(load)
onBeforeUnmount(() => {
  if (cardUrl.value) URL.revokeObjectURL(cardUrl.value)
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(180deg,#FDF8F3_0%,#F5E9DE_100%)] font-sans text-[#3A2F28]">
    <div class="mx-auto max-w-[460px] px-5 pb-16 pt-6">
      <!-- 顶栏 -->
      <router-link
        to="/"
        class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-[#8A796B] shadow-[0_2px_10px_rgba(120,80,40,0.08)] backdrop-blur transition hover:bg-white hover:text-[#6B5849]"
        aria-label="返回首页"
      >
        <span class="material-symbols-rounded text-[20px]">arrow_back</span>
      </router-link>

      <!-- 加载 -->
      <div v-if="loading" class="mt-8 flex flex-col items-center">
        <div class="w-full animate-pulse rounded-[24px] bg-[#F3E7DC]" style="aspect-ratio: 750 / 1160" />
        <p class="mt-6 text-[13px] tracking-[0.18em] text-[#BCAEA1]">正在生成成长卡</p>
      </div>

      <!-- 不存在 -->
      <div
        v-else-if="notFound || !student"
        class="mt-10 rounded-[28px] bg-white/80 px-8 py-20 text-center shadow-[0_10px_40px_rgba(120,80,40,0.06)] backdrop-blur"
      >
        <span class="material-symbols-rounded text-[48px] text-[#E4D2C1]">pets</span>
        <p class="mt-5 text-[17px] font-semibold text-[#3A2F28]">还没有找到这份成长记录</p>
        <p class="mt-2 text-[13px] text-[#9C8B7C]">链接可能已失效，找老师要一条最新的就好啦。</p>
        <router-link
          to="/"
          class="mt-7 inline-flex h-11 items-center rounded-full bg-[linear-gradient(135deg,#D98150_0%,#C4622D_100%)] px-6 text-[14px] font-semibold text-white shadow-[0_8px_20px_-6px_rgba(196,98,45,0.5)]"
        >
          回到排行榜
        </router-link>
      </div>

      <!-- 主体：只有图片 + 两个按钮 -->
      <div v-else class="mt-6 flex flex-col items-center">
        <img
          v-if="cardUrl"
          :src="cardUrl"
          :alt="`${student.name}的成长卡`"
          class="w-full rounded-[24px] shadow-[0_28px_60px_-24px_rgba(120,80,40,0.38)] transition-opacity duration-300"
          :class="drawing ? 'opacity-50' : 'opacity-100'"
        />
        <div v-else class="w-full animate-pulse rounded-[24px] bg-[#F3E7DC]" style="aspect-ratio: 750 / 1160" />

        <div class="mt-6 w-full space-y-2.5">
          <button
            type="button"
            class="h-[52px] w-full rounded-2xl bg-[linear-gradient(135deg,#D98150_0%,#C4622D_100%)] text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(196,98,45,0.55)] transition hover:brightness-[1.03] active:scale-[0.99] disabled:opacity-50"
            :disabled="!cardUrl || drawing"
            @click="onSave"
          >
            {{ canShareFiles ? '分享图片' : '保存图片' }}
          </button>

          <button
            type="button"
            class="h-[48px] w-full rounded-2xl border border-[#EFE3D7] bg-white/80 text-[14px] font-medium text-[#6B5849] transition hover:bg-white"
            @click="onCopyLink"
          >
            分享链接
          </button>
        </div>

        <p v-if="isWechat" class="mt-4 text-[12.5px] text-[#A9764C]">微信里请长按上方图片保存到相册</p>
      </div>
    </div>

    <Transition>
      <div v-if="toastMsg" class="fixed inset-x-0 bottom-10 z-[70] flex justify-center px-4">
        <div class="rounded-full bg-[#3A2F28] px-5 py-2.5 text-[13px] font-medium text-white shadow-lg">{{ toastMsg }}</div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.v-enter-active,
.v-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.v-enter-from,
.v-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
