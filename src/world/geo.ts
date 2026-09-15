/**
 * 經緯度 ⇄ 世界座標（公尺）。
 * 以台中市中心為原點的等距長方投影：經度乘 cos(緯度) 校正。
 * 東為 +x，北為 −y（canvas 的 y 向下）。
 */
export const ORIGIN = { lat: 24.1477, lng: 120.6736 } // 台中車站附近
export const M_PER_DEG_LAT = 111_320
const COS_LAT = Math.cos((ORIGIN.lat * Math.PI) / 180)

/** 世界的邊界（半寬／半高，公尺）。超出就視為「地圖範圍外」。 */
export const WORLD_HALF = { x: 8_000, y: 7_000 }

export function toWorld(lat: number, lng: number): { x: number; y: number } {
  return {
    x: (lng - ORIGIN.lng) * M_PER_DEG_LAT * COS_LAT,
    y: -(lat - ORIGIN.lat) * M_PER_DEG_LAT,
  }
}

export function toLatLng(x: number, y: number): { lat: number; lng: number } {
  return {
    lat: ORIGIN.lat - y / M_PER_DEG_LAT,
    lng: ORIGIN.lng + x / (M_PER_DEG_LAT * COS_LAT),
  }
}

export function inWorld(x: number, y: number): boolean {
  return Math.abs(x) <= WORLD_HALF.x && Math.abs(y) <= WORLD_HALF.y
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}
