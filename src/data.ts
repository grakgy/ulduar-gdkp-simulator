import playersPublicRaw from '../Players_Public.csv?raw'
import playersHiddenRaw from '../Players_Hidden.csv?raw'
import playerSpecsRaw from '../Player_Specs.csv?raw'
import bossesRaw from '../Bosses.csv?raw'
import eventsRaw from '../Boss_Events.csv?raw'
import lootRaw from '../Loot_Pool.csv?raw'
import chatTemplatesRaw from '../Chat_Templates.csv?raw'

export type Role = '坦克' | '治疗' | '近战DPS' | '远程DPS'

export interface PublicPlayer {
  player_id: string
  name: string
  class: string
  signup_spec: string
  signup_role: Role
  signup_item_level: string
  claimed_offspec: string
  progress_display: string
  achievement_verified: string
  public_economy_claim: string
  whisper_pool: string
}

export interface HiddenPlayer {
  player_id: string
  combat_tier: string
  main_skill: string
  mechanics: string
  awareness: string
  stability: string
  teamwork: string
  learning: string
  mentality: string
  pressure_resistance: string
  social_primary: string
  social_secondary: string
  base_leave_pct: string
  economy_type: string
  wallet_gold: string
  reserve_gold: string
  spend_willingness: string
  bid_aggression: string
  bargain_factor: string
  purchase_preference: string
  claim_honesty: string
  source_type: '随机生成' | '玩家自建'
  personality_type: string
  strength_tags: string
  weakness_tags: string
  special_rule: string
  leave_policy: string
  description: string
}

export interface ChatTemplate {
  scene: '报名' | '灭团' | '退团' | '拍卖'
  style_or_trait: string
  template: string
}

export interface PlayerSpec {
  player_id: string
  spec: string
  role: Role
  character_item_level: string
  skill: string
  boss_experience: string
  willing_switch: string
  publicly_claimed: string
}

export interface Boss {
  boss_id: string
  order: string
  boss_name: string
  mode: string
  base_dc: string
  key_checks: string
  loot_rule: string
  hard_mode: string
  tank_mode: '载具' | '双坦' | '单坦' | '弹性'
  healing_pressure: '低' | '中' | '高' | '极高'
  design_note: string
}

export interface BossEvent {
  boss_id: string
  event_id: string
  event_name: string
  target: string
  attributes: string
  team_requirement: string
  event_dc: string
  soft_fail: string
  hard_fail: string
  trait_notes: string
}

export interface LootItem {
  loot_id: string
  boss_id: string
  drop_group: string
  item_name: string
  slot: string
  category: string
  eligible_tags: string
  grade: 'C' | 'B' | 'A' | 'S' | 'S+'
  start_price_gold: string
  reference_price_gold: string
  weight: string
  source_url: string
  note: string
}

function parseCsv<T>(text: string): T[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1 }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); cell = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const [headers, ...body] = rows
  return body.map((values) => Object.fromEntries(headers.map((h, i) => [h.trim(), values[i]?.trim() ?? ''])) as T)
}

export const fullPlayersPublic = parseCsv<PublicPlayer>(playersPublicRaw)
export const playersHidden = parseCsv<HiddenPlayer>(playersHiddenRaw)
export const playerSpecs = parseCsv<PlayerSpec>(playerSpecsRaw)
export const bosses = parseCsv<Boss>(bossesRaw).sort((a, b) => Number(a.order) - Number(b.order))
export const bossEvents = parseCsv<BossEvent>(eventsRaw)
export const lootPool = parseCsv<LootItem>(lootRaw)
export const chatTemplates = parseCsv<ChatTemplate>(chatTemplatesRaw)

export const publicById = new Map(fullPlayersPublic.map((p) => [p.player_id, p]))
export const hiddenById = new Map(playersHidden.map((p) => [p.player_id, p]))
export const specsByPlayer = new Map<string, PlayerSpec[]>()
for (const spec of playerSpecs) {
  const list = specsByPlayer.get(spec.player_id) ?? []
  list.push(spec)
  specsByPlayer.set(spec.player_id, list)
}

function poolHash(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function playersForSeed(seed: string, poolSize = 40): PublicPlayer[] {
  const custom = fullPlayersPublic.filter((player) => hiddenById.get(player.player_id)?.source_type === '玩家自建')
  const random = fullPlayersPublic
    .filter((player) => hiddenById.get(player.player_id)?.source_type === '随机生成')
    .sort((left, right) => poolHash(`${seed}|pool|${left.player_id}`) - poolHash(`${seed}|pool|${right.player_id}`))
  return [...custom, ...random.slice(0, Math.max(0, poolSize - custom.length))]
}

// 保留旧导出供脚本与外部调用使用；实际游戏会按本局 seed 生成自己的 40 人池。
export const playersPublic = playersForSeed('380')
