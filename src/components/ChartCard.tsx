import { useState } from 'react'
import type { ReactNode } from 'react'

// ============================================================
// 图表卡片的外壳
// ============================================================
// 每张图都用它包一层：上面是标题，中间是图，右上角一个"看数字"开关。
//
// 【为什么要有"看数字"这个开关】
// 图表有两类人用不了：
//   1. 分不清颜色的人（红绿难辨的用户，靠颜色区分曲线等于看一团糊）
//   2. 用屏幕阅读器的人（读屏软件念不出一条折线的高低起伏）
// 提供一份"同样数据的文字版"，信息就传达到了。
//
// 手机上它还有第三个用处：图太小看不清时，直接看数字更准。
// ============================================================

type Column = {
  key: string
  label: string
}

type Props = {
  title: string
  subtitle?: string
  children: ReactNode // 图表本体
  rows?: Record<string, string | number>[] // "看数字"时的数据
  columns?: Column[] // "看数字"时的表头
}

export function ChartCard({ title, subtitle, children, rows, columns }: Props) {
  const [showNumbers, setShowNumbers] = useState(false)

  const canToggle =
    rows !== undefined && columns !== undefined && rows.length > 0
  const numbersMode = showNumbers && canToggle

  return (
    <div className="mb-3 card p-3.5">
      <div className="mb-2.5 flex items-start gap-2">
        <div className="flex-1">
          {/* 标题升到 text-base（15px）半粗 —— 它是这张图的"名字"，
              要和下面的说明文字（12px 灰色）拉开。
              小一号的标题配一大段说明，读起来会像"全是正文"。 */}
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          {subtitle !== undefined && (
            <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
          )}
        </div>
        {canToggle && (
          <button
            type="button"
            onClick={() => setShowNumbers(!showNumbers)}
            // 这个按钮从 min-h-9（36px）提到 min-h-11（44px）——
            // 36px 低于项目铁律里"手指点得准的最小尺寸"那条线，
            // 而这个按钮正好在卡片右上角，单手拿着手机时正是最难够的地方。
            className="press min-h-11 shrink-0 rounded-lg border border-line-2 px-3 text-xs text-ink-2"
          >
            {numbersMode ? '看图' : '看数字'}
          </button>
        )}
      </div>

      {numbersMode && rows !== undefined && columns !== undefined ? (
        <div className="max-h-[220px] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                {columns.map((col) => (
                  <th key={col.key} className="py-1 pr-3 font-normal">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t border-line">
                  {columns.map((col) => (
                    <td key={col.key} className="py-1 pr-3 text-ink">
                      {row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // ★★★ 这个 div 的固定高度不能删！ ★★★
        // recharts 是"看菜下饭"的：它去问外层容器有多高，然后照着画。
        // 如果外层没有确定的高度（比如只是随内容自动撑开），它量出来是 0，
        // 画出来的图就是一片空白 —— 而且不报任何错，极难排查。
        <div className="h-[200px] w-full">{children}</div>
      )}
    </div>
  )
}
