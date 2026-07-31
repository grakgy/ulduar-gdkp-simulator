import { gameConfig } from './data'

export type DirectHiddenEndingReason = '散伙分行李' | '滚都滚' | '黑金跑路'

export interface DirectHiddenEnding {
  reason: DirectHiddenEndingReason
  chat: string[]
}

function configNumber(key: string, fallback: number) {
  const value = Number(gameConfig.get(key))
  return Number.isFinite(value) ? value : fallback
}

function roll(seed: string, key: string): number {
  let value = 2166136261
  const input = `${seed}|direct-hidden-ending|${key}`
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return (value >>> 0) / 4294967296
}

export function hiddenEndingAfterWipe(seed: string, morale: number, pot: number, clearedBosses: number, cumulativeWipes: number): DirectHiddenEnding | undefined {
  const splitEligible = morale <= configNumber('split_loot_morale_threshold', 20)
    && pot >= configNumber('split_loot_min_pot', 5000)
    && clearedBosses >= configNumber('split_loot_min_bosses', 2)
  if (splitEligible && roll(seed, 'split-loot') * 100 < configNumber('split_loot_event_pct', 6.5)) {
    return {
      reason: '散伙分行李',
      chat: [
        '队员：金池先分了吧，真不想再打了。',
        '队员：就地分金吧。',
        '团长：都同意的话现在清账，分完直接炉石。',
        '系统：全体成员同意就地分金并结束本次远征。',
      ],
    }
  }

  const rageEligible = cumulativeWipes >= configNumber('leader_rage_min_wipes', 8)
    && morale <= configNumber('leader_rage_morale_threshold', 35)
  if (rageEligible && roll(seed, 'leader-rage') * 100 < configNumber('leader_rage_event_pct', 5.5)) {
    return {
      reason: '滚都滚',
      chat: [
        '团长：滚！都滚！不打了！',
        '队员：别啊团长，再试一把有戏',
        '系统：团长已经离线。',
      ],
    }
  }
  return undefined
}

export function hiddenEndingAfterAuction(seed: string, pot: number, clearedBosses: number, totalBosses: number): DirectHiddenEnding | undefined {
  const eligible = clearedBosses >= configNumber('black_gold_min_bosses', 3)
    && clearedBosses < totalBosses
    && pot >= configNumber('black_gold_min_pot', 10000)
  if (!eligible || roll(seed, 'black-gold') * 100 >= configNumber('black_gold_run_pct', 1)) return undefined
  return {
    reason: '黑金跑路',
    chat: [
      '系统：团长已经离线。',
      '队员：我的金呢？',
      '队员：不是吧，真黑了？',
      '队员：赶紧举报GM吧。',
    ],
  }
}
