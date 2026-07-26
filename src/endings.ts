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
  leaverId?: string
  leaveType?: string
  leaveReason?: string
}

interface EndingCopy {
  title: string
  body: string
}

export interface RunEnding extends EndingCopy {
  priority: 100 | 90 | 80 | 70 | 60 | 10
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
    failure('战车抛锚', '团队甚至没能顺利驶入奥杜尔深处，载具维修、炮台分工和集火节奏始终一团混乱。连续三次失败后，车队停在了大门内侧，这次远征提前结束。'),
    failure('炮台静默', '载具上的炮手始终找不到同一个集火目标，地面的维修也总是慢上一拍。第三次引擎熄灭后，所有人都从战车上下来，决定不再重启。'),
    failure('维修费超标', '该修的车没人修，该打的炮台没人打，整支车队在火海里反复报废。三轮失败把远征变成了维修账单，团队只能原地散场。'),
    failure('大门堵车', '载具分工和行进路线迟迟无法统一，烈焰巨兽把入口变成了一片废铁场。第三次冲锋结束后，团队仍没能越过奥杜尔的大门。'),
    failure('引擎过热', '炮台、投石和自保技能始终错开节奏，战车一辆接一辆停摆。连续三次过热之后，这支车队失去了继续前进的动力。'),
  ],
  B02: [
    failure('熔炉失控', '构造体处理和灼热站位始终没有形成稳定节奏，熔炉里的混乱一次次蔓延到全团。第三次倒下后，团队不再愿意重新点燃这座炉膛。'),
    failure('炉渣四溅', '脆化、浇水和转火总有一步对不上，构造体不断从可控目标变成场内灾害。第三次失败后，熔炉仍在运转，团队却先冷了下来。'),
    failure('铁水封路', '灼热区域被带得到处都是，救人和处理构造体的节奏也越来越乱。三次尝试用完后，通往深处的路被铁水彻底封死。'),
    failure('构造体暴走', '团队每次都能撑过开场，却总在构造体成型后失去秩序。第三轮暴走再次击穿阵线，所有人决定结束这场冶炼事故。'),
    failure('火候全错', '该停手时仍在输出，该转火时却没人响应，整个熔炉阶段没有一次真正对上节拍。连续三次失败后，团队承认今晚掌握不了火候。'),
  ],
  B03: [
    failure('鱼叉落空', '鱼叉、火圈和小怪处理始终无法同时做好，锋鳞一次次重新飞回空中。当第三轮进攻再次失败时，团队的耐心也和最后一支鱼叉一起落空。'),
    failure('再度升空', '地面小怪刚刚失控，鱼叉时机又随之错过，锋鳞一次次从包围中脱身。第三次看着它重新飞起后，团队没有再装填下一轮鱼叉。'),
    failure('火圈封场', '火圈被铺在关键位置，小怪也没能及时清理，能站人的区域越来越少。三次失败后，战场只剩焦土和一支不愿继续的团队。'),
    failure('鱼叉断弦', '负责鱼叉的人等不到集火口令，负责小怪的人又等不到支援。第三次配合断裂后，这场猎龙行动只能宣告失败。'),
    failure('龙影远去', '伤害并非完全不够，但每次落地窗口都被走位和转火浪费。三轮进攻结束后，锋鳞仍在空中盘旋，团队已经转身离开。'),
  ],
  B04: [
    failure('心脏过载', '团队有足够的伤害，却始终控制不好心脏阶段和场地上的炸弹。连续三次失控后，这台拆解者没有停机，团队反而先被拆散了。'),
    failure('炸弹拆团', '光明炸弹和重力炸弹反复被带进人群，心脏阶段也没人愿意及时停手。第三次爆炸之后，队伍终于被真正拆成了零件。'),
    failure('维修模式', '每次心脏暴露都像是一次机会，却被错误转火和场地混乱白白浪费。三次失败后，XT-002继续工作，团队进入永久维修。'),
    failure('玩具拒收', '点名处理和小机器人清理始终无法兼顾，场面越打越像失控的玩具箱。第三次倒下后，团队决定把这个玩具留在原地。'),
    failure('拆解完成', '团队没能拆掉Boss，反而被炸弹、震地和转火失误逐个拆开。连续三次失败后，这次远征只剩下一地修理费。'),
  ],
  B05: [
    failure('议会否决', '击杀顺序、符文站位和打断配合始终无法统一，三名议员逐渐掌握了战斗节奏。第三次失败后，团队以散团的方式接受了议会的最终裁决。'),
    failure('三票反对', '三名首领像在分别考核三套战术，而团队连第一套都没能统一。第三次失败等于三票全反对，远征提案当场作废。'),
    failure('符文失控', '增益符文没人利用，危险符文却总有人站得格外坚定。连续三次把优势打成事故后，议会拒绝继续审理这支队伍。'),
    failure('裁决生效', '打断顺序和击杀目标反复改变，团队频道里的意见比场上的目标还多。第三次倒地后，钢铁议会宣布裁决立即生效。'),
    failure('议程中止', '每个人都知道一部分打法，却没人执行同一份议程。三轮失败以后，会议仍未结束，团队先宣布散会。'),
  ],
  B06: [
    failure('巨臂封路', '转火双臂和处理石握本应并不复杂，但团队始终有人慢上一拍。三次失败后，科隆加恩依旧守在桥头，团队则停在了奥杜尔的半路。'),
    failure('石握不放', '被抓的人等不到及时转火，碎石和落点也不断打乱阵形。第三次有人在石握中倒下后，整支队伍终于选择放手。'),
    failure('桥头止步', '双臂转火的口令一次次迟到，正面压力也随之滚成无法处理的事故。三次失败后，桥还在眼前，远征却已经结束。'),
    failure('碎石埋团', '团队在左右臂之间来回犹豫，碎石区则一点点吃掉所有安全位置。第三轮混乱结束后，这支队伍被留在了桥头。'),
    failure('巨人不倒', '科隆加恩的血量持续下降，却总有人在关键转火时留恋本体。三次尝试用完，巨人仍站着，团队已经坐下。'),
  ],
  B07: [
    failure('猫群失控', '开怪站位和守护者处理连续出错，原本可控的战斗迅速变成了一场追逐。第三次被猫群撕碎后，团队决定不再进行下一次尝试。'),
    failure('守护者出笼', '起手分工没有一次真正执行到位，守护者冲进人群后所有口令都变成了尖叫。三次失败后，欧尔莉亚继续巡逻，团队停止营业。'),
    failure('恐惧扩散', '打断、恐惧和猫群位置互相叠在一起，任何一次小错都会迅速传遍全团。第三次连锁崩盘后，所有人失去了再次开怪的勇气。'),
    failure('开怪事故', '战斗总在第一分钟内失去控制，站位和仇恨像从未讨论过一样。连续三次开怪事故后，团队承认今晚不适合养猫。'),
    failure('猫爪散团', '守护者没有被稳稳接住，输出也找不到安全的集火窗口。第三次猫爪落下后，团队名单很快变成了灰色。'),
  ],
  B08: [
    failure('冰封散场', '火堆、月光和冰柱之间的配合始终没有稳定下来，输出窗口被一次次浪费。三次失败后，团队的进度和士气一起冻结在了霍迪尔的大厅。'),
    failure('火堆熄灭', '增益位置没人珍惜，冰柱落点却总有人准时光顾。第三次错过输出窗口后，火堆熄了，团队也不再继续。'),
    failure('寒冬加班', '该解冻的人没被救出，该集合的时候又各自寻找温暖。三次失败把这场战斗拖成寒冬加班，所有人选择提前下班。'),
    failure('冰柱点名', '输出数字偶尔很好看，但每轮冰柱都会带走一部分节奏。第三次被冻回原点后，队伍决定让霍迪尔独自守夜。'),
    failure('大厅封冻', '月光、火焰和站位没有形成任何稳定循环，战斗越久越像一场慢性冻结。连续三次倒下后，远征永久停在这座大厅。'),
  ],
  B09: [
    failure('雷霆失序', '竞技场和走廊两组始终无法保持同一个节奏，失误最终在汇合后集中爆发。第三次雷霆落下时，团队频道也随之安静了下来。'),
    failure('走廊掉队', '走廊组赶不上时间，竞技场组又在不断累积压力，汇合永远差最后一步。第三次节奏断裂后，两组人终于在散团界面会合。'),
    failure('竞技场沦陷', '小怪处理和走廊推进互相等待，场内压力最终超过了治疗能够承受的范围。三次失败后，竞技场只剩托里姆的回声。'),
    failure('雷场断联', '两组人的口令始终对不上，冲刺、转火和汇合像在不同频道进行。第三轮雷霆结束后，团队真正失去了联系。'),
    failure('汇合失败', '每次都有人认为另一组还能再撑一会，直到两边同时崩溃。三次尝试用尽，队伍没能在Boss面前完成一次整齐汇合。'),
  ],
  B10: [
    failure('花园反噬', '小怪击杀顺序、转火和控制连续失误，花园中的每一轮刷新都在放大团队的问题。三次失败后，远征没有穿过花园，反而成为了这里新的养料。'),
    failure('三花乱序', '三波小怪的击杀顺序一次次被打乱，爆炸和治疗压力随之叠满。第三次花园暴走后，团队决定不再参与园艺工作。'),
    failure('自然接管', '控制技能总在错误的目标上交掉，关键转火也始终慢半拍。三次失败后，自然重新接管了战场，团队退出了生态循环。'),
    failure('幼苗成灾', '每一只漏掉的小怪都变成下一轮事故的种子，场面最终彻底失控。第三次被花园吞没后，所有人停止了再次播种。'),
    failure('温室散团', '团队伤害足以清怪，却总在顺序、聚怪和爆发时机上各打各的。连续三轮失败后，这座温室成了远征的终点。'),
  ],
  B11: [
    failure('引擎熄火', '团队一路推进到米米尔隆，却在连续三次失败后耗尽了最后的耐心。伤害并不差，但点名处理和转火执行始终没有稳定下来，最终队伍就此解散。'),
    failure('按钮失灵', '每个阶段都有人知道该做什么，却总在按钮亮起时慢上一拍。第三次机器重新启动后，团队没有再按下开战按钮。'),
    failure('四相报废', '火、雷、炸弹和转火把同一支队伍拆成了四种事故。三次失败后，米米尔隆仍在调试机器，团队已经彻底报废。'),
    failure('实验终止', '阶段转换始终伴随着减员，最后的合体阶段更像一次压力测试。第三次测试失败后，实验对象主动离开了实验室。'),
    failure('机库断电', '输出并不缺，缺的是每轮点名都能稳定执行的人。连续三次在同类事故中停机后，机库断电，远征也随之终止。'),
  ],
  B12: [
    failure('法力枯竭', '团队没有在有限的治疗资源中建立起稳定节奏，暗影冲撞和萨隆邪铁蒸汽不断制造缺口。第三次失败后，治疗的法力和团队的耐心同时见底。'),
    failure('蒸汽断供', '有人贪蒸汽，有人错过蒸汽，治疗资源始终无法按计划周转。第三次法力耗尽后，团队终于不再讨论下一口蓝从哪里来。'),
    failure('暗影封场', '暗影冲撞把安全区切得支离破碎，输出和治疗都被迫不断中断。三次失败后，将军仍守在前方，团队已经无力继续。'),
    failure('蓝条见底', '每次开场都显得尚能维持，但后半程总会因资源和走位一起崩溃。第三次蓝条归零时，继续尝试的意愿也同时归零。'),
    failure('将军封锁', '团队无法在节省资源和及时救人之间找到平衡，任何一次失误都没有足够法力补救。连续三次失败后，通道被维扎克斯彻底封锁。'),
  ],
  B13: [
    failure('理智归零', '团队已经来到古神面前，却始终无法兼顾理智、传送门和场外触须。三次失败之后，最先归零的不是理智值，而是继续尝试的意愿。'),
    failure('低语散团', '场内外的节奏始终无法同步，理智值则在一次次迟疑中被消耗。第三次低语响起后，团队频道里再也没人喊下一把。'),
    failure('传送门关闭', '进门顺序、场外触须和理智控制总有一项失守，胜利近在眼前却无法抵达。三次失败后，最后一扇传送门彻底关闭。'),
    failure('古神未眠', '团队一路走到尤格-萨隆面前，却在最后的多线处理中不断丢失成员。第三次尝试结束，古神仍在低语，远征已经沉默。'),
    failure('疯狂蔓延', '理智、打断和转火错误互相放大，任何补救都赶不上下一轮混乱。三次失败后，疯狂留在大厅，团队逃回了地面。'),
  ],
  B14: [
    failure('观察终止', '星辰已经近在眼前，但黑洞、宇宙重击和坦克交接没有给团队留下任何容错。第三次失败后，观察者结束了记录，这支队伍也没能通过最后的判定。'),
    failure('星图关闭', '黑洞位置和星辰处理始终无法形成稳定图案，坦克交接也一次次断裂。第三次宇宙重击后，观察者关闭了这支队伍的星图。'),
    failure('判定未通过', '团队已经越过古神，却没能在最后考核中维持同样的执行力。三次失败后，奥尔加隆给出了明确结论：判定未通过。'),
    failure('群星沉默', '每个人都距离最终通关只差一次稳定处理，但黑洞和重击不断扩大微小失误。第三次倒下后，群星没有再给出回应。'),
    failure('观测样本失效', '输出、治疗和机制必须同时精确，而团队每次都在不同位置出现裂缝。连续三次实验失败后，这份观测样本被正式作废。'),
  ],
}

const MAIN_CLEAR_ENDINGS: EndingCopy[] = [
  failure('古神沉默', '团队经历了争吵、失误和数次濒临散团，最终还是让尤格-萨隆重新归于沉寂。这不是一支没有问题的队伍，但至少在最后一刻，所有人都完成了自己的职责。'),
  failure('理智尚存', '从大门一路打到古神面前，团队把最后一点理智留给了正确的传送、转火和停手。观察者尚未通过，但奥杜尔的主线远征已经完成。'),
  failure('地底回声终止', '争执没有消失，失误也没有清零，但团队还是在最后一轮机制里站到了结尾。尤格-萨隆的低语停下，本次远征已经足够完整。'),
  failure('古神封印', '这支队伍并不完美，却在最需要配合的时候完成了场内外同步。古神重新沉寂，所有修理费终于换来了一次主线通关。'),
  failure('疯狂止步', '理智值曾经反复见底，团队耐心也几次接近崩溃，但最后一次尝试没有再犯同样的错误。疯狂被留在了奥杜尔深处。'),
]

const FULL_CLEAR_ENDINGS: EndingCopy[] = [
  failure('群星见证', '从奥杜尔的大门到观察者大厅，所有十四场战斗都已经结束。团队不仅击败了古神，也通过了群星之下的最终考验，本次远征以完整通关收场。'),
  failure('观察通过', '古神已经沉默，观察者也给出了最终认可。十四个首领全部倒下，这支队伍用完整进度证明了自己。'),
  failure('星穹之下', '一路上的失误、争执和修理费都没有阻止团队抵达群星之下。奥尔加隆倒下后，本次奥杜尔正式写下十四比十四。'),
  failure('泰坦认证', '团队完成了从载具战到宇宙观测的全部考核，最后一轮黑洞处理没有再留下缺口。完整通关已经被写入本局记录。'),
  failure('远征闭环', '开团时的十个人最终站在观察者大厅，十四场战斗没有留下未完成项。这次远征从招募到分金形成了真正的闭环。'),
]

const LEAVE_ENDINGS: EndingCopy[] = [
  failure('耐心归零', '在连续几次失败后，{leaver}选择离开团队，没有留下继续调整的空间。少一人的队伍无法维持当前进度，只能就地解散。'),
  failure('最后一根稻草', '同一个错误再次出现后，{leaver}失去了继续尝试的耐心。这次退团没有留下替补时间，原本尚能维持的团队随即瓦解。'),
  failure('骂完就走', '{leaver}对复盘结果并不满意，几句争执很快升级成了退团。Boss还站着，团队却先在聊天框里结束了战斗。'),
  failure('战术下线', '{leaver}在复盘期间突然失去回应，随后角色直接离线。没有解释、没有替补，剩余成员只能接受散团结果。'),
  failure('借口成真', '{leaver}表示临时有事，没等团队找到替补便离开了队伍。无论理由真假，这次离开都让本局远征当场结束。'),
]

const FALLBACK_ENDINGS: EndingCopy[] = [
  failure('远征中止', '本局没有命中明确的通关、退团或三次失败结局，但团队已经无法继续推进。奥杜尔的大门仍然开放，这支队伍的记录到此为止。'),
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
      body: `${leaver?.name ?? '一名成员'}因个人失误导致灭团，随后又在团队频道里遭到当众指责。复盘迅速变成争吵，当事人直接退团，原本还能继续尝试的队伍就此瓦解。`,
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
  let copy: EndingCopy
  let priority: RunEnding['priority']
  let kind: EndingKind
  let label: string
  let hidden = false
  let reward: RunEnding['reward']

  if (princeInFinalTeam && clearedFull) {
    copy = failure('负重训练', '团队不仅完成了十四场首领战，还把东星太子哥完整带到了观察者大厅的终点。在额外的执行压力下，其他成员仍然维持住了输出、治疗和机制处理，隐藏结局“负重训练”正式解锁。')
    priority = 100
    kind = 'hidden'
    label = '隐藏结局'
    hidden = true
    reward = {
      title: '纪念奖励 · 太子护送队',
      detail: '解锁结局徽记“负重训练”。该奖励仅作本局纪念展示，不改变金池、装备或分金数值。',
    }
  } else if (clearedFull) {
    copy = pick(FULL_CLEAR_ENDINGS, run.seed, 'full-clear')
    priority = 90
    kind = 'full-clear'
    label = '完整通关结局'
  } else if (clearedMain) {
    copy = pick(MAIN_CLEAR_ENDINGS, run.seed, 'main-clear')
    priority = 80
    kind = 'main-clear'
    label = '主线通关结局'
  } else if (run.endReason === '臭名昭著') {
    copy = {
      title: '臭名昭著',
      body: `${run.leaveReason ?? '本局已经连续三次有人离队。'} 两条人脉都已经问遍，江湖上传言进此团等于坐牢，再也没人愿意接手这个进度。`,
    }
    priority = 70
    kind = 'replacement-failure'
    label = '特殊补人结局'
  } else if (run.endReason === '组不到人') {
    copy = {
      title: '组不到人',
      body: run.leaveReason ?? '成员离开后，团内有人尝试寻找替补，但没有找到愿意接进度的人。人数不足，远征只能就此结束。',
    }
    priority = 70
    kind = 'replacement-failure'
    label = '补人失败结局'
  } else if (run.endReason === '成员退团散团' || run.leaverId) {
    copy = leaveEnding(run)
    priority = 70
    kind = 'leave'
    label = run.leaveType === '分崩离析' ? '特殊退团结局' : '退团结局'
  } else if (run.endReason === '三次失败' || run.histories.some((history) => history.bossId === run.currentBossId && !history.killed && history.attempts >= 3)) {
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
