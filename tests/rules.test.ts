import { describe, expect, it } from 'vitest'
import { parseGoogleMapsLink } from '../src/world/gmaps'
import { inWorld, toLatLng, toWorld } from '../src/world/geo'
import { LIGHT_MAX, LIGHT_MIN, lightRadius, PLAYER_R, TORCH_MAX, TORCH_MIN } from '../src/world/rules'
import { crowdOf, effectiveTarget, smoothToward } from '../src/world/torch'

describe('火把規則（memo 4.3 / §10）', () => {
  it('規則一：火把有效半徑永遠 ≥ 220 m，比使用者自己的 100 m 大', () => {
    expect(PLAYER_R).toBe(100)
    expect(TORCH_MIN).toBe(220)
    expect(TORCH_MIN).toBeGreaterThan(PLAYER_R)
    expect(effectiveTarget(50, 0)).toBe(TORCH_MIN)
    expect(effectiveTarget(120, 0)).toBe(TORCH_MIN)
  })

  it('規則二：群聚愈密愈大，每單位 crowd ×1.05，最多 130%，上限 350 m', () => {
    expect(effectiveTarget(260, 0)).toBe(260)
    expect(effectiveTarget(260, 1)).toBeCloseTo(273, 0)
    expect(effectiveTarget(260, 10)).toBeCloseTo(260 * 1.3, 5)
    expect(effectiveTarget(300, 10)).toBe(TORCH_MAX)
  })

  it('crowd：同位置疊一支同級 ≈ 1；超過兩者基礎半徑之和沒有貢獻；熄掉的不算', () => {
    const a = { id: 'a', x: 0, y: 0, baseR: 260, lit: true }
    const b = { id: 'b', x: 0, y: 0, baseR: 260, lit: true }
    const far = { id: 'c', x: 600, y: 0, baseR: 260, lit: true }
    const off = { id: 'd', x: 0, y: 0, baseR: 260, lit: false }
    expect(crowdOf(a, [a, b])).toBeCloseTo(1, 5)
    expect(crowdOf(a, [a, far])).toBe(0)
    expect(crowdOf(a, [a, off])).toBe(0)
    expect(crowdOf(a, [a, { id: 'e', x: 260, y: 0, baseR: 260, lit: true }])).toBeCloseTo(0.5, 5)
  })

  it('平滑：朝目標靠近，永不越過', () => {
    const v1 = smoothToward(300, 200, 5_000)
    expect(v1).toBeLessThan(300)
    expect(v1).toBeGreaterThan(200)
    expect(smoothToward(200, 200, 1000)).toBe(200)
    expect(smoothToward(Number.NaN, 250, 1000)).toBe(250)
  })

  it('照明半徑：220 m 起隨人數成長，最大 375 m', () => {
    expect(LIGHT_MIN).toBe(220)
    expect(LIGHT_MAX).toBe(375)
    expect(lightRadius(1)).toBe(220)
    expect(lightRadius(2)).toBeCloseTo(231, 0)
    expect(lightRadius(6)).toBeCloseTo(280.8, 0)
    expect(lightRadius(30)).toBe(375)
    expect(lightRadius(0)).toBe(220)
  })
})

describe('座標投影', () => {
  it('來回轉換一致', () => {
    const w = toWorld(24.1497, 120.6849)
    const back = toLatLng(w.x, w.y)
    expect(back.lat).toBeCloseTo(24.1497, 6)
    expect(back.lng).toBeCloseTo(120.6849, 6)
  })
  it('往北 y 變小、往東 x 變大；台北在範圍外', () => {
    const n = toWorld(24.16, 120.6736)
    const e = toWorld(24.1477, 120.69)
    expect(n.y).toBeLessThan(0)
    expect(e.x).toBeGreaterThan(0)
    const taipei = toWorld(25.0478, 121.517)
    expect(inWorld(taipei.x, taipei.y)).toBe(false)
  })
})

describe('Google 地圖連結解析（4.6 步驟 1）', () => {
  it('完整網址：/place/ 名稱 + !3d!4d 座標優先', () => {
    const r = parseGoogleMapsLink('https://www.google.com/maps/place/%E5%8F%B0%E4%B8%AD%E5%85%AC%E5%9C%92/@24.1440,120.6840,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d24.1445!4d120.6838')
    expect(r).toEqual({ ok: true, lat: 24.1445, lng: 120.6838, name: '台中公園' })
  })
  it('只有 @lat,lng 也行', () => {
    const r = parseGoogleMapsLink('https://www.google.com/maps/@24.1477,120.6736,15z')
    expect(r.ok && r.lat === 24.1477 && r.lng === 120.6736).toBe(true)
  })
  it('?q= / ll= / daddr= / center=', () => {
    expect(parseGoogleMapsLink('https://maps.google.com/?q=24.15,120.66')).toMatchObject({ ok: true, lat: 24.15, lng: 120.66 })
    expect(parseGoogleMapsLink('https://maps.google.com/maps?ll=24.15,120.66&z=15')).toMatchObject({ ok: true, lat: 24.15, lng: 120.66 })
    expect(parseGoogleMapsLink('https://maps.google.com/maps?daddr=24.15,120.66')).toMatchObject({ ok: true, lat: 24.15 })
    expect(parseGoogleMapsLink('https://www.google.com/maps/dir/?api=1&center=24.15,120.66')).toMatchObject({ ok: true, lng: 120.66 })
  })
  it('直接貼座標', () => {
    expect(parseGoogleMapsLink(' 24.1477, 120.6736 ')).toEqual({ ok: true, lat: 24.1477, lng: 120.6736, name: null })
  })
  it('縮短連結展不開：明確回報 short', () => {
    expect(parseGoogleMapsLink('https://maps.app.goo.gl/AbCdEf123')).toEqual({ ok: false, reason: 'short' })
    expect(parseGoogleMapsLink('https://goo.gl/maps/AbCdEf123')).toEqual({ ok: false, reason: 'short' })
  })
  it('空白與無座標', () => {
    expect(parseGoogleMapsLink('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseGoogleMapsLink('https://www.google.com/maps/search/coffee')).toEqual({ ok: false, reason: 'no-coords' })
  })
})
