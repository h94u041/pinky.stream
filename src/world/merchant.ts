/** 店家後台的線上狀態：登入、儀表板、動作。離線模式時 ConsoleView 直接用 store。 */
import { reactive } from 'vue'
import { api, ApiError, getMerchantToken, setMerchantToken } from '../api/client'
import { i18n } from '../i18n'
import { sync } from './online'
import { toast, world } from './store'
import type { HoldingGroup, Supply, Torch } from './types'

export interface Dashboard {
  torches: Torch[]
  supplies: Supply[]
  holdings: HoldingGroup[]
  gatheringsInCircle: { torchId: string; torchName: string; startAt: number; status: string; people: number }[]
  pickups: number
  participants: number
}

export const merchant = reactive({
  checked: false,
  loggedIn: false,
  name: '',
  dashboard: null as Dashboard | null,
  busy: false,
  error: '' as string,
})

export async function checkSession() {
  merchant.checked = true
  if (!getMerchantToken()) return
  try {
    const r = await api<{ merchant: { name: string } | null }>('/api/merchant/me')
    if (r.merchant) {
      merchant.loggedIn = true
      merchant.name = r.merchant.name
      await loadDashboard()
    } else setMerchantToken(null)
  } catch {
    setMerchantToken(null)
  }
}

export async function login(email: string, password: string): Promise<boolean> {
  merchant.busy = true
  merchant.error = ''
  try {
    const r = await api<{ token: string; merchant: { name: string } }>('/api/merchant/login', { body: { email, password } })
    setMerchantToken(r.token)
    merchant.loggedIn = true
    merchant.name = r.merchant.name
    await loadDashboard()
    return true
  } catch (e) {
    merchant.error = e instanceof ApiError ? e.code : 'network'
    return false
  } finally {
    merchant.busy = false
  }
}

export async function register(name: string, email: string, password: string, invite: string): Promise<boolean> {
  merchant.busy = true
  merchant.error = ''
  try {
    await api('/api/merchant/register', { body: { name, email, password, invite } })
    return login(email, password)
  } catch (e) {
    merchant.error = e instanceof ApiError ? e.code : 'network'
    return false
  } finally {
    merchant.busy = false
  }
}

export function logout() {
  setMerchantToken(null)
  merchant.loggedIn = false
  merchant.name = ''
  merchant.dashboard = null
}

export async function loadDashboard() {
  try {
    merchant.dashboard = await api<Dashboard>('/api/merchant/dashboard')
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) logout()
  }
}

async function act(fn: () => Promise<unknown>) {
  merchant.busy = true
  try {
    await fn()
    await Promise.all([loadDashboard(), sync()])
  } catch (e) {
    toast(e instanceof ApiError ? i18n.global.t('online.failed', { code: e.code }) : i18n.global.t('online.network'), 'fire')
  } finally {
    merchant.busy = false
  }
}

export const setLit = (id: string, lit: boolean) => act(() => api(`/api/merchant/torches/${id}`, { method: 'PATCH', body: { lit } }))
export const addTorch = (input: { name: string; x: number; y: number; baseR: number; burnHours: number | null }) => act(() => api('/api/merchant/torches', { body: input }))
export const dropSupply = (input: { torchId: string; x: number; y: number; label: string; rare: boolean; count: number; requirement: 'none' | 'reservation' }) =>
  act(() => api('/api/merchant/supplies', { body: input }))
export const addHolding = (input: { torchId: string; title: string; startAt: number; capacity: number; entry: string | null; tasks: { id: string; label: string; reward: string }[] }) =>
  act(() => api('/api/merchant/holdings', { body: input }))

export function isOnline() {
  return world.online
}
