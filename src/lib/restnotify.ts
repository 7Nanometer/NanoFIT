// ============================================================
// 组间休息的"后台提醒" —— 跟安卓系统预约一个闹钟
// ============================================================
//
// 【要解决的是什么问题】
// 原来的休息倒计时只能在 App 里响：手机一锁屏、一切到微信，到点什么都不发生。
// 原因是浏览器内核会把网页的定时器冻住，那句 beep() + vibrate() 根本轮不到执行。
// 这不是写错了，是网页技术的硬限制。
//
// 【解法：别自己记时间，改成跟系统预约】
// 通知不是我们自己掐着表发的，而是把"到点叫我"这件事交给安卓系统去办。
// 闹钟在系统手里，App 切后台、被冻住、甚至被系统杀掉，到点一样会响。
//
// 【★核心设计：一条不变式，一个出口】
//
//     预约通知  ⟺  在手机上 且 通知权限已给 且 App 不在前台 且 休息还没结束
//     其余所有情况 一律取消
//
// 这一条判断就是 syncRestNotify()。所有地方改完状态都只是喊一声"重新判断一下"，
// 不自己决定预约还是取消。
//
// 【为什么必须这样，而不是"休息开始时预约、结束时取消"分两处写】
// 分两处写一定会漏：切 tab、点跳过、训练结束、权限被撤销……出口太多了。
// 合成一条判断之后，"预约和取消成套"就不是靠人记得，而是压根写不歪。
// （TrainScreen 里那个"结束训练要顺手清掉倒计时"的 bug，就是这么来的。）
//
// 【为什么它不接收参数，自己去读存档】
// 底部四个 tab 是靠一个变量切换的，切走的时候训练页【整个被卸载】。
// 如果你切到「历史」页再把 App 切后台，训练页的代码早就不在了 ——
// 只有读存档（readActiveWorkout，读的是内存快照，同步的）才拿得到。
//
// 【网页版会怎样】
// 整条链路空转（下面每个出口都有 isNative 判断），一行原生代码都不执行，
// 所以 npm run dev 调试时不会有任何报错。
// ============================================================

import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import type { PermissionState } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { readActiveWorkout } from './storage'

// 现在是不是跑在手机上。浏览器里打开时是 false。
const isNative = Capacitor.isNativePlatform()

// 休息提醒在系统里的编号怎么算。
//
// 【为什么不固定用一个号】（2026-09-26 改，这是"只有第一条会响会震"的根因）
//
// 插件源码里写死了一句（LocalNotificationManager.kt:199，没有任何开关能关掉）：
//
//     mBuilder.setOnlyAlertOnce(true)
//
// 它的含义是：**同一个编号的通知再次出现时，系统当成"更新"** ——
// 只换文字，不再响、不再震、不弹横幅。
//
// 而这里原来固定用 1 号（注释还写着"是故意的，让旧的那条被顶掉"）。
// 两句一撞，结果就是：当天第一条提醒响过之后，后面每一条都悄没声地
// 换一下文字 —— 既没声音也没震动，看着像坏了。
//
// 【新算法：按这条提醒的结束时刻算一个号】
// 两条性质都保住了：
//   · 两次【不同】的休息 → 结束时刻不同 → 号不同
//     → 每条都是全新的一条 → 该响就响、该震就震
//   · 【同一次】休息重复预约（App 被杀掉又打开之类）→ 结束时刻没变
//     → 号相同 → 顶掉旧的，不会攒出两条
//     （这正是原来固定用 1 号想要的效果，保住了）
//
// 号段是 1,000,000 ~ 1,000,999,999，远小于安卓要求的 32 位整数上限
// （约 21.4 亿），也不会跟「试一下」那一段（见下面 TEST_NOTIFY_ID_BASE）相交。
// Math.round 是保险：万一哪天传进来一个带小数的时刻，取整后安卓才收。
const REST_NOTIFY_ID_BASE = 1_000_000

function restNotifyIdFor(endsAt: number): number {
  return REST_NOTIFY_ID_BASE + (Math.round(endsAt) % 1_000_000_000)
}

// 最近一次预约出去的那个号。发新的之前要拿它把旧的撤掉 —— 号换了，
// 不撤的话通知栏里会攒出一排。
//
// 【忘了也不要紧】它只在 App 活着的时候记得住。就算重启后丢了，
// 因为号是从结束时刻算出来的，同一次休息再预约还是同一个号，
// 照样会顶掉旧的、不会攒出两条。
let lastRestNotifyId: number | null = null

// ============================================================
// 记账：这次的提醒，到底该由谁来响（2026-09-30 加）
// ============================================================
//
// 【要解决的是什么问题：同一场休息，响了两遍】
//
// 你切到微信，到点系统通知响了一次；切回 App，它又"叮三声 + 震两下"。
// 因为应用内那声铃（RestTimer.tsx 里那句 beep() + vibrate()）不知道
// 系统那条已经在后台替你响过了 —— 它只是照着"倒计时归零"这个事实响。
//
// 【怎么判断"系统已经替我们响过了"】
// 光看"预约成功过"是不够的：你切出去瞄一眼、休息没结束就切回来，
// 这时 cancelRest() 会把那条预约【撤掉】（人回到前台就不该再弹系统通知）——
// 它压根没响过，可要是还记着"系统管过这次"，到点就两头都不响，
// 变成一声都没有。所以 cancelRest() 里配了一行"作废"（见那边注释）。
//
// 【为什么必须是两个格子，不能合成一个】
// 一个是"系统响过了"，一个是"应用内响过了"，两件事：
//   · 系统响过 → 应用内不能再响（你已经在后台被提醒过一次了）
//   · 应用内响过 → 不能因为重新挂载再响一遍
// 用 lastRestNotifyId 代替是不行的 —— cancelRest() 一进门就把它清空了
// （回前台必然会走一次 cancelRest，正好把它抹掉）。
//
// 【只在 App 活着的时候记得住】
// 模块变量不进存档。App 被系统杀掉再打开，这两个格子会丢 ——
// 但不会因此多响一声：重新打开时训练页会把"已经过期的休息"整个丢掉
// （见 TrainScreen.tsx 里 restEndsAt 的初值），连倒计时都不显示，更不会响。
let notifiedEndsAt: number | null = null // 跟系统预约成功的那个结束时刻
let alertedEndsAt: number | null = null // 应用内已经响过的那个结束时刻

// 这次休息的提醒，该不该由【应用内】来响？
//   true  = 去响（beep + 震动）
//   false = 别响：系统那条已经响过了，或者应用内已经响过一遍了
// 叫 claim（认领）是因为它顺手把这次"占"下来 —— 同一场休息再问第二次
// 一定回答 false。这样"一场休息只准响一次"这条规矩就写死在这里，
// 不靠调用方记得。
export function claimRestAlertOnce(endsAt: number): boolean {
  // ① 系统在后台替我们响过了。
  //    （Date.now() >= endsAt 是保险：没人会在到点之前来问这句话，
  //     真来了也说明"系统还没响"，那就该我们响。）
  if (notifiedEndsAt === endsAt && Date.now() >= endsAt) return false
  if (alertedEndsAt === endsAt) return false // ② 应用内已经响过一遍了
  alertedEndsAt = endsAt // 先占位，再告诉它去响
  return true
}

// 通知渠道的编号（安卓 8 起，每条通知都必须属于某个"渠道"）。
// 详见下面 createChannel() 那段注释。
//
// 【为什么从 'rest-timer' 改成了 'rest-timer-v2'】（2026-09-26 第二次修）
//
// 真机实测：12 次测试、震动一次都没出现，而且手机的系统设置里，
// 「组间休息」那个渠道**连"震动"这一项都不显示**。
//
// 查下来是两个原因叠在一起：
//   ① 渠道一旦建好，安卓就不允许 App 再改它 —— 旧渠道不管当初建得对不对，
//      现在都动不了了。要让新配置生效，只能换一个编号，让系统当成全新渠道。
//   ② ★ 插件只会调 enableVibration(true)，**从来不给渠道指定震动节奏**
//      （整个插件里搜不到一处 setVibrationPattern）。而"开了震动开关、
//      没给节奏"在不少机型上就是不震，系统设置里那一页也不显示"震动"。
//      所以新渠道必须由我们【自己用原生代码建】，见 MainActivity.java ——
//      那边建完了，插件这边的 createChannel 就自动变成空操作
//      （createNotificationChannel 对已存在的渠道是 no-op）。
//
// 旧渠道的编号。它再也不会被用到，但会一直挂在系统的通知设置里 ——
// 留着会让你看到两条名字一样的「组间休息」，不知道该看哪条。
// 所以下面 removeLegacyChannel() 会在新渠道确实建好之后把它删掉。
const LEGACY_CHANNEL_ID = 'rest-timer'

const CHANNEL_ID = 'rest-timer-v2'

// 设置页那个「试一下」按钮用【另一段号】。
// 号段分开，就不会跟真正的休息提醒互相顶掉：
//   休息提醒：1,000,000 ~ 1,000,999,999
//   试一下  ：2,000,000,000 ~ 2,099,999,999
// 两段完全不相交，而且都在安卓要求的 32 位整数范围内。
//
// ⚠️ 上面那个模数（1 亿）不是随便取的：2,000,000,000 + 99,999,999
// 正好卡在安卓的上限 2,147,483,647 以下。要是照抄休息提醒那边的 10 亿，
// 最大能算到 30 亿 —— 溢出成负数，安卓那边直接懵。
// （这个坑是测试当场抓出来的，见这次提交的说明。）
const TEST_NOTIFY_ID_BASE = 2_000_000_000
const TEST_NOTIFY_ID_MOD = 100_000_000

// 每次点都算一个新号，理由和上面一样：固定用同一个号的话，
// 插件那句 setOnlyAlertOnce(true) 会让你连点两次时第二次不响也不震。
// 两次点击要正好隔 27 小时 46 分才会撞号，实际上碰不到。

// 点「试一下」之后，过多久响。留 5 秒够你把 App 切到后台。
const TEST_DELAY_MS = 5000

// ---------- 对外汇报的状态 ----------

export type RestNotifyStatus = {
  native: boolean // 是不是装在手机上（网页端一律 false）
  granted: boolean // 通知权限：系统允不允许我们发通知
  exact: boolean // 精确闹钟权限：能不能"准点"响
}

// ---------- 内部状态 ----------

let started = false // 初始化只能做一次
let appActive = true // App 现在在不在前台
let granted = false // 通知权限
let exact = true // 精确闹钟权限（先当有，查到没有再改）

// 通知权限的"原始"答案，四种取值：
//   prompt                从没问过
//   prompt-with-rationale 拒绝过一次，该先解释再问
//   granted               已给
//   denied                拒绝过了，别再烦他
//
// 【为什么要单独留着它，而不是只看 granted】
// 决定"要不要弹系统那个授权框"要区分"没问过"和"拒绝过"：
// 安卓上拒绝过之后系统就不再弹框了，白弹一次只会让人觉得 App 有毛病。
// （安卓 13 起插件能分清这两者；13 以下没有通知权限这回事，一律返回 granted。）
let display: PermissionState = 'prompt'

// 这一次打开 App 里问过没有。
//
// 【为什么光靠 display 不够】
// 安卓有个老毛病：用户勾了"不再询问"之后，系统会回答"没问过"。
// 那就会一直弹我们的说明框，而他永远也授权不了。
// 加上这个标记，至少"一次打开只问一次"。
let askedThisRun = false

const statusListeners = new Set<() => void>()
const tapListeners = new Set<() => void>()
let pendingTap = false // "点击通知"事件来得比页面挂载还早时，先记在这儿

// ============================================================
// 一、给界面看的几个函数
// ============================================================

// 现在是什么状态。同步返回，因为状态一直存在内存里。
export function getRestNotifyStatus(): RestNotifyStatus {
  return { native: isNative, granted, exact }
}

// 状态变了通知界面重画。返回一个"退订"函数，页面卸载时要调。
export function subscribeRestNotify(cb: () => void): () => void {
  statusListeners.add(cb)
  return () => {
    statusListeners.delete(cb)
  }
}

// 用户点了通知栏那条提醒时要干什么（App.tsx 用它切回训练页）。
export function onRestNotifyTap(cb: () => void): () => void {
  tapListeners.add(cb)
  // 万一事件比页面挂载还早到（快速回到 App 时可能发生），补发一次。
  // 冷启动点通知不会走这里 —— 插件只在 App 还活着时才发这个事件，
  // 而冷启动本来就落在训练页，不需要跳。
  if (pendingTap) {
    pendingTap = false
    cb()
  }
  return () => {
    tapListeners.delete(cb)
  }
}

function emitStatus(): void {
  for (const cb of statusListeners) cb()
}

// ============================================================
// 二、唯一的出口：重新判断该不该预约
// ============================================================

// 判断条件收成一句，是为了让"什么样才预约"只有一处定义。
// 返回值写成 endsAt is number，是为了让 TypeScript 知道
// 下面那个 endsAt 通过检查之后一定是个数字（不是 null）。
function shouldSchedule(endsAt: number | null): endsAt is number {
  return granted && !appActive && endsAt !== null && endsAt > Date.now()
}

// ★所有改动了"休息状态"或"前后台状态"的地方，都只调这一个函数。
//   它不接收参数，自己去读存档。
export function syncRestNotify(): void {
  if (!isNative) return

  const endsAt = readActiveWorkout()?.restEndsAt ?? null

  if (!shouldSchedule(endsAt)) {
    void cancelRest()
    return
  }
  void scheduleRest(endsAt)
}

// ============================================================
// 三、真正跟系统打交道的那几个
// ============================================================

async function scheduleRest(endsAt: number): Promise<void> {
  const id = restNotifyIdFor(endsAt)

  // 换了号 → 先把上一条撤掉，免得通知栏里攒出一排。
  //
  // 同一个号（同一次休息重复预约）就【跳过】这步：
  // 下面 schedule 自己会把旧的顶掉；而且这时候撤掉再发，
  // 反而可能让已经响过的那条重新响一次，更吵。
  if (lastRestNotifyId !== null && lastRestNotifyId !== id) {
    await cancelRest()
  }

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: '休息结束',
          body: '该下一组了',
          channelId: CHANNEL_ID,
          // 点一下就从通知栏消失，不留残影
          autoCancel: true,
          schedule: {
            at: new Date(endsAt),
            // ★这句是"手机塞在包里也叫得醒"的关键：
            //   它让系统用 setExactAndAllowWhileIdle，会把睡着的手机唤醒。
            //   不加的话，手机进了"省电休眠"，通知可能被推迟几分钟才响。
            allowWhileIdle: true,
          },
        },
      ],
    })
    // 预约成功了才记下来 —— 失败了就没什么可撤的
    lastRestNotifyId = id
    // 同一时刻记下"这次休息交给系统了"。到点时若人还在后台，
    // 它会响；那时应用内就不该再补一声（见 claimRestAlertOnce）。
    notifiedEndsAt = endsAt
  } catch {
    // 通知权限被系统关掉了 —— 插件的 schedule() 会直接报错
    // （源码里写死了 "Notifications not enabled on this device"）。
    //
    // 吞掉，绝不能让"提醒发不出去"连累到训练记录这件事。
    // 顺手把状态改成"没权限"，界面会跟着变成"点这里开启"。
    granted = false
    emitStatus()
  }
}

async function cancelRest(): Promise<void> {
  // 先把号取走再清空 —— 万一下面抛错，也不会留下一个"其实已经撤了"的号
  const id = lastRestNotifyId
  lastRestNotifyId = null

  // ★ 撤掉的是一条【还没到点】的通知 → 它根本没响过 → "系统已经管过这次"
  //   这个标记必须跟着作废，否则到点会两头都不响（应用内被 claim 拦住，
  //   系统那条又已经撤了）—— 一声都没有。
  //
  // 【什么时候会走到这里】最常见的是"切出去瞄一眼又切回来"：
  //   人一回前台，syncRestNotify() 就判定不该有系统通知，把它撤掉。
  //   这时离结束还有一会儿，所以 endsAt 在未来 → 作废 → 到点照样响。
  //
  // 【什么时候不作废】人一直在后台、到点听过通知之后再回来：
  //   这时 endsAt 已经过去（Date.now() >= notifiedEndsAt）→ 保留标记 →
  //   回来时应用内就安静了。这正是这次要修的重复提醒。
  if (notifiedEndsAt !== null && Date.now() < notifiedEndsAt) {
    notifiedEndsAt = null
  }

  try {
    // ① 取消"还没到点"的那条。
    //    ★ 必须按【记下来的那个号】撤，不能写死一个数字 ——
    //      每条休息提醒的号都不一样了（理由见上面 restNotifyIdFor 那段）。
    if (id !== null) {
      await LocalNotifications.cancel({ notifications: [{ id }] })
    }
    // ② 把"已经显示在通知栏上"的那条也擦掉。
    //    少了这步，你回到 App 之后通知栏里那个"休息结束"还挂在那儿。
    await LocalNotifications.removeAllDeliveredNotifications()
  } catch {
    // 什么都没预约过的时候取消是正常的，不是错误，吞掉
  }
}

// 建通知渠道。
//
// 【渠道是什么】
// 安卓 8 起，每条通知都必须属于一个"渠道"。渠道决定了这条通知
// 重不重要、响不响、震不震、锁屏上显不显示 —— 而且这些是【用户可以在
// 系统设置里自己改的】。这是安卓把控制权交给用户的设计。
async function createChannel(): Promise<void> {
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: '组间休息',
      description: '组间休息结束时提醒你',
      // 4 = HIGH。★必须是 4：
      //   设低了（3 或以下）就没有横幅弹出、也没声音，等于白提醒。
      //
      // ⚠️ 渠道的"重要性"一旦建好就【改不了】—— 安卓的限制，不是我们的毛病。
      //    以后就算把这里的数字改大，已经装过 App 的手机也不会生效
      //    （除非卸载重装，或者用户自己去系统设置里改）。
      //    所以第一次就得是对的。
      importance: 4,
      // 1 = PUBLIC：锁屏上也看得见内容。
      // 组间休息本来就该在锁屏上一眼看到，藏起来没意义。
      visibility: 1,
      vibration: true,
      // 【故意不传 sound】
      // 不传 = 用手机自己的默认通知音。
      // （依据：安卓源码 NotificationChannel 里 mSound 的初值就是
      //   系统默认通知音，插件没传声音时就不会覆盖它。）
      // 传了反而麻烦：插件只认放在 App 里的音频文件，找不到就没声音了。
    })
  } catch {
    // 安卓 7 上根本没有"渠道"这个东西，插件会直接拒绝。吞掉。
    // （安卓 7 的通知照样能发，只是没有渠道这一层，用系统的默认设置。）
  }
}

// ============================================================
// 四、权限
// ============================================================

async function readPermission(): Promise<void> {
  try {
    const res = await LocalNotifications.checkPermissions()
    display = res.display
    // 只有 granted 才算能用。
    // （display 四种取值的含义见文件上面那段的注释。）
    granted = display === 'granted'
  } catch {
    granted = false
  }
}

async function readExactAlarm(): Promise<void> {
  try {
    const res = await LocalNotifications.checkExactNotificationSetting()
    exact = res.exact_alarm === 'granted'
  } catch {
    // 安卓 12 以下这个方法会直接返回 granted，不会抛错；
    // 真抛错了就按"没有"处理 —— 界面会提示，比假装有强。
    exact = false
  }
}

// 重新查一遍权限，然后重新判断。
//
// 【为什么每次回到前台都要查】
// 1. 你可能刚去系统设置里改过通知权限
// 2. 撤销"精确闹钟"权限时，安卓会【重启这个 App】并【清空所有已预约的
//    精确闹钟】；换手机、从备份恢复时这个权限也会变回拒绝
// 所以不能假设它一直在。
export async function refreshRestNotify(): Promise<RestNotifyStatus> {
  if (!isNative) return getRestNotifyStatus()

  await readPermission()
  await readExactAlarm()
  emitStatus()
  syncRestNotify()
  return getRestNotifyStatus()
}

// 申请通知权限（会弹出系统那个"允许通知吗"的框）。
//
// 【为什么不在 App 一启动就申请】
// 安卓上拒绝过之后系统就不再弹框了，第一次机会很宝贵 ——
// 要挑用户"刚好需要它"的那一刻问（第一次开始组间休息时）。
// 那一刻的决定写在界面里（RestTimer / 设置页），这里只管弹框。
export async function requestRestNotify(): Promise<RestNotifyStatus> {
  if (!isNative) return getRestNotifyStatus()

  try {
    await LocalNotifications.requestPermissions()
  } catch {
    // 安卓 13 以下没有这个弹框，插件会直接返回，不算错误
  }
  return refreshRestNotify()
}

// 跳到系统的「闹钟和提醒」设置页，让用户自己打开精确闹钟权限。
//
// 【为什么不让 App 自己开】
// 这个权限安卓不允许 App 自己申请，只能用户手动开 —— 这是设计如此。
// 所以我们只能把他送到那个页面，开不开由他决定。
export async function openExactAlarmSetting(): Promise<void> {
  if (!isNative) return

  try {
    await LocalNotifications.changeExactNotificationSetting()
  } catch {
    // 用户没开就返回了、或者安卓版本根本不支持，都无所谓
  }
  // 回来之后再查一遍：他可能刚打开，也可能什么都没动
  void refreshRestNotify()
}

// 第一次开始组间休息时问一句"要不要开后台提醒"。
//
// 【为什么不放在 App 启动时】
// 安卓上拒绝过之后系统就不再弹框了，第一次机会很宝贵 ——
// 要挑用户"刚好需要它"的那一刻问。点完 ✓ 开始休息，90 秒后就要响了，
// 这时候解释"想让它在后台也叫醒你吗"，是最说得通的。
//
// 【为什么这一步值得单独写一个函数】
// 它串了三件事：应用内说明 → 系统通知权限框 → 系统「闹钟和提醒」页。
// 中间任何一步用户不配合就停下，不再往下追问。写在一处才看得清这个链条。
export async function askRestNotifyFirstTime(): Promise<void> {
  // 已经能用了、或者这次打开已经问过、或者拒绝了 → 什么都不做。
  // 界面上那行"点这里开启"一直在，他想开随时能开。
  if (!isNative || granted || askedThisRun || display === 'denied') return
  askedThisRun = true

  const wants = window.confirm(
    '想让倒计时在后台也叫醒你吗？\n\n' +
      '允许之后，组间休息到点时就算你切到别的 App 或者锁屏了，' +
      '手机也会响。\n\n' +
      '不开启也不影响记录训练，只是切走之后就不会提醒你了。',
  )
  if (!wants) return

  // ---------- 第一关：通知权限 ----------
  const after = await requestRestNotify()
  if (!after.granted) return

  // ---------- 第二关：精确闹钟 ----------
  // 没这个权限，通知会晚几秒到几十秒才响。
  // 这个权限安卓不允许 App 自己开，只能把他送到系统设置页，开不开由他决定。
  if (after.exact) return
  const goSetting = window.confirm(
    '还差最后一步。\n\n' +
      '手机的「闹钟和提醒」权限没打开，提醒会晚几秒才响。\n\n' +
      '点"确定"跳到系统设置，找到本应用并打开它。',
  )
  if (goSetting) await openExactAlarmSetting()
}

// ============================================================
// 五、启动 + 前后台
// ============================================================

// App 启动时调一次（在 main.tsx 里，必须在读盘之后 ——
// 早于读盘的话 readActiveWorkout() 拿到的是空的）。
export function initRestNotify(): void {
  if (!isNative || started) return
  started = true

  void (async () => {
    await createChannel()
    // 建好新的之后，才去删旧的那条（顺序不能反，理由见 removeLegacyChannel）
    await removeLegacyChannel()
    await readPermission()
    await readExactAlarm()
    emitStatus()
    syncRestNotify()
  })()

  // 切后台 / 回前台 / 锁屏 / 解锁。
  //
  // 【这个信号从哪来】
  // 安卓的 onStop()（切到别的 App、按 Home、按电源键锁屏都会触发），
  // 回来时是 onResume()。Capacitor 把它转发成 appStateChange。
  //
  // 【为什么 JS 这时候还能跑】
  // 去看过 Capacitor 的源码了：它切后台时【不会】冻结 WebView
  // （Bridge.onPause() 只是通知各个插件）。所以这里调 schedule() 来得及。
  // 会冻结的是网页自己的定时器 —— 而倒计时那套本来就只把定时器当
  // "刷新画面"用，真正的判断靠 endsAt 时间戳，所以不受影响。
  void App.addListener('appStateChange', ({ isActive }) => {
    appActive = isActive
    // 先立刻按新的前后台状态判断一次（切后台就该预约、回前台就该取消）
    syncRestNotify()
    // 回前台时还要重查权限：用户很可能刚在系统设置里改过东西
    if (isActive) void refreshRestNotify()
  })

  // 用户点了通知栏那条提醒
  void LocalNotifications.addListener('localNotificationActionPerformed', () => {
    if (tapListeners.size === 0) {
      // 页面还没挂上，先记着
      pendingTap = true
      return
    }
    for (const cb of tapListeners) cb()
  })
}

// ============================================================
// 六、设置页那个「试一下」
// ============================================================

// 5 秒后发一条测试通知。返回 false 表示根本没发出去（多半是没权限）。
//
// 【它测得到什么】
// 权限、渠道、声音、震动、横幅、点一下能不能回到 App —— 全都能测。
// 【它测不到什么】
// "切后台时预约"这条路要真训练一次才知道（因为这里 App 还在前台）。
export async function sendTestNotification(): Promise<boolean> {
  if (!isNative) return false

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: TEST_NOTIFY_ID_BASE + (Date.now() % TEST_NOTIFY_ID_MOD),
          title: '休息结束',
          body: '该下一组了（这是一条测试提醒）',
          channelId: CHANNEL_ID,
          autoCancel: true,
          schedule: {
            at: new Date(Date.now() + TEST_DELAY_MS),
            allowWhileIdle: true,
          },
        },
      ],
    })
    return true
  } catch {
    granted = false
    emitStatus()
    return false
  }
}

// ============================================================
// 七、清理：把以前那条没人用的旧渠道删掉（2026-09-26 加）
// ============================================================
//
// 换渠道编号时留下的：旧渠道 'rest-timer' 已经没有任何通知会用到它，
// 但它会一直挂在系统的通知设置里（安卓不允许改渠道，只能由 App 主动删）。
// 留着会让人看到两条名字一样、都叫「组间休息」的渠道，不知道该看哪条。
//
// ★ 只在【新渠道确实建好了】的前提下才删旧的。
//   万一新渠道没建起来、旧渠道又被删了，通知就无处可去 ——
//   安卓 8 起，"渠道不存在"的通知会被系统直接丢掉，等于提醒彻底失效。
//   所以先确认新的在，再动旧的。
//
// 删不掉（本来就没有、或者安卓 7 压根没渠道这一层）都是正常的，吞掉。
async function removeLegacyChannel(): Promise<void> {
  try {
    const res = await LocalNotifications.listChannels()
    const ids = res.channels.map((c) => c.id)
    if (!ids.includes(CHANNEL_ID)) return // ★ 新的不在，绝不删旧的
    if (!ids.includes(LEGACY_CHANNEL_ID)) return // 早就没了，不用管
    await LocalNotifications.deleteChannel({ id: LEGACY_CHANNEL_ID })
  } catch {
    // 安卓 7 上没有渠道这一层，插件会直接拒绝。吞掉。
  }
}
