import { useState } from 'react'
import { formatTimeCN, parseISO } from '../lib/date'

// ============================================================
// 修正"这次训练是从几点开始的"
// ============================================================
//
// 【为什么需要它】
// 开始时间是"你第一次在 App 里加动作"那一刻自动记下来的。
// 但你会先热身 —— 热身也是训练的一部分（热量公式要的就是这段时间的
// 活动强度），可 App 没法知道你是几点开始热身的，它只知道你几点掏的手机。
//
// 所以：**让用户自己改**。App 猜不到的事，就别猜，交给人。
//
// 【为什么不干脆加个"开始计时"按钮让人手动点一下】
// 手动点的问题是**会忘**，而忘了的代价是"这次训练压根没开始计时"。
// 自动开始最多是"早了或晚了十几分钟"，而那时候人本来就要操作 App
// （点"结束训练"），顺手改一下最省事，也不会忘。
// 用"可修正"补自动开始的短板，而不是用"必须手动点"替代它。
//
// 【为什么日期不给改，只能改几点几分】
// 跨天时的歧义说不清楚（你说"14:00"，是今天的还是昨天的？），
// 而热身要补的那点时间本来也就是几十分钟。
// 所以手填的时间一律**解释成"和当前开始时间同一天的那个时刻"**，
// 界面上也把这句话写出来，免得用户以为改了日期。
// ============================================================

// 快捷往前推的几档。热身一般十几二十分钟，所以 10/20/30 是主力，
// 1 小时那档留给"慢跑热身 + 拉伸"这种。
const QUICK_MINUTES = [10, 20, 30, 60]

type Props = {
  // 当前的开始时刻（ISO）
  startedAt: string
  // 最晚允许的开始时刻。
  // 不能晚于"第一组的完成时间"（开始时间跑到第一组后面就说不通了），
  // 也不能晚于"点结束训练那一刻"。undefined = 不做这个检查。
  latestStartISO?: string | undefined
  onChangeStart: (iso: string) => void
}

export function StartTimeEditor({
  startedAt,
  latestStartISO,
  onChangeStart,
}: Props) {
  const [open, setOpen] = useState(false)
  // 手填那个框里的字。初值是当前开始时间，打开就看得见现在是多少
  const [manualText, setManualText] = useState(() => formatTimeCN(startedAt))
  // 夹住的时候要说一句为什么，不然用户会以为输入框坏了
  const [hint, setHint] = useState('')

  // 夹取 + 上报。所有改动都走这一个出口
  function apply(iso: string) {
    const ms = parseISO(iso)
    if (Number.isNaN(ms)) return

    if (latestStartISO !== undefined) {
      const cap = parseISO(latestStartISO)
      if (!Number.isNaN(cap) && ms > cap) {
        setHint('不能再晚了 —— 开始时间不能晚于第一组')
        setManualText(formatTimeCN(latestStartISO))
        onChangeStart(latestStartISO)
        return
      }
    }

    setHint('')
    setManualText(formatTimeCN(iso))
    onChangeStart(iso)
  }

  // 往前推 N 分钟
  function shiftEarlier(minutes: number) {
    const ms = parseISO(startedAt)
    if (Number.isNaN(ms)) return
    apply(new Date(ms - minutes * 60000).toISOString())
  }

  // 手填一个时刻。★ 日期不变，只用它的时和分。
  function applyManual(text: string) {
    setManualText(text)
    const [h, m] = text.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return

    const base = new Date(parseISO(startedAt))
    if (Number.isNaN(base.getTime())) return
    base.setHours(h, m, 0, 0)
    apply(base.toISOString())
  }

  return (
    <div className="mt-1">
      {/* ---------- 收起时的样子：一行字，点一下展开 ---------- */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-left text-xs text-ink-2 underline decoration-line"
      >
        开始于 {formatTimeCN(startedAt)}
        {open ? '（收起）' : ' · 热身了多久？点这里往回改'}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-line-2 p-2">
          <div className="flex flex-wrap gap-2">
            {QUICK_MINUTES.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => shiftEarlier(min)}
                className="press inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line-2 px-3 text-sm text-ink-2"
              >
                提前 {min === 60 ? '1 小时' : `${min} 分钟`}
              </button>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted">或者直接改</span>
            <input
              type="time"
              value={manualText}
              onChange={(e) => applyManual(e.target.value)}
              className="min-h-11 rounded-lg border border-line-2 bg-surface-2 px-3 text-sm text-ink outline-none transition duration-150 ease-mech focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
          </div>

          {/* 日期不改这件事必须说 —— 不然用户会以为连日期一起改了 */}
          <p className="mt-1 text-xs text-muted">
            日期不变，只改几点几分。热身多久，往前推多少就行。
          </p>
          {hint !== '' && <p className="mt-1 text-xs text-brand">{hint}</p>}
        </div>
      )}
    </div>
  )
}
