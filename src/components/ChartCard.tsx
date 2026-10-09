import { useState } from 'react'
import type { ReactNode } from 'react'

// ============================================================
// 图表块的外壳
// ============================================================
// 每张图都用它包一层：上面是标题和一行动说明，中间是图，右上角一个"看数字"开关。
//
// 【为什么要有"看数字"这个开关】
// 图表有两类人用不了：
//   1. 分不清颜色的人（红绿难辨的用户，靠颜色区分曲线等于看一团糊）
//   2. 用屏幕阅读器的人（读屏软件念不出一条折线的高低起伏）
// 提供一份"同样数据的文字版"，信息就传达到了。
//
// 手机上它还有第三个用处：图太小看不清时，直接看数字更准。
//
// 【这一轮从"一张卡"改成了"账本的一块"】
// 一页上叠着七八张带圆角和投影的卡片，看着像一堆贴纸。
// 改成账本之后：圆角更小、没有投影、标题和图表之间一条细线分开，
// 整页变成"一份连续的报告"，一块接一块往下排。
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
    <div className="ledger mb-2.5">
      {/* ---------- 块头：标题 + 说明 + "看数字" ---------- */}
      <div className="flex items-start gap-2 px-3.5 pb-3 pt-3.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          {subtitle !== undefined && (
            // leading-relaxed 是给这里的中文长句留的：
            // 说明文字经常折成两三行，行距一紧就糊成一块。
            // 这里不用 .t-label —— 那个带 .06em 的字距，
            // 短标签拉开好看，一长句中文拉开就散了。
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {subtitle}
            </p>
          )}
        </div>
        {canToggle && (
          <button
            type="button"
            onClick={() => setShowNumbers(!showNumbers)}
            // 这个按钮从 min-h-9（36px）提到 min-h-11（44px）——
            // 36px 低于项目铁律里"手指点得准的最小尺寸"那条线，
            // 而这个按钮正好在块头右上角，单手拿着手机时正是最难够的地方。
            //
            // 【这一轮把描边和文字都调淡了一档】
            // 一页上有七八张图，也就是七八个这样的小按钮。
            // 原来每块都描一道深边、写深色字，加起来比图本身还抢眼 ——
            // 而它只是个"换一种看法"的次要入口。
            // 调淡之后它退回背景，但仍然看得出是个按钮、仍然有 44px 的点击区。
            className="press min-h-11 shrink-0 rounded-lg border border-line px-3 text-xs text-muted"
          >
            {numbersMode ? '看图' : '看数字'}
          </button>
        )}
      </div>

      {/* 一条细线把"这块是什么"和"这块显示了什么"分开 ——
          这就是账本里表头下面那道线，也是整页能一段段读下去的原因 */}
      <div className="border-t border-line">
        {numbersMode && rows !== undefined && columns !== undefined ? (
          <div className="max-h-[220px] overflow-auto">
            {/* ---------- 看数字 ----------
                这里排成一张正经的表：第一列（日期/周次）左对齐，
                后面的数值列右对齐。
                【数值为什么必须右对齐】右对齐之后一列数字的右边缘
                落在同一条竖线上，长短不一的数（1,560 / 800 / 12,000）
                斜着扫一眼就能比出大小。左对齐的话每个数从同一个地方
                开始，比大小反而要逐行读。 */}
            <table className="w-full text-sm">
              <thead>
                <tr className="t-label">
                  {columns.map((col, index) => (
                    <th
                      key={col.key}
                      className={`py-1.5 font-normal ${
                        index === 0 ? 'pl-3.5 text-left' : 'text-right'
                      } ${index === columns.length - 1 ? 'pr-3.5' : 'pr-3'}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t border-line">
                    {columns.map((col, index) => (
                      <td
                        key={col.key}
                        className={`py-2 ${
                          index === 0
                            ? 'pl-3.5 text-left text-ink-2'
                            : 't-num text-right text-ink'
                        } ${index === columns.length - 1 ? 'pr-3.5' : 'pr-3'}`}
                      >
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
          <div className="h-[200px] w-full px-2.5 py-3">{children}</div>
        )}
      </div>
    </div>
  )
}
