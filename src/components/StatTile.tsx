// ============================================================
// 顶部的大数字块
// ============================================================
// 统计页最上面那一排：一个大数字 + 一句说明。
// 单独写成组件，是因为它要出现好几次，样式必须长得一模一样。
//
// tabular-nums 的作用：让每个数字占的宽度一样。
// 不写的话，数字变化时整块会左右抖动一下。
// ============================================================

type Props = {
  label: string // 小字：这个数字是什么
  value: string // 大字：数字本身（已经格式化好的文字）
  hint?: string // 更小的字：补充说明
}

export function StatTile({ label, value, hint }: Props) {
  return (
    <div className="flex-1 card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-ink">
        {value}
      </div>
      {hint !== undefined && hint !== '' && (
        <div className="mt-0.5 text-xs text-muted">{hint}</div>
      )}
    </div>
  )
}
