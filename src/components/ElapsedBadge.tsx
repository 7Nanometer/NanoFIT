import { useEffect, useState } from 'react'
import { formatClock } from '../lib/calc'
import { parseISO } from '../lib/date'
import { ReadoutCell } from './Readout'

// ============================================================
// "已练多久" —— 仪表读数条上的一格
// ============================================================
//
// 【它是干什么的】
// 训练页顶部跟着时间走的一个数。作用有两个：
//   1. 让用户知道"系统在记" —— 不然时长到底记没记、记的是哪一段，
//      用户完全看不到
//   2. 让用户心里有数"今天练多久了"
//
// 【★ 为什么定时器放在这个组件**里面**】
// 它每 5 秒要重算一次。如果把这个状态放到训练页上，每 5 秒整个训练页
// 都会重画一遍 —— 而那一页可能有几十张动作卡片、一长串组记录。
// 状态放在这个小零件里，重画的就只有这一格。
//
// 【为什么是 5 秒一次】
// 显示的是分钟，5 秒的误差肉眼看不出来，但比 1 秒一次省得多。
//
// 【★ 超时（练完忘了点结束）的时候怎么办】
// 那时候显示的**不是**"开始到现在"，而是"开始 → 最后一组" ——
// 也就是最后真会存进去的那个数。不然用户会看到"已练 72 小时"，
// 而实际上存进去的是 52 分钟，两个数对不上更让人糊涂。
// 这种情况也不需要每 5 秒重算了（那个数定死了），所以干脆不装定时器。
//
// 【为什么显示成 42:18 而不是"42 分钟"】
// 见 lib/calc.ts 里 formatClock 那段说明。
// ============================================================

// 多久重算一次（毫秒）
const TICK_MS = 5000

type Props = {
  // 训练的 ISO 开始时刻
  startedAt: string
  // 这场训练是不是"练完忘了点结束"了（见 lib/kcal.ts 的 isStaleSession）。
  // 是的话结束时刻改用最后一组，不按"现在"算。
  stale: boolean
  // 最后一组的完成时刻。只有在 stale 为 true 且它有值时才用得上
  lastSetISO?: string | undefined
}

export function ElapsedBadge({ startedAt, stale, lastSetISO }: Props) {
  // 现在的时刻。用惰性初始化只在挂载时读一次表。
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // 超时的话那个数是不变的（开始 → 最后一组），没必要每 5 秒重算。
    // 这一句同时把"组件卸载时清理定时器"那件事也管住了（提前 return undefined）。
    if (stale) return
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [stale])

  const startMs = parseISO(startedAt)
  if (Number.isNaN(startMs)) return null

  const useLastSet = stale && lastSetISO !== undefined
  const endMs = useLastSet ? parseISO(lastSetISO) : now
  if (Number.isNaN(endMs)) return null

  // 负数说明手机时间被改过，按 0 显示，不显示"-3 分钟"
  const sec = Math.max(0, Math.round((endMs - startMs) / 1000))

  return (
    <ReadoutCell
      // 超时的时候标签要变，不然用户会觉得"我明明练了很久，怎么才 52 分钟"。
      // 标签位置写不下整句解释，所以压成"末组"两个字 ——
      // 详细的解释在训练页那条橙色警告里（那段一直都有，没动过）。
      label={useLastSet ? '已练·按末组' : '已练'}
      value={formatClock(sec)}
      // 正在走的时候用主色标出来 —— 这一格是全页唯一"活着"的数字，
      // 颜色让它和其他只读读数区分开（一眼看出"这是在计时"）。
      accent={!useLastSet}
    />
  )
}
