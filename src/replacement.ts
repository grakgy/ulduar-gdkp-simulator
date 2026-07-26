import { fullPlayersPublic, gameConfig, publicById } from './data'
import { publicSpecs, rngFor, shuffled, type TeamMember } from './engine'

export interface ReplacementPlan {
  leaverId: string
  candidateIds: string[]
  recruiterNames: string[]
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

function configNumber(key: string, fallback: number) {
  const value = Number(gameConfig.get(key))
  return Number.isFinite(value) ? value : fallback
}

function playerBatch(playerId: string): 'A' | 'B' | undefined {
  const value = Number(playerId.slice(1))
  if (value >= 81 && value <= 102) return 'A'
  if (value >= 103 && value <= 120) return 'B'
  return undefined
}

export function replacementDecision(seed: string, bossId: string, attempt: number, departureNumber: number, leaverId: string, team: TeamMember[], resume: ReplacementPlan['resume']): ReplacementDecision {
  const active = team.filter((member) => !member.left)
  const usedIds = new Set(team.map((member) => member.id))
  const aRecruiters = active.filter((member) => batchARecruiterIds.has(member.id))
  const bRecruiters = active.filter((member) => batchBRecruiterIds.has(member.id))
  const available = fullPlayersPublic.filter((player) => !usedIds.has(player.player_id) && publicSpecs(player.player_id).length > 0)
  const batchA = available.filter((player) => playerBatch(player.player_id) === 'A')
  const batchB = available.filter((player) => playerBatch(player.player_id) === 'B')
  const recruiterNames = [...aRecruiters, ...bRecruiters].map((member) => publicById.get(member.id)?.name ?? member.id)
  const bothChannels = aRecruiters.length > 0 && bRecruiters.length > 0

  if (departureNumber >= 3) {
    const endReason = bothChannels ? '臭名昭著' : '组不到人'
    const failureText = bothChannels
      ? '两边的人脉都已经问遍。江湖上传言进此团等于坐牢，再也没人愿意来接这个进度。'
      : `${recruiterNames[0] ?? '团长'}继续尝试联系替补，但本局第三次退团后已经没人愿意进组。`
    return { endReason, failureText }
  }

  const chance = configNumber(departureNumber === 1 ? 'replacement_success_pct_1' : 'replacement_success_pct_2', departureNumber === 1 ? 80 : 40) / 100
  const aSucceeded = aRecruiters.length > 0 && batchA.length > 0 && rngFor(seed, bossId, attempt, departureNumber, 'replacement-A')() < chance
  const bSucceeded = bRecruiters.length > 0 && batchB.length > 0 && rngFor(seed, bossId, attempt, departureNumber, 'replacement-B')() < chance
  const successfulRecruiters = [
    ...(aSucceeded ? aRecruiters : []),
    ...(bSucceeded ? bRecruiters : []),
  ].map((member) => publicById.get(member.id)?.name ?? member.id)
  const candidates = shuffled([...(aSucceeded ? batchA : []), ...(bSucceeded ? batchB : [])], `${seed}|${bossId}|${attempt}|replacement:${departureNumber}`).slice(0, 3)

  if (!candidates.length) {
    const caller = recruiterNames.length ? recruiterNames.join('、') : '团长'
    const failureText = recruiterNames.length
      ? `${caller}尝试喊人来替补，但是问了一圈也没有找到愿意接进度的人。`
      : '当前团队里没有认识合适替补的人，少一人的阵容无法继续推进。'
    return { endReason: '组不到人', failureText }
  }

  return {
    plan: {
      leaverId,
      candidateIds: candidates.map((player) => player.player_id),
      recruiterNames: successfulRecruiters,
      departureNumber,
      resume,
    },
  }
}
