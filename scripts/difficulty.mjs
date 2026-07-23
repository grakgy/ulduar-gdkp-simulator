import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const data = await server.ssrLoadModule('/src/data.ts')
  const engine = await server.ssrLoadModule('/src/engine.ts')

  const recruitLikePlayer = (seed) => {
    const pool = data.playersForSeed(seed)
    const team = []
    for (let round = 0; round < 10; round += 1) {
      const selected = new Set(team.map((member) => member.id))
      const available = pool.filter((player) => !selected.has(player.player_id))
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

  const fixedTeam = (ids) => (seed) => ids.map((id) => engine.createMember(id, seed))
  const strongCustomIds = ['P092', 'P101', 'P082', 'P096', 'P081', 'P084', 'P093', 'P095', 'P097', 'P086']
  const weakCustomIds = ['P083', 'P101', 'P090', 'P099', 'P088', 'P098', 'P087', 'P089', 'P100', 'P085']

  const playRun = (seed, makeTeam) => {
    let team = makeTeam(seed)
    let morale = 70
    let pot = 0
    let cleared = 0
    for (const boss of data.bosses) {
      let killed = false
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const result = engine.simulateCombat(seed, boss, attempt, team, morale, pot)
        morale = Math.max(0, Math.min(100, morale + result.moraleDelta))
        if (result.leaver) return { cleared, end: '退团', boss: boss.boss_name }
        if (!result.killed) continue
        const auction = engine.runAuction(seed, boss, team)
        team = auction.team
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
      endedByLeaveRate: Number((results.filter((result) => result.end === '退团').length / runs).toFixed(3)),
      commonStops: [...stops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    }
  }

  const result = {
    publicRecruitStrategy: sample('公开信息均衡选人', recruitLikePlayer, 1000),
    strongCustomTeam: sample('较强全自建阵容', fixedTeam(strongCustomIds), 2000),
    weakCustomTeam: sample('较弱全自建阵容', fixedTeam(weakCustomIds), 2000),
  }

  console.log(JSON.stringify(result, null, 2))
  const strong = result.strongCustomTeam
  const weak = result.weakCustomTeam
  if (strong.reachedAlgalonRate < .5 || strong.reachedAlgalonRate > .6 || strong.fullClearRate < .27 || strong.fullClearRate > .34) process.exitCode = 1
  if (weak.reachedAlgalonRate < .1 || weak.reachedAlgalonRate > .2 || weak.fullClearRate < .03 || weak.fullClearRate > .05) process.exitCode = 1
} finally {
  await server.close()
}
