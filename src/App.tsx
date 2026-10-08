import { useEffect, useRef, useState } from 'react'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { StatsScreen } from './screens/StatsScreen'
import { TrainScreen } from './screens/TrainScreen'
import { exitApp, handleBack, onBackButton } from './lib/backbutton'
import { onRestNotifyTap } from './lib/restnotify'
import {
  Bars,
  CalendarIcon,
  Dumbbell,
  Sliders,
} from './components/TabIcons'

// ============================================================
// 这个文件是整个 App 的"外壳"
// ============================================================
// 它现在只干一件事：决定当前显示 4 个页面中的哪一个，
// 并把底部那排 tab 按钮画出来。
//
// 真正的页面内容，从阶段 2 开始会一个个搬进 src/screens/ 文件夹。
// 现在 4 个页面都还只是占位文字，先让你看到"能切换"。
// ============================================================

// 4 个 tab 的中文名和它们的"内部代号"。
// 末尾的 as const 是 TypeScript 的一个小技巧：告诉它这 4 个字符串永远不会变，
// 这样以后不小心把 'train' 打成 'trian' 时，编辑器会立刻标红。
const TABS = [
  { key: 'train', label: '训练' },
  { key: 'history', label: '历史' },
  { key: 'stats', label: '统计' },
  { key: 'settings', label: '设置' },
] as const

// 从上面那张表里自动"提取"出代号有哪几种，得到：
// 'train' | 'history' | 'stats' | 'settings'
type TabKey = (typeof TABS)[number]['key']

// 每个 tab 配哪个图标。
// 【为什么要写成一张对照表，而不是在按钮里写一堆 if】
// 表就是"代号 → 图标"的一一对应，加一个 tab 只需要多写一行；
// 写成 if 的话，判断顺序会变成一件要操心的事。
// 注意这张表**没有 export** —— 见 TabIcons.tsx 顶部那段说明。
// 这里故意不写类型标注 —— TypeScript 会自己看出
// "这张表正好有 4 个键，而且就是 TabKey 那 4 个"。
// 以后删掉一个 tab 却忘了删这里一行，它会立刻标红提醒。
const TAB_ICONS = {
  train: Dumbbell,
  history: CalendarIcon,
  stats: Bars,
  settings: Sliders,
}

function App() {
  // useState 是 React 用来"记住一个值"的工具。
  // 这里记住的是"当前选中哪个 tab"，初值是「训练」。
  // setTab 是修改它的唯一方法，改完 React 会自动重画界面。
  const [tab, setTab] = useState<TabKey>('train')

  // ---------- 安卓的物理返回键 ----------
  //
  // 【tabRef 是干什么的】
  // 让"按返回键的那一刻"能读到当前是哪个 tab。
  //
  // 【为什么不直接把 tab 写成下面那个 useEffect 的依赖】
  // 那样每次切换 tab 都会重新挂一次监听。而 backbutton.ts 里的规矩是
  // "后登记的在更上层、优先处理" —— 重新挂会让 App 这个处理器
  // 爬到设置页的上面去。结果：你在「设置 → 身体数据」里按返回，
  // 会被这句"切回训练页"抢先处理，直接跳过设置列表页。
  // 所以监听只挂一次（依赖数组留空），当前 tab 靠这个 ref 现读。
  const tabRef = useRef(tab)
  useEffect(() => {
    tabRef.current = tab
  }, [tab])

  useEffect(() => {
    return onBackButton(() => {
      // ① 先问各页面拦不拦（设置子页面、训练进行中）
      if (handleBack()) return
      // ② 不在训练页 → 先切回训练页。这是很多 App 的返回键手感：
      //    连按两下才退出，中间那下先回到首页。
      if (tabRef.current !== 'train') {
        setTab('train')
        return
      }
      // ③ 已经在训练页、也没人拦 → 退出 App
      exitApp()
    })
    // 在浏览器里打开时 onBackButton 什么都不做，直接返回空的注销函数，
    // 所以网页版一点影响都没有。
  }, [])

  // ---------- 点了"休息结束"那条通知 ----------
  //
  // 【为什么需要这一段】
  // 通知是在你切到别的 App（或者在别的 tab 上）的时候才会响的。
  // 点它的时候，App 可能停在「统计」页 —— 而"休息结束 点一下继续"
  // 是在训练页上的。不主动切回去的话，你点开 App 会觉得"怎么什么都没发生"。
  //
  // 【为什么只挂一次（依赖数组留空）】
  // 和上面返回键那段的道理一样：注册的时机无所谓，切 tab 也不影响它。
  //
  // 【冷启动点通知会怎样】
  // 插件只在 App 还活着的时候才发这个事件，冷启动时不发。
  // 但冷启动本来就落在训练页（下面 useState 的初值就是 'train'），
  // 所以那个场景不用这段代码也照样对。
  useEffect(() => {
    return onRestNotifyTap(() => setTab('train'))
  }, [])

  return (
    // 最外层：至少占满一屏高、内容从上往下竖着排。
    //
    // 【这里为什么没有 bg-bg】
    // 页面底色画在 <html> 上，而且 html 还带着一层很淡的径向渐变
    // —— 就是页面顶部那道微光（见 index.css 的 html 那条规则）。
    // 如果这里再铺一层不透明的 bg-bg，那道微光就被整块盖住了，白写。
    // 所以底色交给 html，这一层保持透明。
    <div className="flex min-h-dvh flex-col text-ink">
      {/* 上半部分：当前 tab 的内容。
          flex-1 的意思是"把除底部栏之外剩下的高度全部占满"。 */}
      {/* 顶部留白要避开 iPhone 的"刘海"和状态栏。
          env(safe-area-inset-top) 是浏览器告诉我们"顶部被系统占掉了多少像素"。
          在普通手机上它是 0，max() 就取 1.5rem（也就是原来 pt-6 的效果）。
          不写这个的话，装到手机桌面后页面标题会被状态栏盖住。 */}
      <main className="flex-1 px-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
        {/* 下面这行的 mx-auto + max-w 就是"电脑上居中一条、最宽 480px"的实现：
            mx-auto 让左右两边自动平分剩余空间，效果就是居中。 */}
        {/* key={tab} 是为了让切换 tab 时这块整体重挂一次 ——
            重挂才会重新播一遍 animate-fade（淡入）。
            不加 key 的话，React 会复用同一个 div，
            动画只在第一次显示时播过一次，之后就再也不播了。 */}
        <div key={tab} className="animate-fade mx-auto w-full max-w-[480px]">
          {/* 训练页已经是真的了（阶段 3 第 1 小步做的），不再是占位文字 */}
          {tab === 'train' && <TrainScreen />}
          {/* 历史页已经是真的了（阶段 4 做的） */}
          {tab === 'history' && <HistoryScreen />}
          {/* 统计页已经是真的了（阶段 5 做的） */}
          {tab === 'stats' && <StatsScreen />}
          {/* 设置页已经是真的了（阶段 2 做的），不再是占位文字 */}
          {tab === 'settings' && <SettingsScreen />}
        </div>
      </main>

      {/* 底部那排 tab 按钮。
          sticky bottom-0 = 页面滚动时吸在屏幕底部不动。

          底部留白用 max(0.5rem, env(safe-area-inset-bottom))：
            · iPhone 底部那条横条 → 系统会告诉我们多高（约 34px），取它
            · 安卓的手势条 → 新系统（安卓 15 起强制全屏铺满）也会报高度，取它
            · 万一某个系统报 0（旧安卓就是），至少还有 0.5rem（8 像素）垫底，
              不至于让"训练/历史/统计/设置"四个字被手势条压住一半
          以前这里写的是 pb-[env(safe-area-inset-bottom)]，没有兜底值 ——
          在报 0 的安卓机上就是一排字贴着屏幕最底边。 */}
      <nav
        // z-10：让导航条盖在页面内容之上。
        // sticky 元素默认不一定会浮在兄弟节点上面，滚到长列表底部时
        // 容易出现"内容从导航条里透出来"的怪样子。
        className="sticky bottom-0 z-10 border-t border-line bg-bg pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto flex w-full max-w-[480px]">
          {TABS.map((item) => {
            const isActive = item.key === tab
            // 从 TabIcons 里取出这个 tab 对应的图标组件
            const Icon = TAB_ICONS[item.key]
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                // min-h-14 = 56 像素。比 44 的最低要求高一点，
                // 因为多了图标之后是"图标 + 文字"上下两行，要占地方。
                className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 pt-2 text-xs transition-colors duration-200 ${
                  isActive ? 'font-semibold text-brand' : 'text-muted'
                }`}
              >
                {/* 顶上那根小横条 —— 像面板上被点亮的一格指示灯，
                    告诉你"现在停在哪儿"。
                    没选中的那几格不是没有，是把不透明度降到 0
                    （所以它一直在那儿占着位置，横条不会一会儿有一会儿没）。 */}
                <span
                  className={`absolute top-0 h-0.5 w-8 rounded-full bg-brand transition-opacity duration-200 ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                {/* 图标跟着一起动：选中时稍微放大一点点。
                    颜色不用管，它用的是 currentColor，会跟着按钮的文字色走。 */}
                <Icon
                  className={`h-5 w-5 transition-transform duration-200 ease-snap ${
                    isActive ? 'scale-110' : ''
                  }`}
                />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export default App
