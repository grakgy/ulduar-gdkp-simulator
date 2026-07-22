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
    if (engine.simulateCombat(`heal-${sampleSeed}`, data.bosses[3], 2, strongTeam, 74, 0).killed) strongHealerKills += 1
    if (engine.simulateCombat(`heal-${sampleSeed}`, data.bosses[3], 2, weakTeam, 74, 0).killed) weakHealerKills += 1
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
  const whaleRate = sampledSales.length ? sampledSales.filter((record) => record.price >= engine.itemStartPrice(record.item) * 3).length / sampledSales.length : 0
  const unsoldRate = sampledRecords.length ? sampledRecords.filter((record) => record.salvaged).length / sampledRecords.length : 0
  const strictlyIncreasingBids = sampledRecords.every((record) => {
    const amounts = record.log.filter((line) => !line.startsWith('团长') && !line.startsWith('成交')).map((line) => line.match(/：([\d,]+)G/)?.[1]).filter(Boolean).map((value) => Number(value.replaceAll(',', '')))
    return amounts.every((amount, index) => index === 0 || amount > amounts[index - 1])
  })
  const multiRoundAuctions = sampledSales.filter((record) => record.log.filter((line) => /：[\d,]+G/.test(line) && !line.startsWith('团长')).length >= 5).length
  const bidIncrements = new Set()
  for (const record of sampledSales.filter((record) => engine.itemStartPrice(record.item) >= 1000)) {
    const amounts = record.log.filter((line) => !line.startsWith('团长') && !line.startsWith('成交')).map((line) => line.match(/：([\d,]+)G/)?.[1]).filter(Boolean).map((value) => Number(value.replaceAll(',', '')))
    amounts.slice(1).forEach((amount, index) => bidIncrements.add(amount - amounts[index]))
  }
  const noDiscounts = sampledRecords.every((record) => record.log.every((line) => !line.includes('降到') && !line.includes('半价')))

  const customPlayerIds = Array.from({ length: 13 }, (_, index) => `P${String(index + 81).padStart(3, '0')}`)
  const customPlayersPreserved = customPlayerIds.every((id) => data.publicById.has(id))
  const newCustomPlayersActive = customPlayerIds.slice(5).every((id) => data.playersPublic.some((player) => player.player_id === id))
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
      if (event.recoveryBy && event.recovery?.startsWith(`${event.recoveryBy}：`)) namedRecoveries += 1
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
    multiRoundAuctions,
    bidIncrements: [...bidIncrements].sort((a, b) => a - b),
    strictlyIncreasingBids,
    noDiscounts,
    customPlayersPreserved,
    newCustomPlayersActive,
    itemLevelAdjustmentsValid,
    itemLevel230Rate: Number(itemLevel230Rate.toFixed(3)),
    itemLevel232Rate: Number(itemLevel232Rate.toFixed(3)),
    publicInfoConsistent,
    unpickedReturnToPool,
    firstWipeDisbandRate: Number(firstWipeDisbandRate.toFixed(3)),
    wipeChatVariants: wipeOpeners.size,
    recoveryCoverage: softEvents ? Number((recoveredSoftEvents / softEvents).toFixed(3)) : 1,
    namedRecoveryCoverage: softEvents ? Number((namedRecoveries / softEvents).toFixed(3)) : 1,
    fatalEventsStopCombat,
    thirdAttemptLeavers,
    leaveNarrativeTypes: [...leaveNarrativeTypes],
  }
  console.log(JSON.stringify(result, null, 2))
  if (result.players !== 40 || result.bosses !== 14 || !result.deterministicCombat || !result.deterministicAuction || result.drops !== 2 || result.meters !== 10 || !result.teamDpsRecorded || result.priceTiers.join(',') !== '200,500,1000,2000' || !result.fullLootCoverage || result.firstAttemptKills >= 14 || !result.structureFailuresAssignedToLeader || !result.healerSkillMatters || result.basePriceRate < .34 || result.basePriceRate > .48 || result.whaleRate > .15 || result.unsoldRate < .07 || result.unsoldRate > .14 || result.multiRoundAuctions < 10 || !result.bidIncrements.includes(200) || !result.bidIncrements.includes(500) || !result.strictlyIncreasingBids || !result.noDiscounts || !result.customPlayersPreserved || !result.newCustomPlayersActive || !result.itemLevelAdjustmentsValid || result.itemLevel230Rate > .08 || result.itemLevel232Rate > .02 || !result.publicInfoConsistent || !result.unpickedReturnToPool || result.firstWipeDisbandRate > .12 || result.wipeChatVariants < 3 || result.recoveryCoverage !== 1 || result.namedRecoveryCoverage !== 1 || !result.fatalEventsStopCombat || result.thirdAttemptLeavers !== 0 || result.leaveNarrativeTypes.length < 3) process.exitCode = 1
} finally {
  await server.close()
}
