import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import type { Theme } from '../types'

// 顺手再导出一次，这样用的人既可以 from '../types' 拿，
// 也可以 from './lib/theme' 拿，不用记它到底住在哪个文件。
export type { Theme }

// ============================================================
// 日间／夜间模式
// ============================================================
//
// 【它到底做了什么】
// 只有一件事：往 <html> 这个标签上挂一个 data-theme="light"。
// 样式文件（src/index.css）里写着"挂着 light 就用浅色那套变量"，
// 挂上去的瞬间，全站颜色一起换掉 —— 不需要 React 重画任何东西。
//
// 【为什么不做成"每个元素写两遍颜色"】
// 见 src/index.css 顶部那段说明。
//
// 【为什么地址栏颜色也要管】
// 手机浏览器顶上那条（显示网址的、也就是状态栏）颜色是 <meta name="theme-color">
// 决定的。它不会跟着 CSS 变量走，必须手动改。
// 不管它的话，日间模式下页面是白的，顶上却压着一条黑边，很丑。
// ============================================================

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme

  // 地址栏的颜色，直接从样式里问"现在的 --color-bg 是多少"，
  // 而不是在这里再抄一份色值 —— 抄一份就多一个以后写岔的机会。
  //
  // 【为什么问得到】
  // 上一行刚改完 data-theme，浏览器还没重算样式；
  // 但 getComputedStyle 会强制它立刻重算，所以这里问到的是新主题的值。
  // 即使浏览器因为优化没有立刻算，最坏结果也只是地址栏颜色慢一拍，
  // 不影响页面本身的颜色 —— 那个是纯 CSS 管的，一定是对的。
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-bg')
    .trim()

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta !== null && bg !== '') {
    meta.setAttribute('content', bg)
  }

  // ---------- iPhone 专用：状态栏上"时间/电量"那几个字用什么颜色 ----------
  // index.html 里原本写的是 black-translucent —— 意思是状态栏透明、
  // 页面内容铺到它底下，而那几个字固定是**白色**。
  // 这在夜间模式（深色底）下正好；但日间模式是白底，白字就看不见了。
  // 所以这里跟着主题改：白底用 default（系统给白底 + 深色字）。
  //
  // 【老实说】这段没法在电脑上验证 —— 需要真 iPhone 装成 PWA 才看得出效果。
  // 安卓（你现在这台）完全不看这个 meta，改了也不会有副作用。
  const statusBar = document.querySelector(
    'meta[name="apple-mobile-web-app-status-bar-style"]',
  )
  if (statusBar !== null) {
    statusBar.setAttribute(
      'content',
      theme === 'light' ? 'default' : 'black-translucent',
    )
  }

  // ---------- 安卓原生壳专用：状态栏上的图标和时间用什么颜色 ----------
  //
  // 【★这里有个反直觉的坑，改的时候千万别想当然】
  // Capacitor 这个枚举的名字指的是**背景**，不是字。
  // 我去读了它的类型定义文件（node_modules/@capacitor/status-bar/.../definitions.d.ts）：
  //     Style.Dark  = "Light text for dark backgrounds"   → 深色背景配浅色字
  //     Style.Light = "Dark text for light backgrounds"   → 浅色背景配深色字
  // 也就是说：
  //     夜间模式（深色底）→ 要用浅色字 → 传 Style.Dark
  //     日间模式（白底）  → 要用深色字 → 传 Style.Light
  // 名字和你要的效果正好相反。传反了，日间模式下状态栏就是黑字压白底还能看、
  // 夜间模式下变成黑字压深底 —— 直接看不见时间和电量。
  //
  // 在浏览器里打开时这段不会执行（Capacitor.isNativePlatform() 是 false）。
  if (Capacitor.isNativePlatform()) {
    void StatusBar.setStyle({
      style: theme === 'light' ? Style.Light : Style.Dark,
    }).catch(() => {
      // 设置失败无所谓，最多是状态栏颜色不跟手，不影响任何功能
    })
  }
}

// ============================================================
// 给图表读颜色
// ============================================================
//
// 【为什么图表不能直接用 bg-brand 这种类名】
// recharts 是个画 SVG 的库，它要的是**实实在在的颜色值**（#ff4d2e 这种），
// 而不是"背景色用主色"这种类名。所以统计页里那几个颜色以前是写死的，
// 结果就是切到日间模式时，图表的线还是深色模式那一套，白底上几乎看不见。
//
// 【这里的做法】
// 现问浏览器："现在 --color-brand 实际是多少？" —— 问到的永远是当前主题的值。
// 好处是颜色只在 index.css 里定义一次，这里不会跟它写重复、也就不会写岔。
//
// 【为什么在组件里要用 useState(chartColors) 这样调用】
// 在渲染的时候直接读页面样式算"副作用"。用 useState 的惰性初始化，
// 保证每次进入统计页只读一次，读完就存住。
export function chartColors() {
  const style = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback

  // 后面那些备胎值**正常情况下永远用不到** —— index.css 里一定定义了这些变量。
  // 它们只在"样式还没加载完就被问到"这种极端情况下兜底。
  // 【但备胎也得跟着主胎一起换】不换的话，真出问题时图表会画成上一次改版
  // 的颜色（灰紫、深灰），而不是回报一个明显的错误 —— 那种"看起来像对了"
  // 的故障最难查。所以下面这几个值要和 index.css 的夜间那套保持一致。
  return {
    brand: read('--color-brand', '#ff4d2e'),
    // 【为什么图表要单独拿一份 cyan】
    // 全站的颜色分工是"橙=要你动手，青=已经记下来的数"（见 index.css 顶部）。
    // 统计页上全是"已经记下来的数" —— 一个要动手的地方都没有。
    // 所以图表该用青色，橙色留给真正需要你点的地方（那颗 ✓、当前 tab）。
    // 一张统计页如果满屏橙柱子，等你回到训练页，那颗该跳出来的 ✓
    // 就淹在同一个颜色里了 —— 强调色一滥，就等于没有强调色。
    cyan: read('--color-cyan', '#3fe0d0'),
    muted: read('--color-muted', '#74746e'),
    line: read('--color-line', '#23232a'),
    surface: read('--color-surface', '#17171b'),
    ink: read('--color-ink', '#f7f7f5'),
    // chart2 只用在"一张图上要同时画两组数据"的地方（比如力量 vs 有氧）——
    // 那时候光靠深浅分不开，必须有第二个色相。
    chart2: read('--color-chart-2', '#4da3ff'),
  }
}
