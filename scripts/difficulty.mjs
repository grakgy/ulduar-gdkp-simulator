import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const data = await server.ssrLoadModule('/src/data.ts')
  const engine = await server.ssrLoadModule('/src/engine.ts')
  const replacement = await server.ssrLoadModule('/src/replacement.ts')
  const runEvents = await server.ssrLoadModule('/src/runEvents.ts')
  const endings = await server.ssrLoadModule('/src/endings.ts')
  const maxBossAttempts = Number(data.gameConfig.get('max_boss_attempts') ?? 5)
  const sampleRuns = Math.max(1, Number(process.env.DIFFICULTY_RUNS ?? 1000))

  const recruitLikePlayer = (seed, { statusWeight = 0, learnedRosterWeight = 0 } = {}) => {
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
          value += engine.createPlayerStatus(seed, player.player_id).displayed * statusWeight
          if (learnedRosterWeight > 0) {
            const hidden = data.hiddenById.get(player.player_id)
            const knownAbility = hidden
              ? (Number(hidden.main_skill) + Number(hidden.mechanics) + Number(hidden.awareness)) / 3
              : 70
            value += (knownAbility - 70) * learnedRosterWeight
          }
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

  const fixedTeam = (members, statusBias = 0) => (seed) => members.map(({ id, spec }) => {
    const member = engine.createMember(id, seed)
    const actual = Math.max(-3, Math.min(3, member.status.actual + statusBias))
    return { ...member, status: { ...member.status, actual }, ...(spec ? { currentSpec: spec } : {}) }
  })
  const strongCustom = [
    { id: 'P092' }, { id: 'P101' }, { id: 'P082' }, { id: 'P096' },
    { id: 'P081' }, { id: 'P084' }, { id: 'P093', spec: '暗牧' }, { id: 'P103' }, { id: 'P097' }, { id: 'P086' },
  ]
  const eliteCustom = [
    { id: 'P092', spec: '防骑' }, { id: 'P053', spec: '防战' },
    { id: 'P012', spec: '奶萨' }, { id: 'P082', spec: '戒律牧' },
    { id: 'P081', spec: '元素' }, { id: 'P008', spec: '火法' },
    { id: 'P084', spec: '狂暴战' }, { id: 'P120', spec: '邪DK' },
    { id: 'P105', spec: '恶魔术' }, { id: 'P121', spec: '射击猎' },
  ]
  const observedExpertCustom = [
    { id: 'P128', spec: '防战' }, { id: 'P101', spec: '熊德' },
    { id: 'P082', spec: '戒律牧' }, { id: 'P118', spec: '奶骑' },
    { id: 'P095', spec: '火法' }, { id: 'P124', spec: '暗牧' },
    { id: 'P088', spec: '恶魔术' }, { id: 'P081', spec: '元素' },
    { id: 'P106', spec: '鸟德' }, { id: 'P085', spec: '战斗贼' },
  ]
  const observedStrongCustom = [
    { id: 'P083', spec: '防骑' }, { id: 'P084', spec: '防战' },
    { id: 'P122', spec: '奶德' }, { id: 'P094', spec: '奶德' },
    { id: 'P105', spec: '恶魔术' }, { id: 'P081', spec: '元素' },
    { id: 'P088', spec: '恶魔术' }, { id: 'P114', spec: '战斗贼' },
    { id: 'P133', spec: '狂暴战' }, { id: 'P086', spec: '生存猎' },
  ]
  const normalCustom = [
    { id: 'P092' }, { id: 'P101' }, { id: 'P082' }, { id: 'P096' },
    { id: 'P103' }, { id: 'P110' }, { id: 'P111' }, { id: 'P097' }, { id: 'P114' }, { id: 'P081' },
  ]
  const weakCustom = [
    { id: 'P092' }, { id: 'P034' }, { id: 'P096' }, { id: 'P102' },
    { id: 'P054' }, { id: 'P111' }, { id: 'P031' }, { id: 'P106' }, { id: 'P064' }, { id: 'P112' },
  ]

  const adaptSpecsForBoss = (team, boss) => {
    if (boss.tank_mode === '载具') return team
    const active = team.filter((member) => !member.left)
    const activeHealers = active.filter((member) => engine.currentSpec(member).role === '治疗')
    const activeTanks = active.filter((member) => engine.currentSpec(member).role === '坦克')
    const activeDamage = active.filter((member) => engine.currentSpec(member).role.includes('DPS'))
    const healerSkill = activeHealers.length
      ? activeHealers.reduce((sum, member) => sum + Number(engine.currentSpec(member).skill), 0) / activeHealers.length
      : 0
    const needsExtraHealer = ['高', '极高'].includes(boss.healing_pressure) && healerSkill < 76
    const minTanks = Number(boss.min_tanks)
    const maxTanks = Number(boss.max_tanks)
    const minHealers = Number(boss.min_healers)
    const maxHealers = Number(boss.max_healers)
    const desiredHealers = needsExtraHealer ? maxHealers : Math.max(minHealers, Math.min(maxHealers, activeHealers.length))
    const currentRequiredDamage = activeTanks.length > minTanks ? Math.max(Number(boss.min_dps), Number(boss.extra_tank_min_dps)) : Number(boss.min_dps)
    const currentValid = activeTanks.length >= minTanks
      && activeTanks.length <= maxTanks
      && activeHealers.length === desiredHealers
      && activeDamage.length >= currentRequiredDamage
    if (currentValid) return team

    let states = new Map([['0,0,0', { score: 0, specs: [] }]])
    for (const member of active) {
      const choices = engine.publicSpecs(member.id)
      const next = new Map()
      for (const [state, plan] of states) {
        const [tanks, healers, damage] = state.split(',').map(Number)
        for (const spec of choices) {
          const nextTanks = tanks + (spec.role === '坦克' ? 1 : 0)
          const nextHealers = healers + (spec.role === '治疗' ? 1 : 0)
          const nextDamage = damage + (spec.role.includes('DPS') ? 1 : 0)
          if (nextTanks > maxTanks || nextHealers > desiredHealers) continue
          const key = `${nextTanks},${nextHealers},${nextDamage}`
          const score = plan.score + Number(spec.skill) + (spec.spec === member.currentSpec ? .05 : 0)
          if (!next.has(key) || next.get(key).score < score) next.set(key, { score, specs: [...plan.specs, spec.spec] })
        }
      }
      states = next
    }
    const valid = [...states.entries()]
      .filter(([state]) => {
        const [tanks, healers, damage] = state.split(',').map(Number)
        const requiredDamage = tanks > minTanks ? Math.max(Number(boss.min_dps), Number(boss.extra_tank_min_dps)) : Number(boss.min_dps)
        return tanks >= minTanks && tanks <= maxTanks && healers === desiredHealers && damage >= requiredDamage
      })
      .sort((left, right) => right[1].score - left[1].score)[0]?.[1]
    if (!valid) return team
    const specById = new Map(active.map((member, index) => [member.id, valid.specs[index]]))
    return team.map((member) => member.left ? member : { ...member, currentSpec: specById.get(member.id) ?? member.currentSpec })
  }

  const playRun = (seed, makeTeam) => {
    let team = makeTeam(seed)
    let morale = 70
    let pot = 0
    let cleared = 0
    let leaveCount = 0
    let anyLeave = false
    let ordinaryLeave = false
    let collapseLeave = false
    let internetCafeLeave = false
    let histories = []
    let currentBossId = data.bosses[0].boss_id
    let lastLeaver
    let lastLeaveType
    let lastLeaveReason
    let lastFailureCause
    let lastFailureReason
    const activeTeam = () => team.filter((member) => !member.left)
    const cumulativeWipes = () => histories.reduce((sum, history) => sum + history.wipes, 0)
    const updateHistory = (boss, attempt, killed) => {
      const old = histories.find((history) => history.bossId === boss.boss_id)
      histories = [
        ...histories.filter((history) => history.bossId !== boss.boss_id),
        { bossId: boss.boss_id, attempts: attempt, killed, wipes: (old?.wipes ?? 0) + (killed ? 0 : 1) },
      ]
    }
    const finish = (end, boss) => {
      const ending = endings.resolveRunEnding({
        seed,
        endReason: end === '全通' ? '全通MVP' : end === '五灭' ? '五次失败' : end,
        currentBossId,
        histories,
        team: team.map((member) => ({
          id: member.id,
          name: data.publicById.get(member.id)?.name ?? member.id,
          left: member.left,
          blame: member.blame,
          personality: data.hiddenById.get(member.id)?.personality_type ?? '',
        })),
        bosses: data.bosses.map((entry) => ({ id: entry.boss_id, name: entry.boss_name, order: Number(entry.order) })),
        pot,
        leaverId: lastLeaver,
        leaveType: lastLeaveType,
        leaveReason: lastLeaveReason,
      })
      return { cleared, end, boss, anyLeave, ordinaryLeave, collapseLeave, internetCafeLeave, leaveCount, endingTitle: ending.title, hiddenEnding: ending.hidden, failureCause: lastFailureCause, failureReason: lastFailureReason }
    }
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
      team = adaptSpecsForBoss(team, boss)
      currentBossId = boss.boss_id
      let killed = false
      let shortRestUsed = false
      for (let attempt = 1; attempt <= maxBossAttempts; attempt += 1) {
        const result = engine.simulateCombat(seed, boss, attempt, activeTeam(), morale, pot)
        lastFailureCause = result.failureCause
        lastFailureReason = result.failureCause ? result.reason : undefined
        morale = Math.max(0, Math.min(100, morale + result.moraleDelta))
        team = team.map((member) => ({ ...member, blame: member.blame + (member.id === result.responsible ? 1 : 0) }))
        updateHistory(boss, attempt, result.killed)
        if (result.leaveType === '分崩离析' && result.leaver) {
          anyLeave = true
          collapseLeave = true
          lastLeaver = result.leaver
          lastLeaveType = result.leaveType
          lastLeaveReason = result.leaveReason
          team = team.map((member) => member.id === result.leaver ? { ...member, left: true } : member)
          return finish('成员退团散团', boss.boss_name)
        }
        if (!result.killed) {
          const restDelta = engine.shortRestMoraleRecovery(seed, boss.boss_id, attempt, morale, shortRestUsed)
          if (restDelta) {
            morale = Math.min(100, morale + restDelta)
            shortRestUsed = true
          }
          const directEnding = runEvents.hiddenEndingAfterWipe(seed, morale, pot, cleared, cumulativeWipes())
          if (directEnding) return finish(directEnding.reason, boss.boss_name)
          if (attempt >= maxBossAttempts) return finish('五灭', boss.boss_name)
        }
        if (result.leaver) {
          anyLeave = true
          internetCafeLeave ||= result.leaveType === '网吧到点'
          ordinaryLeave ||= !['分崩离析', '违规封号'].includes(result.leaveType ?? '')
          lastLeaver = result.leaver
          lastLeaveType = result.leaveType
          lastLeaveReason = result.leaveReason
          team = team.map((member) => member.id === result.leaver ? { ...member, left: true } : member)
          leaveCount += 1
          const decision = replacement.replacementDecision(seed, boss.boss_id, attempt, leaveCount, result.leaver, team, result.killed ? 'auction' : 'prep')
          if (!decision.plan) {
            lastLeaveReason = `${lastLeaveReason ?? ''} ${decision.failureText ?? ''}`.trim()
            return finish(decision.endReason ?? '组不到人', boss.boss_name)
          }
          const picked = chooseReplacement(decision.plan.candidateIds)
          if (!picked) return finish('组不到人', boss.boss_name)
          team.push(engine.createMember(picked.player_id, seed))
          team = adaptSpecsForBoss(team, boss)
        }
        if (!result.killed) continue
        const auction = engine.runAuction(seed, boss, activeTeam())
        mergeActive(auction.team)
        pot += auction.potGain
        morale = Math.max(0, Math.min(100, morale + auction.moraleDelta))
        cleared += 1
        const blackGold = runEvents.hiddenEndingAfterAuction(seed, pot, cleared, data.bosses.length)
        if (blackGold) return finish(blackGold.reason, boss.boss_name)
        killed = true
        break
      }
      if (!killed) return finish('五灭', boss.boss_name)
    }
    return finish('全通', '全通')
  }

  const sample = (label, makeTeam, runs) => {
    const results = Array.from({ length: runs }, (_, index) => playRun(`difficulty-${label}-${index + 1}`, makeTeam))
    const stops = new Map()
    const hiddenEndings = new Map()
    const failureCauses = new Map()
    const failureDetails = new Map()
    results.forEach((result) => stops.set(result.boss, (stops.get(result.boss) ?? 0) + 1))
    results.filter((result) => result.hiddenEnding).forEach((result) => hiddenEndings.set(result.endingTitle, (hiddenEndings.get(result.endingTitle) ?? 0) + 1))
    results.filter((result) => result.failureCause).forEach((result) => failureCauses.set(result.failureCause, (failureCauses.get(result.failureCause) ?? 0) + 1))
    results.filter((result) => result.failureReason).forEach((result) => failureDetails.set(result.failureReason, (failureDetails.get(result.failureReason) ?? 0) + 1))
    return {
      strategy: label,
      runs,
      fullClearRate: Number((results.filter((result) => result.cleared === data.bosses.length).length / runs).toFixed(3)),
      reachedAlgalonRate: Number((results.filter((result) => result.cleared >= data.bosses.length - 1).length / runs).toFixed(3)),
      averageProgress: Number((results.reduce((sum, result) => sum + result.cleared, 0) / runs).toFixed(2)),
      endedByLeaveRate: Number((results.filter((result) => ['分崩离析', '组不到人', '臭名昭著'].includes(result.end)).length / runs).toFixed(3)),
      anyLeaveRate: Number((results.filter((result) => result.anyLeave).length / runs).toFixed(3)),
      ordinaryLeaveRate: Number((results.filter((result) => result.ordinaryLeave).length / runs).toFixed(3)),
      collapseLeaveRate: Number((results.filter((result) => result.collapseLeave).length / runs).toFixed(3)),
      internetCafeLeaveRate: Number((results.filter((result) => result.internetCafeLeave).length / runs).toFixed(3)),
      averageDepartures: Number((results.reduce((sum, result) => sum + result.leaveCount, 0) / runs).toFixed(3)),
      hiddenEndingRates: Object.fromEntries([...hiddenEndings.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN')).map(([title, count]) => [title, Number((count / runs).toFixed(3))])),
      commonFailureCauses: [...failureCauses.entries()].sort((a, b) => b[1] - a[1]),
      commonFailureDetails: [...failureDetails.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      commonStops: [...stops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    }
  }

  const result = {
    publicRecruitStrategy: sample('公开信息与状态均衡选人', (seed) => recruitLikePlayer(seed, { statusWeight: 9 }), sampleRuns),
    veteranRecruitStrategy: sample('熟悉人物并优先好状态', (seed) => recruitLikePlayer(seed, { statusWeight: 10, learnedRosterWeight: .65 }), sampleRuns),
    observedExpertTeam: sample('实玩中上阵容B（偏好好状态）', fixedTeam(observedExpertCustom, 1), sampleRuns),
    observedStrongTeam: sample('实玩中上阵容A（偏好好状态）', fixedTeam(observedStrongCustom, 1), sampleRuns),
    strongCustomTeam: sample('高手全自建阵容', fixedTeam(strongCustom), sampleRuns),
    eliteGoodStatusTeam: sample('顶尖阵容并偏好好状态', fixedTeam(eliteCustom, 1), sampleRuns),
    normalCustomTeam: sample('普通全自建阵容', fixedTeam(normalCustom), sampleRuns),
    weakCustomTeam: sample('较差全自建阵容', fixedTeam(weakCustom), sampleRuns),
  }

  console.log(JSON.stringify(result, null, 2))
  const strong = result.strongCustomTeam
  const eliteGoodStatus = result.eliteGoodStatusTeam
  const veteran = result.veteranRecruitStrategy
  const observedExpert = result.observedExpertTeam
  const observedStrong = result.observedStrongTeam
  const normal = result.normalCustomTeam
  const weak = result.weakCustomTeam
  if (veteran.fullClearRate < .08 || veteran.fullClearRate > .20) process.exitCode = 1
  if (observedExpert.fullClearRate < .12 || observedExpert.fullClearRate > .22) process.exitCode = 1
  if (observedStrong.fullClearRate < .25 || observedStrong.fullClearRate > .40) process.exitCode = 1
  if (strong.fullClearRate < .10 || strong.fullClearRate > .30) process.exitCode = 1
  if (eliteGoodStatus.fullClearRate < .40) process.exitCode = 1
  if (normal.fullClearRate < .03 || normal.fullClearRate > .08) process.exitCode = 1
  if (weak.fullClearRate > .02) process.exitCode = 1
  if ([strong, normal, weak].some((sample) => sample.anyLeaveRate < .3)) process.exitCode = 1
} finally {
  await server.close()
}
