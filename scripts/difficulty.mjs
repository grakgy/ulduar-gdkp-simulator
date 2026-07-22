import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const data = await server.ssrLoadModule('/src/data.ts')
  const engine = await server.ssrLoadModule('/src/engine.ts')

  const roleOf = (player) => player.signup_role
  const recruitLikePlayer = (seed) => {
    const team = []
    for (let round = 0; round < 10; round += 1) {
      const selected = new Set(team.map((member) => member.id))
      const available = data.playersPublic.filter((player) => !selected.has(player.player_id))
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
          const role = roleOf(player)
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

  const idealTeam = (seed) => {
    const members = data.playersPublic.map((player) => engine.createMember(player.player_id, seed))
    const best = (role, amount) => members
      .filter((member) => role(engine.currentSpec(member).role))
      .sort((a, b) => (b.performance + b.itemLevel * .25) - (a.performance + a.itemLevel * .25))
      .slice(0, amount)
    return [...best((role) => role === '坦克', 2), ...best((role) => role === '治疗', 2), ...best((role) => role.includes('DPS'), 6)]
  }

  const playRun = (seed, makeTeam) => {
    let team = makeTeam(seed)
    let morale = 70
    let pot = 0
    let cleared = 0
    let end = '三灭'
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
      if (!killed) return { cleared, end, boss: boss.boss_name }
    }
    return { cleared, end: '全通', boss: '全通' }
  }

  const sample = (label, makeTeam, runs = 1000) => {
    const results = Array.from({ length: runs }, (_, index) => playRun(`difficulty-${label}-${index + 1}`, makeTeam))
    const fullClears = results.filter((result) => result.cleared === data.bosses.length).length
    const progress = results.map((result) => result.cleared).sort((a, b) => a - b)
    const stops = new Map()
    results.forEach((result) => stops.set(result.boss, (stops.get(result.boss) ?? 0) + 1))
    return {
      strategy: label,
      runs,
      fullClearRate: Number((fullClears / runs).toFixed(3)),
      averageProgress: Number((progress.reduce((sum, value) => sum + value, 0) / runs).toFixed(2)),
      medianProgress: progress[Math.floor(runs / 2)],
      reachedBoss13Rate: Number((results.filter((result) => result.cleared >= 12).length / runs).toFixed(3)),
      endedByLeaveRate: Number((results.filter((result) => result.end === '退团').length / runs).toFixed(3)),
      commonStops: [...stops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    }
  }

  const publicRecruitStrategy = sample('公开信息均衡选人', recruitLikePlayer)
  const hiddenBestCase = sample('隐藏属性最优阵容', idealTeam)
  console.log(JSON.stringify({ publicRecruitStrategy, hiddenBestCase }, null, 2))
  if (hiddenBestCase.fullClearRate < .45 || hiddenBestCase.fullClearRate > .58) process.exitCode = 1
} finally {
  await server.close()
}
