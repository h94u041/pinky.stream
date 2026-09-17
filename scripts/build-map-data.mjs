// 把真實圖資轉成 src/data/map.json（世界座標：公尺，東 +x、北 −y，原點台中車站附近）。
//
// 用法：
//   node scripts/build-map-data.mjs <villages.geojson> [mrt.geojson]
//
// villages.geojson：台中市里界（例如 g0v/twgeojson 的 twVillage1982.json，CC0），
//   會用 properties 裡的 COUNTYNAME/縣市 篩出「臺中市」，取 VILLNAME/里名、TOWNNAME/區名。
// mrt.geojson（選填）：LineString 為路線（properties.name、color），Point 為車站（properties.name）。
//
// 簡化：Douglas–Peucker（容差 12 m），並丟掉落在世界範圍外的里。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const ORIGIN = { lat: 24.1477, lng: 120.6736 }
const HALF = { x: 8000, y: 7000 }
const M = 111320
const COS = Math.cos((ORIGIN.lat * Math.PI) / 180)
const TOL = 12

const toWorld = ([lng, lat]) => [(lng - ORIGIN.lng) * M * COS, -(lat - ORIGIN.lat) * M]
const inWorld = ([x, y]) => Math.abs(x) <= HALF.x + 1500 && Math.abs(y) <= HALF.y + 1500

function simplify(points, tol) {
  if (points.length <= 2) return points
  let maxD = 0
  let idx = 0
  const [ax, ay] = points[0]
  const [bx, by] = points[points.length - 1]
  const len = Math.hypot(bx - ax, by - ay)
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i]
    // 封閉環的首尾同點：退化成「到端點的距離」，否則整個環會被砍成兩點
    const d = len < 1e-6 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD <= tol) return [points[0], points[points.length - 1]]
  return [...simplify(points.slice(0, idx + 1), tol).slice(0, -1), ...simplify(points.slice(idx), tol)]
}

const prop = (p, ...keys) => keys.map((k) => p?.[k]).find((v) => v != null) ?? ''
const round = (ring) => ring.map(([x, y]) => [Math.round(x), Math.round(y)])

const [villagesPath, mrtPath] = process.argv.slice(2)
if (!villagesPath) {
  console.error('usage: node scripts/build-map-data.mjs <villages.geojson> [mrt.geojson]')
  process.exit(1)
}

const vg = JSON.parse(readFileSync(villagesPath, 'utf8'))
const villages = []
for (const f of vg.features ?? []) {
  const county = prop(f.properties, 'COUNTYNAME', 'C_Name', '縣市', 'county')
  if (county && !/臺中|台中/.test(county)) continue
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []
  const rings = []
  for (const poly of polys) {
    const outer = poly[0].map(toWorld)
    if (!outer.some(inWorld)) continue
    rings.push(round(simplify(outer, TOL)))
  }
  if (!rings.length) continue
  villages.push({
    n: prop(f.properties, 'VILLNAME', 'VILLAGENAM', 'V_Name', '里名', 'name'),
    d: prop(f.properties, 'TOWNNAME', 'T_Name', '區名', 'town'),
    r: rings,
  })
}

let mrt = []
let mrtSource = 'none'
const outPath = new URL('../src/data/map.json', import.meta.url)
if (!mrtPath && existsSync(outPath)) {
  // 沒給捷運圖資：沿用現有 map.json 裡的（可能是概略座標）
  const prev = JSON.parse(readFileSync(outPath, 'utf8'))
  mrt = prev.mrt ?? []
  mrtSource = prev.mrtSource ?? (prev.source === 'placeholder' ? 'approximate' : 'real')
}
if (mrtPath) {
  mrtSource = 'real'
  const mg = JSON.parse(readFileSync(mrtPath, 'utf8'))
  const lines = new Map()
  const stations = []
  for (const f of mg.features ?? []) {
    const name = prop(f.properties, 'name', 'LineName', '路線')
    if (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') {
      const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
      const line = lines.get(name) ?? { n: name, c: prop(f.properties, 'color', 'stroke') || '#2FA66B', p: [], s: [] }
      for (const part of parts) line.p.push(...round(simplify(part.map(toWorld), TOL)))
      lines.set(name, line)
    } else if (f.geometry.type === 'Point') {
      const [x, y] = toWorld(f.geometry.coordinates)
      stations.push({ n: prop(f.properties, 'name', 'StationName', '站名'), x: Math.round(x), y: Math.round(y), line: prop(f.properties, 'line', 'LineName') })
    }
  }
  for (const line of lines.values()) {
    line.s = stations.filter((s) => !s.line || s.line === line.n).map(({ n, x, y }) => ({ n, x, y }))
    mrt.push(line)
  }
}

const out = { source: 'real', mrtSource, villages, mrt }
const json = JSON.stringify(out)
writeFileSync(outPath, json)
console.log(`villages=${villages.length} mrt=${mrt.length} size=${(json.length / 1024).toFixed(0)}KB`)
