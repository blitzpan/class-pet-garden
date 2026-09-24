// 成长记录的「按天」视图：分组、时间窗口、一周概览。
// 日期一律用后端给的东八区自然日（YYYY-MM-DD）字符串比较，前端不再自己算时区。

import type { EvalRecord } from '@/types'

export interface DayGroup {
  /** 东八区自然日，YYYY-MM-DD */
  day: string
  label: string
  /** 当日净得分 */
  net: number
  records: EvalRecord[]
}

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + delta * 86400000).toISOString().slice(0, 10)
}

export function dayLabel(day: string, today: string): string {
  if (day === today) return '今天'
  if (day === shiftDay(today, -1)) return '昨天'
  const [y, m, d] = day.split('-').map(Number)
  const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  const date = `${m}月${d}日`
  return String(y) === today.slice(0, 4) ? `${date} ${weekday}` : `${y}年${date} ${weekday}`
}

/** 组内只显示时间，跟着 day 走东八区，避免与日期分组错位 */
export function timeText(timestamp?: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp + 8 * 3600 * 1000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** 按自然日分组，组内保持时间倒序 */
export function groupByDay(records: EvalRecord[], today: string): DayGroup[] {
  const buckets = new Map<string, EvalRecord[]>()
  for (const r of records) {
    const list = buckets.get(r.day)
    if (list) list.push(r)
    else buckets.set(r.day, [r])
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, list]) => ({
      day,
      label: dayLabel(day, today),
      net: list.reduce((sum, r) => sum + r.points, 0),
      records: list,
    }))
}

/**
 * 取展示窗口：优先「最近 days 个自然日」，家长对得上一周的心智。
 * 若这段完全没记录（长假），回退到最近 days 个有记录的日子，并标记 stale 让页面说明。
 */
export function pickWindow(groups: DayGroup[], today: string, days: number): { groups: DayGroup[]; stale: boolean } {
  if (!groups.length) return { groups: [], stale: false }
  const start = shiftDay(today, -(days - 1))
  const recent = groups.filter((g) => g.day >= start)
  return recent.length ? { groups: recent, stale: false } : { groups: groups.slice(0, days), stale: true }
}

export interface HeatCell {
  day: string
  label: string
  /** null = 这天没有打卡 */
  net: number | null
  count: number
  isToday: boolean
}

/** 一周概览：从 startDay 到 today 每天一格，没打卡的天留空档（空档本身就是信息） */
export function buildHeatmap(groups: DayGroup[], startDay: string, today: string): HeatCell[] {
  const byDay = new Map(groups.map((g) => [g.day, g]))
  const cells: HeatCell[] = []
  let cursor = startDay
  while (cursor <= today) {
    const g = byDay.get(cursor)
    const [, m, d] = cursor.split('-').map(Number)
    cells.push({
      day: cursor,
      label: `${m}/${d}`,
      net: g ? g.net : null,
      count: g ? g.records.length : 0,
      isToday: cursor === today,
    })
    cursor = shiftDay(cursor, 1)
  }
  return cells
}
