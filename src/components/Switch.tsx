// ============================================================
// 开关的"形状"（滑一下那种的那个滑块）
// ============================================================
//
// 【为什么不用系统自带的复选框 <input type="checkbox">】
// 它长什么样完全由浏览器决定，而且深色模式下的默认样子是"一块发亮的灰方块"——
// 在深色界面上非常突兀，像是没画完（截图里一眼就能看出来）。
// 想让它好看得先把 appearance 关掉再自己重画，那还不如直接自己画一个。
//
// 【为什么"开/关"两个字不如这个形状】
// 写"开"的时候，你看到它并不能确定是"现在是开"还是"点了会开"——
// 一个字的状态标签天生有这个歧义，得点一下才知道。
// 轨道 + 滑块是全世界都认的开关样子，滑块在哪边本身就是答案。
//
// 【圆钮为什么永远是白色】
// 无论底色是灰轨道还是橙色轨道、无论是日间还是夜间，白色都看得见。
//
// 【★它自己不是按钮，只是一张"画"】
// 用法是把它放进一个 <button role="switch" aria-checked={…}> 里，
// 整行都可以点（手指好按），语义也由那个 button 负责。
// 所以这里标了 aria-hidden —— 读屏软件该念的是外面那个按钮，
// 不该把这张画再念一遍。
// ============================================================

type Props = {
  checked: boolean
}

export function Switch({ checked }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-brand' : 'bg-line-2'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-snap ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </span>
  )
}
