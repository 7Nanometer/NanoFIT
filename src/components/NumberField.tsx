// ============================================================
// 数字输入框
// ============================================================
//
// 【为什么不用现成的 <input type="number">】
// 它在手机上有三个毛病，而且只在真机上出现，电脑上看不出来：
//   1. iPhone 上弹不出正确的数字键盘
//   2. 部分输入法下小数点会变成逗号，数字就读不出来了
//   3. 会冒出上下两个小箭头，手机上一戳就串
//
// 所以改用 <input type="text" inputMode="decimal">：
//   type="text"         —— 就是个普通文本输入框，没有上面那些毛病
//   inputMode="decimal" —— 但告诉手机"请弹数字键盘"（带小数点那种）
//
// 【为什么传进来、传出去的都是文字，不是数字】
// 用户打字过程中会出现 "1." 这种还不完整的中间状态。
// 如果内部直接存成数字，"1." 会被当场吃掉小数点，用户就永远打不出 1.5。
// 所以这里一律按文字处理，真正需要数字时用 calc.ts 里的 textToNumber() 转换。
// ============================================================

type Props = {
  value: string
  onChange: (text: string) => void
  placeholder?: string
  className?: string
}

export function NumberField({
  value,
  onChange,
  placeholder,
  className = '',
}: Props) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => {
        const next = e.target.value
        // 只允许"数字 + 最多一个小数点"。
        // 这个正则读法：一串数字，可以跟一个小数点，再跟一串数字。
        if (!/^\d*\.?\d*$/.test(next)) return
        onChange(next)
      }}
      placeholder={placeholder}
      // ---------- 造型说明 ----------
      // t-num      数字等宽：一列输入框里的数才能上下对齐
      // bg-surface-2 凹槽底：看着像在面板上挖进去一个坑（.well 那个思路）
      // border-line-2 比一般的分隔线深一档：输入框是"要看清边界"的东西
      // text-base + font-semibold 填进去的数字要够醒目 ——
      //   这是你正盯着的那几个数，不能和标签一个分量
      // placeholder 再压淡一档（muted 已经是全站最淡的字色了，所以再乘 60%）：
      //   预设值（80、8）只是"上次大概是这个数"的提示。
      //   它要是和真填进去的字一样实，人会以为已经填好了，直接去点 ✓ ——
      //   结果记下一组空数据。这个坑在健身房手忙脚乱的时候特别容易踩。
      // focus 时描边变主色 + 一圈淡淡的光晕，明确告诉你"字打到这里来了"
      className={`t-num w-full rounded-lg border border-line-2 bg-surface-2 px-2 py-2.5 text-center text-base font-semibold text-ink outline-none transition duration-150 ease-mech placeholder:font-normal placeholder:text-muted/60 focus:border-brand focus:ring-2 focus:ring-brand/25 ${className}`}
    />
  )
}
