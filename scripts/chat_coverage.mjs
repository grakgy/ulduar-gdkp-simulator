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

const publicPlayers = parseCsv(await fs.readFile('Players_Public.csv', 'utf8'))
const hiddenPlayers = parseCsv(await fs.readFile('Players_Hidden.csv', 'utf8'))
const templates = parseCsv(await fs.readFile('Chat_Templates.csv', 'utf8'))
const publicById = new Map(publicPlayers.map((player) => [player.player_id, player]))
const counts = new Map()
for (const template of templates) {
  const key = `${template.scene}|${template.style_or_trait}`
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

const countFor = (scene, trait) => !trait || trait === '无' ? '不适用' : String(counts.get(`${scene}|${trait}`) ?? 0)
const custom = hiddenPlayers
  .filter((player) => player.source_type === '玩家自建')
  .sort((left, right) => Number(left.player_id.slice(1)) - Number(right.player_id.slice(1)))
  .map((player) => {
    const publicPlayer = publicById.get(player.player_id)
    return {
      player_id: player.player_id,
      name: publicPlayer?.name ?? player.player_id,
      custom_batch: Number(player.player_id.slice(1)) <= 102 ? '自建人物A' : '自建人物B',
      social_primary: player.social_primary,
      social_secondary: player.social_secondary,
      signup_chat_source: 'Players_Public.csv / whisper_pool（候选卡报名密语）',
      wipe_primary_templates: countFor('灭团', player.social_primary),
      wipe_secondary_templates: countFor('灭团', player.social_secondary),
      leave_primary_templates: countFor('退团', player.social_primary),
      leave_secondary_templates: countFor('退团', player.social_secondary),
      leave_policy: player.leave_policy,
      runtime_usage: player.leave_policy === '永不主动退队'
        ? '灭团性格已实装；退团模板已预留，但正常规则下不会主动退团'
        : '灭团性格与退团性格均可在本局触发',
    }
  })

const headers = ['player_id', 'name', 'custom_batch', 'social_primary', 'social_secondary', 'signup_chat_source', 'wipe_primary_templates', 'wipe_secondary_templates', 'leave_primary_templates', 'leave_secondary_templates', 'leave_policy', 'runtime_usage']
const output = [headers.join(','), ...custom.map((row) => headers.map((header) => csvCell(row[header])).join(','))]
await fs.writeFile('Chat_性格覆盖关系.csv', `${output.join('\r\n')}\r\n`, 'utf8')

const templateCounts = (row) => [row.wipe_primary_templates, row.wipe_secondary_templates, row.leave_primary_templates, row.leave_secondary_templates]
  .filter((value) => value !== '不适用')
  .map(Number)
const uncovered = custom.filter((row) => templateCounts(row).some((value) => value === 0))
const underRecommended = custom.filter((row) => templateCounts(row).some((value) => value > 0 && value < 15))
console.log(JSON.stringify({
  customPlayers: custom.length,
  templateRows: templates.length,
  uncovered: uncovered.map((player) => player.player_id),
  underRecommended: underRecommended.map((player) => player.player_id),
  output: 'Chat_性格覆盖关系.csv',
}, null, 2))
if (uncovered.length) process.exitCode = 1
