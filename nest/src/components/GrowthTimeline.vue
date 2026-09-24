<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { EvalRecord } from '@/types'
import { buildHeatmap, dayLabel, groupByDay, pickWindow, shiftDay, timeText, type HeatCell } from '@/utils/growth'

const props = defineProps<{
  records: EvalRecord[]
  /** 东八区今天（YYYY-MM-DD），由后端给出 */
  today: string
  checkinDays: number
  streakDays: number
  hasMore: boolean
  loadingMore: boolean
}>()
const emit = defineEmits<{ (e: 'load-more', before: number): void }>()

const INITIAL_DAYS = 7
const windowDays = ref(INITIAL_DAYS)

const groups = computed(() => groupByDay(props.records, props.today))
const visible = computed(() => pickWindow(groups.value, props.today, windowDays.value))
const heatmap = computed(() => buildHeatmap(groups.value, shiftDay(props.today, -(INITIAL_DAYS - 1)), props.today))

const oldestTimestamp = computed(() =>
  props.records.reduce((min, r) => (r.timestamp && (!min || r.timestamp < min) ? r.timestamp : min), 0),
)

// 家长刚提交的评价要看得见：新出现的记录短暂高亮
const seen = new Set<string>()
const highlight = ref<string[]>([])
let primed = false
let newestSeen = 0
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  () => props.records,
  (list) => {
    // 只看「比已知最新的还新」的记录：翻页加载的旧记录不算新
    const fresh = primed ? list.filter((r) => !seen.has(r.id) && (r.timestamp || 0) > newestSeen).map((r) => r.id) : []
    for (const r of list) {
      seen.add(r.id)
      if ((r.timestamp || 0) > newestSeen) newestSeen = r.timestamp || 0
    }
    primed = true
    if (!fresh.length) return
    highlight.value = fresh
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (highlight.value = []), 2200)
  },
  { immediate: true },
)
onBeforeUnmount(() => timer && clearTimeout(timer))

// 长评语默认收起两行，点一下看完整
const expanded = ref<string[]>([])
function isLong(r: EvalRecord) {
  return r.reason.length > 22
}
function toggle(id: string) {
  expanded.value = expanded.value.includes(id) ? expanded.value.filter((x) => x !== id) : [...expanded.value, id]
}

function cellClass(c: HeatCell) {
  if (c.net === null) return 'bg-[#f6f0ea] text-[#cdbbaa]'
  if (c.net > 0) return 'bg-orange-100 text-orange-700'
  if (c.net < 0) return 'bg-rose-50 text-rose-600'
  return 'bg-[#f3ece5] text-[#8a6f5c]'
}
function cellTitle(c: HeatCell) {
  const day = dayLabel(c.day, props.today)
  return c.count ? `${day} · ${c.count} 条` : `${day} 没有打卡`
}

function showEarlier() {
  windowDays.value += INITIAL_DAYS
  const needDay = shiftDay(props.today, -(windowDays.value - 1))
  const oldestDay = groups.value.length ? groups.value[groups.value.length - 1].day : ''
  if (props.hasMore && (!oldestDay || oldestDay > needDay)) {
    emit('load-more', oldestTimestamp.value)
  }
}
</script>

<template>
  <section>
    <div class="flex items-baseline justify-between">
      <h2 class="font-serif text-xl font-bold text-[#422d20]">成长记录</h2>
      <span class="text-sm text-[#8a6f5c]">累计打卡 {{ checkinDays }} 天</span>
    </div>

    <p v-if="streakDays > 1" class="mt-1 text-sm font-medium text-orange-600">已连续打卡 {{ streakDays }} 天 🔥</p>

    <!-- 一周概览：没打卡的天留空档，家长一眼看出断在哪 -->
    <div v-if="heatmap.length" class="mt-3 flex gap-1.5">
      <div v-for="c in heatmap" :key="c.day" class="flex-1" :title="cellTitle(c)">
        <div
          class="flex h-9 items-center justify-center rounded-lg text-[13px] font-bold tabular-nums"
          :class="[cellClass(c), c.isToday ? 'ring-1 ring-orange-300' : '']"
        >
          {{ c.net === null ? '·' : `${c.net > 0 ? '+' : ''}${c.net}` }}
        </div>
        <p class="mt-1 text-center text-[11px]" :class="c.isToday ? 'font-semibold text-orange-600' : 'text-[#a08a78]'">
          {{ c.label }}
        </p>
      </div>
    </div>

    <p v-if="visible.stale" class="mt-4 rounded-xl bg-[#fff8f2] px-4 py-3 text-sm text-[#8a6f5c]">
      最近 {{ INITIAL_DAYS }} 天还没有新记录，下面是更早的打卡。
    </p>

    <!-- 按天分组：家长要的「今天怎么样」= 日期行右侧的当日小结 -->
    <div v-if="visible.groups.length" class="mt-4 space-y-4">
      <div v-for="g in visible.groups" :key="g.day">
        <div class="flex items-baseline justify-between">
          <h3 class="text-sm font-semibold text-[#5c4230]">{{ g.label }}</h3>
          <span class="text-xs text-[#8a6f5c]">
            {{ g.records.length }} 条 · 净 {{ g.net > 0 ? '+' : '' }}{{ g.net }} 分
          </span>
        </div>

        <div class="mt-2 space-y-1.5">
          <article
            v-for="r in g.records"
            :key="r.id"
            class="rounded-xl px-3 py-2.5 transition"
            :class="[
              r.points < 0 ? 'bg-white ring-1 ring-[#f4e3dc]' : 'bg-[#fff8f2]',
              highlight.includes(r.id) ? 'ring-2 ring-orange-300' : '',
            ]"
            @click="isLong(r) && toggle(r.id)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p
                  class="text-sm font-medium"
                  :class="[r.points < 0 ? 'text-[#7a6050]' : 'text-[#4d3527]', isLong(r) && !expanded.includes(r.id) ? 'line-clamp-2' : '']"
                >
                  {{ r.reason }}
                </p>
                <p class="mt-0.5 text-xs text-[#8a6f5c]">{{ r.category }} · {{ timeText(r.timestamp) }}</p>
              </div>
              <span
                class="shrink-0 text-sm font-bold tabular-nums"
                :class="r.points > 0 ? 'text-emerald-600' : r.points < 0 ? 'text-rose-500' : 'text-slate-500'"
              >
                {{ r.points > 0 ? '+' : '' }}{{ r.points }}
              </span>
            </div>
          </article>
        </div>
      </div>
    </div>

    <p v-else class="mt-6 rounded-2xl bg-[#fff8f2] px-4 py-10 text-center text-sm text-[#8a6f5c]">
      还没有成长记录，第一次打卡就从这里开始。
    </p>

    <button
      v-if="hasMore"
      type="button"
      class="mt-4 w-full rounded-xl border border-[#f1e5db] bg-white py-2.5 text-sm font-medium text-[#8a6f5c] transition hover:bg-[#fff8f2] disabled:opacity-60"
      :disabled="loadingMore"
      @click="showEarlier"
    >
      {{ loadingMore ? '加载中…' : '查看更早记录' }}
    </button>
  </section>
</template>
