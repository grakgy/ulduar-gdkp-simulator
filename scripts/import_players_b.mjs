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

const publicHeaders = ['player_id', 'name', 'class', 'signup_spec', 'signup_role', 'signup_item_level', 'claimed_offspec', 'progress_display', 'achievement_verified', 'public_economy_claim', 'whisper_pool']
const hiddenHeaders = ['player_id', 'combat_tier', 'main_skill', 'mechanics', 'awareness', 'stability', 'teamwork', 'learning', 'mentality', 'pressure_resistance', 'social_primary', 'social_secondary', 'base_leave_pct', 'economy_type', 'wallet_gold', 'spend_willingness', 'bid_aggression', 'bargain_factor', 'purchase_preference', 'claim_honesty', 'source_type', 'personality_type', 'strength_tags', 'weakness_tags', 'special_rule', 'leave_policy', 'description']
const specHeaders = ['player_id', 'spec', 'role', 'character_item_level', 'skill', 'boss_experience', 'willing_switch', 'publicly_claimed']

// Excel 中的人物从 P102 开始，与现有柠檬七喜冲突，因此整体顺延为 P103—P120。
const playersB = [
  { id: 'P103', name: '苏三先生', cls: '法师', spec: '火法', role: '远程DPS', ilvl: 227, offspec: '', progress: '10人全通', publicEconomy: '有提升会出', whisper: '全通火法|爆发窗口熟练|有提升会出', tier: '优秀', skill: 85, mechanics: 85, awareness: 82, stability: 72, teamwork: 80, learning: 78, mentality: 78, pressure: 80, primary: '稳定型', secondary: '气氛组', leave: 0, economy: '实力消费', wallet: 50000, spend: 68, aggression: 60, bargain: .75, preference: '全部|合理提升', honesty: 94, personality: '高上限火法', strengths: '高输出上限|全Boss经验|爆发窗口把握', weaknesses: '不同Boss发挥差异较大|个别机制战发挥偏低', rule: '', policy: '永不主动退队', description: '227装等火法，整体优秀，爆发窗口把握较好；不同Boss发挥存在一定波动。', specs: [['火法', '远程DPS', 85, 90]] },
  { id: 'P104', name: '冰冻玫瑰', cls: '法师', spec: '火法', role: '远程DPS', ilvl: 224, offspec: '', progress: '10人全通', publicEconomy: '有便宜就拿', whisper: '全通熟练|可以帮忙指挥|便宜法系装会拿', tier: '顶级', skill: 87, mechanics: 95, awareness: 95, stability: 90, teamwork: 90, learning: 88, mentality: 88, pressure: 84, primary: '团长型', secondary: '责任型', leave: 0, economy: '排骨党', wallet: 8000, spend: 12, aggression: 8, bargain: .2, preference: '低价', honesty: 95, personality: '指挥会长型', strengths: '操作优秀|全Boss经验丰富|可组织指挥|团队执行强', weaknesses: '极低概率网络波动', rule: '', policy: '永不主动退队', description: '指挥会长型老玩家，操作、机制和团队执行都很强；消费谨慎，主要目标是分金。', specs: [['火法', '远程DPS', 87, 90]] },
  { id: 'P105', name: '李一桐', cls: '术士', spec: '恶魔术', role: '远程DPS', ilvl: 232, offspec: '痛苦术', progress: '10人全通', publicEconomy: '只看极品', whisper: '恶魔术全通|可切痛苦|只看极品', tier: '顶级', skill: 85, mechanics: 90, awareness: 96, stability: 91, teamwork: 90, learning: 88, mentality: 88, pressure: 84, primary: '团长型', secondary: '团队执行', leave: 0, economy: '毕业装党', wallet: 120000, spend: 88, aggression: 78, bargain: .9, preference: 'S|S+|武器|饰品', honesty: 95, personality: '高水平极品消费恶魔术', strengths: '操作优秀|全Boss经验丰富|团队增益|稳定执行', weaknesses: '普通提升购买意愿低', rule: '', policy: '永不主动退队', description: '高质量恶魔术，操作扎实、团队增益明确；只对S/S+或毕业件积极出手。', specs: [['恶魔术', '远程DPS', 85, 90], ['痛苦术', '远程DPS', 82, 88]] },
  { id: 'P106', name: '鹿乃乃乃乃', cls: '德鲁伊', spec: '鸟德', role: '远程DPS', ilvl: 216, offspec: '', progress: '10人熟练', publicEconomy: '有提升会出', whisper: '鸟德熟练|有提升会出|会打所有机制', tier: '中上', skill: 77, mechanics: 75, awareness: 78, stability: 65, teamwork: 62, learning: 72, mentality: 55, pressure: 50, primary: '自信型', secondary: '玻璃心', leave: 6.5, economy: '实力消费', wallet: 45000, spend: 72, aggression: 58, bargain: .75, preference: '全部|合理提升', honesty: 95, personality: '嘴强王者公主病', strengths: '操作扎实|副本经验丰富|自信心强', weaknesses: '需要被照顾|被质疑后容易玻璃心|团队配合一般', rule: '高士气时小幅加成；被点名后退队倾向增加', policy: '条件退队', description: '实战中上但嘴上气势更强，被点名或缺少照顾时心态容易下降。', specs: [['鸟德', '远程DPS', 77, 75]] },
  { id: 'P107', name: '猫丶薄荷', cls: '盗贼', spec: '刺杀贼', role: '近战DPS', ilvl: 232, offspec: '', progress: '10人全通', publicEconomy: '有便宜就拿', whisper: '全通刺杀|可以帮忙指挥|便宜物理装会拿', tier: '顶级', skill: 90, mechanics: 95, awareness: 88, stability: 86, teamwork: 90, learning: 88, mentality: 88, pressure: 84, primary: '团长型', secondary: '责任型', leave: 0, economy: '排骨党', wallet: 8000, spend: 12, aggression: 8, bargain: .2, preference: '低价', honesty: 95, personality: '指挥会长型', strengths: '操作优秀|全Boss经验丰富|可组织指挥|团队执行强', weaknesses: '极低概率网络波动', rule: '', policy: '永不主动退队', description: '指挥会长型近战，操作、机制和团队执行都很强；消费倾向明显排骨。', specs: [['刺杀贼', '近战DPS', 90, 90]] },
  { id: 'P108', name: '蔡先生', cls: '盗贼', spec: '刺杀贼', role: '近战DPS', ilvl: 222, offspec: '', progress: '10人9/14', publicEconomy: '毕业必买', whisper: '刺杀贼来消费|毕业装必买|老板位求组', tier: '灾难', skill: 40, mechanics: 20, awareness: 20, stability: 50, teamwork: 30, learning: 20, mentality: 60, pressure: 20, primary: '小白型', secondary: '自信型', leave: 0, economy: '大老板', wallet: 200000, spend: 98, aggression: 95, bargain: 1.12, preference: '全部', honesty: 98, personality: '蔡系土豪灾难型', strengths: '金币极多|购买欲极强|竞价激进', weaknesses: '完全不会走位|机制意识极差|个人失误极易死亡', rule: '蔡系三角色互斥；个人机制失败一律按死亡处理', policy: '永不主动退队', description: '蔡系同玩家角色之一，消费能力极强，但机制意识和生存能力很差。', specs: [['刺杀贼', '近战DPS', 40, 20]] },
  { id: 'P109', name: '圣光普惠众生', cls: '牧师', spec: '暗牧', role: '远程DPS', ilvl: 222, offspec: '', progress: '10人9/14', publicEconomy: '有便宜就拿', whisper: '暗牧听指挥|有便宜会拿|团队任务都能做', tier: '普通', skill: 65, mechanics: 58, awareness: 62, stability: 65, teamwork: 76, learning: 72, mentality: 75, pressure: 74, primary: '小白型', secondary: '气氛组', leave: 0, economy: '捡漏型', wallet: 25000, spend: 48, aggression: 38, bargain: .65, preference: '低价|法系', honesty: 94, personality: '团队型暗牧', strengths: '愿意执行|发挥相对稳定|团队配合', weaknesses: '输出上限不高|后期Boss能力偏低|开麦风格容易引发争执', rule: '与厌蠢症队友同团且连续灭团时额外损失士气', policy: '永不主动退队', description: '输出上限一般但愿意执行，开麦风格可能让厌蠢型队友产生负面情绪。', specs: [['暗牧', '远程DPS', 65, 58]] },
  { id: 'P110', name: '牛润发', cls: '德鲁伊', spec: '鸟德', role: '远程DPS', ilvl: 220, offspec: '', progress: '10人全通', publicEconomy: '有提升会出', whisper: '鸟德全通|有提升会出|常规机制熟练', tier: '中上', skill: 80, mechanics: 85, awareness: 68, stability: 62, teamwork: 72, learning: 72, mentality: 72, pressure: 70, primary: '稳定型', secondary: '无', leave: 0, economy: '实力消费', wallet: 36000, spend: 64, aggression: 50, bargain: .72, preference: '全部|合理提升', honesty: 92, personality: '中上波动鸟德', strengths: '部分Boss表现突出|多数Boss有记录', weaknesses: '复杂机制战发挥偏低|输出波动明显', rule: '', policy: '永不主动退队', description: '日志有亮点但发挥波动明显，复杂机制战稳定性一般。', specs: [['鸟德', '远程DPS', 80, 72]] },
  { id: 'P111', name: '陈七', cls: '死亡骑士', spec: '冰DK', role: '近战DPS', ilvl: 220, offspec: '', progress: '10人全通', publicEconomy: '有提升会出', whisper: '冰DK全通|有提升会出|常规Boss稳定', tier: '中上', skill: 80, mechanics: 70, awareness: 66, stability: 64, teamwork: 74, learning: 72, mentality: 72, pressure: 72, primary: '沉默型', secondary: '无', leave: 0, economy: '实力消费', wallet: 34000, spend: 62, aggression: 50, bargain: .72, preference: '武器|饰品|合理提升', honesty: 93, personality: '中上冰DK', strengths: '多数Boss有记录|愿意执行|基础输出稳定', weaknesses: '高难机制上限有限|后期Boss发挥偏低', rule: '', policy: '永不主动退队', description: '常规Boss表现中上，基础输出稳定，高难机制上限有限。', specs: [['冰DK', '近战DPS', 80, 70]] },
  { id: 'P112', name: 'Himlyameth', cls: '猎人', spec: '射击猎', role: '远程DPS', ilvl: 220, offspec: '', progress: '回归玩家', publicEconomy: '有提升会出', whisper: '射击猎回归|远程转火没问题|有提升会出', tier: '中上', skill: 80, mechanics: 52, awareness: 70, stability: 68, teamwork: 72, learning: 70, mentality: 72, pressure: 68, primary: '稳定型', secondary: '无', leave: 0, economy: '实力消费', wallet: 36000, spend: 62, aggression: 48, bargain: .72, preference: '武器|饰品|合理提升', honesty: 92, personality: '中上射击猎', strengths: '基础输出中上|远程转火能力', weaknesses: '日志样本较少|副本经验不确定', rule: '', policy: '永不主动退队', description: '样本较少但基础输出不错，远程转火和常规执行可用。', specs: [['射击猎', '远程DPS', 80, 52]] },
  { id: 'P113', name: '少女拾拾腿', cls: '法师', spec: '奥法', role: '远程DPS', ilvl: 218, offspec: '', progress: '回归玩家', publicEconomy: '有提升会出', whisper: '奥法回归|有提升会出|爆发还可以', tier: '中上', skill: 72, mechanics: 48, awareness: 66, stability: 62, teamwork: 70, learning: 70, mentality: 70, pressure: 68, primary: '稳定型', secondary: '无', leave: 0, economy: '捡漏型', wallet: 24000, spend: 48, aggression: 38, bargain: .62, preference: '低价|法系', honesty: 92, personality: '中等奥法', strengths: '有一定爆发能力', weaknesses: '机制战表现偏低|日志样本较少', rule: '', policy: '永不主动退队', description: '短样本下表现中等，有一定爆发能力，稳定性仍需观察。', specs: [['奥法', '远程DPS', 72, 48]] },
  { id: 'P114', name: '注意我的细节', cls: '盗贼', spec: '战斗贼', role: '近战DPS', ilvl: 226, offspec: '', progress: '10人全通', publicEconomy: '有提升会出', whisper: '战斗贼全通|近战机制会处理|有提升会出', tier: '优秀', skill: 85, mechanics: 80, awareness: 70, stability: 66, teamwork: 74, learning: 70, mentality: 72, pressure: 70, primary: '责任型', secondary: '团队执行', leave: 0, economy: '实力消费', wallet: 32000, spend: 60, aggression: 48, bargain: .7, preference: '武器|饰品|合理提升', honesty: 94, personality: '中等战斗贼', strengths: '近战机制执行|愿意配合', weaknesses: '发挥差异较大|日志样本较少', rule: '', policy: '永不主动退队', description: '近战机制执行意愿较好，但样本少且发挥差异偏大。', specs: [['战斗贼', '近战DPS', 85, 48]] },
  { id: 'P115', name: '蔡老二', cls: '法师', spec: '奥法', role: '远程DPS', ilvl: 217, offspec: '', progress: '小号无成就', publicEconomy: '毕业必买', whisper: '奥法老板位|毕业装必买|小号来消费', tier: '灾难', skill: 50, mechanics: 50, awareness: 8, stability: 12, teamwork: 30, learning: 20, mentality: 60, pressure: 20, primary: '小白型', secondary: '自信型', leave: 0, economy: '大老板', wallet: 200000, spend: 98, aggression: 95, bargain: 1.12, preference: '全部', honesty: 98, personality: '蔡系土豪灾难型', strengths: '金币极多|购买欲极强|竞价激进', weaknesses: '完全不会走位|机制意识极差|个人失误极易死亡', rule: '蔡系三角色互斥；个人机制失败一律按死亡处理', policy: '永不主动退队', description: '蔡系同玩家角色之一，爱买装备，但操作、走位和机制能力很差。', specs: [['奥法', '远程DPS', 50, 20]] },
  { id: 'P116', name: '随先生', cls: '术士', spec: '痛苦术', role: '远程DPS', ilvl: 215, offspec: '', progress: '小号无成就', publicEconomy: '有便宜就拿', whisper: '痛苦术补位|便宜法系装会拿|小号求组', tier: '偏弱', skill: 68, mechanics: 62, awareness: 52, stability: 46, teamwork: 66, learning: 62, mentality: 60, pressure: 58, primary: '沉默型', secondary: '无', leave: 0, economy: '捡漏型', wallet: 15000, spend: 30, aggression: 22, bargain: .5, preference: '低价|法系', honesty: 90, personality: '低分痛苦术', strengths: '可提供持续输出', weaknesses: '输出上限有限|稳定性偏低|样本较少', rule: '', policy: '永不主动退队', description: '更适合作为低配补位输出，实战上限有限，出价保守。', specs: [['痛苦术', '远程DPS', 68, 42]] },
  { id: 'P117', name: '蔡老板', cls: '萨满', spec: '奶萨', role: '治疗', ilvl: 220, offspec: '', progress: '小号无成就', publicEconomy: '毕业必买', whisper: '奶萨老板位|治疗装都要|毕业装必买', tier: '灾难', skill: 50, mechanics: 50, awareness: 8, stability: 12, teamwork: 30, learning: 20, mentality: 60, pressure: 20, primary: '小白型', secondary: '自信型', leave: 0, economy: '大老板', wallet: 200000, spend: 98, aggression: 95, bargain: 1.12, preference: '全部', honesty: 98, personality: '蔡系土豪灾难型', strengths: '金币极多|购买欲极强|竞价激进', weaknesses: '完全不会走位|机制意识极差|个人失误极易死亡', rule: '蔡系三角色互斥；个人机制失败一律按死亡处理', policy: '永不主动退队', description: '蔡系同玩家的治疗角色，钱包很厚，但实际操作差，机制中容易先倒并造成治疗缺口。', specs: [['奶萨', '治疗', 50, 20]] },
  { id: 'P118', name: '雨宫天', cls: '圣骑士', spec: '奶骑', role: '治疗', ilvl: 225, offspec: '', progress: '回归玩家', publicEconomy: '无限预算，想买就买', whisper: '奶骑回归|治疗装都买|预算不是问题', tier: '优秀', skill: 90, mechanics: 80, awareness: 82, stability: 78, teamwork: 88, learning: 94, mentality: 82, pressure: 80, primary: '责任型', secondary: '团队执行', leave: 0, economy: '大老板', wallet: 999999999, spend: 100, aggression: 100, bargain: 1.2, preference: '全部', honesty: 100, personality: '无限金币成长型奶骑', strengths: '操作优秀|单体治疗能力强|学习速度快|购买欲极强', weaknesses: 'Boss经验较少|复杂机制需要熟悉', rule: '钱包视为无限；所有适用装备均有购买意愿', policy: '永不主动退队', description: '操作优秀但Boss经验较少，学习速度快；经济上视为无限预算。', specs: [['奶骑', '治疗', 90, 35]] },
  { id: 'P119', name: '辉夜萨麻', cls: '萨满', spec: '奶萨', role: '治疗', ilvl: 221, offspec: '', progress: '小号无成就', publicEconomy: '有提升会出', whisper: '奶萨补位|治疗装备会出|听指挥', tier: '中上', skill: 73, mechanics: 48, awareness: 72, stability: 70, teamwork: 88, learning: 74, mentality: 78, pressure: 76, primary: '责任型', secondary: '团队执行', leave: 0, economy: '实力消费', wallet: 34000, spend: 58, aggression: 45, bargain: .7, preference: '治疗|合理提升', honesty: 94, personality: '中等奶萨', strengths: '治疗发挥稳定|团队辅助', weaknesses: '机制经验有限|高分上限暂未体现', rule: '', policy: '永不主动退队', description: '治疗表现中等偏稳，团队辅助意识较好，但高难机制经验有限。', specs: [['奶萨', '治疗', 73, 48]] },
  { id: 'P120', name: '安德罗波夫', cls: '死亡骑士', spec: '邪DK', role: '近战DPS', ilvl: 231, offspec: '血DK', progress: '10人全通', publicEconomy: '毕业必买', whisper: '邪DK全通|可切血DK|毕业装会出', tier: '顶级', skill: 95, mechanics: 96, awareness: 96, stability: 94, teamwork: 85, learning: 98, mentality: 90, pressure: 55, primary: '团长型', secondary: '钻空子', leave: 0, economy: '毕业装党', wallet: 100000, spend: 90, aggression: 80, bargain: 1, preference: 'S|S+|武器|饰品', honesty: 95, personality: '初中肄业小号', strengths: '顶级输出|全Boss熟练|可指挥|可切坦克', weaknesses: '低水平团队中容易心灰意冷', rule: '可与初中肄业同时出现；低质量连续灭团后退队率提高', policy: '特殊事件退队', description: '初中肄业的小号，继承高个人能力、经验和规则倾向；主修邪DK，副修血DK。', specs: [['邪DK', '近战DPS', 95, 98], ['血DK', '坦克', 88, 98]] },
]

const publicPlayers = await readCsv('Players_Public.csv')
const hiddenPlayers = await readCsv('Players_Hidden.csv')
const specs = await readCsv('Player_Specs.csv')

const importedIds = new Set(playersB.map((player) => player.id))
const existingHiddenById = new Map(hiddenPlayers.map((player) => [player.player_id, player]))
const nextPublic = publicPlayers.filter((player) => !importedIds.has(player.player_id))
const nextHidden = hiddenPlayers.filter((player) => !importedIds.has(player.player_id))
const nextSpecs = specs.filter((entry) => !importedIds.has(entry.player_id))

for (const player of playersB) {
  const existingHidden = existingHiddenById.get(player.id)
  nextPublic.push({
    player_id: player.id,
    name: player.name,
    class: player.cls,
    signup_spec: player.spec,
    signup_role: player.role,
    signup_item_level: String(player.ilvl),
    claimed_offspec: player.offspec,
    progress_display: player.progress,
    achievement_verified: '是',
    public_economy_claim: player.publicEconomy,
    whisper_pool: player.whisper,
  })
  nextHidden.push({
    player_id: player.id,
    combat_tier: player.tier,
    main_skill: String(player.skill),
    mechanics: String(player.mechanics),
    awareness: String(player.awareness),
    stability: String(player.stability),
    teamwork: String(player.teamwork),
    learning: String(player.learning),
    mentality: String(player.mentality),
    pressure_resistance: String(player.pressure),
    social_primary: player.primary,
    social_secondary: player.secondary,
    base_leave_pct: existingHidden?.base_leave_pct ?? String(player.leave),
    economy_type: player.economy,
    wallet_gold: String(player.wallet),
    spend_willingness: String(player.spend),
    bid_aggression: String(player.aggression),
    bargain_factor: String(player.bargain),
    purchase_preference: player.preference,
    claim_honesty: String(player.honesty),
    source_type: '玩家自建',
    personality_type: player.personality,
    strength_tags: player.strengths,
    weakness_tags: player.weaknesses,
    special_rule: player.rule,
    leave_policy: existingHidden?.leave_policy ?? player.policy,
    description: player.description,
  })
  for (const [spec, role, skill, experience] of player.specs) {
    nextSpecs.push({
      player_id: player.id,
      spec,
      role,
      character_item_level: String(player.ilvl),
      skill: String(skill),
      boss_experience: String(experience),
      willing_switch: '是',
      publicly_claimed: '是',
    })
  }
}

const sortById = (left, right) => Number(left.player_id.slice(1)) - Number(right.player_id.slice(1))
nextPublic.sort(sortById)
nextHidden.sort(sortById)
nextSpecs.sort((left, right) => sortById(left, right) || left.spec.localeCompare(right.spec, 'zh-CN'))

await writeCsv('Players_Public.csv', publicHeaders, nextPublic)
await writeCsv('Players_Hidden.csv', hiddenHeaders, nextHidden)
await writeCsv('Player_Specs.csv', specHeaders, nextSpecs)

console.log(JSON.stringify({
  imported: playersB.length,
  ids: playersB.map((player) => player.id),
  publicPlayers: nextPublic.length,
  hiddenPlayers: nextHidden.length,
  specs: nextSpecs.length,
}, null, 2))
