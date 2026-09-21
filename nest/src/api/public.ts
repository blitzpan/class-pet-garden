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

export async function getStudentShare(studentId: string) {
  const { data } = await client.get<{
    student: StudentDetail
    hasPet: boolean
    records: EvalRecord[]
    levelConfig: number[]
  }>(`/public/students/${studentId}/share`)
  return data
}

export async function getRules() {
  const { data } = await client.get<{ rules: Rule[] }>('/public/rules')
  return data.rules
}
