import client from './client'

export interface Captcha {
  token: string
  a: number
  b: number
}

export async function getCaptcha() {
  const { data } = await client.get<Captcha>('/parent/captcha')
  return data
}

export async function setupPassword(payload: {
  studentId: string
  password: string
  captchaToken: string
  captchaAnswer: string | number
}) {
  const { data } = await client.post<{ token: string; studentId: string }>('/parent/setup', payload)
  return data
}

export async function login(payload: { studentId: string; password: string }) {
  const { data } = await client.post<{ token: string; studentId: string }>('/parent/login', payload)
  return data
}

export async function join(payload: {
  classId: string
  name: string
  inviteCode: string
  password: string
  captchaToken: string
  captchaAnswer: string | number
}) {
  const { data } = await client.post<{ token: string; studentId: string }>('/parent/join', payload)
  return data
}

export async function logout() {
  await client.post('/parent/logout')
}

export async function changePassword(payload: { oldPassword: string; newPassword: string }) {
  const { data } = await client.post('/parent/change-password', payload)
  return data
}

export async function adopt(petType: string) {
  const { data } = await client.post('/parent/adopt', { petType })
  return data
}

export async function score(ruleId: string) {
  const { data } = await client.post('/parent/score', { ruleId })
  return data
}
