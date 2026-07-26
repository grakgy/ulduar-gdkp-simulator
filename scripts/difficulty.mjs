import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const data = await server.ssrLoadModule('/src/data.ts')
  const engine = await server.ssrLoadModule('/src/engine.ts')
  const replacement = await server.ssrLoadModule('/src/replacement.ts')

  const recruitLikePlayer = (seed) => {
    const pool = data.playersForSeed(seed)
    const team = []
    const caiFamilyIds = new Set(['P108', 'P115', 'P117'])
    for (let round = 0; round < 10; round += 1) {
      const selected = new Set(team.map((member) => member.id))
      const caiFamilyChosen = team.some((member) => caiFamilyIds.has(member.id))
      const available = pool.filter((player) => !selected.has(player.player_id) && !(caiFamilyChosen && caiFamilyIds.has(player.player_id)))
      const roundSeed = `${seed}|round:${round}|team:${team.map((member) => member.id).join(',')}`
      const candidates = engine.shuffled(available, roundSeed).slice(0, 5)
      const counts = { 坦克: 0, 治疗: 0, DPS: 0 }
      team.forEach((member) => {
        const role = engine.currentSpec(member).role
        if (role === '坦克') counts.坦克 += 1
        else if (role === '治疗') counts.治疗 += 1
        else counts.DPS += 1
      })
      const picked = [...candidates].sort((a, b) => {
        const score = (player) => {
          const role = player.signup_role
          let value = Number(player.signup_item_level)
          if (role === '坦克') value += counts.坦克 < 2 ? 55 : -65
          else if (role === '治疗') value += counts.治疗 < 2 ? 50 : counts.治疗 >= 3 ? -55 : -12
          else value += counts.坦克 >= 2 && counts.治疗 >= 2 ? 22 : 0
          return value
        }
        return score(b) - score(a)
      })[0]
      team.push(engine.createMember(picked.player_id, seed))
    }
    return team
  }

  const fixedTeam = (members) => (seed) => members.map(({ id, spec }) => ({ ...engine.createMember(id, seed), ...(spec ? { currentSpec: spec } : {}) }))
  const strongCustom = [
    { id: 'P092' }, { id: 'P101' }, { id: 'P082' }, { id: 'P096' },
    { id: 'P081' }, { id: 'P084' }, { id: 'P093', spec: '暗牧' }, { id: 'P103' }, { id: 'P097' }, { id: 'P086' },
  ]
  const normalCustom = [
    { id: 'P092' }, { id: 'P101' }, { id: 'P082' }, { id: 'P096' },
    { id: 'P103' }, { id: 'P110' }, { id: 'P111' }, { id: 'P097' }, { id: 'P114' }, { id: 'P081' },
  ]
  const weakCustom = [
    { id: 'P083' }, { id: 'P101' }, { id: 'P117' }, { id: 'P099' },
    { id: 'P087' }, { id: 'P116' }, { id: 'P109' }, { id: 'P113' }, { id: 'P098' }, { id: 'P089' },
  ]

  const playRun = (seed, makeTeam) => {
    let team = makeTeam(seed)
    let morale = 70
    let pot = 0
    let cleared = 0
    let leaveCount = 0
    const activeTeam = () => team.filter((member) => !member.left)
    const mergeActive = (updated) => {
      const byId = new Map(updated.map((member) => [member.id, member]))
      team = team.map((member) => member.left ? member : byId.get(member.id) ?? member)
    }
    const chooseReplacement = (candidateIds) => {
      const active = activeTeam()
      const counts = engine.roleCounts(active)
      return candidateIds
        .map((id) => data.publicById.get(id))
        .filter(Boolean)
        .sort((a, b) => {
          const score = (player) => {
            let value = Number(player.signup_item_level)
            if (player.signup_role === '坦克') value += counts.坦克 < 2 ? 80 : -35
            else if (player.signup_role === '治疗') value += counts.治疗 < 2 ? 70 : counts.治疗 >= 3 ? -30 : 5
            else value += counts.坦克 >= 2 && counts.治疗 >= 2 ? 30 : 0
            return value
          }
          return score(b) - score(a)
        })[0]
    }
    for (const boss of data.bosses) {
      let killed = false
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const result = engine.simulateCombat(seed, boss, attempt, activeTeam(), morale, pot)
        morale = Math.max(0, Math.min(100, morale + result.moraleDelta))
        if (result.leaver) {
          team = team.map((member) => member.id === result.leaver ? { ...member, left: true } : member)
          if (result.leaveType === '分崩离析') return { cleared, end: '分崩离析', boss: boss.boss_name }
          leaveCount += 1
          const decision = replacement.replacementDecision(seed, boss.boss_id, attempt, leaveCount, result.leaver, team, result.killed ? 'auction' : 'prep')
          if (!decision.plan) return { cleared, end: decision.endReason ?? '组不到人', boss: boss.boss_name }
          const picked = chooseReplacement(decision.plan.candidateIds)
          if (!picked) return { cleared, end: '组不到人', boss: boss.boss_name }
          team.push(engine.createMember(picked.player_id, seed))
        }
        if (!result.killed) continue
        const auction = engine.runAuction(seed, boss, activeTeam())
        mergeActive(auction.team)
        pot += auction.potGain
        morale = Math.max(0, Math.min(100, morale + auction.moraleDelta))
        cleared += 1
        killed = true
        break
      }
      if (!killed) return { cleared, end: '三灭', boss: boss.boss_name }
    }
    return { cleared, end: '全通', boss: '全通' }
  }

  const sample = (label, makeTeam, runs) => {
    const results = Array.from({ length: runs }, (_, index) => playRun(`difficulty-${label}-${index + 1}`, makeTeam))
    const stops = new Map()
    results.forEach((result) => stops.set(result.boss, (stops.get(result.boss) ?? 0) + 1))
    return {
      strategy: label,
      runs,
      fullClearRate: Number((results.filter((result) => result.cleared === data.bosses.length).length / runs).toFixed(3)),
      reachedAlgalonRate: Number((results.filter((result) => result.cleared >= data.bosses.length - 1).length / runs).toFixed(3)),
      averageProgress: Number((results.reduce((sum, result) => sum + result.cleared, 0) / runs).toFixed(2)),
      endedByLeaveRate: Number((results.filter((result) => ['分崩离析', '组不到人', '臭名昭著'].includes(result.end)).length / runs).toFixed(3)),
      commonStops: [...stops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    }
  }

  const result = {
    publicRecruitStrategy: sample('公开信息均衡选人', recruitLikePlayer, 1000),
    strongCustomTeam: sample('高手全自建阵容', fixedTeam(strongCustom), 3000),
    normalCustomTeam: sample('普通全自建阵容', fixedTeam(normalCustom), 3000),
    weakCustomTeam: sample('较差全自建阵容', fixedTeam(weakCustom), 3000),
  }

  console.log(JSON.stringify(result, null, 2))
  const strong = result.strongCustomTeam
  const normal = result.normalCustomTeam
  const weak = result.weakCustomTeam
  if (strong.fullClearRate < .22 || strong.fullClearRate > .28) process.exitCode = 1
  if (normal.fullClearRate < .08 || normal.fullClearRate > .12) process.exitCode = 1
  if (weak.fullClearRate < .015 || weak.fullClearRate > .025) process.exitCode = 1
} finally {
  await server.close()
}
