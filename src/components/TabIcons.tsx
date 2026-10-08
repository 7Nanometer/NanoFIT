// ============================================================
// 底部四个 tab 的图标
// ============================================================
//
// 【为什么手写 SVG 而不是装一个图标库】
// 四个图标，用图标库要多下载几百 KB 的依赖，还得跟着它升版本 ——
// 不划算。这里每个就是几行路径数据，加起来不到 1KB。
//
// 【为什么四个图标要统一"长相"】
// 换一套图标最怕的就是几个图标粗细不一、圆角不一，
// 摆在一条线上会显得很业余。所以这四张统一遵守：
//   · 画在 24×24 的格子里
//   · viewBox 固定 "0 0 24 24"（所以它们的大小和位置天然对齐）
//   · 线条粗细 1.75，线头线尾都是圆的（strokeLinecap）
//   · 只有线条，没有实心块（fill="none"）
//
// 【颜色为什么写 currentColor】
// 它是"跟着外面文字颜色走"的意思。父元素是灰色它就灰，是橙红它就橙红 ——
// 所以选中/未选中两种状态一个图标就够，不用画两套。
// ============================================================

type IconProps = {
  className?: string
}

// 四个图标共用的外壳，把上面那几条规矩集中在一处，省得每个抄一遍
function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      // aria-hidden：这是纯装饰的图形，旁边已经有"训练"两个字了。
      // 不加的话，用读屏软件的人会听到"训练 图形 训练"这种重复。
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  )
}

/* 【为什么这四个图标要一个个 export，而不是在这里再建一张对照表】
   这个文件里如果既导出图标、又导出一张"代号 → 图标"的表，
   编辑器会警告：那样会让"改代码立刻看到效果"（热更新）失效。
   规矩是"一个文件要么只导出组件、要么只导出数据"。
   所以对照表放在用它的地方（App.tsx），这里只管画图标。 */

// 训练 —— 一根杠铃：中间横杆，两边各两片配重
export function Dumbbell({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 12h8" />
      <path d="M4 9v6" />
      <path d="M20 9v6" />
      <path d="M7.5 6.5v11" />
      <path d="M16.5 6.5v11" />
    </Svg>
  )
}

// 历史 —— 一本按日期记的账本
export function CalendarIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </Svg>
  )
}

// 统计 —— 三根高低不同的柱子
// （不用折线：小尺寸下折线的转折看不清，柱子一眼就懂）
export function Bars({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 20v-6" />
      <path d="M12 20V5" />
      <path d="M19 20v-9" />
    </Svg>
  )
}

// 设置 —— 两根导轨加两个旋钮
// （不用齿轮：齿轮在小尺寸下锯齿会糊成一团，导轨旋钮更清爽，
//   而且"调节"这个意思也直白）
export function Sliders({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 8h6" />
      <path d="M16 8h4" />
      <path d="M4 16h4" />
      <path d="M14 16h6" />
      <circle cx="13" cy="8" r="2.5" />
      <circle cx="11" cy="16" r="2.5" />
    </Svg>
  )
}
