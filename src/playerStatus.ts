export type PlayerStatusLevel = -3 | -2 | -1 | 0 | 1 | 2 | 3

export interface PlayerStatusSnapshot {
  actual: PlayerStatusLevel
  displayed: PlayerStatusLevel
  text: string
}

export const PLAYER_STATUS_WEIGHTS: ReadonlyArray<readonly [PlayerStatusLevel, number]> = [
  [3, .08],
  [2, .13],
  [1, .22],
  [0, .23],
  [-1, .20],
  [-2, .09],
  [-3, .05],
]

export const PLAYER_STATUS_MULTIPLIERS: Record<PlayerStatusLevel, number> = {
  3: 1.15,
  2: 1.10,
  1: 1.05,
  0: 1,
  [-1]: .95,
  [-2]: .90,
  [-3]: .85,
}

export const PLAYER_STATUS_COPY: Record<PlayerStatusLevel, readonly string[]> = {
  3: ['状态爆棚', '火力全开', '如有神助','手感滚烫','精神抖擞','斗志昂扬','势不可挡',],
  2: ['状态火热', '手感正佳', '精神十足','干劲十足','斗志高涨','信心满满','神采奕奕',],
  1: ['精神饱满', '状态不错', '比较专注','心情不错','从容放松','神情轻松','准备就绪',],
  0: ['状态正常', '一切如常', '情绪平稳','神色如常','表现平常','不温不火','波澜不惊','中规中矩'],
  [-1]: ['状态一般', '略显疲惫', '有些慢热','精神欠佳','兴致不高','反应稍慢','偶尔走神',],
  [-2]: ['明显疲惫', '心不在焉', '精神萎靡','注意涣散','神情恍惚','反应迟缓','昏昏沉沉','状态低迷',],
  [-3]: ['状态极差', '魂不守舍', '萎靡不振','六神无主','神思恍惚','疲惫不堪','人魂分离',],
}

function clampLevel(value: number): PlayerStatusLevel {
  return Math.max(-3, Math.min(3, value)) as PlayerStatusLevel
}

function weightedLevel(roll: number): PlayerStatusLevel {
  let cursor = 0
  for (const [level, weight] of PLAYER_STATUS_WEIGHTS) {
    cursor += weight
    if (roll < cursor) return level
  }
  return -3
}

export function createPlayerStatusSnapshot(actualRoll: number, displayRoll: number, copyRoll: number): PlayerStatusSnapshot {
  const actual = weightedLevel(actualRoll)
  const offset = displayRoll < .15 ? 1 : displayRoll < .30 ? -1 : 0
  const displayed = clampLevel(actual + offset)
  const copies = PLAYER_STATUS_COPY[displayed]
  return {
    actual,
    displayed,
    text: copies[Math.floor(copyRoll * copies.length)] ?? copies[0],
  }
}

export function playerStatusMultiplier(level: PlayerStatusLevel): number {
  return PLAYER_STATUS_MULTIPLIERS[level]
}
