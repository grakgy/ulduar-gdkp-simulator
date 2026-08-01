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
  const endings = await server.ssrLoadModule('/src/endings.ts')
  const replacement = await server.ssrLoadModule('/src/replacement.ts')
  const runEvents = await server.ssrLoadModule('/src/runEvents.ts')
  const bossDecisionEvents = await server.ssrLoadModule('/src/bossDecisionEvents.ts')
  const playerStatus = await server.ssrLoadModule('/src/playerStatus.ts')
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

  const bugDecision = {
    id: 'bug',
    actorId: 'P092',
    bossId: 'B02',
    title: '',
    kicker: '',
    prompt: '',
    quote: '',
    choices: [],
  }
  const bugOutcomeCounts = { kill: 0, fight: 0, wipe: 0, 'tech-ending': 0 }
  for (let sampleSeed = 1; sampleSeed <= 5000; sampleSeed += 1) {
    const outcome = bossDecisionEvents.resolveBossDecision(`bug-outcome-${sampleSeed}`, bugDecision, 'accept', team)
    bugOutcomeCounts[outcome.action] += 1
  }
  const bugOutcomeRates = Object.fromEntries(Object.entries(bugOutcomeCounts).map(([key, value]) => [key, value / 5000]))
  const bugOutcomeDistributionValid = bugOutcomeRates.kill >= .47 && bugOutcomeRates.kill <= .53
    && bugOutcomeRates.fight >= .22 && bugOutcomeRates.fight <= .28
    && bugOutcomeRates.wipe >= .17 && bugOutcomeRates.wipe <= .23
    && bugOutcomeRates['tech-ending'] >= .035 && bugOutcomeRates['tech-ending'] <= .065

  const makeStructureTeam = (tankCount) => [
    ...data.playersPublic.filter((player) => player.signup_role === '坦克').slice(0, tankCount),
    ...data.playersPublic.filter((player) => player.signup_role === '治疗').slice(0, 2),
    ...data.playersPublic.filter((player) => player.signup_role.includes('DPS')).slice(0, 8 - tankCount),
  ]
  const dualTankFailures = []
  const threeTankFailures = []
  const dualTankResults = []
  const threeTankResults = []
  let allowedSingleTankMisclassified = 0
  for (let sampleSeed = 1; sampleSeed <= 100; sampleSeed += 1) {
    const oneTankTeam = makeStructureTeam(1).map((player) => ({ ...engine.createMember(player.player_id, `structure-1-${sampleSeed}`), itemLevel: 232 }))
    const threeTankTeam = makeStructureTeam(3).map((player) => ({ ...engine.createMember(player.player_id, `structure-3-${sampleSeed}`), itemLevel: 232 }))
    const dualTankResult = engine.simulateCombat(`dual-${sampleSeed}`, data.bosses[4], 1, oneTankTeam, 70, 0)
    const singleTankResult = engine.simulateCombat(`single-${sampleSeed}`, data.bosses[7], 1, oneTankTeam, 70, 0)
    const flexibleTankResult = engine.simulateCombat(`flex-${sampleSeed}`, data.bosses[10], 1, oneTankTeam, 70, 0)
    const threeTankResult = engine.simulateCombat(`three-${sampleSeed}`, data.bosses[10], 1, threeTankTeam, 70, 0)
    dualTankResults.push(dualTankResult)
    threeTankResults.push(threeTankResult)
    if (!dualTankResult.killed) dualTankFailures.push(dualTankResult)
    if (!threeTankResult.killed) threeTankFailures.push(threeTankResult)
    for (const result of [singleTankResult, flexibleTankResult]) {
      if (!result.killed && result.events.some((event) => event.name === '阵容结构崩盘') && result.reason.includes('坦克')) allowedSingleTankMisclassified += 1
    }
  }
  const structureSamples = [...dualTankResults, ...threeTankResults].filter((result) => result.events.some((event) => event.name === '阵容结构崩盘'))
  const structureFailureRate = structureSamples.length / (dualTankResults.length + threeTankResults.length)
  const structureFailuresAssignedToLeader = structureFailureRate >= .8 && structureFailureRate <= .9 && allowedSingleTankMisclassified === 0 && structureSamples.every((result) => result.responsible === '团长' && result.reason.includes('坦克') && result.events.some((event) => event.name === '阵容结构崩盘' && event.responsible === '团长'))
  const tanksForComposition = data.playersPublic.filter((player) => player.signup_role === '坦克').slice(0, 2)
  const healersForComposition = data.playersPublic.filter((player) => player.signup_role === '治疗').slice(0, 4)
  const dpsForComposition = data.playersPublic.filter((player) => player.signup_role.includes('DPS')).slice(0, 8)
  const compositionMember = (player, seed, itemLevel = 232) => ({ ...engine.createMember(player.player_id, seed), itemLevel })
  const oneHealerTeam = [...tanksForComposition.slice(0, 1), ...healersForComposition.slice(0, 1), ...dpsForComposition.slice(0, 8)].map((player) => compositionMember(player, 'one-healer'))
  const fourHealerTeam = [...tanksForComposition.slice(0, 1), ...healersForComposition, ...dpsForComposition.slice(0, 5)].map((player) => compositionMember(player, 'four-healer'))
  const extraTankLowDpsTeam = [...tanksForComposition, ...healersForComposition.slice(0, 3), ...dpsForComposition.slice(0, 5)].map((player) => compositionMember(player, 'extra-tank-low-dps'))
  const lowTankTeam = [
    compositionMember(tanksForComposition[0], 'low-tank', 200),
    ...healersForComposition.slice(0, 2).map((player) => compositionMember(player, 'low-tank')),
    ...dpsForComposition.slice(0, 7).map((player) => compositionMember(player, 'low-tank')),
  ]
  const oneHealerResult = engine.simulateCombat('one-healer', data.bosses[3], 1, oneHealerTeam, 70, 0)
  const fourHealerResult = engine.simulateCombat('four-healer', data.bosses[3], 1, fourHealerTeam, 70, 0)
  const extraTankLowDpsResult = engine.simulateCombat('extra-tank-low-dps', data.bosses[3], 1, extraTankLowDpsTeam, 70, 0)
  const lowTankResult = engine.simulateCombat('low-tank', data.bosses[11], 1, lowTankTeam, 70, 0)
  const strictCompositionValid = [oneHealerResult, fourHealerResult, extraTankLowDpsResult, lowTankResult]
    .every((result) => !result.killed && result.responsible === '团长' && result.events.some((event) => event.name === '阵容结构崩盘'))
    && oneHealerResult.reason.includes('至少需要2名治疗')
    && fourHealerResult.reason.includes('最多容纳3名治疗')
    && extraTankLowDpsResult.reason.includes('至少需要6名输出')
    && lowTankResult.reason.includes(`至少${data.bosses[11].min_tank_ilvl}装等`)
  const wipeMoraleConfigValid = oneHealerResult.moraleDelta === -Number(data.gameConfig.get('wipe_morale_loss_1'))
    && engine.simulateCombat('one-healer', data.bosses[3], 2, oneHealerTeam, 60, 0).moraleDelta === -Number(data.gameConfig.get('wipe_morale_loss_2'))
    && engine.simulateCombat('one-healer', data.bosses[3], 3, oneHealerTeam, 45, 0).moraleDelta === -Number(data.gameConfig.get('wipe_morale_loss_3'))
    && engine.simulateCombat('one-healer', data.bosses[3], 4, oneHealerTeam, 30, 0).moraleDelta === -Number(data.gameConfig.get('wipe_morale_loss_4'))

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
  const weakThreeHealerIds = healerCandidates.slice(-3).map((player) => player.player_id)
  const threeHealerCoreIds = ['P092', 'P083', 'P105', 'P120', 'P128', 'P084', 'P103']
  let strongHealerKills = 0
  let weakHealerKills = 0
  let weakThreeHealerKills = 0
  for (let sampleSeed = 1; sampleSeed <= 200; sampleSeed += 1) {
    const strongTeam = [...fixedCore.map((player) => player.player_id), ...strongHealerIds].map((id) => engine.createMember(id, `heal-strong-${sampleSeed}`))
    const weakTeam = [...fixedCore.map((player) => player.player_id), ...weakHealerIds].map((id) => engine.createMember(id, `heal-weak-${sampleSeed}`))
    const weakThreeHealerTeam = [...threeHealerCoreIds, ...weakThreeHealerIds].map((id) => engine.createMember(id, `heal-weak-three-${sampleSeed}`))
    if (engine.simulateCombat(`heal-${sampleSeed}`, data.bosses[10], 2, strongTeam, 74, 0).killed) strongHealerKills += 1
    if (engine.simulateCombat(`heal-${sampleSeed}`, data.bosses[10], 2, weakTeam, 74, 0).killed) weakHealerKills += 1
    if (engine.simulateCombat(`heal-three-${sampleSeed}`, data.bosses[10], 2, weakThreeHealerTeam, 74, 0).killed) weakThreeHealerKills += 1
  }
  const healerSkillMatters = strongHealerKills >= weakHealerKills + 20
  const threeHealerResponseWorks = weakThreeHealerKills > weakHealerKills

  const sampledSales = []
  const sampledRecords = []
  let highPremiumMoraleObserved = false
  let maxAuctionMorale = Number.NEGATIVE_INFINITY
  for (let sampleSeed = 1; sampleSeed <= 60; sampleSeed += 1) {
    const sampleOrder = engine.shuffled(data.playersPublic, String(sampleSeed))
    const sampleTeam = sampleOrder.slice(0, 10).map((player) => engine.createMember(player.player_id, String(sampleSeed)))
    for (const boss of data.bosses) {
      const auctionResult = engine.runAuction(String(sampleSeed), boss, sampleTeam)
      maxAuctionMorale = Math.max(maxAuctionMorale, auctionResult.moraleDelta)
      const records = auctionResult.records
      sampledRecords.push(...records)
      sampledSales.push(...records.filter((record) => !record.salvaged))
      if (auctionResult.moraleDelta >= 5 && records.some((record) => record.item.grade === 'S+' && !record.salvaged && record.price >= engine.itemReferencePrice(record.item))) highPremiumMoraleObserved = true
    }
  }
  const basePriceRate = sampledSales.length ? sampledSales.filter((record) => record.price === engine.itemStartPrice(record.item)).length / sampledSales.length : 0
  const whaleRate = sampledSales.length ? sampledSales.filter((record) => record.price >= engine.itemReferencePrice(record.item) * 1.6).length / sampledSales.length : 0
  const unsoldRate = sampledRecords.length ? sampledRecords.filter((record) => record.salvaged).length / sampledRecords.length : 0
  const premiumSales = sampledSales.filter((record) => ['S', 'S+'].includes(record.item.grade))
  const splusSales = sampledSales.filter((record) => record.item.grade === 'S+')
  const splusPeakRatio = splusSales.length ? Math.max(...splusSales.map((record) => record.price / engine.itemReferencePrice(record.item))) : 0
  const reserveGoldRemoved = data.playersHidden.every((player) => !Object.hasOwn(player, 'reserve_gold'))
    && Number(data.gameConfig.get('splus_bid_cap_multiplier')) === 1.5
  const premiumReferenceRate = premiumSales.length ? premiumSales.filter((record) => record.price >= engine.itemReferencePrice(record.item)).length / premiumSales.length : 0
  const premiumPriceRatios = premiumSales.map((record) => record.price / engine.itemReferencePrice(record.item)).sort((a, b) => a - b)
  const premiumMedianRatio = premiumPriceRatios[Math.floor(premiumPriceRatios.length / 2)] ?? 0
  const auctionAmount = (line) => {
    if (line.startsWith('团长') || line.startsWith('成交') || !line.includes('：')) return undefined
    const matches = line.slice(line.indexOf('：') + 1).match(/[\d,]+/g)
    const finalAmount = matches?.at(-1)
    return finalAmount ? Number(finalAmount.replaceAll(',', '')) : undefined
  }
  const strictlyIncreasingBids = sampledRecords.every((record) => {
    const amounts = record.log.map(auctionAmount).filter((value) => value !== undefined)
    return amounts.every((amount, index) => index === 0 || amount > amounts[index - 1])
  })
  const statusSamples = Array.from({ length: 20000 }, (_, index) => engine.createPlayerStatus(`status-${index}`, 'P081'))
  const expectedStatusRates = new Map(playerStatus.PLAYER_STATUS_WEIGHTS)
  const actualStatusRates = new Map([-3, -2, -1, 0, 1, 2, 3].map((level) => [level, statusSamples.filter((status) => status.actual === level).length / statusSamples.length]))
  const statusDistributionValid = [...expectedStatusRates].every(([level, expected]) => Math.abs((actualStatusRates.get(level) ?? 0) - expected) < .015)
  const statusDisplayValid = statusSamples.every((status) => Math.abs(status.displayed - status.actual) <= 1
    && status.displayed >= -3
    && status.displayed <= 3
    && playerStatus.PLAYER_STATUS_COPY[status.displayed].includes(status.text))
  const statusStableAcrossRefresh = JSON.stringify(engine.createPlayerStatus('persistent-status', 'P081')) === JSON.stringify(engine.createPlayerStatus('persistent-status', 'P081'))
  const statusFixture = engine.createMember('P081', 'status-ratings', { actual: 3, displayed: 2, text: '状态火热' })
  const lowStatusFixture = engine.createMember('P081', 'status-ratings', { actual: -3, displayed: -2, text: '明显疲惫' })
  const highStatusRatings = engine.effectiveCombatRatings(statusFixture)
  const lowStatusRatings = engine.effectiveCombatRatings(lowStatusFixture)
  const statusRatingsValid = highStatusRatings.mainSkill === 100
    && highStatusRatings.mechanics === 100
    && highStatusRatings.awareness === 100
    && Math.abs(lowStatusRatings.mainSkill - 81.6) < .001
    && Math.abs(lowStatusRatings.mechanics - 81.6) < .001
    && Math.abs(lowStatusRatings.awareness - 83.3) < .001
    && statusFixture.wallet === lowStatusFixture.wallet
    && statusFixture.performance === lowStatusFixture.performance
    && statusFixture.itemLevel === lowStatusFixture.itemLevel
  const playerStatusSystemValid = statusDistributionValid && statusDisplayValid && statusStableAcrossRefresh && statusRatingsValid
  const noSelfBidding = sampledRecords.every((record) => {
    const bidders = record.log.filter((line) => auctionAmount(line) !== undefined).map((line) => line.slice(0, line.indexOf('：')))
    return bidders.every((bidder, index) => index === 0 || bidder !== bidders[index - 1])
  })
  const multiRoundAuctions = sampledSales.filter((record) => record.log.filter((line) => auctionAmount(line) !== undefined).length >= 5).length
  const bidIncrements = new Set()
  for (const record of sampledSales.filter((record) => engine.itemStartPrice(record.item) >= 1000)) {
    const amounts = record.log.map(auctionAmount).filter((value) => value !== undefined)
    amounts.slice(1).forEach((amount, index) => bidIncrements.add(amount - amounts[index]))
  }
  const noDiscounts = sampledRecords.every((record) => record.log.every((line) => !line.includes('降到') && !line.includes('半价')))
  const fixedAuctionTemplates = data.chatTemplates.filter((entry) => entry.scene === '拍卖' && !entry.template.includes('{')).map((entry) => entry.template)
  const auctionTemplatesUsed = sampledRecords.some((record) => record.log.some((line) => fixedAuctionTemplates.some((template) => line.endsWith(template))))
  const dynamicMultiBidAuctions = sampledRecords.filter((record) => {
    const bidders = new Set(record.log.filter((line) => auctionAmount(line) !== undefined).map((line) => line.slice(0, line.indexOf('：'))))
    return bidders.size >= 3
  }).length
  const midAuctionExits = sampledRecords.filter((record) => (record.exitCount ?? 0) > 0).length
  const lateAuctionJoins = sampledRecords.filter((record) => (record.lateJoiners?.length ?? 0) > 0).length
  const numericBidLines = sampledRecords.flatMap((record) => record.log.filter((line) => auctionAmount(line) !== undefined))
  const compactBidRate = numericBidLines.length
    ? numericBidLines.filter((line) => /^[^：]+：[\d,]+$/.test(line)).length / numericBidLines.length
    : 0
  const noEmptyFollow = sampledRecords.every((record) => record.log.every((line) => !/我也跟|我也要/.test(line)))
  const soldAuctionsCountDown = sampledSales.every((record) => {
    const saleIndex = record.log.findIndex((line) => line.startsWith('成交：'))
    return saleIndex >= 5
      && record.log.slice(saleIndex - 5, saleIndex).join('|') === '团长：5|团长：4|团长：3|团长：2|团长：1'
  })
  let fullRunUniqueBuyers = 0
  let fullRunZeroSpenders = 0
  const fullRunSamples = 60
  for (let sampleSeed = 1; sampleSeed <= fullRunSamples; sampleSeed += 1) {
    const runSeed = `economy-distribution-${sampleSeed}`
    let runTeam = engine.shuffled(data.playersForSeed(runSeed), runSeed).slice(0, 10).map((player) => engine.createMember(player.player_id, runSeed))
    const buyerIds = new Set()
    for (const boss of data.bosses) {
      const auction = engine.runAuction(runSeed, boss, runTeam)
      runTeam = auction.team
      auction.records.filter((record) => !record.salvaged && record.buyerId).forEach((record) => buyerIds.add(record.buyerId))
    }
    fullRunUniqueBuyers += buyerIds.size
    fullRunZeroSpenders += runTeam.filter((member) => member.spent === 0).length
  }
  const averageFullRunBuyers = fullRunUniqueBuyers / fullRunSamples
  const averageFullRunZeroSpenders = fullRunZeroSpenders / fullRunSamples
  const auctionBuyerDistributionValid = averageFullRunBuyers >= 5 && averageFullRunBuyers <= 8 && averageFullRunZeroSpenders >= 2 && averageFullRunZeroSpenders <= 4.5

  const customPlayerIds = Array.from({ length: 53 }, (_, index) => `P${String(index + 81).padStart(3, '0')}`)
  const customPlayersPreserved = customPlayerIds.every((id) => data.publicById.has(id))
  const newCustomPlayersActive = customPlayerIds.every((id) => data.playersPublic.some((player) => player.player_id === id))
  const combatProfileScore = (player) => ['main_skill', 'mechanics', 'awareness', 'stability', 'teamwork'].reduce((sum, key) => sum + Number(player[key] ?? 0), 0) / 5
  const activeHidden = data.playersPublic.map((player) => data.hiddenById.get(player.player_id)).filter(Boolean)
  const customProfiles = activeHidden.filter((player) => player.source_type === '玩家自建')
  const randomProfiles = activeHidden.filter((player) => player.source_type === '随机生成')
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
  const customProfileAverage = average(customProfiles.map(combatProfileScore))
  const randomProfileAverage = average(randomProfiles.map(combatProfileScore))
  const customPlayersBalanced = customProfiles.length === 53
    && customProfiles.some((player) => combatProfileScore(player) >= 90)
    && customProfiles.some((player) => combatProfileScore(player) <= 35)
    && customProfileAverage >= randomProfileAverage - 5
  const requiredHiddenFields = ['source_type', 'personality_type', 'strength_tags', 'weakness_tags', 'special_rule', 'leave_policy', 'description']
  const hiddenSchemaOrganized = data.playersHidden.length === 133 && data.playersHidden.every((player) => requiredHiddenFields.every((field) => typeof player[field] === 'string') && player.source_type && player.personality_type && player.leave_policy && player.description)
  const chatScenes = new Set(data.chatTemplates.map((entry) => entry.scene))
  const chatCounts = new Map()
  data.chatTemplates.forEach((entry) => chatCounts.set(`${entry.scene}|${entry.style_or_trait}`, (chatCounts.get(`${entry.scene}|${entry.style_or_trait}`) ?? 0) + 1))
  const customTraits = new Set(customProfiles.flatMap((player) => [player.social_primary, player.social_secondary]).filter((trait) => trait && trait !== '无'))
  const customChatTraitsCovered = [...customTraits].every((trait) => (chatCounts.get(`灭团|${trait}`) ?? 0) > 0 && (chatCounts.get(`退团|${trait}`) ?? 0) > 0)
  const chatTemplateCoverage = ['报名', '灭团', '退团', '拍卖'].every((scene) => chatScenes.has(scene)) && [...chatCounts.values()].every((count) => count > 0) && data.chatTemplates.every((entry) => entry.style_or_trait && entry.template && !entry.template.includes('�')) && customChatTraitsCovered
  const targetedShortageStyles = [
    '输出不足-压力怪', '输出不足-数据执着', '输出不足-阴阳怪气',
    '治疗不足-压力怪', '治疗不足-数据执着', '治疗不足-阴阳怪气',
    '数值不足-调解者', '数值不足-老司机', '数值不足-老黄牛',
  ]
  const targetedChatTemplatesValid = data.chatTemplates.every((entry) => entry.speaker_scope && entry.target_scope && entry.maintenance_note)
    && targetedShortageStyles.every((style) => (chatCounts.get(`灭团|${style}`) ?? 0) >= 10)
    && data.chatTemplates
      .filter((entry) => entry.scene === '灭团' && /^(输出不足|治疗不足)-/.test(entry.style_or_trait))
      .every((entry) => entry.template.includes('{target}'))
  const combatLogCategories = new Map()
  data.combatLogTemplates.forEach((entry) => combatLogCategories.set(entry.category, (combatLogCategories.get(entry.category) ?? 0) + 1))
  const combatLogTemplatesValid = ['opening', 'kill', 'kill_deaths', 'wipe_fatal', 'wipe_attrition', 'wipe_enrage']
    .every((category) => (combatLogCategories.get(category) ?? 0) >= 10)
    && data.combatLogTemplates.every((entry) => entry.template && !entry.template.includes('�'))
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
      franRecoveries += fight.events.filter((event) => event.status === '险情' && event.responsible === '芙兰秀秀').length
      franFatalErrors += fight.events.filter((event) => event.status === '失败' && event.responsible === '芙兰秀秀').length
    }
  }
  const quietPlayerRespected = quietResponsibilitySamples > 0 && quietSpokenLines === 0
  const franCanBeRecovered = franRecoveries >= 10 && franRecoveries > franFatalErrors
  let matchedPersonalFailureSamples = 0
  let matchedPersonalFailureErrors = 0
  for (let sampleSeed = 1; sampleSeed <= 500 && matchedPersonalFailureSamples < 12; sampleSeed += 1) {
    const ids = ['P101', 'P092', 'P083', 'P082', 'P090', 'P084', 'P081', 'P086', 'P094', 'P095']
    const personalTeam = ids.map((id) => engine.createMember(id, `personal-chat-${sampleSeed}`))
    for (const boss of data.bosses) {
      const fight = engine.simulateCombat(`personal-chat-${sampleSeed}`, boss, 2, personalTeam, 55, 0)
      if (fight.responsible !== 'P101') continue
      const event = fight.events.find((entry) => entry.status === '失败' && entry.responsible === data.publicById.get('P101')?.name)
      if (!event || !/电脑|幻灯片|画面卡|卡住/.test(event.detail)) continue
      matchedPersonalFailureSamples += 1
      const reply = fight.chat.find((line) => line.startsWith(`${data.publicById.get('P101')?.name}：`)) ?? ''
      const quotes = [...event.detail.matchAll(/“([^”]{2,80})”/g)].map((match) => match[1])
      const expectedQuote = quotes.at(-1)
      if (expectedQuote ? !reply.includes(expectedQuote) : !/电脑|幻灯片|画面|卡/.test(reply)) matchedPersonalFailureErrors += 1
    }
  }
  const matchedPersonalFailureChatValid = matchedPersonalFailureSamples >= 5 && matchedPersonalFailureErrors === 0
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
  const unpickedReturnToPool = availableAfterPick.length === 57 && firstRound.slice(1).every((player) => availableAfterPick.some((candidate) => candidate.player_id === player.player_id))
  const poolA = data.playersForSeed('pool-a')
  const poolB = data.playersForSeed('pool-b')
  const customSet = new Set(customPlayerIds)
  const randomIdsA = poolA.filter((player) => !customSet.has(player.player_id)).map((player) => player.player_id)
  const randomIdsB = poolB.filter((player) => !customSet.has(player.player_id)).map((player) => player.player_id)
  const dynamicPoolValid = poolA.length === 58 && poolB.length === 58
    && customPlayerIds.every((id) => poolA.some((player) => player.player_id === id) && poolB.some((player) => player.player_id === id))
    && randomIdsA.length === 5 && randomIdsB.length === 5
    && randomIdsA.some((id) => !randomIdsB.includes(id))
  const princeSpecs = engine.publicSpecs('P101')
  const princeFullyPlayable = ['熊德', '奶德', '猫德'].every((spec) => princeSpecs.some((entry) => entry.spec === spec))
  const lemonSpecs = engine.publicSpecs('P102')
  const lemonFullyPlayable = data.publicById.get('P102')?.name === '柠檬七喜'
    && lemonSpecs.some((spec) => spec.spec === '奶萨' && spec.role === '治疗')
    && lemonSpecs.some((spec) => spec.spec === '元素' && spec.role === '远程DPS')
  const customBatchBFullyPlayable = Array.from({ length: 18 }, (_, index) => `P${String(index + 103).padStart(3, '0')}`).every((id) => data.publicById.has(id) && data.hiddenById.has(id) && engine.publicSpecs(id).length >= 1)
  const customBatchCFullyPlayable = Array.from({ length: 11 }, (_, index) => `P${String(index + 121).padStart(3, '0')}`).every((id) => data.publicById.has(id) && data.hiddenById.has(id) && engine.publicSpecs(id).length >= 1)
    && ['奶德', '鸟德', '熊德'].every((spec) => engine.publicSpecs('P122').some((entry) => entry.spec === spec))
  const customBatchDFullyPlayable = ['P132', 'P133'].every((id) => data.publicById.has(id) && data.hiddenById.has(id) && engine.publicSpecs(id).length >= 2)
    && ['冰法', '火法'].every((spec) => engine.publicSpecs('P132').some((entry) => entry.spec === spec))
    && ['狂暴战', '防战'].every((spec) => engine.publicSpecs('P133').some((entry) => entry.spec === spec))
  const decisionFixture = (id, actorId, trigger, resultTargetId) => ({
    id, actorId, trigger, resultTargetId, bossId: 'B04', title: '', kicker: '', prompt: '', quote: '', choices: [], copyVariant: 0,
  })
  const resolutionTags = (decision, choiceId, samples = 1200) => new Set(Array.from({ length: samples }, (_, index) =>
    bossDecisionEvents.resolveBossDecision(`decision-${decision.id}-${index}`, decision, choiceId, [engine.createMember(decision.actorId, `decision-${index}`)]).tag))
  const dataTags = resolutionTags(decisionFixture('data', 'P133', 'kill', 'P101'), 'publish')
  const celebrationTags = resolutionTags(decisionFixture('celebration', 'P131', 'kill'), 'celebrate')
  const macroTags = resolutionTags(decisionFixture('macro', 'P097', 'kill'), 'install')
  const quietSpeakTags = resolutionTags(decisionFixture('quiet', 'P093', 'wipe'), 'speak')
  const quietCalloutTags = resolutionTags(decisionFixture('quiet', 'P093', 'wipe'), 'callout')
  const leaderFixtureTeam = [engine.createMember('P132', 'leader-fixture')]
  const leaderFixtureCombat = { killed: false, remainingHp: 8, responsible: '', meters: [{ playerId: 'P132', role: '远程DPS', dps: 9000, hps: 0 }] }
  const p132LeaderTraitActive = Array.from({ length: 500 }, (_, index) => bossDecisionEvents.selectBossDecision({
    seed: `p132-leader-${index}`,
    boss: data.bosses[3],
    attempt: 2,
    team: leaderFixtureTeam,
    morale: 40,
    lastCombat: leaderFixtureCombat,
    usage: { run: [], boss: {} },
  })).some((decision) => decision?.id === 'leader')
  const healerDataFixtureTeam = [engine.createMember('P018', 'data-healer-fixture')]
  const healerDataFixtureCombat = { killed: true, remainingHp: 0, meters: [{ playerId: 'P018', role: '治疗', dps: 0, hps: 8000 }] }
  const healerDataDecisionBlocked = Array.from({ length: 500 }, (_, index) => bossDecisionEvents.selectBossDecision({
    seed: `data-healer-${index}`,
    boss: data.bosses[3],
    attempt: 1,
    team: healerDataFixtureTeam,
    morale: 70,
    lastCombat: healerDataFixtureCombat,
    usage: { run: [], boss: {} },
  })).every((decision) => decision?.id !== 'data')
  const dpsDataFixtureTeam = [engine.createMember('P013', 'data-dps-fixture')]
  const dpsDataFixtureCombat = { killed: true, remainingHp: 0, meters: [{ playerId: 'P013', role: '远程DPS', dps: 8000, hps: 0 }] }
  const dpsDataDecisionObserved = Array.from({ length: 500 }, (_, index) => bossDecisionEvents.selectBossDecision({
    seed: `data-dps-${index}`,
    boss: data.bosses[3],
    attempt: 1,
    team: dpsDataFixtureTeam,
    morale: 70,
    lastCombat: dpsDataFixtureCombat,
    usage: { run: [], boss: {} },
  })).some((decision) => decision?.id === 'data')
  const tankDataFixtureTeam = [engine.createMember('P014', 'data-tank-fixture')]
  const tankDataFixtureCombat = { killed: true, remainingHp: 0, meters: [{ playerId: 'P014', role: '坦克', dps: 3500, hps: 0 }] }
  const tankDataDecisionBlocked = Array.from({ length: 500 }, (_, index) => bossDecisionEvents.selectBossDecision({
    seed: `data-tank-${index}`,
    boss: data.bosses[3],
    attempt: 1,
    team: tankDataFixtureTeam,
    morale: 70,
    lastCombat: tankDataFixtureCombat,
    usage: { run: [], boss: {} },
  })).every((decision) => decision?.id !== 'data')
  const roleAwareDataDecisionValid = dpsDataDecisionObserved && healerDataDecisionBlocked && tankDataDecisionBlocked
  const protectedEventDeparture = app.buildBossDecisionDeparture(combatA, { action: 'leave', leaverId: 'P096', responsibleId: 'P095' })
  const eventDepartureDoesNotCollapse = protectedEventDeparture.leaveType === '开喷退团'
    && protectedEventDeparture.leaver === 'P096'
    && !protectedEventDeparture.leaveReason.includes('分崩离析')
  const shortRestSamples = Array.from({ length: 10000 }, (_, index) => engine.shortRestMoraleRecovery(`short-rest-${index}`, 'B08', 3, 20, false))
  const shortRestRate = shortRestSamples.filter((delta) => delta === 5).length / shortRestSamples.length
  const shortRestRecoveryValid = shortRestRate >= .085 && shortRestRate <= .115
    && engine.shortRestMoraleRecovery('short-rest-blocked', 'B08', 3, 21, false) === 0
    && engine.shortRestMoraleRecovery('short-rest-used', 'B08', 3, 20, true) === 0
  const newDecisionEventsValid = ['全团较劲', '有人不服', '发现划水'].every((tag) => dataTags.has(tag))
    && ['庆祝成功', '选曲翻车'].every((tag) => celebrationTags.has(tag))
    && ['确实好用', '宏不好用', '宏崩溃'].every((tag) => macroTags.has(tag))
    && ['士气大振', '士气小振', '开口喷人'].every((tag) => quietSpeakTags.has(tag))
    && ['报点清楚', '麦又没了'].every((tag) => quietCalloutTags.has(tag))
    && p132LeaderTraitActive
  const caiFamilyIds = ['P108', 'P115', 'P117']
  const caiFamilyProfilesValid = caiFamilyIds.every((id) => data.hiddenById.get(id)?.special_rule.includes('互斥') && data.hiddenById.get(id)?.special_rule.includes('死亡'))
  const expectedAtmosphereIds = ['P085', 'P087', 'P088', 'P094', 'P096', 'P098', 'P100', 'P101', 'P126', 'P131']
  const atmosphereRosterValid = expectedAtmosphereIds.every((id) => engine.atmospherePlayerIds.has(id)) && engine.atmospherePlayerIds.size === expectedAtmosphereIds.length && !engine.atmospherePlayerIds.has('P095')

  const endingBosses = data.bosses.map((boss) => ({ id: boss.boss_id, name: boss.boss_name, order: Number(boss.order) }))
  const endingMember = (id, left = false, blame = 0) => ({ id, name: data.publicById.get(id)?.name ?? id, left, blame, personality: data.hiddenById.get(id)?.personality_type ?? '' })
  const endingRun = (overrides = {}) => ({
    seed: 'ending-test',
    endReason: '',
    currentBossId: 'B01',
    histories: [],
    team: [endingMember('P092'), endingMember('P102')],
    bosses: endingBosses,
    pot: 0,
    ...overrides,
  })
  const endingConfigComplete = data.bosses.every((boss) => endings.BOSS_FAILURE_ENDINGS[boss.boss_id]?.length >= 5 && endings.BOSS_FAILURE_ENDINGS[boss.boss_id].every((entry) => entry.title && entry.body))
  const hiddenEnding = endings.resolveRunEnding(endingRun({ currentBossId: 'B14', histories: [{ bossId: 'B13', attempts: 1, killed: true, wipes: 0 }, { bossId: 'B14', attempts: 2, killed: true, wipes: 1 }], team: [endingMember('P101'), endingMember('P102')] }))
  const princeFailedObserverEnding = endings.resolveRunEnding(endingRun({ endReason: '五次失败', currentBossId: 'B14', histories: [{ bossId: 'B13', attempts: 1, killed: true, wipes: 0 }, { bossId: 'B14', attempts: 5, killed: false, wipes: 5 }], team: [endingMember('P101'), endingMember('P102')] }))
  const fullEnding = endings.resolveRunEnding(endingRun({ currentBossId: 'B14', histories: [{ bossId: 'B13', attempts: 1, killed: true, wipes: 0 }, { bossId: 'B14', attempts: 2, killed: true, wipes: 1 }] }))
  const mainEnding = endings.resolveRunEnding(endingRun({ currentBossId: 'B14', histories: [{ bossId: 'B13', attempts: 2, killed: true, wipes: 1 }] }))
  const leaveEnding = endings.resolveRunEnding(endingRun({ endReason: '成员退团散团', currentBossId: 'B09', leaverId: 'P102', leaveType: '战术下线', team: [endingMember('P092'), endingMember('P102', true)] }))
  const collapseEnding = endings.resolveRunEnding(endingRun({ endReason: '成员退团散团', currentBossId: 'B13', leaverId: 'P096', responsibleId: 'P095', leaveType: '分崩离析', leaveReason: '多多球把Kumaco当众喷哭，Kumaco直接退团，团队随即解散。', histories: endingBosses.slice(0, 12).map((boss) => ({ bossId: boss.id, attempts: 1, killed: true, wipes: 0 })), team: [endingMember('P095'), endingMember('P096', true)] }))
  const replacementFailureEnding = endings.resolveRunEnding(endingRun({ endReason: '组不到人', currentBossId: 'B09', leaverId: 'P102', leaveReason: '阿茸尝试喊人来替补，但是失败了。', team: [endingMember('P092'), endingMember('P102', true)] }))
  const notoriousEnding = endings.resolveRunEnding(endingRun({ endReason: '臭名昭著', currentBossId: 'B09', leaverId: 'P102', team: [endingMember('P092'), endingMember('P102', true)] }))
  const bossEnding = endings.resolveRunEnding(endingRun({ endReason: '五次失败', currentBossId: 'B11', histories: [{ bossId: 'B11', attempts: 5, killed: false, wipes: 5 }] }))
  const paidPrisonEnding = endings.resolveRunEnding(endingRun({ currentBossId: 'B11', pot: 100000, histories: [{ bossId: 'B10', attempts: 3, killed: true, wipes: 2 }], team: Array.from({ length: 10 }, (_, index) => endingMember(`P${String(index + 81).padStart(3, '0')}`)) }))
  const splitLootEnding = endings.resolveRunEnding(endingRun({ endReason: '散伙分行李', currentBossId: 'B08', pot: 12000, histories: [{ bossId: 'B07', attempts: 4, killed: true, wipes: 3 }, { bossId: 'B08', attempts: 3, killed: false, wipes: 3 }] }))
  const leaderRageEnding = endings.resolveRunEnding(endingRun({ endReason: '滚都滚', currentBossId: 'B11', histories: [{ bossId: 'B10', attempts: 5, killed: true, wipes: 4 }, { bossId: 'B11', attempts: 4, killed: false, wipes: 4 }] }))
  const blackGoldEnding = endings.resolveRunEnding(endingRun({ endReason: '黑金跑路', currentBossId: 'B08', pot: 25000, histories: [{ bossId: 'B07', attempts: 2, killed: true, wipes: 1 }] }))
  const fallbackEnding = endings.resolveRunEnding(endingRun())
  const endingPriorityValid = hiddenEnding.priority === 100 && hiddenEnding.hidden && Boolean(hiddenEnding.reward) && princeFailedObserverEnding.priority === 80 && !princeFailedObserverEnding.hidden && fullEnding.priority === 90 && mainEnding.priority === 80 && leaveEnding.priority === 70 && collapseEnding.priority === 95 && collapseEnding.hidden && Boolean(collapseEnding.reward) && collapseEnding.title === '分崩离析' && collapseEnding.body.includes('多多球') && collapseEnding.body.includes('Kumaco') && collapseEnding.reward?.detail.includes('Kumaco') && collapseEnding.reward.detail.includes('多多球') && collapseEnding.reward.detail.includes('首领还剩2个') && replacementFailureEnding.priority === 70 && replacementFailureEnding.title === '组不到人' && notoriousEnding.title === '臭名昭著' && bossEnding.priority === 60 && paidPrisonEnding.priority === 95 && paidPrisonEnding.hidden && paidPrisonEnding.title === '带薪坐牢' && splitLootEnding.priority === 95 && splitLootEnding.title === '散伙分行李' && leaderRageEnding.priority === 95 && leaderRageEnding.title === '滚，都滚！' && blackGoldEnding.priority === 95 && blackGoldEnding.title === '黑金跑路' && fallbackEnding.priority === 10
    && [hiddenEnding, princeFailedObserverEnding, fullEnding, mainEnding, leaveEnding, collapseEnding, replacementFailureEnding, notoriousEnding, bossEnding, paidPrisonEnding, splitLootEnding, leaderRageEnding, blackGoldEnding, fallbackEnding].every((ending) => ending.title && ending.body && ending.summary)
  const directHiddenEventConfigValid = data.gameConfig.has('split_loot_event_pct') && data.gameConfig.has('leader_rage_event_pct') && data.gameConfig.has('black_gold_run_pct')
    && typeof runEvents.hiddenEndingAfterWipe === 'function' && typeof runEvents.hiddenEndingAfterAuction === 'function'
  const payoutEligibilityValid = app.payoutEligible([engine.createMember('P092', 'payout'), { ...engine.createMember('P102', 'payout'), left: true }]).map((member) => member.id).join(',') === 'P092'

  const noRezIds = ['P092', 'P083', 'P082', 'P096', 'P084', 'P086', 'P095', 'P097', 'P100', 'P091']
  const rezIds = ['P092', 'P083', 'P082', 'P096', 'P081', 'P087', 'P088', 'P095', 'P097', 'P100']
  let permanentDeathCanKill = false
  let battleResAccountingWorks = false
  let battleResLimitedToOne = true
  let onlyDruidsBattleResOthers = true
  let shamanSelfResObserved = false
  let warlockSelfResObserved = false
  let tankDeathStopsCombat = false
  let throughputGateValid = true
  let killMoraleRangeValid = true
  const checkResRules = (fight) => {
    const quotaReses = fight.deaths.filter((death) => death.battleResurrected && data.publicById.get(death.playerId)?.class !== '萨满')
    if (quotaReses.length > 1) battleResLimitedToOne = false
    fight.deaths.filter((death) => death.battleResurrected).forEach((death) => {
      const targetClass = data.publicById.get(death.playerId)?.class
      if (death.resurrectedBy === death.name) {
        if (targetClass === '萨满') shamanSelfResObserved = true
        if (targetClass === '术士') warlockSelfResObserved = true
      } else {
        const source = data.playersPublic.find((player) => player.name === death.resurrectedBy)
        if (source?.class !== '德鲁伊') onlyDruidsBattleResOthers = false
      }
    })
  }
  for (let sampleSeed = 1; sampleSeed <= 600; sampleSeed += 1) {
    const noRezTeam = noRezIds.map((id) => engine.createMember(id, `death-${sampleSeed}`))
    const rezTeam = rezIds.map((id) => engine.createMember(id, `rez-${sampleSeed}`))
    for (const boss of data.bosses.slice(1, 8)) {
      const noRezFight = engine.simulateCombat(`death-${sampleSeed}`, boss, 1, noRezTeam, 70, 0)
      checkResRules(noRezFight)
      if (noRezFight.killed && noRezFight.casualties > 0 && noRezFight.meters.some((meter) => meter.died && meter.activeRatio < 1)) permanentDeathCanKill = true
      const rezFight = engine.simulateCombat(`rez-${sampleSeed}`, boss, 1, rezTeam, 70, 0)
      checkResRules(rezFight)
      if (rezFight.battleReses > 0 && rezFight.meters.some((meter) => meter.battleResurrected && meter.activeRatio < 1)) battleResAccountingWorks = true
      for (const fight of [noRezFight, rezFight]) {
        if (fight.deaths.some((death) => death.role === '坦克') && !fight.killed) tankDeathStopsCombat = true
        if (fight.killed && (fight.teamDps < fight.requiredTeamDps || fight.teamHps < fight.requiredTeamHps)) throughputGateValid = false
        const killMoraleMaximum = fight.moraleReason.includes('额外提振士气') ? 6 : 3
        if (fight.killed && (fight.moraleDelta < 1 || fight.moraleDelta > killMoraleMaximum)) killMoraleRangeValid = false
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
  let fifthAttemptLeavers = 0
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
      const recoveryAlreadyInDetail = /好在|还好|有惊无险|救了回来|勉强(?:站住|活了下来)|及时(?:给上|拉回|抬回)/.test(event.detail)
      if (event.recovery || recoveryAlreadyInDetail) recoveredSoftEvents += 1
      if ((event.recoveryBy && event.recovery?.startsWith(event.recoveryBy)) || recoveryAlreadyInDetail) namedRecoveries += 1
    }
    const fatalIndex = first.events.findIndex((event) => event.status === '失败')
    if (fatalIndex >= 0 && fatalIndex !== first.events.length - 1) fatalEventsStopCombat = false
    const second = engine.simulateCombat(`leave-${sampleSeed}`, data.bosses[12], 2, sampleTeam, 34, 0)
    if (second.leaver && second.leaveType && second.leaveReason) leaveNarrativeTypes.add(second.leaveType)
    const fifth = engine.simulateCombat(`leave-${sampleSeed}`, data.bosses[12], 5, sampleTeam, 12, 0)
    if (fifth.leaver) fifthAttemptLeavers += 1
  }
  const firstWipeDisbandRate = firstAttemptWipes ? firstAttemptLeavers / firstAttemptWipes : 0

  const glassTeamIds = ['P092', 'P101', 'P082', 'P096', 'P106', 'P081', 'P084', 'P093', 'P097', 'P086']
  let glassResponsibleSamples = 0
  let glassResponsibleSpoken = 0
  let glassNonResponsibleLeaks = 0
  let specialCollapseEligible = 0
  let specialCollapseObserved = 0
  let specialCollapseFirstAttemptObserved = 0
  const collapseTeamIds = ['P092', 'P101', 'P082', 'P096', 'P088', 'P100', 'P081', 'P095', 'P084', 'P097']
  for (let sampleSeed = 1; sampleSeed <= 250; sampleSeed += 1) {
    const glassTeam = glassTeamIds.map((id) => engine.createMember(id, `glass-${sampleSeed}`))
    const collapseTeam = collapseTeamIds.map((id) => {
      const member = engine.createMember(id, `collapse-${sampleSeed}`)
      if (['P096', 'P100', 'P088'].includes(id)) member.blame = 1
      return member
    })
    for (const boss of data.bosses) {
      const glassFight = engine.simulateCombat(`glass-${sampleSeed}`, boss, 1, glassTeam, 70, 0)
      const glassSpoke = glassFight.chat.some((line) => line.startsWith('鹿乃乃乃乃：'))
      if (glassFight.responsible === 'P106') {
        glassResponsibleSamples += 1
        if (glassSpoke) glassResponsibleSpoken += 1
      } else if (glassSpoke) {
        glassNonResponsibleLeaks += 1
      }
      const firstCollapseFight = engine.simulateCombat(`collapse-${sampleSeed}`, boss, 1, collapseTeam, 70, 0)
      if (firstCollapseFight.leaveType === '分崩离析') specialCollapseFirstAttemptObserved += 1
      const collapseFight = engine.simulateCombat(`collapse-${sampleSeed}`, boss, 2, collapseTeam, 58, 0)
      const collapseVictimNames = new Set(['P096', 'P100', 'P088'].map((id) => data.publicById.get(id)?.name))
      const victimWasResponsible = collapseFight.events.some((event) => event.status === '失败' && collapseVictimNames.has(event.responsible))
      if (!collapseFight.killed && victimWasResponsible) {
        specialCollapseEligible += 1
        if (collapseFight.leaveType === '分崩离析') specialCollapseObserved += 1
      }
    }
  }
  const glassHeartChatValid = glassResponsibleSamples > 0 && glassResponsibleSpoken === glassResponsibleSamples && glassNonResponsibleLeaks === 0
  const specialCollapseRate = specialCollapseEligible ? specialCollapseObserved / specialCollapseEligible : 0
  const specialLeaveRatesValid = data.hiddenById.get('P089')?.base_leave_pct === '1'
    && data.hiddenById.get('P089')?.leave_policy === '正常'
    && data.hiddenById.get('P087')?.leave_policy === '条件退队'
    && data.hiddenById.get('P098')?.leave_policy === '条件退队'
    && ['P104', 'P105', 'P107', 'P108', 'P109', 'P110', 'P111', 'P112', 'P113', 'P114', 'P116', 'P117', 'P119']
      .every((id) => data.hiddenById.get(id)?.base_leave_pct === '2')

  const replacementTeamIds = ['P092', 'P083', 'P084', 'P085', 'P086', 'P087', 'P089', 'P090', 'P093', 'P103']
  const replacementTeam = replacementTeamIds.map((id) => ({ ...engine.createMember(id, 'replacement-base'), left: id === 'P084' }))
  let firstReplacementSuccesses = 0
  let secondReplacementSuccesses = 0
  let thirdReplacementSuccesses = 0
  let fourthReplacementSuccesses = 0
  let replacementCandidatesValid = true
  for (let sampleSeed = 1; sampleSeed <= 1000; sampleSeed += 1) {
    const firstDecision = replacement.replacementDecision(`replacement-${sampleSeed}`, 'B08', 1, 1, 'P084', replacementTeam, 'prep')
    const secondDecision = replacement.replacementDecision(`replacement-${sampleSeed}`, 'B08', 1, 2, 'P084', replacementTeam, 'prep')
    const thirdDecision = replacement.replacementDecision(`replacement-${sampleSeed}`, 'B08', 1, 3, 'P084', replacementTeam, 'prep')
    const fourthDecision = replacement.replacementDecision(`replacement-${sampleSeed}`, 'B08', 1, 4, 'P084', replacementTeam, 'prep')
    if (firstDecision.plan) firstReplacementSuccesses += 1
    if (secondDecision.plan) secondReplacementSuccesses += 1
    if (thirdDecision.plan) thirdReplacementSuccesses += 1
    if (fourthDecision.plan) fourthReplacementSuccesses += 1
    for (const decision of [firstDecision, secondDecision, thirdDecision, fourthDecision]) {
      if (decision.plan && (!decision.plan.recruiterName || decision.plan.candidateIds.length < 1 || decision.plan.candidateIds.length > 3 || decision.plan.candidateIds.some((id) => replacementTeamIds.includes(id) || Number(id.slice(1)) < 81 || Number(id.slice(1)) > 131))) replacementCandidatesValid = false
    }
  }
  const firstReplacementRate = firstReplacementSuccesses / 1000
  const secondReplacementRate = secondReplacementSuccesses / 1000
  const thirdReplacementRate = thirdReplacementSuccesses / 1000
  const fourthReplacementRate = fourthReplacementSuccesses / 1000
  const fifthReplacement = replacement.replacementDecision('replacement-fifth', 'B08', 1, 5, 'P084', replacementTeam, 'prep')
  const noRecruiterTeam = ['P001', 'P002', 'P003', 'P004', 'P005', 'P006', 'P007', 'P008', 'P009', 'P010'].map((id) => ({ ...engine.createMember(id, 'no-recruiter'), left: id === 'P001' }))
  const noRecruiterDecision = replacement.replacementDecision('no-recruiter', 'B08', 1, 1, 'P001', noRecruiterTeam, 'prep')
  const replacementSystemValid = firstReplacementRate >= .98
    && secondReplacementRate >= .96 && secondReplacementRate <= .995
    && thirdReplacementRate >= .94 && thirdReplacementRate <= .985
    && fourthReplacementRate >= .9 && fourthReplacementRate <= .97
    && fifthReplacement.endReason === '臭名昭著'
    && noRecruiterDecision.endReason === '组不到人'
    && replacementCandidatesValid

  const tigerTeamIds = ['P081', 'P092', 'P082', 'P083', 'P084', 'P085', 'P086', 'P087', 'P090', 'P097']
  let tigerEligibleWipes = 0
  let tigerLeaves = 0
  for (let sampleSeed = 1; sampleSeed <= 2500; sampleSeed += 1) {
    const tigerTeam = tigerTeamIds.map((id) => engine.createMember(id, `tiger-leave-${sampleSeed}`))
    const fight = engine.simulateCombat(`tiger-leave-${sampleSeed}`, data.bosses[12], 2, tigerTeam, 34, 0)
    if (!fight.killed) {
      tigerEligibleWipes += 1
      if (fight.leaver === 'P081') tigerLeaves += 1
    }
  }
  const tigerLeaveRate = tigerEligibleWipes ? tigerLeaves / tigerEligibleWipes : 0
  const tigerCanActuallyLeave = tigerLeaves > 0 && tigerLeaveRate >= .03

  const buffTeam = ['P084', 'P103', 'P092', 'P081', 'P105', 'P091', 'P094', 'P096'].map((id) => engine.createMember(id, 'buff-team'))
  const activeBuffIds = new Set(engine.activeRaidBuffs(buffTeam).map((buff) => buff.buff_id))
  const combatRogueBuffIds = new Set(engine.activeRaidBuffs([engine.createMember('P001', 'combat-rogue-buff')]).map((buff) => buff.buff_id))
  const assassinationRogueBuffIds = new Set(engine.activeRaidBuffs([engine.createMember('P006', 'assassination-rogue-buff')]).map((buff) => buff.buff_id))
  const raidBuffConfigValid = data.raidBuffs.length === 10
    && ['battle_shout', 'arcane_brilliance', 'blessing_of_kings', 'bloodlust', 'demonic_pact', 'horn_of_winter', 'gift_of_the_wild', 'moonkin_form', 'prayer_of_fortitude'].every((id) => activeBuffIds.has(id))
    && combatRogueBuffIds.has('savage_combat')
    && !assassinationRogueBuffIds.has('savage_combat')
    && data.raidBuffs.every((buff) => ['physical_pct', 'caster_pct', 'melee_pct', 'ranged_pct', 'healing_pct'].some((key) => Number(buff[key]) > 0))

  const specialEventNames = new Set()
  let anonymousFailureSamples = 0
  let anonymousSelfApologies = 0
  let responsibleReplies = 0
  let responsibleUnrelatedReplies = 0
  let nonResponsibleSelfBlame = 0
  const selfBlameTemplates = new Set(data.chatTemplates.filter((entry) => entry.scene === '灭团' && entry.style_or_trait === '责任型').map((entry) => entry.template))
  const unrelatedResponsibleTemplates = new Set(data.chatTemplates.filter((entry) => entry.scene === '灭团' && ['气氛组', '调解者', '团队执行', '压力怪', '厌蠢症', '拱火者', '阴阳怪气'].includes(entry.style_or_trait)).map((entry) => entry.template))
  for (let sampleSeed = 1; sampleSeed <= 3000; sampleSeed += 1) {
    const specialTeam = ['P092', 'P101', 'P082', 'P096', 'P093', 'P081', 'P084', 'P086', 'P097', 'P103'].map((id) => {
      const member = engine.createMember(id, `special-event-${sampleSeed}`)
      if (id === 'P082') member.currentSpec = '暗牧'
      if (id === 'P093') member.currentSpec = '戒律牧'
      return member
    })
    const fight = engine.simulateCombat(`special-event-${sampleSeed}`, data.bosses[4], 1, specialTeam, 70, 0)
    fight.events.forEach((event) => {
      if (['没切天赋', '技能没拖出来', '自动奔跑开怪'].includes(event.name)) specialEventNames.add(event.name)
    })
    if (!fight.killed && !fight.responsible) {
      anonymousFailureSamples += 1
      if (fight.chat.some((line) => /：(?:我的|我锅|这波我背|看见了，我锅)/.test(line))) anonymousSelfApologies += 1
    }
    const responsibleName = data.publicById.get(fight.responsible)?.name
    fight.chat.forEach((line) => {
      if (!line.includes('：')) return
      const speaker = line.slice(0, line.indexOf('：'))
      const words = line.slice(line.indexOf('：') + 1)
      if (responsibleName && speaker === responsibleName) {
        responsibleReplies += 1
        if (unrelatedResponsibleTemplates.has(words)) responsibleUnrelatedReplies += 1
      } else if (selfBlameTemplates.has(words)) nonResponsibleSelfBlame += 1
    })
  }
  const specialWipeEventsValid = specialEventNames.size === 3
  const anonymousFailureChatValid = anonymousFailureSamples > 0 && anonymousSelfApologies === 0
  const responsibilityAwareChatValid = responsibleReplies > 0 && responsibleUnrelatedReplies === 0 && nonResponsibleSelfBlame === 0

  const makeTargetedChatTeam = (seed, healerIds, healerItemLevel, dpsItemLevel) => {
    const ids = ['P092', 'P084', ...healerIds, 'P081', 'P095', 'P085', 'P120', 'P100', 'P019']
    return ids.map((id) => {
      const member = engine.createMember(id, seed)
      if (id === 'P084') member.currentSpec = '防战'
      member.itemLevel = healerIds.includes(id) ? healerItemLevel : data.publicById.get(id)?.signup_role?.includes('DPS') ? dpsItemLevel : 225
      return member
    })
  }
  const criticTraits = new Set(['压力怪', '数据执着', '阴阳怪气'])
  const supportTraits = new Set(['调解者', '老司机', '老黄牛'])
  const playerHasTrait = (playerId, traits) => {
    const hidden = data.hiddenById.get(playerId)
    return hidden && [hidden.social_primary, hidden.social_secondary].some((trait) => traits.has(trait))
  }
  let outputShortageChats = 0
  let healingShortageChats = 0
  let targetedShortageChatErrors = 0
  for (let sampleSeed = 1; sampleSeed <= 1500 && (outputShortageChats < 20 || healingShortageChats < 20); sampleSeed += 1) {
    const scenarios = [
      {
        expected: '输出不足',
        fight: engine.simulateCombat(
          `targeted-output-${sampleSeed}`,
          data.bosses[13],
          4,
          makeTargetedChatTeam(`targeted-output-${sampleSeed}`, ['P096', 'P090'], 232, 200),
          70,
          0,
        ),
      },
      {
        expected: '治疗不足',
        fight: engine.simulateCombat(
          `targeted-healing-${sampleSeed}`,
          data.bosses[13],
          1,
          makeTargetedChatTeam(`targeted-healing-${sampleSeed}`, ['P050', 'P057'], 200, 232),
          70,
          0,
        ),
      },
    ]
    for (const { expected, fight } of scenarios) {
      if (fight.failureCause !== expected || fight.responsible) continue
      const meterPool = fight.meters.filter((meter) => expected === '输出不足' ? meter.role.includes('DPS') : meter.role === '治疗')
      const weakest = meterPool.sort((left, right) => expected === '输出不足' ? left.dps - right.dps : left.hps - right.hps)[0]
      const criticNames = new Set(fight.meters.filter((meter) => playerHasTrait(meter.playerId, criticTraits)).map((meter) => meter.name))
      const supportNames = new Set(fight.meters.filter((meter) => playerHasTrait(meter.playerId, supportTraits)).map((meter) => meter.name))
      const criticLines = fight.chat.filter((line) => criticNames.has(line.slice(0, line.indexOf('：'))))
      const supportLines = fight.chat.filter((line) => supportNames.has(line.slice(0, line.indexOf('：'))))
      const targetedCriticLines = weakest ? criticLines.filter((line) => line.includes(weakest.name)) : []
      if (!weakest || targetedCriticLines.length !== 1 || supportLines.length < 1) targetedShortageChatErrors += 1
      if (expected === '输出不足') outputShortageChats += 1
      else healingShortageChats += 1
    }
  }
  const targetedShortageChatValid = outputShortageChats >= 10 && healingShortageChats >= 10 && targetedShortageChatErrors === 0

  const result = {
    players: data.playersPublic.length,
    bosses: data.bosses.length,
    recruited: team.length,
    deterministicCombat: JSON.stringify(combatA) === JSON.stringify(combatB),
    deterministicAuction: JSON.stringify(auctionA) === JSON.stringify(auctionB),
    drops: auctionA.records.length,
    meters: combatA.meters.length,
    teamDpsRecorded: combatA.teamDps > 0,
    playerStatusSystemValid,
    statusDistributionValid,
    statusDisplayValid,
    statusStableAcrossRefresh,
    statusRatingsValid,
    priceTiers: ['C', 'B', 'A', 'S', 'S+'].map((grade) => engine.itemStartPrice({ grade })),
    splusReferencePrice: engine.itemReferencePrice({ grade: 'S+' }),
    fullLootCoverage,
    firstAttemptKills,
    bugOutcomeRates,
    bugOutcomeDistributionValid,
    structureFailuresAssignedToLeader,
    structureFailureRate: Number(structureFailureRate.toFixed(3)),
    allowedSingleTankMisclassified,
    strictCompositionValid,
    wipeMoraleConfigValid,
    strongHealerKills,
    weakHealerKills,
    weakThreeHealerKills,
    healerSkillMatters,
    threeHealerResponseWorks,
    sampledSales: sampledSales.length,
    basePriceRate: Number(basePriceRate.toFixed(3)),
    whaleRate: Number(whaleRate.toFixed(3)),
    unsoldRate: Number(unsoldRate.toFixed(3)),
    premiumReferenceRate: Number(premiumReferenceRate.toFixed(3)),
    premiumMedianRatio: Number(premiumMedianRatio.toFixed(3)),
    splusPeakRatio: Number(splusPeakRatio.toFixed(3)),
    reserveGoldRemoved,
    highPremiumMoraleObserved,
    maxAuctionMorale,
    multiRoundAuctions,
    bidIncrements: [...bidIncrements].sort((a, b) => a - b),
    strictlyIncreasingBids,
    noSelfBidding,
    noDiscounts,
    auctionTemplatesUsed,
    dynamicMultiBidAuctions,
    midAuctionExits,
    lateAuctionJoins,
    compactBidRate: Number(compactBidRate.toFixed(3)),
    noEmptyFollow,
    soldAuctionsCountDown,
    averageFullRunBuyers: Number(averageFullRunBuyers.toFixed(2)),
    averageFullRunZeroSpenders: Number(averageFullRunZeroSpenders.toFixed(2)),
    auctionBuyerDistributionValid,
    customPlayersPreserved,
    newCustomPlayersActive,
    customProfileAverage: Number(customProfileAverage.toFixed(1)),
    randomProfileAverage: Number(randomProfileAverage.toFixed(1)),
    customPlayersBalanced,
    hiddenSchemaOrganized,
    chatTemplates: data.chatTemplates.length,
    chatTemplateCoverage,
    targetedChatTemplatesValid,
    combatLogTemplatesValid,
    customChatTraitsCovered,
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
    matchedPersonalFailureSamples,
    matchedPersonalFailureErrors,
    matchedPersonalFailureChatValid,
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
    lemonFullyPlayable,
    customBatchBFullyPlayable,
    customBatchCFullyPlayable,
    customBatchDFullyPlayable,
    newDecisionEventsValid,
    roleAwareDataDecisionValid,
    eventDepartureDoesNotCollapse,
    shortRestRate: Number(shortRestRate.toFixed(3)),
    shortRestRecoveryValid,
    p132LeaderTraitActive,
    caiFamilyProfilesValid,
    atmosphereRosterValid,
    endingConfigComplete,
    endingPriorityValid,
    directHiddenEventConfigValid,
    payoutEligibilityValid,
    permanentDeathCanKill,
    battleResAccountingWorks,
    battleResLimitedToOne,
    onlyDruidsBattleResOthers,
    shamanSelfResObserved,
    warlockSelfResObserved,
    tankDeathStopsCombat,
    throughputGateValid,
    killMoraleRangeValid,
    firstWipeDisbandRate: Number(firstWipeDisbandRate.toFixed(3)),
    glassResponsibleSamples,
    glassResponsibleSpoken,
    glassNonResponsibleLeaks,
    glassHeartChatValid,
    specialCollapseEligible,
    specialCollapseObserved,
    specialCollapseFirstAttemptObserved,
    specialCollapseRate: Number(specialCollapseRate.toFixed(3)),
    specialLeaveRatesValid,
    firstReplacementRate: Number(firstReplacementRate.toFixed(3)),
    secondReplacementRate: Number(secondReplacementRate.toFixed(3)),
    thirdReplacementRate: Number(thirdReplacementRate.toFixed(3)),
    fourthReplacementRate: Number(fourthReplacementRate.toFixed(3)),
    replacementCandidatesValid,
    replacementSystemValid,
    tigerEligibleWipes,
    tigerLeaves,
    tigerLeaveRate: Number(tigerLeaveRate.toFixed(3)),
    tigerCanActuallyLeave,
    raidBuffConfigValid,
    specialWipeEvents: [...specialEventNames],
    specialWipeEventsValid,
    anonymousFailureSamples,
    anonymousSelfApologies,
    anonymousFailureChatValid,
    responsibleReplies,
    responsibleUnrelatedReplies,
    nonResponsibleSelfBlame,
    responsibilityAwareChatValid,
    outputShortageChats,
    healingShortageChats,
    targetedShortageChatErrors,
    targetedShortageChatValid,
    wipeChatVariants: wipeOpeners.size,
    recoveryCoverage: softEvents ? Number((recoveredSoftEvents / softEvents).toFixed(3)) : 1,
    namedRecoveryCoverage: softEvents ? Number((namedRecoveries / softEvents).toFixed(3)) : 1,
    fatalEventsStopCombat,
    fifthAttemptLeavers,
    leaveNarrativeTypes: [...leaveNarrativeTypes],
  }
  console.log(JSON.stringify(result, null, 2))
  if (result.players !== 58 || result.bosses !== 14 || !result.deterministicCombat || !result.deterministicAuction || result.drops !== 2 || result.meters !== 10 || !result.teamDpsRecorded || !result.playerStatusSystemValid || !result.auctionBuyerDistributionValid || result.priceTiers.join(',') !== '200,500,1000,2000,5000' || result.splusReferencePrice !== 10000 || result.splusPeakRatio < 2 || !result.reserveGoldRemoved || !result.fullLootCoverage || result.firstAttemptKills >= 14 || !result.bugOutcomeDistributionValid || !result.structureFailuresAssignedToLeader || !result.strictCompositionValid || !result.wipeMoraleConfigValid || !result.healerSkillMatters || !result.threeHealerResponseWorks || result.basePriceRate < .18 || result.basePriceRate > .55 || result.whaleRate > .16 || result.unsoldRate < .05 || result.unsoldRate > .18 || result.premiumReferenceRate < .35 || result.premiumMedianRatio < .8 || !result.highPremiumMoraleObserved || result.maxAuctionMorale !== 15 || result.multiRoundAuctions < 10 || result.dynamicMultiBidAuctions < 10 || result.midAuctionExits < 10 || result.lateAuctionJoins < 10 || result.compactBidRate < .7 || result.compactBidRate > .8 || !result.noEmptyFollow || !result.soldAuctionsCountDown || !result.bidIncrements.includes(200) || !result.bidIncrements.includes(500) || !result.strictlyIncreasingBids || !result.noSelfBidding || !result.noDiscounts || !result.auctionTemplatesUsed || !result.customPlayersPreserved || !result.newCustomPlayersActive || !result.customPlayersBalanced || !result.hiddenSchemaOrganized || !result.chatTemplateCoverage || !result.targetedChatTemplatesValid || !result.combatLogTemplatesValid || !result.customChatTraitsCovered || !result.attemptLearningWorks || !result.requestedSpecChangesValid || !result.publicEconomyClaimsValid || !result.damageBalanceValid || !result.quietPlayerRespected || !result.matchedPersonalFailureChatValid || !result.franCanBeRecovered || !result.itemLevelAdjustmentsValid || result.itemLevel230Rate > .08 || result.itemLevel232Rate > .02 || !result.publicInfoConsistent || !result.unpickedReturnToPool || !result.dynamicPoolValid || !result.princeFullyPlayable || !result.lemonFullyPlayable || !result.customBatchBFullyPlayable || !result.customBatchCFullyPlayable || !result.customBatchDFullyPlayable || !result.newDecisionEventsValid || !result.roleAwareDataDecisionValid || !result.eventDepartureDoesNotCollapse || !result.shortRestRecoveryValid || !result.caiFamilyProfilesValid || !result.atmosphereRosterValid || !result.endingConfigComplete || !result.endingPriorityValid || !result.directHiddenEventConfigValid || !result.payoutEligibilityValid || !result.permanentDeathCanKill || !result.battleResAccountingWorks || !result.battleResLimitedToOne || !result.onlyDruidsBattleResOthers || !result.shamanSelfResObserved || !result.warlockSelfResObserved || !result.tankDeathStopsCombat || !result.throughputGateValid || !result.killMoraleRangeValid || result.firstWipeDisbandRate > .12 || !result.glassHeartChatValid || result.specialCollapseFirstAttemptObserved !== 0 || result.specialCollapseObserved < 1 || result.specialCollapseRate < .4 || result.specialCollapseRate > .7 || !result.specialLeaveRatesValid || !result.replacementSystemValid || !result.tigerCanActuallyLeave || !result.raidBuffConfigValid || !result.specialWipeEventsValid || !result.anonymousFailureChatValid || !result.responsibilityAwareChatValid || !result.targetedShortageChatValid || result.wipeChatVariants < 3 || result.recoveryCoverage !== 1 || result.namedRecoveryCoverage !== 1 || !result.fatalEventsStopCombat || result.fifthAttemptLeavers !== 0 || result.leaveNarrativeTypes.length < 3) process.exitCode = 1
} finally {
  await server.close()
}
