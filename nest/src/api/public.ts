import client from './client'
import type { ClassItem, LeaderboardStudent, StudentDetail, EvalRecord, Rule } from '@/types'

export async function getClasses() {
  const { data } = await client.get<{ classes: ClassItem[] }>('/public/classes')
  return data.classes
}

export async function getLeaderboard(classId: string) {
  const { data } = await client.get<{ students: LeaderboardStudent[] }>('/public/leaderboard', {
    params: { classId },
  })
  return data.students
}

export async function getStudentShare(studentId: string, before?: number) {
  const { data } = await client.get<{
    student: StudentDetail
    hasPet: boolean
    hasParentPassword: boolean
    records: EvalRecord[]
    levelConfig: number[]
    checkinDays: number
    streakDays: number
    /** 东八区今天 YYYY-MM-DD */
    today: string
    hasMore: boolean
  }>(`/public/students/${studentId}/share`, {
    params: before ? { before } : undefined,
  })
  return data
}

export async function getRules(classId?: string) {
  const { data } = await client.get<{ rules: Rule[] }>('/public/rules', {
    params: classId ? { classId } : undefined,
  })
  return data.rules
}

export async function uploadShareCard(imageBase64: string) {
  const { data } = await client.post<{ url: string; expiresIn: number }>(
    '/public/share-cards/upload',
    { image: imageBase64 },
  )
  return data
}
