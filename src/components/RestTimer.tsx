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

type Props = {
  endsAt: number // 休息结束的时间点（毫秒时间戳）
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

  // ---------- 休息结束的样子 ----------
  // 故意不自动消失，要等用户点一下。
  // 因为用户可能正在专心做别的事，界面突然变回去他会以为没休息够。
  if (finished) {
    return (
      <button
        type="button"
        onClick={onClose}
        className="mb-3 w-full rounded-xl bg-brand p-4 text-center text-on-brand"
      >
        <div className="text-lg font-bold">休息结束</div>
        <div className="mt-1 text-sm opacity-80">点一下继续</div>
      </button>
    )
  }

  // ---------- 正在倒计时的样子 ----------
  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <div className="flex-1">
        <div className="text-xs text-muted">休息中</div>
        {/* tabular-nums 让每个数字宽度一样，倒数时不会左右抖动 */}
        <div className="text-2xl font-bold tabular-nums text-ink">
          {formatSec(remain)}
        </div>
        {/* 这行字有两种形态：
            能点的（还没授权，点一下去开）和普通的（已经好了，或者网页版）。
            能点的那种用主色写，让人看得出"这里有东西可以按"。 */}
        {onEnableNotify !== undefined ? (
          <button
            type="button"
            onClick={onEnableNotify}
            className="mt-1 text-left text-xs text-brand underline"
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
        className="min-h-11 shrink-0 rounded-lg border border-line px-4 text-sm text-ink-2"
      >
        跳过
      </button>
    </div>
  )
}

// 把秒数写成 1:30 这种样子
function formatSec(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
