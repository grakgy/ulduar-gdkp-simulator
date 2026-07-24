# CSV 直接维护与部署指南

以下 CSV 已在网页运行时直接读取。只修改单元格内容、保持表头和 ID 不变后，可以直接提交并推送到 Git；Cloudflare Pages 重新构建后即可生效，不需要修改 TypeScript。

## 人物

- `Players_Public.csv`：名字、职业、报名专精、报名职责、基础装等、公开副修、公开进度、消费自述和招募密语。
- `Players_Hidden.csv`：真实水平、机制、意识、稳定、团队性、性格、退团率、消费能力和特殊规则说明。
- `Player_Specs.csv`：每个人可切换的专精、职责、专精水平和 Boss 经验。

三张表使用相同 `player_id` 关联。新增人物时必须三张表同时补齐；已有角色只改数值时不要修改 `player_id`。

## 对话与战斗记录

- `Chat_Templates.csv`：报名、灭团、退团和拍卖中的人物发言。
- `Combat_Log_Templates.csv`：战斗开始、击杀、减员击杀和各种灭团收尾文案。
- `Boss_Events.csv`：每个 Boss 的技能事件、目标、团队要求、难度和成功/失败描述。

`Chat_性格覆盖关系.csv` 是检查报告，不参与网页运行。修改人物性格或 `Chat_Templates.csv` 后可运行 `npm run chat:coverage` 重新生成，但不修改它也不会阻止网页读取最新对话。

## Boss 难度与职责硬条件

`Bosses.csv` 可以直接调整：

- `base_dc`：Boss 综合难度。
- `tank_mode`：载具、单坦、双坦或弹性。
- `healing_pressure`：低、中、高或极高。
- `min_tanks` / `max_tanks`：允许的坦克人数范围。
- `min_healers` / `max_healers`：允许的治疗人数范围。
- `min_dps`：基础最低输出人数。
- `min_tank_ilvl`：坦克组必须达到的最低平均装等；单坦时就是该坦克本人的装等。
- `extra_tank_min_dps`：实际坦克数高于最低坦克数时，要求的最低输出人数。
- `design_note`：Boss 准备页展示的说明。

职责人数、坦克装等或最低输出人数不满足时，会按照 `Game_Config.csv` 的 `invalid_composition_fail_pct` 概率直接判定阵容结构失败；当前为 85%。修改列值即可调整规则；不要删除列或修改 `boss_id`。

## 掉落与全局配置

- `Loot_Pool.csv`：装备名称、Boss、品质、适用职业、权重和参考价格。
- `Game_Config.csv`：目前已直接接入的键包括：
  - `player_pool_size`
  - `initial_morale`
  - `wipe_morale_loss_1`
  - `wipe_morale_loss_2`
  - `wipe_morale_loss_3`
  - `invalid_composition_fail_pct`（阵容门槛不满足时直接结构失败的概率，当前为 85）

`Game_Config.csv` 中其他历史键暂时仍主要用于说明，不能保证只改 CSV 就会影响运行逻辑。

## 不建议直接维护

- `Player_Pool.csv`：运行时已不读取；选手池由全部 `玩家自建` 人物加随机人物自动生成。
- `Chat_性格覆盖关系.csv`：由检查脚本生成。
- `Auction_Rules.csv`、`Economy_Types.csv`、`Social_Traits.csv`、`Specs.csv`：目前不是主要运行数据源，修改前应先确认代码是否读取对应字段。

## 上传前检查

建议依次运行：

1. `npm run chat:coverage`（仅在修改人物性格或聊天模板时需要）
2. `npm run verify`
3. `npm run difficulty`
4. `npm run build`

全部通过后提交并推送到 Git。只提交到本地但没有 `git push` 时，Cloudflare Pages 不会收到新版本。
