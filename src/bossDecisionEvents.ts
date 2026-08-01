import { hiddenById, publicById, type Boss} from './data'
import { currentSpec, rngFor, type CombatModifiers, type CombatResult, type TeamMember } from './engine'

export type BossDecisionEventId = 'bug' | 'leader' | 'pressure' | 'veteran' | 'atmosphere' | 'instigator' | 'data' | 'celebration' | 'macro' | 'quiet'
export type BossDecisionChoiceId = 'accept' | 'decline' | 'steady' | 'fiery' | 'mild' | 'provoke' | 'detail' | 'full' | 'show' | 'light' | 'talk' | 'compete' | 'publish' | 'private' | 'celebrate' | 'skip' | 'install' | 'keep' | 'speak' | 'callout'

export interface BossDecisionChoice {
  id: BossDecisionChoiceId
  label: string
}

export interface BossDecision {
  id: BossDecisionEventId
  trigger: 'wipe' | 'kill'
  actorId: string
  targetId?: string
  resultTargetId?: string
  bossId: string
  title: string
  kicker: string
  prompt: string
  quote: string
  choices: BossDecisionChoice[]
  copyVariant?: number
}

export interface BossDecisionUsage {
  run: BossDecisionEventId[]
  boss: Record<string, BossDecisionEventId[]>
}

export interface BossDecisionOutcomeStage {
  headline: string
  detail: string
  tag: string
  modifiers?: CombatModifiers
  moraleDelta?: number
  action?: 'close' | 'fight' | 'kill' | 'wipe' | 'tech-ending' | 'leave'
  responsibleId?: string
  leaverId?: string
  forceNextAttemptWipe?: boolean
  effectScope?: 'current-boss' | 'next-boss'
}

export interface BossDecisionResolution extends BossDecisionOutcomeStage {
  summary?: string
  action: 'close' | 'fight' | 'kill' | 'wipe' | 'tech-ending' | 'leave'
  preMediation?: BossDecisionOutcomeStage
  mediationLevel?: 'full' | 'partial'
  mediationName?: string
}

const eventChance: Record<BossDecisionEventId, number> = {
  bug: .05,
  leader: .08,
  pressure: .06,
  veteran: .08,
  atmosphere: .08,
  instigator: .06,
  data: .03,
  celebration: .05,
  macro: .10,
  quiet: .03,
}

const eventTrait: Record<BossDecisionEventId, string> = {
  bug: '钻空子',
  leader: '团长型',
  pressure: '压力怪',
  veteran: '老司机',
  atmosphere: '气氛组',
  instigator: '拱火者',
  data: '数据执着',
  celebration: '气氛组',
  macro: '宏依赖',
  quiet: '不开麦',
}

const runOnce = new Set<BossDecisionEventId>(['bug', 'leader'])
const killEvents = new Set<BossDecisionEventId>(['data', 'celebration', 'macro'])
const wipeEvents = new Set<BossDecisionEventId>(['bug', 'leader', 'pressure', 'veteran', 'atmosphere', 'instigator', 'quiet'])
const traits = (playerId: string) => {
  const hidden = hiddenById.get(playerId)
  const values = [hidden?.social_primary, hidden?.social_secondary, hidden?.personality_type].filter(Boolean)
  if (playerId === 'P132') values.push('团长型')
  return new Set(values)
}
const hasTrait = (playerId: string, trait: string) => traits(playerId).has(trait)
const nameOf = (playerId: string) => publicById.get(playerId)?.name ?? playerId
const choice = (id: BossDecisionChoiceId, label: string): BossDecisionChoice => ({ id, label })
const pick = <T,>(values: T[], random: () => number): T | undefined => values[Math.floor(random() * values.length)]
const variantCopy = <T,>(variant: number, values: T[]): T => values[variant % values.length]
const percentageRoll = (random: () => number, chances: number[]) => {
  const roll = random() * 100
  let total = 0
  for (let index = 0; index < chances.length; index += 1) {
    total += chances[index]
    if (roll < total) return index
  }
  return chances.length - 1
}

function throughputTarget(lastCombat: CombatResult, team: TeamMember[]): string | undefined {
  if (lastCombat.responsible && team.some((member) => member.id === lastCombat.responsible)) return lastCombat.responsible
  const meters = lastCombat.meters ?? []
  const eligible = meters.map((meter) => {
    const value = meter.role === '治疗' ? meter.hps : meter.role.includes('DPS') ? meter.dps : 0
    return { id: meter.playerId, role: meter.role === '治疗' ? '治疗' : '输出', value }
  }).filter((entry) => entry.value > 0)
  const candidates = eligible.filter((entry) => {
    const peers = eligible.filter((peer) => peer.role === entry.role).map((peer) => peer.value).sort((a, b) => a - b)
    if (peers.length < 2) return false
    const median = peers[Math.floor(peers.length / 2)]
    return entry.value <= median * .85
  }).sort((left, right) => left.value - right.value)
  return candidates[0]?.id
}

function lowestDpsTarget(lastCombat: CombatResult): string | undefined {
  return (lastCombat.meters ?? [])
    .filter((meter) => meter.role.includes('DPS') && meter.dps > 0)
    .sort((left, right) => left.dps - right.dps)[0]?.playerId
}

function topDpsIds(lastCombat: CombatResult): Set<string> {
  return new Set((lastCombat.meters ?? [])
    .filter((meter) => meter.role.includes('DPS'))
    .sort((left, right) => right.dps - left.dps)
    .slice(0, 2)
    .map((meter) => meter.playerId))
}

function buildDecision(id: BossDecisionEventId, actorId: string, boss: Boss, variant: number, targetId?: string, resultTargetId?: string): BossDecision {
  const actor = nameOf(actorId)
  const target = targetId ? nameOf(targetId) : ''
  const copy = <T,>(values: T[]) => variantCopy(variant, values)
  if (id === 'bug') return {
    id, trigger: 'wipe', actorId, bossId: boss.boss_id, copyVariant: variant, kicker: 'UNSTABLE STRATEGY · BUG 打法',
    title: copy(['要不要钻这个空子？', '卡墙打法靠谱吗？', '视频里的BUG点']),
    prompt: copy([
      `${actor}突然说自己找到了一套不同于当前战术的BUG打法，并在地上重新标出了站位。`,
      `${actor}在跑尸途中重新标记了墙角，表示只要全团贴紧就能按另一套流程处理。`,
      `${actor}往团队频道发来一段视频，画面中的队伍全部站在一个不起眼的角落。`,
    ]),
    quote: copy([
      `${actor}：“我看视频里就是站这里，Boss技能会卡掉。要不要试一次？”`,
      `${actor}：“都贴这面墙，模型卡进去以后别乱动，我见别人这么打过。”`,
      `${actor}：“视频上就是这么打的，我发群里了，照着站就行。”`,
    ]),
    choices: [
      choice('accept', copy(['采纳 BUG 打法', '全团贴墙试一次', '照视频站位'])),
      choice('decline', copy(['按原打法继续', '清掉标记正常打', '继续执行原战术'])),
    ],
  }
  if (id === 'leader') return {
    id, trigger: 'wipe', actorId, bossId: boss.boss_id, copyVariant: variant, kicker: 'RAID LEADERSHIP · 背水一战',
    title: copy(['下一把该怎么动员？', '还要不要继续压？', '团长准备最后动员']),
    prompt: copy([
      `${actor}准备在下一次开怪前说几句。团队已经见过 Boss的全部流程，语音里却逐渐安静下来。`,
      `跑尸的人陆续回到门口，${actor}看了一眼战斗时间线，准备重新统一下一把的节奏。`,
      `药水和修理费都消耗了不少，${actor}让所有人在门口停一下，开怪前再听一次指挥。`,
    ]),
    quote: copy([
      `${actor}清了清嗓子，示意所有人先别急着开怪。`,
      `${actor}：“都先回来，把每个人要干的事再说一遍。”`,
      `${actor}：“最后确认一次任务，听完这几句我们就开。”`,
    ]),
    choices: [
      choice('steady', copy(['沉稳复盘', '把任务再讲一遍', '先稳住执行'])),
      choice('fiery', copy(['热血鼓舞', '输出别停，狠狠干', '把气势拉满'])),
    ],
  }
  if (id === 'pressure') return {
    id, trigger: 'wipe', actorId, targetId, bossId: boss.boss_id, copyVariant: variant, kicker: 'PUBLIC PRESSURE · 公开施压',
    title: copy([`要怎么点操${target}？`, '我TM让你来红叉儿！', '刚才那波谁在划水？']),
    prompt: copy([
      `${actor}打开战斗记录，准备点名上一把表现不佳的${target}。`,
      `红叉位置的机制迟迟无人处理，${actor}准备点操之前犯错的${target}。`,
      `${actor}把上一把的统计和死亡记录贴进团队频道，${target}的名字正好出现在最显眼的位置。`,
    ]),
    quote: copy([
      `${actor}：“刚才的问题已经很明显了，下一把总得做出调整吧。”`,
      `${actor}：“我TM让你来红叉儿，这是不是你的任务？”`,
      `${actor}：“数据都贴出来了，别装没看见，刚才那波谁的问题？”`,
    ]),
    choices: [
      choice('mild', copy(['点到为止', '赶紧去红叉', '先提醒他调整'])),
      choice('provoke', copy(['当众激将', '我就不去', '开麦追问到底'])),
    ],
  }
  if (id === 'veteran') return {
    id, trigger: 'wipe', actorId, bossId: boss.boss_id, copyVariant: variant, kicker: 'OLD HAND · 凭经验改打法',
    title: copy(['相信老司机的记忆吗？', '这个站位我真打过', '老攻略还能用吗？']),
    prompt: copy([
      `${actor}表示自己以前打过这个Boss，并提出重新调整几个关键站位。`,
      `${actor}在地上连续放了几个标记，声称以前的团一直按这套位置处理。`,
      `${actor}翻出一份大众软件的攻略，准备把当前分工改成里面记录的打法。`,
    ]),
    quote: copy([
      `${actor}：“以前我们都这么打，照我说的站，肯定比刚才好打。”`,
      `${actor}：“我真在这里打过，远程分两边，近战跟着我走。”`,
      `${actor}：“攻略旧是旧了点，但核心机制还是那一套。”`,
    ]),
    choices: [
      choice('detail', copy(['只采纳细节', '只调整几个标记', '参考关键时间点'])),
      choice('full', copy(['完全照他的打法', '整套站位交给他', '按老攻略重排分工'])),
    ],
  }
  if (id === 'atmosphere') return {
    id, trigger: 'wipe', actorId, bossId: boss.boss_id, copyVariant: variant, kicker: 'VOICE CHAT · 整顿 YY 气氛',
    title: copy(['让他怎么暖场？', '先把 YY 喊活', '跑尸路上别沉默']),
    prompt: copy([
      `${actor}发现YY里越来越安静，准备活跃一下这尴尬的气氛。`,
      `跑尸队伍排成一条长线，频道里只剩游戏音效，${actor}决定先找点话题。`,
      `所有人都站到了Boss面前，却没人主动说话，${actor}打开麦克风准备暖场。`,
    ]),
    quote: copy([
      `${actor}：“都说句话啊，再安静下去Boss都以为我们散了。”`,
      `${actor}：“都还活着吧？活着就吱一声，别搞得跟散团了一样。”`,
      `${actor}：“行了，刚才那把就当热身，下一把好好打。”`,
    ]),
    choices: [
      choice('show', copy(['让他整点节目', '拿上一把开个玩笑', '让他把气氛炒起来'])),
      choice('light', copy(['轻松打气', '随便聊两句', '简单鼓励大家'])),
    ],
  }
  if (id === 'data') return {
    id, trigger: 'kill', actorId, resultTargetId, bossId: boss.boss_id, copyVariant: variant, kicker: 'COMBAT LOG · 数据执着',
    title: copy(['要把统计贴出来吗？', '这次排名公开吗？', '数据窗口已经打开']),
    prompt: copy([
      `${actor}第一时间打开了伤害和治疗统计。请选择是否发到团队里。`,
      `${actor}刚看到Boss倒下，就把DPS排名整理好了。`,
      `${actor}盯着统计窗口看了半天，鼠标已经停在“发送到团队”上。`,
    ]),
    quote: copy([
      `${actor}：“这把数据挺有意思的，要不要直接贴出来？”`,
      `${actor}：“排名都出来了，发频道里大家自己看吧？”`,
      `${actor}：“我这数据不得展示出来秀一秀？”`,
    ]),
    choices: [choice('publish', '公开排名'), choice('private', '不公开')],
  }
  if (id === 'celebration') return {
    id, trigger: 'kill', actorId, bossId: boss.boss_id, copyVariant: variant, kicker: 'VICTORY VOICE · 击杀庆祝',
    title: copy(['顺风顺水，庆祝一下？', 'YY里要不要放首歌？', '这波连胜值得庆祝']),
    prompt: copy([
      `${actor}提议在YY里放首歌庆祝。`,
      `最近Boss都一次通过，${actor}准备放个歌庆祝下`,
      `${actor}觉得团队状态正好，想趁拍卖前把气氛再拉高一点。`,
    ]),
    quote: copy([
      `${actor}：“今天有点顺啊，放首歌不过分吧？”`,
      `${actor}：“这不得来首庆功曲？后面继续平推。”`,
      `${actor}：“都别走神啊，先庆祝一分钟，拍完继续打。”`,
    ]),
    choices: [choice('celebrate', '放开庆祝'), choice('skip', '先别放歌')],
  }
  if (id === 'macro') return {
    id, trigger: 'kill', actorId, bossId: boss.boss_id, copyVariant: variant, kicker: 'SHARED MACRO · 祖传宏',
    title: copy(['这套宏要全团装吗？', '祖传宏真有这么好用？', '要不要统一换宏？']),
    prompt: copy([
      `${actor}表示自己刚才全靠一套祖传宏，并提议发给全团使用。`,
      `${actor}把新改好的宏贴进频道，声称装上以后输出和技能都能一起处理。`,
      `${actor}认为这歌输出靠的不是手法，而是一套最新款的一键宏。`,
    ]),
    quote: copy([
      `${actor}：“我刚才就靠这套宏，大家都装上下一个Boss更顺。”`,
      `${actor}：“宏我发团队了，复制、保存、拖上技能栏肯定就能用。”`,
      `${actor}：“别一个个配了，全部照我这套按，肯定不会漏技能。”`,
    ]),
    choices: [choice('install', '让大家都装上'), choice('keep', '让他自己留着')],
  }
  if (id === 'quiet') return {
    id, trigger: 'wipe', actorId, bossId: boss.boss_id, copyVariant: variant, kicker: 'OPEN MIC · 突然开口',
    title: copy(['他居然开麦了？', '一直不开麦的人说话了', 'YY里出现了陌生声音']),
    prompt: copy([
      `一直不开麦的${actor}突然在YY里说了一句话，全团都惊呆了。`,
      `跑尸时，一个平时从不开麦的声音突然开始复盘，大家半天才认出是${actor}。`,
      `${actor}第一次主动按下说话键，频道里瞬间安静下来。`,
    ]),
    quote: copy([
      `${actor}：“其实刚才那个技能，我可以帮忙报。”`,
      `${actor}：“你们能听见吧？下一把关键点我来说。”`,
      `${actor}：“我麦没坏，就是平时不想说话。”`,
    ]),
    choices: [choice('speak', '让他说两句'), choice('callout', '让他报关键技能')],
  }
  return {
    id, trigger: 'wipe', actorId, bossId: boss.boss_id, copyVariant: variant, kicker: 'PROVOCATION · 把话题挑起来',
    title: copy(['要不要把争议说开？', '这个锅现在分吗？', '再拱一把火？']),
    prompt: copy([
      `${actor}突然重新提起刚才的责任争议，YY里的气氛再次微妙起来。`,
      `${actor}把灭团记录重新发进频道，坚持要在下一把开始前分清刚才的责任。`,
      `${actor}见所有人都不说话，故意点了几个人的名字，准备把争论重新挑起来。`,
    ]),
    quote: copy([
      `${actor}：“所以刚才那波到底是谁的问题？现在不说，下一把还得再来一次。”`,
      `${actor}：“先别急着开，刚才那个锅总得有人认吧？”`,
      `${actor}：“都觉得自己没问题是吧？那下一把我看看谁是内鬼。”`,
    ]),
    choices: [
      choice('talk', copy(['让大家把话说开', '现在把责任说清楚', '先复盘再开怪'])),
      choice('compete', copy(['顺势激起胜负心', '让下一把见真章', '让他们场上分高下'])),
    ],
  }
}

export function selectBossDecision(args: {
  seed: string
  boss: Boss
  attempt: number
  team: TeamMember[]
  morale: number
  lastCombat: CombatResult
  usage: BossDecisionUsage
  zeroWipeKillStreak?: boolean
}): BossDecision | undefined {
  const { seed, boss, attempt, team, morale, lastCombat, usage, zeroWipeKillStreak = false } = args
  if (lastCombat.leaver || (!lastCombat.killed && attempt >= 5)) return undefined
  const targetId = throughputTarget(lastCombat, team)
  const resultTargetId = lowestDpsTarget(lastCombat)
  const dpsLeaders = topDpsIds(lastCombat)
  const pool = lastCombat.killed ? killEvents : wipeEvents
  const actorEligible = (member: TeamMember, id: BossDecisionEventId) => {
    if (!hasTrait(member.id, eventTrait[id])) return false
    if (id === 'data' && !dpsLeaders.has(member.id)) return false
    if (id === 'macro' && !dpsLeaders.has(member.id)) return false
    if (id === 'pressure' && member.id === targetId) return false
    return true
  }
  const eligible = [...pool].filter((id) => {
    if (runOnce.has(id) && usage.run.includes(id)) return false
    if (!runOnce.has(id) && (usage.boss[boss.boss_id] ?? []).includes(id)) return false
    if (!team.some((member) => actorEligible(member, id))) return false
    if (id === 'leader' && morale >= 60 && lastCombat.remainingHp >= 20) return false
    if ((id === 'atmosphere' || id === 'quiet') && morale >= 70) return false
    if ((id === 'pressure' || id === 'instigator') && !targetId) return false
    if (id === 'celebration' && !zeroWipeKillStreak) return false
    if (id === 'data' && !resultTargetId) return false
    return rngFor(seed, boss.boss_id, attempt, id, 'decision-trigger')() < eventChance[id]
  })
  if (!eligible.length) return undefined
  const id = pick(eligible, rngFor(seed, boss.boss_id, attempt, 'decision-pick'))!
  const actors = team.filter((member) => actorEligible(member, id))
  const actor = pick(actors, rngFor(seed, boss.boss_id, attempt, id, 'decision-actor'))
  if (!actor) return undefined
  const copyVariant = Math.floor(rngFor(seed, boss.boss_id, attempt, id, actor.id, 'decision-copy')() * 3)
  return buildDecision(id, actor.id, boss, copyVariant, id === 'pressure' ? targetId : undefined, id === 'data' ? resultTargetId : undefined)
}

function mediatorResult(seed: string, decision: BossDecision, outcome: 'reply' | 'leave' | 'negative', team: TeamMember[]) {
  const mediators = team.filter((member) => member.id !== decision.actorId && member.id !== decision.targetId && hasTrait(member.id, '调解者'))
  if (!mediators.length) return { level: 'none' as const }
  const random = rngFor(seed, decision.bossId, decision.id, decision.actorId, decision.targetId ?? '', 'mediator')
  if (random() >= .6) return { level: 'none' as const }
  const mediator = pick(mediators, random)!
  const roll = percentageRoll(random, [60, 30, 10])
  return { level: roll === 0 ? 'full' as const : roll === 1 ? 'partial' as const : 'failed' as const, name: nameOf(mediator.id), outcome }
}

function pressureChances(targetId: string) {
  const targetTraits = traits(targetId)
  let chances = [45, 25, 20, 10]
  if (targetTraits.has('玻璃心')) chances = [chances[0] - 15, chances[1] + 5, chances[2], chances[3] + 10]
  if (targetTraits.has('自信型')) chances = [chances[0] + 15, chances[1] - 10, chances[2], chances[3] - 5]
  if (targetTraits.has('嘴硬型')) chances = [chances[0] - 5, chances[1] - 10, chances[2] + 15, chances[3]]
  if (targetTraits.has('责任型') || targetTraits.has('数据执着')) chances = [chances[0] + 8, chances[1] - 5, chances[2], chances[3] - 3]
  if (targetTraits.has('小白型') || targetTraits.has('不开麦')) chances = [chances[0] - 5, chances[1] + 8, chances[2], chances[3] - 3]
  const positive = chances.map((value) => Math.max(0, value))
  const total = positive.reduce((sum, value) => sum + value, 0)
  return positive.map((value) => value / total * 100)
}

function resolveBossDecisionBase(seed: string, decision: BossDecision, choiceId: BossDecisionChoiceId, team: TeamMember[]): BossDecisionResolution {
  const random = rngFor(seed, decision.bossId, decision.id, decision.actorId, decision.targetId ?? '', choiceId, 'decision-outcome')
  const actor = nameOf(decision.actorId)
  const targetId = decision.targetId ?? ''
  const target = targetId ? nameOf(targetId) : ''
  const personal = (mechanics: number, multiplier = 1): CombatModifiers => ({
    playerMechanics: { [targetId]: mechanics },
    playerOutputMultiplier: { [targetId]: multiplier },
    playerHealingMultiplier: { [targetId]: multiplier },
  })

  if (decision.id === 'bug') {
    if (choiceId === 'decline') return { action: 'close', tag: '按兵不动', headline: '团队决定不拿账号冒险', detail: `${actor}嘀咕了两句，还是把安全点位标记收了回去。下一把继续按原打法。` }
    const outcome = percentageRoll(random, [50, 25, 20, 5])
    if (outcome === 0) return { action: 'kill', tag: 'BUG 生效', headline: 'Boss真的变成了木桩', detail: '这套打法居然真的生效了，Boss像个木桩一样傻站着。YY里不断传来压低声音的“卧槽，牛逼”。' }
    if (outcome === 1) return { action: 'fight', tag: '没有效果', headline: 'Boss完全不吃这一套', detail: '这个打法似乎没什么效果，Boss正常释放技能，全团也只好正常应对。' }
    if (outcome === 2) return { action: 'wipe', responsibleId: decision.actorId, moraleDelta: -8, tag: 'BUG翻车', headline: '安全点里吃满了整套技能', detail: `所有人按照所谓的安全位置站好，Boss转身朝墙角放出了整套技能。${actor}憋了半天憋出一句：“不对啊，视频里不是这样的。”` }
    return { action: 'tech-ending', tag: '账号冻结', headline: '科技团覆灭', detail: 'Boss倒下后几分钟，团队成员开始陆续掉线。聊天框里只剩下一排账号冻结通知。' }
  }

  if (decision.id === 'leader') {
    if (choiceId === 'steady') {
      return random() < .5
        ? { action: 'close', tag: '复盘有效', headline: '每个人都重新确认了自己的任务', detail: `${actor}把刚才的问题重新梳理了一遍：“打法没问题，下一把不犯错就能过。”`, modifiers: { teamMechanics: 8 } }
        : { action: 'close', tag: '置若罔闻', headline: '有人听了，也有人早切出去了', detail: '复盘说得很完整，但团队里只有几声敷衍的1，下一把似乎没有变化。' }
    }
    return random() < .5
      ? { action: 'close', tag: '鼓舞成功', headline: '下一把直接把它拿下', detail: `${actor}提高声音：“药水、爆发、减伤全部准备好！”团队的注意力重新集中起来。`, moraleDelta: 10, modifiers: { teamOutputMultiplier: 1.1, teamHealingMultiplier: 1.1 } }
      : { action: 'close', tag: '情绪过热', headline: '所有人都想证明自己', detail: '输出欲望被彻底点燃，但有人已经开始只盯着自己的技能循环。', modifiers: { teamOutputMultiplier: 1.15, teamMechanics: -12 } }
  }

  if (decision.id === 'pressure') {
    if (choiceId === 'mild') {
      const outcome = percentageRoll(random, [65, 25, 10])
      if (outcome === 0) return { action: 'close', tag: '认真调整', headline: `${target}把问题记了下来`, detail: `${actor}点到为止，${target}重新检查了技能和站位。`, modifiers: personal(10, 1.05) }
      if (outcome === 1) return { action: 'close', tag: '没受影响', headline: '这次点名没有改变什么', detail: `${target}应了一声，表现没有出现明显变化。` }
      return { action: 'close', tag: '心理紧张', headline: `${target}开始反复确认每个指令`, detail: '注意力被“别再犯错”占满，反而更难自然处理机制。', modifiers: personal(-6) }
    }
    const outcome = percentageRoll(random, pressureChances(targetId))
    if (outcome === 0) return { action: 'close', tag: '爆种', headline: `${target}被激出了状态`, detail: `被当众点名后，${target}没有争辩，只在下一把前回了一句：“看数据。”`, modifiers: personal(20, 1.15) }
    if (outcome === 1) return { action: 'close', tag: '发挥失常', headline: `${target}的操作开始变形`, detail: '越想证明自己，手上的节奏越乱。', modifiers: personal(-8, .95) }
    if (outcome === 2) {
      const base: BossDecisionOutcomeStage = { action: 'close', tag: '当场回喷', headline: `${target}直接把话顶了回去`, detail: `${target}：“你这么会看数据，那你自己来打。”YY里的气氛瞬间降到冰点。`, moraleDelta: -10 }
      const mediation = mediatorResult(seed, decision, 'reply', team)
      if (mediation.level === 'full') return { action: 'close', tag: '冲突被压住', headline: `${mediation.name}及时截断了争吵`, detail: `${mediation.name}把话题拉回 Boss，双方没有继续增加退团风险。`, preMediation: base, mediationLevel: 'full', mediationName: mediation.name }
      if (mediation.level === 'partial') return { action: 'close', tag: '部分缓和', headline: `${mediation.name}勉强把双方劝开`, detail: '火药味还在，但至少没有继续互喷。', moraleDelta: -5, preMediation: base, mediationLevel: 'partial', mediationName: mediation.name }
      return { ...base, action: 'close' }
    }
    const base: BossDecisionOutcomeStage = { action: 'leave', leaverId: targetId, responsibleId: decision.actorId, tag: '心态崩溃', headline: `${target}直接退出了团队`, detail: `${actor}的话音刚落，团队框里就空出了一个位置。` }
    const mediation = mediatorResult(seed, decision, 'leave', team)
    if (mediation.level === 'full') return { action: 'close', tag: '冲突被压住', headline: `${mediation.name}把人留了下来`, detail: `${target}没有退团，双方先把这件事放到Boss之后再说。`, preMediation: base, mediationLevel: 'full', mediationName: mediation.name }
    if (mediation.level === 'partial') return { action: 'close', tag: '勉强留下', headline: `${target}暂时没有点退出`, detail: '人留在团里，心态却还没有完全恢复。', modifiers: { ...personal(-6), leaveRateBonus: 10 }, preMediation: base, mediationLevel: 'partial', mediationName: mediation.name }
    return { ...base, action: 'leave' }
  }

  if (decision.id === 'veteran') {
    if (choiceId === 'detail') {
      const outcome = percentageRoll(random, [70, 20, 10])
      if (outcome === 0) return { action: 'close', tag: '经验有效', headline: '关键时间点被重新标了出来', detail: `${actor}没有推翻原打法，只补充了几处关键提醒。`, modifiers: { teamMechanics: 8 } }
      if (outcome === 1) return { action: 'close', tag: '帮助有限', headline: '至少比刚才更清楚一点', detail: '几条提醒有用，但不足以彻底改变战局。', modifiers: { teamMechanics: 4 } }
      return { action: 'close', tag: '记忆偏差', headline: '有个时间点似乎说反了', detail: '团队重新讨论了一遍，还是留下了一点错误记忆。', modifiers: { teamMechanics: -5 } }
    }
    const outcome = percentageRoll(random, [60, 30, 10])
    if (outcome === 0) return { action: 'close', tag: '打法更优', headline: '整套站位意外地顺手', detail: `${actor}接过指挥，新的分工确实更适合当前阵容。`, modifiers: { teamMechanics: 15, teamOutputMultiplier: 1.08, teamHealingMultiplier: 1.08 } }
    if (outcome === 1) return { action: 'close', tag: '旧版本记忆', headline: 'Boss的技能早就改过了', detail: '重新站位以后，几处关键机制反而更难处理。', modifiers: { teamMechanics: -8 } }
    return { action: 'wipe', responsibleId: decision.actorId, moraleDelta: -8, tag: '记错 Boss', headline: '安全区里一个人都没有', detail: `全团按${actor}的要求重新站好，技能落下后安全区里一个人都没有。${actor}沉默几秒：“等会，我好像记成另一个Boss了。”` }
  }

  if (decision.id === 'atmosphere') {
    if (choiceId === 'light') {
      return random() < .75
        ? { action: 'close', tag: '气氛缓和', headline: 'YY里终于重新有人接话', detail: `${actor}：“这Boss就这几个技能，再来一把说不定它自己先扛不住了。”`, moraleDelta: 7, modifiers: { teamMechanics: 4 } }
        : { action: 'close', tag: '效果一般', headline: '至少没有继续沉默', detail: '只有几个人笑了一声，但团队情绪稍微松动了一点。', moraleDelta: 3 }
    }
    const outcome = percentageRoll(random, [60, 25, 15])
    if (outcome === 0) return { action: 'close', tag: '气氛回暖', headline: '上一把终于成了一个笑话', detail: `${actor}模仿了刚才团灭时的愚蠢操作，YY 里终于有人笑出了声。`, moraleDelta: 10, modifiers: { teamMechanics: 8, teamOutputMultiplier: 1.08, teamHealingMultiplier: 1.08 } }
    if (outcome === 1) return { action: 'close', tag: '全团笑场', headline: '气氛是好了，专注也散了', detail: '所有人都憋着笑等开怪，技能按得更快，机制却未必看得更清楚。', moraleDelta: 7, modifiers: { teamMechanics: -8, teamOutputMultiplier: 1.08, teamHealingMultiplier: 1.08 } }
    return { action: 'close', tag: '玩笑过头', headline: '被模仿的人没有笑', detail: 'YY陷入了更深的尬尴。', moraleDelta: -8, modifiers: { teamMechanics: -5 } }
  }

  if (decision.id === 'data') {
    if (choiceId === 'private') return { action: 'close', effectScope: 'next-boss', tag: '留在本地', headline: '统计窗口被悄悄关掉', detail: `${actor}最终没有把排名发出来，团队直接进入拍卖。` }
    const outcome = percentageRoll(random, [45, 35, 20])
    if (outcome === 0) return { action: 'close', effectScope: 'next-boss', tag: '全团较劲', headline: '排名把所有人的胜负心都点着了', detail: '下一个Boss还没开，已经有人开始摩拳擦掌了。', modifiers: { teamOutputMultiplier: 1.05, teamHealingMultiplier: 1.05 } }
    if (outcome === 1) return { action: 'close', effectScope: 'next-boss', tag: '有人不服', headline: '统计刚贴出来，频道里就开始争论', detail: '有人认为一个破BOSS牛逼个什么，庆祝气氛迅速降温。', moraleDelta: -5 }
    const weakestId = decision.resultTargetId
    const weakestName = weakestId ? nameOf(weakestId) : '排名靠后的成员'
    return {
      action: 'close',
      effectScope: 'next-boss',
      tag: '发现划水',
      headline: `${weakestName}被公开点名后认真起来`,
      detail: `${actor}没有继续追问，只让${weakestName}下一个Boss用表现说话。`,
      modifiers: weakestId ? { playerMechanics: { [weakestId]: 10 } } : undefined,
    }
  }

  if (decision.id === 'celebration') {
    if (choiceId === 'skip') return { action: 'close', effectScope: 'next-boss', tag: '继续推进', headline: '音乐没有放，拍卖照常开始', detail: `${actor}收起播放列表，让大家先把下一个Boss处理好。` }
    return random() < .6
      ? { action: 'close', effectScope: 'next-boss', tag: '庆祝成功', headline: 'YY里终于有了连胜的气氛', detail: '歌刚放起来就有人跟着接话，兴奋一直延续到下一个Boss。', moraleDelta: 8 }
      : { action: 'close', effectScope: 'next-boss', tag: '选曲翻车', headline: '歌放得太二逼，所有人都沉默了', detail: `${actor}硬撑着放了半分钟，最后还是自己把音乐关掉。`, moraleDelta: -4 }
  }

  if (decision.id === 'macro') {
    if (choiceId === 'keep') return { action: 'close', effectScope: 'next-boss', tag: '维持原样', headline: '全团没有改动自己的技能栏', detail: `团长让${actor}继续自己用，其他人保持原来的按键和宏。` }
    const outcome = percentageRoll(random, [50, 42, 8])
    if (outcome === 0) return { action: 'close', effectScope: 'next-boss', tag: '确实好用', headline: '这套宏意外地适合全团', detail: '关键技能和常用爆发都被重新整理，下一个Boss的执行明显更顺。', modifiers: { teamMechanics: 8, teamOutputMultiplier: 1.08 } }
    if (outcome === 1) return { action: 'close', effectScope: 'next-boss', tag: '宏不好用', headline: '每个人的技能节奏都被打乱了', detail: '复制来的宏和原本按键互相冲突，输出和治疗循环全都变得别扭。', modifiers: { teamOutputMultiplier: .9, teamHealingMultiplier: .9 } }
    return { action: 'close', effectScope: 'next-boss', tag: '宏崩溃', headline: '全团的技能栏埋下了同一个故障', detail: '宏里有一段错误指令，下一次开怪时所有人都会发现自己按不出技能。', forceNextAttemptWipe: true, responsibleId: decision.actorId }
  }

  if (decision.id === 'quiet') {
    if (choiceId === 'callout') {
      return random() < .9
        ? { action: 'close', effectScope: 'current-boss', tag: '报点清楚', headline: '下一把终于有人稳定报关键技能', detail: `${actor}把几个关键时间点写在屏幕旁，准备逐个报给全团。`, modifiers: { teamMechanics: 12 } }
        : { action: 'close', effectScope: 'current-boss', tag: '麦又没了', headline: '全团等着报点，却只等到一片安静', detail: `${actor}开怪后才发现语音键没有生效，所有人仍按旧节奏处理。`, modifiers: { teamMechanics: -12 } }
    }
    const outcome = percentageRoll(random, [50, 40, 10])
    if (outcome === 0) return { action: 'close', effectScope: 'current-boss', tag: '士气大振', headline: '这次开麦比任何鼓舞都管用', detail: `${actor}认真说完自己的观察，YY里立刻有人接话，团队重新集中起来。`, moraleDelta: 20, modifiers: { teamMechanics: 8 } }
    if (outcome === 1) return { action: 'close', effectScope: 'current-boss', tag: '士气小振', headline: '频道里终于不再死气沉沉', detail: `${actor}只说了几句，但足以让大家觉得下一把还有希望。`, moraleDelta: 12 }
    return { action: 'close', effectScope: 'current-boss', tag: '开口喷人', headline: '第一句话就把队友喷傻了', detail: `${actor}沉默了一整晚，开口却直接把上一把所有失误挨个点了一遍。`, moraleDelta: -20 }
  }

  if (choiceId === 'talk') {
    const outcome = percentageRoll(random, [50, 30, 20])
    if (outcome === 0) return { action: 'close', tag: '问题说开', headline: '争议变成了一次有效复盘', detail: '责任和分工都说清楚以后，团队反而重新找回了秩序。', moraleDelta: 5, modifiers: { teamMechanics: 6 } }
    const mediation = mediatorResult(seed, decision, 'negative', team)
    const base = outcome === 1
      ? { morale: -8, mechanics: -5, headline: '复盘变成了互相甩锅', detail: '每个人都能从战斗记录里找出对自己有利的一段。' }
      : { morale: -4, output: .97, healing: .97, headline: '问题没说清，火气倒说出来了', detail: '下一把还没开始，团队已经先消耗了一轮注意力。' }
    const baseResolution: BossDecisionOutcomeStage = { action: 'close', tag: '争论升级', headline: base.headline, detail: base.detail, moraleDelta: base.morale, modifiers: { teamMechanics: base.mechanics, teamOutputMultiplier: base.output, teamHealingMultiplier: base.healing } }
    if (mediation.level === 'full') return { action: 'close', tag: '冲突被压住', headline: `${mediation.name}把话题拉回了Boss`, detail: '这次负面效果被及时取消。', preMediation: baseResolution, mediationLevel: 'full', mediationName: mediation.name }
    const scale = mediation.level === 'partial' ? .5 : 1
    return { action: 'close', tag: mediation.level === 'partial' ? '部分缓和' : '争论升级', headline: base.headline, detail: base.detail, moraleDelta: base.morale * scale, modifiers: { teamMechanics: (base.mechanics ?? 0) * scale, teamOutputMultiplier: 1 + ((base.output ?? 1) - 1) * scale, teamHealingMultiplier: 1 + ((base.healing ?? 1) - 1) * scale }, ...(mediation.level === 'partial' ? { preMediation: baseResolution, mediationLevel: 'partial' as const, mediationName: mediation.name } : {}) }
  }

  const outcome = percentageRoll(random, [35, 35, 30])
  if (outcome === 0) return { action: 'close', tag: '胜负心拉满', headline: '全团都想在下一把证明自己', detail: '火药味变成了执行力，至少这一刻所有人都盯住了 Boss。', moraleDelta: 6, modifiers: { teamMechanics: 3, teamOutputMultiplier: 1.08, teamHealingMultiplier: 1.08 } }
  if (outcome === 1) return { action: 'close', tag: '全员上头', headline: '每个人都憋着证明自己', detail: '输出和治疗会更卖力，但关键机制可能没人愿意先让一步。', modifiers: { teamMechanics: -8, teamOutputMultiplier: 1.1, teamHealingMultiplier: 1.06 } }
  const base: BossDecisionOutcomeStage = { action: 'close', tag: '火药味失控', headline: '下一把还没开，团队先打起了内战', detail: '没人直接退团，但所有人都开始重新计算继续坐牢是否值得。', moraleDelta: -10, modifiers: { teamOutputMultiplier: .95, teamHealingMultiplier: .95, leaveRateBonus: 5 } }
  const mediation = mediatorResult(seed, decision, 'negative', team)
  if (mediation.level === 'full') return { action: 'close', tag: '冲突被压住', headline: `${mediation.name}让所有人先闭麦十秒`, detail: '火药味没有继续蔓延，本次负面效果被取消。', preMediation: base, mediationLevel: 'full', mediationName: mediation.name }
  const scale = mediation.level === 'partial' ? .5 : 1
  return { action: 'close', tag: mediation.level === 'partial' ? '部分缓和' : '火药味失控', headline: base.headline, detail: base.detail, moraleDelta: -10 * scale, modifiers: { teamOutputMultiplier: 1 - .05 * scale, teamHealingMultiplier: 1 - .05 * scale, leaveRateBonus: 5 * scale }, ...(mediation.level === 'partial' ? { preMediation: base, mediationLevel: 'partial' as const, mediationName: mediation.name } : {}) }
}

function applyResolutionCopy(seed: string, decision: BossDecision, choiceId: BossDecisionChoiceId, resolution: BossDecisionResolution): BossDecisionResolution {
  const variant = decision.copyVariant ?? 0
  const actor = nameOf(decision.actorId)
  const target = decision.targetId ? nameOf(decision.targetId) : ''
  let lead = ''

  if (decision.id === 'bug') {
    if (variant === 1) lead = choiceId === 'accept'
      ? `${actor}让所有人挤进墙角，反复确认谁都没有露在标记外。`
      : `${actor}删掉了墙角标记，团队重新站回原来的位置。`
    if (variant === 2) lead = choiceId === 'accept'
      ? `全团暂停跑位，对照${actor}发来的短视频重新站了一遍。`
      : `团长关掉了视频链接，让所有人只看当前版本的战术标记。`
  }

  if (decision.id === 'leader') {
    if (choiceId === 'fiery') {
      const lines = [
        `别停手！继续压输出！机制照做，能打多少打多少！`,
        `输出别停！继续打！狠狠地打！`,
      ]
      const line = pick(lines, rngFor(seed, decision.bossId, decision.actorId, variant, 'leader-fiery-line')) ?? lines[0]
      lead = `${actor}突然提高声音：“${line}”`
    } else if (variant === 1) {
      lead = `${actor}从开场点名到斩杀阶段重新梳理了一遍，最后让每个人报出自己的任务。`
    } else if (variant === 2) {
      lead = `${actor}没有催着开怪，而是按时间轴逐个确认减伤、打断和站位。`
    }
  }

  if (decision.id === 'pressure') {
    if (variant === 1) {
      lead = choiceId === 'mild'
        ? `${actor}在语音里喊道：“我TM让你来红叉儿！红叉儿！你听不懂吗？”${target}没有继续解释，立刻停下输出：“来了来了，我现在就去。”`
        : `${actor}在语音里怒吼：“我TM让你来红叉儿！”${target}直接回道：“团长让我站紫菱，红叉又不是我的任务。”${actor}追问：“现在红叉没人，我问你来不来？”${target}回答：“我就不去。”`
    } else if (variant === 2) {
      lead = choiceId === 'mild'
        ? `${actor}把记录贴出来后只补了一句：“名字我不重复念了，下一把自己调整。”`
        : `${actor}直接开麦追问${target}：“记录在这儿，你现在告诉我刚才在干什么？”`
    }
  }

  if (decision.id === 'veteran') {
    if (variant === 1) lead = choiceId === 'detail'
      ? `团长保留原战术，只让${actor}移动了几个关键标记。`
      : `${actor}接过标记权限，从门口开始重新安排全团位置。`
    if (variant === 2) lead = choiceId === 'detail'
      ? `大家只从老攻略里抄下了几个技能时间点，没有改动原本分工。`
      : `原来的战术标记被全部清除，团队按${actor}收藏的攻略重新排了一遍。`
  }

  if (decision.id === 'atmosphere') {
    if (variant === 1) lead = choiceId === 'show'
      ? `${actor}把上一把最离谱的失误从头到尾模仿了一遍。`
      : `${actor}在跑尸路上随口聊起下一把打完吃什么。`
    if (variant === 2) lead = choiceId === 'show'
      ? `${actor}让几个人轮流复述刚才的灭团现场，频道里终于有了声音。`
      : `${actor}只说了句“都还在就行”，随后提醒大家修装备和补药。`
  }

  if (decision.id === 'instigator') {
    if (variant === 1) lead = choiceId === 'talk'
      ? `${actor}把灭团记录钉在频道里，让相关的人按顺序把刚才的情况说清楚。`
      : `${actor}打断争论：“谁都别解释，下一把打完再看谁有资格说话。”`
    if (variant === 2) lead = choiceId === 'talk'
      ? `${actor}把刚才几个人的说法逐条复述出来，逼着相关的人把责任讲清楚。`
      : `${actor}挨个点名：“都别装没听见，下一把场上见真章。”`
  }

  if (decision.id === 'data') {
    if (variant === 1) lead = choiceId === 'publish'
      ? `${actor}把伤害、治疗和死亡次数一起发进团队频道，没有附加任何评价。`
      : `${actor}截完图又删掉了输入框里的链接，只把窗口留在自己屏幕上。`
    if (variant === 2) lead = choiceId === 'publish'
      ? `${actor}从第一名开始逐行贴出统计，频道里很快出现了几句“职业差距”。`
      : `团长让${actor}先别公开排名，等下一个Boss打完再统一复盘。`
  }

  if (decision.id === 'celebration') {
    if (variant === 1) lead = choiceId === 'celebrate'
      ? `${actor}把音乐推子拉高，连拍卖倒数都踩在了节拍上。`
      : `${actor}刚点开播放列表就被团长叫停，大家继续分装备。`
    if (variant === 2) lead = choiceId === 'celebrate'
      ? `${actor}喊大家在下一个Boss前先别散，YY里短暂开起了庆功会。`
      : `频道里有人催着看掉落，${actor}只好把准备好的歌留到下一次。`
  }

  if (decision.id === 'macro') {
    if (variant === 1) lead = choiceId === 'install'
      ? `${actor}逐行解释宏的用途，所有人照着重新拖了一遍技能。`
      : `团长看了一眼那串指令，决定不在连胜时临时改全团按键。`
    if (variant === 2) lead = choiceId === 'install'
      ? `宏被复制进团队频道，十个人同时开始清理原来的快捷栏。`
      : `${actor}把宏重新收回自己的收藏夹，其他人没有动原来的配置。`
  }

  if (decision.id === 'quiet') {
    if (variant === 1) lead = choiceId === 'speak'
      ? `${actor}第一次完整说完了自己看到的灭团过程，频道里没有人打断。`
      : `团长把下把最关键的两个时间点交给${actor}负责报。`
    if (variant === 2) lead = choiceId === 'speak'
      ? `大家起哄让${actor}多说几句，他只好从分工一路讲到下一把站位。`
      : `${actor}测试了三遍语音键，确认下一把报点不会再变成空气。`
  }

  return {
    ...resolution,
    summary: resolution.detail,
    detail: lead ? `${lead} ${resolution.detail}` : resolution.detail,
  }
}

export function resolveBossDecision(seed: string, decision: BossDecision, choiceId: BossDecisionChoiceId, team: TeamMember[]): BossDecisionResolution {
  const resolution = applyResolutionCopy(seed, decision, choiceId, resolveBossDecisionBase(seed, decision, choiceId, team))
  return resolution.action === 'close'
    ? { ...resolution, effectScope: decision.trigger === 'kill' ? 'next-boss' : 'current-boss' }
    : resolution
}

export function markBossDecisionUsed(usage: BossDecisionUsage, decision: BossDecision): BossDecisionUsage {
  if (runOnce.has(decision.id)) return { ...usage, run: [...new Set([...usage.run, decision.id])] }
  return {
    ...usage,
    boss: {
      ...usage.boss,
      [decision.bossId]: [...new Set([...(usage.boss[decision.bossId] ?? []), decision.id])],
    },
  }
}

export function mergeCombatModifiers(base: CombatModifiers | undefined, incoming: CombatModifiers | undefined): CombatModifiers | undefined {
  if (!incoming) return base
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  const multiplyRecords = (left: Record<string, number> = {}, right: Record<string, number> = {}) => {
    const ids = new Set([...Object.keys(left), ...Object.keys(right)])
    return Object.fromEntries([...ids].map((id) => [id, (left[id] ?? 1) * (right[id] ?? 1)]))
  }
  const addRecords = (left: Record<string, number> = {}, right: Record<string, number> = {}) => {
    const ids = new Set([...Object.keys(left), ...Object.keys(right)])
    return Object.fromEntries([...ids].map((id) => [id, (left[id] ?? 0) + (right[id] ?? 0)]))
  }
  return {
    teamMechanics: clamp((base?.teamMechanics ?? 0) + (incoming.teamMechanics ?? 0), -25, 25),
    teamOutputMultiplier: clamp((base?.teamOutputMultiplier ?? 1) * (incoming.teamOutputMultiplier ?? 1), .75, 1.3),
    teamHealingMultiplier: clamp((base?.teamHealingMultiplier ?? 1) * (incoming.teamHealingMultiplier ?? 1), .75, 1.3),
    playerMechanics: addRecords(base?.playerMechanics, incoming.playerMechanics),
    playerOutputMultiplier: multiplyRecords(base?.playerOutputMultiplier, incoming.playerOutputMultiplier),
    playerHealingMultiplier: multiplyRecords(base?.playerHealingMultiplier, incoming.playerHealingMultiplier),
    leaveRateBonus: (base?.leaveRateBonus ?? 0) + (incoming.leaveRateBonus ?? 0),
  }
}
