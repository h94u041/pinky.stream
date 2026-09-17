// 產生「示意底圖」：在拿到台中市真實里界／捷運圖資之前用的假資料。
// 輸出格式與 build-map-data.mjs 相同（世界座標：公尺，東 +x、北 −y）。
// 用法：node scripts/make-placeholder-map.mjs
import { writeFileSync } from 'node:fs'

const HALF_X = 8000
const HALF_Y = 7000
const CELL = 420
const ORIGIN = { lat: 24.1477, lng: 120.6736 }
const M = 111320
const COS = Math.cos((ORIGIN.lat * Math.PI) / 180)
const toWorld = (lat, lng) => [Math.round((lng - ORIGIN.lng) * M * COS), Math.round(-(lat - ORIGIN.lat) * M)]

let seed = 7
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

// 街廓：帶抖動的格子，每格是一個「里」
const cols = Math.ceil((HALF_X * 2) / CELL)
const rows = Math.ceil((HALF_Y * 2) / CELL)
const jitter = (i, j) => [(rnd() - 0.5) * CELL * 0.35, (rnd() - 0.5) * CELL * 0.35]
const grid = []
for (let j = 0; j <= rows; j++) {
  grid.push([])
  for (let i = 0; i <= cols; i++) {
    const [jx, jy] = jitter(i, j)
    grid[j].push([Math.round(-HALF_X + i * CELL + jx), Math.round(-HALF_Y + j * CELL + jy)])
  }
}
const DISTRICTS = ['中區', '東區', '西區', '南區', '北區', '西屯區', '南屯區', '北屯區']
const villages = []
for (let j = 0; j < rows; j++) {
  for (let i = 0; i < cols; i++) {
    // 中央河道（示意水域）：留空不畫
    const cx = -HALF_X + (i + 0.5) * CELL
    const cy = -HALF_Y + (j + 0.5) * CELL
    if (Math.abs(cx - 1800 + Math.sin(cy / 1800) * 500) < 140) continue
    if (rnd() < 0.04) continue
    const ring = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
    const d = DISTRICTS[Math.floor(((i / cols) * 3 + (j / rows) * 2.6) % DISTRICTS.length)]
    villages.push({ n: `示意里 ${j * cols + i}`, d, r: [ring] })
  }
}

// 捷運綠線（概略座標，只作示意）
const green = [
  ['北屯總站', 24.1846, 120.7189],
  ['舊社', 24.1786, 120.7156],
  ['松竹', 24.1728, 120.7071],
  ['四維國小', 24.1700, 120.6990],
  ['文心崇德', 24.1682, 120.6890],
  ['文心中清', 24.1650, 120.6810],
  ['文華高中', 24.1610, 120.6735],
  ['文心櫻花', 24.1580, 120.6650],
  ['市政府', 24.1600, 120.6478],
  ['水安宮', 24.1520, 120.6420],
  ['文心森林公園', 24.1460, 120.6420],
  ['南屯', 24.1390, 120.6420],
  ['豐樂公園', 24.1300, 120.6450],
  ['大慶', 24.1195, 120.6480],
  ['九張犁', 24.1145, 120.6360],
  ['九德', 24.1140, 120.6270],
  ['烏日', 24.1090, 120.6215],
  ['高鐵台中站', 24.1100, 120.6155],
]
const mrt = [
  {
    n: '捷運綠線',
    c: '#2FA66B',
    s: green.map(([n, lat, lng]) => {
      const [x, y] = toWorld(lat, lng)
      return { n, x, y }
    }),
    p: green.map(([, lat, lng]) => toWorld(lat, lng)),
  },
]

const out = { source: 'placeholder', mrtSource: 'approximate', note: '示意底圖：非真實圖資', villages, mrt }
writeFileSync(new URL('../src/data/map.json', import.meta.url), JSON.stringify(out))
console.log(`villages=${villages.length} mrt=${mrt.length}`)
