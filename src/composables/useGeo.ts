import { reactive } from 'vue'
import { inWorld, toWorld } from '../world/geo'
import { setPlayerPosition, world } from '../world/store'

export type GeoStatus = 'off' | 'asking' | 'on' | 'denied' | 'unsupported' | 'outside' | 'error'

/**
 * 真實定位。開著時玩家位置由 navigator.geolocation 決定，點地圖走路停用；
 * 關掉就回到原型的模擬走路。位置只留在裝置本機，不上傳。
 */
export const geo = reactive({
  status: 'off' as GeoStatus,
  accuracy: 0,
  lat: 0,
  lng: 0,
  errorMsg: '',
  updatedAt: 0,
})

let watchId: number | null = null

export function startGeo() {
  if (!('geolocation' in navigator)) {
    geo.status = 'unsupported'
    return
  }
  if (watchId !== null) return
  geo.status = 'asking'
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords
      geo.lat = latitude
      geo.lng = longitude
      geo.accuracy = accuracy
      geo.updatedAt = Date.now()
      const w = toWorld(latitude, longitude)
      if (!inWorld(w.x, w.y)) {
        geo.status = 'outside'
        return
      }
      geo.status = 'on'
      world.gpsOn = true
      setPlayerPosition(w.x, w.y)
    },
    (err) => {
      geo.errorMsg = err.message
      geo.status = err.code === err.PERMISSION_DENIED ? 'denied' : 'error'
      stopGeo()
    },
    { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
  )
}

export function stopGeo() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  world.gpsOn = false
  if (geo.status === 'on' || geo.status === 'asking' || geo.status === 'outside') geo.status = 'off'
}

export function toggleGeo() {
  if (watchId !== null) stopGeo()
  else startGeo()
}
