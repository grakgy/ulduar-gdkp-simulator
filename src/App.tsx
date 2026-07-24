import { useEffect, useMemo, useState } from 'react'
import { bosses, chatTemplates, combatLogTemplates, gameConfig, hiddenById, playersForSeed, publicById, type Boss, type CombatLogTemplate, type PublicPlayer } from './data'
import { createMember, currentSpec, dynamicItemLevel, itemReferencePrice, itemStartPrice, publicSpecs, rngFor, roleCounts, runAuction, shuffled, simulateCombat, type AuctionRecord, type CombatMeter, type CombatResult, type TeamMember } from './engine'
import { resolveRunEnding } from './endings'
import introBackgroundUrl from '../photo/ad03ffb9-75a6-4655-a5e5-0b185e7e7555.png'
import recruitBackgroundUrl from '../photo/cb865539-7d2f-4421-be6e-0cb493b4a06b.png'

const bossBackgroundModules = import.meta.glob('../photo/boss/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

type Phase = 'intro' | 'recruit' | 'prep' | 'combat' | 'auction' | 'result'
type EndReason = '全通MVP' | '三次失败' | '成员退团散团' | ''

interface BossHistory { bossId: string; attempts: number; killed: boolean; results: CombatResult[] }
interface MoraleEntry { id: string; bossName: string; source: '战斗' | '拍卖'; delta: number; before: number; after: number; reason: string }
interface GameState {
  phase: Phase
  seed: string
  recruitRound: number
  team: TeamMember[]
  bossIndex: number
  bossAttempts: number
  morale: number
  pot: number
  histories: BossHistory[]
  auctions: AuctionRecord[]
  moraleLog: MoraleEntry[]
  lastCombat?: CombatResult
  pendingCombat?: CombatResult
  endReason: EndReason
}

const STORAGE_KEY = 'ulduar-gdkp-full-v13'
const initialMorale = Number(gameConfig.get('initial_morale') ?? 70)
const freshSeed = () => {
  const randomPart = typeof crypto !== 'undefined' && 'getRandomValues' in crypto ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 0xffffffff)
  return `${Date.now()}-${randomPart}`
}
const initialState = (seed = freshSeed()): GameState => ({ phase: 'intro', seed, recruitRound: 0, team: [], bossIndex: 0, bossAttempts: 0, morale: initialMorale, pot: 0, histories: [], auctions: [], moraleLog: [], endReason: '' })
const caiFamilyIds = new Set(['P108', 'P115', 'P117'])

const classColors: Record<string, string> = { 死亡骑士: '#c84c5b', 德鲁伊: '#ff8d24', 猎人: '#91c66c', 法师: '#74d0ef', 圣骑士: '#f39ac0', 牧师: '#f1f1e8', 盗贼: '#f1db55', 萨满: '#4b7cff', 术士: '#9382d9', 战士: '#c69a68' }
const gold = (value: number) => `${Math.floor(value).toLocaleString()}G`
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

function classStyle(className: string) {
  return { '--class-color': classColors[className] ?? '#9a9a92' } as React.CSSProperties
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
  return sceneStyle(bossBackgroundModules[`../photo/boss/${boss.boss_id}.jpg`])
}

export function payoutEligible(team: TeamMember[]) {
  return team.filter((member) => !member.left)
}

function publicIntro(player: PublicPlayer, itemLevel = Number(player.signup_item_level)) {
  return `${player.name}｜${player.class}｜主修 ${player.signup_spec}（${player.signup_role}）｜装等 ${itemLevel}｜公开副修 ${player.claimed_offspec || '无'}｜${believableProgress(player, itemLevel)}｜${believableEconomy(player, itemLevel)}`
}

function RoleMark({ role }: { role: string }) {
  const kind = role === '坦克' ? 'tank' : role === '治疗' ? 'heal' : 'dps'
  return <span className={`role-mark role-mark-${kind}`} title={role} aria-label={role} />
}

function MoraleHistory({ entries, limit = 6, compact = false }: { entries: MoraleEntry[]; limit?: number; compact?: boolean }) {
  if (!entries.length) return null
  const visible = entries.slice(-limit).reverse()
  return <section className={`morale-history ${compact ? 'compact' : 'page'}`}><div className="morale-history-title"><span>MORALE LOG</span><b>士气变动记录</b></div><div className="morale-history-list">{visible.map((entry) => <div key={entry.id}><span>{entry.bossName}<small>{entry.source}</small></span><p>{entry.reason}</p><em className={entry.delta > 0 ? 'up' : entry.delta < 0 ? 'down' : ''}>{entry.delta > 0 ? '+' : ''}{entry.delta}</em><strong>{entry.before} → {entry.after}</strong></div>)}</div></section>
}

function App() {
  const [game, setGame] = useState<GameState>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '') as GameState } catch { return initialState() }
  })
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(game)) }, [game])
  const playerPool = useMemo(() => playersForSeed(game.seed), [game.seed])
  const candidates = useMemo(() => {
    const selected = new Set(game.team.map((member) => member.id))
    const caiFamilyChosen = game.team.some((member) => caiFamilyIds.has(member.id))
    const available = playerPool.filter((player) => !selected.has(player.player_id) && !(caiFamilyChosen && caiFamilyIds.has(player.player_id)))
    const roundSeed = `${game.seed}|round:${game.recruitRound}|team:${game.team.map((member) => member.id).join(',')}`
    return shuffled(available, roundSeed).slice(0, 5)
  }, [game.seed, game.recruitRound, game.team, playerPool])
  const boss = bosses[game.bossIndex]

  const start = () => setGame({ ...initialState(), phase: 'recruit' })
  const restart = () => {
    if (game.phase !== 'intro' && !window.confirm('现在重开会清空本局阵容、进度和金池，确定重新选人吗？')) return
    setGame({ ...initialState(), phase: 'recruit' })
  }
  const recruit = (player: PublicPlayer) => setGame((prev) => {
    const team = [...prev.team, createMember(player.player_id, prev.seed)]
    const nextRound = prev.recruitRound + 1
    return { ...prev, team, recruitRound: nextRound, phase: nextRound === 10 ? 'prep' : 'recruit' }
  })
  const setSpec = (id: string, spec: string) => setGame((prev) => ({ ...prev, team: prev.team.map((m) => m.id === id ? { ...m, currentSpec: spec } : m) }))
  const attemptBoss = () => setGame((prev) => {
    const currentBoss = bosses[prev.bossIndex]
    const attempt = prev.bossAttempts + 1
    const result = simulateCombat(prev.seed, currentBoss, attempt, prev.team, prev.morale, prev.pot)
    return { ...prev, pendingCombat: result, phase: 'combat' }
  })
  const resolveCombat = () => setGame((prev) => {
    const result = prev.pendingCombat
    if (!result) return prev
    const currentBoss = bosses[prev.bossIndex]
    const attempt = result.attempt
    let team = prev.team.map((m) => ({ ...m, blame: m.blame + (m.id === result.responsible ? 1 : 0), left: m.left || (attempt < 3 && m.id === result.leaver) }))
    const oldHistory = prev.histories.find((h) => h.bossId === currentBoss.boss_id)
    const history: BossHistory = { bossId: currentBoss.boss_id, attempts: attempt, killed: result.killed, results: [...(oldHistory?.results ?? []), result] }
    const histories = [...prev.histories.filter((h) => h.bossId !== currentBoss.boss_id), history]
    const morale = Math.max(0, Math.min(100, prev.morale + result.moraleDelta))
    const combatMorale: MoraleEntry = { id: `${currentBoss.boss_id}-${attempt}-combat`, bossName: currentBoss.boss_name, source: '战斗', delta: result.moraleDelta, before: prev.morale, after: morale, reason: result.moraleReason }
    const moraleLog = [...(prev.moraleLog ?? []), combatMorale]
    if (!result.killed && attempt >= 3) return { ...prev, team, histories, bossAttempts: attempt, morale, moraleLog, lastCombat: { ...result, leaver: undefined, leaveType: undefined, leaveReason: undefined }, pendingCombat: undefined, phase: 'result', endReason: '三次失败' }
    if (result.leaver) return { ...prev, team, histories, bossAttempts: attempt, morale, moraleLog, lastCombat: result, pendingCombat: undefined, phase: 'result', endReason: '成员退团散团' }
    if (!result.killed) return { ...prev, team, histories, bossAttempts: attempt, morale, moraleLog, lastCombat: result, pendingCombat: undefined, phase: 'prep' }
    const auction = runAuction(prev.seed, currentBoss, team)
    team = auction.team
    const auctionMorale = Math.max(0, Math.min(100, morale + auction.moraleDelta))
    const auctionEntry: MoraleEntry = { id: `${currentBoss.boss_id}-${attempt}-auction`, bossName: currentBoss.boss_name, source: '拍卖', delta: auction.moraleDelta, before: morale, after: auctionMorale, reason: auction.moraleReasons.join('；') || '掉落和成交都比较普通' }
    return { ...prev, team, histories, bossAttempts: attempt, morale: auctionMorale, moraleLog: [...moraleLog, auctionEntry], pot: prev.pot + auction.potGain, auctions: [...prev.auctions, ...auction.records], lastCombat: result, pendingCombat: undefined, phase: 'auction' }
  })
  const nextBoss = () => setGame((prev) => {
    if (prev.bossIndex >= bosses.length - 1) return { ...prev, phase: 'result', endReason: '全通MVP' }
    return { ...prev, bossIndex: prev.bossIndex + 1, bossAttempts: 0, lastCombat: undefined, phase: 'prep' }
  })

  return (
    <div className="app-shell">
      {game.phase !== 'intro' && <Header game={game} onRestart={restart} />}
      <main>
        {game.phase === 'auction' && <MoraleHistory entries={game.moraleLog ?? []} limit={6} />}
        {game.phase === 'intro' && <Intro onStart={start} />}
        {game.phase === 'recruit' && <Recruitment round={game.recruitRound} candidates={candidates} team={game.team} seed={game.seed} onRecruit={recruit} />}
        {game.phase === 'prep' && <Preparation boss={boss} team={game.team} morale={game.morale} moraleLog={game.moraleLog ?? []} attempt={game.bossAttempts + 1} lastCombat={game.lastCombat} onSetSpec={setSpec} onAttempt={attemptBoss} />}
        {game.phase === 'combat' && game.pendingCombat && <CombatPlayback boss={boss} result={game.pendingCombat} onComplete={resolveCombat} />}
        {game.phase === 'auction' && <Auction boss={boss} records={game.auctions.filter((a) => a.bossId === boss.boss_id)} result={game.lastCombat!} pot={game.pot} morale={game.morale} onNext={nextBoss} isLast={game.bossIndex === bosses.length - 1} />}
        {game.phase === 'result' && <Results game={game} onNew={start} />}
        {game.phase === 'result' && <MoraleHistory entries={game.moraleLog ?? []} limit={8} />}
      </main>
    </div>
  )
}

function Header({ game, onRestart }: { game: GameState; onRestart: () => void }) {
  const stage = game.phase === 'intro' ? '开团公告' : game.phase === 'recruit' ? `招募 ${game.recruitRound + 1}/10` : game.phase === 'prep' ? '战前准备' : game.phase === 'combat' ? '战斗记录' : game.phase === 'auction' ? '掉落拍卖' : '最终结算'
  return <header className="topbar"><div className="brand"><span className="brand-mark">U</span><div><b>奥杜尔十人金团</b><small>MVP SIMULATOR</small></div></div><div className="stage-pill"><span>{stage}</span><i>随机局</i></div><div className="header-actions">{game.phase !== 'intro' && <div className="header-stats"><span>士气 <b>{game.morale}</b></span><span>金池 <b>{gold(game.pot)}</b></span></div>}<button className="restart-run" onClick={onRestart}>{game.phase === 'intro' ? '直接开团' : '重开一把'} <span>↻</span></button></div></header>
}

function Intro({ onStart }: { onStart: () => void }) {
  return <section className="intro-image" style={{ backgroundImage: `url("${introBackgroundUrl}")` }}><button className="intro-restart-hotspot" aria-label="重新开团" onClick={onStart}/><button className="intro-start-hotspot" aria-label="开始招募" onClick={onStart}/></section>
}

function Recruitment({ round, candidates, team, seed, onRecruit }: { round: number; candidates: PublicPlayer[]; team: TeamMember[]; seed: string; onRecruit: (p: PublicPlayer) => void }) {
  return <section className="page recruit-page scene-page recruit-scene" style={sceneStyle(recruitBackgroundUrl)}><div className="page-heading"><div><div className="eyebrow">RECRUITMENT · ROUND {round + 1}</div><h2>选择一位勇士进团</h2><p>注意阵容的职责与职业搭配，合理的坦克、治疗和输出组合才能走得更远。</p></div><div className="round-dots" aria-label={`第${round + 1}轮`}>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < round ? 'done' : i === round ? 'active' : ''}>{i + 1}</i>)}</div></div><div className="recruit-layout"><div className="candidate-grid">{candidates.map((p) => <CandidateCard key={p.player_id} player={p} seed={seed} round={round} onChoose={() => onRecruit(p)} />)}</div><aside className="roster-panel"><div className="panel-title"><span>当前团队 · 公开信息</span><b>{team.length}<small>/10</small></b></div>{team.length === 0 ? <div className="empty-roster">名单还是空的。<br/>第一手最见团长功力。</div> : <div className="compact-roster">{team.map((m, i) => { const p = publicById.get(m.id)!; return <div className="compact-member person-hover" data-intro={publicIntro(p, m.itemLevel)} style={classStyle(p.class)} key={m.id}><span className="roster-no">{String(i + 1).padStart(2, '0')}</span><i style={{ background: classColors[p.class] }} /><span className="compact-identity"><b>{p.name}</b><small><RoleMark role={p.signup_role}/> 主修 {p.signup_spec} · {m.itemLevel}</small></span><span className="compact-public"><small>副修 {p.claimed_offspec || '无'}</small><em>{believableEconomy(p, m.itemLevel)}</em></span></div> })}</div>}<div className="public-note">悬停人物可查看完整公开介绍</div></aside></div></section>
}

function CandidateCard({ player: p, seed, round, onChoose }: { player: PublicPlayer; seed: string; round: number; onChoose: () => void }) {
  const whisper = publicWhisper(p, seed, round)
  const itemLevel = dynamicItemLevel(p.player_id, seed)
  return <article className="candidate-card" style={classStyle(p.class)}><div className="candidate-top"><span className="class-dot"/><span>{p.class}</span><b>ILVL {itemLevel}</b></div><h3>{p.name}</h3><div className="spec-line"><strong>{p.signup_spec}</strong><span><RoleMark role={p.signup_role}/>{p.signup_role}</span></div><dl><div><dt>公开副修</dt><dd>{p.claimed_offspec || '—'}</dd></div><div><dt>公开进度</dt><dd>{believableProgress(p, itemLevel)}</dd></div><div><dt>消费自述</dt><dd>{believableEconomy(p, itemLevel)}</dd></div></dl><blockquote><span>“</span>{whisper}<span>”</span></blockquote><button onClick={onChoose}>邀请入团 <span>＋</span></button></article>
}

function Preparation({ boss, team, morale, moraleLog, attempt, lastCombat, onSetSpec, onAttempt }: { boss: Boss; team: TeamMember[]; morale: number; moraleLog: MoraleEntry[]; attempt: number; lastCombat?: CombatResult; onSetSpec: (id: string, spec: string) => void; onAttempt: () => void }) {
  const counts = roleCounts(team)
  const modeLabel = boss.mode === '特殊' ? 'SPECIAL' : boss.hard_mode === '是' ? 'HARD MODE' : 'NORMAL'
  return <section className="page scene-page boss-scene" style={bossSceneStyle(boss)}><div className="boss-banner"><div><div className="eyebrow">BOSS {boss.order} / {bosses.length} · {modeLabel}</div><h2>{boss.boss_name}</h2><p>{boss.mode} · {boss.design_note}</p></div><div className="attempt-badge"><span>下一次尝试</span><b>0{attempt}</b><small>/ 03</small></div></div>{lastCombat && !lastCombat.killed && <WipeReport result={lastCombat} morale={morale} />}<div className="prep-grid"><div className="team-table"><div className="table-head"><span>团员 / 公开报名信息</span><span>装等</span><span>本 Boss 出战专精</span><span>职责</span></div>{team.map((m) => { const p = publicById.get(m.id)!; const specs = publicSpecs(m.id); const spec = currentSpec(m); return <div className="team-row person-hover" data-intro={publicIntro(p, m.itemLevel)} style={classStyle(p.class)} key={m.id}><div className="member-name"><i style={{ background: classColors[p.class] }} /><span><b>{p.name}</b><small>{p.class} · 主修 {p.signup_spec} · 副修 {p.claimed_offspec || '无'} · {believableEconomy(p, m.itemLevel)}</small></span></div><strong>{m.itemLevel}</strong><select value={m.currentSpec} onChange={(e) => onSetSpec(m.id, e.target.value)} aria-label={`${p.name}的出战专精`}>{specs.map((s) => <option key={s.spec}>{s.spec}</option>)}</select><span className={`role role-${spec.role}`}><RoleMark role={spec.role}/>{spec.role}</span></div>})}</div><aside className="strategy-panel"><div className="panel-title"><span>阵容概览</span><b>{morale}<small>士气</small></b></div><div className="role-counts"><div><span><RoleMark role="坦克"/>坦克</span><b>{counts.坦克}</b></div><div><span><RoleMark role="治疗"/>治疗</span><b>{counts.治疗}</b></div><div><span><RoleMark role="近战DPS"/>近战</span><b>{counts.近战DPS}</b></div><div><span><RoleMark role="远程DPS"/>远程</span><b>{counts.远程DPS}</b></div></div><MoraleHistory entries={moraleLog} limit={4} compact/><div className="checks"><b>本 Boss 阵容门槛</b>{boss.tank_mode === '载具' ? <span>◆ 载具战，不校验常规职责</span> : <><span>◆ 坦克 {boss.min_tanks}–{boss.max_tanks} 名，坦克组平均至少 {boss.min_tank_ilvl} 装等</span><span>◆ 治疗 {boss.min_healers}–{boss.max_healers} 名</span><span>◆ 输出至少 {boss.min_dps} 名{Number(boss.extra_tank_min_dps) > Number(boss.min_dps) ? `；多带坦克时至少 ${boss.extra_tank_min_dps} 名` : ''}</span></>}<b>关键检定</b>{boss.key_checks.split('|').map((c) => <span key={c}>◆ {c}</span>)}</div><p className="warning-copy">职责或坦克组平均装等不达标时，有 85% 概率直接阵容崩盘；剩余情况仍要接受正常战斗检定。</p><button className="primary battle-button" onClick={onAttempt}>开始第 {attempt} 次尝试 <span>→</span></button></aside></div></section>
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
  const hasFatalEvent = result.events.some((event) => event.status === '失败')
  const deaths = result.deaths ?? []
  const variables = { boss: boss.boss_name, hp: result.remainingHp }
  const opening = combatCopy('opening', copyRng, variables)
  const finaleCategory: CombatLogTemplate['category'] = result.killed
    ? deaths.length ? 'kill_deaths' : 'kill'
    : hasFatalEvent ? 'wipe_fatal' : (result.casualties ?? 0) > 0 || deaths.length ? 'wipe_attrition' : 'wipe_enrage'
  const finale = combatCopy(finaleCategory, copyRng, variables)
  return <section className="page combat-page scene-page boss-scene" style={bossSceneStyle(boss)}><div className="combat-heading"><div><div className="eyebrow">LIVE COMBAT LOG · ATTEMPT {result.attempt}</div><h2>{boss.boss_name}</h2><p>{boss.mode} · 重要事件实时记录</p></div><div className="boss-health"><span>Boss 血量</span><b>{bossHp}%</b><i><em style={{ width: `${bossHp}%` }} /></i></div></div><div className="combat-console"><div className="console-top"><span>战斗记录</span><small>{finished ? `战斗时长 ${formatTime(result.duration)}` : '战斗进行中…'}</small></div><div className="log-line opening visible"><time>0:00</time><i>◆</i><div><b>战斗开始</b><p>{opening}</p></div></div>{result.events.map((event, index) => { const visible = step > index; const time = result.duration * (event.timeRatio ?? (index + 1) / (result.events.length + 1)); return <div key={`${event.name}-${index}`} className={`log-line ${event.status} ${visible ? 'visible' : ''}`}><time>{formatTime(time)}</time><i>{event.status === '成功' ? '✓' : event.status === '险情' ? '!' : '×'}</i><div><b>{event.name}</b><p>{event.detail}{event.responsible ? ` · 责任人：${event.responsible}` : ''}{event.recovery ? <><br/><span className="event-recovery">补救：{event.recovery}</span></> : null}</p></div><em>{event.status}</em></div> })}{finished && <div className={`log-line finale visible ${result.killed ? '成功' : '失败'}`}><time>{formatTime(result.duration)}</time><i>{result.killed ? '✓' : '×'}</i><div><b>{finale}</b><p>{result.reason}</p></div><em>{result.killed ? '击杀' : '灭团'}</em></div>}</div>{finished ? <><FightStatsStrip result={result}/><CombatMeters meters={result.meters}/><div className="combat-actions"><span>{result.killed ? '战斗统计已记账，接下来看看谁愿意为紫色像素上头。' : '锅已经写进战斗记录，回去还能重新排职责。'}</span><button className="primary large" onClick={onComplete}>{result.killed ? '进入掉落拍卖' : '结算本次灭团'} <b>→</b></button></div></> : <div className="combat-progress"><span style={{ width: `${step / totalSteps * 100}%` }}/><button onClick={() => setStep(totalSteps)}>展开完整记录</button></div>}</section>
}

function FightStatsStrip({ result }: { result: CombatResult }) {
  const minutes = `${Math.floor(result.duration / 60)}分${result.duration % 60}秒`
  const deaths = result.deaths?.length ?? 0
  const battleReses = result.battleReses ?? 0
  return <div className="fight-stats-strip"><div><small>团队 DPS</small><b>{number(result.teamDps)}</b></div><div><small>团队 HPS</small><b>{number(result.teamHps)}</b></div><div><small>战斗时长</small><b>{minutes}</b></div><div><small>倒地 / 战复</small><b className={deaths ? 'stat-wipe' : ''}>{deaths} / {battleReses}</b></div><div><small>战斗结果</small><b className={result.killed ? 'stat-kill' : 'stat-wipe'}>{result.killed ? '击杀' : `剩余 ${result.remainingHp}%`}</b></div></div>
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
    return <div className={`meter-row person-hover ${meter.died ? 'meter-dead' : ''}`} data-intro={publicIntro(player, meter.itemLevel)} style={classStyle(player.class)} key={`${healingRow ? 'h' : 'd'}-${meter.playerId}`}><em>{index + 1}</em><RoleMark role={meter.role}/><span><b>{meter.name}</b><small>{meter.spec}<i className="meter-status">{status}{active}</i></small><u className={healingRow ? 'heal' : ''} style={{ width: `${value / max * 100}%` }}/></span><strong>{number(value)}</strong></div>
  }
  return <div className={`meters-grid ${compact ? 'compact' : ''}`}><div className="meter-panel"><div className="meter-title"><span>DAMAGE</span><b>伤害统计</b></div>{damage.map((meter, index) => row(meter, index))}</div><div className="meter-panel"><div className="meter-title"><span>HEALING</span><b>治疗统计</b></div>{healing.length ? healing.map((meter, index) => row(meter, index, true)) : <p className="no-meter">本次没有治疗专精出战</p>}</div></div>
}

function WipeReport({ result, morale }: { result: CombatResult; morale: number }) {
  return <div className="wipe-report"><div className="wipe-title"><span>WIPE · 剩余 {result.remainingHp}%</span><b>士气降至 {morale}</b></div><div className="event-track">{result.events.map((event, i) => <div key={i} className={`event ${event.status}`}><i>{event.status === '成功' ? '✓' : event.status === '险情' ? '!' : '×'}</i><span><b>{event.name}</b><small>{event.detail}{event.responsible ? ` · ${event.responsible}` : ''}{event.recovery ? `；补救：${event.recovery}` : ''}</small></span></div>)}</div><div className="wipe-bottom"><div><small>灭团原因</small><b>{result.reason}</b></div><div className="chat-box">{result.chat.map((line, i) => <p key={i}>{line}</p>)}</div></div></div>
}

function Auction({ boss, records, result, pot, morale, onNext, isLast }: { boss: Boss; records: AuctionRecord[]; result: CombatResult; pot: number; morale: number; onNext: () => void; isLast: boolean }) {
  const lootLabel = boss.mode === '特殊' ? '2 件专属掉落' : boss.hard_mode === '是' ? '1 件普通 · 1 件困难' : '2 件普通装备'
  return <section className="page scene-page boss-scene" style={bossSceneStyle(boss)}><div className="kill-banner"><span>✓ BOSS DEFEATED</span><h2>{boss.boss_name} 已击杀</h2><p>第 {result.attempt} 次尝试 · 士气 {morale} · 金池 {gold(pot)}</p></div><FightStatsStrip result={result}/><div className="loot-heading"><div><div className="eyebrow">LOOT AUCTION</div><h3>掉落拍卖</h3></div><span>{lootLabel}</span></div><div className="loot-grid">{records.map((record) => <article className={`loot-card grade-${record.item.grade.replace('+', 'plus')}`} key={record.item.loot_id}><div className="loot-grade">{record.item.grade}</div><div className="loot-info"><small>{record.item.drop_group} · {record.item.slot}</small><h4>{record.item.item_name}</h4><p>{record.item.eligible_tags.replaceAll('|', ' / ')}</p><div><span>起拍 {gold(itemStartPrice(record.item))}</span><span>参考 {gold(itemReferencePrice(record.item))}</span></div></div><div className="bid-log">{record.log.map((line, i) => <p key={i}>{line}</p>)}</div><div className={`sale-result ${record.salvaged ? 'unsold' : ''}`}><span>{record.salvaged ? '流拍分解' : record.buyerName}</span><b>{gold(record.price)}</b></div></article>)}</div><div className="auction-footer"><div><small>当前金池</small><b>{gold(pot)}</b></div><button className="primary large" onClick={onNext}>{isLast ? '查看最终结算' : '前往下一个 Boss'} <span>→</span></button></div></section>
}

function Results({ game, onNew }: { game: GameState; onReplay?: () => void; onNew: () => void }) {
  const eligible = payoutEligible(game.team)
  const share = eligible.length ? Math.floor(game.pot / eligible.length) : 0
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
  const biggestBone = [...eligible].sort((a, b) => (share - b.spent) - (share - a.spent))[0]
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
    leaverId: game.lastCombat?.leaver,
    leaveType: game.lastCombat?.leaveType,
    leaveReason: game.lastCombat?.leaveReason,
  })
  const endingChat = ending.kind === 'leave' ? game.lastCombat?.chat.slice(-5) ?? [] : []

  return <section className="page results-page">
    <div className="result-hero"><div><div className="eyebrow">RUN COMPLETE</div><h2>{ending.hidden ? '隐藏结局已解锁' : ending.kind === 'full-clear' ? '奥杜尔全通' : '本局结束'}</h2><p>{ending.label}</p></div><div className="progress-ring" style={{ '--progress': `${cleared / bosses.length * 360}deg` } as React.CSSProperties}><div><b>{cleared}<small>/{bosses.length}</small></b><span>最终进度</span></div></div></div>
    <div className={`run-ending ending-${ending.kind} ${ending.hidden ? 'hidden-ending' : ''}`}>
      <div className="ending-copy"><small>本次结局 · {ending.label}</small><h3>{ending.title}</h3><p>{ending.body}</p><strong>{ending.summary}</strong></div>
      <button className="primary" onClick={onNew}>重新开团 <span>→</span></button>
      {ending.reward && <div className="ending-reward"><span>隐藏奖励</span><b>{ending.reward.title}</b><p>{ending.reward.detail}</p></div>}
      {endingChat.length > 0 && <div className="ending-chat"><small>最后的团队频道</small>{endingChat.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div>}
    </div>
    <div className="money-summary"><div><small>总金池</small><b>{gold(game.pot)}</b></div><div><small>人均分金</small><b>{gold(share)}</b></div><div><small>总成交</small><b>{game.auctions.filter((record) => !record.salvaged).length} 件</b></div></div>
    <div className="result-columns">
      <div><SectionTitle kicker="BOSS RECORD" title="首领战绩"/><div className="boss-records">{bosses.map((currentBoss) => { const history = game.histories.find((item) => item.bossId === currentBoss.boss_id); const last = history?.results.at(-1); return <div key={currentBoss.boss_id}><span className={history?.killed ? 'cleared' : ''}>{history?.killed ? '✓' : '—'}</span><b>{currentBoss.boss_name}</b><small>{history ? `${history.attempts} 次 · ${last ? `${number(last.teamDps)} DPS` : ''}` : '未挑战'}</small><em>{history?.killed ? '已击杀' : history ? '未通过' : '未解锁'}</em></div> })}</div></div>
      <div><SectionTitle kicker="AWARDS" title="本局奖项"/><div className="awards-grid"><Award icon="♛" label="团队大腿" value={publicById.get(carry?.member.id)?.name ?? '—'} detail={carry ? `输出/治疗贡献扣除 ${carry.member.blame} 次失误后最高` : undefined}/><Award icon="×" label="最大战犯" value={warCriminal ? publicById.get(warCriminal.id)?.name ?? '—' : '无人上榜'} detail={warCriminal ? `记录失误 ${warCriminal.blame} 次` : '没有其他明确责任人'}/><Award icon="◆" label="最大老板" value={publicById.get(biggestBuyer?.id)?.name ?? '—'} detail={gold(biggestBuyer?.spent ?? 0)}/><Award icon="骨" label="最大排骨" value={publicById.get(biggestBone?.id)?.name ?? '—'} detail={`净赚 ${gold(share - (biggestBone?.spent ?? 0))}`}/></div></div>
    </div>
    <SectionTitle kicker="COMBAT ANALYTICS" title="全程平均 DPS / HPS"/>
    <CombatMeters meters={overallMeters}/>
    <SectionTitle kicker="LEDGER" title="个人账本"/>
    <div className="ledger"><div className="ledger-head"><span>团员</span><span>出战专精</span><span>消费</span><span>分金</span><span>净收益</span></div>{game.team.map((member) => { const player = publicById.get(member.id)!; const income = member.left ? 0 : share; return <div key={member.id} className={member.left ? 'left' : ''}><span><i style={{ background: classColors[player.class] }}/><b>{player.name}</b><small>{member.left ? '已退团' : player.class}</small></span><span>{member.currentSpec}</span><span>{gold(member.spent)}</span><span>{gold(income)}</span><strong>{gold(income - member.spent)}</strong></div> })}</div>
    <div className="auction-records"><SectionTitle kicker="AUCTION LOG" title="全部掉落记录"/><div className="auction-table">{game.auctions.length ? game.auctions.map((record) => <div key={`${record.bossId}-${record.item.loot_id}`}><span>{record.bossName}</span><b><i className={`mini-grade grade-${record.item.grade.replace('+', 'plus')}`}>{record.item.grade}</i>{record.item.item_name}</b><small>{record.salvaged ? '流拍分解' : record.buyerName}</small><em>{gold(record.price)}</em></div>) : <p className="no-data">尚未产生掉落记录</p>}</div></div>
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
  const reasonText = game.endReason === '全通MVP' ? `奥杜尔 ${bosses.length} 个 Boss 全部击杀。` : game.endReason === '成员退团散团' ? `${publicById.get(game.lastCombat?.leaver ?? '')?.name ?? '有成员'}退团，团队当场解散。` : `在${bosses[game.bossIndex]?.boss_name}连续三次失败。`
  const evalText = cleared === bosses.length ? (game.team.reduce((sum, member) => sum + member.blame, 0) <= 4 ? '选人老辣：阵容扛住了完整路线，战斗数据和消费也都健康。' : '结果全通，但过程惊险；你选的人里藏了几颗雷。') : roleCounts(game.team).坦克 < 2 || roleCounts(game.team).治疗 < 2 ? '团长太相信奇迹，基础职责短板最终还是藏不住。' : '纸面阵容能开，抗压和执行力却没经住实战。'
  const disbandReport = game.endReason === '成员退团散团' && game.lastCombat ? <div className="disband-report"><div className="disband-reason"><span>{game.lastCombat.leaveType ?? '成员退团'}</span><h3>{publicById.get(game.lastCombat.leaver ?? '')?.name ?? '一名成员'}导致散团</h3><p>{game.lastCombat.leaveReason ?? '成员在灭团后退出，团队人数不足，无法继续。'}</p></div><div className="disband-chat"><small>最后的团队频道</small>{game.lastCombat.chat.slice(-5).map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div></div> : null
  return <section className="page results-page"><div className="result-hero"><div><div className="eyebrow">RUN COMPLETE · SEED {game.seed}</div><h2>{game.endReason === '全通MVP' ? '奥杜尔全通' : '本局结束'}</h2><p>{reasonText}</p></div><div className="progress-ring" style={{ '--progress': `${cleared / bosses.length * 360}deg` } as React.CSSProperties}><div><b>{cleared}<small>/{bosses.length}</small></b><span>最终进度</span></div></div></div>{disbandReport}<div className="money-summary"><div><small>总金池</small><b>{gold(game.pot)}</b></div><div><small>人均分金</small><b>{gold(share)}</b></div><div><small>团长收入</small><b>{gold(leaderIncome)}</b></div><div><small>总成交</small><b>{game.auctions.filter((record) => !record.salvaged).length} 件</b></div></div><div className="result-columns"><div><SectionTitle kicker="BOSS RECORD" title="首领战绩"/><div className="boss-records">{bosses.map((currentBoss) => { const history = game.histories.find((item) => item.bossId === currentBoss.boss_id); const last = history?.results.at(-1); return <div key={currentBoss.boss_id}><span className={history?.killed ? 'cleared' : ''}>{history?.killed ? '✓' : '—'}</span><b>{currentBoss.boss_name}</b><small>{history ? `${history.attempts} 次 · ${last ? `${number(last.teamDps)} DPS` : ''}` : '未挑战'}</small><em>{history?.killed ? '已击杀' : history ? '未通过' : '未解锁'}</em></div> })}</div></div><div><SectionTitle kicker="AWARDS" title="本局奖项"/><div className="awards-grid"><Award icon="♛" label="团队大腿" value={publicById.get(carry?.id)?.name ?? '—'} detail={carry ? `平均 ${number(Math.max(carry.averageDps, carry.averageHps))}` : undefined}/><Award icon="×" label="最大战犯" value={warCriminal?.blame ? publicById.get(warCriminal.id)?.name ?? '—' : '无人上榜'} /><Award icon="◆" label="最大老板" value={publicById.get(biggestBuyer?.id)?.name ?? '—'} detail={gold(biggestBuyer?.spent ?? 0)} /><Award icon="骨" label="最大排骨" value={publicById.get(biggestBone?.id)?.name ?? '—'} detail={`净赚 ${gold(share - (biggestBone?.spent ?? 0))}`} /></div></div></div><SectionTitle kicker="COMBAT ANALYTICS" title="全程战斗统计"/><div className="fight-history-table"><div className="fight-history-head"><span>Boss / 尝试</span><span>结果</span><span>时长</span><span>团队 DPS</span><span>团队 HPS</span></div>{allFights.map((fight) => <div key={`${fight.bossId}-${fight.attempt}`}><span><b>{bosses.find((item) => item.boss_id === fight.bossId)?.boss_name}</b><small>第 {fight.attempt} 次</small></span><strong className={fight.killed ? 'stat-kill' : 'stat-wipe'}>{fight.killed ? '击杀' : `剩余 ${fight.remainingHp}%`}</strong><span>{Math.floor(fight.duration / 60)}:{String(fight.duration % 60).padStart(2, '0')}</span><span>{number(fight.teamDps)}</span><span>{number(fight.teamHps)}</span></div>)}</div><div className="player-stats-table"><div className="player-stats-head"><span>团员</span><span>参战</span><span>平均 DPS</span><span>最佳 DPS</span><span>平均 HPS</span><span>最佳 HPS</span></div>{playerStats.map((stat) => { const player = publicById.get(stat.id)!; return <div key={stat.id}><span><i style={{ background: classColors[player.class] }}/><b>{player.name}</b><small>{player.class}</small></span><span>{stat.fights}</span><span>{number(stat.averageDps)}</span><strong>{number(stat.bestDps)}</strong><span>{number(stat.averageHps)}</span><strong>{number(stat.bestHps)}</strong></div> })}</div><SectionTitle kicker="LEDGER" title="个人账本"/><div className="ledger"><div className="ledger-head"><span>团员</span><span>出战专精</span><span>消费</span><span>分金</span><span>净收益</span></div>{game.team.map((member) => { const player = publicById.get(member.id)!; const income = member.left ? 0 : share; return <div key={member.id} className={member.left ? 'left' : ''}><span><i style={{ background: classColors[player.class] }}/><b>{player.name}</b><small>{member.left ? '已退团' : player.class}</small></span><span>{member.currentSpec}</span><span>{gold(member.spent)}</span><span>{gold(income)}</span><strong>{gold(income - member.spent)}</strong></div>})}</div><div className="auction-records"><SectionTitle kicker="AUCTION LOG" title="全部掉落记录"/><div className="auction-table">{game.auctions.length ? game.auctions.map((record) => <div key={`${record.bossId}-${record.item.loot_id}`}><span>{record.bossName}</span><b><i className={`mini-grade grade-${record.item.grade.replace('+', 'plus')}`}>{record.item.grade}</i>{record.item.item_name}</b><small>{record.salvaged ? '流拍分解' : record.buyerName}</small><em>{gold(record.price)}</em></div>) : <p className="no-data">尚未产生掉落记录</p>}</div></div><div className="final-cards"><div><small>最贵成交装备</small><b>{priciest?.item.item_name ?? '—'}</b><span>{priciest ? `${priciest.buyerName} · ${gold(priciest.price)}` : '本局无成交'}</span></div><div><small>最高价值流拍</small><b>{highestUnsold?.item.item_name ?? '—'}</b><span>{highestUnsold ? `参考 ${gold(itemReferencePrice(highestUnsold.item))}` : '本局无流拍'}</span></div><div className="leader-review"><small>团长选人评价</small><b>{evalText}</b></div></div><div className="result-actions"><button className="secondary" onClick={onNew}>换个种子重新开团</button><button className="primary large" onClick={onReplay}>相同 Seed 重放 <span>↻</span></button></div></section>
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) { return <div className="section-title"><span>{kicker}</span><h3>{title}</h3></div> }
function Award({ icon, label, value, detail }: { icon: string; label: string; value: string; detail?: string }) { return <div className="award"><i>{icon}</i><span><small>{label}</small><b>{value}</b>{detail && <em>{detail}</em>}</span></div> }

export default App
