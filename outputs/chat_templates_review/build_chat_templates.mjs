import fs from 'node:fs/promises'
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool'

const projectRoot = 'D:/生活/AI/wow'
const sourcePath = `${projectRoot}/Chat_Templates.csv`
const outputDir = `${projectRoot}/outputs/chat_templates_review`
const csvText = await fs.readFile(sourcePath, 'utf8')
const sourceWorkbook = await Workbook.fromCSV(csvText, { sheetName: '聊天模板' })
const sourceSheet = sourceWorkbook.worksheets.getItem('聊天模板')
const sourceRows = sourceSheet.getUsedRange().values
const [sourceHeaders, ...sourceData] = sourceRows
const index = Object.fromEntries(sourceHeaders.map((header, column) => [String(header), column]))

const selfResponseStyles = new Set(['责任型', '玻璃心', '宏依赖', '小白型', '嘴硬型', '甩锅型', '自信型'])
const criticStyles = new Set(['压力怪', '厌蠢症', '数据执着', '阴阳怪气', '拱火者'])
const supportStyles = new Set(['调解者', '老司机', '老黄牛', '气氛组'])

function metadata(scene, style) {
  if (scene === '灭团') {
    if (selfResponseStyles.has(style)) return ['责任人', '自己', '仅用于被战斗记录判定为责任人的成员回应自身失误']
    if (criticStyles.has(style)) return ['非责任人', '明确责任人或团队', '用于质疑、数据复盘、讽刺或追责；不能写第一人称认错']
    if (supportStyles.has(style)) return ['非责任人', '全团', '用于调解、经验复盘或鼓励继续尝试']
    return ['非责任人', '全团或战术安排', '普通复盘发言；不要写成自己犯错或主动接锅']
  }
  if (scene === '退团') return ['离队者', '自己或团队', '仅用于生成退团者离开前的发言']
  if (scene === '拍卖') return ['竞拍成员', '装备或当前价格', '可使用{item}、{price}变量；不得写成没有实际出价的跟价']
  if (scene === '报名') return ['候选人', '自己', '可使用{spec}、{offspec}变量，用于招募报名表达']
  if (scene === '补人') return ['引荐人或团长', '离队者或替补', '用于退团后的补人流程']
  return ['不限', '无', '通用模板']
}

const baseRows = sourceData.map((row, originalIndex) => {
  const scene = String(row[index.scene] ?? '')
  const style = String(row[index.style_or_trait] ?? '')
  const template = String(row[index.template] ?? '')
  return {
    scene,
    style,
    template,
    metadata: metadata(scene, style),
    originalIndex,
  }
})

const targeted = {
  '输出不足-压力怪': [
    '{target}这把只有{value} DPS，真准备等Boss自己掉血？',
    '{target}先别研究机制了，先把{value} DPS解释一下。',
    '团队还差{gap} DPS，{target}一个人就快占完缺口了。',
    '{target}这个输出，再稳的机制也只能稳到狂暴。',
    '{target}打了{value} DPS，是技能没按还是武器没带？',
    'Boss狂暴不是意外，{target}这{value} DPS已经提前预告了。',
    '{target}别先看别人，自己的DPS表还在最下面。',
    '团队需要{required} DPS，{target}这把确实拖得有点狠。',
    '{target}再少打一点，Boss都要开始同情我们了。',
    '机制跑明白了，{target}的输出按钮什么时候能按明白？',
    '{target}打到{value} DPS还不调整，下一把狂暴线照样等着。',
    '缺口都摆在表上了，{target}先把本职数字补回来。',
    '{target}别等别人抬轿，最低DPS得先动起来。',
    '团队差{gap} DPS，{target}这位置不能继续躺着。',
    '{target}下一把再是{value} DPS，就别怪Boss准时狂暴。',
  ],
  '输出不足-数据执着': [
    '{target}本场{value} DPS，全团{team_value}，距离狂暴线还差{gap}。',
    '数据先说话：{target}排在输出末位，只有{value} DPS。',
    '需求是{required}团队DPS，现在只有{team_value}，{target}最低。',
    '{target}的{value} DPS明显低于本场其余输出位。',
    '别凭感觉复盘，{target}的DPS记录就是{value}。',
    '全团输出缺口{gap}，先从末位的{target}开始调整。',
    '{target}死亡和停手损失已经算进DPS，目前是{value}。',
    '当前团队DPS {team_value}，门槛{required}，最低是{target}。',
    '日志里{target}的有效输出时间最差，最终只有{value} DPS。',
    '这不是印象问题，{target}的{value} DPS确实排在最后。',
    '{target}占全团输出比例最低，当前记录为{value} DPS。',
    '门槛{required}、实际{team_value}，末位{target}需要先补数字。',
    '{target}与团队平均输出差距明显，最终值是{value} DPS。',
    '按日志统计，{target}是当前{gap}点团队缺口的首要调整位。',
    '不讨论感觉，只看本场数据：{target}，{value} DPS。',
  ],
  '输出不足-阴阳怪气': [
    '原来{target}今天负责给Boss提供安全感。',
    '{target}这{value} DPS，主打一个不惊动Boss。',
    'Boss能狂暴，多亏{target}一直温柔输出。',
    '{target}打得很克制，生怕Boss血掉得太快。',
    '全团都在抢时间，{target}在保护副本生态。',
    '{target}的输出曲线很稳定，稳定地贴着最下面。',
    'Boss看见{target}的DPS，估计觉得今天稳了。',
    '{target}不是没输出，只是把伤害留到下个CD了。',
    '别人打Boss，{target}负责陪Boss聊天。',
    '{target}这把最大的贡献，是让狂暴计时器有了存在感。',
    '{target}的伤害很环保，几乎没给Boss造成负担。',
    '大家抢秒伤，{target}负责给狂暴动画留出播放时间。',
    '{target}这把输出得很礼貌，基本没打扰到Boss。',
    '看完{target}的{value} DPS，Boss已经开始安排下一轮技能了。',
    '{target}把输出藏得很好，战斗记录差点都没找到。',
  ],
  '治疗不足-压力怪': [
    '{target}这把只有{value} HPS，血条靠队友自己长吗？',
    '{target}先别看别人，治疗表最后一名就是你。',
    '团队还差{gap} HPS，{target}这个缺口太明显了。',
    '{target}的治疗量再低一点，绷带都能竞争上岗。',
    '需要{required}团队HPS，{target}只刷了{value}。',
    '{target}这不是省蓝，这是把蓝带回城。',
    '团血一直见底，{target}的技能是在等下个Boss吗？',
    '{target}这治疗量，坦克能活着全靠信念。',
    '治疗不足不是玄学，{target}的{value} HPS就在表里。',
    '{target}别只盯着蓝条，先看看队友还有没有血条。',
    '{target}下一把还刷{value} HPS，团血照样撑不到最后。',
    '治疗缺口已经是{gap}，{target}先把关键技能交出来。',
    '{target}别再省大技能了，人倒了蓝再满也没用。',
    '团队需要{required} HPS，{target}不能继续垫底。',
    '{target}先把治疗循环理顺，别让坦克拿命等读条。',
  ],
  '治疗不足-数据执着': [
    '{target}本场{value} HPS，全团{team_value}，距离需求还差{gap}。',
    '治疗门槛是{required}，目前团队只有{team_value}，{target}最低。',
    '数据记录：{target}的有效HPS只有{value}。',
    '{target}排在治疗末位，资源利用率需要重新检查。',
    '别凭感觉说刷住了，{target}的最终HPS是{value}。',
    '全团治疗缺口{gap}，先核对{target}的技能覆盖。',
    '{target}的减员和断档已经体现在{value} HPS里。',
    '当前最低治疗是{target}，和其他治疗差距明显。',
    '日志显示{target}的关键团伤覆盖不足，最终{value} HPS。',
    '需求{required}、实际{team_value}，最低位{target}必须调整。',
    '{target}的治疗占比最低，本场记录为{value} HPS。',
    '全团HPS {team_value}，门槛{required}，末位是{target}。',
    '{target}的关键技能覆盖率不足，最终形成{gap}点缺口。',
    '按有效治疗统计，{target}的{value} HPS排在最后。',
    '数据结论很明确：{target}需要优先调整治疗时间轴。',
  ],
  '治疗不足-阴阳怪气': [
    '原来{target}今天修的是预防医学，尽量不产生治疗量。',
    '{target}这{value} HPS，主打一个让队友学会自救。',
    '别人刷血，{target}负责观察生命的自然消逝。',
    '{target}蓝条挺健康，队友的血条就不太健康。',
    '坦克倒得这么安详，看来{target}的治疗很有镇静效果。',
    '{target}不是没治疗，只是治疗都在计划里。',
    '全团都在掉血，{target}在保护自己的法力生态。',
    '{target}的治疗表很清爽，数字一点都不拥挤。',
    'Boss看见{target}的HPS，终于敢放心打坦克了。',
    '{target}把治疗压力成功转化成了团队心理压力。',
    '{target}把蓝条保养得不错，队友就没这么幸运了。',
    '别人抬血，{target}负责研究血条还能降多快。',
    '{target}这治疗节奏很从容，主要是尸体不着急。',
    '看完{target}的{value} HPS，治疗药水都想申请进组。',
    '{target}今天的治疗理念，大概是尊重血量自由。',
  ],
  '数值不足-调解者': [
    '先别围着{target}开会，缺口找到了，重新排技能再来。',
    '数字低可以调，别把复盘变成人身攻击。',
    '{target}下一把调整循环，其他人也把爆发和减伤对齐。',
    '先把{gap}的缺口拆开分，不是全压给一个人。',
    '数据看到了，给{target}一次调整机会，下一把再看。',
    '别急着喷，先确认{target}是不是中途减员或被安排了任务。',
    '全团数值不足，不是点出末位就算复盘结束。',
    '知道最低项就行，重新分工，把团队缺口一起补上。',
    '先统一技能时间轴，{target}再把个人循环顺一下。',
    '有数据就按数据调整，少吵两句，下一把验证。',
    '先把问题拆开处理，{target}调个人，全团调技能顺序。',
    '指出最低项就够了，别继续围攻，下一把用数据说话。',
    '缺口是团队共同结果，给{target}明确调整方案再开。',
    '先确认任务分配，再让{target}修正循环，别只看一句排名。',
    '都冷静一点，数据用来解决问题，不是用来找人出气。',
  ],
  '数值不足-老司机': [
    '数值问题比机制炸团好调，技能顺序排一下还能过。',
    '{target}先把循环修正，其他人的爆发也别错开。',
    '这种缺口不是死局，药水、爆发和减伤重新排就行。',
    '先看{target}是不是承担了额外任务，再决定怎么补数字。',
    '狂暴线差{gap}，每个人补一点就够，不用现在散团。',
    '老本里这种情况常见，时间轴对齐后数字自然会上来。',
    '把死亡和停手时间处理掉，下一把数据会好很多。',
    '别只盯最终表，先查{target}在哪个阶段掉了节奏。',
    '门槛是{required}，现在{team_value}，差距还在可调整范围。',
    '先重排技能和站位，下一把再用同一套数据验证。',
    '这种数值差通常是时间轴问题，先把爆发窗口重新对齐。',
    '{target}把低谷阶段补上，全团再统一药水和大技能。',
    '缺口{gap}不算绝境，先消掉无效跑位和空转时间。',
    '老经验看，先修死亡和断档，比站在这里吵表有用。',
    '把任务、减伤和爆发重新排一次，这个门槛还能追。',
  ],
  '数值不足-老黄牛': [
    '别光喷了，缺口找到了，下一把我多补点。',
    '{target}调整自己的，我把能补的任务再接一点。',
    '数字不够就一起补，坐满吃喝再开。',
    '先别散，药水和技能都准备好，再干一把。',
    '差{gap}不算没救，大家各自多做一点。',
    '我下一把把额外任务接过来，{target}专心打本职。',
    '少说两句，先把人拉起来，下一把继续。',
    '表看完就行，能调整的现在调整，不能调的我来补。',
    '全团一起少了数字，别把活都压给{target}。',
    '休息半分钟，把技能排好，继续干。',
    '我把能接的杂活接走，{target}下一把专心把数字补上。',
    '先吃喝坐满，少掉一个技能都是缺口，准备好再开。',
    '别在频道里耗时间了，该换装换装，该补药补药。',
    '差{gap}就一起扛，没人靠骂两句能多出伤害。',
    '把人拉起来继续干，下一把每个人都多做一点。',
  ],
}

const targetedStyleNames = new Set(Object.keys(targeted))
const rows = baseRows.filter((row) => !targetedStyleNames.has(row.style))

for (const [style, templates] of Object.entries(targeted)) {
  const isDamage = style.startsWith('输出不足')
  const isHealing = style.startsWith('治疗不足')
  const isSupport = style.startsWith('数值不足')
  const targetScope = isDamage ? '最低DPS' : isHealing ? '最低HPS' : '全团'
  const note = isSupport
    ? '仅用于整体DPS/HPS不足且没有明确机制责任人时鼓励团队'
    : `仅用于整体${isDamage ? 'DPS' : 'HPS'}不足且没有明确机制责任人时，定向评论本场${targetScope}`
  templates.forEach((template, offset) => rows.push({
    scene: '灭团',
    style,
    template,
    metadata: ['非责任人', targetScope, note],
    originalIndex: sourceData.length + offset,
  }))
}

const sceneOrder = new Map(['报名', '灭团', '退团', '拍卖', '补人'].map((scene, order) => [scene, order]))
rows.sort((left, right) => (sceneOrder.get(left.scene) ?? 99) - (sceneOrder.get(right.scene) ?? 99)
  || left.style.localeCompare(right.style, 'zh-CN')
  || left.originalIndex - right.originalIndex)

const matrix = [
  ['scene', 'style_or_trait', 'template', 'speaker_scope', 'target_scope', 'maintenance_note'],
  ...rows.map((row) => [row.scene, row.style, row.template, ...row.metadata]),
]

const workbook = Workbook.create()
const sheet = workbook.worksheets.add('聊天模板')
sheet.getRangeByIndexes(0, 0, matrix.length, matrix[0].length).values = matrix
sheet.freezePanes.freezeRows(1)
sheet.showGridLines = false
sheet.getRange(`A1:F1`).format = {
  fill: '#1F4E78',
  font: { bold: true, color: '#FFFFFF' },
  borders: { preset: 'outside', style: 'thin', color: '#1F4E78' },
}
sheet.getRange(`A2:F${matrix.length}`).format = {
  wrapText: true,
  verticalAlignment: 'top',
  borders: { insideHorizontal: { style: 'thin', color: '#D9E2F3' } },
}
sheet.getRange(`A1:A${matrix.length}`).format.columnWidth = 12
sheet.getRange(`B1:B${matrix.length}`).format.columnWidth = 24
sheet.getRange(`C1:C${matrix.length}`).format.columnWidth = 62
sheet.getRange(`D1:E${matrix.length}`).format.columnWidth = 16
sheet.getRange(`F1:F${matrix.length}`).format.columnWidth = 48
sheet.getRange(`A2:F${matrix.length}`).format.rowHeight = 30

const escapeCsv = (value) => {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
await fs.writeFile(sourcePath, `${matrix.map((row) => row.map(escapeCsv).join(',')).join('\n')}\n`, 'utf8')

const inspect = await workbook.inspect({
  kind: 'table',
  sheetId: '聊天模板',
  range: `A1:F${Math.min(matrix.length, 25)}`,
  include: 'values',
  tableMaxRows: 25,
  tableMaxCols: 6,
  maxChars: 8000,
})
await fs.writeFile(`${outputDir}/inspect.ndjson`, inspect.ndjson, 'utf8')

const previewTop = await workbook.render({ sheetName: '聊天模板', range: 'A1:F25', scale: 1, format: 'png' })
await fs.writeFile(`${outputDir}/preview_top.png`, new Uint8Array(await previewTop.arrayBuffer()))
const targetedStart = matrix.findIndex((row) => row[1] === '输出不足-压力怪') + 1
const targetedEnd = Math.min(matrix.length, targetedStart + 24)
const previewTargeted = await workbook.render({ sheetName: '聊天模板', range: `A${targetedStart}:F${targetedEnd}`, scale: 1, format: 'png' })
await fs.writeFile(`${outputDir}/preview_targeted.png`, new Uint8Array(await previewTargeted.arrayBuffer()))
const xlsx = await SpreadsheetFile.exportXlsx(workbook)
await xlsx.save(`${outputDir}/Chat_Templates_维护预览.xlsx`)

console.log(JSON.stringify({
  originalRows: sourceData.length,
  finalRows: rows.length,
  addedRows: rows.length - sourceData.length,
  targetedStart,
  targetedEnd,
}, null, 2))
