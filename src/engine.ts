import { bossEvents, chatTemplates, gameConfig, hiddenById, lootPool, playerSpecs, publicById, raidBuffs, specProfileByName, specsByPlayer, type Boss, type BossEvent, type HiddenPlayer, type LootItem, type PlayerSpec, type RaidBuff, type Role } from './data'
import { createPlayerStatusSnapshot, playerStatusMultiplier, type PlayerStatusSnapshot } from './playerStatus'

export interface TeamMember {
  id: string
  currentSpec: string
  itemLevel: number
  wallet: number
  spent: number
  purchases: string[]
  left: boolean
  blame: number
  performance: number
  status?: PlayerStatusSnapshot
  richardBuffActive?: boolean
}

export interface EventResult {
  name: string
  status: '成功' | '险情' | '失败'
  detail: string
  responsible?: string
  recoveryBy?: string
  recovery?: string
  timeRatio?: number
}

export interface CombatMeter {
  playerId: string
  name: string
  spec: string
  role: Role
  itemLevel: number
  dps: number
  hps: number
  damage: number
  healing: number
  died?: boolean
  battleResurrected?: boolean
  activeRatio?: number
}

export interface CombatDeath {
  playerId: string
  name: string
  role: Role
  eventName: string
  timeRatio: number
  battleResurrected: boolean
  resurrectedBy?: string
}

export interface CombatResult {
  bossId: string
  attempt: number
  killed: boolean
  remainingHp: number
  events: EventResult[]
  reason: string
  responsible: string
  chat: string[]
  leaver?: string
  leaveType?: '开喷退团' | '战术下线' | '直接退团' | '借故离开' | '违规封号' | '分崩离析' | '网吧到点'
  leaveReason?: string
  failureCause?: '机制失误' | '输出不足' | '治疗不足' | '阵容失衡'
  moraleDelta: number
  moraleReason: string
  duration: number
  teamDps: number
  teamHps: number
  meters: CombatMeter[]
  deaths: CombatDeath[]
  casualties: number
  battleReses: number
  requiredTeamDps?: number
  requiredTeamHps?: number
}

export interface CombatModifiers {
  teamMechanics?: number
  teamOutputMultiplier?: number
  teamHealingMultiplier?: number
  playerMechanics?: Record<string, number>
  playerOutputMultiplier?: Record<string, number>
  playerHealingMultiplier?: Record<string, number>
  leaveRateBonus?: number
}

export interface Bid {
  playerId: string
  name: string
  max: number
}

export interface AuctionRecord {
  bossId: string
  bossName: string
  item: LootItem
  bids: Bid[]
  buyerId?: string
  buyerName?: string
  price: number
  salvaged: boolean
  log: string[]
  lateJoiners?: string[]
  exitCount?: number
}

export function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6d2b79f5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rngFor(...parts: Array<string | number>) {
  return mulberry32(hashSeed(parts.join('|')))
}

export function createPlayerStatus(seed: string, playerId: string): PlayerStatusSnapshot {
  const rng = rngFor(seed, playerId, 'player-status')
  return createPlayerStatusSnapshot(rng(), rng(), rng())
}

export function dynamicItemLevel(playerId: string, seed: string): number {
  const base = n(publicById.get(playerId)?.signup_item_level)
  const roll = rngFor(seed, playerId, 'item-level')()
  // 232 是奥杜尔阶段接近完全毕业的装等，不应该成为候选池常态。
  // 保留原人物之间的强弱层次，但压低高装等样本并收窄单局浮动。
  const calibratedBase = base >= 232 ? 230 : base === 231 ? 229 : base === 230 ? 228 : base === 229 ? 227 : base === 228 ? 227 : base
  const bands = [-2, -1, -1, 0, 0, 0, 0, 1, 1, 2]
  const adjustment = bands[Math.floor(roll * bands.length)]
  return clamp(calibratedBase + adjustment, 200, 232)
}

export function shuffled<T>(items: T[], seed: string): T[] {
  const result = [...items]
  const rng = rngFor(seed, 'shuffle')
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function currentSpec(member: TeamMember): PlayerSpec {
  const specs = specsByPlayer.get(member.id) ?? []
  return specs.find((s) => s.spec === member.currentSpec) ?? specs[0]
}

export function publicSpecs(memberId: string): PlayerSpec[] {
  const pub = publicById.get(memberId)
  const claimed = new Set([pub?.signup_spec, ...(pub?.claimed_offspec ?? '').split(/[、|]/)].filter(Boolean))
  return (specsByPlayer.get(memberId) ?? []).filter((s) => s.publicly_claimed === '是' && claimed.has(s.spec))
}

export function roleCounts(team: TeamMember[]) {
  const counts: Record<Role, number> = { 坦克: 0, 治疗: 0, 近战DPS: 0, 远程DPS: 0 }
  team.forEach((m) => { counts[currentSpec(m).role] += 1 })
  return counts
}

function n(value: string | undefined) { return Number(value ?? 0) }
function configNumber(key: string, fallback: number) {
  const value = Number(gameConfig.get(key))
  return Number.isFinite(value) ? value : fallback
}

export function activeRaidBuffs(team: TeamMember[]): RaidBuff[] {
  return raidBuffs.filter((buff) => team.some((member) => {
    const player = publicById.get(member.id)
    const spec = currentSpec(member)
    if (!player || player.class !== buff.provider_class) return false
    const requiredSpecs = buff.provider_spec.split('|').map((value) => value.trim()).filter(Boolean)
    return !requiredSpecs.length || requiredSpecs.includes(spec.spec)
  }))
}

function raidBuffMultiplier(buffs: RaidBuff[], role: Role, playerClass: string): number {
  const isDamage = role.includes('DPS')
  const isRanged = role === '远程DPS'
  const isCaster = isRanged && playerClass !== '猎人'
  const percent = buffs.reduce((sum, buff) => {
    if (role === '治疗') return sum + n(buff.healing_pct)
    if (!isDamage) return sum
    return sum
      + (isCaster ? n(buff.caster_pct) : n(buff.physical_pct))
      + (role === '近战DPS' ? n(buff.melee_pct) : n(buff.ranged_pct))
  }, 0)
  return 1 + percent / 100
}
function avg(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0 }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }

export function effectiveCombatRatings(member: TeamMember, hidden = hiddenById.get(member.id)!): { mainSkill: number; mechanics: number; awareness: number } {
  const multiplier = playerStatusMultiplier(member.status?.actual ?? 0)
  return {
    mainSkill: Math.min(100, n(hidden.main_skill) * multiplier),
    mechanics: Math.min(100, n(hidden.mechanics) * multiplier),
    awareness: Math.min(100, n(hidden.awareness) * multiplier),
  }
}

export function personalLearningGain(hidden: HiddenPlayer, spec: PlayerSpec, attempt: number): number {
  if (attempt <= 1) return 0
  const learningRate = clamp(n(hidden.learning) / 100, 0, 1)
  const unfamiliarity = clamp((100 - n(spec.boss_experience)) / 100, 0, 1)
  const responsibilityBonus = [hidden.social_primary, hidden.social_secondary].includes('责任型') ? 1 : 0
  const overconfidencePenalty = hidden.social_primary === '自信型' ? .75 : 0
  const perWipeGain = 1.8 + learningRate * (2.2 + unfamiliarity * 6) + responsibilityBonus - overconfidencePenalty
  return Math.max(0, perWipeGain * (attempt - 1))
}

function fillChatTemplate(template: string, variables: Record<string, string | number> = {}): string {
  return Object.entries(variables).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template)
}

export const atmospherePlayerIds = new Set(['P085', 'P087', 'P088', 'P094', 'P096', 'P098', 'P100', 'P101', 'P126', 'P131'])
const selfResponseChatStyles = new Set(['责任型', '玻璃心', '宏依赖', '小白型', '嘴硬型', '甩锅型', '自信型'])

function pickChatTemplate(scene: '报名' | '灭团' | '退团' | '拍卖' | '补人', styles: string[], rng: () => number, variables: Record<string, string | number> = {}): string | undefined {
  const matching = chatTemplates.filter((entry) => entry.scene === scene && styles.includes(entry.style_or_trait))
  return matching.length ? fillChatTemplate(matching[Math.floor(rng() * matching.length)].template, variables) : undefined
}

function isQuietPlayer(hidden: HiddenPlayer): boolean {
  return [hidden.social_primary, hidden.social_secondary].some((trait) => trait === '沉默型' || trait === '不开麦')
}

function isGlassHeart(hidden: HiddenPlayer): boolean {
  return [hidden.social_primary, hidden.social_secondary].includes('玻璃心')
}

function matchedPersonalFailureReply(event: EventResult | undefined): string | undefined {
  if (!event) return undefined
  const quotes = [...event.detail.matchAll(/“([^”]{2,80})”/g)].map((match) => match[1].trim())
  if (quotes.length) return quotes.at(-1)
  const detail = event.detail
  if (/电脑|幻灯片|卡住|画面卡|黑屏|驱动|鼠标/.test(detail)) return '刚才机器突然卡住了，画面恢复的时候人已经倒了。'
  if (/一键宏|焦点宏|宏循环|宏卡|宏失灵/.test(detail)) return '刚才宏卡住了，关键技能怎么按都没出来。'
  if (/天赋|关键技能根本没点/.test(detail)) return '我刚才才发现天赋切错了，关键技能根本没点出来。'
  if (/箭没带|钓鱼竿|背包|快捷栏|宠物不听/.test(detail)) return '刚才准备确实没做好，我现在把背包和快捷栏重新检查一遍。'
  if (/没人听过的站位|新的转火顺序|记串了|单独处理/.test(detail)) return '刚才是我临时改打法改出问题了，下把按原分工来。'
  if (/不开麦|没在语音|报点没喊|字打出来/.test(detail)) return '我刚才看见问题了，但没及时开麦报出来。'
  return undefined
}

interface EncounterProfile {
  melee: number
  ranged: number
  caster: number
  physical: number
  healer: number
  movement: number
  burst: number
  multitarget: number
  survivalPressure: number
  timings: number[]
}

const defaultProfile: EncounterProfile = { melee: 1, ranged: 1, caster: 1, physical: 1, healer: 1, movement: 0, burst: .35, multitarget: .2, survivalPressure: .3, timings: [.18, .39, .62, .82, .92] }
const encounterProfiles: Record<string, Partial<EncounterProfile>> = {
  B01: { movement: .15, burst: 0, multitarget: 0, survivalPressure: .1, timings: [.22, .51, .79] },
  B02: { melee: .99, ranged: 1.02, healer: 1.03, movement: .12, burst: .45, multitarget: .25, survivalPressure: .5, timings: [.14, .35, .58, .81] },
  B03: { melee: .95, ranged: 1.05, physical: 1.02, movement: .2, burst: .2, multitarget: .7, survivalPressure: .35, timings: [.16, .37, .61, .84] },
  B04: { melee: .99, ranged: 1.02, movement: .22, burst: 1, multitarget: .1, survivalPressure: .45, timings: [.17, .34, .57, .78] },
  B05: { melee: .98, ranged: 1.02, healer: 1.05, movement: .2, burst: .65, multitarget: .45, survivalPressure: .65, timings: [.13, .38, .63, .84] },
  B06: { melee: 1.06, ranged: .96, physical: 1.02, movement: .18, burst: .5, multitarget: .8, survivalPressure: .45, timings: [.21, .49, .77] },
  B07: { melee: .97, ranged: 1.04, movement: .3, burst: .5, multitarget: .8, survivalPressure: .55, timings: [.15, .36, .59, .82] },
  B08: { melee: .98, ranged: 1.04, caster: 1.08, movement: .48, burst: 1, multitarget: .15, survivalPressure: .55, timings: [.18, .41, .64, .86] },
  B09: { melee: .96, ranged: 1.06, healer: 1.04, movement: .34, burst: .45, multitarget: .8, survivalPressure: .55, timings: [.12, .33, .59, .83] },
  B10: { melee: .92, ranged: 1.08, caster: 1.03, movement: .5, burst: .4, multitarget: 1, survivalPressure: .6, timings: [.16, .38, .62, .84] },
  B11: { melee: .91, ranged: 1.08, caster: 1.03, healer: 1.06, movement: .62, burst: .65, multitarget: .75, survivalPressure: .8, timings: [.12, .31, .55, .81] },
  B12: { melee: .98, ranged: 1.02, caster: 1.06, physical: .97, healer: .94, movement: .25, burst: .7, multitarget: .15, survivalPressure: .7, timings: [.15, .37, .61, .85] },
  B13: { melee: .92, ranged: 1.08, caster: 1.03, healer: 1.05, movement: .55, burst: .35, multitarget: 1, survivalPressure: .75, timings: [.1, .28, .49, .69, .88] },
  B14: { melee: .97, ranged: 1.04, healer: 1.08, movement: .58, burst: 1, multitarget: .1, survivalPressure: 1, timings: [.11, .29, .5, .7, .89] },
}

const classBossOutput: Record<string, Partial<Record<string, number>>> = {
  B02: { 盗贼: 1.02, 战士: 1.01, 死亡骑士: 1.01, 猎人: 1.01 },
  B03: { 猎人: 1.02, 死亡骑士: 1.01, 法师: 1.02, 萨满: 1.01, 术士: 1.02 },
  B04: { 死亡骑士: 1.02, 法师: 1.02, 盗贼: 1.02, 术士: 1.02, 猎人: 1.01 },
  B05: { 盗贼: 1.03, 战士: 1.02, 萨满: 1.01, 死亡骑士: 1.02 },
  B06: { 战士: 1.04, 盗贼: 1.03, 死亡骑士: 1.03, 圣骑士: 1.02, 萨满: 1.01, 猎人: 1.01, 德鲁伊: 1.01 },
  B07: { 死亡骑士: 1.02, 战士: 1.02, 圣骑士: 1.01, 萨满: 1.01, 盗贼: 1.01 },
  B08: { 法师: 1.04, 术士: 1.03, 牧师: 1.02, 萨满: 1.01, 德鲁伊: 1.02, 猎人: .97, 死亡骑士: .97, 盗贼: .97, 战士: .97, 圣骑士: .98,},
  B09: { 盗贼: 1.03, 战士: 1.02, 圣骑士: 1.02, 萨满: 1.01, 猎人: 1.01, 死亡骑士: 1.02 },
  B10: { 法师: 1.04, 德鲁伊: 1.02, 牧师: 1.02, 猎人: 1.02, 死亡骑士: 1.02, 圣骑士: 1.01, 萨满: 1.02, 术士: 1.03 },
  B11: { 猎人: 1.02, 法师: 1.03, 术士: 1.04, 牧师: 1.02, 德鲁伊: 1.02, 萨满: 1.01, 战士: .98, 盗贼: .98, 死亡骑士: .98, 圣骑士: .98 },
  B12: { 法师: 1.04, 术士: 1.03, 牧师: 1.02, 德鲁伊: 1.02, 萨满: 1.01, 死亡骑士: 0.97, 盗贼: 0.98, 战士: 0.98, 猎人: 0.98, 圣骑士: 0.99, },
  B13: { 术士: 1.03, 法师: 1.03, 牧师: 1.03, 德鲁伊: 1.02, 猎人: 1.02, 萨满: 1.01, 战士: .98, 盗贼: 0.98, 圣骑士: 0.99},
  B14: { 死亡骑士: 1.02, 盗贼: 1.02, 法师: 1.02, 术士: 1.02, 猎人: 1.02 },
}

function encounterProfile(bossId: string): EncounterProfile {
  return { ...defaultProfile, ...(encounterProfiles[bossId] ?? {}) }
}

function specPerformanceMultiplier(bossId: string, spec: PlayerSpec): number {
  const profile = encounterProfile(bossId)
  const specProfile = specProfileByName.get(spec.spec)
  if (!specProfile || bossId === 'B01') return 1
  const rating = (value: string) => clamp(n(value), 1, 5) - 3
  let modifier = 1 + rating(specProfile.throughput) * .015
  if (spec.role.includes('DPS')) {
    modifier += profile.burst * rating(specProfile.burst) * .007
    modifier += profile.multitarget * rating(specProfile.multitarget) * .008
    modifier += profile.movement * rating(specProfile.mobility) * .007
  } else if (spec.role === '治疗') {
    modifier += profile.survivalPressure * rating(specProfile.burst) * .008
    modifier += profile.multitarget * rating(specProfile.multitarget) * .007
    modifier += profile.movement * rating(specProfile.mobility) * .006
  } else {
    modifier += profile.survivalPressure * rating(specProfile.survivability) * .01
    modifier += profile.multitarget * rating(specProfile.multitarget) * .005
    modifier += profile.movement * rating(specProfile.mobility) * .004
  }
  return clamp(modifier, .96, 1.04)
}

function specEventBonus(event: BossEvent, spec: PlayerSpec, bossId: string): number {
  const specProfile = specProfileByName.get(spec.spec)
  if (!specProfile || bossId === 'B01') return 0
  const context = `${event.event_name}|${event.attributes}|${event.team_requirement}`
  const rating = (value: string) => clamp(n(value), 1, 5) - 3
  let bonus = encounterProfile(bossId).movement * rating(specProfile.mobility) * .9
  if (/爆发|限时输出|最终输出|脑内爆发|推进/.test(context)) bonus += rating(specProfile.burst) * 1.1
  if (/AOE|小怪|构造体|卫士|触须|机器人|多目标|同步击杀|转火|控怪/.test(context)) bonus += rating(specProfile.multitarget) * 1.05
  if (/打断|读条|控制|救援|驱散|误导|减伤|分组|顺序|配合/.test(context)) bonus += rating(specProfile.utility) * 1.15
  if (/坦克|重伤|死亡|团伤|治疗|生存|重击|大爆炸/.test(context)) bonus += rating(specProfile.survivability) * .75
  if (/宠物/.test(context) && /宠物输出|团队增益/.test(specProfile.utility_tags)) bonus += 2
  if (/副坦|补位|救援/.test(context) && specProfile.utility_tags.includes('补位')) bonus += 2
  if (/团队减伤|治疗|团伤|大爆炸/.test(context) && /团队减伤|保护|辅助治疗|预防治疗/.test(specProfile.utility_tags)) bonus += 1.5
  return clamp(bonus, -4, 6)
}

function outputModifier(bossId: string, spec: PlayerSpec, playerClass: string, composite: number): number {
  const profile = encounterProfile(bossId)
  const role = spec.role
  const isDamage = role.includes('DPS')
  const isRanged = role === '远程DPS'
  const isCaster = isRanged && playerClass !== '猎人'
  let modifier = role === '治疗' ? profile.healer : role === '近战DPS' ? profile.melee : isRanged ? profile.ranged : 1
  if (isDamage) modifier *= isCaster ? profile.caster : profile.physical
  if (isCaster && profile.movement > 0) modifier *= 1 - profile.movement * clamp((94 - composite) / 260, 0, .12)
  if (isDamage) modifier *= classBossOutput[bossId]?.[playerClass] ?? 1
  modifier *= specPerformanceMultiplier(bossId, spec)
  return isDamage ? clamp(modifier, .9, 1.12) : clamp(modifier, .94, 1.08)
}

const equipmentFavoredBosses = new Set(['B02', 'B03', 'B04', 'B06'])
const mechanicFavoredBosses = new Set(['B05', 'B08', 'B09', 'B10', 'B11', 'B12', 'B13', 'B14'])
const difficultLeaveBosses = new Set(['B04', 'B05', 'B08', 'B10', 'B11', 'B12'])

function outputComposite(bossId: string, member: TeamMember, hidden: HiddenPlayer, attempt: number): number {
  const spec = currentSpec(member)
  const effective = effectiveCombatRatings(member, hidden)
  const learning = personalLearningGain(hidden, spec, attempt) * .3
  if (equipmentFavoredBosses.has(bossId)) {
    return n(spec.skill) * .32 + effective.mainSkill * .18 + effective.mechanics * .11 + effective.awareness * .09
      + n(hidden.stability) * .1 + n(hidden.teamwork) * .08 + n(spec.boss_experience) * .12 + learning
  }
  if (mechanicFavoredBosses.has(bossId)) {
    return n(spec.skill) * .23 + effective.mainSkill * .12 + effective.mechanics * .2 + effective.awareness * .17
      + n(hidden.stability) * .13 + n(hidden.teamwork) * .07 + n(spec.boss_experience) * .08 + learning
  }
  return n(spec.skill) * .3 + effective.mainSkill * .15 + effective.mechanics * .15 + effective.awareness * .12
    + n(hidden.stability) * .12 + n(hidden.teamwork) * .08 + n(spec.boss_experience) * .08 + learning
}

function recoveryMember(eventName: string, targetId: string, team: TeamMember[], rng: () => number): TeamMember {
  const tanks = team.filter((member) => currentSpec(member).role === '坦克' && member.id !== targetId)
  const healers = team.filter((member) => currentSpec(member).role === '治疗' && member.id !== targetId)
  const damage = team.filter((member) => currentSpec(member).role.includes('DPS') && member.id !== targetId)
  const needsHealingRescue = /限时输出|狂暴|治疗|团伤|血量|炸弹|凝视|火|冰|闪电/.test(eventName)
  const pool = /打断|读条|施法|小怪|构造体|卫士|触手|增援/.test(eventName) ? damage : /坦|仇恨|重击/.test(eventName) ? tanks : needsHealingRescue ? healers : [...healers, ...damage]
  const ranked = (pool.length ? pool : team.filter((member) => member.id !== targetId)).sort((a, b) => {
    const ah = hiddenById.get(a.id)!
    const bh = hiddenById.get(b.id)!
    return n(bh.teamwork) + effectiveCombatRatings(b, bh).awareness - n(ah.teamwork) - effectiveCombatRatings(a, ah).awareness
  })
  return ranked[Math.floor(rng() * Math.min(3, ranked.length))] ?? team.find((member) => member.id === targetId)!
}

function recoveryText(eventName: string, targetName: string, rng: () => number): string {
  const positional = [
    `提前让出安全位，让${targetName}从技能边缘逃了出来。`,
    `先一步带路，${targetName}擦着技能边缘躲过了致命一击。`,
    `调整面向让出通道，${targetName}刚好卡在死角躲过技能。`,
    `临时改站位给${targetName}让路，险情没有继续传染。`,
    `反应够快，把${targetName}从人群里带开，避免了连环爆炸。`,
    `用位移技能冲到${targetName}旁边，引导其走出火圈范围。`,
    `主动站到危险侧，为${targetName}腾出唯一的安全落脚点。`,
    `标记了安全路线，${targetName}沿着标记成功躲掉技能。`,
    `预判了爆炸范围，提前带${targetName}横向跑出，只差半步就被波及。`,
    `在窄道上为${targetName}清出落脚点，躲开了后续的连环红圈。`,
  ]
  const interrupt = [
    `补上备用打断，漏掉的读条没有形成减员。`,
    `在施法条即将读完的瞬间，使出了打断。`,
    `跑上去及时打断，BOSS读条刚起就被按回去了。`,
    `发现顺序乱了立刻补断，Boss这个致命技能没能释放。`,
    `临时调整了打断轮次，下一秒就把断档堵上了。`,
    `把压箱底的技能都交了，救下这一轮也救下了团长的血压。`,
    `在BOSS施法动画出现前就按下了打断，反应快到队友都愣住了。`,
    `用特殊技能代替打断，虽然时间短，但刚好拖到下个打断就绪。`,
    `在BOSS读条换目标时精准插入打断，让这次施法未能得逞。`,
  ]
  const tank = [
    `临时接怪并补上外部减伤，让坦克重新建立仇恨。`,
    `把救命技能塞给主坦，血线刷满后重新完成换坦。`,
    `先嘲讽拖了两秒，等减伤转好才把Boss交回去。`,
    `卡着最后一口血补上保护，主坦没倒，治疗也终于敢喘气。`,
    `把副目标拉离人群，原本要炸团的仇恨重新归位。`,
    `补位接住重击，换坦虽然难看，好歹算是救了团队。`,
    `提前预开大减伤，硬吃了原本分配给主坦的尖刺伤害，为换坦争取了时间。`,
    `利用位移技能快速接住失控的BOSS。`,
    `把BOSS面向带偏，让顺劈避开近战，同时用群嘲稳住新增的小怪。`,
  ]
  const add = [
    `立刻转火残血目标，再用控制拖住漏怪，赶在下一轮前清场。`,
    `暂停压本体，带队补掉漏怪后重新回到原节奏。`,
    `把漏掉的小怪标了骷髅，全团终于集火秒掉。`,
    `交出群控拖住增援，给远程争出一轮完整转火时间。`,
    `用爆发收掉最危险的那只，剩下的小怪没能滚起雪球。`,
    `把乱跑的增援拉回集火范围，避免了场面混乱。`,
    `主动去拉角落里漏掉的法系怪，并用打断封锁其读条。`,
    `看到远程被小怪追杀，立刻回头帮忙控制并转火，保住了输出。`,
    `计算好增援波次，用群体眩晕覆盖，等技能CD转好再一波清完。`,
    `放弃本体输出，先把威胁最大的怪秒掉，再回头处理其他。`,
    `用一个群晕控住四只小怪，然后一波AOE全收，没让场面失控。`,
  ]
  const choices = /打断|读条|施法/.test(eventName) ? interrupt : /坦|仇恨|重击/.test(eventName) ? tank : /小怪|构造体|卫士|触手|增援/.test(eventName) ? add : positional
  return choices[Math.floor(rng() * choices.length)]
}

function successEventDetail(eventName: string, rng: () => number): string {
  const general = [
    '全员突然像会玩了一样，流程干净得有点陌生。',
    '技能交得准时，总算没人用脸接技能了。',
    '指挥刚喊完就处理掉了，难得不是喊完才开始动。',
    '谁给他们开会了？突然这么整齐。',
    '这轮很顺，连压力怪都暂时找不到开喷角度。',
    '不知道的以为是在打单机，连个失误都没有。',
    '今天运气好？还是团队突然变强了？',
    '打断转火走位一条龙，流畅的得跟进度团似的。',
    '时间轴走得跟剧本似的，下一步要干嘛全都提前就位了。',
    '所有人像提前对过眼神，该去哪去哪，不带犹豫的。',
    '这配合说不是固定团都没人信。',
    '这团打得跟流水线似的，每个人都知道自己该干嘛。',
    '整个团队像一台上了润滑油的机器。',
    '打起来像流水线一样顺畅。',
    '时间轴记得比团长还熟，每个人都各司其职。',
    'BOSS的每个技能都有人提前应对，像对过剧本。',
    '关键技能捏得死死的，不早不晚，CD转的刚刚好。',
    '全程只有一个字形容：顺。',
    '关键技能留得很准，既没早交装死，也没晚交陪葬。',
    '全团这轮像共用一个脑子，而且居然是最会玩的那个。',
    '流程稳得像排练过，团队频道安静到只剩键盘声音。',
    '技能轴走得跟闹钟似的，一步都没乱。',
    '这波打得太顺了，反而有点不习惯。',
  ]
  const interrupt = [
    '这波该躲躲该断断，团长终于不用扯着嗓子喊人了。',
    'Boss刚准备放技能，全团已经散得比兔子还快，技能只能打空气。',
    '打断安排得明明白白，BOSS的读条基本白给。',
    '漏断？不存在的，这波打断组在线。',
    '每一个读条都被按回去了，BOSS像个哑炮。',
    '该断的一个没漏，该躲的一个没吃，舒服。',
  ]
  const tank = [
    '坦克仇恨稳定，全程没OT，近战随便打。',
    '坦克的减伤轮次卡得精准，治疗全程没抬过压力血线。',
    '减伤链覆盖了所有大技能，团队血线几乎没什么波动。',
    '坦克带位一步到位，近战全程没挪过窝。',
    '仇恨条焊死了，DPS全开也没见OT。',
    'BOSS面向一直没歪过，近战打背打得舒服。'
  ]
  const healing = [
    '驱散几乎秒解，负面状态存在时间不超过两秒。',
    '驱散比中debuff还快，负面状态基本没生效过。',
    '治疗预读刚好压上，血线抖了一下又像什么都没发生。',
    '每个濒死的人都有人奶，没有一个人被放生。',
    '群抬卡在AOE落地瞬间，全团血线一起弹回来。',
    '该单抬的单抬，该群抬的群抬，治疗没乱过。',
  ]
  const movement = [
    '站位严丝合缝，地板技找了半天没找到受害者。',
    '集合分散没出过差错，跑位都是一次到位。',
    '集合分散没出过岔子，跑位也不需要团长大喊。',
    '点名所有人都没慌，第一时间往自己该去的位置走。',
    '每个人都走得很果断，没人犹豫。',
    '跑位的时候没人撞一起，也没人迷路。',
    '跑位时所有人自觉分散，AOE伤害连两个人没砸到，简直奇迹。',
  ]
  const damage = [
    '打得跟教学视频似的，居然没人抢着刷存在感。',
    '转火快得让Boss都没反应过来。',
    '爆发全开在易伤里，伤害数字看着都痛快。',
    '该停手的时候真停了，居然没人贪半个读条。',
    '爆发技能全部对齐易伤，Boss血条直接蒸发，团长都忘了喊下一阶段。',
  ]

  const specific = /打断|读条|施法/.test(eventName)
    ? interrupt
    : /坦|仇恨|重击|换坦|减伤/.test(eventName)
      ? tank
      : /治疗|驱散|团伤|血量|回复/.test(eventName)
        ? healing
        : /分组|传送|星星|报点|顺序|集合|分散|站位|移动|火|冰|闪电|炸弹|凝视/.test(eventName)
          ? movement
          : /转火|小怪|构造体|卫士|触手|增援|限时输出|狂暴|易伤/.test(eventName)
            ? damage
            : general
  const pool = specific.length ? specific : general
  return pool[Math.floor(rng() * pool.length)]
}

const fatalNarrativePattern = /倒地|倒下|躺|砸死|点死|棺材|阵亡|死亡|暴毙|被秒|被[^。]*带走|释放灵魂|人也卡没了|全灭|团灭/

function includesRecoveryNarrative(text: string): boolean {
  return /好在|还好|有惊无险|救了回来|勉强(?:站住|活了下来)|及时(?:给上|拉回|抬回)/.test(text)
}

const PERSONAL_FAILURE_DETAILS: Record<string, string[]> = {
  责任型: ['贪了一次读条，刚倒地就主动认了。', '技能交慢了，第一时间在团队频道说明情况。', '判断错了安全位置，没有给自己的失误找借口。', '试图补队友的空档，结果把自己的节奏也打乱了。', '中了关键技能，自己先在团队频道报了出来。', '忘记切目标导致转火慢了，承认刚才走神了。', '指挥听懂了但晚了一步，表示下把会提前处理。'],
  团队执行: ['为了替队友补位多走了一步，自己反而吃到了技能。', '救场技能交得太草率，下一轮关键技能出现空档。', '注意力全放在队友身上，漏看了脚下的危险区域。', '临时接手团队任务，却没发现原本已经有人过去处理。','看到场面有点乱就擅自改了分工，结果和原定执行的人撞在一起。', '为了救一个位置站错的队友，自己也被连锁技能一起带走。'],
  自信型: ['认定自己能贪最后一个技能，结果走晚了吃到了技能。', '觉得站位足够安全，没有给下一轮技能预留空间。', '坚持用原来的处理方式，直到伤害打到自己身上才发现判断错了。', '高估了保命技能的覆盖时间，关键一秒没有接上。','认为不需要跟着大团走，单独找了个位置，然后被单点技能带走。','看了一眼脚下，认定这个圈炸不到自己，下一秒直接躺了。', '觉得治疗肯定能把自己抬回来，所以一直没开保命。', '认为不需要额外提醒，结果错过了临场指挥。'],
  宏依赖: ['一键宏按得飞起，目标一换，发现爆发全打在旧目标身上。','目标超出宏的预设范围，连续按了几次都在发呆。','习惯用焦点宏打断却忘了设焦点，直到用了打断才发现。', '脑子不转了只会按一键宏疯狂输出，等回过神来已经中了技能。', '插件没弹熟悉的提示，整个人像突然被拔了网线。', '固定循环被迫移动后彻底断档，重新起手时脑子已经宕机。'],
  不开麦: ['看到了危险却来不及语音提醒，等打字出来已经晚了。', '临时换位没有及时报点，刚好和队友撞到一起。', '能听见团长指挥，却因为没有麦无法说明自己的技能还在冷却。', '需要主动喊话的节点只能用跳跃示意，队友没能理解。', '发现自己被点名，只能在原地疯狂转圈提醒周围的人。', '打字慢了半拍，团队按照旧分工继续执行出了问题。'],
  小白型: ['把上一轮的站位记成了这一轮，跟着错误标记跑了出去。', 'BOSS技能听懂了，却没见过，认错了技能。', '第一次遇到两个技能同时出现，在原地犹豫了一会两个全吃。', '第一次见到BOSS这个技能，犹豫几秒后原地躺下。', '看到所有人开始移动，下意识跟着跑，却跟错了另一组。', '想起攻略说要开减伤，但想起来时角色已经在躺在地上了。', '把团队标记和场地标记认成了同一个东西，站到了完全错误的位置。'],
  戏精型: ['刚在团队频道说完“看我操作”，下一秒就中了技能。', '为了躲得漂亮多绕了一圈，刚好被下一个技能砸死。', '刚在语音里说完“看我这波细节”，下一秒就吃了个满技能。', '准备表演极限卡秒，技能确实卡住了，人也卡没了。', '成功躲掉第一层技能后原地跳了两下庆祝，被第二层直接命中。', '一边跑机制一边发表战术点评，话还没说完就被BOSS点名点死了。', '提前喊了一句“兄弟们别慌”，随后自己跑成了全场最慌的那个。'],
  厌蠢症: ['自己贪了半个技能，发现犯了最讨厌的低级错误后当场装死。', '急着证明这BOSS很简单，反而中了弱智技能。', '刚说完“这种技能怎么可能有人中”，自己下一轮就中了。', '复盘别人时记得很清楚，轮到自己却漏的一干二净。', '觉得这种低级错误不可能发生在自己身上，于是成功创造了案例。', '原本准备发一句“长点脑子”，看到战斗记录后默默删掉了。'],
  压力怪: ['一直催别人提速，自己的关键技能却因此早交了。', '盯着队友的站位找问题，漏看了自己脚下的圈。', '看到DPS不够就开始抢伤害，把自己任务忘得一干二净。', '复盘情绪还没收住，下一轮开打了才发现技能已经砸到自己头上了。', '不停提醒治疗加血，却没注意自己的个人减伤一直没有开。', '连续喊了几次“快点”，把原本按顺序处理的人也喊乱了。', '催促转火时切错目标，反而让节奏更乱了。'],
  数据执着: ['盯着伤害排名多打了一个技能，也因此中了BOSS技能。', '为了保持DPS没有及时停手，把不该打死的目标提前打掉。', '专注观察技能覆盖率，脚下中了技能才发现。', '战斗中一直盯着details，注意力放到自己身上时候BOSS技能已经砸到头上了。', '为了让技能命中更多目标而错过了压本体伤害。', '为了不让爆发断档，明知要集合还是站在原地打完了最后两个技能。'],
  调解者: ['忙着劝两边别吵，忘了技能已经到自己脚下了。', '复盘时一直照顾所有人的情绪，却忘了自己这一把的新任务。', '试图同时照顾两个失误点，最终哪个都没处理好。', '把救命技能先交给队友，自己的保命因此还在冷却。', '为了不让队友紧张，一直在语音里解释机制，忘了自己也要跑。', '发现队友漏了任务后主动补上，却没告诉别人自己的位置已经空了。'],
  拱火者: ['刚问完“谁会犯这种错”，自己就躺尸了。', '忙着观察别人有没有出错，没发现技能已经点到自己。', '准备在团队频道发问号，手离开按键时错过了移动。', '为了看清事故现场多站了一秒，结果自己也被写进事故报告。', '故意问了一句“不会要灭吧”，随后亲手启动了灭团流程。', '看到队友吃技能后笑出了声，下一秒没听清自己的点名。', '本来想站在旁边围观谁会炸团，最后发现点名一直在自己身上。'],
  沉默型: ['没有解释自己的技能状态，队友按默认分工后出现了问题。', '看到临时变化只在原地跳了一下，没人理解这个信号。', '换位时没有发出任何提示，两个人因此撞车。', '发现判断错误后没有及时求助，险情一路扩大。', '口令有疑问却保持沉默，最终按错了处理方向。', '关键技能还差几秒冷却却没有说明，所有人都在等他先交。'],
  老司机: ['按旧版本经验提前走位，却撞上了当前BOSS的技能。', '觉得常规机制无需确认，忽略了团长临时调整的细节。', '凭经验没有听团长指挥，偏偏之前没中过这个技能。', '认为这轮压力不高，保命技能留到了棺材里。', '觉得这个Boss闭着眼也会打，结果打着打着就躺尸了。', '凭印象判断下一次技能时间，提前十几秒把减伤全部交空。'],
}

function personalizedEventDetail(playerId: string, eventName: string, status: '成功' | '险情' | '失败', fallback: string, roll: number, role: Role, personalizedRoll: number, traitRoll: number): string {
  const hidden = hiddenById.get(playerId)
  const playerName = publicById.get(playerId)?.name ?? '一名成员'
  const pickByRoll = (items: string[], value = roll) => items[Math.min(items.length - 1, Math.floor(clamp(value, 0, .999999) * items.length))]
  const pickStatusText = (items: string[]) => {
    const eligible = status === '险情' ? items.filter((text) => !fatalNarrativePattern.test(text)) : items
    return pickByRoll(eligible.length ? eligible : items)
  }
  const usePersonalizedText = personalizedRoll < .7

  if (playerId === 'P086') {
    if (status === '成功' && roll > .9) return `汉祚将尽突然打出一波神级操作，YY里随即传来一句：“嗨，这有啥的，常规操作而已。”`
    if (status !== '成功' && usePersonalizedText) {
      const mistakes = [
        '汉祚将尽开怪后才发现箭没带够，输出当场进入默哀模式。',
        '汉祚将尽疯狂按键发现按不出技能，大喊有bug，最后才发现背的是钓鱼竿。',
        '汉祚将尽突然问“这个要躲吗？”，问题得到答案时人已经中技能了。',
        '汉祚将尽突然问“这个是好圈还是坏圈”，问题得到答案时已经中圈。',
        '汉祚将尽还在确认下一轮该站哪里，没注意这一轮的技能已经落到脚下。',
        '汉祚将尽发现宠物不听命令了，于是手忙脚一通乱按。',
        '汉祚将尽翻背包找工程道具，被背包遮挡了半个屏幕，等找到的时候发现已经中了技能了。',
        '汉祚将尽问“现在打哪个？”，得到回答时发现盯着免疫目标打了半天。',
        '汉祚将尽说别慌我有大红，准备点击时才发现忘了拖到快捷栏。',
      ]
      return pickStatusText(mistakes)
    }
  }

  if ((playerId === 'P087' || playerId === 'P098') && status !== '成功' && usePersonalizedText) {
    const ideas = ['临时改成了一个没人听过的站位', '建议全团一起按自己的思路执行', '认为自己可以单独处理这轮点名', '现场发明了新的转火顺序', '把攻略里BOSS的技能记串了']
    return `${playerName}${pickByRoll(ideas)}，执行后证明主要可行在语气上。`
  }

  const usesFranTankLogic = (playerId === 'P083' || playerId === 'P091') && role === '坦克'
  if (usesFranTankLogic && status === '险情' && usePersonalizedText) {
    const dangerTexts = [
      `${playerName}第一拍慢了半秒，好在队友还有技能，勉强救了回来。`,
      `${playerName}减伤开晚了半拍，血线见底，好在治疗及时给上技能，勉强站住。`,
      `${playerName}一键宏按键延迟，BOSS差点转头打DPS，还好被嘲讽及时拉回，有惊无险。`,
      `${playerName}没躲开技能，血条直接黑了，还好治疗预读了一口大奶，勉强活了下来。`,
    ]
    return pickByRoll(dangerTexts)
  }
  if (usesFranTankLogic && status === '失败' && usePersonalizedText) {
    const failureTexts = [
      `${playerName}的一键宏卡CD了，减伤断档，强力装备的坦克也没能抗住。`,
      `${playerName}的减伤交重了，下一波尖刺来的时候手上全在CD。`,
      `${playerName}的翻页宏翻过头了，嘲讽按成了别的技能，仇恨直接失控。`,
      `${playerName}的一键宏写错了顺序，减伤没覆盖上，装备再好也白搭。`,
      `${playerName}的宏绑定了饰品，但饰品在CD，后面的技能全卡住了。`,
      `${playerName}的鼠标宏卡CD了，技能没放出来，脸接BOSS一套带走。`,
      `${playerName}的宏绑了太多技能，执行到一半卡住，保命技能被卡在队列后面。`,
      `${playerName}的减伤没覆盖到尖刺伤害，直接被秒。`,
      `${playerName}忘记开减伤，被BOSS一巴掌带走。`,
      `一键宏出了BUG，${playerName}原地发呆，被BOSS几巴掌直接拍倒。`,
    ]
    return pickByRoll(failureTexts)
  }

  const usesMacroOutputLogic = (playerId === 'P091' && role.includes('DPS')) || playerId === 'P097' || playerId === 'P130'
  if (usesMacroOutputLogic && status !== '成功' && usePersonalizedText) {
    const macroTexts = [
      `${playerName}的一键宏突然失灵，连续按了几次都没有反应。`,
      `${playerName}切换目标后宏还锁在旧目标上，关键技能全部打空。`,
      `${playerName}习惯用焦点宏处理机制，却忘了设置焦点，按了半天发现自己在原地发呆。`,
      `${playerName}移动后宏循环彻底断档，站在原地重新找技能时已经吃满伤害。`,
      `${playerName}的一键宏卡在上一轮技能上，关键时刻发现按什么都没用。`,
    ]
    return pickStatusText(macroTexts)
  }

  const roastPlayerIds = new Set(['P095', 'P081', 'P122', 'P132'])
  if (roastPlayerIds.has(playerId) && status !== '成功' && roll < .02) {
    const roastTexts = [
      `${playerName}刚吐槽完低级错误，自己脑子也宕机了两秒。`,
      `${playerName}刚说完“这TM也能中？”，下一轮就亲自演示了一遍。`,
      `${playerName}正准备点评是谁犯蠢，战斗记录先把自己的名字亮了出来。`,
      `${playerName}刚把“长点脑子”打到一半，发现这次事故的主角正是自己。`,
      `${playerName}前一秒刚骂完SB才能犯这种错吧，后一秒就骂上自己是SB。`,
    ]
    return pickByRoll(roastTexts, roll / .02)
  }

  const quietCalloutPlayerIds = new Set(['P093', 'P084', 'P121'])
  if (quietCalloutPlayerIds.has(playerId) && status !== '成功' && usePersonalizedText && /分组|传送|星星|报点|顺序/.test(eventName)) {
    const quietCalloutTexts = [
      `${playerName}处理本身没问题，但不开麦让临时报点慢了半拍。`,
      `${playerName}看见分组临时变化，只在原地跳了两下，可惜没人看懂他的意思。`,
      `${playerName}位置有变化却没在语音里报，等字打出来时两组已经撞在一起。`,
      `${playerName}知道下一步该怎么处理，但关键报点没喊出来，队友仍按旧顺序执行。`,
      `${playerName}被点名后没开麦，只能靠左右横跳提醒，可惜没人看懂他的意思。`,
      `${playerName}发现顺序出了问题却没有及时喊停，等团队反应过来时为时已晚。`,
    ]
    return pickStatusText(quietCalloutTexts)
  }

  const lagComputerPlayerIds = new Set(['P101', 'P126'])
  if (lagComputerPlayerIds.has(playerId) && status !== '成功' && usePersonalizedText) {
    const lagComputerTexts = [
      `${playerName}突然站在原地一动不动，YY里传来一句：“我电脑卡得不动了。”`,
      `${playerName}走位走到一半开始瞬移，随后YY传来抱怨：“我这电脑跟幻灯片似的。”`,
      `${playerName}画面卡成一帧一帧，等恢复时角色已经躺在地上了。`,
      `${playerName}在YY里喊着“等会，卡住了”，角色却已经直直的躺在地上。`,
    ]
    return pickStatusText(lagComputerTexts)
  }

  const hardwarePlayerIds = new Set(['P094', 'P085'])
  if (hardwarePlayerIds.has(playerId) && status !== '成功' && usePersonalizedText) {
    const hardwareTexts = [
      `${playerName}正在炫耀新电脑，突然原地不动了，YY中传来了声音：“我黑屏了，好像掉驱动了。”`,
      `${playerName}正在炫耀新鼠标，突然原地不动了，YY中传来了声音：“等会，我鼠标没电了。”`,
      `${playerName}刚说新电脑帧数稳得很，角色突然定在原地，YY里只剩一句：“等会，驱动又崩了。”`,
      `${playerName}正在展示新鼠标的回报率，人物忽然直线撞进技能，随后传来：“不是，我鼠标怎么断连了？”`,
      `${playerName}还在介绍新显卡的性能，画面突然卡死，恢复时屏幕上只剩释放灵魂。`,
    ]
    return pickStatusText(hardwareTexts)
  }

  const confusedPlayerIds = new Set(['P088', 'P096', 'P100', 'P131'])
  if (confusedPlayerIds.has(playerId) && status !== '成功' && usePersonalizedText) {
    const confusedTexts = [
      `${playerName}吃满伤害倒地后才问：“？这什么技能。”`,
      `${playerName}倒地后才问：“？我怎么倒了。”`,
      `${playerName}看到所有人突然散开，只来得及问一句：“这个要躲吗？”`,
      `${playerName}技能吃完才反应过来：“哦，这个点我是吧？”`,
      `${playerName}技能吃完才反应过来：“哦，这个技能要躲吗？”`,
      `${playerName}技能吃完才反应过来：“没人跟我说这个技能要躲啊”`,
    ]
    return pickStatusText(confusedTexts)
  }

  const wrongTalentPlayerIds = new Set(['P082', 'P092', 'P120', 'P128'])
  if (wrongTalentPlayerIds.has(playerId) && status !== '成功' && usePersonalizedText) {
    const wrongTalentTexts = [
      `${playerName}倒下后才发现天赋点错了，YY里传来声音：“啊呦，天赋点错了。”`,
      `${playerName}开怪后发现关键技能根本没点出来，YY里传来一句：“天赋切错了。”`,
      `${playerName}准备交关键技能时发现图标是灰的，随后才想起这套天赋压根没点。`,
      `${playerName}一直觉得技能手感不对，倒地后检查半天，终于发现自己带错天赋了。`,
      `${playerName}开怪前信誓旦旦说已经准备好，出事后第一句话却是：“等会，我怎么是这套天赋？”`,
    ]
    return pickStatusText(wrongTalentTexts)
  }

  if (hidden && status !== '成功') {
    const availableVariants = (trait: string) => {
      const variants = PERSONAL_FAILURE_DETAILS[trait] ?? []
      return status === '险情' ? variants.filter((text) => !fatalNarrativePattern.test(text)) : variants
    }
    const primaryVariants = availableVariants(hidden.social_primary)
    const secondaryVariants = hidden.social_secondary !== hidden.social_primary
      ? availableVariants(hidden.social_secondary)
      : []
    const variants = primaryVariants.length && secondaryVariants.length
      ? (traitRoll < .7 ? primaryVariants : secondaryVariants)
      : primaryVariants.length
        ? primaryVariants
        : secondaryVariants
    if (variants.length) return `${playerName}${pickByRoll(variants)}`
  }
  return fallback
}

function describesDeath(text: string): boolean {
  return /死亡|被击杀|死人|倒坦|猝死|秒坦|报废|消耗战复/.test(text)
}

function isCatastrophicFailure(text: string): boolean {
  return /直接灭团|多人|全灭|两组.*报废|火铺满|失控|连续漏|连锁|横穿全团|打穿心脏|猫群|拉全组|恐惧后|狂暴|关键职责缺失|场地组全灭|完全失控|同时爆炸|治疗压力失控|多次不同步|全部空蓝|持续回血|连续触云|漏门过多|关键触须失控|多人被控|脑内超时|减伤断档|两星同时|多人未进洞/.test(text)
}

function deathTolerance(boss: Boss): number {
  return boss.healing_pressure === '极高' ? 0 : boss.healing_pressure === '高' ? 1 : 2
}

const caiFamilyIds = new Set(['P108', 'P115', 'P117'])

function incidentalDeathRisk(boss: Boss, member: TeamMember, hidden: HiddenPlayer, spec: PlayerSpec, severeFailure: boolean): number {
  const pressure = ({ 低: 0, 中: .01, 高: .035, 极高: .065 } as const)[boss.healing_pressure]
  const effective = effectiveCombatRatings(member, hidden)
  const personalWeakness = clamp((72 - effective.awareness) / 500, 0, .11) + clamp((68 - effective.mechanics) / 650, 0, .08)
  const profile = encounterProfile(boss.boss_id)
  const specProfile = specProfileByName.get(spec.spec)
  const survivalAdjustment = specProfile ? (3 - clamp(n(specProfile.survivability), 1, 5)) * .012 : 0
  const movementExposure = specProfile ? profile.movement * (3 - clamp(n(specProfile.mobility), 1, 5)) * .006 : 0
  const multiplier = configNumber('incidental_death_multiplier', 1.25)
  return clamp(((severeFailure ? .2 : .045) + pressure + personalWeakness + survivalAdjustment + movementExposure) * multiplier, .03, severeFailure ? .5 : .26)
}

export function simulateCombat(seed: string, boss: Boss, attempt: number, team: TeamMember[], morale: number, pot: number, modifiers: CombatModifiers = {}): CombatResult {
  const rng = rngFor(seed, boss.boss_id, attempt, team.map((m) => `${m.id}:${m.currentSpec}`).join(','), 'combat')
  const isVehicleEncounter = boss.boss_id === 'B01'
  const counts = roleCounts(team)
  const tanks = team.filter((m) => currentSpec(m).role === '坦克')
  const healers = team.filter((m) => currentSpec(m).role === '治疗')
  const dps = team.filter((m) => currentSpec(m).role.includes('DPS'))
  const allData = team.map((m) => ({ m, h: hiddenById.get(m.id)!, s: currentSpec(m), p: publicById.get(m.id)! }))
  const baseSkill = avg(allData.map(({ m, h, s }) => {
    const effective = effectiveCombatRatings(m, h)
    return isVehicleEncounter
      ? effective.mechanics * .4 + effective.awareness * .25 + n(h.stability) * .2 + n(h.teamwork) * .15
      : n(s.skill) * 0.4 + effective.mainSkill * 0.15 + effective.mechanics * 0.2 + effective.awareness * 0.15 + n(h.stability) * 0.06 + n(h.teamwork) * 0.04
  }))
  const itemLevel = avg(allData.map(({ m, p }) => m.itemLevel ?? n(p.signup_item_level)))
  const ilvlBonus = (itemLevel - 218) * 0.9
  const attemptBonus = avg(allData.map(({ h, s }) => personalLearningGain(h, s, attempt)))
  const moraleBonus = (morale - 70) * 0.16
  const teamComposure = avg(allData.map(({ h }) => (n(h.mentality) + n(h.pressure_resistance)) / 2))
  const composureBonus = (teamComposure - 70) * .1
  const lowMoralePenalty = morale < 25
    ? configNumber('low_morale_power_penalty_25', 7)
    : morale < 40
      ? configNumber('low_morale_power_penalty_40', 4)
      : morale < 55
        ? configNumber('low_morale_power_penalty_55', 2)
        : 0
  const providedBuffs = activeRaidBuffs(team)
  const raidBuffBonus = isVehicleEncounter ? 0 : Math.min(configNumber('raid_buff_power_cap', 2.4), providedBuffs.reduce((sum, buff) => sum + n(buff.power_bonus), 0))
  const interrupterClasses = new Set(['死亡骑士', '法师', '萨满', '圣骑士', '术士', '战士', '盗贼'])
  const interrupters = allData.filter(({ s, p }) => s.role !== '治疗' && (s.role === '近战DPS' || s.role === '坦克' || interrupterClasses.has(p.class))).length
  const hasBloodlust = allData.some(({ p }) => p.class === '萨满')
  const hasMisdirection = allData.some(({ s }) => specProfileByName.get(s.spec)?.utility_tags.includes('误导'))
  const hasPetClass = allData.some(({ p }) => p.class === '猎人' || p.class === '术士')
  const burstSources = allData.filter(({ s }) => n(specProfileByName.get(s.spec)?.burst) >= 4).length
  const aoeSources = allData.filter(({ s }) => n(specProfileByName.get(s.spec)?.multitarget) >= 4).length
  const controlSources = allData.filter(({ s }) => /控制|群控|拉怪/.test(specProfileByName.get(s.spec)?.utility_tags ?? '')).length
  const hasRaidMitigation = allData.some(({ s }) => /团队减伤|保护|预防治疗/.test(specProfileByName.get(s.spec)?.utility_tags ?? ''))
  const leaderCount = allData.filter(({ m, h }) => m.id === 'P132' || [h.social_primary, h.social_secondary, h.personality_type].includes('团长型')).length
  const hasCommander = allData.some(({ m }) => m.id === 'P092')
  const hasDbFriction = allData.some(({ m }) => m.id === 'P109') && allData.some(({ h }) => [h.social_primary, h.social_secondary].includes('厌蠢症'))
  const encouragers = allData.filter(({ m }) => atmospherePlayerIds.has(m.id))
  const encourager = encouragers[Math.floor(rngFor(seed, boss.boss_id, attempt, 'encourager')() * encouragers.length)]
  const hasEncourager = Boolean(encourager)
  const encouragerName = encourager?.p.name ?? '气氛组'
  const healerQuality = healers.length ? avg(healers.map((m) => {
    const h = hiddenById.get(m.id)!
    return n(currentSpec(m).skill) * .55 + effectiveCombatRatings(m, h).awareness * .15 + n(h.stability) * .15 + n(h.teamwork) * .15
  })) : 0
  const tankQuality = tanks.length ? avg(tanks.map((m) => {
    const h = hiddenById.get(m.id)!
    return n(currentSpec(m).skill) * .55 + effectiveCombatRatings(m, h).mechanics * .15 + n(h.stability) * .15 + n(h.teamwork) * .15
  })) : 0
  const healingRequirement = ({ 低: 60, 中: 68, 高: 75, 极高: 82 } as const)[boss.healing_pressure]
  const healingCapacity = healerQuality + Math.max(0, healers.length - 2) * 10 - (healers.length === 1 ? 8 : 0)
  const healingShortfall = healingRequirement - healingCapacity
  const minTanks = n(boss.min_tanks)
  const maxTanks = n(boss.max_tanks)
  const minHealers = n(boss.min_healers)
  const maxHealers = n(boss.max_healers)
  const minimumTankItemLevel = n(boss.min_tank_ilvl)
  const tankGroupItemLevel = tanks.length ? Math.round(avg(tanks.map((member) => member.itemLevel))) : 0
  const requiredDps = counts.坦克 > minTanks
    ? Math.max(n(boss.min_dps), n(boss.extra_tank_min_dps))
    : n(boss.min_dps)
  const tankIssue = isVehicleEncounter ? undefined : counts.坦克 < minTanks
    ? { reason: `${boss.boss_name}至少需要${minTanks}名坦克，当前只有${counts.坦克}名，换坦或副目标无人承接。`, timing: .2 }
    : counts.坦克 > maxTanks
      ? { reason: `${boss.boss_name}最多适合${maxTanks}名坦克，当前塞了${counts.坦克}名，输出席位被严重挤占。`, timing: .78 }
      : minimumTankItemLevel > 0 && tankGroupItemLevel < minimumTankItemLevel
        ? { reason: `${boss.boss_name}要求坦克组平均至少${minimumTankItemLevel}装等，当前只有${tankGroupItemLevel}，第一轮重击就压穿了减伤。`, timing: .26 }
        : undefined
  const healingIssue = boss.tank_mode === '载具' ? undefined
    : counts.治疗 < minHealers
    ? { reason: `${boss.boss_name}至少需要${minHealers}名治疗，当前只有${counts.治疗}名，持续伤害没有足够人手覆盖。`, timing: .24 }
    : counts.治疗 > maxHealers
      ? { reason: `${boss.boss_name}最多容纳${maxHealers}名治疗，当前带了${counts.治疗}名，输出不足以在狂暴前结束战斗。`, timing: .82 }
      : undefined
  const structureIssue = isVehicleEncounter ? undefined : tankIssue ?? healingIssue ?? (dps.length < requiredDps
    ? { reason: `${boss.boss_name}当前配置至少需要${requiredDps}名输出，实际只有${dps.length}名，最终被血量拖进狂暴。`, timing: .84 }
    : undefined)

  let structurePenalty = 0
  if (boss.tank_mode !== '载具') {
    if (counts.坦克 === 0) structurePenalty -= 40
    else if (boss.tank_mode === '双坦' && counts.坦克 === 1) structurePenalty -= 20
    else if (boss.tank_mode === '单坦' && counts.坦克 >= 2) structurePenalty -= (counts.坦克 - 1) * 4
    else if (counts.坦克 >= 3) structurePenalty -= (counts.坦克 - 2) * 14
  }
  if (boss.tank_mode !== '载具' && counts.治疗 === 0) structurePenalty -= 42
  else if (boss.tank_mode !== '载具') {
    if (healingShortfall > 0) structurePenalty -= Math.min(27, healingShortfall * .75)
    if (counts.治疗 === 3 && ['低', '中'].includes(boss.healing_pressure)) structurePenalty -= 4
    if (counts.治疗 >= 4) structurePenalty -= 7 + (counts.治疗 - 4) * 6
  }
  if (!isVehicleEncounter && dps.length < 5) structurePenalty -= (5 - dps.length) * 5
  if (boss.boss_id === 'B03' && counts.远程DPS < 2) structurePenalty -= (2 - counts.远程DPS) * 7
  const profile = encounterProfile(boss.boss_id)
  const compositionOutputFit = dps.length
    ? avg(dps.map((member) => outputModifier(boss.boss_id, currentSpec(member), publicById.get(member.id)!.class, 80)))
    : 0
  if (!isVehicleEncounter) structurePenalty += (compositionOutputFit - 1) * 20
  if (!isVehicleEncounter && profile.melee <= .88 && counts.近战DPS >= 4) structurePenalty -= (counts.近战DPS - 3) * 2.5

  const eliteCoordinationBonus = baseSkill >= 88 ? 2 : 0
  const observerBonus = boss.boss_id === 'B14' && team.some((member) => member.id === 'P094') ? 2 : 0
  const teamPower = baseSkill + ilvlBonus + attemptBonus + moraleBonus + composureBonus - lowMoralePenalty + raidBuffBonus + structurePenalty + eliteCoordinationBonus + (hasCommander ? 1.5 : 0) + observerBonus
  const progressionRelief: Record<string, number> = { B02: 1, B03: 1, B04: 6, B05: 7, B06: 1, B07: 4, B08: 6, B09: 6, B10: 6, B11: 10, B12: 9, B13: 12, B14: 11 }
  const bossDc = n(boss.base_dc) - (progressionRelief[boss.boss_id] ?? 0)
  const events = bossEvents.filter((e) => e.boss_id === boss.boss_id)
  const results: EventResult[] = []
  const deaths: CombatDeath[] = []
  const permanentlyDead = new Set<string>()
  const battleResSources = allData.filter(({ p }) => p.class === '德鲁伊')
  let battleResUsed = false
  const selfResUsed = new Set<string>()
  const tolerance = deathTolerance(boss)
  let danger = Math.max(0, bossDc + 7 - teamPower)
  let severe = false
  let responsible = ''
  const specialWipeChance = configNumber('special_wipe_event_pct', .3) / 100
  const switchedMembers = team.filter((member) => member.currentSpec !== publicById.get(member.id)?.signup_spec)
  let specialWipe: { target: TeamMember; name: string; detail: string; timeRatio: number } | undefined
  if (!isVehicleEncounter && switchedMembers.length && rngFor(seed, boss.boss_id, attempt, 'forgot-spec')() < specialWipeChance) {
    const target = switchedMembers[Math.floor(rngFor(seed, boss.boss_id, attempt, 'forgot-spec-target')() * switchedMembers.length)]
    const targetName = publicById.get(target.id)?.name ?? '一名队员'
    specialWipe = { target, name: '没切天赋', detail: `${targetName}临时切换职责后忘了切换对应天赋，开怪后关键技能全部对不上，第一轮压力直接击穿全团。`, timeRatio: .12 }
  } else if (!isVehicleEncounter && rngFor(seed, boss.boss_id, attempt, 'missing-action-bar')() < specialWipeChance) {
    const target = team[Math.floor(rngFor(seed, boss.boss_id, attempt, 'missing-action-bar-target')() * team.length)]
    const targetName = publicById.get(target.id)?.name ?? '一名队员'
    specialWipe = { target, name: '技能没拖出来', detail: `${targetName}轮到使用关键技能时才发现技能没有拖进动作条，临时翻技能书已经来不及，只能眼看着全团暴毙。`, timeRatio: .18 }
  } else if (!isVehicleEncounter && rngFor(seed, boss.boss_id, attempt, 'auto-run-pull')() < specialWipeChance) {
    const target = team[Math.floor(rngFor(seed, boss.boss_id, attempt, 'auto-run-pull-target')() * team.length)]
    const targetName = publicById.get(target.id)?.name ?? '一名队员'
    specialWipe = { target, name: '自动奔跑开怪', detail: `${targetName}误触自动奔跑，还没有就位确认就跑到Boss脚下，坦克和治疗没有准备好，整团被迫接战后迅速崩溃。`, timeRatio: .06 }
  }
  if (specialWipe) {
    severe = true
    responsible = specialWipe.target.id
    danger += 22
    results.push({ name: specialWipe.name, status: '失败', detail: specialWipe.detail, responsible: publicById.get(specialWipe.target.id)?.name, timeRatio: specialWipe.timeRatio })
  }

  const eventDetail = (
    playerId: string,
    eventName: string,
    status: '成功' | '险情' | '失败',
    fallback: string,
    roll: number,
    role: Role,
    personalizedRoll: number,
    traitRoll: number,
  ) => isVehicleEncounter
    ? fallback
    : personalizedEventDetail(playerId, eventName, status, fallback, roll, role, personalizedRoll, traitRoll)

  const recordDeath = (target: TeamMember, eventName: string, timeRatio: number) => {
    const spec = currentSpec(target)
    const targetPublic = publicById.get(target.id)!
    let resurrectedBy: string | undefined
    if (spec.role !== '坦克') {
      if (targetPublic.class === '萨满' && !selfResUsed.has(target.id)) {
        selfResUsed.add(target.id)
        resurrectedBy = targetPublic.name
      } else if (targetPublic.class === '术士' && !battleResUsed && !selfResUsed.has(target.id)) {
        selfResUsed.add(target.id)
        battleResUsed = true
        resurrectedBy = targetPublic.name
      } else if (!battleResUsed) {
        const source = battleResSources.find(({ m }) => m.id !== target.id && !permanentlyDead.has(m.id))
        if (source) {
          battleResUsed = true
          resurrectedBy = source.p.name
        }
      }
    }
    const battleResurrected = Boolean(resurrectedBy)
    if (!battleResurrected) permanentlyDead.add(target.id)
    const death: CombatDeath = {
      playerId: target.id,
      name: targetPublic.name,
      role: spec.role,
      eventName,
      timeRatio,
      battleResurrected,
      resurrectedBy,
    }
    deaths.push(death)
    const fatal = spec.role === '坦克' || permanentlyDead.size > tolerance
    return { death, fatal }
  }

  for (const [eventIndex, event] of events.entries()) {
    if (severe) break
    const alive = (members: TeamMember[]) => members.filter((member) => !permanentlyDead.has(member.id))
    const livingTeam = alive(team)
    const livingTanks = alive(tanks)
    const livingHealers = alive(healers)
    const livingDps = alive(dps)
    const livingRanged = livingDps.filter((member) => currentSpec(member).role === '远程DPS')
    const livingMelee = livingDps.filter((member) => currentSpec(member).role === '近战DPS')
    const livingPetClasses = livingTeam.filter((member) => ['猎人', '术士'].includes(publicById.get(member.id)?.class ?? ''))
    const targetPool = event.target.startsWith('主坦') ? (livingTanks.slice(0, 1).length ? livingTanks.slice(0, 1) : livingTeam)
      : event.target.startsWith('副坦') ? (livingTanks.slice(1, 2).length ? livingTanks.slice(1, 2) : livingTanks.length ? livingTanks : livingTeam)
        : event.target.startsWith('随机远程') || event.target === '远程组' || event.target === '施法者' ? (livingRanged.length ? livingRanged : livingDps.length ? livingDps : livingTeam)
          : event.target === '近战组' ? (livingMelee.length ? livingMelee : livingDps.length ? livingDps : livingTeam)
            : event.target === '猎人/术士' ? (livingPetClasses.length ? livingPetClasses : livingTeam)
              : event.target.startsWith('随机') ? livingTeam
                : event.target.includes('坦') ? (livingTanks.length ? livingTanks : livingTeam)
                  : event.target.includes('治疗') ? (livingHealers.length ? livingHealers : livingTeam)
                    : event.target.includes('DPS') || event.target.includes('打断') ? (livingDps.length ? livingDps : livingTeam) : livingTeam
    const target = targetPool[Math.floor(rng() * targetPool.length)]
    const targetHidden = hiddenById.get(target.id)!
    const targetSpec = currentSpec(target)
    const targetSpecProfile = specProfileByName.get(targetSpec.spec)
    const targetEffective = effectiveCombatRatings(target, targetHidden)
    const personalRoll = rngFor(seed, boss.boss_id, attempt, target.id, event.event_id, 'personality-event')()
    const personalizedRoll = rngFor(seed, boss.boss_id, attempt, target.id, event.event_id, 'personalized-detail')()
    const traitRoll = rngFor(seed, boss.boss_id, attempt, target.id, event.event_id, 'personality-trait')()
    let eventAbility = targetEffective.mechanics * 0.35 + targetEffective.awareness * 0.25 + n(targetHidden.stability) * 0.2 + n(targetHidden.teamwork) * 0.1 + n(targetSpec.skill) * 0.1 + personalLearningGain(targetHidden, targetSpec, attempt)
      + (n(targetHidden.mentality) - 70) * .06
      + (n(targetHidden.pressure_resistance) - 70) * .08
      + (modifiers.teamMechanics ?? 0)
      + (modifiers.playerMechanics?.[target.id] ?? 0)
    const collaborativeAbility = (members: TeamMember[]) => members.length
      ? (avg(members.map((member) => {
        const hidden = hiddenById.get(member.id)!
        const effective = effectiveCombatRatings(member, hidden)
        return n(currentSpec(member).skill) * .35 + effective.mechanics * .25 + effective.awareness * .15 + n(hidden.stability) * .15 + n(hidden.teamwork) * .1
      })) - 82) * .2
      : -10
    if (event.target.includes('+治疗')) eventAbility += collaborativeAbility(livingHealers)
    if (event.target.includes('+DPS') || event.target.includes('+随机DPS')) eventAbility += collaborativeAbility(livingDps)
    if (event.target.includes('+猎人')) eventAbility += collaborativeAbility(livingTeam.filter((member) => publicById.get(member.id)?.class === '猎人'))
    if (event.target.startsWith('双坦')) eventAbility += collaborativeAbility(livingTanks.filter((member) => member.id !== target.id))
    if (targetSpecProfile) eventAbility += specEventBonus(event, targetSpec, boss.boss_id)
    if (target.id === 'P086') eventAbility += personalRoll < .08 ? -28 : personalRoll > .9 ? 12 : 0
    if ((target.id === 'P087' || target.id === 'P098') && personalRoll < .16) eventAbility -= 8
    if ([targetHidden.social_primary, targetHidden.social_secondary].includes('宏依赖')) eventAbility += profile.movement >= .4 ? -10 : 4
    if ([targetHidden.social_primary, targetHidden.social_secondary].includes('团队执行')) eventAbility += 3
    if ([targetHidden.social_primary, targetHidden.social_secondary].includes('不开麦') && /报点|顺序|传送|分组|星星/.test(event.event_name)) eventAbility -= 4
    if (['P090', 'P099', 'P125'].includes(target.id) && attempt > 1) eventAbility += 5
    if (target.id === 'P094' && boss.boss_id === 'B14') eventAbility += 12
    if (['P081', 'P095', 'P122', 'P132'].includes(target.id) && personalRoll < .02) eventAbility -= 11
    if (target.id === 'P092') eventAbility += 2
    if (['P093', 'P084', 'P121'].includes(target.id) && /分组|传送|星星|报点|顺序/.test(event.event_name)) eventAbility -= 7
    const support = (teamPower - bossDc) * 0.65
    let requirementPenalty = 0
    if (event.team_requirement.includes('误导/双坦')) {
      if (!hasMisdirection && tanks.length < 2) requirementPenalty -= 20
    } else if ((event.team_requirement.includes('双坦') || event.team_requirement.includes('副坦')) && tanks.length < 2) {
      requirementPenalty -= boss.tank_mode === '双坦' ? 34 : boss.tank_mode === '弹性' ? 10 : 0
    }
    if (event.team_requirement.includes('双高质量坦克')) {
      if (tanks.length < 2) requirementPenalty -= 34
      else requirementPenalty -= Math.min(18, Math.max(0, (82 - tankQuality) * .9))
    }
    if (event.team_requirement.includes('2治疗') || event.team_requirement.includes('双治疗') || event.team_requirement.includes('2-3治疗')) {
      if (healers.length < 2) requirementPenalty -= healerQuality >= 90 && boss.healing_pressure !== '极高' ? 9 : 34
      requirementPenalty -= Math.min(18, Math.max(0, healingShortfall * .7))
    }
    if (event.team_requirement.includes('2-3治疗') && healers.length > 3) requirementPenalty -= 8
    if (event.team_requirement.includes('3打断') && interrupters < 3) requirementPenalty -= 20
    if (event.team_requirement.includes('打断+爆发')) {
      if (interrupters < 3) requirementPenalty -= 12
      if (burstSources < 2) requirementPenalty -= 10
    }
    const requiredRanged = event.team_requirement.includes('至少3远程') ? 3 : event.team_requirement.includes('远程') ? 2 : 0
    if (requiredRanged && counts.远程DPS < requiredRanged) requirementPenalty -= (requiredRanged - counts.远程DPS) * 8
    if (event.team_requirement.includes('控制/AOE') && Math.max(controlSources, aoeSources) < 2) requirementPenalty -= 14
    if (event.team_requirement.includes('远程/AOE') && aoeSources < 2) requirementPenalty -= 8
    if (event.team_requirement.includes('远程/爆发') && burstSources < 2) requirementPenalty -= 8
    if (event.team_requirement.includes('嗜血/爆发')) {
      if (!hasBloodlust && burstSources < 2) requirementPenalty -= 12
    } else if (event.team_requirement.includes('嗜血') && !hasBloodlust) requirementPenalty -= 12
    if (event.team_requirement.includes('团队减伤') && !hasRaidMitigation) requirementPenalty -= 12
    if (event.team_requirement.includes('有宠物职业') && !hasPetClass) requirementPenalty -= 14
    if (event.team_requirement.includes('近战不超过4') && counts.近战DPS > 4) requirementPenalty -= (counts.近战DPS - 4) * 8
    if (event.team_requirement.includes('团长型不超过1') && leaderCount > 1) requirementPenalty -= (leaderCount - 1) * 8
    const chance = clamp(58 + (eventAbility - n(event.event_dc)) * 1.05 + support + requirementPenalty + (rng() * 10 - 5), 5, 96)
    const roll = rng() * 100
    const timeRatio = profile.timings[eventIndex] ?? (eventIndex + 1) / (events.length + 1)
    if (roll <= chance) {
      const cleanDetail = successEventDetail(event.event_name, rng)
      results.push({ name: event.event_name, status: '成功', detail: eventDetail(target.id, event.event_name, '成功', cleanDetail, personalRoll, currentSpec(target).role, personalizedRoll, traitRoll), timeRatio })
    } else if (roll <= chance + 15
      || (target.id === 'P083' && currentSpec(target).role === '坦克' && personalRoll < .85)
      || (target.id === 'P091' && currentSpec(target).role === '坦克' && personalRoll < .20)) {
      danger += 7
      const targetName = publicById.get(target.id)?.name ?? '一名成员'
      const incidentalDeath = currentSpec(target).role !== '坦克'
        && !isCatastrophicFailure(event.soft_fail)
        && (caiFamilyIds.has(target.id) || rngFor(seed, boss.boss_id, attempt, target.id, event.event_id, 'soft-death')() < incidentalDeathRisk(boss, target, targetHidden, targetSpec, false))
      if (describesDeath(event.soft_fail) || incidentalDeath) {
        const { death, fatal } = recordDeath(target, event.event_name, timeRatio)
        danger += death.battleResurrected ? 4 : 10
        const recovery = death.battleResurrected
          ? death.resurrectedBy === targetName
            ? publicById.get(target.id)?.class === '术士'
              ? `${targetName}依靠灵魂石重新站起，但停手期间的输出已经损失。`
              : `${targetName}使用复生重新站起，但停手期间的输出/治疗已经损失。`
            : `${death.resurrectedBy}战复了${targetName}，重新接回战斗节奏。`
          : `${targetName}未能复起，剩余成员继续作战。`
        if (fatal) {
          severe = true
          responsible = target.id
          const fatalDetail = currentSpec(target).role === '坦克'
            ? `${event.soft_fail} 坦克阵亡后仇恨链立即崩溃。`
            : `${event.soft_fail} ${targetName}在失误后当场倒地；当前 Boss 最多容许 ${tolerance} 人持续减员，团队已无法维持战斗。`
          results.push({ name: event.event_name, status: '失败', detail: eventDetail(target.id, event.event_name, '失败', fatalDetail, personalRoll, currentSpec(target).role, personalizedRoll, traitRoll), responsible: targetName, timeRatio })
          break
        }
        results.push({ name: event.event_name, status: '险情', detail: eventDetail(target.id, event.event_name, '险情', event.soft_fail, personalRoll, currentSpec(target).role, personalizedRoll, traitRoll), responsible: targetName, recoveryBy: death.resurrectedBy, recovery, timeRatio })
      } else {
        const rescuer = recoveryMember(event.event_name, target.id, livingTeam, rng)
        const recoveryBy = publicById.get(rescuer.id)?.name ?? '队友'
        const detail = eventDetail(target.id, event.event_name, '险情', event.soft_fail, personalRoll, currentSpec(target).role, personalizedRoll, traitRoll)
        const eventResult: EventResult = { name: event.event_name, status: '险情', detail, responsible: targetName, timeRatio }
        if (!includesRecoveryNarrative(detail)) {
          eventResult.recoveryBy = recoveryBy
          eventResult.recovery = `${recoveryBy}${recoveryText(event.event_name, targetName, rng)}`
        }
        results.push(eventResult)
      }
    } else {
      const targetName = publicById.get(target.id)?.name ?? '一名成员'
      const personalDeath = !isCatastrophicFailure(event.hard_fail)
        && (describesDeath(event.hard_fail)
          || (currentSpec(target).role !== '坦克'
            && (caiFamilyIds.has(target.id) || rngFor(seed, boss.boss_id, attempt, target.id, event.event_id, 'hard-death')() < incidentalDeathRisk(boss, target, targetHidden, targetSpec, true))))
      if (personalDeath) {
        const { death, fatal } = recordDeath(target, event.event_name, timeRatio)
        danger += death.battleResurrected ? 10 : 16
        if (!fatal) {
          const recovery = death.battleResurrected
            ? death.resurrectedBy === targetName
              ? publicById.get(target.id)?.class === '术士'
                ? `${targetName}触发灵魂石重新加入战斗。`
                : `${targetName}使用复生重新加入战斗。`
              : `${death.resurrectedBy}交出战复，${targetName}重新起身。`
            : `${targetName}阵亡后没有战复，团队带着 ${permanentlyDead.size} 人减员继续作战。`
          results.push({ name: event.event_name, status: '险情', detail: eventDetail(target.id, event.event_name, '险情', event.hard_fail, personalRoll, currentSpec(target).role, personalizedRoll, traitRoll), responsible: targetName, recoveryBy: death.resurrectedBy, recovery, timeRatio })
          continue
        }
      }
      danger += 18
      severe = true
      responsible = target.id
      results.push({ name: event.event_name, status: '失败', detail: eventDetail(target.id, event.event_name, '失败', event.hard_fail, personalRoll, currentSpec(target).role, personalizedRoll, traitRoll), responsible: targetName, timeRatio })
      break
    }
  }

  const failureFactor = clamp(1 - results.filter((r) => r.status === '失败').length * 0.08 - results.filter((r) => r.status === '险情').length * 0.035, 0.58, 1)
  const meterPenaltyEvent = results.find((event) => event.status === '失败' && event.responsible)
    ?? [...results].reverse().find((event) => event.status === '险情' && event.responsible)
  const persistentPreparationFailure = meterPenaltyEvent
    ? /没切天赋|天赋|箭没带|弹药|技能没拖|动作条|宠物|宏|装备耐久|拿错武器/.test(`${meterPenaltyEvent.name} ${meterPenaltyEvent.detail}`)
    : false
  const responsiblePerformanceMultiplier = persistentPreparationFailure && !isVehicleEncounter
    ? .25
    : meterPenaltyEvent?.status === '失败'
      ? .5
      : meterPenaltyEvent
        ? .7
        : 1
  const previewMeters: CombatMeter[] = allData.map(({ m, h: memberHidden, s, p }) => {
    const meterRng = rngFor(seed, boss.boss_id, attempt, m.id, m.currentSpec, 'meter')
    const gear = clamp(((m.itemLevel ?? n(p.signup_item_level)) - 200) / 32, 0, 1.16)
    const composite = outputComposite(boss.boss_id, m, memberHidden, attempt)
    const elite = composite >= 95 ? 1.04 : composite >= 90 ? 1.02 : composite < 62 ? .96 : 1
    const encounter = outputModifier(boss.boss_id, s, p.class, composite)
    const formSpread = .045 + clamp((82 - n(memberHidden.stability)) / 450, 0, .045)
    const form = 1 + (meterRng() * 2 - 1) * formSpread
    const gearOutput = gear * 1550 * (equipmentFavoredBosses.has(boss.boss_id) ? 1.1 : 1)
    let dps = 0
    let hps = 0
    if (isVehicleEncounter) {
      const effective = effectiveCombatRatings(m, memberHidden)
      const vehicleSkill = effective.mechanics * .4 + effective.awareness * .25 + n(memberHidden.stability) * .2 + n(memberHidden.teamwork) * .15
      dps = (2050 + gear * 1200 + vehicleSkill * 18) * form * failureFactor
    } else if (s.role.includes('DPS')) {
      dps = (2550 + gearOutput + composite * 37) * elite * encounter * form * failureFactor
    } else if (s.role === '坦克') {
      dps = (900 + gear * 850 + composite * 18) * elite * encounter * form * failureFactor
    } else {
      dps = (100 + composite * 2.2) * (0.85 + meterRng() * 0.15)
      hps = (1450 + gear * 1350 + composite * 36) * elite * encounter * form * (1 + Math.max(0, danger) / 180)
    }
    if (!isVehicleEncounter) {
      const richardBuffActive = m.id === 'P128' && m.richardBuffActive !== false
      const personalBuffs = richardBuffActive ? raidBuffs : providedBuffs
      const buffMultiplier = raidBuffMultiplier(personalBuffs, s.role, p.class)
      if (s.role.includes('DPS')) dps *= buffMultiplier
      if (s.role === '治疗') hps *= buffMultiplier
      if (richardBuffActive && s.role.includes('DPS')) dps *= configNumber('richard_full_buff_output_multiplier', 1.05)
      if (m.id === 'P086' && s.role.includes('DPS')) dps *= .9 + meterRng() * .22
      if (m.id === 'P089' && bossDc >= 80) dps *= .92
      if ([memberHidden.social_primary, memberHidden.social_secondary].includes('宏依赖') && s.role.includes('DPS')) dps *= profile.movement < .3 ? 1.03 : Math.max(.92, 1 - profile.movement * .13)
      if (m.id === 'P094' && boss.boss_id === 'B14') {
        if (s.role.includes('DPS')) dps *= 1.1
        if (s.role === '治疗') hps *= 1.1
      }
    }
    if (meterPenaltyEvent?.responsible === p.name) {
      dps *= responsiblePerformanceMultiplier
      hps *= responsiblePerformanceMultiplier
    }
    dps *= (modifiers.teamOutputMultiplier ?? 1) * (modifiers.playerOutputMultiplier?.[m.id] ?? 1)
    hps *= (modifiers.teamHealingMultiplier ?? 1) * (modifiers.playerHealingMultiplier?.[m.id] ?? 1)
    const memberDeaths = deaths.filter((death) => death.playerId === m.id)
    const downtime = memberDeaths.reduce((sum, death) => sum + (death.battleResurrected ? .08 : 1 - death.timeRatio), 0)
    const activeRatio = clamp(1 - downtime, .08, 1)
    dps *= activeRatio
    hps *= activeRatio
    dps = Math.max(0, Math.round(dps))
    hps = Math.max(0, Math.round(hps))
    return {
      playerId: m.id,
      name: p.name,
      spec: isVehicleEncounter ? '载具操作' : s.spec,
      role: s.role,
      itemLevel: m.itemLevel ?? n(p.signup_item_level),
      dps,
      hps,
      damage: 0,
      healing: 0,
      died: memberDeaths.length > 0,
      battleResurrected: memberDeaths.some((death) => death.battleResurrected),
      activeRatio,
    }
  })
  const teamDps = previewMeters.reduce((sum, meter) => sum + meter.dps, 0)
  const teamHps = previewMeters.reduce((sum, meter) => sum + meter.hps, 0)
  const requiredDpsByBoss: Record<string, number> = {
    B01: 28500, B02: 36000, B03: 38000, B04: 42000, B05: 42500, B06: 42000, B07: 43000,
    B08: 45500, B09: 45500, B10: 47500, B11: 49500, B12: 49500, B13: 52000, B14: 54500,
  }
  const requiredTeamDps = requiredDpsByBoss[boss.boss_id] ?? 42000
  const requiredTeamHps = boss.tank_mode === '载具' ? 0 : ({ 低: 7000, 中: 8200, 高: 9800, 极高: 11000 } as const)[boss.healing_pressure]
  const dpsFailure = teamDps < requiredTeamDps
  const hpsFailure = requiredTeamHps > 0 && teamHps < requiredTeamHps
  const dpsCoverage = teamDps / Math.max(requiredTeamDps, 1)
  const hpsCoverage = requiredTeamHps > 0 ? teamHps / requiredTeamHps : Number.POSITIVE_INFINITY
  const throughputFailureCause: '输出不足' | '治疗不足' | undefined = dpsFailure && hpsFailure
    ? (dpsCoverage <= hpsCoverage ? '输出不足' : '治疗不足')
    : dpsFailure
      ? '输出不足'
      : hpsFailure
        ? '治疗不足'
        : undefined
  const throughputBonus = clamp((teamDps / Math.max(requiredTeamDps, 1) - 1) * 28, -18, 12)
    + (requiredTeamHps > 0 ? clamp((teamHps / requiredTeamHps - 1) * 12, -10, 6) : 0)
  const killChance = clamp(58 + (teamPower - bossDc) * 2.7 - danger * 0.65 - permanentlyDead.size * 7 - (deaths.length - permanentlyDead.size) * 2 + throughputBonus, 2, 96)
  const structureFailureTriggered = Boolean(structureIssue)
    && rngFor(seed, boss.boss_id, attempt, team.map((member) => `${member.id}:${member.currentSpec}`).join(','), 'structure-gate')() * 100 < configNumber('invalid_composition_fail_pct', 85)
  const killed = !severe && !structureFailureTriggered && !dpsFailure && !hpsFailure && rng() * 100 < killChance
  const structuralFailure = !killed && structureFailureTriggered
  if (structuralFailure && structureIssue) {
    const failed = results.find((result) => result.status === '失败')
    const structuralEvent: EventResult = { name: '阵容结构崩盘', status: '失败', detail: structureIssue.reason, responsible: '团长', timeRatio: failed?.timeRatio ?? structureIssue.timing }
    if (failed) Object.assign(failed, structuralEvent)
    else results.push(structuralEvent)
    responsible = '团长'
  }
  const fatalEvent = results.find((result) => result.status === '失败')
  const fatalProgress = fatalEvent?.timeRatio ?? 0
  const remainingHp = killed ? 0 : fatalEvent
    ? clamp(Math.round(100 - fatalProgress * clamp(78 + (teamPower - bossDc) * .7, 55, 92)), 3, 96)
    : throughputFailureCause === '输出不足'
      ? clamp(Math.round((1 - dpsCoverage) * 100 + rng() * 5), 1, 96)
      : throughputFailureCause === '治疗不足'
        ? clamp(Math.round(16 + (1 - hpsCoverage) * 55 + rng() * 8), 3, 96)
        : clamp(Math.round(72 - (teamPower - bossDc) * 2.4 + danger * 0.75 + rng() * 18), 1, 96)
  const failedEvent = results.find((r) => r.status === '失败')
  const decisiveEvent = failedEvent ?? [...results].reverse().find((event) => event.status === '险情' && event.responsible)
  if (!killed && !responsible && decisiveEvent?.responsible) {
    responsible = allData.find(({ p }) => p.name === decisiveEvent.responsible)?.m.id ?? ''
  }
  const blamedName = responsible === '团长' ? '团长' : responsible ? publicById.get(responsible)?.name ?? '未知成员' : ''
  const permanentNames = deaths.filter((death) => !death.battleResurrected).map((death) => death.name)
  const permanentCount = permanentlyDead.size
  const reasonRng = rngFor(seed, boss.boss_id, attempt, 'combat-reason')
  const pickReason = (lines: string[]) => lines[Math.floor(reasonRng() * lines.length)] ?? lines[0] ?? ''
  const cleanKillReasons = [
    `最后一轮技能刚结束，团队立刻火力全开，${boss.boss_name}的血条没能撑到下一次施法。`,
    `团队把最后一轮机制完美处理，随后一波爆发结束了战斗。`,
    `场上十个人站到了最后，${boss.boss_name}再没有翻盘的机会。`,
    `最后阶段的站位和技能都没乱，团队稳稳收掉了${boss.boss_name}。`,
    `最后一个危险技能被处理掉后，所有人权力压BOSS，${boss.boss_name}随即倒下。`,
    `血线、仇恨和输出节奏一直在线，这次击杀干净得像提前排练过。`,
    `团队没有给${boss.boss_name}拖到下一轮的机会，最后一轮爆发直接完成击杀。`,
  ]
  const battleResDeath = deaths.find((death) => death.battleResurrected)
  const fallenName = battleResDeath?.name ?? '一名成员'
  const resurrectorName = battleResDeath?.resurrectedBy
  const usedSelfRes = Boolean(resurrectorName && resurrectorName === fallenName)
  const selfResAbility = battleResDeath && publicById.get(battleResDeath.playerId)?.class === '术士' ? '灵魂石' : '复生'
  const externalBattleResKillReasons = [
    `${fallenName}倒地后，${resurrectorName ?? '队友'}第一时间交出战复。人重新站起来接回原本的任务，团队随后击杀了${boss.boss_name}。`,
    `${fallenName}在关键阶段倒地，${resurrectorName ?? '队友'}用战复把人拉了起来。短暂的混乱结束后，团队重新稳住了节奏。`,
    `${resurrectorName ?? '队友'}把战复交给了${fallenName}。“复活吧我的勇士”，${fallenName}回到场上，${boss.boss_name}最终被顺利收掉。`,
    `${fallenName}倒地让场面乱了几秒，${resurrectorName ?? '队友'}及时完成战复。全团重新归位后顶住了最后一轮。`,
    `${fallenName}倒地后，${resurrectorName ?? '队友'}果断交出战复。虽然损失了一段输出或治疗时间，团队还是完成了击杀。`,
    `唯一一次战复由${resurrectorName ?? '队友'}交给${fallenName}。人拉起来后迅速归位，全团齐心协力完成击杀。`,
    `${fallenName}一度倒地，${resurrectorName ?? '队友'}把人战复起来。最后阶段所有人都各司其职，${boss.boss_name}先一步倒下。`,
  ]
  const selfResKillReasons = [
    `${fallenName}倒地后立刻使用${selfResAbility}重新站起，接回自己的任务，团队随后完成了对${boss.boss_name}的击杀。`,
    `${fallenName}一度倒地，好在${selfResAbility}还捏在手里。重新起身后迅速归位，团队稳住了最后阶段。`,
    `${fallenName}倒地后用${selfResAbility}回到战场。虽然损失了一段输出或治疗时间，剩余成员还是撑住了压力。`,
    `${fallenName}在关键阶段倒下，随即使用${selfResAbility}重新加入战斗。全团没有再出现减员，最终收掉了${boss.boss_name}。`,
  ]
  const battleResKillReasons = usedSelfRes ? selfResKillReasons : externalBattleResKillReasons
  const reducedKillReasons = [
    `${permanentNames.join('、')}倒下后没能再起，剩余成员重新分担任务，最终带着 ${permanentCount} 人减员收掉了${boss.boss_name}。`,
    `场上成员顶着 ${permanentCount} 人减员把最后一点血压完。`,
    `${permanentNames.join('、')}躺在地上看完了后半场，剩下的人各司其职完成击杀。`,
    `队伍少了 ${permanentCount} 个人，最后阶段几乎没有容错，场上成员还是完美发挥把${boss.boss_name}磨死了。`,
    `永久减员出现后，团队一路用保命和补位撑到结尾，${boss.boss_name}最终只差一轮技能没能放出来。`,
    `永久减员出现后，团队咬牙硬撑了好几轮，最终在${boss.boss_name}最后一个读条前集体倒地，功亏一篑。`,
    `${permanentNames.join('、')}的倒地成了转折点，剩下的人虽然尽力补位，但还是没能活过下一轮技能。`,
    `场上成员顶着 ${permanentCount} 人减员拼到最后一口血，还是没能压完，全员倒在${boss.boss_name}脚下。`,
  ]
  const permanentWipeReasons = [
    `${permanentNames.join('、')}倒下后没能再起，剩余成员一边补位一边维持输出，节奏最终断在狂暴前。`,
    `战复已经交空，${permanentNames.join('、')}留在地上，缺失的职责从下一轮开始越滚越大。`,
    `场上少了 ${permanentCount} 个人，打断、转火和治疗轮次都被迫重排，团队没能撑到收尾。`,
    `${permanentNames.join('、')}减员后，其他人承担了额外任务，最后阶段技能和资源同时见底。`,
    `地上躺着${permanentNames.join('、')}，场上成员已经把能补的都补了，${boss.boss_name}还是拖进了狂暴。`,
    `永久减员留下的缺口一直没有补上，战斗越往后越吃力，最后一轮压力彻底压垮了团队。`,
  ]
  const genericCollapseReasons = [
    '前面的险情都处理掉了，最后一轮关键技能却出现断档，场面在几秒内彻底崩溃。',
    '团队一路撑到BOSS残血，最后一个时间轴没有处理好，团员一个接一个倒下。',
    '前几次救场耗光了减伤和保命，最后一轮压力到来时已经没人能创造奇迹。',
    '技能轮次和时间轴在后半程逐渐错开，等到团队发现问题时已经为时已晚。',
    `战斗拖进最后阶段后，${boss.boss_name}连续施压，团队的容错和资源一起耗尽。`,
    '团队把大部分机制都处理完了，BOSS残血时却没能顶住连续压力，这一把倒在了黎明前。',
  ]
  let reason = killed
    ? deaths.length
      ? permanentCount > 0
        ? pickReason(reducedKillReasons)
        : pickReason(battleResKillReasons)
      : pickReason(cleanKillReasons)
    : structuralFailure
      ? structureIssue!.reason
      : failedEvent?.detail
        ?? (permanentNames.length
          ? pickReason(permanentWipeReasons)
          : pickReason(genericCollapseReasons))
  const estimatedFullDuration = clamp(requiredTeamDps * 205 / Math.max(teamDps, 1), 105, 320)
  const duration = killed
    ? Math.round(estimatedFullDuration)
    : fatalEvent
      ? Math.round(clamp(estimatedFullDuration * fatalProgress, 28, 280))
      : Math.round(clamp(42 + (1 - remainingHp / 100) * 245, 45, 285))
  if (fatalEvent && fatalProgress > 0) {
    results.forEach((result) => { result.timeRatio = clamp((result.timeRatio ?? fatalProgress) / fatalProgress * .9, .04, .9) })
  }
  const meters = previewMeters.map((meter) => ({ ...meter, damage: meter.dps * duration, healing: meter.hps * duration }))
  const deadDamage = deaths.some((death) => death.role.includes('DPS') && !death.battleResurrected)
  const failureCause: CombatResult['failureCause'] = killed
    ? undefined
    : structuralFailure
      ? '阵容失衡'
      : failedEvent
        ? '机制失误'
        : throughputFailureCause ?? '机制失误'
  if (!killed && !structuralFailure && !failedEvent) {
    const formattedTeamDps = Math.round(teamDps).toLocaleString()
    const formattedRequiredDps = requiredTeamDps.toLocaleString()
    const formattedTeamHps = Math.round(teamHps).toLocaleString()
    const formattedRequiredHps = requiredTeamHps.toLocaleString()
    const dpsGap = Math.max(0, Math.round(requiredTeamDps - teamDps)).toLocaleString()
    const hpsGap = Math.max(0, Math.round(requiredTeamHps - teamHps)).toLocaleString()
    const closeCall = remainingHp <= 8
    const heavyGap = remainingHp >= 30
    const healingFailureReasons = closeCall
      ? [
          `Boss只剩 ${remainingHp}%，治疗蓝量却在最后一轮见底，团队血线接连断掉。`,
          `已经压到 ${remainingHp}% 了，最后一轮团伤没有抬回来，场上成员一个接一个倒下。`,
          `击杀近在眼前，治疗蓝量先一步耗尽，${boss.boss_name}带着 ${remainingHp}% 血量留在了场上。`,
          `最后 ${remainingHp}% 成了过不去的门槛，治疗蓝量耗干后团队没能再撑一轮。`,
        ]
      : heavyGap
        ? [
            `团队只有 ${formattedTeamHps} HPS，这个治疗量明显不够，中段开始就压不住血线。`,
            `持续团伤很快超过治疗承受范围，团队HPS停在 ${formattedTeamHps}，${boss.boss_name}还剩 ${remainingHp}% 时场面已经失控。`,
            `治疗从前半程就开始透支资源，蓝量和大技能都没能撑到收尾，Boss最终还剩 ${remainingHp}%。`,
            `血线长期处在危险区，治疗缺口始终填不上，战斗在 ${remainingHp}% 时彻底崩盘。`,
          ]
        : [
            `治疗明显有缺口，前面还能靠技能硬抬，进入后半程后血线再也稳不住。`,
            `持续伤害把治疗资源一点点磨空，${boss.boss_name}还剩 ${remainingHp}% 时，全团已经没有下一轮群抬。`,
            `前几轮靠预读和减伤撑住了，后半程治疗量跟不上压力，战斗停在 ${remainingHp}%。`,
            `团队还需要更多的HPS才能稳定，这一把只有 ${formattedTeamHps}，最后阶段被连续团伤压垮。`,
          ]
    const damageFailureReasons = closeCall
      ? [
          `Boss只剩 ${remainingHp}%，最后一轮爆发没能补上，狂暴先一步到来。`,
          `血条已经压到 ${remainingHp}% 了，团队在狂暴前还差最后一小段伤害。`,
          `最后 ${remainingHp}% 没能抢下来，爆发和药水都已交空，${boss.boss_name}进入狂暴完成清场。`,
          `所有输出技能都压进了最后阶段，伤害仍差一口气，Boss带着 ${remainingHp}% 血量反杀全团。`,
          `这一把已经摸到击杀线，最后几秒的输出缺口让${boss.boss_name}撑进了狂暴。`,
        ]
      : heavyGap
        ? [
            `团队DPS只有 ${formattedTeamDps}，不足以在BOSS狂暴前完成击杀，Boss最终剩下 ${remainingHp}%。`,
            `输出从前半程就落后时间轴，团队没能追回伤害缺口，${boss.boss_name}带着 ${remainingHp}% 血量进入狂暴。`,
            `转火和跑位浪费了太多有效输出，团队DPS停在 ${formattedTeamDps}，狂暴到来时血量仍然很高。`,
            `每轮都差一点伤害，累计到最后变成了 ${remainingHp}% 的缺口，团队被狂暴正面清场。`,
          ]
        : [
            `本次战斗存在伤害缺口，前面处理机制时丢掉的输出时间，最后全留在了Boss血条上。`,
            `转火和走位让爆发轴不断错开，团队没能在狂暴前压完最后 ${remainingHp}% 血量。`,
            `整体输出节奏偏慢，易伤和爆发没有完全对齐，${boss.boss_name}撑到狂暴时还剩 ${remainingHp}%。`,
            `战斗流程基本完整，团队DPS仍低于击杀线，最后阶段只能看着Boss进入狂暴。`,
            `输出位把技能都交完了，团队总伤害还是少了一截，战斗停在 ${remainingHp}%。`,
          ]
    const neutralFailureReasons = [
      `前面的险情都处理完了，最后阶段资源和技能一起见底，Boss还剩 ${remainingHp}%。`,
      `团队一路撑到收尾，最后几个时间轴开始脱节，战斗停在 ${remainingHp}%。`,
      `收尾阶段的压力超出了团队承受能力，${boss.boss_name}带着 ${remainingHp}% 血量留在场上。`,
      `场上一直有人补位救火，欲扶大厦之将倾，奈何回天乏术，战斗没能完成收尾。`,
    ]
    if (permanentNames.length) {
      const permanentShortageReasons = failureCause === '治疗不足'
        ? [
            `减员后的团队HPS不足，剩余治疗无法继续承受来自BOSS的压力。`,
            `永久减员打乱了治疗分工，团队HPS停在 ${formattedTeamHps}，后续团伤再也没能稳定抬回。`,
            `场上少人后，治疗资源消耗明显加快，${boss.boss_name}还剩 ${remainingHp}% 时蓝量和大技能已经见底。`,
          ]
        : failureCause === '输出不足'
          ? [
              `减员后的团队DPS只有 ${formattedTeamDps}，不足以在BOSS狂暴前完成击杀。`,
              `输出位置出现永久缺口，剩余成员补完机制后已经追不回伤害，Boss最终还剩 ${remainingHp}%。`,
              `少了输出人手后，转火和本体伤害都慢了一截，${boss.boss_name}带着 ${remainingHp}% 血量进入狂暴。`,
            ]
          : [
              `永久减员让后续任务链不断缺人，团队最终没能维持到战斗结束。`,
              `场上职责被迫反复重排，最后阶段再也腾不出人手补上新的缺口。`,
            ]
      reason = `${pickReason(permanentWipeReasons)} ${pickReason(permanentShortageReasons)}`
    } else {
      reason = failureCause === '治疗不足'
        ? pickReason(healingFailureReasons)
        : failureCause === '输出不足'
          ? pickReason(damageFailureReasons)
          : pickReason(neutralFailureReasons)
      if (dpsFailure && hpsFailure) {
        const secondaryReasons = failureCause === '输出不足'
          ? [
              `治疗量同样低于需求，血线也没能稳定撑到狂暴。`,
              `治疗端也存在缺口，这一把的输出和生存都没有达到击杀要求。`,
              `团队HPS只有 ${formattedTeamHps}，即使伤害再多一点，后续团伤也很难继续覆盖。`,
            ]
          : [
              `团队输出同样低于狂暴线，Boss血量下降速度也不够。`,
              `DPS端明显不够，即使血线暂时稳住，也很难在狂暴前完成击杀。`,
              `输出和治疗两端都存在缺口，这一把没有足够数值进入稳定收尾。`,
            ]
        reason += ` ${pickReason(secondaryReasons)}`
      }
      if (deadDamage && failureCause === '输出不足') {
        reason += ` ${pickReason([
          '输出位的永久减员进一步拉大了最后的伤害缺口。',
          '输出位倒地后的停手时间已经直接反映在团队DPS里。',
          '中途的输出减员让原本不大的缺口一路扩大到了狂暴。',
        ])}`
      }
    }
  }

  if (!killed && !structuralFailure && !failedEvent && decisiveEvent?.responsible) {
    const consequence = failureCause === '输出不足'
      ? '这次险情损失了大量有效输出，团队没能在狂暴前追回伤害缺口。'
      : failureCause === '治疗不足'
        ? '这次险情透支了治疗资源，后续血线再也没有稳定下来。'
        : '这次险情打乱了后续时间轴，团队最终没能完成收尾。'
    reason = `${decisiveEvent.detail} ${consequence}`
  }

  const ruleBanPlayerIds = new Set(['P082', 'P092', 'P120', 'P128'])
  const ruleBanCandidate = attempt === 1
    ? allData.find(({ m }) => ruleBanPlayerIds.has(m.id) && rngFor(seed, boss.boss_id, m.id, 'rule-ban')() < .002)
    : undefined
  if (ruleBanCandidate) {
    const banId = ruleBanCandidate.m.id
    const banName = ruleBanCandidate.p.name
    const banEvent: EventResult = { name: '系统制裁', status: '失败', detail: `${banName}研究BUG时把自己研究进了封号名单，角色原地掉线。`, responsible: banName, timeRatio: .08 }
    return { bossId: boss.boss_id, attempt, killed: false, remainingHp: 99, events: [banEvent], reason: `${banName}被系统封禁，团队甚至一点不觉得意外。`, responsible: banId, chat: [`系统：${banName}的账号已被暂时冻结。`, '团长：他研究规则的最终成果出来了。', '队员：熟悉的节奏又出现了？'], leaver: banId, leaveType: '违规封号', leaveReason: `${banName}因研究规则漏洞触发了极低概率的封号事件，被迫离开团队。`, failureCause: '机制失误', moraleDelta: -10, moraleReason: `${banName}被系统抬走，全团开始重新理解“不可抗力”`, duration: 30, teamDps, teamHps, meters, deaths, casualties: permanentlyDead.size, battleReses: deaths.length - permanentlyDead.size }
  }

  const internetCafeChance = configNumber('internet_cafe_leave_pct', .5) / 100
  const internetCafeLeaver = allData.find(({ m }) => (m.id === 'P087' || m.id === 'P098')
    && rngFor(seed, boss.boss_id, attempt, m.id, 'internet-cafe-leave')() < internetCafeChance)

  if (killed) {
    const cleanKill = results.every((event) => event.status === '成功')
    const atmosphereCelebration = hasEncourager && rngFor(seed, boss.boss_id, attempt, encourager?.m.id ?? '', 'atmosphere-celebration')() < .2
    const cleanKillMoraleRoll = rngFor(seed, boss.boss_id, attempt, 'clean-kill-morale')()
    const cleanKillMorale = cleanKill ? cleanKillMoraleRoll < .65 ? 1 : cleanKillMoraleRoll < .9 ? 2 : 3 : 1
    const moraleDelta = cleanKillMorale + (atmosphereCelebration ? 3 : 0)
    const battleResSummary = battleResDeath
      ? usedSelfRes
        ? `${fallenName}倒地后使用${selfResAbility}，最终完成击杀`
        : `${fallenName}倒地后由${resurrectorName ?? '队友'}战复，最终完成击杀`
      : ''
    const baseReason = cleanKill
      ? '全程没出岔子，干净击杀'
      : permanentlyDead.size > 0
        ? `${deaths.length}人次倒地、${permanentlyDead.size}人未能复起后完成击杀`
        : battleResSummary || '中间有险情，但最后救回来了'
    const moraleReason = atmosphereCelebration ? `${baseReason}；${encouragerName}带头活跃气氛，额外提振士气` : baseReason
    const cafeName = internetCafeLeaver?.p.name
    const richardDied = deaths.some((death) => death.playerId === 'P128')
    const richardLeaves = !internetCafeLeaver && richardDied
      && rngFor(seed, boss.boss_id, attempt, 'P128', 'death-buff-leave')() < configNumber('richard_death_leave_bonus', 32) / 100
    const leaver = internetCafeLeaver?.m.id ?? (richardLeaves ? 'P128' : undefined)
    const leaveType: CombatResult['leaveType'] = cafeName ? '网吧到点' : richardLeaves ? '直接退团' : undefined
    const leaveReason = cafeName
      ? `${cafeName}所在网吧计费到点，无法继续本次副本。`
      : richardLeaves
        ? '理查德帕克死亡导致全Buff清空，不愿以无Buff状态继续打了。'
        : undefined
    const leaveChat = cafeName
      ? [`${cafeName}：网吧到点了，机器马上关机了，我真打不了了。`, `系统：${cafeName} 离开了团队。`]
      : richardLeaves
        ? ['理查德帕克：我全Buff没了，这还打个毛，溜了溜了', '系统：理查德帕克 离开了团队。']
        : []
    return { bossId: boss.boss_id, attempt, killed, remainingHp: 0, events: results, reason, responsible: '', chat: leaveChat, leaver, leaveType, leaveReason, moraleDelta, moraleReason, duration, teamDps, teamHps, meters, deaths, casualties: permanentlyDead.size, battleReses: deaths.length - permanentlyDead.size, requiredTeamDps, requiredTeamHps }
  }

  const baseMoraleLoss = -[
    configNumber('wipe_morale_loss_1', 10),
    configNumber('wipe_morale_loss_2', 15),
    configNumber('wipe_morale_loss_3', 15),
    configNumber('wipe_morale_loss_4', 20),
    0,
  ][attempt - 1]
  const moraleDelta = baseMoraleLoss - (hasDbFriction ? 1 : 0)
  const chatRng = rngFor(seed, boss.boss_id, attempt, responsible, 'wipe-chat')
  let chat: string[]
  if (structuralFailure && structureIssue) {
    const leaderLines = counts.坦克 < 2
      ? ['团长：这把是我分配犯的病，单T打这个BOSS就是找死。', '团长：忘了安排副T了。', '团长：我忘了这个本要换嘲，只安排了一个T。']
      : counts.坦克 >= 3
        ? ['团长：想着多T安全，结果把输出挤没了，我的问题。', '团长：T是够了，但Boss死不了。', '团长：看见仨T申请就全组了，完全没过脑子。']
        : counts.治疗 < 2
          ? ['团长：一个奶刷十个人，我这分工多少带点许愿成分。', '团长：我寻思这本能单奶呢，就组了一个奶试试。']
          : ['团长：不是大家的问题，治疗太少了神仙也过不了。', '团长：组人的时候光顾着凑装等了，没看职业。']
    const roastLines = ['队员：团长终于开始看右边那个职责统计了。', '队员：建议下一把组人时长个眼睛。', '队员：Boss没研究明白，排列组合倒是玩上了。', '队员：这不是谁手法差，这是团长在开怪前就把答案选错了。']
    chat = [leaderLines[Math.floor(chatRng() * leaderLines.length)], roastLines[Math.floor(chatRng() * roastLines.length)]]
  } else if (responsible) {
    const h = hiddenById.get(responsible)!
    const leaderLines = [`团长：别急着放，${failedEvent?.name ?? '刚才那波'}谁漏的？`, `团长：这把能打，${failedEvent?.name ?? '最后一轮'}别再送了。`, '团长：先别急，刚才谁没交技能？', '团长：还能打，下把别送就行。', '团长：都缓一下人齐了再开，别急着上。', '团长：少打字多看看位置，下一把别重蹈覆辙。', '团长：该交的交，该躲的躲，别让我一个个点名。', '团长：别急着甩锅，我看看谁没按套路来。', '团长：能打能打，别慌，稳住就行。', '团长：先别开麦吵，打完这把再说。']
    const ownLines = ['我的我的，手慢了。', '我的我的，走晚了。', '我的，刚才SB了。', '我的我的，再犯是SB。', '这波我的，刚才技能交晚了。', '刚才那把我的锅。', '刚才我的，脑子懵了', '我的问题，下把注意。', '我刚才脑子短暂掉线了']
    const denyLines = ['不是我吧，我该交的交了。', '不是我吧，我这看着没问题啊。', '我按指挥走的，前面先出的问题。', '我没吃到那一下，要不要再看看。', '先别急着喷我，我觉得战斗记录也可能看错人。', '技能追着我来的，这能怪我？', '我位置没站错啊，是不是别人带过来的。', '我这边正常打的，不知道怎么回事。', '这技能追着我来的，严格说是Boss针对。']
    const acceptsResponsibility = h.social_primary === '责任型' || n(h.claim_honesty) > 70
    const answerPool = acceptsResponsibility ? ownLines : denyLines
    const responsibleStyles = [h.social_primary, h.social_secondary].filter((trait) => trait && trait !== '无' && selfResponseChatStyles.has(trait))
    if (!responsibleStyles.length) responsibleStyles.push(h.social_primary === '责任型' || n(h.claim_honesty) > 70 ? '责任型' : '嘴硬型')
    const matchedFailureAnswer = matchedPersonalFailureReply(failedEvent)
    const personalityAnswer = pickChatTemplate('灭团', responsibleStyles, chatRng)
    chat = [leaderLines[Math.floor(chatRng() * leaderLines.length)]]
    if (isQuietPlayer(h)) chat.push(`${blamedName}没开麦，也没打字，只在原地跳了一下表示收到。`)
    else chat.push(`${blamedName}：${matchedFailureAnswer ?? personalityAnswer ?? answerPool[Math.floor(chatRng() * answerPool.length)]}`)
  } else {
    const genericLines = failureCause === '输出不足'
      ? ['团长：这把问题不大，下把DPS把爆发药水都磕上。', '团长：这把DPS有点捉鸡，下一把给我使点劲抽他。', '团长：这把DPS差点意思啊，我看看谁没磕爆发药水。', '团长：这把DPS有点弱啊，我看看问题出在谁身上，再打的低不用我多说了吧。', '团长：这把输出不太行啊，打的低的几个想想办法。']
      : failureCause === '治疗不足'
        ? ['团长：这把奶没加上来，是不是控蓝有问题。', '团长：这把奶不住了，是谁吃技能了吗，还是奶妈有问题。','团长：这奶不出啊，奶这么小吗。', '团长：这把没加住？是要多切一个治疗吗？','团长：这把治疗有缺口，我再看看HPS和减伤安排。']
        : [
            '团长：这把问题不大，磨合一下下把就能过了。',
            '团长：这把就差一点了，咱们恢复下，下把把药水全磕上过了他。',
            '团长：这次没有什么大问题，咱们再加把劲，下把过了。',
          ]
    chat = [genericLines[Math.floor(chatRng() * genericLines.length)]]
  }
  const throughputShortage = !responsible && (failureCause === '输出不足' || failureCause === '治疗不足')
  if (throughputShortage) {
    const metricKey = failureCause === '输出不足' ? 'dps' : 'hps'
    const weakest = meters
      .filter((meter) => failureCause === '输出不足' ? meter.role.includes('DPS') : meter.role === '治疗')
      .sort((left, right) => left[metricKey] - right[metricKey])[0]
    const criticTraits = ['压力怪', '数据执着', '阴阳怪气']
    const critics = allData.filter(({ h }) => !isQuietPlayer(h) && !isGlassHeart(h) && criticTraits.some((trait) => [h.social_primary, h.social_secondary].includes(trait)))
    const critic = critics[Math.floor(chatRng() * critics.length)]
    const criticTrait = critic && criticTraits.find((trait) => [critic.h.social_primary, critic.h.social_secondary].includes(trait))
    const required = failureCause === '输出不足' ? requiredTeamDps : requiredTeamHps
    const actual = failureCause === '输出不足' ? teamDps : teamHps
    const variables = {
      target: weakest?.name ?? '最低的一位',
      value: Math.round(weakest?.[metricKey] ?? 0).toLocaleString(),
      team_value: Math.round(actual).toLocaleString(),
      required: Math.round(required).toLocaleString(),
      gap: Math.max(0, Math.round(required - actual)).toLocaleString(),
    }
    if (critic && criticTrait) {
      const style = `${failureCause}-${criticTrait}`
      const fallback = criticTrait === '数据执着'
        ? `${variables.target}本场只有${variables.value} ${metricKey.toUpperCase()}，团队离门槛还差${variables.gap}。`
        : criticTrait === '阴阳怪气'
          ? `原来${variables.target}这把是来给BOSS挠痒痒的吗。`
          : `${variables.target}这个${metricKey.toUpperCase()}，是准备等Boss自己倒吗？`
      chat.push(`${critic.p.name}：${pickChatTemplate('灭团', [style], chatRng, variables) ?? fallback}`)
    }
    const supportTraits = ['调解者', '老司机', '老黄牛']
    const supporters = allData.filter(({ m, h }) => m.id !== critic?.m.id
      && !isQuietPlayer(h)
      && supportTraits.some((trait) => [h.social_primary, h.social_secondary].includes(trait)))
    const supporter = supporters[Math.floor(chatRng() * supporters.length)]
    const supporterTrait = supporter && supportTraits.find((trait) => [supporter.h.social_primary, supporter.h.social_secondary].includes(trait))
    if (supporter && supporterTrait) {
      const fallback = supporterTrait === '老司机'
        ? '数值问题比机制炸团好办，技能再优化一下就能过。'
        : supporterTrait === '老黄牛'
          ? '别光喷了，缺口找到了，下一把我多补点。'
          : '先别围着一个人开会，调整分工再打一把。'
      chat.push(`${supporter.p.name}：${pickChatTemplate('灭团', [`数值不足-${supporterTrait}`], chatRng, variables) ?? fallback}`)
    }
  } else {
    const pressure = allData.find(({ m, h: th }) => m.id !== responsible && !isQuietPlayer(th) && !isGlassHeart(th) && (th.social_primary === '压力怪' || th.social_secondary === '压力怪'))
    const mediator = allData.find(({ m, h: th }) => m.id !== responsible && m.id !== pressure?.m.id && !isQuietPlayer(th) && !isGlassHeart(th) && (th.social_primary === '调解者' || th.social_secondary === '调解者'))
    if (pressure) {
      const lines = ['这都能中？闭眼打的？','这都能中？是人啊？', '不懂技能早说，别拿全团陪练。', '这是教学团吗？', '我都不知道该说什么了。', '要不这把打完散了吧。', '闭着眼都能走完流程了，然而还是灭。', '这把打完可能要把游戏删了。', '我都不知道脑子都怎么长的。']
      chat.push(`${pressure.p.name}：${pickChatTemplate('灭团', [pressure.h.social_primary, pressure.h.social_secondary], chatRng) ?? lines[Math.floor(chatRng() * lines.length)]}`)
    }
    if (mediator) {
      const lines = ['行了行了，知道哪的问题就下一把。', '别吵了，打断顺序重排一下就行。', '多灭几把就熟了，正常。', '再来一把，这把肯定过。', '我觉得快了，就差一点点。', '这把我觉得有人进步了，真的。', '信我，这把跟前几把不一样。']
      chat.push(`${mediator.p.name}：${pickChatTemplate('灭团', ['调解者', '气氛组'], chatRng) ?? lines[Math.floor(chatRng() * lines.length)]}`)
    }
    const instigator = allData.find(({ m, h: th }) => m.id !== responsible && m.id !== pressure?.m.id && m.id !== mediator?.m.id && !isQuietPlayer(th) && !isGlassHeart(th) && (th.social_primary === '拱火者' || th.social_secondary === '拱火者'))
    if (instigator) {
      const lines = ['我随便说一句，不一定对，你们听听就好。', '我刚才掉线了一下，你们感觉到没？', '这Boss长得好丑，之前没注意。', '你们刚才有没有听到什么奇怪的声音？', '我刚切出去看了眼攻略，跟咱们打的好像不太一样。', '今天这键盘空格键有点粘，跳不起来。', '刚才好像听到门铃响了，还是我幻听了。', '我好饿，打完这把想煮个面吃。', ]
      chat.push(`${instigator.p.name}：${pickChatTemplate('灭团', ['拱火者'], chatRng) ?? lines[Math.floor(chatRng() * lines.length)]}`)
    }
    const occupiedSpeakers = new Set([responsible, pressure?.m.id, mediator?.m.id, instigator?.m.id].filter(Boolean))
    const commentators = allData.filter(({ m, h }) => !occupiedSpeakers.has(m.id)
      && !isQuietPlayer(h)
      && !isGlassHeart(h)
      && [h.social_primary, h.social_secondary].some((trait) => trait && trait !== '无' && !selfResponseChatStyles.has(trait)))
    const commentator = commentators[Math.floor(chatRng() * commentators.length)]
    if (commentator && chatRng() < .72) {
      const commentatorStyles = [commentator.h.social_primary, commentator.h.social_secondary].filter((trait) => trait && trait !== '无' && !selfResponseChatStyles.has(trait))
      const line = pickChatTemplate('灭团', commentatorStyles, chatRng)
      if (line) {
        chat.push(`${commentator.p.name}：${line}`)
        occupiedSpeakers.add(commentator.m.id)
      }
    }
    if (encourager && !occupiedSpeakers.has(encourager.m.id) && chatRng() < .75) {
      chat.push(`${encourager.p.name}：${pickChatTemplate('灭团', ['气氛组'], chatRng) ?? '问题找到了就行，下把重新来。'}`)
    }
  }

  let leaver: string | undefined
  let collapseRoaster: (typeof allData)[number] | undefined
  const collapseVictimIds = new Set(['P096', 'P100', 'P088', 'P131'])
  const collapseRoasters = allData.filter(({ m }) => m.id === 'P081' || m.id === 'P095' || m.id === 'P122' || m.id === 'P132')
  const collapseVictim = team.find((member) => member.id === responsible)
  if (attempt >= 2 && attempt < 5 && collapseVictimIds.has(responsible) && (collapseVictim?.blame ?? 0) >= 1 && collapseRoasters.length) {
    const collapseRng = rngFor(seed, boss.boss_id, attempt, responsible, 'collapse-leave')
    if (collapseRng() < configNumber('special_collapse_leave_pct', 40) / 100) {
      leaver = responsible
      collapseRoaster = collapseRoasters[Math.floor(collapseRng() * collapseRoasters.length)]
    }
  }
  if (!leaver && attempt < 5 && internetCafeLeaver) leaver = internetCafeLeaver.m.id
  for (const { m, h: memberHidden } of attempt >= 5 ? [] : allData) {
    if (leaver) break
    if (memberHidden.leave_policy === '永不主动退队') continue
    const attemptScale = [0.08, 0.25, 0.48, 0.72][attempt - 1]
    let rate = n(memberHidden.base_leave_pct) * attemptScale + [0, 0.8, 2, 4][attempt - 1]
    const projectedMorale = morale + moraleDelta
    const mentalResilience = (n(memberHidden.mentality) + n(memberHidden.pressure_resistance)) / 2
    rate -= clamp((mentalResilience - 65) * .08, 0, 2.8)
    if (projectedMorale >= 70) rate -= Math.min(3, (projectedMorale - 65) * .1)
    if (projectedMorale < 55) rate += [0.5, 1.2, 2.5, 4][attempt - 1]
    if (projectedMorale < 40) rate += [1, 2, 4, 6][attempt - 1]
    if (projectedMorale < 25) rate += [1.5, 3, 5.5, 8][attempt - 1]
    if (m.id === responsible) rate += memberHidden.social_primary === '玻璃心' ? [1.5, 4, 8, 12][attempt - 1] : [0, 1, 2.5, 4][attempt - 1]
    if (remainingHp > 50) rate += [0.5, 1.5, 3, 5][attempt - 1]
    const perHead = pot / Math.max(team.length, 1)
    if (perHead > 3500) rate -= Math.min(configNumber('high_pot_leave_reduction', 4), perHead / 1000)
    else if (attempt > 1 && memberHidden.economy_type === '排骨党') rate += attempt === 2 ? 1.5 : 4
    if (memberHidden.economy_type === '排骨党' && pot > 20000) rate -= 5
    if (baseSkill >= 88) rate -= 4
    else if (baseSkill >= 84) rate -= 2
    if (hasEncourager) rate -= 1
    if (hasCommander) rate -= 1
    if (m.id === 'P092' && baseSkill < 75) rate += (75 - baseSkill) * .25
    if ((m.id === 'P081' || m.id === 'P095') && attempt >= 2 && (remainingHp > 35 || projectedMorale < 55 || baseSkill < 82)) rate += 12
    if (m.id === 'P120' && attempt >= 2 && baseSkill < 78) rate += Math.min(18, (78 - baseSkill) * .8)
    if (m.id === 'P128' && m.richardBuffActive !== false && (!killed || deaths.some((death) => death.playerId === 'P128'))) {
      rate += configNumber('richard_death_leave_bonus', 32)
    }
    if (hasDbFriction && [memberHidden.social_primary, memberHidden.social_secondary].includes('厌蠢症')) rate += 3
    rate += modifiers.leaveRateBonus ?? 0
    const progressLeaveMultiplier = boss.boss_id === 'B14'
      ? configNumber('algalon_leave_multiplier', .42)
      : boss.boss_id === 'B13'
        ? configNumber('yogg_leave_multiplier', .58)
        : difficultLeaveBosses.has(boss.boss_id)
          ? configNumber('difficult_boss_leave_multiplier', 1)
          : 1
    const universalFloor = (projectedMorale < 25
      ? configNumber('universal_leave_floor_25', 6)
      : projectedMorale < 40
        ? configNumber('universal_leave_floor_40', 3)
        : projectedMorale < 55
          ? configNumber('universal_leave_floor_55', 1)
          : 0) * progressLeaveMultiplier
    rate *= progressLeaveMultiplier
    if (difficultLeaveBosses.has(boss.boss_id)) rate += configNumber('difficult_boss_leave_bonus', 0)
    rate = Math.max(rate, universalFloor)
    rate = clamp(rate, 0, 45)
    if (!leaver && rng() * 100 < rate) leaver = m.id
  }
  let leaveType: CombatResult['leaveType']
  let leaveReason: string | undefined
  if (leaver) {
    const leaveName = publicById.get(leaver)?.name ?? '一名成员'
    const leaveHidden = hiddenById.get(leaver)!
    const leaveRng = rngFor(seed, boss.boss_id, attempt, leaver, 'leave-narrative')()
    const isSilent = [leaveHidden.social_primary, leaveHidden.social_secondary].some((trait) => trait === '沉默型' || trait === '不开麦')
    const isCombative = [leaveHidden.social_primary, leaveHidden.social_secondary].some((trait) => ['压力怪', '嘴硬型', '自信型', '拱火者'].includes(trait))
    const lowExpectedShare = pot / Math.max(team.length, 1) < 1000
    const leaveLine = pickChatTemplate('退团', [leaveHidden.social_primary, leaveHidden.social_secondary, isSilent ? '沉默型' : '', isCombative ? '压力怪' : '', lowExpectedShare ? '没出装备' : '', '找借口'].filter(Boolean), () => leaveRng)
    if (collapseRoaster) {
      const roastLines = ['不懂BOSS技能就早说啊。', '这波已经讲得够清楚了，还能再送一遍？', '别再说没看见了，战斗记录写着名字。', '全团陪着修装备，就因为这一个错误。']
      const roast = roastLines[Math.floor(leaveRng * roastLines.length)]
      leaveType = '分崩离析'
      leaveReason = `${collapseRoaster.p.name}在${leaveName}反复犯错后当众开喷，把${leaveName}直接喷哭退团；YY里一下子就没人吱声了，团队就此分崩离析。`
      responsible = collapseRoaster.m.id
      chat.push(`${collapseRoaster.p.name}：${roast}`, `${leaveName}：行吧，我不打了。`, `系统：${leaveName} 离开了团队。`, '系统：争执失控，团队直接解散。')
    } else if (internetCafeLeaver?.m.id === leaver) {
      leaveType = '网吧到点'
      leaveReason = `${leaveName}所在网吧计费到点，无法继续本次副本。`
      chat.push(`${leaveName}：网吧到点了，机器马上自动关，我真打不了了。`, `团长：先别关，等我喊个替补。`, `系统：${leaveName} 离开了团队。`)
    } else if (leaver === 'P128') {
      leaveType = '直接退团'
      leaveReason = `${leaveName}全Buff进组死亡后Buff全部清空，不愿以无Buff状态继续推进。`
      chat.push(`${leaveName}：全Buff都没了，这还打个毛，溜了。`, `系统：${leaveName} 离开了团队。`)
    } else if (isSilent && leaveRng < 0.72) {
      leaveType = '战术下线'
      leaveReason = `${leaveName}在连续灭团后始终没有回应，随后角色直接离线，团队出现一个待补空缺。`
      chat.push(`团长：${leaveName}？能听见吗？`, `系统：${leaveName} 已离线。`)
    } else if (isCombative && leaveRng < 0.76) {
      leaveType = '开喷退团'
      leaveReason = `${leaveName}对复盘和责任划分不满，争执升级后主动退团。`
      chat.push(`${leaveName}：${leaveLine ?? '这根本过不了，谁爱打谁打。'}`, `团长：有问题说问题，别直接甩锅。`, `系统：${leaveName} 离开了团队。`)
    } else if (lowExpectedShare && leaveHidden.economy_type === '排骨党') {
      leaveType = '直接退团'
      leaveReason = `${leaveName}认为当前进度和拍的金不成比例，不愿继续承担灭团成本。`
      chat.push(`${leaveName}：${leaveLine ?? '打到现在拍的金才这点，没必要继续耗。'}`, `系统：${leaveName} 离开了团队。`)
    } else if (leaver === responsible && leaveHidden.social_primary === '玻璃心') {
      leaveType = '直接退团'
      leaveReason = `${leaveName}在失误被点名后心态崩溃，拒绝继续尝试。`
      chat.push(`${leaveName}：${leaveLine ?? '行行行，都算我的行了吧，我不打了。'}`, `系统：${leaveName} 离开了团队。`)
    } else if (leaveRng < 0.34) {
      leaveType = '借故离开'
      leaveReason = `${leaveName}在灭团后表示临时有事，未等替补便退出团队。`
      chat.push(`${leaveName}：${leaveLine ?? '临时有事，真打不了了。'}`, '团长：先别急，我喊个替补。', `系统：${leaveName} 离开了团队。`)
    } else if (leaveRng < 0.6) {
      leaveType = '战术下线'
      leaveReason = `${leaveName}没有解释原因，灭团复盘期间突然下线。`
      chat.push(`${leaveName}：${leaveLine ?? '掉了。'}`, `系统：${leaveName} 已离线。`)
    } else {
      leaveType = '直接退团'
      leaveReason = `${leaveName}判断团队短时间内无法通过当前 Boss，选择及时止损。`
      chat.push(`${leaveName}：${leaveLine ?? '状态不对，我先走了。'}`, `系统：${leaveName} 离开了团队。`)
    }
    if (leaver !== responsible && isGlassHeart(leaveHidden)) {
      chat = chat.filter((line) => !line.startsWith(`${leaveName}：`))
    }
  }
  if (attempt >= 5) chat.push('团长：五把打完了，今天就到这，散。', '系统：本 Boss 五次尝试均告失败。')
  const moraleReason = structuralFailure ? `职责配置失衡，团长背锅：${structureIssue!.reason}` : remainingHp < 10 ? `只差 ${remainingHp}% 灭团，大家觉得还有机会` : `第 ${attempt} 次灭团，Boss 还剩 ${remainingHp}%`
  return { bossId: boss.boss_id, attempt, killed, remainingHp, events: results, reason, responsible, chat, leaver, leaveType, leaveReason, failureCause, moraleDelta, moraleReason, duration, teamDps, teamHps, meters, deaths, casualties: permanentlyDead.size, battleReses: deaths.length - permanentlyDead.size, requiredTeamDps, requiredTeamHps }
}

export function itemStartPrice(item: LootItem): number {
  return item.grade === 'S+'
    ? configNumber('splus_start_price', 5000)
    : ({ C: 200, B: 500, A: 1000, S: 2000 } as const)[item.grade]
}

export function itemReferencePrice(item: LootItem): number {
  return item.grade === 'S+'
    ? configNumber('splus_reference_price', 10000)
    : ({ C: 600, B: 1500, A: 3200, S: 6500 } as const)[item.grade]
}

function eligible(item: LootItem, member: TeamMember) {
  const tags = item.eligible_tags.split('|')
  const spec = currentSpec(member)
  const pub = publicById.get(member.id)!
  const roleType = spec.role === '近战DPS' ? '物理DPS' : spec.role === '远程DPS' ? (['猎人'].includes(pub.class) ? '物理DPS' : '法系DPS') : spec.role
  return tags.some((tag) => tag === '全职业' || tag === pub.class || tag === spec.role || tag === roleType)
}

export function runAuction(seed: string, boss: Boss, team: TeamMember[]): { records: AuctionRecord[]; team: TeamMember[]; potGain: number; moraleDelta: number; moraleReasons: string[] } {
  const normal = lootPool.filter((i) => i.boss_id === boss.boss_id && i.drop_group === '普通')
  const hard = lootPool.filter((i) => i.boss_id === boss.boss_id && i.drop_group === '困难')
  const exclusive = lootPool.filter((i) => i.boss_id === boss.boss_id && i.drop_group === '专属')
  const pick = (pool: LootItem[], key: string) => pool[Math.floor(rngFor(seed, boss.boss_id, key, 'loot')() * pool.length)]
  let drops: LootItem[]
  if (exclusive.length) {
    const first = pick(exclusive, 'exclusive-1')
    drops = [first, pick(exclusive.filter((item) => item.loot_id !== first.loot_id), 'exclusive-2')]
  } else if (boss.hard_mode === '是') drops = [pick(normal, 'normal'), pick(hard, 'hard')]
  else {
    const first = pick(normal, 'normal-1')
    const rest = normal.filter((i) => i.loot_id !== first.loot_id)
    drops = [first, pick(rest, 'normal-2')]
  }
  let nextTeam = team.map((m) => ({ ...m, purchases: [...m.purchases] }))
  const records: AuctionRecord[] = []
  let potGain = 0
  let moraleDelta = 0
  const moraleReasons: string[] = []

  for (const item of drops) {
    const quality: Record<string, number> = { C: 0, B: 6, A: 15, S: 30, 'S+': 42 }
    const capRanges: Record<string, [number, number]> = {
      大老板: [1.15, 2.15], 小老板: [.76, 1.18], 实力消费: [.82, 1.2], 毕业装党: [.72, 1.08],
      武器饰品党: [.62, 1.02], 捡漏型: [.42, .7], 排骨党: [.24, .48], 口嗨消费: [.36, .68], 简陋型: [.34, .66],
    }
    const bids: Bid[] = []
    for (const member of nextTeam) {
      if (!eligible(item, member)) continue
      const h = hiddenById.get(member.id)!
      const rng = rngFor(seed, boss.boss_id, item.loot_id, member.id, 'bid')
      const preferenceTags = h.purchase_preference.split('|')
      const explicitPreference = preferenceTags.some((tag) => tag === item.category || tag === item.grade)
      const broadPreference = preferenceTags.includes('全部') && ['A', 'S', 'S+'].includes(item.grade)
      const pref = explicitPreference || broadPreference
      const selectiveBuyer = h.economy_type === '大老板' || h.economy_type === '毕业装党'
      const catchupBuyer = ['小老板', '实力消费', '武器饰品党', '捡漏型', '容易上头'].includes(h.economy_type)
      const noPurchaseBonus = catchupBuyer && member.purchases.length === 0
        ? Math.min(18, 4 + n(boss.order))
        : catchupBuyer && member.purchases.length === 1
          ? Math.min(8, n(boss.order) * .5)
          : 0
      let desire = n(h.spend_willingness) + quality[item.grade] + (pref ? 22 : selectiveBuyer ? -32 : -6) + noPurchaseBonus + (rng() * 30 - 15)
      if (h.economy_type === '排骨党') desire -= 20
      if (h.economy_type === '毕业装党' && ['S', 'S+'].includes(item.grade)) desire += 20
      const desireThreshold = ({ C: 66, B: 63, A: 56, S: 44, 'S+': 40 } as const)[item.grade]
      if (desire < desireThreshold) continue
      const reference = itemReferencePrice(item)
      const start = itemStartPrice(item)
      let [floorFactor, ceilingFactor] = capRanges[h.economy_type] ?? [.5, .9]
      if (h.economy_type === '毕业装党' && ['S', 'S+'].includes(item.grade)) [floorFactor, ceilingFactor] = [1.05, 1.72]
      if (h.economy_type === '武器饰品党' && pref) [floorFactor, ceilingFactor] = [.92, 1.38]
      const aggressionBonus = clamp(n(h.bid_aggression) / 100, 0, 1) * .12
      const preferenceBonus = pref ? .08 : 0
      let maxFactor = floorFactor + rng() * (ceilingFactor - floorFactor) + aggressionBonus + preferenceBonus
      if (item.grade === 'S+') maxFactor *= configNumber('splus_bid_cap_multiplier', 1.5)
      const max = Math.floor(Math.min(member.wallet, reference * maxFactor) / 100) * 100
      if (max >= start) bids.push({ playerId: member.id, name: publicById.get(member.id)!.name, max })
    }
    bids.sort((a, b) => b.max - a.max)
    const start = itemStartPrice(item)
    const reference = itemReferencePrice(item)
    const willing = bids.filter((b) => b.max >= start)
    const quietMarketChance = ({ C: .34, B: .28, A: .14, S: .02, 'S+': .01 } as const)[item.grade]
    const quietMarket = rngFor(seed, boss.boss_id, item.loot_id, 'quiet-market')() < quietMarketChance
    let buyer: Bid | undefined
    let price = 0
    let salvaged = false
    const log = [`团长：${item.item_name}，${start}G 起。`]
    const auctionChatRng = rngFor(seed, boss.boss_id, item.loot_id, 'auction-chat')
    const chatterPool = nextTeam.filter((member) => member.id !== willing[0]?.playerId)
    const chatter = chatterPool[Math.floor(auctionChatRng() * chatterPool.length)]
    if (chatter && auctionChatRng() < .12) {
      const chatterName = publicById.get(chatter.id)?.name ?? '队员'
      log.push(`${chatterName}：先看看`)
    }
    const bidLine = (bidderName: string, amount: number, bidRng: () => number, firstBid = false) => {
      if (firstBid) return `${bidderName}：${amount}`
      if (bidRng() < .75) return `${bidderName}：${amount}`
      const formatted = String(amount)
      const spoken = pickChatTemplate('拍卖', ['出价'], bidRng, { price: formatted, item: item.item_name }) ?? formatted
      const statesFinalAmount = (spoken.match(/\d[\d,]*/g) ?? []).some((value) => Number(value.replaceAll(',', '')) === amount)
      return `${bidderName}：${statesFinalAmount ? spoken : `${spoken}，${formatted}`}`
    }
    const lateJoiners: string[] = []
    let exitCount = 0
    if (willing.length) {
      const bidFlowRng = rngFor(seed, boss.boss_id, item.loot_id, 'bid-flow')
      const shuffledBidders = shuffled(willing, `${seed}|${boss.boss_id}|${item.loot_id}|auction-order`)
      const initialCount = quietMarket ? 1 : Math.min(shuffledBidders.length, 2 + Math.floor(bidFlowRng() * Math.min(3, shuffledBidders.length - 1)))
      let active = shuffledBidders.slice(0, Math.max(1, initialCount))
      let waiting = shuffledBidders.slice(Math.max(1, initialCount))
      const exited = new Set<string>()
      let leader: Bid | undefined
      let current = 0
      let bidCount = 0

      const leaveAuction = (bidder: Bid) => {
        if (exited.has(bidder.playerId)) return
        exited.add(bidder.playerId)
        exitCount += 1
        if (bidFlowRng() < .78) log.push(`${bidder.name}：P`)
        else {
          const bidderHidden = hiddenById.get(bidder.playerId)
          const style = bidderHidden?.economy_type === '捡漏型' || current > reference * .8 ? '嫌贵' : '让价'
          const line = pickChatTemplate('拍卖', [style], bidFlowRng, { item: item.item_name }) ?? 'P'
          log.push(`${bidder.name}：${line.replace(/\d[\d,]*/g, '这个价')}`)
        }
      }

      for (let round = 0; round < 36; round += 1) {
        const stepChoices = item.grade === 'S+' && current >= reference
          ? [500, 500, 1000]
          : round >= 20
            ? [500]
            : current >= 1000
              ? [100, 100, 200, 200, 500]
              : [100, 100, 100, 200]
        const increment = current === 0 ? start : stepChoices[Math.floor(bidFlowRng() * stepChoices.length)]
        const nextAmount = current === 0 ? start : current + increment

        let forcedBidder: Bid | undefined
        if (current > 0 && waiting.length && (bidFlowRng() < .36 || !active.some((bidder) => bidder.playerId !== leader?.playerId && bidder.max >= nextAmount))) {
          const joinable = waiting.filter((bidder) => bidder.max >= nextAmount)
          if (joinable.length) {
            const late = joinable[Math.floor(bidFlowRng() * joinable.length)]
            waiting = waiting.filter((bidder) => bidder.playerId !== late.playerId)
            active.push(late)
            lateJoiners.push(late.playerId)
            forcedBidder = late
          }
        }

        const dropping = active.filter((bidder) => bidder.playerId !== leader?.playerId && bidder.max < nextAmount)
        dropping.forEach(leaveAuction)
        active = active.filter((bidder) => !exited.has(bidder.playerId))

        let candidates = active.filter((bidder) => bidder.playerId !== leader?.playerId && bidder.max >= nextAmount)
        if (!candidates.length) {
          const joinable = waiting.filter((bidder) => bidder.max >= nextAmount)
          if (joinable.length && bidFlowRng() < .68) {
            const late = joinable.sort((left, right) => right.max - left.max)[0]
            waiting = waiting.filter((bidder) => bidder.playerId !== late.playerId)
            active.push(late)
            lateJoiners.push(late.playerId)
            forcedBidder = late
            candidates = [late]
          }
        }
        if (!candidates.length) break

        const bidder = forcedBidder && candidates.some((candidate) => candidate.playerId === forcedBidder.playerId)
          ? forcedBidder
          : candidates[Math.floor(bidFlowRng() * candidates.length)]
        current = nextAmount
        leader = bidder
        log.push(bidLine(bidder.name, current, bidFlowRng, bidCount === 0))
        bidCount += 1
      }

      buyer = leader ?? active[0] ?? willing[0]
      price = Math.max(start, current || start)
      if (!leader) log.push(bidLine(buyer.name, start, bidFlowRng, true))
      active.filter((bidder) => bidder.playerId !== buyer?.playerId && !exited.has(bidder.playerId)).forEach(leaveAuction)
      log.push('团长：5', '团长：4', '团长：3', '团长：2', '团长：1')
      log.push(`成交：${buyer.name}，${price}G。`)
      const reactionRng = rngFor(seed, boss.boss_id, item.loot_id, buyer.playerId, price, 'auction-reaction')
      const reactionPool = nextTeam.filter((member) => member.id !== buyer?.playerId)
      const reactionSpeaker = reactionPool[Math.floor(reactionRng() * reactionPool.length)]
      const reactionName = publicById.get(reactionSpeaker?.id ?? '')?.name
      if (reactionName && ['A', 'S', 'S+'].includes(item.grade) && price === start && reactionRng() < .35) {
        const lines = ['这也能底价拿，血赚。', '哎呦，捡大漏了。', '又让你捡漏了。', '底价捡到这个真羡慕啊。', '这价格拿走也太舒服了吧。']
        log.push(`${reactionName}：${lines[Math.floor(reactionRng() * lines.length)]}`)
      } else if (reactionName && ['S', 'S+'].includes(item.grade) && price >= reference && reactionRng() < .4) {
        const lines = ['恭喜老板毕业了。', '老板大气。', '恭喜恭喜。', '这装备拿下无敌了啊。', '恭喜拿下，今晚没白打。']
        log.push(`${reactionName}：${lines[Math.floor(reactionRng() * lines.length)]}`)
      }
    } else {
      price = 100
      salvaged = true
      const speaker = chatter ?? nextTeam[Math.floor(auctionChatRng() * nextTeam.length)]
      const speakerName = publicById.get(speaker?.id ?? '')?.name ?? '队员'
      const noBuyerStyle = ['A', 'S', 'S+'].includes(item.grade) ? '质疑消费' : '无人要'
      const noBuyerLine = pickChatTemplate('拍卖', [noBuyerStyle], auctionChatRng, { price: start.toLocaleString(), item: item.item_name }) ?? '真没人要？'
      log.push(`${speakerName}：${noBuyerLine}`, '无人达到起拍价，本件流拍。', '装备分解，100G 进入金池。')
    }
    if (buyer && !salvaged) {
      const targetItemLevel = item.drop_group === '专属' ? 239 : item.drop_group === '困难' ? 226 : 219
      const gradeGain = ({ C: 0, B: .2, A: .4, S: .6, 'S+': .8 } as const)[item.grade]
      nextTeam = nextTeam.map((m) => {
        if (m.id !== buyer!.playerId) return m
        const gapGain = Math.max(0, targetItemLevel - m.itemLevel) / 10
        const itemLevel = m.itemLevel < targetItemLevel
          ? Math.round(Math.min(targetItemLevel, m.itemLevel + gradeGain + gapGain))
          : m.itemLevel
        return { ...m, itemLevel, wallet: m.wallet - price, spent: m.spent + price, purchases: [...m.purchases, item.item_name] }
      })
    }
    potGain += price
    if (['S', 'S+'].includes(item.grade)) {
      if (salvaged || price < reference * .45) {
        moraleDelta -= 3
        moraleReasons.push(`${item.item_name}是极品却流拍或卖得太低`)
      } else {
        const highPriceGain = item.grade === 'S+'
          ? price >= reference * 1.6 ? 5 : price >= reference * 1.2 ? 4 : 3
          : price >= reference * 1.4 ? 3 : 2
        moraleDelta += highPriceGain
        moraleReasons.push(`${item.item_name}以${price}G成交，极品高价让全团士气提升${highPriceGain}点`)
      }
    }
    if (price >= reference) {
      moraleDelta += 1
      moraleReasons.push(`${item.item_name}拍到参考价以上`)
    }
    if (['C', 'B'].includes(item.grade)) {
      moraleDelta -= 1
      moraleReasons.push(`${item.item_name}只是普通掉落，没能提振士气`)
    }
    records.push({ bossId: boss.boss_id, bossName: boss.boss_name, item, bids, buyerId: buyer?.playerId, buyerName: buyer?.name, price, salvaged, log, lateJoiners, exitCount })
  }
  return { records, team: nextTeam, potGain, moraleDelta: clamp(moraleDelta, -4, 6), moraleReasons }
}

export function createMember(id: string, seed = '380', status = createPlayerStatus(seed, id)): TeamMember {
  const pub = publicById.get(id)!
  const h = hiddenById.get(id)!
  return { id, currentSpec: pub.signup_spec, itemLevel: dynamicItemLevel(id, seed), wallet: n(h.wallet_gold), spent: 0, purchases: [], left: false, blame: 0, performance: n(h.main_skill), status, richardBuffActive: id === 'P128' }
}

export const allPlayerSpecs = playerSpecs
