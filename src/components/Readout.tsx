import type { ReactNode } from 'react'

// ============================================================
// 仪表读数条
// ============================================================
//
// 【它是干什么的】
// 训练页顶部那一排关键数字：练了几组、总共多少公斤、练了多久。
//
// 【为什么要做成"一条"而不是"三张卡"】
// 以前这几样是写成一句话的：「12 组 · 总容量 4,820 kg」。
// 一句话的毛病是——里面的数字和字一样大，眼睛扫过去抓不住重点，
// 得一个字一个字读。而且"已练多久"以前藏在标题旁边一行小灰字里，
// 是这一屏第二重要的数字，却被埋掉了。
//
// 现在改成仪表盘那样的读数格：每个数字单独一格、标签小字压在上面、
// 数字大而等宽。好处是"一眼就抓住"，不用读。
// 三张卡各带一圈边框会把版面切碎，一条连着反而更像一块面板。
//
// 【为什么数字要用 .t-num】
// tabular-nums（等宽数字）让每个数字占一样宽。
// 不加的话，"9"和"1"宽度不同，"已练"那个数每秒跳一下，整条会左右抖。

type ReadoutProps = {
  children: ReactNode
}

// 外壳。divide-x = 在每一格之间画一条竖分隔线（第一格左边不画）。
export function Readout({ children }: ReadoutProps) {
  return (
    <div className="card flex items-stretch divide-x divide-line overflow-hidden">
      {children}
    </div>
  )
}

type CellProps = {
  label: string // 小字：这一格是什么
  value: string // 大字：数字本身（已经格式化好的文字）
  unit?: string // 数字后面的单位，比如 kg。小一号、颜色更淡
  accent?: boolean // 这一格要不要用主色标出来（表示"正在进行中"）
}

export function ReadoutCell({ label, value, unit, accent }: CellProps) {
  return (
    // px-2.5 / min-[370px]:px-3 ——
    // 最窄的手机（320px，比如 iPhone SE 一代）上四格并排，每格只有 48 像素
    // 能放字。默认的 px-3 两边一共吃掉 24 像素，标签就会被裁成"总容…"。
    // 370px 以上的机器（也就是现在绝大多数手机）空间够了，再回到宽松的 12 像素。
    <div className="min-w-0 flex-1 px-2.5 py-2.5 min-[370px]:px-3">
      <div className="t-label truncate">{label}</div>
      {/* whitespace-nowrap：万一数字很长（比如"12,345"），
          宁可让它把格子撑开一点，也不要在中间断行 ——
          数字断成两行就完全读不出来了。 */}
      <div
        className={`t-num mt-0.5 whitespace-nowrap text-lg font-semibold ${
          accent === true ? 'text-brand' : 'text-ink'
        }`}
      >
        {value}
        {unit !== undefined && (
          <span className="ml-1 text-xs font-normal text-muted">{unit}</span>
        )}
      </div>
    </div>
  )
}
