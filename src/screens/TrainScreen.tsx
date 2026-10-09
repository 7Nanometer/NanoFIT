import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  BodyMetric,
  Exercise,
  PlannedItem,
  SetEntry,
  Settings,
  StrengthMetLevel,
  Template,
  WorkoutSession,
} from '../types'
import { cardioIdSet, exerciseKind, mergeExercises } from '../data/exercises'
import { registerBackHandler } from '../lib/backbutton'
import { newId } from '../lib/id'
import { dateKey, formatDateCN, formatTimeCN, parseISO, todayKey } from '../lib/date'
import {
  describeCardio,
  formatClock,
  formatDuration,
  sessionVolume,
  textToNumber,
} from '../lib/calc'
import { tapFeedback, unlockAudio } from '../lib/beep'
import {
  DEFAULT_MET_LEVEL,
  isStaleSession,
  recommendMetLevel,
  resolveWeightKg,
  sessionSeconds,
} from '../lib/kcal'
import type { MetRecommendation } from '../lib/kcal'
import {
  askRestNotifyFirstTime,
  getRestNotifyStatus,
  requestRestNotify,
  subscribeRestNotify,
  syncRestNotify,
} from '../lib/restnotify'
import {
  clearActiveWorkout,
  readActiveWorkout,
  readBodyMetrics,
  readCustomExercises,
  readSessions,
  readSettings,
  readTemplates,
  writeActiveWorkout,
  writeSessions,
  writeSettings,
} from '../lib/storage'
import { CardioForm } from '../components/CardioForm'
import { ElapsedBadge } from '../components/ElapsedBadge'
import { MetPicker } from '../components/MetPicker'
import { Readout, ReadoutCell } from '../components/Readout'
import { ExercisePicker } from '../components/ExercisePicker'
import { NumberField } from '../components/NumberField'
import { RestTimer } from '../components/RestTimer'
import { TemplatePicker } from '../components/TemplatePicker'

// ============================================================
// 训练页 —— 整个 App 最核心的一屏
// ============================================================
//
// 【数据是怎么流动的】
// 这个页面只认一个东西：session（当前这次训练）。
// 每次你点 ✓ 记一组，都会：
//   1. 先把新数据写进浏览器储物柜（所以锁屏也不会丢）
//   2. 再更新界面上的显示
// 顺序很重要 —— 先存再显示，万一存失败，界面上能立刻警告你。
//
// 【为什么不用 useState 的初始值直接读】
// useState(函数) 这种写法表示"只在第一次显示这一页时读一次"。
// 如果写成 useState(readActiveWorkout())，每次重画都会白读一遍储物柜。
// ============================================================

export function TrainScreen() {
  // 显示这一页时只读一次储物柜。
  // 【为什么先接在变量里】下面有两个 state 都要用这份数据（当前的训练、
  // 以及正在进行的休息倒计时），在外面接住就不用读两遍。
  const [initialSession] = useState<WorkoutSession | null>(readActiveWorkout)
  const [session, setSession] = useState<WorkoutSession | null>(initialSession)
  const [customExercises] = useState<Exercise[]>(readCustomExercises)
  const [settings] = useState<Settings>(readSettings)
  const [customTemplates] = useState<Template[]>(readTemplates)
  // 体重是给有氧录入面板算热量估算用的。训练页自己不用，只是读出来传下去。
  const [bodyMetrics] = useState<BodyMetric[]>(readBodyMetrics)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [storageError, setStorageError] = useState(false)

  // ---------- 有氧录入面板 ----------
  // cardioOpen 管"面板开没开"；cardioPresetId 是"打开时替用户选好了哪个动作"。
  // 分成两个状态，是因为有两种打开方式：
  //   点"+ 记有氧"        → 开，不预选（用户自己挑）
  //   点卡片上的"再记一次" → 开，预选那个动作（省一次点击）
  const [cardioOpen, setCardioOpen] = useState(false)
  const [cardioPresetId, setCardioPresetId] = useState<string | undefined>(
    undefined,
  )

  // 结束训练时的"这次练得有多累"面板开着没有。
  // 它顺便代替了原来的"确定要结束吗"弹窗 —— 反正都要确认一次，
  // 多问这一句不多一次操作。
  const [metPickerOpen, setMetPickerOpen] = useState(false)
  // 休息倒计时"结束的时间点"。null 表示当前没在休息。
  // 注意存的是"结束时刻"而不是"还剩几秒"，原因见 RestTimer.tsx 的注释。
  //
  // 【切走再切回来，倒计时为什么还在】
  // 底部四个 tab 是靠一个变量切换的，切走的时候训练页整个被卸载，
  // 页面内存里的东西全没了 —— 以前倒计时就是这么凭空消失的。
  // 现在它跟着"正在进行的训练"一起存了档（WorkoutSession.restEndsAt），
  // 所以回到这一页时能从存档里接着走。
  //
  // 【只恢复"还没结束"的】
  // 已经过期的直接丢掉。不然你切走两三分钟再回来，会看到一个
  // "休息结束 点一下继续"横在那儿，而且还会补响一声 ——
  // 那声提醒来得莫名其妙（你早就休息完了）。
  const [restEndsAt, setRestEndsAt] = useState<number | null>(() => {
    const saved = initialSession?.restEndsAt
    return saved !== undefined && saved > Date.now() ? saved : null
  })

  // ---------- 后台提醒的状态（2026-09-24 加的）----------
  //
  // 只用来决定倒计时卡片下面那行小字说什么：
  //   "切到别的 App 也会提醒你" / "开启通知权限才能在后台提醒 · 点这里开启"
  //
  // 【为什么不用在挂载时查一次】
  // 用户点那行字会弹系统授权框，也可能跳到系统设置页 ——
  // 回来时这一页并没有卸载（切到别的 App 不会卸载 React 组件）。
  // 不订阅的话那行字会一直停在"未开启"，看着像没生效。
  // restnotify.ts 那边每次回到前台都会重查，查完通知这里重画。
  const [notifyStatus, setNotifyStatus] = useState(getRestNotifyStatus)
  useEffect(() => {
    return subscribeRestNotify(() => setNotifyStatus(getRestNotifyStatus()))
  }, [])

  // 今天。
  // 用 useState 的惰性初始化，让它"显示这一页时只算一次"。
  // 【为什么不直接在显示的地方写 todayKey()】
  // React 有条规矩：渲染过程必须是"纯"的 —— 同样的输入必须给出同样的结果。
  // 而"现在几点"每分每秒都在变，在渲染里读它会破坏这条规矩
  // （检查工具 oxlint 会把它标成警告）。
  //
  // 小提醒：真正创建训练记录时用的是实时的 todayKey()（见下面的 addExercise），
  // 所以哪怕你开着这一页跨过了午夜，记录下来的日期依然是准的。
  const [today] = useState(todayKey)

  // ---------- 安卓的物理返回键 ----------
  // 这次训练还没结束的时候按返回，先问一句再走。
  // 为什么不是直接不许退：记录其实**已经存好了**（每点一次 ✓ 就存一次），
  // 退出 App 并不会丢数据，下次打开还能接着练。所以拦的目的是
  // "别让人手一滑就莫名其妙退出去、吓一跳"，而不是"防丢数据"。
  // 弹窗里也把这句话写清楚了，免得人以为退了就白练了。
  //
  // 没有进行中的训练（session 是 null）时不拦截 —— 那时按返回直接退出，
  // 是符合安卓习惯的，不用多问一句。
  useEffect(() => {
    if (session === null) return
    return registerBackHandler(() => {
      const wantsToQuit = window.confirm(
        '这次训练还在进行中。\n\n记录已经存好了，下次打开还能接着练。\n\n确定要退出 App 吗？',
      )
      // 点"取消" → 返回 true：这事我接了，什么都不做，留在训练页
      // 点"确定" → 返回 false：交回给默认逻辑（在训练页按返回 = 退出 App）
      return !wantsToQuit
    })
  }, [session])

  // 预置 + 自建，合成一个总列表，用来查出动作的中文名
  const allExercises = mergeExercises(customExercises)

  // session 里可能没有 exerciseIds 这个字段（早期版本存的数据），用 ?? [] 兜住
  const exerciseIds = session?.exerciseIds ?? []

  // ---------- 把记录分成"力量"和"有氧"两拨 ----------
  //
  // 【为什么要分】
  // 有氧记录也躺在 entries 里（这样历史页、导出备份、导入恢复全都自动带上，
  // 不用改存储层）。但它的 weightKg 和 reps 都是 0 —— 占着位置但没有意义。
  // 所以凡是按"组数""总容量"说话的地方，都只能数力量那一拨，
  // 否则会显示成"3 组 · 总容量 0 kg"这种莫名其妙的话。
  const cardioIds = cardioIdSet(allExercises)
  const entries = session?.entries ?? []
  const strengthEntries = entries.filter((s) => !cardioIds.has(s.exerciseId))
  const cardioSeconds = entries
    .filter((s) => cardioIds.has(s.exerciseId))
    .reduce((sum, s) => sum + (s.durationSec ?? 0), 0)

  // 顶部那排读数：有几样说几样，没有的那一项整个不出现
  // （只练了有氧时不显示"0 组 · 总容量 0 kg"）
  const hasEntries = entries.length > 0

  // 结束训练那个弹窗里的一句话。
  // 和顶部那行小结不一样 —— 顶部是练的过程中看的（带总容量），
  // 这句是结束时确认用的，只说"练了多少"，不掺别的。
  const finishParts: string[] = []
  if (strengthEntries.length > 0) {
    finishParts.push(`${strengthEntries.length} 组力量`)
  }
  if (cardioSeconds > 0) {
    finishParts.push(`有氧 ${formatDuration(cardioSeconds)}`)
  }
  const finishSummary = `共 ${finishParts.join(' + ')}`

  // 点"结束训练"那一刻算出来的推荐档位。
  //
  // 【为什么存在 state 里，而不是每次渲染现算】
  // 两个原因：
  //   1. 算推荐要用"这场训练一共多久"，而那个时长只有到"点结束"这一刻
  //      才定得下来。在渲染过程里读当前时间会破坏 React 的"纯"规矩
  //      （检查工具 oxlint 会警告，这个项目里别处也是这么绕开的）。
  //   2. ★ 推荐用的时长必须和落盘用的时长是同一个，否则会出现
  //      "建议按 26 分钟算、热量按 31 分钟算"这种自相矛盾 ——
  //      在 30 分钟这个分界线上，差 5 分钟就会推荐错一档。
  // 存的是"档位 + 为什么"，不只是档位 —— 理由要显示在面板上，
  // 让人一眼看出系统是**根据什么**建议的（详见 lib/kcal.ts 的 MetRecommendation）。
  // 初值里的 reason 是空的，但面板只在点过"结束训练"之后才打开，
  // 那时候它一定已经被真正的推荐结果覆盖了，所以那个空串永远不会显示出来。
  const [recommendation, setRecommendation] = useState<MetRecommendation>({
    level: DEFAULT_MET_LEVEL,
    reason: '',
  })

  // 点"结束训练"那一刻冻结下来的结束时刻。null = 还没点过。
  //
  // 【为什么是个专门的状态，而不是用的时候现读表】
  // 选档面板打开之后用户可能磨蹭几分钟。现读表的话，"面板上显示的时长"
  // 和"最后存进去的时长"就会差那几分钟。冻结一次，两处都用它。
  const [finishEndISO, setFinishEndISO] = useState<string | null>(null)

  // "上次用的档位"，面板上那个「沿用上次」按钮要用。undefined = 从来没选过。
  //
  // 【为什么不直接用 settings.lastMetLevel】
  // settings 是训练页挂载时读一次的。你要是这一次打开 App 里练了两场，
  // 第二场时它还是第一场【之前】的旧值 —— "沿用上次"就会给你一个更早的
  // 档位，而那才是真正的"上次"。所以在点"结束训练"那一刻现读一次。
  const [lastMetLevel, setLastMetLevel] = useState<StrengthMetLevel | undefined>(
    undefined,
  )

  // 先存进储物柜，再更新界面。所有改动数据的操作都走这一个出口。
  function persist(next: WorkoutSession) {
    const ok = writeActiveWorkout(next)
    setSession(next)
    setStorageError(!ok)
  }

  // ---------- 加一个动作 ----------
  function addExercise(exerciseId: string) {
    const base: WorkoutSession = session ?? {
      id: newId(),
      date: todayKey(),
      entries: [],
      exerciseIds: [],
    }

    setPickerOpen(false)

    // 已经加过这个动作了，就不重复加（再点一次等于"取消"）
    if ((base.exerciseIds ?? []).includes(exerciseId)) return

    persist({
      ...base,
      exerciseIds: [...(base.exerciseIds ?? []), exerciseId],
      // startedAt 记下"这次训练是什么时候开始的"，只在第一次添加动作时写
      startedAt: base.startedAt ?? new Date().toISOString(),
    })
  }

  // ---------- 套用一个模板 ----------
  function applyTemplate(template: Template) {
    const base: WorkoutSession = session ?? {
      id: newId(),
      date: todayKey(),
      entries: [],
      exerciseIds: [],
    }

    setTemplatePickerOpen(false)

    // 模板里的动作，已经在今天训练里的就不再重复加
    const existing = new Set(base.exerciseIds ?? [])
    const added = template.items
      .map((item) => item.exerciseId)
      .filter((id) => !existing.has(id))

    // "目标几组几次"这份计划清单也要合并：
    // 同一个动作已经有目标就换成新的，没有就追加进去。
    // （这样连续套用"推日"和"腿日"时，两边的目标都能保留下来）
    const merged = [...(base.plannedItems ?? [])]
    for (const item of template.items) {
      const index = merged.findIndex((m) => m.exerciseId === item.exerciseId)
      if (index >= 0) merged[index] = item
      else merged.push(item)
    }

    persist({
      ...base,
      name: template.name,
      templateId: template.id,
      plannedItems: merged,
      exerciseIds: [...(base.exerciseIds ?? []), ...added],
      startedAt: base.startedAt ?? new Date().toISOString(),
    })
  }

  // ---------- 移掉一个动作（连同它已经记的组）----------
  function removeExercise(exerciseId: string) {
    if (!session) return
    persist({
      ...session,
      exerciseIds: (session.exerciseIds ?? []).filter((id) => id !== exerciseId),
      entries: session.entries.filter((s) => s.exerciseId !== exerciseId),
    })
  }

  // ---------- 记一组 ----------
  function addSet(
    exerciseId: string,
    weightKg: number,
    reps: number,
    rpe: number | null,
  ) {
    if (!session) return
    const entry: SetEntry = {
      id: newId(),
      exerciseId,
      weightKg,
      reps,
      // 注意这里是 ?? undefined：rpe 是 null（没填）时存成 undefined（字段直接不写），
      // 而不是存成 0 —— 否则统计时会把"没填"当成"RPE 为 0"
      rpe: rpe ?? undefined,
      completedAt: new Date().toISOString(),
    }
    // 记完一组，自动开始休息倒计时。先把"结束的那一刻"算出来 ——
    // 存档和界面都要用它，算两次可能出现几毫秒的差。
    //
    // 下一行的 Date.now() 是安全的：这行代码只有在你点 ✓ 的那一刻才执行，
    // 属于"事件处理"，不是渲染过程。
    // 检查工具 oxlint 分不清这两者，会误报一条 react(purity) 警告，所以这里显式忽略它。
    // oxlint-disable-next-line react/purity
    const restEndsAtNext = Date.now() + settings.restSec * 1000

    // ★ 倒计时和这一组一起写进**同一份存档**，一次写盘搞定两件事。
    //   以前是先写训练、再单独 setRestEndsAt（只改内存不落盘），
    //   结果切个 tab 训练页一卸载，倒计时就没了。
    persist({
      ...session,
      entries: [...session.entries, entry],
      restEndsAt: restEndsAtNext,
    })

    // 解锁音响。放在这里是因为此刻正处在"用户手指点击"的那一瞬间 ——
    // 这是浏览器唯一允许我们把音响打开的时机。
    // 错过这一下，90 秒后想自动响铃就会被浏览器拒绝。
    unlockAudio()
    setRestEndsAt(restEndsAtNext)

    // 通知那边"重新判断一次"。
    //
    // 【这时候人在前台，本该什么都不用做 —— 为什么还要调】
    // 因为"切后台"那个信号（appStateChange）万一没送到（WebView 被系统
    // 暂停过、事件丢了之类），手机上就可能留着一条过期的预约。
    // 每个改动休息状态的地方都重新断言一次，这类残留就自己没了。
    syncRestNotify()

    // 第一次开始休息，顺手问一句要不要开后台提醒。
    // 只问一次 —— 拒绝了就再也不弹，改成倒计时下面那行"点这里开启"。
    // 放在最后，是因为前面记训练、开音响、起倒计时才是正事，绝不能挡在它前面。
    void askRestNotifyFirstTime()
  }

  // 算热量估算用的体重。优先「身体数据」里最近一次，没记过才用设置里那个默认值。
  // 两个都没有就是 undefined —— 那时不显示热量，并提示去哪填。
  const weightKg = resolveWeightKg(bodyMetrics, settings)

  // ---------- 记一次有氧 ----------
  //
  // 【为什么它和上面的 addSet 是分开的两个函数】
  // 力量是"点一次 ✓ 加一组"，有氧是"填完表单加一条"，两者的入口和
  // 要填的东西完全不同。硬凑进一个函数会到处是 if，反而更难读。
  //
  // 【有氧为什么不触发休息倒计时】
  // 那个 90 秒倒计时是给力量组间用的。跑完步不需要"休息 90 秒"。
  function addCardio(
    exerciseId: string,
    durationSec: number,
    distanceM: number | undefined,
    kcal: number | undefined,
  ) {
    const base: WorkoutSession = session ?? {
      id: newId(),
      date: todayKey(),
      entries: [],
      exerciseIds: [],
    }

    const entry: SetEntry = {
      id: newId(),
      exerciseId,
      // 有氧没有重量和次数，填 0。
      // 为什么不干脆不写这两个字段：见 types.ts 里 SetEntry 那段注释 ——
      // 改成可选会让全项目好几处算法算出 NaN，然后污染所有图表。
      weightKg: 0,
      reps: 0,
      completedAt: new Date().toISOString(),
      durationSec,
      // 没填距离时 distanceM 是 undefined，整个字段就不写进去，
      // 而不是写个 0 —— "跑了 0 米"和"没记距离"是两回事。
      // 统计页画"单次距离"那张图时要靠这个区分。
      distanceM,
      // 从器械上抄来的热量。只存手填的，估算值不存 ——
      // 估算值是算出来的，存下来以后改了公式或体重，老记录就不会跟着更新了。
      kcal,
    }

    // 这个有氧动作今天记过没有？记过就不再重复塞进 exerciseIds，
    // 否则卡片列表里会冒出两张一模一样的
    const already = (base.exerciseIds ?? []).includes(exerciseId)

    persist({
      ...base,
      exerciseIds: already
        ? (base.exerciseIds ?? [])
        : [...(base.exerciseIds ?? []), exerciseId],
      entries: [...base.entries, entry],
      startedAt: base.startedAt ?? new Date().toISOString(),
    })

    setCardioOpen(false)
    setCardioPresetId(undefined)
  }

  // ---------- 关掉休息倒计时 ----------
  //
  // 两种情况会走到这里：点"跳过"提前结束，或者休息结束后点"点一下继续"。
  //
  // ★ 两边都要清：内存里的（界面立刻变）和存档里的（切个 tab 再回来
  //   不会又冒出来）。只清内存的话，倒计时会在切回来时"复活"。
  function clearRest() {
    setRestEndsAt(null)
    if (session !== null) {
      persist({ ...session, restEndsAt: undefined })
    }
    // ★ 通知那边也要跟着取消。
    //   少了这一句就会出现最难受的那一幕：你已经跳过休息进了下一组，
    //   手机到点还在响 —— 因为预约还留在系统里没人撤。
    syncRestNotify()
  }

  // ---------- 删掉记错的一组 ----------
  function removeSet(setId: string) {
    if (!session) return
    persist({
      ...session,
      entries: session.entries.filter((s) => s.id !== setId),
    })
  }

  // ---------- 这次训练收摊 ----------
  //
  // 所有"训练结束"的出口都走这一个函数，因为收摊要做的不止一件事。
  //
  // ★ 必须顺手把休息倒计时也清掉。
  //   不然会出这么一幕：你在最后一组点完 ✓（倒计时自动开始），
  //   紧接着点"结束训练"——训练是结束了，可"休息中 1:23"还赖在页面上，
  //   而且到点还会响一声、那段时间屏幕也一直被挂着不让熄灭。
  //   训练都结束了，哪还有"组间休息"这回事。
  //
  // 【为什么抽成一个函数，而不是在两处各写三行】
  //   写两遍的话，哪天再加一个"结束训练"的入口（或者再加一件收摊要做的事），
  //   一定会漏掉其中一处 —— 这次这个 bug 就是这么来的。
  function endSession() {
    clearActiveWorkout()
    setSession(null)
    setRestEndsAt(null)
    // 顺手把冻结的结束时刻也清掉，下一场训练重新冻结
    setFinishEndISO(null)
    // 和 clearRest 同理：训练都结束了，系统里那条预约也必须撤掉，
    // 不然你收拾东西走出健身房，手机还在包里响个不停
    syncRestNotify()
  }

  // ---------- 改这次训练的开始时间 ----------
  //
  // 用户热身了多久 App 猜不到，只能让他自己往回推（见 StartTimeEditor）。
  //
  // ★ 只改"正在进行的这一次"。已经存进历史的那条不会跟着变 ——
  //   和"老记录不重算档位"是同一个规矩。
  // ★ 每改一次都立刻落盘：万一下一秒 App 被系统杀掉，这次改动不会丢，
  //   而且面板上的时长是照着 session 现算的，所以会跟着一起变。
  function changeStart(iso: string) {
    if (session === null) return
    persist({ ...session, startedAt: iso })
  }

  // ---------- 丢掉这次"忘了结束"的训练 ----------
  //
  // 和"清空"是两回事：清空针对的是刚新建、还没记东西的会话；
  // 这个是已经记了一堆组、但明显不是今天练的了。
  // 所以必须先问一句 —— 删掉就找不回来了。
  function discardStaleSession() {
    const confirmed = window.confirm(
      '丢掉这次训练？\n\n' +
        '已经记的那些组会一起删掉，找不回来。\n' +
        '如果其实是想把它存下来，点"取消"，改用「结束这次训练」。',
    )
    if (!confirmed) return
    endSession()
  }

  // ---------- 结束训练 ----------
  function finishWorkout() {
    if (!session) return

    // 一组都没记：直接丢弃，不往历史里塞空记录，也不用问
    if (session.entries.length === 0) {
      endSession()
      return
    }

    // 练了力量 → 弹强度选择面板。它顺便代替了原来的"确定要结束吗"。
    // 为什么要问：同样练 1 小时，轻重量和大重量的热量能差一倍
    // （MET 3.0 对 6.0），而系统只能从数据里猜，看不见"你今天状态不好"。
    // ★★ 冻结"结束时刻"：整个流程只在这一行读一次表。
    //
    // 【为什么必须冻结】
    // 面板打开之后用户可能磨蹭几分钟才点"结束训练"。如果面板上显示的时长是
    // "打开那一刻算的"、最后落盘的是"点确定那一刻算的"，两个数就会差几分钟 ——
    // 用户看到的和存进去的不一样。（这是"推荐时长 ≠ 落盘时长"那个老坑的同一类，
    // 上次为了 30 分钟那条分界线已经踩过一次。）
    //
    // 下一行的 Date.now() 是安全的：只有用户点"结束训练"那一刻才执行，
    // 属于事件处理，不是渲染过程。oxlint 分不清这两者，所以显式忽略。
    // oxlint-disable-next-line react/purity
    const endISO = new Date().toISOString()
    setFinishEndISO(endISO)

    if (strengthEntries.length > 0) {
      // ★ 用 completedSession() 补好时长再推荐 —— 这样推荐和落盘
      //   用的是同一个时长，不会在 30 分钟这种分界线上打架
      setRecommendation(
        recommendMetLevel(completedSession(session, endISO), cardioIds),
      )
      // 顺便把"上次用的档位"现读一份，给面板上的「沿用上次」按钮。
      // 用 readSettings() 而不是上面那个 settings state —— 后者可能已经过时。
      setLastMetLevel(readSettings().lastMetLevel)
      setMetPickerOpen(true)
      return
    }

    // 纯有氧 → 用不上力量档位，沿用原来那个确认框
    const confirmed = window.confirm(
      `结束今天的训练吗？\n\n${finishSummary}，会存进历史记录。`,
    )
    if (!confirmed) return
    // 这里必须把 endISO 显式传下去：下面那个 setFinishEndISO 是异步的，
    // 同一个事件处理函数里紧接着读 finishEndISO 还是**旧值**。
    saveWorkout(undefined, endISO)
  }

  // ---------- 把"正在进行的那份"补成"可以存的那份" ----------
  //
  // 【为什么现在才能补时长】
  // 时长只有到"结束"这一刻才知道。存在 active-workout 里的那份每次点 ✓
  // 都会被覆盖重写，所以不能提前写；这里算一次、只写进 sessions。
  //
  // 【为什么是"整场时长"而不是"做组时长"】
  // 热量用的 MET 档位是按整场训练的平均强度定的。只算做组时间的话，
  // 同样的组数时长会短一大截，热量会严重高估。所以必须含组间休息。
  //
  // ★ 推荐档位和落盘都走这一个函数，保证两处用的是同一个时长口径。
  //
  // ★★ endISO 由调用方传进来（点"结束训练"那一刻冻结的时刻），
  //    不在这里现读表。原因见下面 finishEndISO 的注释 —— 面板开着的时候
  //    用户可能磨蹭几分钟，现读表会让"显示的数"和"存的数"对不上。
  function completedSession(
    s: WorkoutSession,
    endISO: string,
  ): WorkoutSession {
    // ★ 练完忘了点结束、隔了很久才回来：**不能**把"现在"当结束时刻，
    //   那会记成十几个小时（实测：隔一夜 = 20 小时 = 约 8000 千卡）。
    //
    //   超时的时候，结束时刻改成"最后一组的完成时间" ——
    //   有据可查，不是拍脑袋截断。这也是为什么不在别处硬砍成 6 小时：
    //   砍掉的那几个小时是编出来的，而"你最后一组记到几点"是你自己记的。
    //
    //   传 undefined 给 sessionSeconds 就等于"用最后一组"（它本来就这样兜底）。
    const stale = isStaleSession(s, endISO)
    return {
      ...s,
      // 算不出来时保留原值（多半本来是 undefined，界面会显示"—"，不会崩）。
      durationSec:
        sessionSeconds(s, stale ? undefined : endISO) ?? s.durationSec,
    }
  }

  // ---------- 真正落盘 ----------
  //
  // metLevel 为 undefined 表示"这次没有力量训练"，没有档位可记。
  //
  // endISO 一般不用传：finishWorkout() 已经把它冻进 finishEndISO 了，
  // 面板上点"结束训练"时那个 state 早就更新过了。
  // 只有"纯有氧"那条路要在同一个事件处理函数里接着落盘，那时 state 还没生效，
  // 所以它会把 endISO 显式传进来。
  function saveWorkout(
    metLevel: StrengthMetLevel | undefined,
    endISO?: string,
  ) {
    if (!session) return

    // 兜底的 new Date() 只在"两条路都没给 endISO"时才会走到，
    // 而正常流程里 finishWorkout() 一定已经给过了 —— 留着是为了万一。
    // oxlint-disable-next-line react/purity
    const end = endISO ?? finishEndISO ?? new Date().toISOString()

    const finished: WorkoutSession = {
      ...completedSession(session, end),
      // 用展开语法按条件加字段，而不是写 metLevel: metLevel ——
      // 后者会在纯有氧时写出一个 metLevel: undefined 的键，
      // 虽然读出来一样，但存进 json 会多一行没意义的空字段
      ...(metLevel !== undefined ? { metLevel } : {}),
      // 顺手把休息倒计时抹掉：训练都结束了，历史记录里留着
      // "休息到几点结束"没有任何意义。
      // 写成 undefined 而不是 delete —— JSON.stringify 会把值是 undefined
      // 的键自动扔掉，所以存档里不会真的多出这一行。
      restEndsAt: undefined,
    }

    // 【这里的顺序非常关键，是防丢数据最重要的一处】
    //
    // 必须"先确认存进历史成功了"，才能清空"正在进行"那一格。
    // 如果反过来先清空，万一存历史失败（比如手机存储满了），
    // 这次训练就两头都没了 —— 彻底丢失，找不回来。
    //
    // 【为什么按 id 滤，不按日期滤】（2026-09-26 改）
    //
    // 原来这里写的是 `s.date !== session.date` —— 按【日期】滤。
    // 那等于"这天只要有过记录就全删掉"，于是同一天练第二场时，
    // 第一场被无声无息地顶掉了。
    //
    // 改成按【id】滤：id 是这场训练刚创建时就生成好的（addExercise /
    // applyTemplate / addCardio 三处的 `session ?? { id: newId() }`），
    // 之后一路不变 —— 上面 completedSession() 只做 `{ ...s, durationSec }`，
    // 不会重新生成 id，所以 finished.id 就是这场训练自己的那个号。
    //
    // 两条性质都保住了：
    //   · 新练的一场：id 不在历史里 → 谁都不滤 → 追加 → 同一天两场都在
    //   · 同一场重复保存（存储失败后重试之类）：id 相同 → 顶掉旧的，不攒重复
    // 而且它严格比原来更不容易丢数据：原来一刀切掉一整天，现在只动一条。
    const others = readSessions().filter((s) => s.id !== finished.id)
    const saved = writeSessions([...others, finished])
    if (!saved) {
      setStorageError(true)
      // 故意不清空：数据还留在"正在进行"里，你稍后存储恢复了还能再点一次
      return
    }

    // 记住这次选的档，下次打开默认就用它。
    // 用 readSettings() 现读，而不是用上面那个 settings state ——
    // 那个是挂载时读一次的，可能已经过时了。
    if (metLevel !== undefined) {
      writeSettings({ ...readSettings(), lastMetLevel: metLevel })
    }

    endSession()
    setMetPickerOpen(false)
  }

  // ---------- 结束面板要用的两个数 ----------
  //
  // 【时长必须和最后落盘的是同一个】用冻结的结束时刻算，不在这里现读表 ——
  // 面板开着的时候用户可能磨蹭几分钟，现读会让"面板上写的"和"存进去的"
  // 对不上。（这就是第 1 步里那个 finishEndISO 的用途。）
  //
  // 每一步都是纯的：completedSession 里那两个函数只看传进去的时刻，
  // 不读当前时间。所以放在渲染里算是安全的。
  const finishDurationSec =
    session !== null && finishEndISO !== null
      ? (completedSession(session, finishEndISO).durationSec ?? null)
      : null

  // 开始时间最晚能改到什么时候：**不能晚于第一组** ——
  // 开始时间跑到第一组后面就说不通了。一组都还没记时退回冻结的结束时刻。
  const latestStartISO = entries[0]?.completedAt ?? finishEndISO ?? undefined

  // ---------- 练完忘了点"结束训练"？----------
  //
  // 判据是"从开始到现在超过 6 小时"（见 lib/kcal.ts 的 isStaleSession）。
  //
  // ★ 为什么按**时长**判，不按"开始日期是不是今天"判：
  //   早上 8 点开练、当天晚上 8 点才打开 App —— 开始日期还是今天，
  //   但照样会记成 12 小时。按时长判，两种都抓得到。
  //
  // 只在**有记录**时才提示：一组都没记的话，正常那个"清空"按钮就够了，
  // 而且那种会话本来就会被丢弃、不会进历史。
  const staleStartISO = session?.startedAt ?? entries[0]?.completedAt
  const staleLastISO = entries[entries.length - 1]?.completedAt
  const showStaleWarning =
    session !== null && entries.length > 0 && isStaleSession(session)

  // ---------- 休息倒计时下面那行小字 ----------
  //
  // 分四种情况。分这么细是因为"切走之后到底会不会响"现在真的分好几种，
  // 得说实话 —— 以前那行写的是"切走了就不会提醒你（浏览器的限制）"，
  // 那句话现在是假的了。
  const notifyHint = !notifyStatus.native
    ? '网页版切走就收不到提醒了（装成 App 才行）'
    : !notifyStatus.granted
      ? '开启通知权限才能在后台提醒 · 点这里开启'
      : notifyStatus.exact
        ? '切到别的 App、锁屏，到点都会提醒你'
        : '切到别的 App 也会提醒你（可能晚几秒）'

  // 只有"还没授权"那一档才让这行字可以点。
  // 其它几档要么没事了，要么（精确闹钟）该去设置页慢慢弄 ——
  // 训练中间把人甩到系统设置页里，找不回来更麻烦。
  const notifyAction =
    notifyStatus.native && !notifyStatus.granted
      ? () => void requestRestNotify()
      : undefined

  return (
    <div>
      {/* ---------- 顶部抬头 ----------
          【这一轮把标题换了】
          以前这一屏最大的一行是日期（28px），第二大的才是"已练多久"。
          可这是练到一半掏出来瞄一眼的屏幕 —— 你要看的是"练了多久、
          举了多少"，不是今天是几号。日期占着最大的字号，
          等于把版面让给了最不需要的东西。

          现在反过来：**标题是这次训练的名字**（套模板时会有，比如"推日"），
          没有名字时才退回日期；日期和状态一起压成标题下面那行小字。
          字号从 28px 收到 21px，省下的分量全部让给下面那条读数带。

          【为什么状态灯跟着挪到小字行】
          它是"通电了"那颗指示灯，属于"状态"不属于"标题"，
          和日期这一类信息在一起才说得通。 */}
      <header className="mb-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-ink">
              {/* 没有训练名字时，标题就是日期 —— 总得有个东西当标题 */}
              {session?.name ?? formatDateCN(session?.date ?? today)}
            </h1>

            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  session !== null
                    ? 'animate-pulse bg-cyan shadow-[0_0_8px_var(--color-cyan)]'
                    : 'bg-muted'
                }`}
              />
              <span className="t-label">
                {session !== null ? '训练中' : '未开始'}
              </span>

              {/* 有训练名字时，日期退到这一行；没名字时标题已经是日期了，
                  这里就不再重复写一遍。
                  t-num 让日期里的数字等宽：跨天时整行不会左右挪一下。 */}
              {session?.name !== undefined && (
                <>
                  <span className="t-label" aria-hidden="true">
                    ·
                  </span>
                  <span className="t-num t-label">
                    {formatDateCN(session.date)}
                  </span>
                </>
              )}
            </div>
          </div>

          {session !== null && (
            <button
              type="button"
              onClick={finishWorkout}
              className="press min-h-11 shrink-0 rounded-lg border border-line-2 px-3.5 text-sm text-ink-2"
            >
              {hasEntries ? '结束训练' : '清空'}
            </button>
          )}
        </div>

        {/* ---------- 读数条 ----------
            把"练了几组 / 总共多少公斤 / 有氧多久 / 已练多久"四件事，
            从一句话拆成几格读数。
            以前那句「6 组 · 总容量 2,929.5 kg · 有氧 20 分钟」得一个字一个字读，
            而且"已练多久"是塞在标题旁边的一行小灰字 ——
            全屏第二重要的数字，却被埋得最深的那个位置。
            现在每个数字单独一格、标签压在小字上，扫一眼就抓到。

            【为什么把"已练多久"放在最后】
            它是唯一每 5 秒会跳一下的东西。放在最右边，
            跳动的数字就不会推着左边的文字跟着晃。

            【ElapsedBadge 为什么能当一格用】
            计时器在这个小组件**里面**，所以每 5 秒只重画这一格，
            不会把整页几十张卡片跟着重画。 */}
        {hasEntries && session !== null && (
          <div className="mt-4">
            <Readout>
              {strengthEntries.length > 0 && (
                <ReadoutCell
                  label="组数"
                  value={String(strengthEntries.length)}
                />
              )}
              {/* 数字取整：读数条是"扫一眼"的地方，
                  "2,929.5"里那个 .5 在这儿没人会去用，却要多占一格宽度。
                  （历史页里还是带小数的，那里是"核对"的地方，精度该留着。） */}
              {/* 标签写"容量"而不是"总容量" ——
                  少一个字，是为了在最窄的手机上不被裁掉。
                  "容量"本身也就是这个指标的名字（见 CLAUDE.md 的公式），
                  并没有因为少了个"总"而变得看不懂。
                  单位 kg 这一轮从标签里挪到了数字后面（用 .t-unit 压小压淡）——
                  这是全站统一的写法：数字是主、单位是附注。 */}
              {strengthEntries.length > 0 && (
                <ReadoutCell
                  label="容量"
                  unit="kg"
                  value={Math.round(
                    sessionVolume(strengthEntries),
                  ).toLocaleString()}
                />
              )}
              {cardioSeconds > 0 && (
                <ReadoutCell label="有氧" value={formatClock(cardioSeconds)} />
              )}
              {session.startedAt !== undefined && (
                <ElapsedBadge
                  startedAt={session.startedAt}
                  stale={showStaleWarning}
                  lastSetISO={staleLastISO}
                />
              )}
            </Readout>
          </div>
        )}
      </header>

      {/* ---------- 练完忘了点"结束训练"（★ 2026-09-24 加的）----------
          这条必须说清楚，因为系统接下来做的事和用户以为的不一样：
          结束时刻会按"最后一组"算，而不是"现在"。不说的话，
          用户会以为自己的训练时长被系统擅自改短了。 */}
      {showStaleWarning && (
        <div className="mb-3 rounded-xl border border-brand bg-brand/10 p-3">
          <div className="text-sm font-medium text-brand">
            这次训练从 {formatMoment(staleStartISO ?? '')} 就开始了
          </div>
          <p className="mt-1 text-xs text-ink-2">
            多半是练完忘了点「结束训练」。
            <br />
            要是把"现在"当成结束时刻，这一场会被记成十几个小时、热量也跟着离谱。
            <br />
            所以这次
            <span className="font-semibold">不按现在算</span>
            {staleLastISO !== undefined && (
              <>，改按你最后一组的时间（{formatMoment(staleLastISO)}）算。</>
            )}
            {staleLastISO === undefined && '。'}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={finishWorkout}
              className="press min-h-11 flex-1 rounded-lg bg-brand px-3 text-sm font-semibold text-on-brand shadow-[var(--elev-brand)]"
            >
              结束这次训练
            </button>
            <button
              type="button"
              onClick={discardStaleSession}
              className="press min-h-11 shrink-0 rounded-lg border border-line-2 px-3 text-sm text-ink-2"
            >
              丢弃
            </button>
          </div>
        </div>
      )}

      {/* ---------- 存不进去时的警告 ---------- */}
      {storageError && (
        <div className="mb-3 rounded-lg border border-brand bg-brand/10 p-3 text-sm text-brand">
          存不进去了，可能是手机存储满了。先别继续记，请告诉我。
        </div>
      )}

      {/* ---------- 休息倒计时 ---------- */}
      {restEndsAt !== null && (
        <RestTimer
          endsAt={restEndsAt}
          // 进度环的分母。settings 是这一页挂载时读一次的，
          // 够用 —— 休息中途去改时长是极罕见的情况，
          // 而且真改了也只是环的样子略有偏差，剩余秒数照样是准的
          // （那个数是照着 endsAt 现算的，见上面）。
          totalSec={settings.restSec}
          onClose={clearRest}
          notifyHint={notifyHint}
          onEnableNotify={notifyAction}
        />
      )}

      {/* ---------- 每个动作一张卡片 ---------- */}
      {exerciseIds.map((id, index) => {
        const exercise = allExercises.find((e) => e.id === id)
        const sets = (session?.entries ?? []).filter((s) => s.exerciseId === id)
        // 这个动作有没有来自模板的"目标几组几次"
        const planned = (session?.plannedItems ?? []).find(
          (p) => p.exerciseId === id,
        )
        return (
          <ExerciseCard
            key={id}
            index={index}
            name={exercise?.name ?? '（已删除的动作）'}
            equipment={exercise?.equipment ?? ''}
            sets={sets}
            planned={planned}
            showRpe={settings.rpeEnabled}
            isCardio={exerciseKind(exercise) === 'cardio'}
            onAddSet={(w, r, rpe) => addSet(id, w, r, rpe)}
            onRemoveSet={removeSet}
            onRemoveExercise={() => removeExercise(id)}
            onAddMoreCardio={() => {
              setCardioPresetId(id)
              setCardioOpen(true)
            }}
          />
        )
      })}

      {/* ---------- 给这次训练加点内容 ----------
          这一块是"一个主按钮 + 两个次按钮"，不是三个平等的按钮。

          【改之前为什么不行】
          三个按钮都是一样大的虚线框、一样的灰色文字，分量完全一样。
          眼睛扫过去不知道该点哪个 —— 而实际上"添加动作"的使用频率
          比另外两个加起来高得多。三个一样重 = 没有重点。

          【现在怎么分】
          主按钮用主色（橙红）描边和文字，是这一屏唯一带颜色的操作入口；
          两个次按钮退成灰色，并且并排缩成半宽。
          眼睛会自动先看到橙色的那个，这就是"层级"。 */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          // 一个动作都没有的时候，它长得更像一块"空状态提示牌"：
          // 撑得更高、字更大、底色透一点点橙 —— 因为这时候全屏是空的，
          // 需要有个东西把人拽过来。有动作之后它就收成普通一行，
          // 不再抢版面（那时候主角是上面那些卡片）。
          className={`press w-full rounded-xl border border-dashed text-brand ${
            exerciseIds.length === 0
              ? 'min-h-[132px] border-brand/40 bg-brand/5 text-lg font-medium'
              : 'border-brand/30 py-3.5 text-sm font-medium'
          }`}
        >
          {exerciseIds.length === 0
            ? '+ 添加第一个动作，开始今天的训练'
            : '+ 添加动作'}
        </button>

        {/* ---------- 两个次要入口 ----------
            【为什么有氧要单独一个按钮】
            它走的是完全不同的表单：只填时长和距离，不填重量和次数。
            而且在动作库里选动作时，有氧那 11 个是被排除掉的（见 ExercisePicker），
            所以必须有这么一个专门的入口，否则有氧根本记不了。

            【套用模板】一键把一整套动作和目标组数次数填进来。 */}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setCardioPresetId(undefined)
              setCardioOpen(true)
            }}
            className="press flex-1 rounded-xl border border-dashed border-line py-3.5 text-sm text-ink-2"
          >
            + 记有氧
          </button>
          <button
            type="button"
            onClick={() => setTemplatePickerOpen(true)}
            className="press flex-1 rounded-xl border border-dashed border-line py-3.5 text-sm text-ink-2"
          >
            套用模板
          </button>
        </div>
      </div>

      {pickerOpen && (
        <ExercisePicker
          customExercises={customExercises}
          onPick={addExercise}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {templatePickerOpen && (
        <TemplatePicker
          customTemplates={customTemplates}
          allExercises={allExercises}
          onPick={applyTemplate}
          onClose={() => setTemplatePickerOpen(false)}
        />
      )}

      {cardioOpen && (
        <CardioForm
          allExercises={allExercises}
          initialExerciseId={cardioPresetId}
          weightKg={weightKg}
          onSave={addCardio}
          onCancel={() => {
            setCardioOpen(false)
            setCardioPresetId(undefined)
          }}
        />
      )}

      {metPickerOpen && session !== null && (
        <MetPicker
          // ★ 面板默认选中的永远是"系统本次推荐的"那一档。
          //   以前这里传的是 settings.lastMetLevel ?? recommendation.level，
          //   也就是"上次选的"永远赢 —— 一次选错就永久沿用，
          //   有人 16 组大重量被按低强度算热量就是这么来的。
          //   要沿用上次，改成面板里那个"沿用上次"按钮，由用户自己点。
          recommended={recommendation.level}
          reason={recommendation.reason}
          lastLevel={lastMetLevel}
          durationSec={finishDurationSec}
          startedAt={session.startedAt}
          latestStartISO={latestStartISO}
          onChangeStart={changeStart}
          summary={finishSummary}
          onConfirm={saveWorkout}
          onCancel={() => setMetPickerOpen(false)}
        />
      )}
    </div>
  )
}

// ============================================================
// 一个动作的卡片：显示动作名 + 已完成的组 + 输入行
// ============================================================

function ExerciseCard({
  index,
  name,
  equipment,
  sets,
  planned,
  showRpe,
  isCardio,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
  onAddMoreCardio,
}: {
  // 这张卡在列表里排第几。只用来算入场动画的延迟。
  index: number
  name: string
  equipment: string
  sets: SetEntry[]
  planned?: PlannedItem // 来自模板的"目标几组几次"。手动加的动作没有这个
  showRpe: boolean
  // 这个动作是不是有氧。力量和有氧只差在"下半截"：
  //   力量 → 列出一组组"80 kg × 8"，下面跟一个输入行
  //   有氧 → 列出"30 分钟 · 5.00 公里 · 配速 6'00"/公里"，下面跟一个"再记一次"
  // 卡片头（动作名、移除按钮）两者共用。
  isCardio: boolean
  onAddSet: (weightKg: number, reps: number, rpe: number | null) => void
  onRemoveSet: (setId: string) => void
  onRemoveExercise: () => void
  onAddMoreCardio: () => void
}) {
  // 输入框里的内容按"文字"存，理由见 NumberField.tsx 的注释
  const [weightText, setWeightText] = useState('')
  const [repsText, setRepsText] = useState('')
  const [rpeText, setRpeText] = useState('')

  const weight = textToNumber(weightText)
  const reps = textToNumber(repsText)

  // 重量和次数都填了才能点 ✓。
  // 注意 0 是合法的（引体向上、平板支撑），所以判断的是"有没有填"而不是"是不是大于 0"。
  const canConfirm = weight !== null && reps !== null

  function handleConfirm() {
    if (weight === null || reps === null) return
    onAddSet(weight, reps, textToNumber(rpeText))

    // 轻轻"嗒"一下。
    // 【为什么要放在这一行】
    // 此刻正处在"用户手指刚点完"的一瞬间，这是手机上唯一允许震动的时机。
    // 记一组这件事在屏幕上只有"多了一行记录"这一个变化 ——
    // 有时候你眼睛还在杠铃上，根本没看屏幕。那一下震动就是"记上了"的回执。
    // 电脑和 iPhone 浏览器上没有这个能力，tapFeedback 内部会自己忽略掉。
    tapFeedback()

    // 【这是"5 秒记一组"的关键】
    // 点完 ✓ 后故意不清空重量和次数 —— 因为下一组通常还是同样的重量。
    // 你可以直接再点一次 ✓ 就记下第二组，只改需要变的那一项。
    // 只清空 RPE，因为每一组的费力程度通常不一样。
    setRpeText('')
  }

  // 目标组数练够了没有。练够了进度条会从浅青变成实青，
  // 右边那个"3/4"也跟着变色 —— 这套配色的分工是
  // "橙=要动手，青=已经记下来的数"（见 index.css 顶部说明）。
  const plannedDone = planned !== undefined && sets.length >= planned.targetSets

  // 组记录那张小表的列宽。表头行、数据行、输入行三处共用这一条，
  // 所以输入框正好落在它要填的那一列底下，三行的数字也全都在同一条竖线上。
  //
  // 【每一列是干什么的】
  //   1.25rem  组号
  //   3.75rem  重量（右对齐）
  //   3rem     次数（右对齐）
  //   3rem     RPE
  //   1fr      弹性空隙 —— 把所有富余的宽度都吃掉
  //   2.75rem  删除按钮（44px，手指点得准的最小尺寸）
  //
  // 【为什么重量和次数要右对齐】
  // 右对齐之后，一列数字的**右边缘**落在同一条竖线上。
  // "80 / 80 / 82.5"这样斜着扫一眼就能比出大小 —— 左对齐的话
  // 每个数字从同一个地方开始，长短不一，反而比不出来。
  // 这是所有账本、所有表格都把数字右对齐的唯一原因。
  //
  // 【为什么这一轮把宽度从 1fr 1fr 改成了写死的尺寸】
  // 上一版重量和次数各占 1fr，结果在 375px 的手机上每列有 96px 宽，
  // 而"80"只占 30px —— 数字全都右对齐飘在格子的最右边，
  // 组号"1"和重量"80"之间隔着大半个屏幕，读一行得横着跳两次。
  // 写成固定宽度之后数字全挤到左边成一组，中间那段富余宽度
  // 统一交给后面那个 1fr 吃掉：数字在左、删除按钮在右，中间是空气。
  // 这也是所有表格的常规写法 —— 列宽由内容决定，不由容器均分。
  const SET_GRID =
    'grid-cols-[1.25rem_3.75rem_3rem_3rem_1fr_2.75rem] gap-x-1.5'

  return (
    <div
      // 一张一张错开 35 毫秒冒出来，像仪表盘上指示灯逐个点亮。
      // 【为什么要封顶 Math.min(…, 180)】
      // 动作多的那天可能有十来个动作。不封顶的话最后一个要等 350 毫秒
      // 才出现 —— 那已经不叫"入场动画"，那叫"卡了"。
      //
      // 【这一轮从 card 换成了 ledger】
      // 卡片的圆角和阴影让它看着像一块"浮起来的小部件"；
      // 账本没有阴影、圆角更小，里面用细线分行 —— 它是"印在页面上的一页"。
      // 一屏六七个动作时，这个差别就是"一堆卡片"和"一份训练记录"的差别。
      className="ledger animate-rise mb-2.5"
      style={{ animationDelay: `${Math.min(index * 35, 180)}ms` }}
    >
      {/* ---------- 卡头：序号 + 动作名 + 移除 ---------- */}
      <div className="flex items-start gap-2.5 px-3.5 pb-2.5 pt-3">
        {/* 序号（01、02…）：账本左边那一列行号。
            它让"我现在在第几个动作"变成一眼可读的事，
            也让这一页看起来像一份编了号的清单，而不是一摞卡片。 */}
        <span className="t-index mt-1 shrink-0">
          {String(index + 1).padStart(2, '0')}
        </span>

        <div className="min-w-0 flex-1">
          {/* 动作名用 text-lg（17px）半粗 —— 它是这一块的标题，
              必须比卡里所有别的东西都重，否则整张卡是一团平的 */}
          <div className="truncate text-lg font-semibold text-ink">{name}</div>

          <div className="mt-0.5 flex items-baseline gap-2">
            {(equipment !== '' || planned !== undefined) && (
              <span className="min-w-0 truncate text-xs text-muted">
                {equipment}
                {equipment !== '' && planned !== undefined && ' · '}
                {planned !== undefined &&
                  `目标 ${planned.targetSets} 组 × ${planned.targetReps} 次`}
              </span>
            )}
            {/* "3/4"挪到这一行的右端。
                以前它是挤在设备名末尾的一个小数，和"杠铃"这种字一样重，
                根本没人看得见 —— 现在单独靠右，练够了还会变成青色。 */}
            {planned !== undefined && (
              <span
                className={`t-num ml-auto shrink-0 text-xs font-semibold ${
                  plannedDone ? 'text-cyan' : 'text-ink-2'
                }`}
              >
                {sets.length}/{planned.targetSets}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onRemoveExercise}
          // -mr-1 -mt-1 把按钮往角上推一点，视觉上贴着边，
          // 但点击区本身保持了 44px 高（项目铁律：手指点得准的最小尺寸）
          className="press -mr-1 -mt-1 min-h-11 shrink-0 rounded-lg px-2.5 text-xs text-muted"
        >
          移除动作
        </button>
      </div>

      {/* ---------- 卡头下面那条线，有目标时它就是进度条 ----------
          以前进度是单独一根圆角条，占掉一整行（约 20px）。
          现在它**直接变成卡头下面那条分隔线** —— 线本来就要画，
          顺便把进度一起说了，省掉一整行，而且整宽铺满的线
          比一小截圆角条更像"刻度"。

          【为什么没目标时是 1px、有目标时是 2px】
          没目标时它只是一条普通分隔线，要和全站别的细线一样细；
          有目标时它要"装得下"进度，2px 才看得清那一段青色。 */}
      {planned !== undefined ? (
        <div className="h-0.5 bg-line">
          <div
            // transition-[width]：进度是"长"过去的，不是"跳"过去的。
            // 300ms 配合 ease-mech（起步快、收尾稳），看着结实不飘。
            // 练超了也不让条子冲出边界（Math.min 压在 100%）。
            className={`h-full transition-[width] duration-300 ease-mech ${
              plannedDone ? 'bg-cyan' : 'bg-cyan/50'
            }`}
            style={{
              width: `${Math.min(100, (sets.length / planned.targetSets) * 100)}%`,
            }}
          />
        </div>
      ) : (
        <div className="h-px bg-line" />
      )}

      {/* ---------- 下半截：有氧和力量在这里分道扬镳 ---------- */}
      {isCardio ? (
        <>
          {/* 有氧每条就是一句话，没有组号也没有 RPE */}
          {sets.map((s) => (
            <div
              key={s.id}
              // animate-rise：这一条是刚"长"出来的，不是突然出现的。
              // 只对新加的那一条生效 —— 因为 React 认得 key，
              // 老的那些元素没被重建，动画就不会重放。
              className="ledger-row animate-rise text-sm"
            >
              <span className="t-num flex-1 text-ink">{describeCardio(s)}</span>
              <RemoveSetButton onClick={() => onRemoveSet(s.id)} />
            </div>
          ))}

          {/* 再记一次：直接带着这个动作打开录入面板，省掉"重新选一遍" */}
          <div
            className={`px-3.5 py-3 ${sets.length > 0 ? 'border-t border-line' : ''}`}
          >
            <button
              type="button"
              onClick={onAddMoreCardio}
              className="press min-h-11 w-full rounded-lg border border-dashed border-line text-sm text-ink-2"
            >
              + 再记一次
            </button>
          </div>
        </>
      ) : (
        <>
          {/* ---------- 表头 ----------
              只在"已经记了至少一组"时出现 —— 一组都没记时，
              顶着一张空表格反而像坏了。

              这一行是整个账本观感的关键：它把下面那几行数字变成了一张**表**。
              三件事各说一次就够，不用每行都写一遍：
              "KG"说了单位，"次"说了那列是什么，"RPE"同理。
              因为单位不用写在每一行上，每一行才能那么窄、那么干净。 */}
          {sets.length > 0 && (
            <div
              className={`t-label grid ${SET_GRID} items-center border-b border-line px-3 py-1.5`}
            >
              <span />
              <span className="text-right">KG</span>
              <span className="text-right">次</span>
              <span className="text-right">RPE</span>
              <span />
              <span />
            </div>
          )}

          {/* ---------- 已经记好的组 ----------
              每一行是"组号 / 重量 / 次数 / RPE / 删"，五样各占一列。
              所有列宽都固定，所以行与行之间的数字是严格对齐的 ——
              斜着一扫就能看出哪一组掉了重量，不用一行行读。 */}
          {sets.map((s, index) => (
            <div
              key={s.id}
              // min-h-11：行高至少 44px。既满足手指点得准的最小尺寸，
              // 也让每行一样高 —— 一样高，细线才是均匀的。
              className={`ledger-row animate-rise grid ${SET_GRID} min-h-11 px-3`}
            >
              <span className="t-index">{index + 1}</span>
              {/* 【数字为什么是 21px，比正文大了整整两档】
                  这一屏的正事就是"我这组举了多少"。这几个数字是整页的**内容**，
                  不是说明文字。之前它们和正文一样大（15px），
                  于是整张表看着像一页淡淡的说明；提到 21px 之后，
                  一屏扫下去先看到的就是这些数，其余全部退到后面去。
                  这也是表格能"斜着扫一眼"的前提 —— 数字得先够大。 */}
              <span className="t-num truncate text-right text-xl font-semibold text-ink">
                {s.weightKg}
              </span>
              <span className="t-num truncate text-right text-xl font-semibold text-ink">
                {s.reps}
              </span>
              {/* RPE 用比主数字小一号、淡一档的颜色 ——
                  它是"附加信息"，不该和重量次数抢着被读到。
                  没填就留空：那一格空着本身就是"这一组没记 RPE"，
                  不需要写个"—"占位置。 */}
              <span className="t-num text-right text-sm text-ink-2">
                {s.rpe ?? ''}
              </span>
              {/* 弹性空隙列。它不显示任何东西，
                  作用是把右边的删除按钮顶到行的最右边去。 */}
              <span />
              <RemoveSetButton onClick={() => onRemoveSet(s.id)} />
            </div>
          ))}

          {/* ---------- 输入行 ----------
              用的是和数据行同一个列宽，所以输入框正好落在
              它要填的那一列底下 —— 上面"80"下面就是填重量，
              不用看标签也知道该往哪格填。 */}
          <div
            // 【为什么这条上边线要按条件加】
            // 有记录时，它把"已经记下来的"和"下面这张待填的表"分开，
            // 这条线是有意义的。一组都没记时，它上面就是卡头那条线，
            // 两条线挨在一起会看着像画重了。
            className={`grid ${SET_GRID} items-end px-3 pb-3 pt-2.5 ${
              sets.length > 0 ? 'border-t border-line' : ''
            }`}
          >
            {/* 第一格空着 —— 但**必须留着**。
               不占着这一格的话，后面三个输入框会整体左移一格，
               正好错开它们要填的那一列，上面"80"下面填到"次"里去。 */}
            <span aria-hidden="true" />

            <Field label="kg">
              <NumberField
                value={weightText}
                onChange={setWeightText}
                placeholder="80"
                // px-1 而不是 NumberField 自带的 px-2：
                // 这几格的宽度是照着"数字要多宽"定死的（约 60px），
                // 再留 8 像素的内边距，"82.5"就会顶到边。
                className="px-1"
              />
            </Field>

            <Field label="次">
              <NumberField
                value={repsText}
                onChange={setRepsText}
                placeholder="8"
                className="px-1"
              />
            </Field>

            {/* RPE 关掉时这一格留空，但**列还留着** ——
                这样"✓"永远在同一个位置，肌肉记忆不会被打乱 */}
            {showRpe ? (
              <Field label="RPE">
                <NumberField
                  value={rpeText}
                  onChange={setRpeText}
                  placeholder="—"
                  className="px-1"
                />
              </Field>
            ) : (
              <span />
            )}

            {/* 和数据行同一个弹性空隙，这样"✓"才会落在删除按钮那一列底下 */}
            <span />

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              // min-h-11 min-w-12 ≈ 44×48 像素：手指点得准的最小尺寸，
              // 宽度比最低要求宽一点点，因为它是最常按的那一颗
              //
              // 【没填好时：灰底、灰字、没有光晕】
              // 这三样一起去掉，按钮就"沉"下去了 —— 一眼看出现在按不动，
              // 而不是按下去之后才发现没反应。
              className="press min-h-11 w-full rounded-lg bg-brand text-xl font-bold text-on-brand shadow-[var(--elev-brand)] disabled:bg-line disabled:text-muted disabled:shadow-none"
            >
              ✓
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// 输入框上面那行小标签（kg / 次 / RPE）。抽出来是为了不用把同样的结构写 3 遍。
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      {label !== '' && <div className="t-label mb-1 text-center">{label}</div>}
      {children}
    </div>
  )
}

// 删掉某一组的那个「×」
//
// 【为什么值得单独抽一个组件】
// 它要满足两个互相打架的要求：看得见的小、点得中的大。
// 做法是让按钮本身 44×44（项目铁律里手指点得准的最小尺寸），
// 但里面那个"×"字号不大、颜色很淡 —— 于是它看着不起眼，点着很准。
// 抽出来是因为卡片里有两处要用（有氧那一种、力量这一种），
// 两边各写一遍迟早会写岔。
function RemoveSetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // 按钮里只有一个"×"，读屏软件念出来会是"乘号"，等于没念。
      // aria-label 是专门给它补一句人话用的（光标悬停时的提示也用它）。
      aria-label="删掉这一组"
      // 【这一轮为什么把 -mr-2 去掉了】
      // 上一版它在卡片里，要往外推一点才贴着右边。现在它在表格的
      // 最后一列里，那一列本身就是 44px 宽、右边就是行的内边距 ——
      // 再往外推就顶出表格的边了。
      className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-muted"
    >
      ×
    </button>
  )
}

// ISO 时刻 → "9月21日 周一 14:00"。
//
// 【为什么要精确到分钟】"忘了点结束训练"那条提示里最关键的信息就是
// "系统打算按哪个时刻算" —— 只给到日期，用户没法判断对不对。
//
// 注意传进来的是**时刻**（'2026-09-21T14:00:00.000Z'）不是日期，
// 所以解析用 parseISO（Date.parse），不能用 parseDateKey。
function formatMoment(iso: string): string {
  const ms = parseISO(iso)
  if (Number.isNaN(ms)) return '（时间读不出来）'
  return `${formatDateCN(dateKey(new Date(ms)))} ${formatTimeCN(iso)}`
}
