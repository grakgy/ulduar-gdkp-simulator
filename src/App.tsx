import { useEffect, useMemo, useRef, useState } from 'react'
import { bosses, chatTemplates, combatLogTemplates, gameConfig, hiddenById, playersForSeed, publicById, type Boss, type CombatLogTemplate, type LootItem, type PublicPlayer } from './data'
import { activeRaidBuffs, createMember, createPlayerStatus, currentSpec, dynamicItemLevel, itemReferencePrice, itemStartPrice, publicSpecs, rngFor, roleCounts, runAuction, shortRestMoraleRecovery, shuffled, simulateCombat, type AuctionRecord, type CombatMeter, type CombatResult, type TeamMember } from './engine'
import { markBossDecisionUsed, mergeCombatModifiers, resolveBossDecision, selectBossDecision, type BossDecision, type BossDecisionChoiceId, type BossDecisionResolution, type BossDecisionUsage } from './bossDecisionEvents'
import { resolveRunEnding } from './endings'
import type { PlayerStatusSnapshot } from './playerStatus'
import { replacementDecision, type ReplacementPlan } from './replacement'
import { hiddenEndingAfterAuction, hiddenEndingAfterWipe, type DirectHiddenEndingReason } from './runEvents'
import introBackgroundUrl from '../photo/ad03ffb9-75a6-4655-a5e5-0b185e7e7555.png'
import recruitBackgroundUrl from '../photo/cb865539-7d2f-4421-be6e-0cb493b4a06b.png'

const bossBackgroundModules = import.meta.glob('../photo/boss/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const bossHdBackgroundModules = {
  ...import.meta.glob('../photo/boss_hd/*.png', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('../photo/boss_hd/*.jpg', { eager: true, query: '?url', import: 'default' }),
} as Record<string, string>
const bossLootBackgroundModules = import.meta.glob('../photo/bossloot/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const buffIconModules = {
  ...import.meta.glob('../photo/buff/*.png', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('../photo/buff/*.jpg', { eager: true, query: '?url', import: 'default' }),
} as Record<string, string>
const classIconModules = import.meta.glob('../photo/class/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const specIconModules = import.meta.glob('../photo/spec/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const lootIconModules = import.meta.glob('../photo/loot/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

type Phase = 'intro' | 'recruit' | 'replacement' | 'prep' | 'decision' | 'combat' | 'auction' | 'result'
type EndReason = '全通MVP' | '五次失败' | '成员退团散团' | '组不到人' | '臭名昭著' | '科技团覆灭' | DirectHiddenEndingReason | ''

interface BossHistory { bossId: string; attempts: number; killed: boolean; results: CombatResult[] }
interface MoraleEntry { id: string; bossName: string; source: '战斗' | '拍卖' | '事件'; delta: number; before: number; after: number; reason: string }
interface HandledDecision { decision: BossDecision; resolution: BossDecisionResolution }
interface ForcedWipe { actorId: string; headline: string; detail: string }
interface GameState {
  phase: Phase
  seed: string
  recruitRound: number
  team: TeamMember[]
  playerStatuses: Record<string, PlayerStatusSnapshot>
  bossIndex: number
  bossAttempts: number
  morale: number
  pot: number
  histories: BossHistory[]
  auctions: AuctionRecord[]
  moraleLog: MoraleEntry[]
  lastCombat?: CombatResult
  pendingCombat?: CombatResult
  pendingReplacement?: ReplacementPlan
  pendingDecision?: BossDecision
  decisionResolution?: BossDecisionResolution
  handledDecision?: HandledDecision
  decisionUsage: BossDecisionUsage
  nextCombatModifiers?: import('./engine').CombatModifiers
  queuedNextBossModifiers?: import('./engine').CombatModifiers
  nextForcedWipe?: ForcedWipe
  queuedNextForcedWipe?: ForcedWipe
  bossMoraleBonus: number
  pendingTechEnding?: boolean
  endingChat?: string[]
  leaveCount: number
  endReason: EndReason
}

const STORAGE_KEY = 'ulduar-gdkp-full-v14'
const initialMorale = Number(gameConfig.get('initial_morale') ?? 70)
const maxBossAttempts = Number(gameConfig.get('max_boss_attempts') ?? 5)
const freshSeed = () => {
  const randomPart = typeof crypto !== 'undefined' && 'getRandomValues' in crypto ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 0xffffffff)
  return `${Date.now()}-${randomPart}`
}
const initialDecisionUsage = (): BossDecisionUsage => ({ run: [], boss: {} })
const playerStatusesForSeed = (seed: string): Record<string, PlayerStatusSnapshot> => Object.fromEntries(
  playersForSeed(seed).map((player) => [player.player_id, createPlayerStatus(seed, player.player_id)]),
)
const initialState = (seed = freshSeed()): GameState => ({ phase: 'intro', seed, recruitRound: 0, team: [], playerStatuses: playerStatusesForSeed(seed), bossIndex: 0, bossAttempts: 0, morale: initialMorale, pot: 0, histories: [], auctions: [], moraleLog: [], leaveCount: 0, decisionUsage: initialDecisionUsage(), bossMoraleBonus: 0, endReason: '' })
const caiFamilyIds = new Set(['P108', 'P115', 'P117'])
const xiYueIds = new Set(['P123', 'P124'])

function hasThreeCleanKills(histories: BossHistory[], bossIndex: number): boolean {
  if (bossIndex < 2) return false
  return bosses.slice(bossIndex - 2, bossIndex + 1).every((boss) => {
    const history = histories.find((entry) => entry.bossId === boss.boss_id)
    return Boolean(history?.killed && history.results.length === 1 && history.results[0].killed)
  })
}

const classColors: Record<string, string> = { 死亡骑士: '#c84c5b', 德鲁伊: '#ff8d24', 猎人: '#91c66c', 法师: '#74d0ef', 圣骑士: '#f39ac0', 牧师: '#f1f1e8', 盗贼: '#f1db55', 萨满: '#4b7cff', 术士: '#9382d9', 战士: '#c69a68' }
const wowClassChatColors: Record<string, string> = {
  死亡骑士: '#c41e3a',
  德鲁伊: '#ff7c0a',
  猎人: '#aad372',
  法师: '#3fc7eb',
  圣骑士: '#f48cba',
  牧师: '#ffffff',
  盗贼: '#fff468',
  萨满: '#0070dd',
  术士: '#8788ee',
  战士: '#c69b6d',
}
const classIconFiles: Record<string, string> = {
  死亡骑士: 'death-knight.jpg',
  德鲁伊: 'druid.jpg',
  猎人: 'hunter.jpg',
  法师: 'mage.jpg',
  圣骑士: 'paladin.jpg',
  牧师: 'priest.jpg',
  盗贼: 'rogue.jpg',
  萨满: 'shaman.jpg',
  术士: 'warlock.jpg',
  战士: 'warrior.jpg',
}
const specIconFiles: Record<string, string> = {
  血DK: 'blood-dk.jpg',
  冰DK: 'frost-dk.jpg',
  邪DK: 'unholy-dk.jpg',
  熊德: 'guardian-druid.jpg',
  猫德: 'feral-druid.jpg',
  鸟德: 'balance-druid.jpg',
  奶德: 'restoration-druid.jpg',
  兽王猎: 'beast-mastery-hunter.jpg',
  射击猎: 'marksmanship-hunter.jpg',
  生存猎: 'survival-hunter.jpg',
  奥法: 'arcane-mage.jpg',
  火法: 'fire-mage.jpg',
  冰法: 'frost-mage.jpg',
  奶骑: 'holy-paladin.jpg',
  防骑: 'protection-paladin.jpg',
  惩戒: 'retribution-paladin.jpg',
  戒律牧: 'discipline-priest.jpg',
  神牧: 'holy-priest.jpg',
  暗牧: 'shadow-priest.jpg',
  刺杀贼: 'assassination-rogue.jpg',
  战斗贼: 'combat-rogue.jpg',
  元素: 'elemental-shaman.jpg',
  增强: 'enhancement-shaman.jpg',
  奶萨: 'restoration-shaman.jpg',
  痛苦术: 'affliction-warlock.jpg',
  恶魔术: 'demonology-warlock.jpg',
  毁灭术: 'destruction-warlock.jpg',
  武器战: 'arms-warrior.jpg',
  狂暴战: 'fury-warrior.jpg',
  防战: 'protection-warrior.jpg',
}
const gold = (value: number) => `${Math.floor(value)}G`
const number = (value: number) => Math.round(value).toLocaleString()

export function believableProgress(player: PublicPlayer, adjustedItemLevel = Number(player.signup_item_level)) {
  const itemLevel = adjustedItemLevel
  if (itemLevel >= 230) return '10人全通 · 多数毕业'
  if (itemLevel >= 227 && ['无链接', '小号无成就', '4H', '10人9/14'].includes(player.progress_display)) return '10人全通'
  if (itemLevel >= 224 && ['无链接', '小号无成就', '4H'].includes(player.progress_display)) return '10人12/14'
  return player.progress_display.replace('大号全通', '10人全通').replace('全通经验（自述）', '10人全通（自述）')
}

export function believableEconomy(player: PublicPlayer, adjustedItemLevel = Number(player.signup_item_level)) {
  const itemLevel = adjustedItemLevel
  if (Number(player.player_id.slice(1)) >= 81) return player.public_economy_claim
  if (itemLevel >= 230) return '纯打工，不消费'
  if (itemLevel >= 228) return /打工|熟练工/.test(player.public_economy_claim) ? '打工' : '只看极品'
  if (itemLevel < 220 && player.public_economy_claim.includes('打工')) return '无明确消费'
  if (itemLevel < 215 && player.public_economy_claim.includes('消费')) return '看便宜装备'
  return player.public_economy_claim
}

export function publicWhisper(player: PublicPlayer, seed: string, round: number) {
  const rng = rngFor(seed, round, player.player_id, 'public-whisper')
  const itemLevel = dynamicItemLevel(player.player_id, seed)
  const offspec = player.claimed_offspec.split(/[、|]/).filter(Boolean)
  const pureDps = ['法师', '术士', '盗贼', '猎人'].includes(player.class)
  const customPlayer = Number(player.player_id.slice(1)) >= 81
  if (customPlayer) {
    const customOptions = player.whisper_pool.split('|').filter(Boolean).map((line) => {
      let normalized = line.replace(/大号全通|成就在大号/g, '全通经验').trim()
      if (pureDps) normalized = normalized.replaceAll(player.signup_spec, '').replace(/\s+/g, ' ').trim()
      else normalized = normalized.replace(/\s+(?:1|111)$/, '').trim()
      return normalized
    }).filter(Boolean)
    return customOptions[Math.floor(rng() * customOptions.length)] ?? player.signup_spec
  }
  const progress = believableProgress(player, itemLevel)
  const economy = believableEconomy(player, itemLevel)
  const styles = new Set(['极简', '低调'])
  if (progress.includes('全通') || progress.includes('12/14')) styles.add('经验')
  if (progress.includes('小号') || progress.includes('无成就')) styles.add('小号')
  if (offspec.length && !pureDps) styles.add('多修')
  if (/老板|消费|必拿|提升/.test(economy)) styles.add('消费')
  if (/打工|毕业/.test(economy)) styles.add('打工')
  if (/捡漏|便宜|排骨/.test(economy)) styles.add('排骨')
  const templateOptions = chatTemplates.filter((entry) => entry.scene === '报名' && styles.has(entry.style_or_trait)).map((entry) => entry.template
    .replaceAll('{spec}', pureDps ? '' : player.signup_spec)
    .replaceAll('{offspec}', offspec[0] ?? '')
    .replace(/\s+/g, ' ')
    .trim())
    .filter((line) => line && !line.includes('{}') && !/大号|成就在大号/.test(line))
  if (templateOptions.length && rng() < .72) return templateOptions[Math.floor(rng() * templateOptions.length)]
  if (itemLevel >= 230) {
    const options = pureDps ? ['全通熟练工', '基本毕业，不消费', '来打工'] : [`${player.signup_spec} 全通熟练`, `${player.signup_spec} 基本毕业`, `${player.signup_spec} 来打工`]
    return options[Math.floor(rng() * options.length)]
  }
  if (offspec.length && !pureDps) {
    const progress = believableProgress(player, itemLevel)
    const progressLine = progress.includes('全通') ? `${player.signup_spec} 全通经验` : `${player.signup_spec} 会打机制`
    const economy = believableEconomy(player, itemLevel)
    const economyLine = /消费|拿|缺/.test(economy) ? `${player.signup_spec} 有消费` : `${player.signup_spec} 半打半消`
    const options = [`${player.signup_spec} 可切${offspec[0]}`, progressLine, economyLine]
    return options[Math.floor(rng() * options.length)]
  }
  const options = player.whisper_pool.split('|').filter(Boolean).map((line) => {
    let normalized = line.replace(/大号全通|成就在大号/g, '全通经验').trim()
    if (pureDps) normalized = normalized.replaceAll(player.signup_spec, '').replace(/\s+/g, ' ').trim()
    if (!pureDps) normalized = normalized.replace(/\s+(?:1|111)$/, '').trim()
    return normalized
  }).filter(Boolean)
  return options[Math.floor(rng() * options.length)] ?? (pureDps ? '1' : `${player.signup_spec} 熟练`)
}

export function buildBossDecisionDeparture(lastCombat: CombatResult, resolution: BossDecisionResolution): CombatResult {
  const leaverId = resolution.leaverId!
  const leaverName = publicById.get(leaverId)?.name ?? '一名成员'
  const roasterName = publicById.get(resolution.responsibleId ?? '')?.name ?? '压力怪'
  return {
    ...lastCombat,
    responsible: resolution.responsibleId ?? '',
    leaver: leaverId,
    leaveType: '开喷退团',
    leaveReason: `${roasterName}当众施压后，${leaverName}心态崩溃并直接离开团队。`,
    chat: [...(lastCombat.chat ?? []), `${roasterName}：你这装等就打成这样？`, `${leaverName}：行，我不打了。`, `系统：${leaverName} 离开了团队。`],
  }
}

function classStyle(className: string) {
  return { '--class-color': classColors[className] ?? '#9a9a92' } as React.CSSProperties
}

function moraleTone(value: number) {
  return value >= 80 ? 'high' : value >= 60 ? 'steady' : value >= 40 ? 'strained' : 'critical'
}

function MoraleValue({ value, prefix = '' }: { value: number; prefix?: string }) {
  return <b className={`morale-value morale-${moraleTone(value)}`}>{prefix}{value}</b>
}

function ClassIcon({ wowClass }: { wowClass: string }) {
  const file = classIconFiles[wowClass]
  const src = file ? classIconModules[`../photo/class/${file}`] : undefined
  return src
    ? <img className="class-icon" src={src} alt="" title={wowClass} style={classStyle(wowClass)} aria-hidden="true"/>
    : <span className="class-icon-fallback" style={classStyle(wowClass)} aria-hidden="true"/>
}

function SpecIcon({ spec }: { spec: string }) {
  const file = specIconFiles[spec]
  const src = file ? specIconModules[`../photo/spec/${file}`] : undefined
  return src
    ? <img className="spec-icon" src={src} alt="" title={spec} aria-hidden="true"/>
    : <span className="spec-icon-fallback" aria-hidden="true">{spec.slice(0, 1)}</span>
}

const playerByName = new Map([...publicById.values()].map((player) => [player.name, player]))
const escapedPlayerNames = [...playerByName.keys()]
  .sort((left, right) => right.length - left.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
const playerNamePattern = escapedPlayerNames.length ? new RegExp(`(${escapedPlayerNames.join('|')})`, 'g') : undefined

function ChatText({ text }: { text: string }) {
  if (!playerNamePattern) return <>{text}</>
  return <>{text.split(playerNamePattern).map((part, index) => {
    const player = playerByName.get(part)
    return player
      ? <strong className="chat-inline-name" style={{ color: wowClassChatColors[player.class] }} key={`${part}-${index}`}>{part}</strong>
      : <span key={`${part}-${index}`}>{part}</span>
  })}</>
}

function ChatLine({ line }: { line: string }) {
  const match = line.match(/^([^：:]{1,20})([：:])\s?(.*)$/)
  if (!match) return <span className="chat-message"><ChatText text={line}/></span>
  const [, speaker, separator, message] = match
  const player = playerByName.get(speaker)
  const speakerKind = player
    ? 'player'
    : speaker === '团长'
      ? 'leader'
      : speaker === '系统'
        ? 'system'
        : /成交/.test(speaker)
          ? 'sale'
          : /流拍|警告|离队/.test(speaker)
            ? 'warning'
            : 'neutral'
  return <>
    <strong
      className={`chat-speaker chat-speaker-${speakerKind}`}
      style={player ? { color: wowClassChatColors[player.class] } : undefined}
    >{speaker}</strong>
    <span className="chat-separator">{separator}</span>
    <span className="chat-message"><ChatText text={message}/></span>
  </>
}

function compactEndingChat(lines: string[]) {
  const seenPlayers = new Set<string>()
  return [...lines].reverse().filter((line) => {
    const speaker = line.match(/^([^：:]{1,20})[：:]/)?.[1]
    if (!speaker || !playerByName.has(speaker)) return true
    if (seenPlayers.has(speaker)) return false
    seenPlayers.add(speaker)
    return true
  }).reverse()
}

function LootIcon({ item, compact = false }: { item: LootItem; compact?: boolean }) {
  const src = item.icon_file ? lootIconModules[`../photo/loot/${item.icon_file}`] : undefined
  return src ? <img className={compact ? 'loot-item-icon compact' : 'loot-item-icon'} src={src} alt="" title={item.item_name} aria-hidden="true"/> : null
}

function SpecSelector({ playerName, options, value, onChange }: { playerName: string; options: { spec: string }[]; value: string; onChange: (spec: string) => void }) {
  return <div className="spec-selector" role="group" aria-label={`${playerName}的出战专精`}>
    {options.map((option) => {
      const selected = option.spec === value
      return <button type="button" key={option.spec} className={`spec-option${selected ? ' selected' : ''}`} onClick={() => onChange(option.spec)} aria-label={option.spec} aria-pressed={selected} title={option.spec}>
        <SpecIcon spec={option.spec}/>
        <span>{option.spec}</span>
      </button>
    })}
  </div>
}

function sceneStyle(imageUrl: string) {
  return { '--scene-image': `url("${imageUrl}")` } as React.CSSProperties
}

function combatCopy(category: CombatLogTemplate['category'], rng: () => number, variables: Record<string, string | number>) {
  const options = combatLogTemplates.filter((entry) => entry.category === category)
  const template = options[Math.floor(rng() * options.length)]?.template ?? ''
  return Object.entries(variables).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template)
}

function bossSceneStyle(boss: Boss) {
  return sceneStyle(
    bossHdBackgroundModules[`../photo/boss_hd/${boss.boss_id}.png`]
      ?? bossHdBackgroundModules[`../photo/boss_hd/${boss.boss_id}.jpg`]
      ?? bossBackgroundModules[`../photo/boss/${boss.boss_id}.jpg`],
  )
}

function bossLootSceneStyle(boss: Boss) {
  return sceneStyle(
    bossLootBackgroundModules[`../photo/bossloot/${boss.boss_id}_loot.png`]
      ?? bossBackgroundModules[`../photo/boss/${boss.boss_id}.jpg`],
  )
}

export function payoutEligible(team: TeamMember[]) {
  return team.filter((member) => !member.left)
}

function activeTeam(team: TeamMember[]) {
  return team.filter((member) => !member.left)
}

function mergeActiveTeam(team: TeamMember[], updatedActive: TeamMember[]) {
  const updatedById = new Map(updatedActive.map((member) => [member.id, member]))
  return team.map((member) => member.left ? member : updatedById.get(member.id) ?? member)
}

function publicIntro(player: PublicPlayer, itemLevel = Number(player.signup_item_level)) {
  return `${player.name}｜${player.class}｜主修 ${player.signup_spec}（${player.signup_role}）｜装等 ${itemLevel}｜公开副修 ${player.claimed_offspec || '无'}｜${believableProgress(player, itemLevel)}｜${believableEconomy(player, itemLevel)}`
}

function replacementRecruiterLine(seed: string, plan: ReplacementPlan) {
  const options = chatTemplates.filter((entry) => entry.scene === '补人' && entry.style_or_trait === '引荐')
  const rng = rngFor(seed, plan.departureNumber, plan.recruiterName, 'replacement-chat')
  return options[Math.floor(rng() * options.length)]?.template ?? '先别散，我认识个能接进度的。'
}

function RoleMark({ role }: { role: string }) {
  const kind = role === '坦克' ? 'tank' : role === '治疗' ? 'heal' : 'dps'
  return <span className={`role-mark role-mark-${kind}`} title={role} aria-label={role} />
}

function MoraleHistory({ entries, limit = 6, compact = false }: { entries: MoraleEntry[]; limit?: number; compact?: boolean }) {
  if (!entries.length) return null
  const visible = entries.slice(-limit).reverse()
  return <details className={`morale-history ${compact ? 'compact' : 'page'}`} open={compact || undefined}><summary className="morale-history-title"><span>MORALE LOG</span><b>士气变动记录</b><i>⌄</i></summary><div className="morale-history-list">{visible.map((entry) => <div key={entry.id}><span>{entry.bossName}<small>{entry.source}</small></span><p>{entry.reason}</p><em className={entry.delta > 0 ? 'up' : entry.delta < 0 ? 'down' : ''}>{entry.delta > 0 ? '+' : ''}{entry.delta}</em><strong>{entry.before} → {entry.after}</strong></div>)}</div></details>
}

function App() {
  const [game, setGame] = useState<GameState>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '') as Partial<GameState>
      const base = initialState(stored.seed)
      const playerStatuses = { ...base.playerStatuses, ...(stored.playerStatuses ?? {}) }
      return {
        ...base,
        ...stored,
        playerStatuses,
        team: (stored.team ?? []).map((member) => ({ ...member, status: member.status ?? playerStatuses[member.id] ?? createPlayerStatus(base.seed, member.id) })),
        leaveCount: stored.leaveCount ?? 0,
        decisionUsage: stored.decisionUsage ?? initialDecisionUsage(),
        morale: Math.max(0, Math.min(100, Number(stored.morale ?? base.morale) + Number(stored.bossMoraleBonus ?? 0))),
        bossMoraleBonus: 0,
      } as GameState
    } catch { return initialState() }
  })
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(game)) }, [game])
  const playerPool = useMemo(() => playersForSeed(game.seed), [game.seed])
  const candidates = useMemo(() => {
    const selected = new Set(game.team.map((member) => member.id))
    const caiFamilyChosen = game.team.some((member) => caiFamilyIds.has(member.id))
    const xiYueChosen = game.team.some((member) => xiYueIds.has(member.id))
    const available = playerPool.filter((player) => !selected.has(player.player_id)
      && !(caiFamilyChosen && caiFamilyIds.has(player.player_id))
      && !(xiYueChosen && xiYueIds.has(player.player_id)))
    const roundSeed = `${game.seed}|round:${game.recruitRound}|team:${game.team.map((member) => member.id).join(',')}`
    return shuffled(available, roundSeed).slice(0, 5)
  }, [game.seed, game.recruitRound, game.team, playerPool])
  const boss = bosses[game.bossIndex]
  const effectiveMorale = game.morale

  const start = () => setGame({ ...initialState(), phase: 'recruit' })
  const restart = () => {
    if (game.phase !== 'intro' && !window.confirm('现在重开会清空本局阵容、进度和金池，确定重新选人吗？')) return
    setGame({ ...initialState(), phase: 'recruit' })
  }
  const recruit = (player: PublicPlayer) => setGame((prev) => {
    const team = [...prev.team, createMember(player.player_id, prev.seed, prev.playerStatuses[player.player_id])]
    const nextRound = prev.recruitRound + 1
    return { ...prev, team, recruitRound: nextRound, phase: nextRound === 10 ? 'prep' : 'recruit' }
  })
  const setSpec = (id: string, spec: string) => setGame((prev) => ({ ...prev, team: prev.team.map((m) => m.id === id ? { ...m, currentSpec: spec } : m) }))
  const attemptBoss = () => setGame((prev) => {
    const currentBoss = bosses[prev.bossIndex]
    const attempt = prev.bossAttempts + 1
    const combatMorale = prev.morale
    const simulated = simulateCombat(prev.seed, currentBoss, attempt, activeTeam(prev.team), combatMorale, prev.pot, prev.nextCombatModifiers)
    if (prev.nextForcedWipe) {
      const forced = prev.nextForcedWipe
      const actorName = publicById.get(forced.actorId)?.name ?? '宏提供者'
      const meters = simulated.meters.map((meter) => ({
        ...meter,
        dps: 0,
        hps: 0,
        damage: 0,
        healing: 0,
      }))
      const result: CombatResult = {
        ...simulated,
        killed: false,
        remainingHp: 100,
        duration: 0,
        events: [{ name: '全团宏崩溃', status: '失败', detail: forced.detail, responsible: actorName, timeRatio: 0 }],
        reason: forced.headline,
        responsible: forced.actorId,
        failureCause: '机制失误',
        chat: [`${actorName}：不对，我自己刚才测试的时候还能用。`, '团长：先把这宏全删了，跑尸回来用原来的按键。'],
        moraleDelta: -10,
        moraleReason: '全团复制同一套错误宏，开怪瞬间无法行动并直接灭团',
        teamDps: meters.reduce((sum, meter) => sum + meter.dps, 0),
        teamHps: meters.reduce((sum, meter) => sum + meter.hps, 0),
        meters,
        deaths: [],
        casualties: 0,
        battleReses: 0,
      }
      return { ...prev, handledDecision: undefined, nextForcedWipe: undefined, pendingCombat: result, phase: 'combat' }
    }
    return { ...prev, handledDecision: undefined, pendingCombat: simulated, phase: 'combat' }
  })
  const resolveCombat = () => setGame((prev) => {
    const result = prev.pendingCombat
    if (!result) return prev
    const currentBoss = bosses[prev.bossIndex]
    const attempt = result.attempt
    const richardBuffLost = !result.killed || result.deaths.some((death) => death.playerId === 'P128')
    let team: TeamMember[] = prev.team.map((m) => ({
      ...m,
      blame: m.blame + (m.id === result.responsible ? 1 : 0),
      richardBuffActive: m.id === 'P128' && richardBuffLost ? false : m.richardBuffActive,
    }))
    const oldHistory = prev.histories.find((h) => h.bossId === currentBoss.boss_id)
    const history: BossHistory = { bossId: currentBoss.boss_id, attempts: attempt, killed: result.killed, results: [...(oldHistory?.results ?? []), result] }
    const histories = [...prev.histories.filter((h) => h.bossId !== currentBoss.boss_id), history]
    let morale = Math.max(0, Math.min(100, prev.morale + result.moraleDelta))
    const combatMorale: MoraleEntry = { id: `${currentBoss.boss_id}-${attempt}-combat`, bossName: currentBoss.boss_name, source: '战斗', delta: result.moraleDelta, before: prev.morale, after: morale, reason: result.moraleReason }
    let moraleLog = [...(prev.moraleLog ?? []), combatMorale]
    let wipeDecision: BossDecision | undefined
    if (!result.killed && !result.leaver && attempt < maxBossAttempts) {
      wipeDecision = selectBossDecision({
        seed: prev.seed,
        boss: currentBoss,
        attempt: attempt + 1,
        team: activeTeam(team),
        morale,
        lastCombat: result,
        usage: prev.decisionUsage,
      })
      const restLogId = `${currentBoss.boss_id}-short-rest`
      const restDelta = wipeDecision ? 0 : shortRestMoraleRecovery(prev.seed, currentBoss.boss_id, attempt, morale, moraleLog.some((entry) => entry.id === restLogId))
      if (restDelta) {
        const beforeRest = morale
        morale = Math.min(100, morale + restDelta)
        moraleLog = [...moraleLog, { id: restLogId, bossName: currentBoss.boss_name, source: '事件', delta: restDelta, before: beforeRest, after: morale, reason: '团长让全团短暂休整，重新整理状态后再开怪' }]
      }
    }
    if (result.leaver && result.leaveType === '分崩离析') {
      team = team.map((member) => member.id === result.leaver ? { ...member, left: true } : member)
      const leaveCount = (prev.leaveCount ?? 0) + 1
      return { ...prev, team, histories, bossAttempts: attempt, morale, moraleLog, leaveCount, lastCombat: result, pendingCombat: undefined, pendingReplacement: undefined, phase: 'result', endReason: '成员退团散团' }
    }
    if (!result.killed) {
      const cumulativeWipes = histories.reduce((sum, item) => sum + item.results.filter((fight) => !fight.killed).length, 0)
      const directEnding = hiddenEndingAfterWipe(prev.seed, morale, prev.pot, histories.filter((item) => item.killed).length, cumulativeWipes)
      if (directEnding) {
        const hiddenResult = { ...result, leaver: undefined, leaveType: undefined, leaveReason: undefined }
        return { ...prev, team, histories, bossAttempts: attempt, morale, moraleLog, lastCombat: hiddenResult, pendingCombat: undefined, pendingReplacement: undefined, endingChat: directEnding.chat, phase: 'result', endReason: directEnding.reason }
      }
    }
    if (!result.killed && attempt >= maxBossAttempts) return { ...prev, team, histories, bossAttempts: attempt, morale, moraleLog, lastCombat: { ...result, leaver: undefined, leaveType: undefined, leaveReason: undefined }, pendingCombat: undefined, phase: 'result', endReason: '五次失败' }
    if (result.leaver) {
      team = team.map((member) => member.id === result.leaver ? { ...member, left: true } : member)
      const leaveCount = (prev.leaveCount ?? 0) + 1
      const decision = replacementDecision(prev.seed, currentBoss.boss_id, attempt, leaveCount, result.leaver, team, result.killed ? 'auction' : 'prep')
      if (!decision.plan) {
        const failedResult = { ...result, leaveReason: `${result.leaveReason ?? `${publicById.get(result.leaver)?.name ?? '一名成员'}离开团队。`} ${decision.failureText}` }
        return { ...prev, team, histories, bossAttempts: attempt, morale, moraleLog, leaveCount, lastCombat: failedResult, pendingCombat: undefined, pendingReplacement: undefined, phase: 'result', endReason: decision.endReason ?? '组不到人' }
      }
      return { ...prev, team, histories, bossAttempts: attempt, morale, moraleLog, leaveCount, lastCombat: result, pendingCombat: undefined, pendingReplacement: decision.plan, phase: 'replacement', endReason: '' }
    }
    if (!result.killed) {
      return {
        ...prev,
        team,
        histories,
        bossAttempts: attempt,
        morale,
        moraleLog,
        lastCombat: result,
        pendingCombat: undefined,
        pendingDecision: wipeDecision,
        decisionResolution: undefined,
        phase: wipeDecision ? 'decision' : 'prep',
      }
    }
    if (!prev.pendingTechEnding) {
      const decision = selectBossDecision({
        seed: prev.seed,
        boss: currentBoss,
        attempt,
        team: activeTeam(team),
        morale,
        lastCombat: result,
        usage: prev.decisionUsage,
        zeroWipeKillStreak: hasThreeCleanKills(histories, prev.bossIndex),
      })
      if (decision) {
        return {
          ...prev,
          team,
          histories,
          bossAttempts: attempt,
          morale,
          moraleLog,
          lastCombat: result,
          pendingCombat: undefined,
          pendingDecision: decision,
          decisionResolution: undefined,
          phase: 'decision',
        }
      }
    }
    const auction = runAuction(prev.seed, currentBoss, activeTeam(team))
    team = mergeActiveTeam(team, auction.team)
    const auctionMorale = Math.max(0, Math.min(100, morale + auction.moraleDelta))
    const auctionEntry: MoraleEntry = { id: `${currentBoss.boss_id}-${attempt}-auction`, bossName: currentBoss.boss_name, source: '拍卖', delta: auction.moraleDelta, before: morale, after: auctionMorale, reason: auction.moraleReasons.join('；') || '掉落和成交都比较普通' }
    if (prev.pendingTechEnding) {
      return {
        ...prev,
        team,
        histories,
        bossAttempts: attempt,
        morale: auctionMorale,
        moraleLog: [...moraleLog, auctionEntry],
        pot: prev.pot + auction.potGain,
        auctions: [...prev.auctions, ...auction.records],
        lastCombat: result,
        pendingCombat: undefined,
        pendingTechEnding: false,
        bossMoraleBonus: 0,
        nextCombatModifiers: undefined,
        endingChat: [
          '系统：检测到异常战斗行为，正在核查本次首领战。',
          '系统：团队成员账号已陆续被冻结。',
          '团长：不是，等一下，这不是说只有安全点吗？',
          '系统：团队频道已关闭。',
        ],
        phase: 'result',
        endReason: '科技团覆灭',
      }
    }
    return { ...prev, team, histories, bossAttempts: attempt, morale: auctionMorale, moraleLog: [...moraleLog, auctionEntry], pot: prev.pot + auction.potGain, auctions: [...prev.auctions, ...auction.records], lastCombat: result, pendingCombat: undefined, bossMoraleBonus: 0, nextCombatModifiers: undefined, phase: 'auction' }
  })
  const chooseBossDecision = (choiceId: BossDecisionChoiceId) => setGame((prev) => {
    const decision = prev.pendingDecision
    if (!decision || prev.decisionResolution) return prev
    const resolution = resolveBossDecision(prev.seed, decision, choiceId, activeTeam(prev.team))
    return {
      ...prev,
      decisionUsage: markBossDecisionUsed(prev.decisionUsage, decision),
      decisionResolution: resolution,
    }
  })
  const continueBossDecision = () => setGame((prev) => {
    const decision = prev.pendingDecision
    const resolution = prev.decisionResolution
    if (!decision || !resolution) return prev
    const currentBoss = bosses[prev.bossIndex]
    if (decision.trigger === 'kill' && resolution.action === 'close' && prev.lastCombat) {
      let team = prev.team
      const eventMorale = Math.max(0, Math.min(100, prev.morale + (resolution.moraleDelta ?? 0)))
      const eventEntry: MoraleEntry | undefined = resolution.moraleDelta
        ? { id: `${currentBoss.boss_id}-${prev.bossAttempts}-event-${decision.id}`, bossName: currentBoss.boss_name, source: '事件', delta: resolution.moraleDelta, before: prev.morale, after: eventMorale, reason: resolution.headline }
        : undefined
      const auction = runAuction(prev.seed, currentBoss, activeTeam(team))
      team = mergeActiveTeam(team, auction.team)
      const auctionMorale = Math.max(0, Math.min(100, eventMorale + auction.moraleDelta))
      const auctionEntry: MoraleEntry = { id: `${currentBoss.boss_id}-${prev.bossAttempts}-auction`, bossName: currentBoss.boss_name, source: '拍卖', delta: auction.moraleDelta, before: eventMorale, after: auctionMorale, reason: auction.moraleReasons.join('；') || '掉落和成交都比较普通' }
      const queuedNextForcedWipe = resolution.forceNextAttemptWipe
        ? { actorId: resolution.responsibleId ?? decision.actorId, headline: '全团技能栏同时卡死，开怪瞬间直接灭团。', detail: resolution.detail }
        : prev.queuedNextForcedWipe
      return {
        ...prev,
        team,
        morale: auctionMorale,
        moraleLog: [...(prev.moraleLog ?? []), ...(eventEntry ? [eventEntry] : []), auctionEntry],
        pot: prev.pot + auction.potGain,
        auctions: [...prev.auctions, ...auction.records],
        queuedNextBossModifiers: mergeCombatModifiers(prev.queuedNextBossModifiers, resolution.modifiers),
        queuedNextForcedWipe,
        pendingDecision: undefined,
        decisionResolution: undefined,
        bossMoraleBonus: 0,
        phase: 'auction',
      }
    }
    if (resolution.action === 'close') {
      const eventMorale = Math.max(0, Math.min(100, prev.morale + (resolution.moraleDelta ?? 0)))
      const eventEntry: MoraleEntry | undefined = resolution.moraleDelta
        ? { id: `${currentBoss.boss_id}-${prev.bossAttempts}-event-${decision.id}`, bossName: currentBoss.boss_name, source: '事件', delta: resolution.moraleDelta, before: prev.morale, after: eventMorale, reason: resolution.headline }
        : undefined
      return {
        ...prev,
        morale: eventMorale,
        moraleLog: [...(prev.moraleLog ?? []), ...(eventEntry ? [eventEntry] : [])],
        bossMoraleBonus: 0,
        nextCombatModifiers: mergeCombatModifiers(prev.nextCombatModifiers, resolution.modifiers),
        lastCombat: prev.lastCombat ? { ...prev.lastCombat, chat: [] } : prev.lastCombat,
        handledDecision: { decision, resolution },
        pendingDecision: undefined,
        decisionResolution: undefined,
        phase: 'prep',
      }
    }
    if (resolution.action === 'leave' && resolution.leaverId) {
      const leaverId = resolution.leaverId
      const departure = buildBossDecisionDeparture(prev.lastCombat!, resolution)
      const team = prev.team.map((member) => member.id === leaverId ? { ...member, left: true } : member)
      const leaveCount = prev.leaveCount + 1
      const replacement = replacementDecision(prev.seed, currentBoss.boss_id, prev.bossAttempts, leaveCount, leaverId, team, 'prep')
      if (!replacement.plan) {
        return {
          ...prev,
          team,
          leaveCount,
          lastCombat: { ...departure, leaveReason: `${departure.leaveReason} ${replacement.failureText ?? ''}`.trim() },
          pendingDecision: undefined,
          decisionResolution: undefined,
          phase: 'result',
          endReason: replacement.endReason ?? '组不到人',
        }
      }
      return { ...prev, team, leaveCount, lastCombat: departure, pendingReplacement: replacement.plan, pendingDecision: undefined, decisionResolution: undefined, phase: 'replacement' }
    }
    const attempt = prev.bossAttempts + 1
    const combatMorale = prev.morale
    const simulated = simulateCombat(prev.seed, currentBoss, attempt, activeTeam(prev.team), combatMorale, prev.pot, prev.nextCombatModifiers)
    if (resolution.action === 'fight') {
      return { ...prev, pendingDecision: undefined, decisionResolution: undefined, pendingCombat: simulated, phase: 'combat' }
    }
    const killed = resolution.action === 'kill' || resolution.action === 'tech-ending'
    const forcedResult: CombatResult = {
      ...simulated,
      killed,
      remainingHp: killed ? 0 : Math.max(88, simulated.remainingHp),
      events: [{
        name: decision.id === 'bug' ? 'BUG 打法' : '老司机改打法',
        status: killed ? '成功' : '失败',
        detail: resolution.detail,
        responsible: killed ? undefined : publicById.get(resolution.responsibleId ?? '')?.name,
        timeRatio: killed ? .7 : .12,
      }],
      reason: resolution.headline,
      responsible: killed ? '' : resolution.responsibleId ?? decision.actorId,
      chat: killed
        ? [`${publicById.get(decision.actorId)?.name ?? '队员'}：卧槽，真卡住了！`, '团长：别说了，先把 Boss 打完。']
        : [`${publicById.get(decision.actorId)?.name ?? '队员'}：不对啊，视频里不是这样的。`, '团长：先跑尸，回来再说。'],
      leaver: killed ? undefined : simulated.leaver,
      leaveType: killed ? undefined : simulated.leaveType,
      leaveReason: killed ? undefined : simulated.leaveReason,
      failureCause: killed ? undefined : '机制失误',
      moraleDelta: killed ? 2 : resolution.moraleDelta ?? -8,
      moraleReason: killed ? '冒险打法奏效，全团压着声音庆祝' : resolution.headline,
      duration: killed ? Math.max(90, simulated.duration) : Math.min(45, simulated.duration),
      deaths: [],
      casualties: 0,
      battleReses: 0,
    }
    return {
      ...prev,
      pendingDecision: undefined,
      decisionResolution: undefined,
      pendingTechEnding: resolution.action === 'tech-ending',
      pendingCombat: forcedResult,
      phase: 'combat',
    }
  })
  const recruitReplacement = (player: PublicPlayer) => setGame((prev) => {
    const plan = prev.pendingReplacement
    if (!plan) return prev
    const replacement = createMember(player.player_id, prev.seed, prev.playerStatuses[player.player_id])
    let team = [...prev.team, replacement]
    if (plan.resume === 'prep') {
      const leaderLines = [
        `团长：${player.name}进组了，人齐了开搞。`,
        `团长：欢迎${player.name}，上一把已经翻篇，这把按分工好好打。`,
        `团长：人齐了，${player.name}先熟悉下站位，其他人把状态回满。`,
      ]
      const rng = rngFor(prev.seed, plan.departureNumber, player.player_id, 'replacement-joined')
      const joinChat = [
        `系统：${player.name} 加入了团队。`,
        leaderLines[Math.floor(rng() * leaderLines.length)],
      ]
      const lastCombat = prev.lastCombat
        ? { ...prev.lastCombat, chat: joinChat, leaver: undefined, leaveType: undefined, leaveReason: undefined }
        : prev.lastCombat
      return { ...prev, team, lastCombat, pendingReplacement: undefined, phase: 'prep' }
    }
    const currentBoss = bosses[prev.bossIndex]
    const auction = runAuction(prev.seed, currentBoss, activeTeam(team))
    team = mergeActiveTeam(team, auction.team)
    const auctionMorale = Math.max(0, Math.min(100, prev.morale + auction.moraleDelta))
    const auctionEntry: MoraleEntry = { id: `${currentBoss.boss_id}-${prev.bossAttempts}-auction`, bossName: currentBoss.boss_name, source: '拍卖', delta: auction.moraleDelta, before: prev.morale, after: auctionMorale, reason: auction.moraleReasons.join('；') || '掉落和成交都比较普通' }
    return { ...prev, team, pendingReplacement: undefined, phase: 'auction', morale: auctionMorale, moraleLog: [...(prev.moraleLog ?? []), auctionEntry], pot: prev.pot + auction.potGain, auctions: [...prev.auctions, ...auction.records], bossMoraleBonus: 0, nextCombatModifiers: undefined }
  })
  const nextBoss = () => setGame((prev) => {
    const blackGold = hiddenEndingAfterAuction(prev.seed, prev.pot, prev.histories.filter((history) => history.killed).length, bosses.length)
    if (blackGold) return { ...prev, phase: 'result', endingChat: blackGold.chat, endReason: blackGold.reason }
    if (prev.bossIndex >= bosses.length - 1) return { ...prev, phase: 'result', endReason: '全通MVP' }
    return {
      ...prev,
      bossIndex: prev.bossIndex + 1,
      bossAttempts: 0,
      lastCombat: undefined,
      handledDecision: undefined,
      nextCombatModifiers: prev.queuedNextBossModifiers,
      queuedNextBossModifiers: undefined,
      nextForcedWipe: prev.queuedNextForcedWipe,
      queuedNextForcedWipe: undefined,
      bossMoraleBonus: 0,
      pendingDecision: undefined,
      decisionResolution: undefined,
      phase: 'prep',
    }
  })

  return (
    <div className="app-shell">
      {game.phase !== 'intro' && <Header game={game} onRestart={restart} />}
      <main>
        {game.phase === 'intro' && <Intro onStart={start} />}
        {game.phase === 'recruit' && <Recruitment round={game.recruitRound} candidates={candidates} team={game.team} playerStatuses={game.playerStatuses} seed={game.seed} onRecruit={recruit} />}
        {game.phase === 'replacement' && game.pendingReplacement && <ReplacementRecruitment plan={game.pendingReplacement} team={activeTeam(game.team)} playerStatuses={game.playerStatuses} seed={game.seed} departure={game.lastCombat} onRecruit={recruitReplacement} />}
        {game.phase === 'prep' && <Preparation boss={boss} team={activeTeam(game.team)} morale={effectiveMorale} moraleLog={game.moraleLog ?? []} attempt={game.bossAttempts + 1} lastCombat={game.lastCombat} handledDecision={game.handledDecision} onSetSpec={setSpec} onAttempt={attemptBoss} />}
        {game.phase === 'decision' && game.pendingDecision && <BossDecisionPage boss={boss} decision={game.pendingDecision} resolution={game.decisionResolution} onChoose={chooseBossDecision} onContinue={continueBossDecision} />}
        {game.phase === 'combat' && game.pendingCombat && <CombatPlayback boss={boss} result={game.pendingCombat} onComplete={resolveCombat} />}
        {game.phase === 'auction' && <Auction boss={boss} records={game.auctions.filter((a) => a.bossId === boss.boss_id)} result={game.lastCombat!} pot={game.pot} morale={game.morale} onNext={nextBoss} isLast={game.bossIndex === bosses.length - 1} />}
        {game.phase === 'auction' && <MoraleHistory entries={game.moraleLog ?? []} limit={6} />}
        {game.phase === 'result' && <Results game={game} onNew={start} />}
        {game.phase === 'result' && <MoraleHistory entries={game.moraleLog ?? []} limit={8} />}
      </main>
    </div>
  )
}

function Header({ game, onRestart }: { game: GameState; onRestart: () => void }) {
  const stage = game.phase === 'intro' ? '开团公告' : game.phase === 'recruit' ? `招募 ${game.recruitRound + 1}/10` : game.phase === 'replacement' ? `补位 ${game.leaveCount}/4` : game.phase === 'prep' ? '战前准备' : game.phase === 'decision' ? '临场决策' : game.phase === 'combat' ? '战斗记录' : game.phase === 'auction' ? '掉落拍卖' : '最终结算'
  const morale = game.morale
  return <header className="topbar"><div className="brand"><span className="brand-mark">U</span><div><b>奥杜尔十人金团</b><small>MVP SIMULATOR</small></div></div><div className="stage-pill"><span>{stage}</span><i>随机局</i></div><div className="header-actions">{game.phase !== 'intro' && <div className="header-stats"><span>士气 <MoraleValue value={morale}/></span><span>金池 <b>{gold(game.pot)}</b></span></div>}<button className="restart-run" onClick={onRestart}>{game.phase === 'intro' ? '直接开团' : '重开一把'} <span>↻</span></button></div></header>
}

function Intro({ onStart }: { onStart: () => void }) {
  return <section className="intro-image" style={{ backgroundImage: `url("${introBackgroundUrl}")` }}><button className="intro-restart-hotspot" aria-label="重新开团" onClick={onStart}/><button className="intro-start-hotspot" aria-label="开始招募" onClick={onStart}/></section>
}

function Recruitment({ round, candidates, team, playerStatuses, seed, onRecruit }: { round: number; candidates: PublicPlayer[]; team: TeamMember[]; playerStatuses: Record<string, PlayerStatusSnapshot>; seed: string; onRecruit: (p: PublicPlayer) => void }) {
  return <section className="page recruit-page scene-page recruit-scene" style={sceneStyle(recruitBackgroundUrl)}><div className="page-heading"><div><div className="eyebrow">RECRUITMENT · ROUND {round + 1}</div><h2>选择一位勇士进团</h2><p>注意阵容的职责与职业搭配，合理的坦克、治疗和输出组合才能走得更远。</p></div><div className="round-dots" aria-label={`第${round + 1}轮`}>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < round ? 'done' : i === round ? 'active' : ''}>{i + 1}</i>)}</div></div><div className="recruit-layout"><div className="candidate-grid">{candidates.map((p) => <CandidateCard key={p.player_id} player={p} status={playerStatuses[p.player_id]} seed={seed} round={round} onChoose={() => onRecruit(p)} />)}</div><aside className="roster-panel"><div className="panel-title"><span>当前团队 · 公开信息</span><b>{team.length}<small>/10</small></b></div>{team.length === 0 ? <div className="empty-roster">名单还是空的。<br/>第一手最见团长功力。</div> : <div className="compact-roster">{team.map((m, i) => { const p = publicById.get(m.id)!; return <div className="compact-member person-hover" data-intro={publicIntro(p, m.itemLevel)} style={classStyle(p.class)} key={m.id}><span className="roster-no">{String(i + 1).padStart(2, '0')}</span><ClassIcon wowClass={p.class}/><span className="compact-identity"><b>{p.name}</b><small><RoleMark role={p.signup_role}/> 主修 {p.signup_spec} · {m.itemLevel}</small></span><span className="compact-public"><small>副修 {p.claimed_offspec || '无'}</small><em>{believableEconomy(p, m.itemLevel)}</em></span></div> })}</div>}<div className="public-note">悬停人物可查看完整公开介绍</div></aside></div></section>
}

function ReplacementRecruitment({ plan, team, playerStatuses, seed, departure, onRecruit }: { plan: ReplacementPlan; team: TeamMember[]; playerStatuses: Record<string, PlayerStatusSnapshot>; seed: string; departure?: CombatResult; onRecruit: (player: PublicPlayer) => void }) {
  const leaverName = publicById.get(plan.leaverId)?.name ?? '离队成员'
  const candidates = plan.candidateIds.map((id) => publicById.get(id)).filter((player): player is PublicPlayer => Boolean(player))
  const departureChat = departure?.chat.slice(-4) ?? []
  return <section className="page recruit-page replacement-page scene-page recruit-scene" style={sceneStyle(recruitBackgroundUrl)}><div className="page-heading"><div><div className="eyebrow">REPLACEMENT · DEPARTURE {plan.departureNumber}</div><h2>邀请一名替补进团</h2><p>补齐职责后继续当前副本进度。</p></div><div className="replacement-status"><span>当前进度保留</span><b>{candidates.length}<small>名候选</small></b></div></div><div className="replacement-departure"><div><small>{leaverName}离队</small><p>{departure?.leaveReason ?? `${leaverName}已经离开团队，当前阵容出现一个空缺。`}</p></div><div className="replacement-chat">{departureChat.map((line, index) => <p key={`${line}-${index}`}><ChatLine line={line}/></p>)}<p className="recruiter-line"><ChatLine line={`${plan.recruiterName}：${replacementRecruiterLine(seed, plan)}`}/></p></div></div><div className="recruit-layout"><div className={`candidate-grid replacement-candidates count-${candidates.length}`}>{candidates.map((player) => <CandidateCard key={player.player_id} player={player} status={playerStatuses[player.player_id]} seed={seed} round={100 + plan.departureNumber} buttonLabel="选择替补" onChoose={() => onRecruit(player)} />)}</div><aside className="roster-panel"><div className="panel-title"><span>等待补齐 · 当前阵容</span><b>{team.length}<small>/10</small></b></div><div className="compact-roster">{team.map((member, index) => { const player = publicById.get(member.id)!; return <div className="compact-member person-hover" data-intro={publicIntro(player, member.itemLevel)} style={classStyle(player.class)} key={member.id}><span className="roster-no">{String(index + 1).padStart(2, '0')}</span><ClassIcon wowClass={player.class}/><span className="compact-identity"><b>{player.name}</b><small><RoleMark role={currentSpec(member).role}/> {currentSpec(member).spec} · {member.itemLevel}</small></span></div> })}</div><div className="public-note">候选人均可补齐当前职责缺口，必要时可配合队内成员切换专精</div></aside></div></section>
}

function CandidateCard({ player: p, status, seed, round, onChoose, buttonLabel = '邀请入团' }: { player: PublicPlayer; status?: PlayerStatusSnapshot; seed: string; round: number; onChoose: () => void; buttonLabel?: string }) {
  const whisper = publicWhisper(p, seed, round)
  const itemLevel = dynamicItemLevel(p.player_id, seed)
  const visibleStatus = status ?? createPlayerStatus(seed, p.player_id)
  return <article className="candidate-card" style={classStyle(p.class)}><div className="candidate-top"><ClassIcon wowClass={p.class}/><b>ILVL {itemLevel}</b></div><h3>{p.name}</h3><div className="spec-line"><div className="candidate-spec"><strong>{p.signup_spec}</strong><SpecIcon spec={p.signup_spec}/></div></div><dl><div><dt>当前状态</dt><dd>{visibleStatus.text}</dd></div><div><dt>公开副修</dt><dd>{p.claimed_offspec || '—'}</dd></div><div><dt>公开进度</dt><dd>{believableProgress(p, itemLevel)}</dd></div><div><dt>消费自述</dt><dd>{believableEconomy(p, itemLevel)}</dd></div></dl><blockquote><span>“</span>{whisper}<span>”</span></blockquote><button onClick={onChoose}>{buttonLabel} <span>＋</span></button></article>
}

function BossDecisionPage({ boss, decision, resolution, onChoose, onContinue }: { boss: Boss; decision: BossDecision; resolution?: BossDecisionResolution; onChoose: (choiceId: BossDecisionChoiceId) => void; onContinue: () => void }) {
  const actor = publicById.get(decision.actorId)
  const target = decision.targetId ? publicById.get(decision.targetId) : undefined
  const continueLabel = decision.trigger === 'kill' && resolution?.action === 'close'
    ? '进入掉落拍卖'
    : resolution?.action === 'fight'
    ? '按这个决定开怪'
    : resolution?.action === 'kill' || resolution?.action === 'wipe' || resolution?.action === 'tech-ending'
      ? '查看这次尝试'
      : resolution?.action === 'leave'
        ? '处理退团与补位'
        : '回到战前准备'
  return <section className={`page scene-page boss-scene decision-page decision-${decision.id}`} style={decision.trigger === 'kill' ? bossLootSceneStyle(boss) : bossSceneStyle(boss)}>
    <div className="decision-shell">
      <div className="decision-topline"><span>{decision.kicker}</span><small>随机事件</small></div>
      <div className="decision-heading">
        <div>
          <div className="eyebrow">BOSS {boss.order} · {decision.trigger === 'kill' ? 'VICTORY EVENT' : 'WIPE RECOVERY EVENT'}</div>
          <h2>{decision.title}</h2>
          <p>{decision.prompt}</p>
        </div>
      </div>
      <div className="decision-cast">
        {actor && <div className="decision-person" style={classStyle(actor.class)}><ClassIcon wowClass={actor.class}/><span><small>事件发起人</small><b>{actor.name}</b><em>{actor.class} · {actor.signup_spec}</em></span></div>}
        {target && <><span className="decision-arrow">→</span><div className="decision-person target" style={classStyle(target.class)}><ClassIcon wowClass={target.class}/><span><small>被点名成员</small><b>{target.name}</b><em>{target.class} · {target.signup_spec}</em></span></div></>}
        <blockquote>{decision.quote}</blockquote>
      </div>
      {!resolution ? <div className="decision-choice-grid">{decision.choices.map((entry) => <button key={entry.id} className="decision-choice" onClick={() => onChoose(entry.id)}><b>{entry.label}</b><span className="choice-arrow" aria-hidden="true"><i/></span></button>)}</div> : <div className={`decision-outcome action-${resolution.action}`}>
        <div><small>DECISION RESULT · {resolution.tag}</small><h3>{resolution.headline}</h3><p>{resolution.detail}</p><DecisionEffectTags resolution={resolution}/></div>
        <button className="primary large" onClick={onContinue}>{continueLabel} <span>→</span></button>
      </div>}
    </div>
  </section>
}

function Preparation({ boss, team, morale, moraleLog, attempt, lastCombat, handledDecision, onSetSpec, onAttempt }: { boss: Boss; team: TeamMember[]; morale: number; moraleLog: MoraleEntry[]; attempt: number; lastCombat?: CombatResult; handledDecision?: HandledDecision; onSetSpec: (id: string, spec: string) => void; onAttempt: () => void }) {
  const counts = roleCounts(team)
  const modeLabel = boss.mode === '特殊' ? 'SPECIAL' : boss.hard_mode === '是' ? 'HARD MODE' : 'NORMAL'
  const buffs = activeRaidBuffs(team)
  const [openBuffId, setOpenBuffId] = useState<string>()
  const buffAreaRef = useRef<HTMLDivElement>(null)
  const openBuff = buffs.find((buff) => buff.buff_id === openBuffId)
  useEffect(() => {
    if (!openBuffId) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!buffAreaRef.current?.contains(event.target as Node)) setOpenBuffId(undefined)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
  }, [openBuffId])
  return <section className="page scene-page boss-scene" style={bossSceneStyle(boss)}>
    <div className="boss-banner"><div><div className="eyebrow">BOSS {boss.order} / {bosses.length} · {modeLabel}</div><h2>{boss.boss_name}</h2><p>{boss.mode} · {boss.design_note}</p></div><div className="attempt-badge"><span>下一次尝试</span><b>0{attempt}</b><small>/ 0{maxBossAttempts}</small></div></div>
    {lastCombat && !lastCombat.killed && <WipeReport result={lastCombat} morale={morale} handledDecision={handledDecision} />}
    <div className="prep-grid">
      <div className="team-table">
        <div className="table-head"><span>团员 / 公开报名信息</span><span>装等</span><span>本 Boss 出战专精</span><span>职责</span></div>
        {team.map((member) => {
          const player = publicById.get(member.id)!
          const specs = publicSpecs(member.id)
          const spec = currentSpec(member)
          return <div className="team-row person-hover" data-intro={publicIntro(player, member.itemLevel)} style={classStyle(player.class)} key={member.id}><div className="member-name"><ClassIcon wowClass={player.class}/><span><b>{player.name}</b><small>状态 {member.status?.text ?? '状态正常'} · {player.class} · 主修 {player.signup_spec} · 副修 {player.claimed_offspec || '无'} · {believableEconomy(player, member.itemLevel)}</small></span></div><strong>{member.itemLevel}</strong><SpecSelector playerName={player.name} options={specs} value={member.currentSpec} onChange={(nextSpec) => onSetSpec(member.id, nextSpec)}/><span className={`role role-${spec.role}`}><RoleMark role={spec.role}/>{spec.role}</span></div>
        })}
      </div>
      <aside className="strategy-panel">
        <div className="panel-title"><span>阵容概览</span><b className={`morale-value morale-${moraleTone(morale)}`}>{morale}<small>士气</small></b></div>
        <div className="role-counts"><div><span><RoleMark role="坦克"/>坦克</span><b>{counts.坦克}</b></div><div><span><RoleMark role="治疗"/>治疗</span><b>{counts.治疗}</b></div><div><span><RoleMark role="近战DPS"/>近战</span><b>{counts.近战DPS}</b></div><div><span><RoleMark role="远程DPS"/>远程</span><b>{counts.远程DPS}</b></div></div>
        <div className="raid-buffs"><b>团队增益</b><div ref={buffAreaRef}>{buffs.map((buff) => <button type="button" className="raid-buff" key={buff.buff_id} title={`${buff.buff_name}：${buff.description}`} aria-expanded={openBuffId === buff.buff_id} onClick={() => setOpenBuffId((current) => current === buff.buff_id ? undefined : buff.buff_id)}><img src={buffIconModules[`../photo/buff/${buff.icon_file}`]} alt=""/><small>{buff.buff_name}</small></button>)}{openBuff && <div className="raid-buff-popover" role="dialog" aria-label={`${openBuff.buff_name}效果`}><button type="button" aria-label="关闭" onClick={() => setOpenBuffId(undefined)}>×</button><span><img src={buffIconModules[`../photo/buff/${openBuff.icon_file}`]} alt=""/><b>{openBuff.buff_name}</b><small>{openBuff.provider_spec || openBuff.provider_class}</small></span><p>{openBuff.description}</p></div>}</div></div>
        <MoraleHistory entries={moraleLog} limit={4} compact/>
        <div className="checks"><b>关键检定</b>{boss.key_checks.split('|').map((check) => <span key={check}>◆ {check}</span>)}</div>
        <button className="primary battle-button" onClick={onAttempt}>开始第 {attempt} 次尝试 <span>→</span></button>
      </aside>
    </div>
  </section>
}

function CombatPlayback({ boss, result, onComplete }: { boss: Boss; result: CombatResult; onComplete: () => void }) {
  const totalSteps = result.events.length + 1
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (step >= totalSteps) return
    const timer = window.setTimeout(() => setStep((value) => value + 1), 850)
    return () => window.clearTimeout(timer)
  }, [step, totalSteps])
  const finished = step >= totalSteps
  const targetHp = result.killed ? 0 : result.remainingHp
  const bossHp = Math.round(100 - (100 - targetHp) * Math.min(step / totalSteps, 1))
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  const copyRng = rngFor(result.bossId, result.attempt, result.duration, 'combat-copy')
  const fatalEvent = result.events.find((event) => event.status === '失败')
  const hasFatalEvent = Boolean(fatalEvent)
  const responsibleEvent = fatalEvent ?? [...result.events].reverse().find((event) => event.status === '险情' && event.responsible)
  const deaths = result.deaths ?? []
  const variables = { boss: boss.boss_name, hp: result.remainingHp }
  const opening = combatCopy('opening', copyRng, variables)
  const finaleCategory: CombatLogTemplate['category'] = result.killed
    ? deaths.length ? 'kill_deaths' : 'kill'
    : hasFatalEvent ? 'wipe_fatal' : (result.casualties ?? 0) > 0 || deaths.length ? 'wipe_attrition' : 'wipe_enrage'
  const nonEventWipeFinale = result.failureCause === '机制失误'
    ? `机制链在${boss.boss_name}剩余${result.remainingHp}%时断掉，团队随即灭团。`
    : result.failureCause === '治疗不足'
      ? `治疗资源在${boss.boss_name}剩余${result.remainingHp}%时耗尽，团队没能撑住下一轮。`
      : result.failureCause === '阵容失衡'
        ? `职责配置无法继续支撑战斗，团队在${boss.boss_name}剩余${result.remainingHp}%时灭团。`
        : combatCopy(finaleCategory, copyRng, variables)
  const finale = !result.killed && responsibleEvent
    ? fatalEvent
      ? `${responsibleEvent.responsible ? `${responsibleEvent.responsible}未能处理` : ''}${responsibleEvent.name}，团队随即灭团。`
      : `${responsibleEvent.responsible}在${responsibleEvent.name}中出现险情，团队后续没能稳住。`
    : result.killed ? combatCopy(finaleCategory, copyRng, variables) : nonEventWipeFinale
  return <section className="page combat-page scene-page boss-scene" style={finished && result.killed ? bossLootSceneStyle(boss) : bossSceneStyle(boss)}><div className="combat-heading"><div><div className="eyebrow">LIVE COMBAT LOG · ATTEMPT {result.attempt}</div><h2>{boss.boss_name}</h2><p>{boss.mode} · 重要事件实时记录</p></div><div className="boss-health"><span>Boss 血量</span><b>{bossHp}%</b><i><em style={{ width: `${bossHp}%` }} /></i></div></div><div className="combat-console"><div className="console-top"><span>战斗记录</span><small>{finished ? `战斗时长 ${formatTime(result.duration)}` : '战斗进行中…'}</small></div><div className="log-line opening visible"><time>0:00</time><i>◆</i><div><b>战斗开始</b><p>{opening}</p></div></div>{result.events.map((event, index) => { const visible = step > index; const time = result.duration * (event.timeRatio ?? (index + 1) / (result.events.length + 1)); return <div key={`${event.name}-${index}`} className={`log-line ${event.status} ${visible ? 'visible' : ''}`}><time>{formatTime(time)}</time><i>{event.status === '成功' ? '✓' : event.status === '险情' ? '!' : '×'}</i><div><b>{event.name}</b><p>{event.detail}{event.responsible ? ` · 责任人：${event.responsible}` : ''}{event.recovery ? <><br/><span className="event-recovery">补救：{event.recovery}</span></> : null}</p></div><em>{event.status}</em></div> })}{finished && <div className={`log-line finale visible ${result.killed ? '成功' : '失败'}`}><time>{formatTime(result.duration)}</time><i>{result.killed ? '✓' : '×'}</i><div><b>{finale}</b><p>{result.reason}</p></div><em>{result.killed ? '击杀' : '灭团'}</em></div>}</div>{finished ? <><FightStatsStrip result={result}/><CombatMeters meters={result.meters}/><div className="combat-actions"><span>{result.killed ? '战斗统计已记账，接下来看看谁愿意为紫色像素上头。' : '锅已经写进战斗记录，回去还能重新排职责。'}</span><button className="primary large" onClick={onComplete}>{result.killed ? '进入掉落拍卖' : '结算本次灭团'} <b>→</b></button></div></> : <div className="combat-progress"><span style={{ width: `${step / totalSteps * 100}%` }}/><button onClick={() => setStep(totalSteps)}>展开完整记录</button></div>}</section>
}

function FightStatsStrip({ result }: { result: CombatResult }) {
  const minutes = `${Math.floor(result.duration / 60)}分${result.duration % 60}秒`
  const deaths = result.deaths?.length ?? 0
  const battleReses = result.battleReses ?? 0
  return <div className="fight-stats-strip"><div><small>团队 DPS</small><b>{number(result.teamDps)}</b></div><div><small>团队 HPS</small><b>{number(result.teamHps)}</b></div><div><small>战斗时长</small><b>{minutes}</b></div><div><small>倒地 / 战复</small><b className={deaths ? 'stat-wipe' : ''}>{deaths} / {battleReses}</b></div><div><small>{result.killed ? '战斗结果' : '失败瓶颈'}</small><b className={result.killed ? 'stat-kill' : 'stat-wipe'}>{result.killed ? '击杀' : `${result.failureCause ?? '综合压力'} · ${result.remainingHp}%`}</b></div></div>
}

function CombatMeters({ meters, compact = false }: { meters: CombatMeter[]; compact?: boolean }) {
  const damage = [...meters].filter((meter) => meter.dps > 400).sort((a, b) => b.dps - a.dps)
  const healing = [...meters].filter((meter) => meter.hps > 0).sort((a, b) => b.hps - a.hps)
  const maxDps = damage[0]?.dps || 1
  const maxHps = healing[0]?.hps || 1
  const row = (meter: CombatMeter, index: number, healingRow = false) => {
    const player = publicById.get(meter.playerId)!
    const value = healingRow ? meter.hps : meter.dps
    const max = healingRow ? maxHps : maxDps
    const status = meter.died ? (meter.battleResurrected ? ' · 战复' : ' · 阵亡') : ''
    const active = meter.died && meter.activeRatio ? ` · 出勤${Math.round(meter.activeRatio * 100)}%` : ''
    return <div className={`meter-row person-hover ${meter.died ? 'meter-dead' : ''}`} data-intro={publicIntro(player, meter.itemLevel)} style={classStyle(player.class)} key={`${healingRow ? 'h' : 'd'}-${meter.playerId}`}><em>{index + 1}</em><ClassIcon wowClass={player.class}/><span><b>{meter.name}</b><small>{meter.spec}<i className="meter-status">{status}{active}</i></small><u className={healingRow ? 'heal' : ''} style={{ width: `${value / max * 100}%` }}/></span><strong>{number(value)}</strong></div>
  }
  return <div className={`meters-grid ${compact ? 'compact' : ''}`}><div className="meter-panel"><div className="meter-title"><span>DAMAGE</span><b>伤害统计</b></div>{damage.map((meter, index) => row(meter, index))}</div><div className="meter-panel"><div className="meter-title"><span>HEALING</span><b>治疗统计</b></div>{healing.length ? healing.map((meter, index) => row(meter, index, true)) : <p className="no-meter">本次没有治疗专精出战</p>}</div></div>
}

function decisionEffectLabels(resolution: BossDecisionResolution): string[] {
  const labels: string[] = []
  const modifiers = resolution.modifiers
  const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)}`
  const percent = (multiplier: number) => signed((multiplier - 1) * 100) + '%'
  const scope = resolution.effectScope === 'next-boss' ? '下一 Boss ' : resolution.effectScope === 'current-boss' ? '当前 Boss ' : ''
  if (resolution.moraleDelta) labels.push(`团队士气 ${signed(resolution.moraleDelta)}`)
  if (modifiers?.teamMechanics) labels.push(`${scope}全团机制 ${signed(modifiers.teamMechanics)}`)
  if (modifiers?.teamOutputMultiplier && modifiers.teamOutputMultiplier !== 1) labels.push(`${scope}团队输出 ${percent(modifiers.teamOutputMultiplier)}`)
  if (modifiers?.teamHealingMultiplier && modifiers.teamHealingMultiplier !== 1) labels.push(`${scope}团队治疗 ${percent(modifiers.teamHealingMultiplier)}`)
  Object.entries(modifiers?.playerMechanics ?? {}).forEach(([id, value]) => {
    if (value) labels.push(`${scope}${publicById.get(id)?.name ?? '目标'} 机制 ${signed(value)}`)
  })
  const personalIds = new Set([
    ...Object.keys(modifiers?.playerOutputMultiplier ?? {}),
    ...Object.keys(modifiers?.playerHealingMultiplier ?? {}),
  ])
  personalIds.forEach((id) => {
    const output = modifiers?.playerOutputMultiplier?.[id] ?? 1
    const healing = modifiers?.playerHealingMultiplier?.[id] ?? 1
    const name = publicById.get(id)?.name ?? '目标'
    if (output !== 1 && output === healing) labels.push(`${scope}${name} DPS/HPS ${percent(output)}`)
    else {
      if (output !== 1) labels.push(`${scope}${name} DPS ${percent(output)}`)
      if (healing !== 1) labels.push(`${scope}${name} HPS ${percent(healing)}`)
    }
  })
  if (modifiers?.leaveRateBonus) labels.push(`退团概率 +${Math.round(modifiers.leaveRateBonus)}%`)
  if (resolution.forceNextAttemptWipe) labels.push('下一次尝试直接灭团')
  return labels
}

function decisionResultTone(resolution: BossDecisionResolution): 'positive' | 'negative' | 'neutral' {
  if (resolution.forceNextAttemptWipe) return 'negative'
  const modifiers = resolution.modifiers
  const total = (resolution.moraleDelta ?? 0)
    + (modifiers?.teamMechanics ?? 0)
    + ((modifiers?.teamOutputMultiplier ?? 1) - 1) * 100
    + ((modifiers?.teamHealingMultiplier ?? 1) - 1) * 100
    + Object.values(modifiers?.playerMechanics ?? {}).reduce((sum, value) => sum + value, 0)
    + Object.values(modifiers?.playerOutputMultiplier ?? {}).reduce((sum, value) => sum + (value - 1) * 100, 0)
    + Object.values(modifiers?.playerHealingMultiplier ?? {}).reduce((sum, value) => sum + (value - 1) * 100, 0)
    - (modifiers?.leaveRateBonus ?? 0)
  return total > 0 ? 'positive' : total < 0 ? 'negative' : 'neutral'
}

function conciseDecisionSummary(resolution: BossDecisionResolution): string {
  if (resolution.summary) return resolution.summary
  const finalQuote = resolution.detail.lastIndexOf('”')
  return finalQuote >= 0 && finalQuote < resolution.detail.length - 1
    ? resolution.detail.slice(finalQuote + 1).trim()
    : resolution.detail
}

function DecisionEffectTags({ resolution }: { resolution: BossDecisionResolution }) {
  const labels = decisionEffectLabels(resolution)
  const tone = (label: string) => /(?:^|\s)-\d/.test(label) ? 'negative' : /(?:^|\s)\+\d/.test(label) ? 'positive' : 'neutral'
  return <div className="decision-effect-tags">{labels.length ? labels.map((label) => <span className={tone(label)} key={label}>{label}</span>) : <span className="no-effect">无额外效果</span>}</div>
}

function WipeReport({ result, morale, handledDecision }: { result: CombatResult; morale: number; handledDecision?: HandledDecision }) {
  const eventResult = handledDecision?.decision.bossId === result.bossId ? handledDecision : undefined
  const showChat = !eventResult && result.chat.length > 0
  return <div className="wipe-report"><div className="wipe-title"><span>WIPE · 剩余 {result.remainingHp}%</span><span>士气降至 <MoraleValue value={morale}/></span></div><div className="event-track">{result.events.map((event, i) => <div key={i} className={`event ${event.status}`}><i>{event.status === '成功' ? '✓' : event.status === '险情' ? '!' : '×'}</i><span><b>{event.name}</b><small>{event.detail}{event.responsible ? ` · ${event.responsible}` : ''}{event.recovery ? `；补救：${event.recovery}` : ''}</small></span></div>)}</div><div className={`wipe-bottom ${!showChat && !eventResult ? 'single' : ''}`}><div><small>灭团原因</small><b>{result.reason}</b></div>{eventResult ? <div className={`decision-summary tone-${decisionResultTone(eventResult.resolution)}`}><div><small>临场事件结果</small><em>{eventResult.decision.title}</em></div><b>{eventResult.resolution.headline}</b><p>{conciseDecisionSummary(eventResult.resolution)}</p><DecisionEffectTags resolution={eventResult.resolution}/></div> : showChat ? <div className="chat-box">{result.chat.map((line, i) => <p key={i}><ChatLine line={line}/></p>)}</div> : null}</div></div>
}

function Auction({ boss, records, result, pot, morale, onNext, isLast }: { boss: Boss; records: AuctionRecord[]; result: CombatResult; pot: number; morale: number; onNext: () => void; isLast: boolean }) {
  const lootLabel = boss.mode === '特殊' ? '2 件专属掉落' : boss.hard_mode === '是' ? '1 件普通 · 1 件困难' : '2 件普通装备'
  return <section className="page scene-page boss-scene" style={bossLootSceneStyle(boss)}><div className="kill-banner"><span>✓ BOSS DEFEATED</span><h2>{boss.boss_name} 已击杀</h2><p>第 {result.attempt} 次尝试 · 士气 {morale} · 金池 {gold(pot)}</p></div><FightStatsStrip result={result}/><div className="loot-heading"><div><div className="eyebrow">LOOT AUCTION</div><h3>掉落拍卖</h3></div><span>{lootLabel}</span></div><div className="loot-grid">{records.map((record) => <article className={`loot-card grade-${record.item.grade.replace('+', 'plus')}`} key={record.item.loot_id}><div className="loot-grade">{record.item.grade}</div><div className="loot-info"><LootIcon item={record.item}/><small>{record.item.drop_group} · {record.item.slot}</small><h4>{record.item.item_name}</h4><p>{record.item.eligible_tags.replaceAll('|', ' / ')}</p><div><span>起拍 {gold(itemStartPrice(record.item))}</span><span>参考 {gold(itemReferencePrice(record.item))}</span></div></div><div className="bid-log">{record.log.map((line, i) => <p key={i}><ChatLine line={line}/></p>)}</div><div className={`sale-result ${record.salvaged ? 'unsold' : ''}`}><span>{record.salvaged ? '流拍分解' : <ChatText text={record.buyerName ?? ''}/>}</span><b>{gold(record.price)}</b></div></article>)}</div><div className="auction-footer"><div><small>当前金池</small><b>{gold(pot)}</b></div><button className="primary large" onClick={onNext}>{isLast ? '查看最终结算' : '前往下一个 Boss'} <span>→</span></button></div></section>
}

function Results({ game, onNew }: { game: GameState; onReplay?: () => void; onNew: () => void }) {
  const eligible = payoutEligible(game.team)
  const blackGold = game.endReason === '黑金跑路'
  const frozenByBan = game.endReason === '科技团覆灭'
  const share = !blackGold && !frozenByBan && eligible.length ? Math.floor(game.pot / eligible.length) : 0
  const cleared = game.histories.filter((history) => history.killed).length
  const allFights = game.histories.flatMap((history) => history.results)
  const stats = game.team.map((member) => {
    const entries = allFights.map((fight) => fight.meters?.find((meter) => meter.playerId === member.id)).filter((meter): meter is CombatMeter => Boolean(meter))
    const averageDps = entries.length ? Math.round(entries.reduce((sum, meter) => sum + meter.dps, 0) / entries.length) : 0
    const averageHps = entries.length ? Math.round(entries.reduce((sum, meter) => sum + meter.hps, 0) / entries.length) : 0
    return { member, entries, averageDps, averageHps, contribution: Math.max(averageDps, averageHps * 1.05) * Math.max(.55, 1 - member.blame * .1) }
  })
  const carry = [...stats].sort((a, b) => b.contribution - a.contribution)[0]
  const warCriminal = [...game.team].filter((member) => member.id !== carry?.member.id && member.blame > 0).sort((a, b) => b.blame - a.blame)[0]
  const biggestBuyer = [...game.team].sort((a, b) => b.spent - a.spent)[0]
  const biggestBone = blackGold || frozenByBan ? undefined : [...eligible].sort((a, b) => (share - b.spent) - (share - a.spent))[0]
  const priciest = [...game.auctions].filter((record) => !record.salvaged).sort((a, b) => b.price - a.price)[0]
  const highestUnsold = [...game.auctions].filter((record) => record.salvaged).sort((a, b) => itemReferencePrice(b.item) - itemReferencePrice(a.item))[0]
  const overallMeters: CombatMeter[] = stats.map(({ member, averageDps, averageHps }) => {
    const player = publicById.get(member.id)!
    const spec = currentSpec(member)
    return { playerId: member.id, name: player.name, spec: member.currentSpec, role: spec.role, itemLevel: member.itemLevel, dps: averageDps, hps: averageHps, damage: 0, healing: 0 }
  })
  const ending = resolveRunEnding({
    seed: game.seed,
    endReason: game.endReason,
    currentBossId: bosses[game.bossIndex]?.boss_id ?? '',
    histories: game.histories.map((history) => ({
      bossId: history.bossId,
      attempts: history.attempts,
      killed: history.killed,
      wipes: history.results.filter((fight) => !fight.killed).length,
    })),
    team: game.team.map((member) => ({
      id: member.id,
      name: publicById.get(member.id)?.name ?? member.id,
      left: member.left,
      blame: member.blame,
      personality: hiddenById.get(member.id)?.personality_type ?? '',
    })),
    bosses: bosses.map((currentBoss) => ({ id: currentBoss.boss_id, name: currentBoss.boss_name, order: Number(currentBoss.order) })),
    pot: game.pot,
    leaverId: game.lastCombat?.leaver,
    responsibleId: game.lastCombat?.responsible,
    leaveType: game.lastCombat?.leaveType,
    leaveReason: game.lastCombat?.leaveReason,
  })
  const endingChat = game.endingChat ?? (ending.kind === 'leave' || ending.kind === 'replacement-failure' || game.lastCombat?.leaveType === '分崩离析' ? compactEndingChat(game.lastCombat?.chat ?? []).slice(-5) : [])

  return <section className={`page results-page ${ending.kind === 'full-clear' ? 'results-full-clear' : ''}`}>
    <div className="result-hero"><div><div className="eyebrow">RUN COMPLETE</div><h2>{ending.hidden ? '隐藏结局已解锁' : ending.kind === 'full-clear' ? '奥杜尔全通' : '本局结束'}</h2><p>{ending.label}</p></div><div className="progress-ring" style={{ '--progress': `${cleared / bosses.length * 360}deg` } as React.CSSProperties}><div><b>{cleared}<small>/{bosses.length}</small></b><span>最终进度</span></div></div></div>
    <div className={`run-ending ending-${ending.kind} ${ending.hidden ? 'hidden-ending' : ''}`}>
      <div className="ending-copy"><small>本次结局 · {ending.label}</small><h3>{ending.title}</h3><p>{ending.body}</p><strong>{ending.summary}</strong></div>
      <button className="primary" onClick={onNew}>重新开团 <span>→</span></button>
      {ending.reward && <div className="ending-reward"><span>隐藏奖励</span><b>{ending.reward.title}</b><p>{ending.reward.detail}</p></div>}
      {endingChat.length > 0 && <div className="ending-chat"><small>最后的团队频道</small>{endingChat.map((line, index) => <p key={`${line}-${index}`}><ChatLine line={line}/></p>)}</div>}
    </div>
    <div className="money-summary"><div><small>{blackGold ? '被卷走金池' : frozenByBan ? '被冻结金池' : '总金池'}</small><b>{gold(game.pot)}</b></div><div><small>人均分金</small><b>{gold(share)}</b></div><div><small>总成交</small><b>{game.auctions.filter((record) => !record.salvaged).length} 件</b></div></div>
    <div className="result-columns">
      <div><SectionTitle kicker="BOSS RECORD" title="首领战绩"/><div className="boss-records">{bosses.map((currentBoss) => { const history = game.histories.find((item) => item.bossId === currentBoss.boss_id); const last = history?.results.at(-1); return <div key={currentBoss.boss_id}><span className={history?.killed ? 'cleared' : ''}>{history?.killed ? '✓' : '—'}</span><b>{currentBoss.boss_name}</b><small>{history ? `${history.attempts} 次 · ${last ? `${number(last.teamDps)} DPS` : ''}` : '未挑战'}</small><em>{history?.killed ? '已击杀' : history ? '未通过' : '未解锁'}</em></div> })}</div></div>
      <div><SectionTitle kicker="AWARDS" title="本局奖项"/><div className="awards-grid"><Award icon="♛" label="团队大腿" value={publicById.get(carry?.member.id)?.name ?? '—'} detail={carry ? `输出/治疗贡献扣除 ${carry.member.blame} 次失误后最高` : undefined}/><Award icon="×" label="最大战犯" value={warCriminal ? publicById.get(warCriminal.id)?.name ?? '—' : '无人上榜'} detail={warCriminal ? `记录失误 ${warCriminal.blame} 次` : '没有其他明确责任人'}/><Award icon="◆" label="最大老板" value={publicById.get(biggestBuyer?.id)?.name ?? '—'} detail={gold(biggestBuyer?.spent ?? 0)}/><Award icon="骨" label="最大排骨" value={blackGold || frozenByBan ? '无人分金' : biggestBone ? publicById.get(biggestBone.id)?.name ?? '—' : '—'} detail={blackGold ? '金池已被团长卷走' : frozenByBan ? '账号与金池同时冻结' : `净赚 ${gold(share - (biggestBone?.spent ?? 0))}`}/></div></div>
    </div>
    <SectionTitle kicker="COMBAT ANALYTICS" title="全程平均 DPS / HPS"/>
    <CombatMeters meters={overallMeters}/>
    <SectionTitle kicker="LEDGER" title="个人账本"/>
    <div className="ledger"><div className="ledger-head"><span>团员</span><span>出战专精</span><span>消费</span><span>分金</span><span>净收益</span></div>{game.team.map((member) => { const player = publicById.get(member.id)!; const income = member.left ? 0 : share; return <div key={member.id} className={member.left ? 'left' : ''}><span><ClassIcon wowClass={player.class}/><b>{player.name}</b><small>{member.left ? '已退团' : player.class}</small></span><span>{member.currentSpec}</span><span>{gold(member.spent)}</span><span>{gold(income)}</span><strong>{gold(income - member.spent)}</strong></div> })}</div>
    <div className="auction-records"><SectionTitle kicker="AUCTION LOG" title="全部掉落记录"/><div className="auction-table">{game.auctions.length ? game.auctions.map((record) => <div key={`${record.bossId}-${record.item.loot_id}`}><span>{record.bossName}</span><b><LootIcon item={record.item} compact/><i className={`mini-grade grade-${record.item.grade.replace('+', 'plus')}`}>{record.item.grade}</i>{record.item.item_name}</b><small>{record.salvaged ? '流拍分解' : <ChatText text={record.buyerName ?? ''}/>}</small><em>{gold(record.price)}</em></div>) : <p className="no-data">尚未产生掉落记录</p>}</div></div>
    <div className="final-cards loot-summary"><div><small>最贵成交装备</small><b>{priciest?.item.item_name ?? '—'}</b><span>{priciest ? `${priciest.buyerName} · ${gold(priciest.price)}` : '本局无成交'}</span></div><div><small>最高价值流拍</small><b>{highestUnsold?.item.item_name ?? '—'}</b><span>{highestUnsold ? `参考 ${gold(itemReferencePrice(highestUnsold.item))}` : '本局无流拍'}</span></div></div>
  </section>
}

function LegacyResults({ game, onReplay = () => undefined, onNew }: { game: GameState; onReplay?: () => void; onNew: () => void }) {
  const eligible = payoutEligible(game.team)
  const share = eligible.length ? Math.floor(game.pot / eligible.length) : 0
  const leaderIncome = game.pot - share * eligible.length
  const cleared = game.histories.filter((history) => history.killed).length
  const allFights = game.histories.flatMap((history) => history.results)
  const playerStats = game.team.map((member) => {
    const entries = allFights.map((fight) => fight.meters?.find((meter) => meter.playerId === member.id)).filter((meter): meter is CombatMeter => Boolean(meter))
    const averageDps = entries.length ? Math.round(entries.reduce((sum, meter) => sum + meter.dps, 0) / entries.length) : 0
    const averageHps = entries.length ? Math.round(entries.reduce((sum, meter) => sum + meter.hps, 0) / entries.length) : 0
    return { id: member.id, fights: entries.length, averageDps, averageHps, bestDps: Math.max(0, ...entries.map((meter) => meter.dps)), bestHps: Math.max(0, ...entries.map((meter) => meter.hps)) }
  }).sort((a, b) => Math.max(b.averageDps, b.averageHps * 1.35) - Math.max(a.averageDps, a.averageHps * 1.35))
  const priciest = [...game.auctions].filter((record) => !record.salvaged).sort((a, b) => b.price - a.price)[0]
  const highestUnsold = [...game.auctions].filter((record) => record.salvaged).sort((a, b) => itemReferencePrice(b.item) - itemReferencePrice(a.item))[0]
  const biggestBuyer = [...game.team].sort((a, b) => b.spent - a.spent)[0]
  const warCriminal = [...game.team].sort((a, b) => b.blame - a.blame)[0]
  const carry = playerStats[0]
  const biggestBone = [...eligible].sort((a, b) => (share - b.spent) - (share - a.spent))[0]
  const reasonText = game.endReason === '全通MVP' ? `奥杜尔 ${bosses.length} 个 Boss 全部击杀。` : game.endReason === '成员退团散团' ? `${publicById.get(game.lastCombat?.leaver ?? '')?.name ?? '有成员'}退团，团队当场解散。` : `在${bosses[game.bossIndex]?.boss_name}连续五次失败。`
  const evalText = cleared === bosses.length ? (game.team.reduce((sum, member) => sum + member.blame, 0) <= 4 ? '选人老辣：阵容扛住了完整路线，战斗数据和消费也都健康。' : '结果全通，但过程惊险；你选的人里藏了几颗雷。') : roleCounts(game.team).坦克 < 2 || roleCounts(game.team).治疗 < 2 ? '团长太相信奇迹，基础职责短板最终还是藏不住。' : '纸面阵容能开，抗压和执行力却没经住实战。'
  const disbandReport = game.endReason === '成员退团散团' && game.lastCombat ? <div className="disband-report"><div className="disband-reason"><span>{game.lastCombat.leaveType ?? '成员退团'}</span><h3>{publicById.get(game.lastCombat.leaver ?? '')?.name ?? '一名成员'}导致散团</h3><p>{game.lastCombat.leaveReason ?? '成员在灭团后退出，团队人数不足，无法继续。'}</p></div><div className="disband-chat"><small>最后的团队频道</small>{compactEndingChat(game.lastCombat.chat).slice(-5).map((line, index) => <p key={`${line}-${index}`}><ChatLine line={line}/></p>)}</div></div> : null
  return <section className="page results-page"><div className="result-hero"><div><div className="eyebrow">RUN COMPLETE · SEED {game.seed}</div><h2>{game.endReason === '全通MVP' ? '奥杜尔全通' : '本局结束'}</h2><p>{reasonText}</p></div><div className="progress-ring" style={{ '--progress': `${cleared / bosses.length * 360}deg` } as React.CSSProperties}><div><b>{cleared}<small>/{bosses.length}</small></b><span>最终进度</span></div></div></div>{disbandReport}<div className="money-summary"><div><small>总金池</small><b>{gold(game.pot)}</b></div><div><small>人均分金</small><b>{gold(share)}</b></div><div><small>团长收入</small><b>{gold(leaderIncome)}</b></div><div><small>总成交</small><b>{game.auctions.filter((record) => !record.salvaged).length} 件</b></div></div><div className="result-columns"><div><SectionTitle kicker="BOSS RECORD" title="首领战绩"/><div className="boss-records">{bosses.map((currentBoss) => { const history = game.histories.find((item) => item.bossId === currentBoss.boss_id); const last = history?.results.at(-1); return <div key={currentBoss.boss_id}><span className={history?.killed ? 'cleared' : ''}>{history?.killed ? '✓' : '—'}</span><b>{currentBoss.boss_name}</b><small>{history ? `${history.attempts} 次 · ${last ? `${number(last.teamDps)} DPS` : ''}` : '未挑战'}</small><em>{history?.killed ? '已击杀' : history ? '未通过' : '未解锁'}</em></div> })}</div></div><div><SectionTitle kicker="AWARDS" title="本局奖项"/><div className="awards-grid"><Award icon="♛" label="团队大腿" value={publicById.get(carry?.id)?.name ?? '—'} detail={carry ? `平均 ${number(Math.max(carry.averageDps, carry.averageHps))}` : undefined}/><Award icon="×" label="最大战犯" value={warCriminal?.blame ? publicById.get(warCriminal.id)?.name ?? '—' : '无人上榜'} /><Award icon="◆" label="最大老板" value={publicById.get(biggestBuyer?.id)?.name ?? '—'} detail={gold(biggestBuyer?.spent ?? 0)} /><Award icon="骨" label="最大排骨" value={publicById.get(biggestBone?.id)?.name ?? '—'} detail={`净赚 ${gold(share - (biggestBone?.spent ?? 0))}`} /></div></div></div><SectionTitle kicker="COMBAT ANALYTICS" title="全程战斗统计"/><div className="fight-history-table"><div className="fight-history-head"><span>Boss / 尝试</span><span>结果</span><span>时长</span><span>团队 DPS</span><span>团队 HPS</span></div>{allFights.map((fight) => <div key={`${fight.bossId}-${fight.attempt}`}><span><b>{bosses.find((item) => item.boss_id === fight.bossId)?.boss_name}</b><small>第 {fight.attempt} 次</small></span><strong className={fight.killed ? 'stat-kill' : 'stat-wipe'}>{fight.killed ? '击杀' : `剩余 ${fight.remainingHp}%`}</strong><span>{Math.floor(fight.duration / 60)}:{String(fight.duration % 60).padStart(2, '0')}</span><span>{number(fight.teamDps)}</span><span>{number(fight.teamHps)}</span></div>)}</div><div className="player-stats-table"><div className="player-stats-head"><span>团员</span><span>参战</span><span>平均 DPS</span><span>最佳 DPS</span><span>平均 HPS</span><span>最佳 HPS</span></div>{playerStats.map((stat) => { const player = publicById.get(stat.id)!; return <div key={stat.id}><span><ClassIcon wowClass={player.class}/><b>{player.name}</b><small>{player.class}</small></span><span>{stat.fights}</span><span>{number(stat.averageDps)}</span><strong>{number(stat.bestDps)}</strong><span>{number(stat.averageHps)}</span><strong>{number(stat.bestHps)}</strong></div> })}</div><SectionTitle kicker="LEDGER" title="个人账本"/><div className="ledger"><div className="ledger-head"><span>团员</span><span>出战专精</span><span>消费</span><span>分金</span><span>净收益</span></div>{game.team.map((member) => { const player = publicById.get(member.id)!; const income = member.left ? 0 : share; return <div key={member.id} className={member.left ? 'left' : ''}><span><ClassIcon wowClass={player.class}/><b>{player.name}</b><small>{member.left ? '已退团' : player.class}</small></span><span>{member.currentSpec}</span><span>{gold(member.spent)}</span><span>{gold(income)}</span><strong>{gold(income - member.spent)}</strong></div>})}</div><div className="auction-records"><SectionTitle kicker="AUCTION LOG" title="全部掉落记录"/><div className="auction-table">{game.auctions.length ? game.auctions.map((record) => <div key={`${record.bossId}-${record.item.loot_id}`}><span>{record.bossName}</span><b><LootIcon item={record.item} compact/><i className={`mini-grade grade-${record.item.grade.replace('+', 'plus')}`}>{record.item.grade}</i>{record.item.item_name}</b><small>{record.salvaged ? '流拍分解' : <ChatText text={record.buyerName ?? ''}/>}</small><em>{gold(record.price)}</em></div>) : <p className="no-data">尚未产生掉落记录</p>}</div></div><div className="final-cards"><div><small>最贵成交装备</small><b>{priciest?.item.item_name ?? '—'}</b><span>{priciest ? `${priciest.buyerName} · ${gold(priciest.price)}` : '本局无成交'}</span></div><div><small>最高价值流拍</small><b>{highestUnsold?.item.item_name ?? '—'}</b><span>{highestUnsold ? `参考 ${gold(itemReferencePrice(highestUnsold.item))}` : '本局无流拍'}</span></div><div className="leader-review"><small>团长选人评价</small><b>{evalText}</b></div></div><div className="result-actions"><button className="secondary" onClick={onNew}>换个种子重新开团</button><button className="primary large" onClick={onReplay}>相同 Seed 重放 <span>↻</span></button></div></section>
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) { return <div className="section-title"><span>{kicker}</span><h3>{title}</h3></div> }
function Award({ icon, label, value, detail }: { icon: string; label: string; value: string; detail?: string }) {
  const player = playerByName.get(value)
  const tone = icon === '♛' ? 'carry' : icon === '×' ? 'fault' : icon === '◆' ? 'buyer' : 'bone'
  const rank = icon === '♛' ? '01' : icon === '×' ? '02' : icon === '◆' ? '03' : '04'
  return <div className={`award award-${tone}`} style={player ? classStyle(player.class) : undefined}>
    <span className="award-rank">{rank}</span>
    <span className="award-avatar">{player ? <ClassIcon wowClass={player.class}/> : <i>—</i>}</span>
    <span className="award-copy"><small>{label}</small><b>{value}</b>{detail && <em>{detail}</em>}</span>
  </div>
}

export default App
