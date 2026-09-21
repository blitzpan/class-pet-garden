import { defineStore } from 'pinia'
import client from '@/api/client'
import { setAuthToken } from '@/api/client'
import {
  login as apiLogin,
  setupPassword,
  changePassword as apiChangePassword,
  logout as apiLogout,
} from '@/api/parent'

interface AuthState {
  token: string | null
  studentId: string | null
  loaded: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => {
    const token = localStorage.getItem('nest_token')
    const studentId = localStorage.getItem('nest_studentId')
    return { token, studentId, loaded: !!token }
  },
  getters: {
    isLoggedIn: (s) => !!s.token,
  },
  actions: {
    async restore() {
      if (!this.token) return
      setAuthToken(this.token)
      try {
        await client.get('/parent/me')
      } catch {
        this.clear()
      }
    },
    async login(studentId: string, password: string) {
      const r = await apiLogin({ studentId, password })
      this.apply(r.token, r.studentId)
    },
    async setup(studentId: string, password: string, captchaToken: string, captchaAnswer: string | number) {
      const r = await setupPassword({ studentId, password, captchaToken, captchaAnswer })
      this.apply(r.token, r.studentId)
    },
    async changePassword(oldPassword: string, newPassword: string) {
      await apiChangePassword({ oldPassword, newPassword })
    },
    async logout() {
      try {
        await apiLogout()
      } catch {
        /* 忽略 */
      }
      this.clear()
    },
    apply(token: string, studentId: string) {
      this.token = token
      this.studentId = studentId
      this.loaded = true
      localStorage.setItem('nest_token', token)
      localStorage.setItem('nest_studentId', studentId)
      setAuthToken(token)
    },
    clear() {
      this.token = null
      this.studentId = null
      this.loaded = false
      localStorage.removeItem('nest_token')
      localStorage.removeItem('nest_studentId')
      setAuthToken(null)
    },
  },
})
