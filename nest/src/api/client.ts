import axios from 'axios'

const BASE = (import.meta.env as any).VITE_API_BASE || '/api'

const client = axios.create({ baseURL: BASE })

let authToken: string | null = null

export function setAuthToken(token: string | null) {
  authToken = token
}

client.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers || {}
    ;(config.headers as any).Authorization = `Bearer ${authToken}`
  }
  return config
})

export default client
