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
- `Raid_Buffs.csv`：职业/专精提供的团队 Buff、图标文件、战斗加成和说明。图标放在 `photo/buff/`，`icon_file` 必须与文件名完全一致。
  - `physical_pct` / `caster_pct`：分别影响物理与法系输出。
  - `melee_pct` / `ranged_pct`：分别影响近战与远程输出。
  - `healing_pct`：影响治疗量。
  - `power_bonus`：少量影响团队处理机制的综合能力。
- `Game_Config.csv`：目前已直接接入的键包括：
  - `player_pool_size`
  - `initial_morale`
  - `max_boss_attempts`
  - `wipe_morale_loss_1`
  - `wipe_morale_loss_2`
  - `wipe_morale_loss_3`
  - `wipe_morale_loss_4`
  - `invalid_composition_fail_pct`（阵容门槛不满足时直接结构失败的概率，当前为 85）
  - `high_pot_leave_reduction`
  - `replacement_success_pct_1`
  - `replacement_success_pct_2`
  - `replacement_success_pct_3`
  - `replacement_success_pct_4`
  - `universal_leave_floor_55`
  - `universal_leave_floor_40`
  - `universal_leave_floor_25`
  - `special_collapse_leave_pct`
  - `internet_cafe_leave_pct`
  - `special_wipe_event_pct`
  - `incidental_death_multiplier`
  - `low_morale_power_penalty_55`
  - `low_morale_power_penalty_40`
  - `low_morale_power_penalty_25`
  - `raid_buff_power_cap`
  - `splus_start_price`
  - `splus_reference_price`
  - `splus_bid_cap_multiplier`

`Game_Config.csv` 中其他历史键暂时仍主要用于说明，不能保证只改 CSV 就会影响运行逻辑。

## 退团与补人

- 自建人物 A 批为 `P081`–`P102`，引荐人是 `P092`、`P082`、`P120`。
- 自建人物 B 批为 `P103`–`P120`，引荐人是 `P083`、`P088`、`P091`、`P100`、`P096`、`P097`。
- 第一至第四次补人的单渠道成功率分别读取 `replacement_success_pct_1` 到 `replacement_success_pct_4`；A、B 两条渠道同时存在时各自独立判定，任一渠道成功即可进入补人页。
- 第五次退团不再补人；两条渠道同时存在时进入“臭名昭著”，否则进入“组不到人”。前四次概率判定失败也会进入“组不到人”结局。
- 多多虎或多多球喷人触发的“分崩离析”是隐藏直达结局，不进入补人流程。
- 网吧到点事件只适用于愤怒月神和元素打击，概率读取 `internet_cafe_leave_pct`。

补人名单会自动排除当前队员、本局已退团人员和没有可用专精数据的人物，并保证候选人加入后，结合现有成员可切专精能够满足当前 Boss 的坦克、治疗和输出职责门槛。批次范围和引荐人名单目前属于代码规则，修改这些名单仍需要改 `src/replacement.ts`；成功率可直接改 CSV。

## 拍卖与士气

- S+ 默认读取 `splus_start_price`（当前 5,000G）和 `splus_reference_price`（当前 10,000G）。
- S+ 最高承受价额外乘以 `splus_bid_cap_multiplier`（当前 1.5）；实际成交价仍会依据老板资金、消费类型、竞价激进度和竞价人数大幅波动。
- S+竞价超过10,000G参考价后会使用500G或1,000G的大额加价档位，避免极品价格被低额加价轮数人为卡死。
- S/S+ 高价成交会增加士气，S+价格越高，士气增幅越明显；普通 C/B 掉落会小幅降低士气。
- 非简洁出价模板即使只写“继续”“+100”，页面也会自动附上该轮最终金额。约75%的出价直接显示简洁金额。

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
