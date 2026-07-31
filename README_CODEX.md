# 奥杜尔十人金团模拟器 — Codex 开发说明（MVP）
> 装等口径：每名人物只有一个统一角色装等 `signup_item_level`，建议范围为 200—232。所有主修、副修共用该装等；各专精只通过 `skill` 表示实际发挥，不再记录副修独立装等。


## 1. 目标

开发一个纯网页、单局制的自动模拟小游戏。玩家扮演团长，不参与战斗：

1. 每轮看到5名申请者。
2. 根据职业、报名专精、装等、自述副修、进度和一句密语选择成员。
3. 组满 10 人后设置复合职业的出战专精。
4. 自动连续模拟奥杜尔；每个 Boss 最多尝试 3 次。
5. 战斗后、灭团后触发团聊、士气变化和退团判定；任意成员退团则可能散团，有部分人员在场时可能可以组人，没有组人则战斗失败
6. 击杀 Boss 后随机掉落 2 件装备并自动竞价。
7. 最终根据本局结果判定专属结局，并展示进度、散团原因、总金池、人均分金、个人收支和奖项。

MVP 的总操作时间应控制在 3–5 分钟选人，30–90 秒模拟。

## 2. 明确的范围限制

- 不制作实时战斗画面。
- 不制作账号、服务器和多人联机。
- 不制作逐装备位的需求计算。
- 不计算买到装备后的战力提升。
- 不要求完整奥杜尔掉落库，先使用 `Loot_Pool.csv` 的精选池。
- 所有模拟在浏览器本地完成，存档只使用 `localStorage`。

## 3. 技术方案

- React
- TypeScript
- Vite
- Zustand（可选；状态不复杂时也可用 `useReducer`）
- 数据从 `/src/data/*.json` 加载；Codex 可先把 CSV 转成 JSON。
- 随机数必须使用可注入 seed 的 PRNG，便于复现和调试。

建议目录：

```text
src/
  data/
    playersPublic.json
    playersHidden.json
    playerSpecs.json
    socialTraits.json
    economyTypes.json
    bosses.json
    bossEvents.json
    lootPool.json
    auctionRules.json
    chatTemplates.json
  engine/
    rng.ts
    recruitment.ts
    teamValidation.ts
    combat.ts
    social.ts
    auction.ts
    settlement.ts
    awards.ts
  pages/
    RecruitmentPage.tsx
    TeamSetupPage.tsx
    SimulationPage.tsx
    ResultPage.tsx
  store/
    gameStore.ts
```

## 4. 核心状态机

```text
INIT
  -> RECRUITING
  -> TEAM_SETUP
  -> RUNNING_BOSS
  -> AUCTION (Boss击杀)
  -> RUNNING_BOSS (下一Boss)
  -> RESULT (五次失败、补人失败、特殊散团、或通关)
```

## 5. 招募

- 每局使用 50 人池：40 名玩家自建人物固定加入，再从随机人物中按 seed 抽取 10 名；重新开团时会更换随机人物。
- 每轮抽取 3–5 名尚未出现的申请者。
- 玩家每轮最多邀请 2 人。
- 未邀请者永久离开本局候选池。
- 最多 18 轮；仍未满 10 人则招募失败。
- 申请卡只能读取 `Players_Public`。
- 自建人物密语从各自的 `whisper_pool` 中随机抽取；随机人物按报名风格读取 `Chat_Templates.csv` 的“报名”模板。
- 不得在界面显示隐藏属性、消费类型真实性、实际副修能力或性格。

### 密语合成要求

报名专精必须出现，例如：

- `惩戒 1`
- `惩戒 全通经验`
- `惩戒 可切奶骑`
- `鸟德 可切奶德`
- `奶萨 半打半消`

密语不等于事实。`全通经验`、`大号全通`、`有消费`都可以是假的。

## 6. 队伍配置与多修

组满 10 人后，玩家可以在该人物**公开自述过的专精**中选择出战专精。

实际战斗数值读取 `Player_Specs`：

- `skill`：该专精实际水平。
- `character_item_level`：复制人物统一装等，仅为读取方便；主修、副修不得使用不同装等。
- `boss_experience`：该专精对奥杜尔的经验。
- `willing_switch`：即使公开声称会切，也可能临时不愿切；MVP 可把“不愿切”表现为切换按钮禁用并出现一句团聊。

配置页不做硬拦截，职责问题在战斗中自然结算。每个 Boss 在 `Bosses.csv` 里配置：

- `tank_mode`：`载具`、`双坦`、`单坦`、`弹性`。
- `healing_pressure`：`低`、`中`、`高`、`极高`。

通用组队仍推荐 `2T + 2治疗 + 6DPS`；高压开荒可用 `2T + 3治疗 + 5DPS`。单坦 Boss 可以让副坦切输出。治疗判定不只看人数，还读取当前治疗专精的真实水平、意识、稳定和团队性：强力双治疗可以扛住高压，较弱双治疗即使人数达标也可能奶不起来。三治疗能补足治疗能力，但会因压缩输出位承担狂暴风险。

## 7. Boss 路线

普通模式：伊格尼斯、锋鳞、科隆加恩、奥莉亚。

固定困难模式：烈焰巨兽四塔、XT 碎心者、钢铁议会断钢者最后、霍迪尔稀有宝箱、托里姆希芙、弗蕾亚三长老、米米尔隆消防员、维扎克斯畸体、尤格萨隆零灯。

奥尔加隆：四守护者 H 均击杀后解锁；MVP 为保持线性流程，放在尤格萨隆之后。

具体 DC 和事件读取 `Bosses` 与 `Boss_Events`。

## 8. 单次事件计算

先计算目标人物或小组的事件能力：

```ts
score =
  mechanics * 0.35 +
  awareness * 0.25 +
  stability * 0.20 +
  teamwork * 0.10 +
  relevantSpecSkill * 0.10 +
  teamUtilityModifier +
  socialStateModifier +
  attemptLearningBonus;
```

成功率：

```ts
successRate = clamp(
  55 + (score - eventDc) * 2 + random(-5, 5),
  5,
  95
);
```

判定：

```text
roll <= successRate                 成功
successRate < roll <= successRate+15 软失败
roll > successRate+15               严重失败
```

是否直接灭团由 `Boss_Events.hard_fail` 决定。软失败会累计死亡、治疗压力、输出损失或战复消耗。一个 Boss 内多个软失败可以形成连锁灭团。

## 9. 五次尝试

```text
第1次：熟练度 +0；灭团士气 -8
第2次：获得学习收益；灭团士气 -10
第3次：继续获得学习收益；灭团士气 -15
第4次：继续获得学习收益；灭团士气 -20
第5次：最后一次尝试；失败后本局结束
```

- Boss 剩余血量、当前士气、责任归属和个人退团倾向会共同影响退团概率。
- `learning` 高的人后续尝试提升更明显。
- 自信型、摆烂型的学习收益降低。

## 10. 社交、士气和退团

每次灭团后的顺序：

1. 保存真实责任链。
2. 根据性格生成 1–3 句团聊。
3. 应用压力怪、气氛组、调解者、拱火者等士气影响。
4. 更新个人下一把状态。
5. 计算每人的退团率。
6. 有人退团后先按引荐渠道判定能否补人；特殊“分崩离析”直接散团。

基础退团率会叠加：

```ts
leaveRate = player.baseLeavePct
  + attemptModifier
  + lowMoraleModifier
  + blamedModifier
  + traitModifier
  + universalLowMoraleFloor
  + bossRemainingHpModifier
  + potModifier;

leaveRate = clamp(leaveRate, 0, 45);
```

金池修正：

- 当前预计人均分金较高：最多 `-8%`。
- 进度较深但金池明显偏低：最多 `+6%`。
- 主动退团者取消最终分金资格。

## 11. 掉落

MVP 不做完整数据库，使用 `Loot_Pool` 精选池。

- 普通 Boss：从 `drop_group=普通` 无重复抽 2 件。
- H Boss：普通池抽 1 件，困难池抽 1 件。
- 奥尔加隆：专属池无重复抽 2 件。

每件装备字段：

- `category`：武器、饰品、套装、护甲、首饰。
- `eligible_tags`：只用于粗粒度职业/角色匹配。
- `grade`：C、B、A、S、S+。
- `start_price_gold`：起拍价。
- `reference_price_gold`：竞价计算基准。

价格是游戏平衡值，不是现实服务器价格。

## 12. 简化需求与竞价

本版本不读取人物当前装备，也不判断是否实际升级。

### 参与资格

人物当前专精的职业/角色必须匹配 `eligible_tags`。例如：

- `物理DPS`
- `法系DPS|治疗`
- `圣骑士|牧师|术士`
- `全职业`

### 购买意愿

```ts
qualityBonus = { C:0, B:5, A:12, S:22, 'S+':32 }[item.grade];
preferenceBonus = preferenceMatches ? 18 : -12;

desireScore =
  player.spendWillingness +
  qualityBonus +
  preferenceBonus +
  random(-20, 20);
```

- `desireScore < 55`：不竞价。
- 排骨党额外 `-30`。
- 毕业装党遇到 S/S+ 额外 `+20`。

### 最高承受价

```ts
maxBid = min(
  wallet,
  item.referencePrice * economyMultiplier * random(0.85, 1.15)
);
```

成交：

- 无人达到起拍：半价再问一次；仍无人则 100G 分解。
- 仅一人：起拍价成交。
- 两人以上：2–4 名有需求者可同时入场，按 100/200/500G 逐轮加价；达到个人上限者会退出，尚未入场的有需求者可能中途加入，直至只剩最高有效出价者。

成交后：

- 买家钱包扣款。
- 成交价进入团队金池。
- MVP **不提升买家战斗属性**。

## 13. 最终分金

```ts
eligibleMembers = members.filter(m => !m.leftRaid);
share = Math.floor(pot / eligibleMembers.length);
netResult = share - personalSpending;
```

结果页至少显示：

- 按固定优先级判定的战局结局；判定逻辑和文案统一维护在 `src/endings.ts`。
- 最终进度与止步 Boss。
- 每个 Boss 的尝试次数。
- 结束原因：单 Boss 五次失败 / 退团后补人失败 / 特殊散团 / 全通。
- 总金池、人均分金。
- 每人的购买支出、分金、净收益。
- 最贵装备、最大老板、最大排骨、最强打工、最大战犯、最大诈骗。

## 14. 界面要求

### 招募页

- 左侧：本轮 3–5 名申请者。
- 右侧：当前 10 人团队和职业计数。
- 卡片只显示公开字段和一条密语。
- 可点击邀请、拒绝、下一轮。

### 配置页

- 显示 10 人。
- 复合职业可切换公开副修。
- 实时显示坦克/治疗/DPS数量和职业工具：嗜血、战复、打断、团队减伤、远程数量。

### 模拟页

- 每个 Boss 约显示 3–6 秒。
- 只显示关键事件，不滚动全部技能。
- 灭团时暂停约 2 秒，显示原因、团聊和是否有人退团。
- 击杀后显示两件掉落和简化竞价过程。

### 结果页

- 进度条。
- Boss 战绩表。
- 拍卖表。
- 人物最终结算表。
- 奖项卡片。
- “使用相同 seed 重放”和“重新开团”。

## 15. 验收标准

1. 每局固定加入全部 40 名玩家自建人物，并从随机人物中按 seed 抽取 10 名，组成 50 人选手池后完成招募。
2. 公开界面不泄漏隐藏性格和实际副修水平。
3. 混合职业切副修后共用人物装等，仅使用独立 `skill` 表示不同专精发挥。
4. 每个 Boss 最多 3 把。
5. 灭团后可触发社交影响和退团散团。
6. H Boss 确实抽 1 普通 + 1 困难掉落。
7. 拍卖成交逻辑可复现，钱包和金池正确变化。
8. 最终分金总额与金池一致，主动退团者无分金且不能参与“最大排骨”评选。
9. 同 seed、同选择产生相同结果。
10. 刷新页面不会丢失当前局（localStorage）。

## 16. 发布到网页

### 最快分享：Netlify Drop

项目完成后，在项目目录运行：

```bash
npm install
npm run build
```

确认生成 `dist/`，打开 <https://app.netlify.com/drop>，把整个 `dist` 文件夹拖进去。部署完成后会得到一个可分享的 `*.netlify.app` 网址。以后修改游戏，重新执行 `npm run build`，再把新的 `dist` 拖到同一个站点即可更新。

### 长期维护：Cloudflare Pages + GitHub

先把项目推到 GitHub，再在 Cloudflare Pages 连接仓库，设置：

```text
Build command: npm run build
Build output directory: dist
```

部署后获得 `*.pages.dev` 地址；以后每次推送代码会自动构建和发布。这个方案比手工拖文件更适合持续更新和绑定自定义域名。

### 备选：GitHub Pages

本项目是纯静态 HTML/CSS/JS，也可以使用 GitHub Pages。若使用项目站点路径 `/<repo-name>/`，Vite 需要配置：

```ts
// vite.config.ts
export default defineConfig({
  base: '/<repo-name>/'
});
```

本项目是纯前端，首版不需要服务器和数据库。玩家存档在各自浏览器的 `localStorage` 中，换电脑或清理浏览器数据不会同步。只有以后增加公共排行榜、账号、在线存档或共享每日挑战时，才需要后端。

## 17. 数据来源与声明

- 奥杜尔共有 13 个主Boss加1个额外Boss，存在10人普通及多个困难模式；结构参考：https://www.wowhead.com/wotlk/guide/raids/ulduar/overview
- 掉落名称与普通/困难池参考：https://www.wowhead.com/wotlk/cn/guide/raids/ulduar/loot
- 本项目的价格、评级、人物、属性和模拟公式均为游戏设计数据，不代表真实服务器生态。
- 公开发布时不要直接使用暴雪原画、Logo、音乐、技能图标或游戏内截图；建议使用纯文字与自制图形资源。


## 18. 自定义人物 V1

本版新增 `P081`—`P085`：多多虎、动与参与商、芙兰秀秀、萌战、成都漫游者。

暂定专精映射：

- 动与参与商：戒律牧主修，神牧副修。
- 萌战：狂暴战主修，武器战副修。
- 成都漫游者：战斗贼。

这些映射只是当前开发数据，可在 `Players_Public` 和 `Player_Specs` 中直接修改。所有专精共用同一角色装等。

新增社交特征：`厌蠢症`、`钻空子`、`宏依赖`、`不开麦`。这些特征应按事件触发，不得直接显示在招募卡上。
