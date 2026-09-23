export interface RankingStudent {
  id: string
  name: string
  student_no: string | null
  total_points: number
  pet_type: string | null
  pet_level: number
  badge_count?: number
  category_points?: number
}

export const RANKING_CATEGORIES = ['学习', '行为', '健康', '其他'] as const

export type RankingCategory = typeof RANKING_CATEGORIES[number]

export const categoryMeta: Record<RankingCategory, { icon: string; color: string; bg: string }> = {
  学习: { icon: 'menu_book', color: 'text-[#2563eb]', bg: 'bg-[#eff6ff]' },
  行为: { icon: 'volunteer_activism', color: 'text-[#d97706]', bg: 'bg-[#fff7ed]' },
  健康: { icon: 'favorite', color: 'text-[#059669]', bg: 'bg-[#ecfdf5]' },
  其他: { icon: 'stars', color: 'text-[#7c3aed]', bg: 'bg-[#f5f3ff]' },
}

export const totalRankingMeta = {
  icon: 'emoji_events',
  color: 'text-[#ffb000]',
  bg: 'bg-[#fff4e6]',
  label: '总榜',
} as const

export const RANKING_TOP_LIMIT = 11

export function takeTopRanking<T>(students: T[], limit = RANKING_TOP_LIMIT): T[] {
  return students.slice(0, limit)
}

export function sortRanking<T extends Pick<RankingStudent, 'total_points' | 'pet_level'>>(students: T[]): T[] {
  return [...students].sort((a, b) => {
    if (b.total_points !== a.total_points) {
      return b.total_points - a.total_points
    }
    return b.pet_level - a.pet_level
  })
}

export function getRankBadgeStyle(index: number) {
  const isTopThree = index < 3
  return {
    badgeBg: isTopThree ? 'bg-[#fff4e6]' : 'bg-white',
    badgeText: isTopThree ? 'text-[#ffb000]' : 'text-[#777]',
    pointsText: isTopThree ? 'text-[#ff5c00]' : 'text-[#555]',
  }
}

export function getStudentStatusLabel(student: Pick<RankingStudent, 'pet_type' | 'pet_level'>): string {
  if (!student.pet_type) {
    return '待领养'
  }
  const level = student.pet_level
  if (level >= 8) return '优秀'
  if (level >= 5) return '成长'
  if (level >= 3) return '进步'
  return '新秀'
}

export function getRankSubtitle(student: RankingStudent): string {
  if (!student.pet_type) {
    return '等待领养宠物'
  }
  const badgeCount = student.badge_count ?? 0
  if (badgeCount > 0) {
    return `已毕业 · ${badgeCount} 枚徽章`
  }
  return `Lv.${student.pet_level} · ${getStudentStatusLabel(student)}`
}
