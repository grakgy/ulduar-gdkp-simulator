import fs from 'node:fs/promises'

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1 }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); cell = ''
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const [headers, ...body] = rows
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, ''), values[index] ?? ''])))
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

async function readCsv(path) {
  return parseCsv(await fs.readFile(path, 'utf8'))
}

async function writeCsv(path, headers, rows) {
  const lines = [headers.join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))]
  await fs.writeFile(path, `${lines.join('\r\n')}\r\n`, 'utf8')
}

const publicPlayers = await readCsv('Players_Public.csv')
const hiddenPlayers = await readCsv('Players_Hidden.csv')
const specs = await readCsv('Player_Specs.csv')
const pool = await readCsv('Player_Pool.csv')
const economyTypes = await readCsv('Economy_Types.csv')
const socialTraits = await readCsv('Social_Traits.csv')

const newPublic = [
  { player_id: 'P094', name: '野萌君', class: '德鲁伊', signup_spec: '鸟德', signup_role: '远程DPS', signup_item_level: '225', claimed_offspec: '奶德', progress_display: '10人12/14', achievement_verified: '否', public_economy_claim: '有便宜就拿', whisper_pool: '强力|鸟德 熟练|鸟德 可切奶德' },
  { player_id: 'P095', name: '多多球', class: '法师', signup_spec: '火法', signup_role: '远程DPS', signup_item_level: '215', claimed_offspec: '', progress_display: '小号无成就', achievement_verified: '否', public_economy_claim: '有便宜就拿', whisper_pool: '小号法师|小号熟练|装备差点 手法没问题' },
  { player_id: 'P096', name: 'Kumaco', class: '牧师', signup_spec: '戒律牧', signup_role: '治疗', signup_item_level: '228', claimed_offspec: '暗牧', progress_display: '全通经验（自述）', achievement_verified: '否', public_economy_claim: '毕业必拿', whisper_pool: '全通经验|戒律牧 熟练|戒律牧 可切暗牧' },
  { player_id: 'P097', name: '佐贺偶像', class: '盗贼', signup_spec: '刺杀贼', signup_role: '近战DPS', signup_item_level: '228', claimed_offspec: '', progress_display: '10人全通', achievement_verified: '是', public_economy_claim: '有消费', whisper_pool: '毕业贼|刺杀贼 全通|刺杀贼 数据不会差' },
  { player_id: 'P098', name: '元素打击', class: '萨满', signup_spec: '元素', signup_role: '远程DPS', signup_item_level: '217', claimed_offspec: '奶萨', progress_display: '全通经验（自述）', achievement_verified: '否', public_economy_claim: '有提升会出', whisper_pool: '全通经验|元素 机制都会|元素 可切奶萨' },
  { player_id: 'P099', name: '小鸽鸽', class: '牧师', signup_spec: '戒律牧', signup_role: '治疗', signup_item_level: '225', claimed_offspec: '暗牧', progress_display: '无链接', achievement_verified: '否', public_economy_claim: '有便宜就拿', whisper_pool: '小白听指挥|戒律牧 听安排|戒律牧 可切暗牧' },
  { player_id: 'P100', name: '阿茸', class: '猎人', signup_spec: '射击猎', signup_role: '远程DPS', signup_item_level: '220', claimed_offspec: '', progress_display: '全通经验（自述）', achievement_verified: '否', public_economy_claim: '毕业必拿', whisper_pool: '全通经验|射击猎 机制都会|射击猎 不犯低级错误' },
  { player_id: 'P101', name: '东星太子哥', class: '德鲁伊', signup_spec: '熊德', signup_role: '坦克', signup_item_level: '215', claimed_offspec: '奶德、猫德', progress_display: '无链接', achievement_verified: '否', public_economy_claim: '有便宜就拿', whisper_pool: '无敌大熊来咯|东星太子哥驾到|本大爷来咯' },
]

for (const player of newPublic) {
  const index = publicPlayers.findIndex((entry) => entry.player_id === player.player_id)
  if (index >= 0) publicPlayers[index] = player
  else publicPlayers.push(player)
}

const publicOverrides = {
  P082: { claimed_offspec: '神牧、暗牧', whisper_pool: '戒律牧 全通|戒律牧 可切神牧暗牧|治疗输出都能切' },
  P084: { claimed_offspec: '防战', whisper_pool: '狂暴战 全通经验|狂暴战 可切防战|能打能扛' },
  P087: { claimed_offspec: '奶德、熊德、猫德', public_economy_claim: '有提升会出', whisper_pool: '4修|鸟德 主鸟副奶熊猫|缺什么可以切什么' },
}
const publicClaimFixes = new Map([
  ['容易上头', '有提升会出'],
  ['捡漏型', '有便宜就拿'],
  ['大老板', '有消费'],
  ['实力消费', '能打能消费'],
])
for (const player of publicPlayers) {
  if (publicOverrides[player.player_id]) Object.assign(player, publicOverrides[player.player_id])
  player.public_economy_claim = publicClaimFixes.get(player.public_economy_claim) ?? player.public_economy_claim
}

const customDescriptions = {
  P081: ['顶级机制、元素与奶萨双修', '厌蠢，低质量连续灭团后容易爆炸', '高水平团队稳定加成', '条件退队', '任何机制处理能力极强；团队越靠谱发挥越稳，重复低级错误会快速消耗耐心。'],
  P082: ['顶级治疗、指挥与规则理解', '喜欢研究规则漏洞', '极低概率违规封号', '条件退队', '全Boss熟练并能指挥，兼具治疗强度与组织能力。'],
  P083: ['装备优秀、基础坦克职责稳定、队友容易救场', '复杂机制和临场应变偏弱', '失误更常转化为可补救险情，熟悉后明显稳定', '永不主动退队', '装备很好但机制经验不足，需要明确口令；偶尔犯错，但多数时候队友还有机会救回来。'],
  P084: ['机制、生存、团队执行', '不开麦导致主动报点不足', '报点事件小幅减益', '永不主动退队', '任劳任怨的团队型输出，执行力强但不主动开麦。'],
  P085: ['机制稳定、团队润滑、救场', '输出上限偏低', '灭团矛盾与士气损失降低', '永不主动退队', '认真专注且擅长调解，数据不抢眼但团队价值很高。'],
  P086: ['气氛活跃、偶有亮眼操作', '偶尔忘箭、拿错武器或误开怪', '低概率神级操作或低级失误', '永不主动退队', '戏精型猎人，能活跃气氛，也可能突然大脑短路。'],
  P087: ['点子多、学习速度快', '机制陌生且容易自以为是', '失败后学习收益较高', '永不主动退队', '小白型玩家，吹牛和新点子很多，需要清晰指导。'],
  P088: ['鼓舞士气、团队性强', '输出上限一般', '击杀与灭团后提供气氛加成', '永不主动退队', '尽力不犯错的团队型术士，个人数据一般但能稳住队伍。'],
  P089: ['游戏资历久、熟悉常规套路', '困难局容易躺平', '低士气时投入下降', '永不主动退队', '老玩家但水平普通，喜欢吹资历，困难时容易摆烂。'],
  P090: ['经验足、救急能力强、学习快', '部分奥杜尔机制不熟', '第二次尝试额外熟悉加成', '永不主动退队', '团队型奶骑，第一次可能陌生，熟悉后发挥明显改善。'],
  P091: ['木桩输出高', '移动和复杂机制明显拉跨', '宏依赖：低移动加成、高移动惩罚', '永不主动退队', '一键宏DK，木桩很猛，需要临场处理时容易掉链子。'],
  P092: ['顶级坦克、全Boss熟练、可指挥', '低水平团队中容易心灰意冷', '极低概率违规封号', '特殊事件退队', '毕业坦克兼指挥，强度极高，但钻规则漏洞存在特殊风险。'],
  P093: ['机制、生存、双修与团队性优秀', '不开麦导致突发报点慢', '沟通型事件小幅减益', '永不主动退队', '任劳任怨且稳定的双修牧师，主要短板是不主动开麦。'],
  P101: ['气氛活跃、偶有亮眼操作', '偶尔电脑卡不动了', '', '永不主动退队', '团队鼓舞者，喜欢变熊鼓舞士气。'],
}

const newHidden = [
  { player_id: 'P094', combat_tier: '优秀', main_skill: '75', mechanics: '90', awareness: '92', stability: '90', teamwork: '96', learning: '84', mentality: '88', pressure_resistance: '90', social_primary: '调解者', social_secondary: '气氛组', base_leave_pct: '0', economy_type: '捡漏型', wallet_gold: '18000', reserve_gold: '6000', spend_willingness: '42', bid_aggression: '28', bargain_factor: '0.48', purchase_preference: '低价|合理提升', claim_honesty: '94', source_type: '玩家自建', personality_type: '调解型团队润滑剂', strength_tags: '机制稳定|团队润滑|观星者专精', weakness_tags: '输出上限不高|偶尔犯晕', special_rule: 'B14事件与输出额外加成；降低灭团士气损失', leave_policy: '永不主动退队', description: '认真专注、机制稳定，擅长缓和矛盾；在观察者奥尔加隆战斗中发挥非常好。' },
  { player_id: 'P095', combat_tier: '顶级', main_skill: '95', mechanics: '98', awareness: '97', stability: '94', teamwork: '86', learning: '96', mentality: '68', pressure_resistance: '52', social_primary: '厌蠢症', social_secondary: '气氛组', base_leave_pct: '3', economy_type: '简陋型', wallet_gold: '20000', reserve_gold: '7000', spend_willingness: '34', bid_aggression: '30', bargain_factor: '0.5', purchase_preference: '低价|法系饰品', claim_honesty: '92', source_type: '玩家自建', personality_type: '高水平厌蠢型', strength_tags: '顶级机制|火法上限|活跃气氛', weakness_tags: '连续低级失误后心态爆炸|偶尔短路', special_rule: '高水平团队稳定加成；第二次低质量灭团后退队率上升', leave_policy: '条件退队', description: '装等低但水平极高，任何机制处理能力都很强；团队连续犯低级错误后会迅速失去耐心。' },
  { player_id: 'P096', combat_tier: '中上', main_skill: '70', mechanics: '84', awareness: '86', stability: '86', teamwork: '96', learning: '80', mentality: '88', pressure_resistance: '90', social_primary: '气氛组', social_secondary: '责任型', base_leave_pct: '0', economy_type: '毕业装党', wallet_gold: '76000', reserve_gold: '20000', spend_willingness: '76', bid_aggression: '68', bargain_factor: '0.9', purchase_preference: 'S|S+|治疗极品', claim_honesty: '92', source_type: '玩家自建', personality_type: '团队型治疗', strength_tags: '鼓舞士气|稳定执行|愿意担责', weakness_tags: 'HPS上限一般|暗牧副修较弱', special_rule: '灭团士气损失降低', leave_policy: '永不主动退队', description: '团队型戒律牧，尽力不犯错并鼓舞士气，但治疗上限不算高。' },
  { player_id: 'P097', combat_tier: '优秀', main_skill: '80', mechanics: '68', awareness: '66', stability: '82', teamwork: '74', learning: '68', mentality: '92', pressure_resistance: '86', social_primary: '自信型', social_secondary: '宏依赖', base_leave_pct: '0', economy_type: '大老板', wallet_gold: '145000', reserve_gold: '26000', spend_willingness: '94', bid_aggression: '92', bargain_factor: '1.08', purchase_preference: '全部|武器|饰品', claim_honesty: '88', source_type: '玩家自建', personality_type: '自信型宏玩家', strength_tags: '木桩输出|刺杀节奏|消费强', weakness_tags: '移动战|复杂临场机制', special_rule: '低移动Boss输出提高；高移动Boss机制和输出下降', leave_policy: '永不主动退队', description: '依赖一键宏的刺杀贼，木桩表现很好，需要跑位与临场处理时明显拉跨。' },
  { player_id: 'P098', combat_tier: '中上', main_skill: '65', mechanics: '48', awareness: '52', stability: '58', teamwork: '70', learning: '90', mentality: '90', pressure_resistance: '72', social_primary: '小白型', social_secondary: '自信型', base_leave_pct: '0', economy_type: '小老板', wallet_gold: '70000', reserve_gold: '16000', spend_willingness: '84', bid_aggression: '78', bargain_factor: '0.92', purchase_preference: '全部|法系|治疗', claim_honesty: '74', source_type: '玩家自建', personality_type: '上头型小白', strength_tags: '学习快|点子多|消费积极', weakness_tags: '机制不熟|需要指导|容易自以为是', special_rule: '第二、第三次尝试学习收益较高', leave_policy: '永不主动退队', description: '对副本机制不熟但点子很多，容易上头；接受指导后会逐把进步。' },
  { player_id: 'P099', combat_tier: '中上', main_skill: '70', mechanics: '62', awareness: '70', stability: '76', teamwork: '94', learning: '94', mentality: '84', pressure_resistance: '86', social_primary: '小白型', social_secondary: '气氛组', base_leave_pct: '0', economy_type: '捡漏型', wallet_gold: '18000', reserve_gold: '5000', spend_willingness: '40', bid_aggression: '25', bargain_factor: '0.45', purchase_preference: '低价|合理提升', claim_honesty: '96', source_type: '玩家自建', personality_type: '听指挥型小白', strength_tags: '学习快|鼓舞士气|愿意执行', weakness_tags: '首把机制陌生|HPS一般|暗牧副修弱', special_rule: '低Boss经验时学习收益额外提高', leave_policy: '永不主动退队', description: '第一次不一定会，但听指挥、愿意学习；治疗上限一般，熟悉后稳定性明显提升。' },
  { player_id: 'P100', combat_tier: '中上', main_skill: '70', mechanics: '82', awareness: '82', stability: '84', teamwork: '96', learning: '82', mentality: '86', pressure_resistance: '88', social_primary: '气氛组', social_secondary: '责任型', base_leave_pct: '0', economy_type: '毕业装党', wallet_gold: '72000', reserve_gold: '18000', spend_willingness: '78', bid_aggression: '70', bargain_factor: '0.88', purchase_preference: 'S|S+|武器|饰品', claim_honesty: '92', source_type: '玩家自建', personality_type: '团队型输出', strength_tags: '鼓舞士气|机制稳定|团队执行', weakness_tags: 'DPS上限一般', special_rule: '灭团士气损失降低', leave_policy: '永不主动退队', description: '团队型猎人，尽力不犯错并能鼓舞士气，个人输出不算顶尖。' },
  { player_id: 'P101', combat_tier: '中上', main_skill: '75', mechanics: '65', awareness: '65', stability: '60', teamwork: '80', learning: '75', mentality: '75', pressure_resistance: '75', social_primary: '气氛组', social_secondary: '戏精型', base_leave_pct: '0', economy_type: '简陋型', wallet_gold: '20000', reserve_gold: '7000', spend_willingness: '60', bid_aggression: '50', bargain_factor: '0.48', purchase_preference: '低价|合理提升', claim_honesty: '85', source_type: '玩家自建', personality_type: '调解型团队润滑剂', strength_tags: '气氛活跃、偶有亮眼操作', weakness_tags: '偶尔电脑卡不动了', special_rule: '', leave_policy: '永不主动退队', description: '团队鼓舞者，喜欢变熊鼓舞士气' },
]

const hiddenHeaders = ['player_id', 'combat_tier', 'main_skill', 'mechanics', 'awareness', 'stability', 'teamwork', 'learning', 'mentality', 'pressure_resistance', 'social_primary', 'social_secondary', 'base_leave_pct', 'economy_type', 'wallet_gold', 'reserve_gold', 'spend_willingness', 'bid_aggression', 'bargain_factor', 'purchase_preference', 'claim_honesty', 'source_type', 'personality_type', 'strength_tags', 'weakness_tags', 'special_rule', 'leave_policy', 'description']

const tidyHidden = hiddenPlayers.map((player) => {
  const isCustom = Number(player.player_id.slice(1)) >= 81
  const profile = customDescriptions[player.player_id]
  if (player.player_id === 'P091') player.social_secondary = '宏依赖'
  if (player.player_id === 'P092') { player.social_primary = '团长型'; player.social_secondary = '钻空子' }
  return {
    ...player,
    source_type: isCustom ? '玩家自建' : '随机生成',
    personality_type: profile ? `${player.social_primary}${player.social_secondary && player.social_secondary !== '无' ? ` / ${player.social_secondary}` : ''}` : '随机组合型',
    strength_tags: profile?.[0] ?? '由战斗数值与性格共同决定',
    weakness_tags: profile?.[1] ?? '由低项数值与负面性格自然触发',
    special_rule: profile?.[2] ?? '',
    leave_policy: profile?.[3] ?? '按基础退队率与团队状态计算',
    description: profile?.[4] ?? '随机生成角色；战斗、社交和消费互相独立，公开密语不代表隐藏真相。',
  }
})

const fran = tidyHidden.find((player) => player.player_id === 'P083')
if (fran) Object.assign(fran, { combat_tier: '中上', main_skill: '72', mechanics: '70', awareness: '72', stability: '72', teamwork: '82', learning: '76', strength_tags: customDescriptions.P083[0], weakness_tags: customDescriptions.P083[1], special_rule: customDescriptions.P083[2], description: customDescriptions.P083[4] })

for (const player of newHidden) {
  const index = tidyHidden.findIndex((entry) => entry.player_id === player.player_id)
  if (index >= 0) tidyHidden[index] = player
  else tidyHidden.push(player)
}

const newSpecs = [
  { player_id: 'P082', spec: '暗牧', role: '远程DPS', character_item_level: '224', skill: '82', boss_experience: '88', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P083', spec: '防骑', role: '坦克', character_item_level: '226', skill: '72', boss_experience: '58', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P083', spec: '惩戒', role: '近战DPS', character_item_level: '226', skill: '58', boss_experience: '48', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P084', spec: '防战', role: '坦克', character_item_level: '229', skill: '82', boss_experience: '86', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P087', spec: '熊德', role: '坦克', character_item_level: '219', skill: '55', boss_experience: '34', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P087', spec: '猫德', role: '近战DPS', character_item_level: '219', skill: '55', boss_experience: '36', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P094', spec: '鸟德', role: '远程DPS', character_item_level: '225', skill: '75', boss_experience: '82', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P094', spec: '奶德', role: '治疗', character_item_level: '225', skill: '65', boss_experience: '72', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P095', spec: '火法', role: '远程DPS', character_item_level: '215', skill: '95', boss_experience: '90', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P096', spec: '戒律牧', role: '治疗', character_item_level: '228', skill: '70', boss_experience: '86', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P096', spec: '暗牧', role: '远程DPS', character_item_level: '228', skill: '50', boss_experience: '70', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P097', spec: '刺杀贼', role: '近战DPS', character_item_level: '228', skill: '80', boss_experience: '85', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P098', spec: '元素', role: '远程DPS', character_item_level: '217', skill: '65', boss_experience: '42', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P098', spec: '奶萨', role: '治疗', character_item_level: '217', skill: '50', boss_experience: '35', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P099', spec: '戒律牧', role: '治疗', character_item_level: '225', skill: '70', boss_experience: '35', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P099', spec: '暗牧', role: '远程DPS', character_item_level: '225', skill: '40', boss_experience: '25', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P100', spec: '射击猎', role: '远程DPS', character_item_level: '220', skill: '70', boss_experience: '84', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P101', spec: '熊德', role: '坦克', character_item_level: '215', skill: '75', boss_experience: '35', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P101', spec: '奶德', role: '治疗', character_item_level: '215', skill: '65', boss_experience: '35', willing_switch: '是', publicly_claimed: '是' },
  { player_id: 'P101', spec: '猫德', role: '近战DPS', character_item_level: '215', skill: '55', boss_experience: '35', willing_switch: '是', publicly_claimed: '是' },
]

const obsoleteWeaponSpec = specs.findIndex((entry) => entry.player_id === 'P084' && entry.spec === '武器战')
if (obsoleteWeaponSpec >= 0) specs.splice(obsoleteWeaponSpec, 1)

for (const spec of newSpecs) {
  const index = specs.findIndex((entry) => entry.player_id === spec.player_id && entry.spec === spec.spec)
  if (index >= 0) specs[index] = spec
  else specs.push(spec)
}

const replacements = new Map([
  ['P010', 'P094'],
  ['P008', 'P095'],
  ['P018', 'P096'],
  ['P006', 'P097'],
  ['P011', 'P098'],
  ['P028', 'P099'],
  ['P009', 'P100'],
])
const nextPool = pool.map(({ player_id }) => ({ player_id: replacements.get(player_id) ?? player_id }))

if (!economyTypes.some((entry) => entry.type === '简陋型')) {
  economyTypes.push({ type: '简陋型', wallet_min: '5000', wallet_max: '30000', price_multiplier: '0.75', bargain_factor: '0.5', base_spend_willingness: '35', preference: '低价|小提升', description: '预算普通，主要看底价与实用小提升，不主动抬高价格' })
}

const traitAdditions = [
  { trait: '小白型', polarity: '成长型', engine_effect: '初始Boss经验较低；learning高时第二、第三次尝试提升明显', example_chat: '第一次打 说下怎么站' },
  { trait: '戏精型', polarity: '双刃剑', engine_effect: '活跃气氛；低概率出现亮眼操作或离谱低级失误', example_chat: '先别夸 我箭带了吗' },
  { trait: '团队执行', polarity: '正面', engine_effect: '转火、救场和团队任务更积极，个人数据可能略降', example_chat: '我来补位' },
  { trait: '老司机', polarity: '中性', engine_effect: '常规机制稳定，复杂高压阶段提升有限', example_chat: '正常 熟了就过' },
  { trait: '躺平型', polarity: '负面条件', engine_effect: '低士气或困难局中投入下降，但不一定主动退队', example_chat: '随便打吧' },
]
for (const trait of traitAdditions) if (!socialTraits.some((entry) => entry.trait === trait.trait)) socialTraits.push(trait)

await writeCsv('Players_Public.csv', ['player_id', 'name', 'class', 'signup_spec', 'signup_role', 'signup_item_level', 'claimed_offspec', 'progress_display', 'achievement_verified', 'public_economy_claim', 'whisper_pool'], publicPlayers)
await writeCsv('Players_Hidden.csv', hiddenHeaders, tidyHidden)
await writeCsv('Player_Specs.csv', ['player_id', 'spec', 'role', 'character_item_level', 'skill', 'boss_experience', 'willing_switch', 'publicly_claimed'], specs)
await writeCsv('Player_Pool.csv', ['player_id'], nextPool)
await writeCsv('Economy_Types.csv', ['type', 'wallet_min', 'wallet_max', 'price_multiplier', 'bargain_factor', 'base_spend_willingness', 'preference', 'description'], economyTypes)
await writeCsv('Social_Traits.csv', ['trait', 'polarity', 'engine_effect', 'example_chat'], socialTraits)

console.log(JSON.stringify({ publicPlayers: publicPlayers.length, hiddenPlayers: tidyHidden.length, specs: specs.length, activePool: nextPool.length, addedPlayers: newPublic.map((player) => player.player_id), replaced: Object.fromEntries(replacements) }, null, 2))
