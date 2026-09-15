import raw from '../data/map.json'

export interface Village {
  n: string
  d: string
  /** 環：[[x,y], ...]，世界座標（公尺） */
  r: number[][][]
}
export interface MrtLine {
  n: string
  c: string
  p: number[][]
  s: { n: string; x: number; y: number }[]
}
export interface MapData {
  source: 'placeholder' | 'real'
  note?: string
  villages: Village[]
  mrt: MrtLine[]
}

export const mapData = raw as MapData

/** 以世界座標查落在哪個里（多邊形內點測試） */
export function villageAt(x: number, y: number): Village | null {
  for (const v of mapData.villages) {
    for (const ring of v.r) {
      if (pointInRing(x, y, ring)) return v
    }
  }
  return null
}

function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}
