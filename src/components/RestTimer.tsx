import { useEffect, useState } from 'react'
import { beep, vibrate } from '../lib/beep'
import { claimRestAlertOnce } from '../lib/restnotify'
import { setKeepAwake } from '../lib/wakelock'

// ============================================================
// 组间休息倒计时
// ============================================================
//
// 【这个组件最要紧的设计：只记"休息到几点结束"，不记"还剩几秒"】
//
// 手机有个省电机制：你切到别的 App 或锁屏时，浏览器会被"降频"——
// 定时器从每 0.25 秒一次变成一分钟一次，甚至完全冻住。
//
// 如果按"每秒把剩余秒数减 1"来写，锁屏 10 分钟回来会发现还剩 80 秒，
// 因为它根本没减几次。
//
// 所以这里反过来做：
//   开始时记下"休息到几点结束"（一个时间点，比如 14:32:10）
//   每隔 0.25 秒只是"看一眼现在离那个时间点还有多久"
// 这样即使定时器被冻住，算出来的数字永远是对的；
// 从后台切回来的瞬间，它会立刻补上冻结期间那一段。
// ============================================================

// 圆环的半径（和下面 svg 里那句 r="38" 是同一个数）。
// 抽成常量是因为它要用在两处：画圆的那两行，和算周长这一行。
// 两处各写一个 38，改了一处忘了另一处，环就会画歪。
const RING_RADIUS = 38

// 圆环的周长 = 2 × π × 半径。
// 【为什么需要它】SVG 画弧线不是按"度数"而是按"长度"说话的：
// strokeDasharray 是"把圆周切成这么长一段一段"，
// strokeDashoffset 是"把这一串段整体推多远"。
// 两者配合，推出去多少就露出多少 —— 这就是把圆按比例涂满的标准做法。
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

type Props = {
  endsAt: number // 休息结束的时间点（毫秒时间戳）
  // 这次休息一共多少秒（设置里那个"组间休息"的值）。
  // 【为什么需要它】光有"还剩几秒"画不出进度环 ——
  // 环的缺口要按"已经过去了多少比例"来画，没有总时长就不知道分母是多少。
  totalSec: number
  onClose: () => void // 用户点"跳过"或点掉"休息结束"时通知外面
  // 倒计时下面那行小字，比如"切到别的 App、锁屏，到点都会提醒你"。
  // ★ 这行字现在是【真的会变】的：以前写的是"切走了手机就不会提醒你"，
  //   那是当时的事实；现在装了系统通知，切走照样会响，那句话就成了假话。
  //   所以交给外面（TrainScreen）算好再传进来 —— 它知道权限到底有没有。
  notifyHint: string
  // 传了这行字就变成可点的（用在"还没授权，点这里开启"那一档）。
  // 不传就是一行普通说明文字。
  onEnableNotify?: (() => void) | undefined
}

export function RestTimer({
  endsAt,
  totalSec,
  onClose,
  notifyHint,
  onEnableNotify,
}: Props) {
  // 剩余秒数。注意它只是个"算出来的结果"，随时可以从 endsAt 重新算一遍。
  const [remain, setRemain] = useState(() =>
    Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)),
  )

  useEffect(() => {
    function tick() {
      setRemain(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
    }

    tick() // 立刻先算一次，不用干等 0.25 秒

    // setInterval 在这里只当"刷新闹钟"用。它被降频也不影响算出来的数字。
    const timer = setInterval(tick, 250)

    // 从后台切回前台时，立刻补算一次。
    //
    // 【为什么这里不判断"页面是否隐藏"】
    // 有些浏览器触发这个事件时，"页面是否隐藏"这个标记还没更新完，
    // 判断它反而会把本该执行的补算挡在门外 —— 那正是"切回来还在倒数"的原因。
    // 而 tick() 本身是安全的（它只是照着结束时间重算一遍），多调用几次没有副作用。
    function onReturn() {
      tick()
    }
    document.addEventListener('visibilitychange', onReturn)
    // focus 是另一条"你回来了"的信号。
    // 不同浏览器对这两件事的触发时机不一样，两个都听，谁先到算谁的。
    window.addEventListener('focus', onReturn)

    return () => {
      // ★这两句必须有，别忘了！
      // 如果不清掉，每重画一次就多一个定时器，
      // 界面上会看到数字一秒跳好几下 —— 看着像计时器坏了，其实是没清理。
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [endsAt])

  // 休息期间让手机屏幕别自动熄灭。
  // 【注意】这个功能浏览器要求 https 才能用 —— 你现在手机上连的是局域网 http 地址，
  // 所以暂时不生效；等阶段 6 部署到 https 之后它就会自动开始工作。
  useEffect(() => {
    setKeepAwake(true)
    return () => setKeepAwake(false)
  }, [])

  const finished = remain <= 0

  // 归零时响一声 + 震一下。
  // finished 从 false 变成 true 时才会触发这一次（之后不再重复响）。
  //
  // ★ 但【归零】不等于【该我们响】—— 这条倒计时被冻住过的话，
  //   归零的那一刻你可能正在微信里，系统通知已经替你响过一遍了。
  //   所以先问 restnotify 那边一句：这次该不该由应用内来响？
  //   （它记得"系统预约过哪一次""应用内已经响过哪一次"，
  //     判断和理由都在那边，这里只负责响。）
  //   返回 false 的两种情况：系统在后台已经响过；应用内已经响过一遍了。
  //   没有那条系统通知时（网页版、没给权限）它一律返回 true ——
  //   前台该响的照响，不会因为这次改动变哑。
  useEffect(() => {
    if (!finished) return
    if (!claimRestAlertOnce(endsAt)) return
    beep()
    vibrate()
  }, [finished, endsAt])

  // ---------- 进度环要用的几个数 ----------
  //
  // 【这个环画的是"还剩多少"还是"过去多少"】
  // 画的是**还剩多少**：一开始是完整一圈，随着休息进行慢慢漏掉。
  //
  // 为什么不用"填满"（很多 App 的进度条是那样）：
  // 中间那个数字是倒着走的（1:30 → 0:00），环要是正着涨，
  // 两个东西的方向就反了 —— 一个在减、一个在增，看着费脑子。
  // 环跟着一起漏，才是同一个意思说两遍：**休息在变少**。
  //
  // 【为什么要用 Math.max / Math.min 兜一圈】
  // 两个边界情况都会让环画错：
  //   · totalSec 万一被设成 0（设置里理论上不该出现，但不写就除零了）
  //   · 从后台切回来的瞬间 remain 可能比 totalSec 还大
  //     （你在休息中途去设置里把休息时长从 180 秒改成了 60 秒）
  // 夹在 0～1 之间，两种情况都只是"环的样子略有偏差"，不会画出鬼东西。
  const total = Math.max(1, totalSec)
  const elapsed = Math.min(1, Math.max(0, (total - remain) / total))
  const leftRatio = 1 - elapsed

  // 剩最后 10 秒时整块换成主色。
  // 【为什么用颜色而不是数字变红、闪动之类】
  // 这一块的信息量本来就很小（就一个数），再加闪动会变吵。
  // 颜色一换就够了：橙红在这套配色里是"该你动手了"的意思，
  // 最后 10 秒正好就是"该回去握住杠铃了"。
  const urgent = remain <= 10

  // ---------- 休息结束的样子 ----------
  // 故意不自动消失，要等用户点一下。
  // 因为用户可能正在专心做别的事，界面突然变回去他会以为没休息够。
  if (finished) {
    return (
      <button
        type="button"
        onClick={onClose}
        className="press animate-beat mb-3 w-full rounded-xl bg-brand p-4 text-center text-on-brand shadow-[var(--elev-brand)]"
      >
        <div className="text-lg font-bold">休息结束</div>
        <div className="mt-1 text-sm opacity-80">点一下继续</div>
      </button>
    )
  }

  // ---------- 正在倒计时的样子 ----------
  // 造型是一块仪表：左边一个圆环表盘，右边是说明文字，最右边"跳过"。
  // 以前它只是两行小字加一个数字，是全屏最不打眼的位置 ——
  // 可它偏偏是你组间唯一盯着看的东西。
  return (
    // 【为什么要给这圈边框单独上色】
    // 它和下面的动作卡片用的是同一个 .card，长得一模一样 ——
    // 可它俩根本不是一类东西：动作卡是"已经记下的内容"（静的），
    // 这一块是"正在走的状态"（活的）。
    // 用青色描边把它标出来，眼睛一眼就知道该看哪儿。
    // 最后 10 秒跟着整块变成橙红 —— 边框和数字一起变色，
    // 不会出现"数字变橙了、边框还是青的"这种半吊子状态。
    <div
      className={`card animate-rise mb-3 p-3.5 transition-colors duration-300 ${
        urgent ? 'border-brand/45' : 'border-cyan/30'
      }`}
    >
      <div className="flex items-center gap-3.5">
        {/* ---------- 圆环表盘 ---------- */}
        <div className="relative grid h-[88px] w-[88px] shrink-0 place-items-center">
          {/* -rotate-90：让环从"12 点钟方向"开始填，而不是从 3 点方向。
              这是所有仪表和秒表的共同约定，不这么转看着就不对劲。
              注意它只转这个 svg，不转外面的数字 —— 数字是它的兄弟节点。 */}
          <svg
            viewBox="0 0 88 88"
            className="absolute inset-0 -rotate-90"
            aria-hidden="true"
          >
            {/* 底下那圈轨道：永远完整，表示"一共多长" */}
            <circle
              cx="44"
              cy="44"
              r="38"
              fill="none"
              stroke="var(--color-line)"
              strokeWidth="6"
            />
            {/* 上面那圈进度：从 0 画到 100% */}
            <circle
              cx="44"
              cy="44"
              r="38"
              fill="none"
              stroke={urgent ? 'var(--color-brand)' : 'var(--color-cyan)'}
              strokeWidth="6"
              strokeLinecap="round"
              // strokeDasharray = "把圆周切成这么长的小段"；
              // strokeDashoffset = "把这些段整体推移多少"。
              // 两个配合起来，就是把圆弧按比例"涂满"的标准做法。
              strokeDasharray={CIRCUMFERENCE}
              // offset = 周长 × (1 − 要露出来的比例)。
              // 露出来的是"还剩"那一份，所以传进去的是 leftRatio。
              strokeDashoffset={CIRCUMFERENCE * (1 - leftRatio)}
              // 【这个 transition 是让环"走"起来的关键】
              // 剩余秒数每 0.25 秒才重算一次，不加过渡的话环是每 0.25 秒
              // "跳一格"，看着像一卡一卡的。linear（匀速）是因为真实的
              // 时间流逝就是匀速的，这里用缓动反而会显得假。
              className="transition-[stroke-dashoffset] duration-[250ms] ease-linear"
            />
          </svg>

          {/* 环里那个数 */}
          <div
            className={`t-num text-2xl font-bold leading-none transition-colors duration-300 ${
              urgent ? 'text-brand' : 'text-ink'
            }`}
          >
            {formatSec(remain)}
          </div>
        </div>

        {/* ---------- 说明文字 ---------- */}
        <div className="min-w-0 flex-1">
          {/* 【这一行为什么不和下面的提示一样大】
              以前它俩都是 12px 灰色，等于没有主次 ——
              可"休息中"是这张卡的标题（告诉你这个数字是什么），
              下面那行只是附注。标题必须比附注重，哪怕只重一点点。
              所以这里升一档：13px、中等粗细、颜色也更实。 */}
          <div className="text-sm font-medium text-ink-2">休息中</div>
          {/* 这行字有两种形态：
              能点的（还没授权，点一下去开）和普通的（已经好了，或者网页版）。
              能点的那种用主色写，让人看得出"这里有东西可以按"。 */}
          {onEnableNotify !== undefined ? (
            <button
              type="button"
              onClick={onEnableNotify}
              className="mt-1 block text-left text-xs text-brand underline"
            >
              {notifyHint}
            </button>
          ) : (
            <div className="mt-1 text-xs text-muted">{notifyHint}</div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="press min-h-11 shrink-0 rounded-lg border border-line-2 px-4 text-sm text-ink-2"
        >
          跳过
        </button>
      </div>
    </div>
  )
}

// 把秒数写成 1:30 这种样子
function formatSec(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
