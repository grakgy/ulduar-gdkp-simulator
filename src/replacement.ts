import { bosses, fullPlayersPublic, gameConfig, publicById, type Boss } from './data'
import { createMember, publicSpecs, rngFor, shuffled, type TeamMember } from './engine'

export interface ReplacementPlan {
  leaverId: string
  candidateIds: string[]
  recruiterName: string
  departureNumber: number
  resume: 'prep' | 'auction'
}

export interface ReplacementDecision {
  plan?: ReplacementPlan
  endReason?: '组不到人' | '臭名昭著'
  failureText?: string
}

const batchARecruiterIds = new Set(['P092', 'P082', 'P120'])
const batchBRecruiterIds = new Set(['P083', 'P088', 'P091', 'P100', 'P096', 'P097'])
const batchCRecruiterIds = new Set(['P082', 'P092', 'P120'])
const xiYueIds = new Set(['P123', 'P124'])

function configNumber(key: string, fallback: number) {
  const value = Number(gameConfig.get(key))
  return Number.isFinite(value) ? value : fallback
}

function playerBatch(playerId: string): 'A' | 'B' | 'C' | undefined {
  const value = Number(playerId.slice(1))
  if (value >= 81 && value <= 102) return 'A'
  if (value >= 103 && value <= 120) return 'B'
  if (value >= 121 && value <= 131) return 'C'
  return undefined
}

function teamCanCoverBoss(team: TeamMember[], boss: Boss): boolean {
  if (boss.tank_mode === '载具') return true
  let states = new Set(['0,0,0'])
  for (const member of team) {
    const roles = [...new Set(publicSpecs(member.id).map((spec) => spec.role))]
    if (!roles.length) return false
    const next = new Set<string>()
    for (const state of states) {
      const [tanks, healers, damage] = state.split(',').map(Number)
      for (const role of roles) {
        const nextTanks = tanks + (role === '坦克' ? 1 : 0)
        const nextHealers = healers + (role === '治疗' ? 1 : 0)
        const nextDamage = damage + (role.includes('DPS') ? 1 : 0)
        next.add(`${nextTanks},${nextHealers},${nextDamage}`)
      }
    }
    states = next
  }
  const minTanks = Number(boss.min_tanks)
  const maxTanks = Number(boss.max_tanks)
  const minHealers = Number(boss.min_healers)
  const maxHealers = Number(boss.max_healers)
  return [...states].some((state) => {
    const [tanks, healers, damage] = state.split(',').map(Number)
    const requiredDamage = tanks > minTanks ? Math.max(Number(boss.min_dps), Number(boss.extra_tank_min_dps)) : Number(boss.min_dps)
    return tanks >= minTanks && tanks <= maxTanks && healers >= minHealers && healers <= maxHealers && damage >= requiredDamage
  })
}

export function replacementDecision(seed: string, bossId: string, attempt: number, departureNumber: number, leaverId: string, team: TeamMember[], resume: ReplacementPlan['resume']): ReplacementDecision {
  const active = team.filter((member) => !member.left)
  const usedIds = new Set(team.map((member) => member.id))
  const boss = bosses.find((entry) => entry.boss_id === bossId)
  const aRecruiters = active.filter((member) => batchARecruiterIds.has(member.id))
  const bRecruiters = active.filter((member) => batchBRecruiterIds.has(member.id))
  const cRecruiters = active.filter((member) => batchCRecruiterIds.has(member.id))
  const xiYueUsed = team.some((member) => xiYueIds.has(member.id))
  const available = fullPlayersPublic.filter((player) => !usedIds.has(player.player_id)
    && !(xiYueUsed && xiYueIds.has(player.player_id))
    && publicSpecs(player.player_id).length > 0)
  const currentBossOrder = Number(boss?.order ?? 0)
  const remainingBosses = bosses.filter((entry) => Number(entry.order) >= currentBossOrder)
  const roleCompatible = (playerId: string) => remainingBosses.every((entry) => teamCanCoverBoss([...active, createMember(playerId, seed)], entry))
  const batchA = available.filter((player) => playerBatch(player.player_id) === 'A' && roleCompatible(player.player_id))
  const batchB = available.filter((player) => playerBatch(player.player_id) === 'B' && roleCompatible(player.player_id))
  const batchC = available.filter((player) => playerBatch(player.player_id) === 'C' && roleCompatible(player.player_id))
  const recruiterNames = [...new Set([...aRecruiters, ...bRecruiters, ...cRecruiters].map((member) => publicById.get(member.id)?.name ?? member.id))]
  const activeChannelCount = [aRecruiters, bRecruiters, cRecruiters].filter((recruiters) => recruiters.length > 0).length

  if (departureNumber >= 5) {
    const endReason = activeChannelCount >= 2 ? '臭名昭著' : '组不到人'
    const failureText = activeChannelCount >= 2
      ? '能问的人脉都已经问遍。江湖上传言进此团等于坐牢，团长此后再也难以组到人了。'
      : `${recruiterNames[0] ?? '团长'}继续尝试联系替补，但本局第五次退团后已经没人愿意进组。`
    return { endReason, failureText }
  }

  const defaultChances = [90, 75, 60, 50]
  const chance = configNumber(`replacement_success_pct_${departureNumber}`, defaultChances[departureNumber - 1] ?? 0) / 100
  const aSucceeded = aRecruiters.length > 0 && batchA.length > 0 && rngFor(seed, bossId, attempt, departureNumber, 'replacement-A')() < chance
  const bSucceeded = bRecruiters.length > 0 && batchB.length > 0 && rngFor(seed, bossId, attempt, departureNumber, 'replacement-B')() < chance
  const cSucceeded = cRecruiters.length > 0 && batchC.length > 0 && rngFor(seed, bossId, attempt, departureNumber, 'replacement-C')() < chance
  const successfulChannels = [
    ...(aSucceeded ? [{ batch: batchA, recruiters: aRecruiters, key: 'A' }] : []),
    ...(bSucceeded ? [{ batch: batchB, recruiters: bRecruiters, key: 'B' }] : []),
    ...(cSucceeded ? [{ batch: batchC, recruiters: cRecruiters, key: 'C' }] : []),
  ]
  const selectedChannel = shuffled(successfulChannels, `${seed}|${bossId}|${attempt}|replacement-channel:${departureNumber}`)[0]
  const recruiter = selectedChannel
    ? shuffled(selectedChannel.recruiters, `${seed}|${bossId}|${attempt}|replacement-recruiter:${departureNumber}`)[0]
    : undefined
  const recruiterName = recruiter ? publicById.get(recruiter.id)?.name ?? recruiter.id : ''
  const candidates = selectedChannel
    ? shuffled(selectedChannel.batch, `${seed}|${bossId}|${attempt}|replacement:${departureNumber}:${selectedChannel.key}`).slice(0, 3)
    : []

  if (!candidates.length) {
    const caller = recruiterNames.length ? recruiterNames.join('、') : '团长'
    const failureText = recruiterNames.length
      ? `${caller}尝试喊人来替补，但是问了一圈也没有找到愿意来的人。`
      : '当前团队里没有认识合适替补的人，少一人的阵容无法继续推进。'
    return { endReason: '组不到人', failureText }
  }

  return {
    plan: {
      leaverId,
      candidateIds: candidates.map((player) => player.player_id),
      recruiterName,
      departureNumber,
      resume,
    },
  }
}
