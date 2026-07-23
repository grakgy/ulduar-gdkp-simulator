import fs from 'node:fs/promises'
import path from 'node:path'
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool'

const workspace = path.resolve(import.meta.dirname, '..', '..')
const outputDir = import.meta.dirname
const sources = [
  ['公开信息', 'Players_Public.csv'],
  ['隐藏属性', 'Players_Hidden.csv'],
  ['隐藏字段说明', 'Players_Hidden_字段说明.csv'],
  ['专精配置', 'Player_Specs.csv'],
  ['性格字典', 'Social_Traits.csv'],
  ['经济类型', 'Economy_Types.csv'],
  ['语言模板', 'Chat_Templates.csv'],
  ['活跃人物池', 'Player_Pool.csv'],
]

const firstText = await fs.readFile(path.join(workspace, sources[0][1]), 'utf8')
const workbook = await Workbook.fromCSV(firstText, { sheetName: sources[0][0] })
for (const [sheetName, fileName] of sources.slice(1)) {
  const csvText = await fs.readFile(path.join(workspace, fileName), 'utf8')
  await workbook.fromCSV(csvText, { sheetName })
}

const palette = {
  ink: '#0D1110', panel: '#171B17', gold: '#E4AD46', cream: '#F1EEE5',
  line: '#3A4039', green: '#71B877', custom: '#2A402E', random: '#1A1F1A',
}
const widths = {
  公开信息: [12, 18, 12, 14, 13, 13, 20, 20, 16, 22, 48],
  隐藏属性: [12, 12, 12, 12, 12, 12, 12, 12, 12, 14, 16, 18, 15, 16, 15, 15, 18, 17, 17, 18, 28, 15, 16, 25, 25, 36, 18, 60],
  隐藏字段说明: [24, 14, 14, 28, 64],
  专精配置: [12, 16, 15, 18, 12, 18, 16, 16],
  性格字典: [18, 55, 24, 24, 18, 18],
  经济类型: [18, 22, 18, 18, 18, 50],
  语言模板: [14, 20, 58],
  活跃人物池: [16],
}

for (const [sheetName] of sources) {
  const sheet = workbook.worksheets.getItem(sheetName)
  const used = sheet.getUsedRange(true)
  const rows = used.rowCount
  const cols = used.columnCount
  sheet.showGridLines = false
  sheet.freezePanes.freezeRows(1)
  sheet.getRangeByIndexes(0, 0, rows, cols).format = {
    fill: palette.ink,
    font: { color: palette.cream, size: 10 },
    verticalAlignment: 'center',
    wrapText: true,
    borders: { preset: 'all', style: 'thin', color: palette.line },
  }
  sheet.getRangeByIndexes(0, 0, 1, cols).format = {
    fill: palette.panel,
    font: { color: palette.gold, bold: true, size: 11 },
    verticalAlignment: 'center',
    wrapText: true,
    borders: { preset: 'all', style: 'thin', color: palette.gold },
    rowHeight: 30,
  }
  const sheetWidths = widths[sheetName] ?? Array(cols).fill(18)
  for (let col = 0; col < cols; col += 1) {
    sheet.getRangeByIndexes(0, col, rows, 1).format.columnWidth = sheetWidths[col] ?? 18
  }
  if (rows > 1) sheet.getRangeByIndexes(1, 0, rows - 1, cols).format.rowHeight = sheetName === '语言模板' ? 24 : 30
  if (sheetName === '隐藏属性') {
    const sourceColumn = 21
    sheet.getRangeByIndexes(1, sourceColumn, rows - 1, 1).conditionalFormats.add('containsText', {
      text: '玩家自建', format: { fill: palette.custom, font: { color: '#A8E6AE', bold: true } },
    })
    sheet.getRangeByIndexes(1, sourceColumn, rows - 1, 1).conditionalFormats.add('containsText', {
      text: '随机生成', format: { fill: palette.random, font: { color: '#A9B0AA' } },
    })
  }
}

await fs.mkdir(outputDir, { recursive: true })
const inspect = await workbook.inspect({ kind: 'sheet,region', maxChars: 8000, tableMaxRows: 3, tableMaxCols: 8 })
await fs.writeFile(path.join(outputDir, 'inspect.txt'), inspect.ndjson ?? String(inspect), 'utf8')
for (const [sheetName] of sources) {
  const preview = await workbook.render({ sheetName, autoCrop: 'all', scale: 0.8, format: 'png' })
  await fs.writeFile(path.join(outputDir, `${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()))
}
const output = await SpreadsheetFile.exportXlsx(workbook)
await output.save(path.join(outputDir, '奥杜尔人物配置总表.xlsx'))
console.log(`exported ${sources.length} sheets`)
