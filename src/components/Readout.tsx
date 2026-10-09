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

// 外壳。
//
// 【这一轮为什么把 card 换成了两条横线】
// 以前它是一张卡片：圆角、投影、四个格子。问题是它和下面那些动作卡片
// 长得是同一类东西 —— 眼睛会以为"这也是一张卡"，于是它读起来
// 就只是"第一张卡"，而不是"整页的抬头"。
//
// 换成上下两条细线（border-y）之后，它变成了一条**横贯页面的读数带**：
// 上面那条线把它和页头分开，下面那条线把它和内容分开，
// 中间四格用竖线分栏。这是印刷表格的做法，也是账本的做法 ——
// 它不再"浮"在页面上，而是"印"在页面上，自然就成了抬头的分量。
export function Readout({ children }: ReadoutProps) {
  return (
    <div className="flex items-stretch divide-x divide-line border-y border-line">
      {children}
    </div>
  )
}

type CellProps = {
  label: string // 小字：这一格是什么
  value: string // 大字：数字本身（已经格式化好的文字）
  unit?: string // 数字后面的单位，比如 kg。小一号、颜色更淡
  accent?: boolean // 这一格要不要用主色标出来（表示"正在进行中"）
  // 数字变了要不要"跳"一下。默认要 —— 组数、容量这些都是
  // "你操作了才会变"的，跳一下是很好的回执。
  // 只有跟着秒表走的"已练"那格要传 false（每 5 秒闪一下会烦人）。
  pulse?: boolean
}

export function ReadoutCell({
  label,
  value,
  unit,
  accent,
  pulse = true,
}: CellProps) {
  return (
    // px-2.5 / min-[370px]:px-3 ——
    // 最窄的手机（320px，比如 iPhone SE 一代）上四格并排，每格只有 48 像素
    // 能放字。默认的 px-3 两边一共吃掉 24 像素，标签就会被裁成"总容…"。
    // 370px 以上的机器（也就是现在绝大多数手机）空间够了，再回到宽松的 12 像素。
    <div className="min-w-0 flex-1 py-3 pl-3 pr-2">
      <div className="t-label truncate">{label}</div>
      {/* whitespace-nowrap：万一数字很长（比如"12,345"），
          宁可让它把格子撑开一点，也不要在中间断行 ——
          数字断成两行就完全读不出来了。 */}
      <div
        // 【数字从 17px 提到 21px】
        // 它是全屏最该被一眼抓住的东西（正在练多久、已经举了多少公斤），
        // 却和下面卡片里的正文差不多大。提上来之后，
        // 扫一眼手机就够，不用凑近看。
        //
        // 【为什么 320px 的机器上退回 17px】
        // 四格并排，320px 的屏幕每格只有 72 像素。21px 的"2,930"
        // 本身就占 55 像素，再加单位" kg"就顶出去了 ——
        // 而这一条是"不许横向溢出"的（越界的元素会把整页顶歪）。
        // 370px 以上（也就是现在绝大多数手机）空间够，就用回大号。
        className={`t-num mt-1 whitespace-nowrap text-lg font-semibold min-[370px]:text-xl ${
          accent === true ? 'text-brand' : 'text-ink'
        }`}
      >
        {/* ---------- 数字换掉时"跳"一下 ----------
            【key={value} 这个写法在干什么】
            React 靠 key 认"这还是不是同一个元素"。key 一变，
            它就当成一个全新的元素，把旧的拆掉重新建一个 ——
            而**重建会重放动画**。所以每次数字变了，
            animate-tick 就重新播一遍，看着就是数字"跳"了一下。
            样式本身在 index.css 的 @keyframes tick 里。

            【为什么包一层 span 而不是直接加在外层】
            外层那一格还装着单位"kg"，只让数字跳、别让单位跟着跳。
            inline-block 是必须的：行内元素不接受 transform，
            不加它动画一点效果都没有（这种不报错的哑巴坑最难查）。

            【pulse 为 false 时 key 是 undefined】
            那就是"不重放"，数字直接换掉 —— 跟着秒表走的"已练"那格用这个。
            undefined 会被 React 当成"没有 key"，不影响别的。 */}
        <span
          key={pulse ? value : undefined}
          className={pulse ? 'inline-block animate-tick' : undefined}
        >
          {value}
        </span>
        {/* 单位用 .t-unit（和数字同一条基线、小一号、更淡）——
            单位和数字一样大时，眼睛会把"2,930 kg"当成一整个字符串读，
            数字就不突出了。 */}
        {unit !== undefined && <span className="t-unit ml-1">{unit}</span>}
      </div>
    </div>
  )
}
