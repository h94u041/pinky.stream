/**
 * 後端 API 客戶端。同源 /api（Cloudflare Worker）；本機開發時 Vite 會 proxy 到 wrangler dev。
 * 參與者身分：header X-Pinky-Commit（承諾值）。店家：Bearer token。
 */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, status: number) {
    super(code)
    this.code = code
    this.status = status
  }
}

let commitHeader: string | null = null
export function setCommit(commit: string | null) {
  commitHeader = commit
}

const TOKEN_KEY = 'pinky.merchant.token'
export function getMerchantToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
export function setMerchantToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (commitHeader) headers['X-Pinky-Commit'] = commitHeader
  const token = getMerchantToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 8000)
  try {
    const res = await fetch(API_BASE + path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : {}
    if (!res.ok) throw new ApiError(String(data?.error ?? res.status), res.status)
    return data as T
  } finally {
    clearTimeout(timer)
  }
}
