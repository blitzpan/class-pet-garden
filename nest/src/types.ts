export interface ClassItem {
  id: string
  name: string
}

export interface LeaderboardStudent {
  studentId: string
  name: string
  student_no: string | null
  total_points: number
  pet_type: string | null
  pet_level: number
  rank: number
}

export interface StudentDetail {
  id: string
  name: string
  student_no: string | null
  total_points: number
  pet_type: string | null
  pet_level: number
  pet_exp: number
  class_id: string
  class_name: string
}

export interface EvalRecord {
  id: string
  points: number
  reason: string
  category: string
  timestamp: number
}

export interface Rule {
  id: string
  name: string
  points: number
  category: string
}
