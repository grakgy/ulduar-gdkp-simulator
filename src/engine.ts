import { bossEvents, chatTemplates, hiddenById, lootPool, playerSpecs, publicById, specsByPlayer, type Boss, type HiddenPlayer, type LootItem, type PlayerSpec, type Role } from './data'

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
  leaveType?: '开喷退团' | '战术下线' | '直接退团' | '借故离开' | '违规封号' | '分崩离析'
  leaveReason?: string
  moraleDelta: number
  moraleReason: string
  duration: number
  teamDps: number
  teamHps: number
  meters: CombatMeter[]
  deaths: CombatDeath[]
  casualties: number
  battleReses: number
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
function avg(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0 }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }

export function personalLearningGain(hidden: HiddenPlayer, spec: PlayerSpec, attempt: number): number {
  if (attempt <= 1) return 0
  const learningRate = clamp(n(hidden.learning) / 100, 0, 1)
  const unfamiliarity = clamp((100 - n(spec.boss_experience)) / 100, 0, 1)
  const responsibilityBonus = [hidden.social_primary, hidden.social_secondary].includes('责任型') ? 1 : 0
  const overconfidencePenalty = hidden.social_primary === '自信型' ? .75 : 0
  const perWipeGain = 1.5 + learningRate * (2 + unfamiliarity * 4) + responsibilityBonus - overconfidencePenalty
  return Math.max(0, perWipeGain * (attempt - 1))
}

function fillChatTemplate(template: string, variables: Record<string, string | number> = {}): string {
  return Object.entries(variables).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template)
}

export const atmospherePlayerIds = new Set(['P085', 'P087', 'P088', 'P094', 'P096', 'P098', 'P100', 'P101'])

function pickChatTemplate(scene: '报名' | '灭团' | '退团' | '拍卖', styles: string[], rng: () => number, variables: Record<string, string | number> = {}): string | undefined {
  const matching = chatTemplates.filter((entry) => entry.scene === scene && styles.includes(entry.style_or_trait))
  return matching.length ? fillChatTemplate(matching[Math.floor(rng() * matching.length)].template, variables) : undefined
}

function isQuietPlayer(hidden: HiddenPlayer): boolean {
  return [hidden.social_primary, hidden.social_secondary].some((trait) => trait === '沉默型' || trait === '不开麦')
}

function isGlassHeart(hidden: HiddenPlayer): boolean {
  return [hidden.social_primary, hidden.social_secondary].includes('玻璃心')
}

interface EncounterProfile {
  melee: number
  ranged: number
  caster: number
  physical: number
  healer: number
  movement: number
  timings: number[]
}

const defaultProfile: EncounterProfile = { melee: 1, ranged: 1, caster: 1, physical: 1, healer: 1, movement: 0, timings: [.18, .39, .62, .82, .92] }
const encounterProfiles: Record<string, Partial<EncounterProfile>> = {
  B01: { movement: .15, timings: [.22, .51, .79] },
  B02: { melee: .98, ranged: 1.03, healer: 1.04, timings: [.14, .35, .58, .81] },
  B03: { melee: .91, ranged: 1.09, physical: 1.03, movement: .35, timings: [.16, .37, .61, .84] },
  B04: { melee: .97, ranged: 1.03, movement: .42, timings: [.17, .34, .57, .78] },
  B05: { melee: .98, ranged: 1.02, healer: 1.05, movement: .2, timings: [.13, .38, .63, .84] },
  B06: { melee: 1.08, ranged: .96, physical: 1.03, movement: .28, timings: [.21, .49, .77] },
  B07: { melee: .97, ranged: 1.04, movement: .3, timings: [.15, .36, .59, .82] },
  B08: { melee: .98, ranged: 1.04, caster: 1.08, movement: .48, timings: [.18, .41, .64, .86] },
  B09: { melee: .96, ranged: 1.06, healer: 1.04, movement: .34, timings: [.12, .33, .59, .83] },
  B10: { melee: .93, ranged: 1.08, caster: 1.04, movement: .5, timings: [.16, .38, .62, .84] },
  B11: { melee: .91, ranged: 1.08, caster: 1.03, healer: 1.06, movement: .62, timings: [.12, .31, .55, .81] },
  B12: { melee: .98, ranged: 1.02, caster: 1.06, physical: .97, healer: .94, movement: .25, timings: [.15, .37, .61, .85] },
  B13: { melee: .94, ranged: 1.06, caster: 1.03, healer: 1.05, movement: .55, timings: [.1, .28, .49, .69, .88] },
  B14: { melee: .97, ranged: 1.04, healer: 1.08, movement: .58, timings: [.11, .29, .5, .7, .89] },
}

function encounterProfile(bossId: string): EncounterProfile {
  return { ...defaultProfile, ...(encounterProfiles[bossId] ?? {}) }
}

function outputModifier(bossId: string, role: Role, playerClass: string, composite: number): number {
  const profile = encounterProfile(bossId)
  const isDamage = role.includes('DPS')
  const isRanged = role === '远程DPS'
  const isCaster = isRanged && playerClass !== '猎人'
  let modifier = role === '治疗' ? profile.healer : role === '近战DPS' ? profile.melee : isRanged ? profile.ranged : 1
  if (isDamage) modifier *= isCaster ? profile.caster : profile.physical
  if (isCaster && profile.movement > 0) modifier *= 1 - profile.movement * clamp((94 - composite) / 260, 0, .12)
  return modifier
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
    return n(bh.teamwork) + n(bh.awareness) - n(ah.teamwork) - n(ah.awareness)
  })
  return ranked[Math.floor(rng() * Math.min(3, ranked.length))] ?? team.find((member) => member.id === targetId)!
}

function recoveryText(eventName: string, targetName: string, rng: () => number): string {
  const positional = [
    `提前让出安全位，把${targetName}从技能边缘接了回来。`, `把减伤和治疗一起压给${targetName}，硬是把红血条续上了。`,
    `先一步标出落点，${targetName}擦着技能边缘逃了出来。`, `临时改站位给${targetName}腾路，险情没有继续传染。`,
    `反应够快，把${targetName}从人群里带开，后续伤害也被吃稳。`, `一个救命技能落下去，${targetName}从黑白屏门口被拽了回来。`,
  ]
  const interrupt = [
    `补上备用打断，漏掉的读条没有形成连锁减员。`, `提前接走下一棒打断，${targetName}也趁机把位置站回去。`,
    `用控制顶掉空档，施法条刚冒头就被重新按住。`, `发现顺序乱了立刻补断，Boss这口法术只读了个标题。`,
    `临时在团队频道打出新顺序，下一秒就把断档堵上。`, `把压箱底的沉默交了，救下这一轮也救下了团长的血压。`,
  ]
  const tank = [
    `临时接怪并补上外部减伤，让坦克重新建立仇恨。`, `把救命技能塞给主坦，血线刷满后重新完成换坦。`,
    `先嘲讽拖了两秒，等减伤转好才把Boss交回去。`, `卡着最后一口血补上保护，主坦没倒，治疗也终于敢喘气。`,
    `把副目标拉离人群，原本要炸团的仇恨重新归位。`, `补位接住重击，换坦虽然难看，好歹没有变成跑尸教学。`,
  ]
  const add = [
    `立刻转火残血目标，再用控制拖住漏怪，赶在下一轮前清场。`, `暂停压本体，带队补掉漏怪后重新回到原节奏。`,
    `把漏掉的小怪标了骷髅，全团终于打在了同一个目标上。`, `交出群控拖住增援，给远程争出一轮完整转火时间。`,
    `用爆发收掉最危险的那只，剩下的小怪没能滚起雪球。`, `把乱跑的增援拽回技能区，原本的事故现场勉强重新开工。`,
  ]
  const choices = /打断|读条|施法/.test(eventName) ? interrupt : /坦|仇恨|重击/.test(eventName) ? tank : /小怪|构造体|卫士|触手|增援/.test(eventName) ? add : positional
  return choices[Math.floor(rng() * choices.length)]
}

const PERSONAL_FAILURE_DETAILS: Record<string, string[]> = {
  责任型: ['贪了一次读条，发现不对后立刻认了锅。', '技能交慢半拍，第一时间在团队频道说明情况。', '判断错了安全位，没有给自己的失误找借口。', '试图补队友的空档，结果把自己的节奏也打乱了。', '口令听懂了但执行晚了一步，主动表示下把提前处理。'],
  团队执行: ['为了替队友补位多走了一步，自己反而吃到技能。', '救场技能交得太急，下一轮关键节点出现空档。', '注意力全放在队友身上，漏看了脚下的危险区域。', '临时接手团队任务，却低估了机制重叠的时间。', '想把场面全部兜住，最终同时丢了自己的职责。'],
  自信型: ['认定自己能压最后一个技能，结果撤离晚了半拍。', '觉得站位足够安全，没有给下一轮机制预留空间。', '坚持原来的处理方式，直到伤害落下才发现判断错了。', '高估了保命技能的覆盖时间，关键一秒没有接上。', '认为不需要额外提醒，结果错过了临时调整口令。'],
  宏依赖: ['宏按下去了，角色却没有完成需要的临场动作。', '固定循环没有适配移动节奏，撤离时慢了一拍。', '插件没有给出熟悉的提示，下一步动作当场断档。', '宏还在继续输出，人却已经该离开危险区域。', '目标切换超出宏的预设，关键职责没有及时接上。'],
  不开麦: ['看到了危险却来不及打字提醒，信息传到队友时已经晚了。', '临时换位没有及时报点，两个处理路线撞在了一起。', '能听见新口令，却无法马上说明自己的技能还在冷却。', '需要主动喊话的节点只能用跳跃示意，队友没能理解。', '打字确认慢了半拍，团队按照旧分工继续执行。'],
  小白型: ['把上一轮的站位记成了这一轮，跟着错误标记跑了出去。', '机制名称听懂了，落点出现时却认错了技能。', '照着攻略做了前半步，后半步临场变化没有跟上。', '第一次见到组合机制，犹豫几秒后错过了处理窗口。', '想按自己的新思路救场，结果让原本简单的分工更复杂。'],
  戏精型: ['刚在团队频道说完“看我操作”，下一秒就踩进了技能。', '为了躲得漂亮多绕了一圈，刚好撞上下一处落点。', '亮眼操作的前摇太长，机制先一步完成了结算。', '准备表演极限处理，保命技能却还差一秒冷却。', '边打边活跃气氛，注意力切回来时口令已经喊完。'],
  厌蠢症: ['自己贪了半个技能，发现犯了最讨厌的低级错误后当场沉默。', '急着证明这机制很简单，反而把安全距离算错了。', '复盘别人时记得很清楚，轮到自己却漏掉了一次提示。', '认为不可能出错而少看了一眼，事故偏偏就发生在这一眼。', '想用最快处理给队友示范，结果把容错压得过低。'],
  压力怪: ['一直催别人提速，自己的关键技能却因此早交了。', '盯着队友的站位找问题，漏看了自己脚下的圈。', '为了证明输出没问题贪了一步，撤离口令没能及时执行。', '复盘情绪还没收住，下一轮机制开始时注意力没有回来。', '催促转火时切错目标，反而让集火节奏更乱。'],
  数据执着: ['盯着伤害排名多打了一个技能，错过了移动窗口。', '为了保持输出曲线没有及时停手，触发了额外压力。', '打断表记得很清楚，临场目标变化却没重新确认。', '专注记录技能覆盖，脚下落点出现时才开始移动。', '想把个人数据拉回平均线，结果把团队任务放到了第二位。'],
  调解者: ['忙着提醒两边别争执，自己错过了下一轮准备时间。', '替队友补位时没有确认原站位已经有人接管。', '试图同时照顾两个失误点，最终哪个都只处理了一半。', '把救命技能先交给队友，自己的保命因此出现空档。', '复盘口令说得很清楚，开怪后却还在确认其他人的状态。'],
  拱火者: ['刚问完“谁会犯这种错”，自己就成了战斗记录里的答案。', '忙着观察别人有没有出错，没发现技能已经点到自己。', '准备在团队频道发问号，手离开按键时错过了移动。', '为了看清事故现场多站了一秒，自己也被写进事故报告。', '想等别人先处理，结果所有人都抱着同一个想法。'],
  沉默型: ['没有解释自己的技能状态，队友按默认分工后出现了空档。', '看到临时变化只在原地跳了一下，没人理解这个信号。', '换位时没有发出任何提示，两个安全点因此撞车。', '发现判断错误后没有及时求助，险情一路扩大。', '口令有疑问却保持沉默，最终按错了处理方向。'],
  老司机: ['按旧版本经验提前走位，却撞上了当前战术的落点。', '觉得常规机制无需确认，忽略了团长临时调整的细节。', '凭经验省掉一个步骤，偏偏这一把需要完整执行。', '认为这轮压力不高，保命技能留得过于靠后。', '熟练地完成旧分工，却忘了自己这一把被换了任务。'],
}

function personalizedEventDetail(playerId: string, eventName: string, status: '成功' | '险情' | '失败', fallback: string, roll: number): string {
  const hidden = hiddenById.get(playerId)
  const playerName = publicById.get(playerId)?.name ?? '一名成员'
  if (playerId === 'P086') {
    if (status === '成功' && roll > .9) return `汉祚将尽突然打出一波神级处理，团队频道刚准备夸，他先问“我箭袋带了吧？”`
    if (status !== '成功') {
      const mistakes = [
        '汉祚将尽开怪后才发现箭没带够，输出栏当场进入默哀模式。',
        '汉祚将尽掏错了武器，等换回来时机制已经骑到全团脸上。',
        '汉祚将尽突然问“这个要躲吗？”，问题得到答案时人已经躺下了。',
        '汉祚将尽忙着问下一轮站哪，忘了先处理正在脚下结算的技能。',
        '汉祚将尽发现宠物还在被动，重新点目标时转火窗口已经过去。',
        '汉祚将尽翻背包找工程道具，最后只找到一瓶忘了吃的大红。',
        '汉祚将尽问“现在打哪个？”，全团回答时目标已经换了两次。',
        '汉祚将尽确认自己有没有开雄鹰守护，确认完才发现站位也忘了。',
      ]
      return `${mistakes[Math.floor(roll * mistakes.length)]}${fallback}`
    }
  }
  if (playerId === 'P087' && status !== '成功') {
    const ideas = ['临时改成了一个没人听过的站位', '建议全团一起压过机制', '认为自己可以单独处理这轮点名', '现场发明了新的转火顺序', '把攻略里的两个阶段记成了同一阶段']
    return `愤怒月神${ideas[Math.floor(roll * ideas.length)]}，执行后证明主要可行在语气上。${fallback}`
  }
  if (playerId === 'P083' && status === '险情') return `芙兰秀秀第一拍慢了半秒，好在队友还有技能，事故被摁回了险情。${fallback}`
  if (playerId === 'P083' && status === '失败') return `芙兰秀秀没接上这轮口令，防骑的硬度也没能替她处理机制。${fallback}`
  if (playerId === 'P095' && status !== '成功' && roll < .04) return `多多球刚吐槽完低级错误，自己脑子也闪退了两秒。${fallback}`
  if (playerId === 'P093' && status !== '成功' && /分组|传送|星星|报点|顺序/.test(eventName)) return `茗依处理本身没问题，但不开麦让临时报点慢了半拍。${fallback}`
  if (hidden && status !== '成功') {
    const trait = [hidden.social_primary, hidden.social_secondary].find((candidate) => PERSONAL_FAILURE_DETAILS[candidate])
    const variants = trait ? PERSONAL_FAILURE_DETAILS[trait] : undefined
    if (variants) return `${playerName}${variants[Math.floor(roll * variants.length)]}${fallback}`
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

function incidentalDeathRisk(boss: Boss, hidden: HiddenPlayer, severeFailure: boolean): number {
  const pressure = ({ 低: 0, 中: .01, 高: .035, 极高: .065 } as const)[boss.healing_pressure]
  const personalWeakness = clamp((72 - n(hidden.awareness)) / 500, 0, .11) + clamp((68 - n(hidden.mechanics)) / 650, 0, .08)
  return clamp((severeFailure ? .2 : .045) + pressure + personalWeakness, .03, severeFailure ? .42 : .2)
}

export function simulateCombat(seed: string, boss: Boss, attempt: number, team: TeamMember[], morale: number, pot: number): CombatResult {
  const rng = rngFor(seed, boss.boss_id, attempt, team.map((m) => `${m.id}:${m.currentSpec}`).join(','), 'combat')
  const counts = roleCounts(team)
  const tanks = team.filter((m) => currentSpec(m).role === '坦克')
  const healers = team.filter((m) => currentSpec(m).role === '治疗')
  const dps = team.filter((m) => currentSpec(m).role.includes('DPS'))
  const allData = team.map((m) => ({ m, h: hiddenById.get(m.id)!, s: currentSpec(m), p: publicById.get(m.id)! }))
  const baseSkill = avg(allData.map(({ h, s }) => n(s.skill) * 0.5 + n(h.mechanics) * 0.18 + n(h.awareness) * 0.14 + n(h.stability) * 0.1 + n(h.teamwork) * 0.08))
  const itemLevel = avg(allData.map(({ m, p }) => m.itemLevel ?? n(p.signup_item_level)))
  const ilvlBonus = (itemLevel - 218) * 0.9
  const attemptBonus = avg(allData.map(({ h, s }) => personalLearningGain(h, s, attempt)))
  const moraleBonus = (morale - 70) * 0.12
  const interrupters = allData.filter(({ s }) => s.role !== '治疗' && !['鸟德', '暗牧'].includes(s.spec)).length
  const hasBloodlust = allData.some(({ p }) => p.class === '萨满')
  const hasCommander = allData.some(({ m }) => m.id === 'P092')
  const hasDbFriction = allData.some(({ m }) => m.id === 'P109') && allData.some(({ h }) => [h.social_primary, h.social_secondary].includes('厌蠢症'))
  const encouragers = allData.filter(({ m }) => atmospherePlayerIds.has(m.id))
  const encourager = encouragers[Math.floor(rngFor(seed, boss.boss_id, attempt, 'encourager')() * encouragers.length)]
  const hasEncourager = Boolean(encourager)
  const encouragerName = encourager?.p.name ?? '气氛组'
  const healerQuality = healers.length ? avg(healers.map((m) => {
    const h = hiddenById.get(m.id)!
    return n(currentSpec(m).skill) * .55 + n(h.awareness) * .15 + n(h.stability) * .15 + n(h.teamwork) * .15
  })) : 0
  const healingRequirement = ({ 低: 60, 中: 68, 高: 75, 极高: 82 } as const)[boss.healing_pressure]
  const healingCapacity = healerQuality + Math.max(0, healers.length - 2) * 10 - (healers.length === 1 ? 8 : 0)
  const healingShortfall = healingRequirement - healingCapacity
  const tankIssue = boss.tank_mode === '载具' ? undefined
    : counts.坦克 === 0
      ? { reason: '一个坦克都没带，Boss第一轮点名后没人能站着接仇恨。', timing: .14 }
      : boss.tank_mode === '双坦' && counts.坦克 < 2
        ? { reason: `${boss.boss_name}明确需要双坦，团长只安排了1名坦克，换坦和副目标只能现场抽奖。`, timing: .3 }
        : counts.坦克 >= 3
          ? { reason: `全团塞了${counts.坦克}名坦克，输出位被挤没了；人是挺硬，Boss血条更硬。`, timing: .78 }
          : undefined
  const healingIssue = counts.治疗 === 0
    ? { reason: '治疗位是空的，团血像手机电量一样肉眼可见地往下掉。', timing: .18 }
    : healingShortfall >= 12
      ? { reason: `${boss.boss_name}是${boss.healing_pressure}治疗压力，${counts.治疗}名治疗的平均实战水平只有${Math.round(healerQuality)}，人数看着够，奶量和救场都没跟上。`, timing: .42 }
      : counts.治疗 >= 4
        ? { reason: `带了${counts.治疗}名治疗，血条确实很安全，直到Boss狂暴把所有人一起送走。`, timing: .82 }
        : undefined
  const structureIssue = tankIssue ?? healingIssue ?? (dps.length < 5
    ? { reason: `只有${dps.length}名输出，机制都做对了，Boss还是靠血量拖进狂暴。`, timing: .84 }
    : undefined)

  let structurePenalty = 0
  if (boss.tank_mode !== '载具') {
    if (counts.坦克 === 0) structurePenalty -= 40
    else if (boss.tank_mode === '双坦' && counts.坦克 === 1) structurePenalty -= 20
    else if (boss.tank_mode === '单坦' && counts.坦克 >= 2) structurePenalty -= (counts.坦克 - 1) * 4
    else if (counts.坦克 >= 3) structurePenalty -= (counts.坦克 - 2) * 14
  }
  if (counts.治疗 === 0) structurePenalty -= 42
  else {
    if (healingShortfall > 0) structurePenalty -= Math.min(27, healingShortfall * .75)
    if (counts.治疗 === 3 && ['低', '中'].includes(boss.healing_pressure)) structurePenalty -= 4
    if (counts.治疗 >= 4) structurePenalty -= 7 + (counts.治疗 - 4) * 6
  }
  if (dps.length < 5) structurePenalty -= (5 - dps.length) * 5
  if (boss.boss_id === 'B03' && counts.远程DPS < 2) structurePenalty -= (2 - counts.远程DPS) * 7

  const eliteCoordinationBonus = baseSkill >= 88 ? 4 : baseSkill >= 84 ? 1.5 : 0
  const observerBonus = boss.boss_id === 'B14' && team.some((member) => member.id === 'P094') ? 2 : 0
  const allCustomRoster = allData.every(({ h }) => h.source_type === '玩家自建')
  const customCohesionBonus = allCustomRoster ? 2.5 + clamp((78 - baseSkill) * .45, 0, 4.5) : 0
  const customProgressionBonus = allCustomRoster ? clamp(Math.max(0, 76 - baseSkill) * .36 * (n(boss.order) - 1), 0, 28) : 0
  const underdogBreakthrough = allCustomRoster
    && baseSkill < 70
    && rngFor(seed, team.map((member) => member.id).join(','), 'underdog-run')() < .016
  const underdogBonus = underdogBreakthrough ? 24 : 0
  const teamPower = baseSkill + ilvlBonus + attemptBonus + moraleBonus + structurePenalty + eliteCoordinationBonus + (hasCommander ? 1.5 : 0) + observerBonus + customCohesionBonus + customProgressionBonus + underdogBonus
  const progressionRelief: Record<string, number> = { B04: 2, B05: 2, B07: 2, B08: 3, B09: 3, B10: 4, B11: 5, B12: 4, B13: 4, B14: 24 }
  const bossDc = n(boss.base_dc) - (progressionRelief[boss.boss_id] ?? 0)
  const events = bossEvents.filter((e) => e.boss_id === boss.boss_id)
  const profile = encounterProfile(boss.boss_id)
  const results: EventResult[] = []
  const deaths: CombatDeath[] = []
  const permanentlyDead = new Set<string>()
  const usedBattleRes = new Set<string>()
  const battleResSources = allData.filter(({ p }) => p.class === '德鲁伊' || p.class === '术士')
  const tolerance = deathTolerance(boss)
  let danger = Math.max(0, bossDc + 7 - teamPower)
  let severe = false
  let responsible = ''

  const recordDeath = (target: TeamMember, eventName: string, timeRatio: number) => {
    const spec = currentSpec(target)
    const targetPublic = publicById.get(target.id)!
    let resurrectedBy: string | undefined
    if (spec.role !== '坦克') {
      if (targetPublic.class === '萨满' && !usedBattleRes.has(`self:${target.id}`)) {
        usedBattleRes.add(`self:${target.id}`)
        resurrectedBy = targetPublic.name
      } else {
        const source = battleResSources.find(({ m }) => m.id !== target.id && !permanentlyDead.has(m.id) && !usedBattleRes.has(m.id))
        if (source) {
          usedBattleRes.add(source.m.id)
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
    const alive = (members: TeamMember[]) => members.filter((member) => !permanentlyDead.has(member.id))
    const livingTeam = alive(team)
    const targetPool = event.target.includes('坦') ? (alive(tanks).length ? alive(tanks) : livingTeam)
      : event.target.includes('治疗') ? (alive(healers).length ? alive(healers) : livingTeam)
        : event.target.includes('DPS') || event.target.includes('打断') ? (alive(dps).length ? alive(dps) : livingTeam) : livingTeam
    const target = targetPool[Math.floor(rng() * targetPool.length)]
    const targetHidden = hiddenById.get(target.id)!
    const personalRoll = rngFor(seed, boss.boss_id, attempt, target.id, event.event_id, 'personality-event')()
    let eventAbility = n(targetHidden.mechanics) * 0.35 + n(targetHidden.awareness) * 0.25 + n(targetHidden.stability) * 0.2 + n(targetHidden.teamwork) * 0.1 + n(currentSpec(target).skill) * 0.1 + personalLearningGain(targetHidden, currentSpec(target), attempt)
    if (underdogBreakthrough) eventAbility += 30
    if (target.id === 'P086') eventAbility += personalRoll < .08 ? -28 : personalRoll > .9 ? 12 : 0
    if (target.id === 'P087' && personalRoll < .16) eventAbility -= 16
    if ([targetHidden.social_primary, targetHidden.social_secondary].includes('宏依赖')) eventAbility += profile.movement >= .4 ? -10 : 4
    if ([targetHidden.social_primary, targetHidden.social_secondary].includes('团队执行')) eventAbility += 3
    if ([targetHidden.social_primary, targetHidden.social_secondary].includes('不开麦') && /报点|顺序|传送|分组|星星/.test(event.event_name)) eventAbility -= 4
    if (target.id === 'P090' && attempt > 1) eventAbility += 5
    if (target.id === 'P094' && boss.boss_id === 'B14') eventAbility += 12
    if (target.id === 'P095' && personalRoll < .04) eventAbility -= 22
    if (target.id === 'P092') eventAbility += 4
    if (target.id === 'P093' && /分组|传送|星星|报点|顺序/.test(event.event_name)) eventAbility -= 7
    const support = (teamPower - bossDc) * 0.65
    let requirementPenalty = 0
    if ((event.team_requirement.includes('双坦') || event.team_requirement.includes('副坦')) && tanks.length < 2) {
      requirementPenalty -= boss.tank_mode === '双坦' ? 34 : boss.tank_mode === '弹性' ? 10 : 0
    }
    if (event.team_requirement.includes('2治疗')) {
      if (healers.length < 2) requirementPenalty -= healerQuality >= 90 && boss.healing_pressure !== '极高' ? 9 : 34
      requirementPenalty -= Math.min(18, Math.max(0, healingShortfall * .7))
    }
    if (event.team_requirement.includes('3打断') && interrupters < 3) requirementPenalty -= 20
    if (event.team_requirement.includes('远程') && counts.远程DPS < 2) requirementPenalty -= 16
    if (event.team_requirement.includes('嗜血') && !hasBloodlust) requirementPenalty -= 12
    const chance = clamp(58 + (eventAbility - n(event.event_dc)) * 1.05 + support + requirementPenalty + (rng() * 10 - 5), 5, 96)
    const roll = rng() * 100
    const timeRatio = profile.timings[eventIndex] ?? (eventIndex + 1) / (events.length + 1)
    if (roll <= chance) {
      const cleanDetails = [
        '该躲的躲、该断的断，团长暂时不用深呼吸。',
        '处理得像教学录像，甚至没人抢着在团队频道邀功。',
        '目标切得很快，Boss刚想整活就被按了回去。',
        '全员突然像会玩了一样，机制干净得有点陌生。',
        '技能准时交出，这波没有人用脸测试伤害。',
        '站位严丝合缝，地板技找了半天没找到受害者。',
        '指挥刚喊完就处理掉了，难得不是喊完才开始动。',
        '这轮很顺，连压力怪都暂时找不到开喷角度。',
        '打断、转火、走位一气呵成，战斗记录干净得不像野团。',
        '危险技能刚亮，全团已经提前散开，Boss像在对空气表演。',
        '该停手的人真停了手，第一次没人用“最后一个技能已经按了”当借口。',
        '治疗预读刚好压上，血线抖了一下又像什么都没发生。',
        '两边小队同时处理完毕，没有人带着技能来主团串门。',
        '目标标记才亮就被集火清掉，连团长的第二遍口令都省了。',
        '关键技能留得很准，既没早交装死，也没晚交陪葬。',
        '全团这轮像共用了一个脑子，而且难得是那个会玩的脑子。',
        '机制落点规规矩矩，地板表示今晚这单生意不好做。',
        '节奏稳得像排练过，团队频道安静到只剩技能音效。',
      ]
      results.push({ name: event.event_name, status: '成功', detail: personalizedEventDetail(target.id, event.event_name, '成功', cleanDetails[Math.floor(rng() * cleanDetails.length)], personalRoll), timeRatio })
    } else if (roll <= chance + 15 || (target.id === 'P083' && personalRoll >= .22)) {
      danger += 7
      const targetName = publicById.get(target.id)?.name ?? '一名成员'
      const incidentalDeath = currentSpec(target).role !== '坦克'
        && !isCatastrophicFailure(event.soft_fail)
        && (caiFamilyIds.has(target.id) || rngFor(seed, boss.boss_id, attempt, target.id, event.event_id, 'soft-death')() < incidentalDeathRisk(boss, targetHidden, false))
      if (describesDeath(event.soft_fail) || incidentalDeath) {
        const { death, fatal } = recordDeath(target, event.event_name, timeRatio)
        danger += death.battleResurrected ? 4 : 10
        const recovery = death.battleResurrected
          ? (publicById.get(target.id)?.class === '萨满'
              ? `${targetName}使用复生重新站起，但停手期间的输出/治疗已经损失。`
              : `${death.resurrectedBy}战复了${targetName}，重新接回战斗节奏。`)
          : `${targetName}未能复起，剩余成员继续作战。`
        if (fatal) {
          severe = true
          responsible = target.id
          const fatalDetail = currentSpec(target).role === '坦克'
            ? `${event.soft_fail} 坦克阵亡后仇恨链立即崩溃。`
            : `${event.soft_fail} ${targetName}在失误后当场倒地；当前 Boss 最多容许 ${tolerance} 人持续减员，团队已无法维持战斗。`
          results.push({ name: event.event_name, status: '失败', detail: personalizedEventDetail(target.id, event.event_name, '失败', fatalDetail, personalRoll), responsible: targetName, timeRatio })
          break
        }
        results.push({ name: event.event_name, status: '险情', detail: personalizedEventDetail(target.id, event.event_name, '险情', event.soft_fail, personalRoll), responsible: targetName, recoveryBy: death.resurrectedBy, recovery, timeRatio })
      } else {
        const rescuer = recoveryMember(event.event_name, target.id, livingTeam, rng)
        const recoveryBy = publicById.get(rescuer.id)?.name ?? '队友'
        results.push({ name: event.event_name, status: '险情', detail: personalizedEventDetail(target.id, event.event_name, '险情', event.soft_fail, personalRoll), responsible: targetName, recoveryBy, recovery: `${recoveryBy}${recoveryText(event.event_name, targetName, rng)}`, timeRatio })
      }
      responsible ||= target.id
    } else {
      const targetName = publicById.get(target.id)?.name ?? '一名成员'
      const personalDeath = !isCatastrophicFailure(event.hard_fail)
        && (describesDeath(event.hard_fail)
          || (currentSpec(target).role !== '坦克'
            && (caiFamilyIds.has(target.id) || rngFor(seed, boss.boss_id, attempt, target.id, event.event_id, 'hard-death')() < incidentalDeathRisk(boss, targetHidden, true))))
      if (personalDeath) {
        const { death, fatal } = recordDeath(target, event.event_name, timeRatio)
        danger += death.battleResurrected ? 10 : 16
        if (!fatal) {
          const recovery = death.battleResurrected
            ? (publicById.get(target.id)?.class === '萨满'
                ? `${targetName}使用复生重新加入战斗。`
                : `${death.resurrectedBy}交出战复，${targetName}重新起身。`)
            : `${targetName}阵亡后没有战复，团队带着 ${permanentlyDead.size} 人减员继续作战。`
          results.push({ name: event.event_name, status: '险情', detail: personalizedEventDetail(target.id, event.event_name, '险情', event.hard_fail, personalRoll), responsible: targetName, recoveryBy: death.resurrectedBy, recovery, timeRatio })
          responsible ||= target.id
          continue
        }
      }
      danger += 18
      severe = true
      responsible = target.id
      results.push({ name: event.event_name, status: '失败', detail: personalizedEventDetail(target.id, event.event_name, '失败', event.hard_fail, personalRoll), responsible: targetName, timeRatio })
      break
    }
  }

  const killChance = clamp(58 + (teamPower - bossDc) * 2.7 - danger * 0.65 - permanentlyDead.size * 7 - (deaths.length - permanentlyDead.size) * 2, 2, 96)
  const killed = !severe && rng() * 100 < killChance
  const structuralFailure = !killed && Boolean(structureIssue)
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
    : clamp(Math.round(72 - (teamPower - bossDc) * 2.4 + danger * 0.75 + rng() * 18), 1, 96)
  if (!responsible) responsible = team[Math.floor(rng() * team.length)].id
  const blamedName = responsible === '团长' ? '团长' : publicById.get(responsible)?.name ?? '未知成员'
  const failedEvent = results.find((r) => r.status === '失败')
  const permanentNames = deaths.filter((death) => !death.battleResurrected).map((death) => death.name)
  const reason = killed
    ? deaths.length
      ? `${deaths.length} 人次倒地、${deaths.length - permanentlyDead.size} 次战复后，剩余成员把 Boss 收掉了。`
      : '团队稳住了最后一轮机制，Boss含泪交货。'
    : structuralFailure
      ? structureIssue!.reason
      : failedEvent?.detail
        ?? (permanentNames.length
          ? `${permanentNames.join('、')}减员后，剩余成员没能维持输出与治疗节奏，Boss进入狂暴。`
          : counts.治疗 < 2
            ? '治疗链无法覆盖持续团伤，后半程资源耗尽后全团倒下。'
            : '前面的险情已经处理完，但最后阶段输出与治疗资源同时见底，Boss进入狂暴。')
  const estimatedFullDuration = clamp(235 - (teamPower - bossDc) * 2.8 + rng() * 18, 105, 320)
  const duration = killed
    ? Math.round(estimatedFullDuration)
    : fatalEvent
      ? Math.round(clamp(estimatedFullDuration * fatalProgress, 28, 280))
      : Math.round(clamp(42 + (1 - remainingHp / 100) * 245, 45, 285))
  if (fatalEvent && fatalProgress > 0) {
    results.forEach((result) => { result.timeRatio = clamp((result.timeRatio ?? fatalProgress) / fatalProgress * .9, .04, .9) })
  }
  const failureFactor = clamp(1 - results.filter((r) => r.status === '失败').length * 0.08 - results.filter((r) => r.status === '险情').length * 0.035, 0.58, 1)
  const meters: CombatMeter[] = allData.map(({ m, h: memberHidden, s, p }) => {
    const meterRng = rngFor(seed, boss.boss_id, attempt, m.id, m.currentSpec, 'meter')
    const gear = clamp(((m.itemLevel ?? n(p.signup_item_level)) - 200) / 32, 0, 1.16)
    const composite = n(s.skill) * .3 + n(memberHidden.main_skill) * .15 + n(memberHidden.mechanics) * .15 + n(memberHidden.awareness) * .12 + n(memberHidden.stability) * .12 + n(memberHidden.teamwork) * .08 + n(s.boss_experience) * .08 + personalLearningGain(memberHidden, s, attempt) * .3
    const elite = composite >= 95 ? 1.04 : composite >= 90 ? 1.02 : composite < 62 ? .96 : 1
    const encounter = outputModifier(boss.boss_id, s.role, p.class, composite)
    const formSpread = .055 + clamp((85 - n(memberHidden.stability)) / 300, 0, .08)
    const form = 1 + (meterRng() * 2 - 1) * formSpread
    let dps = 0
    let hps = 0
    if (s.role.includes('DPS')) {
      dps = (2550 + gear * 1550 + composite * 37) * elite * encounter * form * failureFactor
    } else if (s.role === '坦克') {
      dps = (900 + gear * 850 + composite * 18) * elite * form * failureFactor
    } else {
      dps = (100 + composite * 2.2) * (0.85 + meterRng() * 0.15)
      hps = (1450 + gear * 1350 + composite * 36) * elite * encounter * form * (1 + Math.max(0, danger) / 180)
    }
    if (m.id === 'P081' && s.role.includes('DPS')) dps *= .97
    if (m.id === 'P086' && s.role.includes('DPS')) dps *= .9 + meterRng() * .22
    if (m.id === 'P089' && bossDc >= 80) dps *= .92
    if ([memberHidden.social_primary, memberHidden.social_secondary].includes('宏依赖') && s.role.includes('DPS')) dps *= profile.movement < .3 ? 1.04 : 1 - profile.movement * .2
    if (m.id === 'P094' && boss.boss_id === 'B14') {
      if (s.role.includes('DPS')) dps *= 1.14
      if (s.role === '治疗') hps *= 1.14
    }
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
      spec: s.spec,
      role: s.role,
      itemLevel: m.itemLevel ?? n(p.signup_item_level),
      dps,
      hps,
      damage: dps * duration,
      healing: hps * duration,
      died: memberDeaths.length > 0,
      battleResurrected: memberDeaths.some((death) => death.battleResurrected),
      activeRatio,
    }
  })
  const teamDps = meters.reduce((sum, meter) => sum + meter.dps, 0)
  const teamHps = meters.reduce((sum, meter) => sum + meter.hps, 0)

  if (attempt === 1 && team.some((member) => member.id === 'P092') && rngFor(seed, boss.boss_id, 'P092', 'rule-ban')() < .001) {
    const banEvent: EventResult = { name: '系统制裁', status: '失败', detail: '初中肄业研究规则漏洞时把自己研究进了封号名单，角色原地掉线。', responsible: '初中肄业', timeRatio: .08 }
    return { bossId: boss.boss_id, attempt, killed: false, remainingHp: 99, events: [banEvent], reason: '核心坦克被系统封禁，团队甚至没来得及讨论这算不算机制。', responsible: 'P092', chat: ['系统：初中肄业的账号已被暂时冻结。', '团长：他研究规则的最终成果出来了。', '队员：这Boss掉落里有申诉链接吗？'], leaver: 'P092', leaveType: '违规封号', leaveReason: '初中肄业因研究规则漏洞触发了极低概率的封号事件，被迫离开团队。', moraleDelta: -10, moraleReason: '指挥兼主坦被系统抬走，全团开始重新理解“不可抗力”', duration: 30, teamDps, teamHps, meters, deaths, casualties: permanentlyDead.size, battleReses: deaths.length - permanentlyDead.size }
  }

  if (killed) {
    const cleanKill = results.every((event) => event.status === '成功')
    const atmosphereCelebration = hasEncourager && rngFor(seed, boss.boss_id, attempt, encourager?.m.id ?? '', 'atmosphere-celebration')() < .3
    const moraleDelta = (cleanKill ? 4 : 1) + (atmosphereCelebration ? 3 : 0)
    const baseReason = cleanKill ? '全程没出岔子，干净击杀' : deaths.length ? `${deaths.length} 人次倒地、${deaths.length - permanentlyDead.size} 次战复后完成击杀` : '中间有险情，但最后救回来了'
    const moraleReason = atmosphereCelebration ? `${baseReason}；${encouragerName}带头活跃气氛，额外提振士气` : baseReason
    return { bossId: boss.boss_id, attempt, killed, remainingHp: 0, events: results, reason, responsible: '', chat: [], moraleDelta, moraleReason, duration, teamDps, teamHps, meters, deaths, casualties: permanentlyDead.size, battleReses: deaths.length - permanentlyDead.size }
  }

  const baseMoraleLoss = -[8, 12, 12][attempt - 1]
  const moraleDelta = baseMoraleLoss - (hasDbFriction ? 1 : 0)
  const chatRng = rngFor(seed, boss.boss_id, attempt, responsible, 'wipe-chat')
  let chat: string[]
  if (structuralFailure && structureIssue) {
    const leaderLines = counts.坦克 < 2
      ? ['团长：不用点人了，这锅我背，一个T确实不是勇敢，是省错位置了。', '团长：我看懂了，副坦不是一种精神状态，真得带个人。', '团长：刚才不是坦克倒得快，是第二个坦克压根没进本。']
      : counts.坦克 >= 3
        ? ['团长：三个T像买保险，结果保的是Boss不掉血。', '团长：坦克是够了，输出位也被我亲手安排没了。', '团长：这配置打不死人，但主要是打不死Boss。']
        : counts.治疗 < 2
          ? ['团长：一个奶刷十个人，我这分工多少带点许愿成分。', '团长：别问奶为什么没刷住，先问我为什么只带一个奶。']
          : ['团长：都别找个人锅了，这阵容是我亲手拼出来的事故现场。', '团长：机制没输，数学输了；这锅在组人界面就已经熟了。']
    const roastLines = ['队员：团长终于开始看右边那个职责统计了。', '队员：建议下一把组人时顺便组个阵容。', '队员：Boss没研究明白，排列组合倒是玩上了。', '队员：这不是谁手法差，这是团长在开怪前就把答案选错了。']
    chat = [leaderLines[Math.floor(chatRng() * leaderLines.length)], roastLines[Math.floor(chatRng() * roastLines.length)]]
  } else {
    const h = hiddenById.get(responsible)!
    const leaderLines = [`团长：别急着放，${failedEvent?.name ?? '刚才那波'}谁漏的？`, `团长：这把能打，${failedEvent?.name ?? '最后一轮'}别再送了。`, '团长：先别拉，刚才技能谁没交？', '团长：行了，都少打字，下一把听口令。', '团长：战斗记录都点名了，先别表演无辜。', '团长：尸体先别释放，锅已经自己走到镜头中间了。']
    const ownLines = ['我的我的，手慢了，下把不会。', '这波我背，刚才技能交晚了。', '看见了，我锅，下把提前走。', '行，录像不用回放了，主角就是我。', '我刚才脑子短暂掉线，下把把它接回来。']
    const denyLines = ['不是我吧，我这边技能交了。', '我按口令走的，前面先崩的。', '我没吃到啊，别啥都先点我。', '先别急着判，我觉得战斗记录也可能看错人。', '这技能追着我来的，严格说是Boss针对。']
    const answerPool = h.social_primary === '责任型' || n(h.claim_honesty) > 70 ? ownLines : denyLines
    const unsafeSelfResponseStyles = new Set(['压力怪', '厌蠢症', '拱火者', '阴阳怪气'])
    const responsibleStyles = [h.social_primary, h.social_secondary].filter((trait) => trait && trait !== '无' && !unsafeSelfResponseStyles.has(trait))
    if (!responsibleStyles.length) responsibleStyles.push(h.social_primary === '责任型' || n(h.claim_honesty) > 70 ? '责任型' : '嘴硬型')
    const personalityAnswer = pickChatTemplate('灭团', responsibleStyles, chatRng)
    chat = [leaderLines[Math.floor(chatRng() * leaderLines.length)]]
    if (isQuietPlayer(h)) chat.push(`${blamedName}没开麦，也没抢着解释，只在原地跳了一下表示收到。`)
    else chat.push(`${blamedName}：${personalityAnswer ?? answerPool[Math.floor(chatRng() * answerPool.length)]}`)
  }
  const pressure = allData.find(({ m, h: th }) => m.id !== responsible && !isQuietPlayer(th) && !isGlassHeart(th) && (th.social_primary === '压力怪' || th.social_secondary === '压力怪'))
  const mediator = allData.find(({ m, h: th }) => m.id !== responsible && m.id !== pressure?.m.id && !isQuietPlayer(th) && !isGlassHeart(th) && (th.social_primary === '调解者' || th.social_secondary === '调解者'))
  if (pressure) {
    const lines = ['这都能中？闭眼打的？', '不会机制早说，别拿全团陪练。', '三把机会是给你现场学机制的？', 'DPS先别看表了，地板都快被你踩穿了。', '我奶宠物都没这么费劲。', '你这走位属于技能去哪你去哪。']
    chat.push(`${pressure.p.name}：${pickChatTemplate('灭团', [pressure.h.social_primary, pressure.h.social_secondary], chatRng) ?? lines[Math.floor(chatRng() * lines.length)]}`)
  }
  if (mediator) {
    const lines = ['行了行了，知道哪炸的就下一把。', '别吵了，打断顺序重排一下就行。', '先拉人，嘴留着过了再喷。', '先把Boss过了，散团小作文晚点写。', '有空打字说明蓝还够，赶紧坐地板回蓝。']
    chat.push(`${mediator.p.name}：${pickChatTemplate('灭团', ['调解者', '气氛组'], chatRng) ?? lines[Math.floor(chatRng() * lines.length)]}`)
  }
  const instigator = allData.find(({ m, h: th }) => m.id !== responsible && m.id !== pressure?.m.id && m.id !== mediator?.m.id && !isQuietPlayer(th) && !isGlassHeart(th) && (th.social_primary === '拱火者' || th.social_secondary === '拱火者'))
  if (instigator) {
    const lines = ['我不说是谁，反正战斗记录有名字。', '刚才那波挺精彩的，建议保存录像。', '没事，再来一把总有人能学会。', '这把唯一稳定发挥的是修理费。', '我宣布地板伤害再次拿下全场第一。']
    chat.push(`${instigator.p.name}：${pickChatTemplate('灭团', ['拱火者'], chatRng) ?? lines[Math.floor(chatRng() * lines.length)]}`)
  }
  const occupiedSpeakers = new Set([responsible, pressure?.m.id, mediator?.m.id, instigator?.m.id].filter(Boolean))
  const commentators = allData.filter(({ m, h }) => !occupiedSpeakers.has(m.id) && !isQuietPlayer(h) && !isGlassHeart(h))
  const commentator = commentators[Math.floor(chatRng() * commentators.length)]
  if (commentator && chatRng() < .72) {
    const line = pickChatTemplate('灭团', [commentator.h.social_primary, commentator.h.social_secondary].filter((trait) => trait && trait !== '无'), chatRng)
    if (line) {
      chat.push(`${commentator.p.name}：${line}`)
      occupiedSpeakers.add(commentator.m.id)
    }
  }
  if (encourager && !occupiedSpeakers.has(encourager.m.id) && chatRng() < .75) {
    chat.push(`${encourager.p.name}：${pickChatTemplate('灭团', ['气氛组'], chatRng) ?? '问题找到了就行，下把重新来。'}`)
  }

  let leaver: string | undefined
  let collapseRoaster: (typeof allData)[number] | undefined
  const collapseVictimIds = new Set(['P096', 'P100', 'P088'])
  const collapseRoasters = allData.filter(({ m }) => m.id === 'P081' || m.id === 'P095')
  if (attempt < 3 && collapseVictimIds.has(responsible) && collapseRoasters.length) {
    const collapseRng = rngFor(seed, boss.boss_id, attempt, responsible, 'collapse-leave')
    if (collapseRng() < .1) {
      leaver = responsible
      collapseRoaster = collapseRoasters[Math.floor(collapseRng() * collapseRoasters.length)]
    }
  }
  for (const { m, h: memberHidden } of attempt >= 3 ? [] : allData) {
    if (leaver) break
    if (memberHidden.leave_policy === '永不主动退队') continue
    const attemptScale = [0.1, 0.38, 0.82][attempt - 1]
    let rate = n(memberHidden.base_leave_pct) * attemptScale + [0, 1.5, 5][attempt - 1]
    const projectedMorale = morale + moraleDelta
    if (projectedMorale < 55) rate += [0.5, 1.5, 3][attempt - 1]
    if (projectedMorale < 40) rate += [1, 2.5, 5][attempt - 1]
    if (projectedMorale < 25) rate += [1.5, 3.5, 7][attempt - 1]
    if (m.id === responsible) rate += memberHidden.social_primary === '玻璃心' ? [1.5, 5, 10][attempt - 1] : [0, 1.5, 3][attempt - 1]
    if (remainingHp > 50) rate += [0.5, 2, 4][attempt - 1]
    const perHead = pot / Math.max(team.length, 1)
    if (perHead > 3500) rate -= Math.min(8, perHead / 1000)
    else if (attempt > 1 && memberHidden.economy_type === '排骨党') rate += attempt === 2 ? 1.5 : 4
    if (memberHidden.economy_type === '排骨党' && pot > 20000) rate -= 5
    if (baseSkill >= 88) rate -= 6
    else if (baseSkill >= 84) rate -= 3
    if (hasEncourager) rate -= 1
    if (hasCommander) rate -= 1
    if (m.id === 'P092' && baseSkill < 75) rate += (75 - baseSkill) * .25
    if (m.id === 'P095' && attempt >= 2 && (remainingHp > 35 || baseSkill < 80)) rate += 14
    if (m.id === 'P120' && attempt >= 2 && baseSkill < 78) rate += Math.min(18, (78 - baseSkill) * .8)
    if (hasDbFriction && [memberHidden.social_primary, memberHidden.social_secondary].includes('厌蠢症')) rate += 3
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
      const roastLines = ['同一个机制还要错几次？不会就早点说。', '这波已经讲得够清楚了，还能再送一遍？', '别再说没看见了，战斗记录写着名字。', '全团陪着修装备，就因为这一个错误。']
      const roast = roastLines[Math.floor(leaveRng * roastLines.length)]
      leaveType = '分崩离析'
      leaveReason = `${leaveName}在个人失误导致灭团后遭到${collapseRoaster.p.name}当众指责，争执升级并直接退团，团队随即瓦解。`
      chat.push(`${collapseRoaster.p.name}：${roast}`, `${leaveName}：行，那你们自己打。`, `系统：${leaveName} 离开了团队。`)
    } else if (isSilent && leaveRng < 0.72) {
      leaveType = '战术下线'
      leaveReason = `${leaveName}在连续灭团后始终没有回应，随后角色直接离线，团队无法继续。`
      chat.push(`团长：${leaveName}？能听见吗？`, `系统：${leaveName} 已离线。`)
    } else if (isCombative && leaveRng < 0.76) {
      leaveType = '开喷退团'
      leaveReason = `${leaveName}对复盘和责任划分不满，争执升级后主动退团。`
      chat.push(`${leaveName}：${leaveLine ?? '这打法根本过不了，谁爱陪谁陪。'}`, `团长：有问题说问题，别直接甩锅。`, `系统：${leaveName} 离开了团队。`)
    } else if (lowExpectedShare && leaveHidden.economy_type === '排骨党') {
      leaveType = '直接退团'
      leaveReason = `${leaveName}认为当前进度和金池不成比例，不愿继续承担灭团成本。`
      chat.push(`${leaveName}：${leaveLine ?? '打到现在金池才这点，没必要继续耗。'}`, `系统：${leaveName} 离开了团队。`)
    } else if (leaver === responsible && leaveHidden.social_primary === '玻璃心') {
      leaveType = '直接退团'
      leaveReason = `${leaveName}在失误被点名后心态崩溃，拒绝继续尝试。`
      chat.push(`${leaveName}：${leaveLine ?? '行，都算我的，我不打了。'}`, `系统：${leaveName} 离开了团队。`)
    } else if (leaveRng < 0.34) {
      leaveType = '借故离开'
      leaveReason = `${leaveName}在灭团后表示临时有事，未等替补便退出团队。`
      chat.push(`${leaveName}：${leaveLine ?? '临时有事，真打不了了。'}`, `团长：现在退人就直接散了。`, `系统：${leaveName} 离开了团队。`)
    } else if (leaveRng < 0.6) {
      leaveType = '战术下线'
      leaveReason = `${leaveName}没有解释原因，灭团复盘期间突然下线。`
      chat.push(`${leaveName}：${leaveLine ?? '掉了。'}`, `系统：${leaveName} 已离线。`)
    } else {
      leaveType = '直接退团'
      leaveReason = `${leaveName}判断团队短时间内无法通过当前 Boss，选择及时止损。`
      chat.push(`${leaveName}：${leaveLine ?? '状态不对，继续打也是三灭，我先走了。'}`, `系统：${leaveName} 离开了团队。`)
    }
    if (leaver !== responsible && isGlassHeart(leaveHidden)) {
      chat = chat.filter((line) => !line.startsWith(`${leaveName}：`))
    }
  }
  if (attempt >= 3) chat.push('团长：三把打完了，今天就到这，散。', '系统：本 Boss 三次尝试均告失败。')
  const moraleReason = structuralFailure ? `职责配置失衡，团长背锅：${structureIssue!.reason}` : remainingHp < 10 ? `只差 ${remainingHp}% 灭团，大家觉得还有机会` : `第 ${attempt} 次灭团，Boss 还剩 ${remainingHp}%`
  return { bossId: boss.boss_id, attempt, killed, remainingHp, events: results, reason, responsible, chat, leaver, leaveType, leaveReason, moraleDelta, moraleReason, duration, teamDps, teamHps, meters, deaths, casualties: permanentlyDead.size, battleReses: deaths.length - permanentlyDead.size }
}

export function itemStartPrice(item: LootItem): number {
  return ({ C: 200, B: 500, A: 1000, S: 2000, 'S+': 2000 } as const)[item.grade]
}

export function itemReferencePrice(item: LootItem): number {
  return ({ C: 600, B: 1500, A: 3200, S: 6500, 'S+': 9000 } as const)[item.grade]
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
      武器饰品党: [.62, 1.02], 捡漏型: [.38, .7], 排骨党: [.24, .48], 口嗨消费: [.36, .68], 简陋型: [.34, .66],
    }
    const bids: Bid[] = []
    for (const member of nextTeam) {
      if (!eligible(item, member)) continue
      const h = hiddenById.get(member.id)!
      const rng = rngFor(seed, boss.boss_id, item.loot_id, member.id, 'bid')
      const pref = h.purchase_preference.includes(item.category) || h.purchase_preference.includes(item.grade) || h.purchase_preference === '全部'
      let desire = n(h.spend_willingness) + quality[item.grade] + (pref ? 22 : -8) + (rng() * 30 - 15)
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
      const maxFactor = floorFactor + rng() * (ceilingFactor - floorFactor) + aggressionBonus + preferenceBonus
      const max = Math.floor(Math.min(member.wallet - n(h.reserve_gold), reference * maxFactor) / 100) * 100
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
    const bidLine = (bidderName: string, amount: number, bidRng: () => number) => {
      if (bidRng() < .75) return `${bidderName}：${amount}`
      const formatted = String(amount)
      const spoken = pickChatTemplate('拍卖', ['出价'], bidRng, { price: formatted, item: item.item_name }) ?? formatted
      return `${bidderName}：${/\d/.test(spoken) ? spoken : `${spoken} ${formatted}`}`
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
        const stepChoices = round >= 20 ? [500] : current >= 1000 ? [100, 100, 200, 200, 500] : [100, 100, 100, 200]
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
        log.push(bidLine(bidder.name, current, bidFlowRng))
      }

      buyer = leader ?? active[0] ?? willing[0]
      price = Math.max(start, current || start)
      if (!leader) log.push(bidLine(buyer.name, start, bidFlowRng))
      active.filter((bidder) => bidder.playerId !== buyer?.playerId && !exited.has(bidder.playerId)).forEach(leaveAuction)
      log.push('团长：5、4、3、2、1。')
      log.push(`成交：${buyer.name}，${price.toLocaleString()}G。`)
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
      nextTeam = nextTeam.map((m) => m.id === buyer!.playerId ? { ...m, wallet: m.wallet - price, spent: m.spent + price, purchases: [...m.purchases, item.item_name] } : m)
    }
    potGain += price
    if (['S', 'S+'].includes(item.grade)) {
      if (salvaged || price < reference * .45) {
        moraleDelta -= 3
        moraleReasons.push(`${item.item_name}是极品却流拍或卖得太低`)
      } else {
        moraleDelta += 2
        moraleReasons.push(`出了${item.grade}级极品 ${item.item_name}`)
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
  return { records, team: nextTeam, potGain, moraleDelta: clamp(moraleDelta, -4, 4), moraleReasons }
}

export function createMember(id: string, seed = '380'): TeamMember {
  const pub = publicById.get(id)!
  const h = hiddenById.get(id)!
  return { id, currentSpec: pub.signup_spec, itemLevel: dynamicItemLevel(id, seed), wallet: n(h.wallet_gold), spent: 0, purchases: [], left: false, blame: 0, performance: n(h.main_skill) }
}

export const allPlayerSpecs = playerSpecs
