import { createServer } from 'vite'

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const data = await server.ssrLoadModule('/src/data.ts')
  const engine = await server.ssrLoadModule('/src/engine.ts')
  const app = await server.ssrLoadModule('/src/App.tsx')
  const order = engine.shuffled(data.playersPublic, '380')
  const team = order.slice(0, 10).map((player) => engine.createMember(player.player_id, '380'))
  const combatA = engine.simulateCombat('380', data.bosses[0], 1, team, 70, 0)
  const combatB = engine.simulateCombat('380', data.bosses[0], 1, team, 70, 0)
  const auctionA = engine.runAuction('380', data.bosses[0], team)
  const auctionB = engine.runAuction('380', data.bosses[0], team)
  const fullLootCoverage = data.bosses.every((boss) => {
    const auction = engine.runAuction('380', boss, team)
    return auction.records.length === 2 && auction.records.every((record) => record.item?.item_name)
  })

  const balancedIds = [
    ...data.playersPublic.filter((player) => player.signup_role === '坦克').slice(0, 2),
    ...data.playersPublic.filter((player) => player.signup_role === '治疗').slice(0, 2),
    ...data.playersPublic.filter((player) => player.signup_role.includes('DPS')).slice(0, 6),
  ].map((player) => player.player_id)
  const balancedTeam = balancedIds.map((id) => engine.createMember(id, '380'))
  const firstAttemptKills = data.bosses.filter((boss) => engine.simulateCombat('380', boss, 1, balancedTeam, 70, 0).killed).length

  const makeStructureTeam = (tankCount) => [
    ...data.playersPublic.filter((player) => player.signup_role === '坦克').slice(0, tankCount),
    ...data.playersPublic.filter((player) => player.signup_role === '治疗').slice(0, 2),
    ...data.playersPublic.filter((player) => player.signup_role.includes('DPS')).slice(0, 8 - tankCount),
  ]
  const dualTankFailures = []
  const threeTankFailures = []
  let allowedSingleTankMisclassified = 0
  for (let sampleSeed = 1; sampleSeed <= 100; sampleSeed += 1) {
    const oneTankTeam = makeStructureTeam(1).map((player) => engine.createMember(player.player_id, `structure-1-${sampleSeed}`))
    const threeTankTeam = makeStructureTeam(3).map((player) => engine.createMember(player.player_id, `structure-3-${sampleSeed}`))
    const dualTankResult = engine.simulateCombat(`dual-${sampleSeed}`, data.bosses[4], 1, oneTankTeam, 70, 0)
    const singleTankResult = engine.simulateCombat(`single-${sampleSeed}`, data.bosses[7], 1, oneTankTeam, 70, 0)
    const flexibleTankResult = engine.simulateCombat(`flex-${sampleSeed}`, data.bosses[10], 1, oneTankTeam, 70, 0)
    const threeTankResult = engine.simulateCombat(`three-${sampleSeed}`, data.bosses[10], 1, threeTankTeam, 70, 0)
    if (!dualTankResult.killed) dualTankFailures.push(dualTankResult)
    if (!threeTankResult.killed) threeTankFailures.push(threeTankResult)
    for (const result of [singleTankResult, flexibleTankResult]) {
      if (!result.killed && result.events.some((event) => event.name === '阵容结构崩盘') && result.reason.includes('坦克')) allowedSingleTankMisclassified += 1
    }
  }
  const structureSamples = [...dualTankFailures, ...threeTankFailures]
  const structureFailuresAssignedToLeader = dualTankFailures.length > 30 && threeTankFailures.length > 30 && allowedSingleTankMisclassified === 0 && structureSamples.every((result) => result.responsible === '团长' && result.reason.includes('坦克') && result.events.some((event) => event.name === '阵容结构崩盘' && event.responsible === '团长'))

  const healerScore = (player) => {
    const hidden = data.hiddenById.get(player.player_id)
    const spec = data.specsByPlayer.get(player.player_id)?.find((entry) => entry.role === '治疗')
    return Number(spec?.skill ?? 0) * .55 + Number(hidden?.awareness ?? 0) * .15 + Number(hidden?.stability ?? 0) * .15 + Number(hidden?.teamwork ?? 0) * .15
  }
  const healerCandidates = data.playersPublic.filter((player) => player.signup_role === '治疗').sort((a, b) => healerScore(b) - healerScore(a))
  const fixedCore = [
    ...data.playersPublic.filter((player) => player.signup_role === '坦克').slice(0, 2),
    ...data.playersPublic.filter((player) => player.signup_role.includes('DPS')).slice(0, 6),
  ]
  const strongHealerIds = healerCandidates.slice(0, 2).map((player) => player.player_id)
  const weakHealerIds = healerCandidates.slice(-2).map((player) => player.player_id)
  let strongHealerKills = 0
  let weakHealerKills = 0
  for (let sampleSeed = 1; sampleSeed <= 200; sampleSeed += 1) {
    const strongTeam = [...fixedCore.map((player) => player.player_id), ...strongHealerIds].map((id) => engine.createMember(id, `heal-strong-${sampleSeed}`))
    const weakTeam = [...fixedCore.map((player) => player.player_id), ...weakHealerIds].map((id) => engine.createMember(id, `heal-weak-${sampleSeed}`))
    if (engine.simulateCombat(`heal-${sampleSeed}`, data.bosses[10], 2, strongTeam, 74, 0).killed) strongHealerKills += 1
    if (engine.simulateCombat(`heal-${sampleSeed}`, data.bosses[10], 2, weakTeam, 74, 0).killed) weakHealerKills += 1
  }
  const healerSkillMatters = strongHealerKills >= weakHealerKills + 20

  const sampledSales = []
  const sampledRecords = []
  for (let sampleSeed = 1; sampleSeed <= 60; sampleSeed += 1) {
    const sampleOrder = engine.shuffled(data.playersPublic, String(sampleSeed))
    const sampleTeam = sampleOrder.slice(0, 10).map((player) => engine.createMember(player.player_id, String(sampleSeed)))
    for (const boss of data.bosses) {
      const records = engine.runAuction(String(sampleSeed), boss, sampleTeam).records
      sampledRecords.push(...records)
      sampledSales.push(...records.filter((record) => !record.salvaged))
    }
  }
  const basePriceRate = sampledSales.length ? sampledSales.filter((record) => record.price === engine.itemStartPrice(record.item)).length / sampledSales.length : 0
  const whaleRate = sampledSales.length ? sampledSales.filter((record) => record.price >= engine.itemReferencePrice(record.item) * 1.6).length / sampledSales.length : 0
  const unsoldRate = sampledRecords.length ? sampledRecords.filter((record) => record.salvaged).length / sampledRecords.length : 0
  const premiumSales = sampledSales.filter((record) => ['S', 'S+'].includes(record.item.grade))
  const premiumReferenceRate = premiumSales.length ? premiumSales.filter((record) => record.price >= engine.itemReferencePrice(record.item)).length / premiumSales.length : 0
  const premiumPriceRatios = premiumSales.map((record) => record.price / engine.itemReferencePrice(record.item)).sort((a, b) => a - b)
  const premiumMedianRatio = premiumPriceRatios[Math.floor(premiumPriceRatios.length / 2)] ?? 0
  const strictlyIncreasingBids = sampledRecords.every((record) => {
    const amounts = record.log.filter((line) => !line.startsWith('团长') && !line.startsWith('成交')).map((line) => line.match(/：([\d,]+)G/)?.[1]).filter(Boolean).map((value) => Number(value.replaceAll(',', '')))
    return amounts.every((amount, index) => index === 0 || amount > amounts[index - 1])
  })
  const noSelfBidding = sampledRecords.every((record) => {
    const bidders = record.log.map((line) => line.match(/^(.+?)：([\d,]+)G$/)?.[1]).filter(Boolean)
    return bidders.every((bidder, index) => index === 0 || bidder !== bidders[index - 1])
  })
  const multiRoundAuctions = sampledSales.filter((record) => record.log.filter((line) => /：[\d,]+G/.test(line) && !line.startsWith('团长')).length >= 5).length
  const bidIncrements = new Set()
  for (const record of sampledSales.filter((record) => engine.itemStartPrice(record.item) >= 1000)) {
    const amounts = record.log.filter((line) => !line.startsWith('团长') && !line.startsWith('成交')).map((line) => line.match(/：([\d,]+)G/)?.[1]).filter(Boolean).map((value) => Number(value.replaceAll(',', '')))
    amounts.slice(1).forEach((amount, index) => bidIncrements.add(amount - amounts[index]))
  }
  const noDiscounts = sampledRecords.every((record) => record.log.every((line) => !line.includes('降到') && !line.includes('半价')))

  const customPlayerIds = Array.from({ length: 21 }, (_, index) => `P${String(index + 81).padStart(3, '0')}`)
  const customPlayersPreserved = customPlayerIds.every((id) => data.publicById.has(id))
  const newCustomPlayersActive = customPlayerIds.every((id) => data.playersPublic.some((player) => player.player_id === id))
  const combatProfileScore = (player) => ['main_skill', 'mechanics', 'awareness', 'stability', 'teamwork'].reduce((sum, key) => sum + Number(player[key] ?? 0), 0) / 5
  const activeHidden = data.playersPublic.map((player) => data.hiddenById.get(player.player_id)).filter(Boolean)
  const customProfiles = activeHidden.filter((player) => player.source_type === '玩家自建')
  const randomProfiles = activeHidden.filter((player) => player.source_type === '随机生成')
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
  const customProfileAverage = average(customProfiles.map(combatProfileScore))
  const randomProfileAverage = average(randomProfiles.map(combatProfileScore))
  const customPlayersStronger = customProfiles.length === 21 && customProfileAverage >= randomProfileAverage + 2
  const requiredHiddenFields = ['source_type', 'personality_type', 'strength_tags', 'weakness_tags', 'special_rule', 'leave_policy', 'description']
  const hiddenSchemaOrganized = data.playersHidden.length === 101 && data.playersHidden.every((player) => requiredHiddenFields.every((field) => typeof player[field] === 'string') && player.source_type && player.personality_type && player.leave_policy && player.description)
  const chatScenes = new Set(data.chatTemplates.map((entry) => entry.scene))
  const chatTemplateCoverage = data.chatTemplates.length >= 220 && ['报名', '灭团', '退团', '拍卖'].every((scene) => chatScenes.has(scene)) && data.chatTemplates.every((entry) => entry.style_or_trait && entry.template && !entry.template.includes('�'))
  const learningPlayer = customProfiles.find((player) => player.player_id === 'P099')
  const learningSpec = data.specsByPlayer.get('P099')?.[0]
  const attemptTwoGain = engine.personalLearningGain(learningPlayer, learningSpec, 2)
  const attemptThreeGain = engine.personalLearningGain(learningPlayer, learningSpec, 3)
  const attemptLearningWorks = attemptTwoGain > 0 && attemptThreeGain > attemptTwoGain
  const specNames = (playerId) => new Set((data.specsByPlayer.get(playerId) ?? []).map((spec) => spec.spec))
  const moonkinSpecs = specNames('P087')
  const merchantSpecs = specNames('P082')
  const warriorSpecs = specNames('P084')
  const requestedSpecChangesValid = ['鸟德', '奶德', '熊德', '猫德'].every((spec) => moonkinSpecs.has(spec)) && merchantSpecs.has('暗牧') && warriorSpecs.has('防战') && !warriorSpecs.has('武器战')
  const hiddenEconomyLabels = new Set(['容易上头', '捡漏型', '大老板', '实力消费', '毕业装党', '武器饰品党', '排骨党', '口嗨消费', '简陋型'])
  const publicEconomyClaimsValid = data.playersPublic.every((player) => !hiddenEconomyLabels.has(player.public_economy_claim))

  const damageTeamIds = ['P081', 'P084', 'P086', 'P087', 'P088', 'P089', 'P091', 'P094', 'P095', 'P097']
  const damageRatios = []
  const tigerToMedianRatios = []
  const personalDps = new Map(damageTeamIds.map((id) => [id, []]))
  for (let sampleSeed = 1; sampleSeed <= 120; sampleSeed += 1) {
    const damageTeam = damageTeamIds.map((id) => engine.createMember(id, `meter-${sampleSeed}`))
    const fight = engine.simulateCombat(`meter-${sampleSeed}`, data.bosses[0], 1, damageTeam, 70, 0)
    const damageMeters = fight.meters.filter((meter) => meter.role.includes('DPS')).sort((a, b) => a.dps - b.dps)
    damageRatios.push(damageMeters.at(-1).dps / damageMeters[0].dps)
    const median = damageMeters[Math.floor(damageMeters.length / 2)].dps
    const tiger = damageMeters.find((meter) => meter.playerId === 'P081')
    tigerToMedianRatios.push(tiger.dps / median)
    damageMeters.forEach((meter) => personalDps.get(meter.playerId)?.push(meter.dps))
  }
  const averageDamageSpread = average(damageRatios)
  const tigerToMedian = average(tigerToMedianRatios)
  const personalOutputVaries = [...personalDps.values()].every((values) => Math.max(...values) / Math.min(...values) >= 1.05)
  const damageBalanceValid = averageDamageSpread <= 1.55 && tigerToMedian >= .9 && tigerToMedian <= 1.28 && personalOutputVaries

  const behaviorTeamIds = ['P092', 'P083', 'P082', 'P090', 'P084', 'P081', 'P086', 'P088', 'P094', 'P095']
  let quietResponsibilitySamples = 0
  let quietSpokenLines = 0
  let franRecoveries = 0
  let franFatalErrors = 0
  for (let sampleSeed = 1; sampleSeed <= 120; sampleSeed += 1) {
    const behaviorTeam = behaviorTeamIds.map((id) => engine.createMember(id, `behavior-${sampleSeed}`))
    for (const boss of data.bosses) {
      const fight = engine.simulateCombat(`behavior-${sampleSeed}`, boss, 1, behaviorTeam, 70, 0)
      if (fight.responsible === 'P084') {
        quietResponsibilitySamples += 1
        quietSpokenLines += fight.chat.filter((line) => line.startsWith('萌战：')).length
      }
      franRecoveries += fight.events.filter((event) => event.status === '险情' && event.responsible === '芙兰秀秀' && event.recoveryBy).length
      franFatalErrors += fight.events.filter((event) => event.status === '失败' && event.responsible === '芙兰秀秀').length
    }
  }
  const quietPlayerRespected = quietResponsibilitySamples > 0 && quietSpokenLines === 0
  const franCanBeRecovered = franRecoveries >= 10 && franRecoveries > franFatalErrors
  const sampledItemLevels = []
  let publicInfoConsistent = true
  const pureDpsClasses = new Set(['法师', '术士', '盗贼', '猎人'])
  for (let sampleSeed = 1; sampleSeed <= 100; sampleSeed += 1) {
    for (const player of data.playersPublic) {
      const seed = `ilvl-${sampleSeed}`
      const itemLevel = engine.dynamicItemLevel(player.player_id, seed)
      sampledItemLevels.push(itemLevel)
      const progress = app.believableProgress(player, itemLevel)
      const economy = app.believableEconomy(player, itemLevel)
      const whisper = app.publicWhisper(player, seed, sampleSeed % 10)
      if (itemLevel >= 230 && Number(player.player_id.slice(1)) < 81 && (!progress.includes('全通') || economy !== '纯打工，不消费')) publicInfoConsistent = false
      if (/大号|成就在大号/.test(`${progress}|${economy}|${whisper}`)) publicInfoConsistent = false
      if (pureDpsClasses.has(player.class) && whisper.includes(player.signup_spec)) publicInfoConsistent = false
      if (!pureDpsClasses.has(player.class) && /\s(?:1|111)$/.test(whisper)) publicInfoConsistent = false
    }
  }
  const itemLevelAdjustmentsValid = sampledItemLevels.every((itemLevel) => itemLevel >= 200 && itemLevel <= 232)
  const itemLevel230Rate = sampledItemLevels.filter((itemLevel) => itemLevel >= 230).length / sampledItemLevels.length
  const itemLevel232Rate = sampledItemLevels.filter((itemLevel) => itemLevel >= 232).length / sampledItemLevels.length
  const firstRound = engine.shuffled(data.playersPublic, 'pool-test|round:0|team:').slice(0, 5)
  const pickedId = firstRound[0].player_id
  const availableAfterPick = data.playersPublic.filter((player) => player.player_id !== pickedId)
  const unpickedReturnToPool = availableAfterPick.length === 39 && firstRound.slice(1).every((player) => availableAfterPick.some((candidate) => candidate.player_id === player.player_id))
  const poolA = data.playersForSeed('pool-a')
  const poolB = data.playersForSeed('pool-b')
  const customSet = new Set(customPlayerIds)
  const randomIdsA = poolA.filter((player) => !customSet.has(player.player_id)).map((player) => player.player_id)
  const randomIdsB = poolB.filter((player) => !customSet.has(player.player_id)).map((player) => player.player_id)
  const dynamicPoolValid = poolA.length === 40 && poolB.length === 40
    && customPlayerIds.every((id) => poolA.some((player) => player.player_id === id) && poolB.some((player) => player.player_id === id))
    && randomIdsA.some((id) => !randomIdsB.includes(id))
  const princeSpecs = engine.publicSpecs('P101')
  const princeFullyPlayable = ['熊德', '奶德', '猫德'].every((spec) => princeSpecs.some((entry) => entry.spec === spec))

  const noRezIds = ['P092', 'P083', 'P082', 'P096', 'P084', 'P086', 'P095', 'P097', 'P100', 'P091']
  const rezIds = ['P092', 'P083', 'P082', 'P096', 'P081', 'P087', 'P088', 'P095', 'P097', 'P100']
  let permanentDeathCanKill = false
  let battleResAccountingWorks = false
  let tankDeathStopsCombat = false
  for (let sampleSeed = 1; sampleSeed <= 600 && (!permanentDeathCanKill || !battleResAccountingWorks || !tankDeathStopsCombat); sampleSeed += 1) {
    const noRezTeam = noRezIds.map((id) => engine.createMember(id, `death-${sampleSeed}`))
    const rezTeam = rezIds.map((id) => engine.createMember(id, `rez-${sampleSeed}`))
    for (const boss of data.bosses.slice(1, 8)) {
      const noRezFight = engine.simulateCombat(`death-${sampleSeed}`, boss, 1, noRezTeam, 70, 0)
      if (noRezFight.killed && noRezFight.casualties > 0 && noRezFight.meters.some((meter) => meter.died && meter.activeRatio < 1)) permanentDeathCanKill = true
      const rezFight = engine.simulateCombat(`rez-${sampleSeed}`, boss, 1, rezTeam, 70, 0)
      if (rezFight.battleReses > 0 && rezFight.meters.some((meter) => meter.battleResurrected && meter.activeRatio < 1)) battleResAccountingWorks = true
      for (const fight of [noRezFight, rezFight]) {
        if (fight.deaths.some((death) => death.role === '坦克') && !fight.killed) tankDeathStopsCombat = true
      }
    }
  }

  const leaveNarrativeTypes = new Set()
  const wipeOpeners = new Set()
  let firstAttemptWipes = 0
  let firstAttemptLeavers = 0
  let softEvents = 0
  let recoveredSoftEvents = 0
  let namedRecoveries = 0
  let fatalEventsStopCombat = true
  let thirdAttemptLeavers = 0
  for (let sampleSeed = 1; sampleSeed <= 500; sampleSeed += 1) {
    const sampleOrder = engine.shuffled(data.playersPublic, `leave-${sampleSeed}`)
    const sampleTeam = sampleOrder.slice(0, 10).map((player) => engine.createMember(player.player_id, `leave-${sampleSeed}`))
    const first = engine.simulateCombat(`leave-${sampleSeed}`, data.bosses[12], 1, sampleTeam, 70, 0)
    if (!first.killed) {
      firstAttemptWipes += 1
      if (first.leaver) firstAttemptLeavers += 1
      if (first.chat[0]) wipeOpeners.add(first.chat[0])
    }
    for (const event of first.events.filter((event) => event.status === '险情')) {
      softEvents += 1
      if (event.recovery) recoveredSoftEvents += 1
      if (event.recoveryBy && event.recovery?.startsWith(event.recoveryBy)) namedRecoveries += 1
    }
    const fatalIndex = first.events.findIndex((event) => event.status === '失败')
    if (fatalIndex >= 0 && fatalIndex !== first.events.length - 1) fatalEventsStopCombat = false
    const second = engine.simulateCombat(`leave-${sampleSeed}`, data.bosses[12], 2, sampleTeam, 34, 0)
    if (second.leaver && second.leaveType && second.leaveReason) leaveNarrativeTypes.add(second.leaveType)
    const third = engine.simulateCombat(`leave-${sampleSeed}`, data.bosses[12], 3, sampleTeam, 28, 0)
    if (third.leaver) thirdAttemptLeavers += 1
  }
  const firstWipeDisbandRate = firstAttemptWipes ? firstAttemptLeavers / firstAttemptWipes : 0

  const result = {
    players: data.playersPublic.length,
    bosses: data.bosses.length,
    recruited: team.length,
    deterministicCombat: JSON.stringify(combatA) === JSON.stringify(combatB),
    deterministicAuction: JSON.stringify(auctionA) === JSON.stringify(auctionB),
    drops: auctionA.records.length,
    meters: combatA.meters.length,
    teamDpsRecorded: combatA.teamDps > 0,
    priceTiers: ['C', 'B', 'A', 'S'].map((grade) => engine.itemStartPrice({ grade })),
    fullLootCoverage,
    firstAttemptKills,
    structureFailuresAssignedToLeader,
    allowedSingleTankMisclassified,
    strongHealerKills,
    weakHealerKills,
    healerSkillMatters,
    sampledSales: sampledSales.length,
    basePriceRate: Number(basePriceRate.toFixed(3)),
    whaleRate: Number(whaleRate.toFixed(3)),
    unsoldRate: Number(unsoldRate.toFixed(3)),
    premiumReferenceRate: Number(premiumReferenceRate.toFixed(3)),
    premiumMedianRatio: Number(premiumMedianRatio.toFixed(3)),
    multiRoundAuctions,
    bidIncrements: [...bidIncrements].sort((a, b) => a - b),
    strictlyIncreasingBids,
    noSelfBidding,
    noDiscounts,
    customPlayersPreserved,
    newCustomPlayersActive,
    customProfileAverage: Number(customProfileAverage.toFixed(1)),
    randomProfileAverage: Number(randomProfileAverage.toFixed(1)),
    customPlayersStronger,
    hiddenSchemaOrganized,
    chatTemplates: data.chatTemplates.length,
    chatTemplateCoverage,
    attemptTwoGain: Number(attemptTwoGain.toFixed(2)),
    attemptThreeGain: Number(attemptThreeGain.toFixed(2)),
    attemptLearningWorks,
    requestedSpecChangesValid,
    publicEconomyClaimsValid,
    averageDamageSpread: Number(averageDamageSpread.toFixed(3)),
    tigerToMedian: Number(tigerToMedian.toFixed(3)),
    personalOutputVaries,
    damageBalanceValid,
    quietResponsibilitySamples,
    quietSpokenLines,
    quietPlayerRespected,
    franRecoveries,
    franFatalErrors,
    franCanBeRecovered,
    itemLevelAdjustmentsValid,
    itemLevel230Rate: Number(itemLevel230Rate.toFixed(3)),
    itemLevel232Rate: Number(itemLevel232Rate.toFixed(3)),
    publicInfoConsistent,
    unpickedReturnToPool,
    dynamicPoolValid,
    princeFullyPlayable,
    permanentDeathCanKill,
    battleResAccountingWorks,
    tankDeathStopsCombat,
    firstWipeDisbandRate: Number(firstWipeDisbandRate.toFixed(3)),
    wipeChatVariants: wipeOpeners.size,
    recoveryCoverage: softEvents ? Number((recoveredSoftEvents / softEvents).toFixed(3)) : 1,
    namedRecoveryCoverage: softEvents ? Number((namedRecoveries / softEvents).toFixed(3)) : 1,
    fatalEventsStopCombat,
    thirdAttemptLeavers,
    leaveNarrativeTypes: [...leaveNarrativeTypes],
  }
  console.log(JSON.stringify(result, null, 2))
  if (result.players !== 40 || result.bosses !== 14 || !result.deterministicCombat || !result.deterministicAuction || result.drops !== 2 || result.meters !== 10 || !result.teamDpsRecorded || result.priceTiers.join(',') !== '200,500,1000,2000' || !result.fullLootCoverage || result.firstAttemptKills >= 14 || !result.structureFailuresAssignedToLeader || !result.healerSkillMatters || result.basePriceRate < .34 || result.basePriceRate > .48 || result.whaleRate > .12 || result.unsoldRate < .07 || result.unsoldRate > .14 || result.premiumReferenceRate < .42 || result.premiumMedianRatio < .9 || result.multiRoundAuctions < 10 || !result.bidIncrements.includes(200) || !result.bidIncrements.includes(500) || !result.strictlyIncreasingBids || !result.noSelfBidding || !result.noDiscounts || !result.customPlayersPreserved || !result.newCustomPlayersActive || !result.customPlayersStronger || !result.hiddenSchemaOrganized || !result.chatTemplateCoverage || !result.attemptLearningWorks || !result.requestedSpecChangesValid || !result.publicEconomyClaimsValid || !result.damageBalanceValid || !result.quietPlayerRespected || !result.franCanBeRecovered || !result.itemLevelAdjustmentsValid || result.itemLevel230Rate > .08 || result.itemLevel232Rate > .02 || !result.publicInfoConsistent || !result.unpickedReturnToPool || !result.dynamicPoolValid || !result.princeFullyPlayable || !result.permanentDeathCanKill || !result.battleResAccountingWorks || !result.tankDeathStopsCombat || result.firstWipeDisbandRate > .12 || result.wipeChatVariants < 3 || result.recoveryCoverage !== 1 || result.namedRecoveryCoverage !== 1 || !result.fatalEventsStopCombat || result.thirdAttemptLeavers !== 0 || result.leaveNarrativeTypes.length < 3) process.exitCode = 1
} finally {
  await server.close()
}
