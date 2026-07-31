export type EndingKind = 'hidden' | 'full-clear' | 'main-clear' | 'leave' | 'replacement-failure' | 'boss-failure' | 'fallback'

export interface EndingHistory {
  bossId: string
  attempts: number
  killed: boolean
  wipes: number
}

export interface EndingTeamMember {
  id: string
  name: string
  left: boolean
  blame: number
  personality: string
}

export interface EndingBoss {
  id: string
  name: string
  order: number
}

export interface EndingRunData {
  seed: string
  endReason: string
  currentBossId: string
  histories: EndingHistory[]
  team: EndingTeamMember[]
  bosses: EndingBoss[]
  pot: number
  leaverId?: string
  responsibleId?: string
  leaveType?: string
  leaveReason?: string
}

interface EndingCopy {
  title: string
  body: string
}

export interface RunEnding extends EndingCopy {
  priority: 100 | 95 | 90 | 80 | 70 | 60 | 10
  kind: EndingKind
  label: string
  summary: string
  hidden: boolean
  reward?: {
    title: string
    detail: string
  }
}

const failure = (title: string, body: string): EndingCopy => ({ title, body })

// 每个 Boss 固定五个专属失败结局。判定只使用 bossId，不依赖页面名称。
export const BOSS_FAILURE_ENDINGS: Record<string, EndingCopy[]> = {
  B01: [
    failure('车队全灭', '烈焰巨兽锁定了最后一辆载具，履带碾过废墟，炮火沿着道路一路追来。通讯里只剩谁去修车、谁还能开炮的争吵，随后所有引擎同时熄火。奥杜尔的大门依旧敞着，车队却已经没有一辆还能继续前进。'),
    failure('炮手失联', '投石车冲得太快，摩托车忙着捡人，攻城车上的炮手还在寻找刚才的目标。烈焰巨兽拖着火焰从车阵中央穿过，整条进攻路线被烧成了维修区。'),
    failure('超载失败', '负责登车的人没能按时完成破坏，地面的载具也撑不到下一次机会。烈焰巨兽重新锁定车队，炮口转过来的那一刻，语音里响起一片“下车修装备吧”。'),
    failure('奥杜尔堵车', '十个人开着三种载具挤在同一条路上，有人倒车，有人迷路，还有人把乘客扔进了火里。烈焰巨兽甚至不用追，停在路口等着就把车队收拾干净。'),
    failure('废铁远征', '炮台还在转，焦油还在烧，地上已经铺满报废载具。最后一辆攻城车冒着黑烟停下后，团长看了眼维修费，远征计划当场改成了原地解散。'),
  ],
  B02: [
    failure('熔炉吞噬', '灼热火焰沿着地面扩散，铁构造体拖着通红的身体穿过人群。该进水的目标迟迟没有脆化，熔炉的轰鸣盖过了最后几句指挥，伊格尼斯继续锻造下一批残骸。'),
    failure('铁水封门', '构造体被拉进火里，却没能及时送进水池；有人在熔渣罐里挣扎，治疗的技能也跟着见底。铁水漫过通道时，团队终于放弃了继续加热这场事故。'),
    failure('出炉即报废', '新生构造体一只接一只站起来，场上很快挤满烧红的铁块。转火口令越来越急，真正需要集火的目标却始终没人打，最后连团长都分不清哪只是第几只。'),
    failure('熔渣套餐', '伊格尼斯把队员轮流塞进熔渣罐，治疗忙着抬人，坦克还在拖着构造体找水。第五个受害者出来时只说了一句：“这个锅有点烫。”随后全团整整齐齐躺在了熔炉旁边。'),
    failure('炉火未熄', '水池、火区和构造体本该组成一条清晰流程，场面却始终像失控的铸造车间。最后一轮灼热铺开后，所有安全位置都消失了，熔炉依旧亮着，团队频道彻底黑了。'),
  ],
  B03: [
    failure('鱼叉齐空', '鱼叉接连射出，锋鳞只在半空晃了一下便重新拉高。地面的矮人小怪还在追着治疗，火焰已经铺到装填位置，下一轮落地机会就这样消失在烟里。'),
    failure('猎龙未遂', '负责小怪的人追着符文守卫满场跑，负责鱼叉的人催了三遍还没等到口令。锋鳞落地时输出技能都在冷却，重新升空时全团只剩一排叹号。'),
    failure('焦土围场', '火圈沿着鱼叉附近一层层叠开，能站的位置被切成狭窄碎片。锋鳞俯冲掠过战场，焦土上留下尸体、断掉的节奏和无人装填的鱼叉。'),
    failure('龙影压境', '每次把锋鳞拉回地面，团队都能看见胜利窗口；每次窗口开启，又有人被火焰和小怪拖走。最后一支鱼叉射空后，龙影重新罩住整片战场。'),
    failure('装填完毕，人员不足', '鱼叉终于全部就位，团长倒数刚喊到二，转头发现地面组已经少了一半。锋鳞落地看了一圈，像是确认人数无误，随后一口火把剩下的人也送走了。'),
  ],
  B04: [
    failure('心脏失控', 'XT-002的心脏暴露在全团面前，爆发技能也同时亮起。几秒后重力炸弹落进人群，小机器人从四面涌来，原本最好的输出窗口迅速变成了拆团现场。'),
    failure('玩具箱爆炸', '光明炸弹在人群中持续炸开，重力炸弹又把近战吸成一团，废料机器人还在给Boss回血。XT-002一边哭闹一边震地，团队终于理解这间玩具室为什么没人打扫。'),
    failure('修理机器人胜利', '心脏阶段打得热火朝天，场边的修理机器人也勤勤恳恳地跑到了Boss脚下。血条回升的瞬间，语音安静了两秒，随后所有人开始讨论到底是谁没转火。'),
    failure('震地停工', '连续的震地让团队血线反复见底，炸弹点名又把仅剩的站位切碎。XT-002的金属脚步越来越近，治疗的蓝条先见了底，接着整支队伍一起停工。'),
    failure('拆解对象错误', '团队带着拆机器的计划进场，最后被炸弹、机器人和心脏阶段逐项拆开。XT-002重新合上胸腔时，地上的十个人反而先被拆成了零件。'),
  ],
  B05: [
    failure('议会裁决', '增益符文落在脚下时没人集中输出，死亡符文出现时却总有人坚持站满。三名议员轮流施压，打断顺序和击杀目标在语音里改了又改，最终裁决只剩一句：散会。'),
    failure('三席压境', '一名议员开始施法，第二名铺下符文，第三名已经举起武器冲向坦克。三个节奏同时压过来，团队每次只能处理其中两个，剩下的那个负责结束战斗。'),
    failure('符文公投', '有人追着力量符文跑，有人把危险符文带进大团，还有人坚持自己脚下这个一定是好圈。钢铁议会用一轮爆炸完成表决，十票全部作废。'),
    failure('打断席空缺', '打断表排得整整齐齐，真正开打后却从第一轮就开始跳号。致命施法一次次读完，团长从点名催促变成逐个询问，最后发现所有人都说自己刚断过。'),
    failure('议程失控', '击杀顺序临场变化，站位跟着变化，技能分配也一起推倒重来。议会大厅里每个人都在执行一套独立方案，三名首领安静地看着这场内部会议自行崩盘。'),
  ],
  B06: [
    failure('石握葬礼', '巨手合拢时，被抓的人在掌心迅速掉血。负责转火的输出仍在打本体，治疗的技能追不上石握伤害，科隆加恩松手时，桥面只多了一具尸体。'),
    failure('眼棱清场', '两道聚焦眼棱追着目标横穿人群，安全区域被切成不断移动的窄缝。有人往左躲，有人往右让，最后两条光线在大团中央画出了完整签名。'),
    failure('右臂拒绝放人', '团长连续喊了几次右臂，伤害统计里的目标却各有各的想法。被抓的人在语音里从“救一下”喊到“算了”，科隆加恩始终没松手。'),
    failure('碎石漫桥', '手臂倒下后，大量碎石冲进人群，坦克还没接稳，AOE已经铺满桥头。巨人的身体挡住前路，身后的退路也被碎石封死，远征被卡在两只脚之间。'),
    failure('桥头巨像', '科隆加恩俯身压住整座桥，石握、眼棱和挥击接连落下。团队一次次削掉手臂，又一次次被新生的巨手抓回原点。最后没人再往前走，巨像仍在桥头俯视。'),
  ],
  B07: [
    failure('猫群开席', '两只守护者同时扑入人群，坦克的仇恨还没建立，布甲已经被挨个点名。欧尔莉亚缓步走来时，猫群已经替她清理完了战场。'),
    failure('恐惧回廊', '恐惧刚刚散开，哨兵的扑击便从走廊另一端撞进来。打断、站位和仇恨一起断线，所有人沿着不同方向逃跑，最后在尸体状态下重新集合。'),
    failure('九命难缠', '野性防御者倒下后又一次爬起，黑色虚空区在大厅里越铺越多。团队数着它还剩几条命，数到后面才发现自己这边已经没人活着。'),
    failure('养猫失败', '开怪前分工讲了五分钟，开怪后两只猫用了五秒钟冲散阵形。有人喊集火，有人喊别动，还有人问能不能先把门关上。'),
    failure('巡逻继续', '尖啸回荡在长廊里，守护者踏过倒地的队员重新回到主人身边。欧尔莉亚整理好巡逻队形，继续沿着奥杜尔深处缓慢前行。'),
  ],
  B08: [
    failure('刺骨寒冬', '刺骨寒冷一层层叠高，队员仍在原地完成最后几个读条。火堆逐渐熄灭，星光被冰柱切断，整座大厅只剩霍迪尔的风暴声。'),
    failure('雪堆失约', '闪电冻结即将落下，所有人冲向场边寻找雪堆。有人提前踩空，有人还在救NPC，冰层封住大厅时，团队保持着各自最后一个动作。'),
    failure('增益全浪费', '火堆烧得很旺，星光也照在地上，风暴之云却在人群边缘来回漂。输出窗口一个接一个过去，霍迪尔的血条稳得像外面的冰墙。'),
    failure('冰柱精准投递', '地面刚出现落点，人群便像约好一样继续站着输出。冰柱落下，几个人同时消失在雪里，团长沉默片刻，只问了一句：“都舍不得动是吧？”'),
    failure('大厅封冻', '被冻住的盟友等待救援，活着的人在寒冷与落冰之间不断后退。火焰最后一次熄灭后，霍迪尔重新坐回冰霜深处，整支队伍留在了他的冬天里。'),
  ],
  B09: [
    failure('两线失联', '竞技场组被小怪压得抬不起头，走廊组还在闪避陷阱和巨像。两边都在问对方还要多久，答案尚未传到，雷霆已经先一步落下。'),
    failure('走廊封锁', '冲刺队伍在台阶和机关间不断减员，最后只剩几个人抵达托里姆面前。竞技场的呼救声从远处传来，门打开时，里面已经没人能回应。'),
    failure('竞技场沉没', '一波小怪尚未清完，下一波又从入口涌入。治疗被迫绕场奔跑，坦克身边堆满目标，走廊组终于到达时，只赶上了全团释放灵魂。'),
    failure('闪电链团建', '托里姆的闪电链在人群中找到完美路径，从第一个人一路连到最后一个人。十个人的站位第一次如此紧密，代价是一起躺得非常整齐。'),
    failure('雷神审判', '风暴在竞技场上空聚集，地面亮起一道又一道危险区域。团队撑过双线推进，却在最后的雷霆节奏中逐渐散开，托里姆的战锤落下时，观众席重新归于寂静。'),
  ],
  B10: [
    failure('三灵复苏', '三名元素守卫的血量始终差着最后一点，先倒下的目标一次次重新站起。团队在三个血条之间来回切换，弗蕾亚的生命值却在持续增长。'),
    failure('爆炸幼苗园', '鞭笞者围着人群快速倒下，爆炸随即从近战一路传到远程。屏幕被伤害数字填满时，有人还在问为什么不能直接一波A掉。'),
    failure('孢子区失守', '古代保守者压住场地，安全孢子刚出现便被队员挤成一团。沉默区域、自然伤害和新增小怪同时落下，花园很快恢复了它原本的安静。'),
    failure('园艺事故', '有人催着先打大树，有人坚持先清小花，还有人正在角落追一只漏掉的幼苗。弗蕾亚看着十个人分成三个园艺小组，随后让整个温室一起开花。'),
    failure('生命花园', '藤蔓、幼苗与守卫不断从地面生长，战场每过一轮便更加拥挤。团队的控制技能逐渐耗尽，最后一片安全地面被绿色吞没，远征成为花园新的养分。'),
  ],
  B11: [
    failure('实验对象报废', '地雷封住脚下，凝固汽油落在远处，等离子冲击正面压向坦克。第一阶段的机器还没停，实验对象已经在火光里失去继续测试的资格。'),
    failure('激光扫场', 'VX-001开始旋转，激光弹幕缓慢扫过房间。有人提前跑，有人还在贪读条，最后整支队伍被光束赶成一圈，随后整齐地倒在同一侧。'),
    failure('空中单位拒绝降落', '磁力核心扔在了奇怪的位置，空中指挥单元短暂下降后迅速升回半空。近战追不上，远程忙着躲火箭，地上的机器人则抓紧时间把治疗围住。'),
    failure('三件套复活', '合体阶段三个部件的血量看起来都只差一点，先倒下的部分却在倒数结束前重新启动。米米尔隆兴奋地宣布测试继续，语音里随即传出一片绝望。'),
    failure('机库最后通告', '火箭留下焦黑圆坑，地雷把退路切碎，激光弹幕缓慢逼近。机器仍按预定程序运转，队员却一个接一个停止移动。机库广播结束时，实验记录只剩“人员全部失效”。'),
  ],
  B12: [
    failure('蓝条荒漠', '常规回蓝手段在维扎克斯面前失去作用，治疗只能盯着越来越短的蓝条计算下一口技能。萨隆邪铁蒸汽升起时，场上已经没人敢决定谁去吃。'),
    failure('暗影冲撞失控', '暗影冲撞落点在人群间来回追逐，增伤区域刚形成便被下一轮危险覆盖。远程不断迁移，治疗读条反复中断，输出节奏被切成了碎片。'),
    failure('烈焰读完', '灼热烈焰的施法条缓慢走到尽头，打断频道里同时响起三句“我没好”。全团受到重创后，下一轮施法又开始了，这次已经没人争论顺序。'),
    failure('印记盛宴', '无面者印记在人群中吸取生命，附近队员还在继续输出。维扎克斯的血量明显回升，团长盯着计量表看了几秒，维扎克斯的血量明显回升，团长看决定这把已经没有继续打下去的必要。'),
    failure('将军逼近', '黑暗涌动让维扎克斯的攻击骤然加重，坦克沿着大厅后退，治疗的资源也一步步耗尽。最后一面减伤结束时，将军仍在向前，身后已经没有可退的位置。'),
  ],
  B13: [
    failure('理智崩塌', '低语贴着耳边反复响起，理智值从黄色滑向红色。有人仍在直视古神，有人已经开始攻击队友，团队频道里的指挥逐渐被问号取代。'),
    failure('云雾惊醒', '第一阶段的守护者接连从云雾中被唤醒，坦克身边很快挤满失控目标。萨拉站在中央低声吟唱，场地边缘已经没有下一处能安全落脚的位置。'),
    failure('脑内迷途', '传送门开启后，进门组在幻象中寻找大脑，场外组被触须层层缠住。倒计时不断逼近，门内的人找不到出口，门外的人也等不到支援。'),
    failure('触须之林', '压制触须拖慢施法，腐蚀触须不断点名，碾压触须从场边抬起巨大的肢体。每处理掉一根，另一侧又有新的阴影升起，整个大厅逐渐长成古神的牢笼。'),
    failure('尤格的低语', '最后阶段的守护者越积越多，理智在凝视中迅速流失。尤格-萨隆的声音从四面八方涌来，最后一名队员转身逃向出口时，大门已经被黑暗吞没。'),
  ],
  B14: [
    failure('大爆炸', '奥尔加隆抬手开始引导大爆炸，坍缩星留下的黑洞散落在场边。有人进得太早，有人没找到入口，耀眼白光覆盖大厅后，观测记录只剩一条平直的终止线。'),
    failure('星辰坍缩', '坍缩星接连死亡，黑洞在错误的位置撕开空间。活体星座穿过人群，宇宙重击又在脚下点亮，整片星图逐渐变成无法穿越的陷阱。'),
    failure('相位交接断裂', '相位拳击的层数逼近极限，换坦口令却迟了一步。主坦从现实中消失，副坦尚未接住仇恨，奥尔加隆转身的一击让整条防线瞬间归零。'),
    failure('宇宙重击', '天空出现微小光点，几秒后冲击从远处砸向大厅。队员沿着不同方向躲避，黑洞和星辰把路线逐一封死，最后一轮冲击落下时再没人站着观察。'),
    failure('观测结束', '群星在穹顶缓慢旋转，奥尔加隆冷静记录每一次失误。治疗、输出与换坦只需同时偏差一瞬，整支队伍便从星图上消失。观察者收起记录，宣告这个世界的样本未能通过。'),
  ],
}

const MAIN_CLEAR_ENDINGS: EndingCopy[] = [
  failure('古神沉默', '团队经历了争吵、失误和数次濒临散团，最终还是让尤格-萨隆重新归于沉寂。这不是一支没有问题的队伍，但至少在最后一刻，所有人都完成了自己的任务。'),
  failure('理智尚存', '从大门一路打到古神面前，团队把最后一点理智留给了正确的传送、转火和停手。观察者尚未通过，但奥杜尔的主线远征已经完成。'),
  failure('地底回声终止', '争执没有停止，失误也没有消失，但团队还是在最后一轮机制里站到了结尾。尤格-萨隆的低语停下，本次远征已经足够完整。'),
  failure('古神封印', '这支队伍并不完美，却在最需要配合的时候完成了场内外同步。古神重新沉寂，所有修理费终于换来了一次主线通关。'),
  failure('疯狂止步', '理智值曾经反复见底，团队耐心也几次接近崩溃，但至少团队没有一直犯同样的错误。疯狂被留在了奥杜尔深处。'),
]

const FULL_CLEAR_ENDINGS: EndingCopy[] = [
  failure('群星见证', '从奥杜尔的大门到观察者大厅，所有十四场战斗都已经结束。团队不仅击败了古神，也通过了群星之下的最终考验，本次远征以完整通关收场。'),
  failure('观察通过', '古神已经沉默，观察者也给出了最终认可。十四个首领全部倒下，这支队伍用完整进度证明了自己。'),
  failure('星穹之下', '一路上的失误、争执和修理费都没有阻止团队抵达群星之下。奥尔加隆倒下后，隐藏的秘密得以揭晓。'),
  failure('泰坦认证', '团队完成了从载具战到宇宙观测的全部考核，最后一轮黑洞处理没有再留下缺口。本次远征以完整通关收场。'),
  failure('远征闭环', '十个人最终站在观察者大厅，十四场战斗没有留下未完成项。这次远征堪称完美。'),
]

const LEAVE_ENDINGS: EndingCopy[] = [
  failure('耐心归零', '在连续几次失败后，{leaver}选择离开团队，没有留下继续调整的空间。少一人的队伍无法维持当前进度，只能就地解散。'),
  failure('最后一根稻草', '同一个错误再次出现后，{leaver}失去了继续尝试的耐心。这次退团没有留下替补时间，原本尚能维持的团队随即瓦解。'),
  failure('骂完就走', '{leaver}对复盘结果并不满意，几句争执很快升级成了退团。Boss还站着，团队却先在聊天框里结束了战斗。'),
  failure('战术下线', '{leaver}在复盘期间突然失去回应，随后角色直接离线。没有解释、没有替补，剩余成员只能接受散团结果。'),
  failure('借口成真', '{leaver}表示临时有事，没等团队找到替补便离开了队伍。无论理由真假，这次离开都让本局远征当场结束。'),
]

const FALLBACK_ENDINGS: EndingCopy[] = [
  failure('远征中止', '本局没有命中明确的通关、退团或五次失败结局，但团队已经无法继续推进。奥杜尔的大门仍然开放，这支队伍的记录到此为止。'),
  failure('未完待续', '队伍没有完成最后目标，也没有留下足够清晰的结束原因。至少本局数据已经保存，下一支队伍仍可以从头再来。'),
  failure('进度封存', '战斗记录在中途停止，剩余首领没有得到挑战。当前阵容与进度被封存在结算页中。'),
  failure('临时散场', '计划中的远征没能继续，团队在完成目标前结束了本局。已有击杀和账本仍会正常结算。'),
  failure('记录终止', '系统没有找到更具体的结束类型，因此使用通用结局收束本局。现有进度、掉落和分金记录不会受到影响。'),
]

function hash(input: string): number {
  let value = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function pick(copies: EndingCopy[], seed: string, key: string): EndingCopy {
  return copies[hash(`${seed}|ending|${key}`) % copies.length] ?? FALLBACK_ENDINGS[0]
}

function leaveEnding(run: EndingRunData): EndingCopy {
  const leaver = run.team.find((member) => member.id === run.leaverId)
  if (run.leaveType === '分崩离析') {
    return {
      title: '分崩离析',
      body: run.leaveReason ?? `${leaver?.name ?? '一名成员'}在反复犯错后被${run.team.find((member) => member.id === run.responsibleId)?.name ?? '队友'}当众开喷，最终退团离场。争执没有留下补人的余地，团队直接解散。`,
    }
  }
  const personality = leaver?.personality ?? ''
  let index = hash(`${run.seed}|leave-ending`) % LEAVE_ENDINGS.length
  if (run.leaveType === '战术下线' || personality.includes('沉默') || personality.includes('不开麦')) index = 3
  else if (run.leaveType === '借故离开') index = 4
  else if (run.leaveType === '开喷退团') index = 2
  else if (/耐心|止损|不愿继续|没救|浪费/.test(run.leaveReason ?? '')) index = hash(`${run.seed}|patience`) % 2
  const copy = LEAVE_ENDINGS[index]
  return {
    title: copy.title,
    body: copy.body.replaceAll('{leaver}', leaver?.name ?? '一名成员'),
  }
}

function buildSummary(run: EndingRunData): string {
  const histories = [...run.histories]
  const cleared = histories.filter((history) => history.killed)
  const wipes = histories.reduce((sum, history) => sum + history.wipes, 0)
  const currentBoss = run.bosses.find((boss) => boss.id === run.currentBossId)
  const furthest = [...cleared]
    .map((history) => run.bosses.find((boss) => boss.id === history.bossId))
    .filter((boss): boss is EndingBoss => Boolean(boss))
    .sort((left, right) => right.order - left.order)[0]
  const reached = currentBoss?.name ?? furthest?.name ?? '奥杜尔入口'
  const blame = [...run.team].sort((left, right) => right.blame - left.blame)[0]
  const toxic = blame?.blame
    ? `本局最大毒瘤是${blame.name}，留下了 ${blame.blame} 次明确责任记录。`
    : '本局没有记录到持续制造事故的明确毒瘤。'
  const leaver = run.team.find((member) => member.id === run.leaverId)
  const leave = leaver ? `${leaver.name}最终离队，且不参与本次分金与排骨评选。` : ''
  return `团队推进到${reached}，共击败 ${cleared.length}/${run.bosses.length} 个首领、经历 ${wipes} 次灭团。${toxic}${leave}`
}

export function resolveRunEnding(run: EndingRunData): RunEnding {
  const clearedIds = new Set(run.histories.filter((history) => history.killed).map((history) => history.bossId))
  const clearedMain = clearedIds.has('B13')
  const clearedFull = clearedIds.has('B14')
  const princeInFinalTeam = run.team.some((member) => member.id === 'P101' && !member.left)
  const eligibleCount = Math.max(1, run.team.filter((member) => !member.left).length)
  const perHeadShare = Math.floor(run.pot / eligibleCount)
  const totalWipes = run.histories.reduce((sum, history) => sum + history.wipes, 0)
  let copy: EndingCopy
  let priority: RunEnding['priority']
  let kind: EndingKind
  let label: string
  let hidden = false
  let reward: RunEnding['reward']

  if (run.endReason === '科技团覆灭') {
    copy = {
      title: '科技团覆灭',
      body: 'Boss倒下后几分钟，正在全团兴高采烈前往下一个区域时，团队成员开始接连掉线。聊天框里只剩下一排账号冻结通知；那个所谓的安全点，最终把整支团队送进了系统复核名单。',
    }
    priority = 100
    kind = 'hidden'
    label = '隐藏结局'
    hidden = true
    reward = {
      title: '隐藏事件 · 不存在的安全点',
      detail: '钻空子打法命中了最低概率结果：Boss倒了，整团账号也一起倒了。',
    }
  } else if (princeInFinalTeam && clearedFull) {
    copy = failure('负重训练', '十四战皆克，阵中携一东星太子哥，自首关至观察者厅，未尝弃于道旁。其余诸将，输出未减，治疗未崩，机制未误。此非太子之力，乃负重而前，犹能全甲而还。史官录之，曰：负重训练。')
    priority = 100
    kind = 'hidden'
    label = '隐藏结局'
    hidden = true
    reward = {
      title: '纪念奖励 · 太子护送队',
      detail: '解锁结局徽记“负重训练”,谨以此纪念消失的牛艹。',
    }
  } else if (run.endReason === '散伙分行李') {
    copy = {
      title: '散伙分行李',
      body: '又一次灭团后，团队频道里没人再讨论下一把。有人先问金怎么分，随后所有人都打出“就地分金吧”。团长清完账本，剩余成员在奥杜尔原地散伙，',
    }
    priority = 95
    kind = 'hidden'
    label = '隐藏结局'
    hidden = true
    reward = {
      title: '隐藏事件 · 原地分行李',
      detail: '士气降至谷底后，全体成员一致要求就地分金，本局在炉石读条中结束。',
    }
  } else if (run.endReason === '滚都滚') {
    copy = {
      title: '滚，都滚！',
      body: `本局第${totalWipes}次灭团后，复盘还没开始，团长先在频道里打出一句：“滚！都滚！不打了！”话音未落，团长将全部金币移交给助理分金，自己光速下线，也许他需要远离艾泽拉斯一段时间。`,
    }
    priority = 95
    kind = 'hidden'
    label = '隐藏结局'
    hidden = true
    reward = {
      title: '隐藏事件 · 团长心态清零',
      detail: `累计 ${totalWipes} 次灭团耗尽了团长的耐心，金币由小助理分配。`,
    }
  } else if (run.endReason === '黑金跑路') {
    copy = {
      title: '黑金跑路',
      body: `装备刚刚拍完，团长没有报账，也没有倒数下一个Boss。角色突然离线，语音随即断开，拍卖总金额停在了${run.pot.toLocaleString()}G。团员从满屏问号刷到骂街，终于意识到这不是掉线——团长带着金跑路了。`,
    }
    priority = 95
    kind = 'hidden'
    label = '隐藏结局'
    hidden = true
    reward = {
      title: '隐藏事件 · NGA见',
      detail: `本局 ${run.pot.toLocaleString()}G 金池全部被卷走，其他成员分金为0。`,
    }
  } else if (clearedFull) {
    copy = pick(FULL_CLEAR_ENDINGS, run.seed, 'full-clear')
    priority = 90
    kind = 'full-clear'
    label = '完整通关结局'
  } else if (run.leaveType === '分崩离析') {
    const leaver = run.team.find((member) => member.id === run.leaverId)
    const responsible = run.team.find((member) => member.id === run.responsibleId)
    const remainingBosses = Math.max(0, run.bosses.length - clearedIds.size)
    copy = leaveEnding(run)
    priority = 95
    kind = 'hidden'
    label = '隐藏结局'
    hidden = true
    reward = {
      title: '隐藏事件 · 分崩离析',
      detail: `这次${leaver?.name ?? '一名成员'}不是倒在首领技能里，而是倒在了团队频道里。首领还剩${remainingBosses}个，${leaver?.name ?? '这名成员'}先被${responsible?.name ?? '队友'}打出了副本。`,
    }
  } else if (perHeadShare >= 10000) {
    copy = {
      title: '带薪坐牢',
      body: `团队没有完成远征，却把拍卖总金额抬到了 ${run.pot.toLocaleString()}G，最终可分钱成员人均拿到 ${perHeadShare.toLocaleString()}G。这趟旅程虽然坐牢，至少是带薪坐的。`,
    }
    priority = 95
    kind = 'hidden'
    label = '隐藏结局'
    hidden = true
    reward = {
      title: '纪念奖励 · 带薪服刑证明',
      detail: '未完成全通但人均分金达到10,000G。',
    }
  } else if (clearedMain) {
    copy = pick(MAIN_CLEAR_ENDINGS, run.seed, 'main-clear')
    priority = 80
    kind = 'main-clear'
    label = '主线通关结局'
  } else if (run.endReason === '臭名昭著') {
    copy = {
      title: '臭名昭著',
      body: `${run.leaveReason ?? '本局已经连续五次有人离队。'} 前后五次招兵买马，熟人已经问遍，路人也无人肯来。不久江湖上就有传言进此团等于坐牢，团长自此再也开不起团了。`,
    }
    priority = 70
    kind = 'replacement-failure'
    label = '特殊补人结局'
  } else if (run.endReason === '组不到人') {
    copy = {
      title: '组不到人',
      body: run.leaveReason ?? '成员离开后，团内曾有人尝试寻找替补，但没有找到愿意来的人。本次远征因人数不足只能就此结束。',
    }
    priority = 70
    kind = 'replacement-failure'
    label = '补人失败结局'
  } else if (run.endReason === '成员退团散团' || run.leaverId) {
    copy = leaveEnding(run)
    priority = 70
    kind = 'leave'
    label = run.leaveType === '分崩离析' ? '特殊退团结局' : '退团结局'
  } else if (run.endReason === '五次失败' || run.histories.some((history) => history.bossId === run.currentBossId && !history.killed && history.attempts >= 5)) {
    copy = pick(BOSS_FAILURE_ENDINGS[run.currentBossId] ?? FALLBACK_ENDINGS, run.seed, `boss-failure:${run.currentBossId}`)
    priority = 60
    kind = 'boss-failure'
    label = '首领失败结局'
  } else {
    copy = pick(FALLBACK_ENDINGS, run.seed, 'fallback')
    priority = 10
    kind = 'fallback'
    label = '通用结局'
  }

  return {
    ...copy,
    priority,
    kind,
    label,
    hidden,
    reward,
    summary: buildSummary(run),
  }
}
