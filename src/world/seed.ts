import { toWorld } from './geo'
import { addHolding, addSupply, addTorch, type WorldState } from './store'
import type { Stranger, Task } from './types'

/**
 * 原型的示範世界：台中市幾個真實商圈的店家火把、Holding Group、物資與燈下的人。
 * 店名是虛構的，座標是概略的。
 */
export function seedTaichung(w: WorldState) {
  const at = (lat: number, lng: number) => toWorld(lat, lng)

  // 玩家從台中車站前出發
  const start = at(24.1372, 120.6862)
  w.player.x = start.x
  w.player.y = start.y

  const merchants = [
    { name: '霧室 Haze Room', lat: 24.1497, lng: 120.6849, baseR: 260, hours: 6 }, // 一中商圈
    { name: '無名爵士', lat: 24.1509, lng: 120.6640, baseR: 300, hours: 12 }, // 勤美綠園道
    { name: '審計小酒館', lat: 24.1466, lng: 120.6612, baseR: 240, hours: 6 }, // 審計新村
    { name: '夜鷺茶屋', lat: 24.1445, lng: 120.6778, baseR: 220, hours: 6 }, // 中華路夜市
    { name: '逢甲後巷', lat: 24.1789, lng: 120.6466, baseR: 300, hours: 12 }, // 逢甲
    { name: '歌劇院旁', lat: 24.1622, lng: 120.6412, baseR: 260, hours: 12 }, // 台中歌劇院
    { name: '車站前 Bar', lat: 24.1380, lng: 120.6852, baseR: 220, hours: 6, lit: false }, // 台中車站（未點燈）
  ]

  const torches = merchants.map((m) => {
    const p = at(m.lat, m.lng)
    return addTorch({
      name: m.name,
      ownerId: 'm_' + m.name,
      x: p.x,
      y: p.y,
      baseR: m.baseR,
      lit: m.lit ?? true,
      temporary: false,
      burnHours: m.hours,
    })
  })

  const tasks = (): Task[] => [
    { id: 't_checkin', label: '在門口感應報到', reward: '解鎖今晚的火把物資', done: false },
    { id: 't_pass', label: '對店員說出密語', reward: '店家事件', done: false },
    { id: 't_cheers', label: '跟一個陌生代號碰杯', reward: '完成任務', done: false },
  ]

  const tonight = (h: number) => {
    const d = new Date()
    d.setHours(h, 0, 0, 0)
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1)
    return d.getTime()
  }

  addHolding({ torchId: torches[0].id, title: '霧室・無聲舞會', startAt: tonight(21), capacity: 20, joined: 7, entry: '年滿 18', tasks: tasks() })
  addHolding({ torchId: torches[1].id, title: '週四無名爵士夜', startAt: tonight(20), capacity: 24, joined: 11, entry: '年滿 18', tasks: tasks() })
  addHolding({ torchId: torches[4].id, title: '後巷桌遊夜', startAt: tonight(19), capacity: 12, joined: 3, entry: null, tasks: tasks() })

  const drop = (torchIdx: number, dx: number, dy: number, kind: 'arrow' | 'lamp' | 'discount' | 'rare', label: string, opts: Partial<{ rare: boolean; remaining: number; requirement: 'none' | 'reservation' }> = {}) => {
    const t = torches[torchIdx]
    addSupply({
      torchId: t.id,
      x: t.x + dx,
      y: t.y + dy,
      kind,
      label,
      rare: opts.rare ?? kind === 'rare',
      remaining: opts.remaining ?? 5,
      perPerson: 1,
      requirement: opts.requirement ?? 'none',
    })
  }
  drop(0, 120, -60, 'discount', '調酒 −35%')
  drop(0, -150, 90, 'lamp', '照明燈（探索範圍 +35%，1 小時）')
  drop(0, 40, 180, 'rare', '雙人招待 shot', { requirement: 'reservation', remaining: 2 })
  drop(1, -110, -80, 'discount', '爵士夜入場 −50%')
  drop(1, 160, 40, 'arrow', '箭矢')
  drop(2, 60, -100, 'discount', '手沖免費升級')
  drop(3, -70, 60, 'arrow', '箭矢')
  drop(3, 130, -40, 'discount', '滷味第二份半價')
  drop(4, -140, 120, 'discount', '桌遊夜飲料券')
  drop(4, 90, -160, 'lamp', '照明燈（探索範圍 +35%，1 小時）')
  drop(5, 0, 150, 'rare', '歌劇院限定杯', { requirement: 'reservation', remaining: 3 })
  // 火把圈外的物資：沒人看得見，得靠自己探索撞見（4.4）
  const far = at(24.1405, 120.6905)
  addSupply({ torchId: torches[6].id, x: far.x, y: far.y, kind: 'arrow', label: '箭矢', rare: false, remaining: 3, perPerson: 1, requirement: 'none' })

  // 燈下的人（只有探知開著、且在同一盞燈下才看得到）
  const npc = (torchIdx: number, codename: string, tags: string[], badges: Stranger['badges'], history: string[], on = true): Stranger => {
    const t = torches[torchIdx]
    const a = Math.random() * Math.PI * 2
    const r = 20 + Math.random() * 120
    return {
      id: 'npc_' + codename,
      codename,
      x: t.x + Math.cos(a) * r,
      y: t.y + Math.sin(a) * r,
      detectOn: on,
      since: Date.now() - Math.floor(Math.random() * 50 + 5) * 60_000,
      tags,
      badges,
      history,
    }
  }
  w.strangers.push(
    npc(0, '海鹽#2210', ['黑膠', '不喝甜的', '早睡'], ['真人', '藍蝶'], ['霧室・無聲舞會']),
    npc(0, '琥珀#7781', ['桌遊', '貓派'], ['真人', '貓罐頭製造機'], []),
    npc(0, '木炭#3390', ['爬山', '拍立得', '辣'], ['真人'], ['後巷桌遊夜'], false),
    npc(0, '風鈴#5127', ['爵士', '夜貓'], ['真人', '夜貓'], ['週四無名爵士夜']),
    npc(1, '銀杏#9034', ['爵士', '手沖'], ['真人', '早鳥'], ['週四無名爵士夜']),
    npc(1, '露水#1408', ['攝影', '不喝酒'], ['真人'], []),
    npc(1, '月見#6650', ['小說', '跑步'], ['真人', '藍蝶'], ['霧室・無聲舞會']),
    npc(4, '烏龍#2077', ['桌遊', '德式'], ['真人'], ['後巷桌遊夜']),
    npc(4, '灰貓#8811', ['桌遊', '貓派', '辣'], ['真人', '貓罐頭製造機'], []),
  )
}
