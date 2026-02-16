import axios from 'axios'

const adminApi = axios.create({
  baseURL: '/api',
})

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token)
    else reject(error)
  })
  failedQueue = []
}

adminApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    const url = originalRequest.url || ''
    if (url.includes('/token/')) {
      return Promise.reject(error)
    }

    const refreshToken = localStorage.getItem('admin_refresh_token')
    if (!refreshToken) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            resolve(adminApi(originalRequest))
          },
          reject,
        })
      })
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      const { data } = await axios.post('/api/token/refresh/', {
        refresh: refreshToken,
      })
      const newToken = data.access
      localStorage.setItem('admin_access_token', newToken)
      if (data.refresh) {
        localStorage.setItem('admin_refresh_token', data.refresh)
      }
      originalRequest.headers.Authorization = `Bearer ${newToken}`
      processQueue(null, newToken)
      return adminApi(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      localStorage.removeItem('admin_access_token')
      localStorage.removeItem('admin_refresh_token')
      window.location.href = '/admin'
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default adminApi
