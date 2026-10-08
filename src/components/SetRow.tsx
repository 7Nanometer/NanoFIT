import type { ReactNode } from 'react'
import { NumberField } from './NumberField'

// ============================================================
// 记一组的那一行：重量 / 次数 / RPE / ✓
// ============================================================
//
// 【布局上的一个讲究】
// ✓ 按钮必须紧挨着输入框，不能放到屏幕底部去。
// 因为 iPhone 的数字键盘没有"完成"键，弹起来之后收不回去，
// 会一直挡着屏幕下半部分。
// 把 ✓ 放在键盘上方够得着的位置，才能做到"记一组到下一组不超过 5 秒"。
//
// 【✓ 为什么会"亮起来"】
// 它没亮的时候是灰的，重量和次数都填了才变成橙色、并且透出一圈光晕。
// 这是照着器械上那颗"就绪"指示灯做的 ——
// 按不动的按钮和能按的按钮长得一样，是手机上最常见的憋屈感来源。
//
// 【为什么是"透出光晕"而不是"变个颜色"】
// 一屏上可能同时有四五张动作卡片，也就是四五个 ✓。
// 如果它们全都在发光，眼睛就不知道该看哪个，"强调"这件事就废了。
// 所以只让**当前填好了的那一个**亮 —— 光晕成了一根手指，
// 指着你下一步该点哪儿。这也是这一版里"视觉层级"最实在的一处。
// ============================================================

type Props = {
  weightText: string
  repsText: string
  rpeText: string
  showRpe: boolean // 设置里关掉 RPE 时，这一栏整个不显示
  onWeightChange: (v: string) => void
  onRepsChange: (v: string) => void
  onRpeChange: (v: string) => void
  onConfirm: () => void
  canConfirm: boolean
}

export function SetRow({
  weightText,
  repsText,
  rpeText,
  showRpe,
  onWeightChange,
  onRepsChange,
  onRpeChange,
  onConfirm,
  canConfirm,
}: Props) {
  return (
    // items-end 让所有东西底部对齐（因为输入框上面有标签，高度不一样）
    <div className="flex items-end gap-2">
      <Field label="kg" flex="flex-[3]">
        <NumberField
          value={weightText}
          onChange={onWeightChange}
          placeholder="80"
        />
      </Field>

      <Field label="次" flex="flex-[2]">
        <NumberField value={repsText} onChange={onRepsChange} placeholder="8" />
      </Field>

      {showRpe && (
        <Field label="RPE" flex="flex-[2]">
          <NumberField value={rpeText} onChange={onRpeChange} placeholder="—" />
        </Field>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={!canConfirm}
        // min-h-11 min-w-12 ≈ 44×48 像素：手指点得准的最小尺寸，
        // 宽度比最低要求宽一点点，因为它是最常按的那一颗
        //
        // 【没填好时：灰底、灰字、没有光晕】
        // 这三样一起去掉，按钮就"沉"下去了 —— 一眼看出现在按不动，
        // 而不是按下去之后才发现没反应。
        className="press min-h-11 min-w-12 shrink-0 rounded-lg bg-brand text-xl font-bold text-on-brand shadow-[var(--elev-brand)] disabled:bg-line disabled:text-muted disabled:shadow-none"
      >
        ✓
      </button>
    </div>
  )
}

// 输入框上面那行小标签。抽出来是为了不用把同样的结构写 3 遍。
function Field({
  label,
  flex,
  children,
}: {
  label: string
  flex: string
  children: ReactNode
}) {
  return (
    <div className={flex}>
      {/* t-label = 小字 + 淡色 + 字间距稍微拉开（见 index.css）*/}
      <div className="t-label mb-1.5 text-center">{label}</div>
      {children}
    </div>
  )
}
