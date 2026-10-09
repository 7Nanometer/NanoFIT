import { useState } from 'react'
import type { StrengthMetLevel } from '../types'
import { formatDuration } from '../lib/calc'
import { STRENGTH_MET_INFO, metLabel } from '../lib/kcal'
import { StartTimeEditor } from './StartTimeEditor'

// ============================================================
// 结束训练时问一句"这次练得有多累"
// ============================================================
//
// 【为什么非问不可，不能全自动】
// 强度是热量的一个大变量：同样练 1 小时，轻重量和大重量的能差一倍
// （MET 3.0 对 6.0）。系统只能从数据里**猜**：你记的 RPE、组间休息多长、
// 练了哪些动作。猜得不算差，但它看不见"你今天是不是状态不好
// 所以减了重量"这种事。
//
// 所以做成：**替你猜一个，但你随时能改**。
//
// 【这个面板顺便代替了原来的"确定要结束吗"弹窗】
// 结束训练本来就要确认一下，多问这一句不增加操作次数。
//
// 【这个组件自己不存数据】
// 和 ExerciseForm、CardioForm 一样，它只负责收集，交出去给训练页存。
//
// ============================================================
// ★ 2026-09-24 重写过，改的原因值得记着（这是出过事的）
// ============================================================
//
// 原来这个面板打开时，默认选中的是**你上次选的那一档**，
// 而不是系统本次推荐的。系统的建议只在按钮上挂一个很小的「建议」标签。
//
// 后果：有人第一次在一个很短的训练上确认了"低强度"，
// 那个选择被记进了 Settings.lastMetLevel，从此**每一场都默认低强度** ——
// 包括 16 组、42 分钟、RPE 8-10 的训练，热量被算了 112 而不是 280。
// 而他完全不知道：面板上那个小标签，是唯一提示"你选的和建议不一样"的东西。
//
// 改了三处：
//   1. **默认永远选中系统本次推荐的那一档**（要沿用上次，得自己点）
//   2. 系统建议从"小标签"升级成**一整块：建议哪档 + 为什么**
//   3. 你选的和建议不一样时，用主色写一句完整的话 —— 不是靠颜色深浅区分
//
// 【为什么理由必须显示出来】
// 用户要能自己判断"系统这条建议合不合理"。只给一个结论，
// 数字不对时他只能来问；给了依据，他自己一眼就能看出是不是错了。
// 依据文字由 lib/kcal.ts 的 recommendMetLevel **连档位一起返回** ——
// 不许在界面这边另写一套判断，两份逻辑一定会走偏。
// ============================================================

type Props = {
  // 系统根据这次训练推荐的那一档。面板打开时默认选中它
  recommended: StrengthMetLevel
  // 为什么推荐它（"你记的 RPE 中位数是 9"这种）。空串表示没有理由可讲
  reason: string
  // 上次"结束训练"时选的那一档。
  // 只用来做一个"沿用上次"的快捷按钮 —— 点了才选中，绝不自作主张。
  lastLevel?: StrengthMetLevel | undefined
  // 这次训练一共多久（秒）。null = 算不出来（老记录没开始时间）。
  // ★ 这个数必须是"最后真会存进去的那个"——由训练页用冻结的结束时刻算好传进来。
  durationSec: number | null
  // 这次的开始时刻（ISO）。undefined = 没记，那就不显示修正入口
  startedAt?: string | undefined
  // 最晚允许的开始时刻（不能晚于第一组）。见 StartTimeEditor
  latestStartISO?: string | undefined
  // 用户改了开始时间。训练页拿这个去更新正在进行的训练
  onChangeStart: (iso: string) => void
  // 这次练了什么，如"共 12 组力量 + 有氧 20 分钟"
  summary: string
  onConfirm: (level: StrengthMetLevel) => void
  onCancel: () => void
}

export function MetPicker({
  recommended,
  reason,
  lastLevel,
  durationSec,
  startedAt,
  latestStartISO,
  onChangeStart,
  summary,
  onConfirm,
  onCancel,
}: Props) {
  // ★ 初值就是"系统推荐"，不再是"上次选的"
  const [level, setLevel] = useState<StrengthMetLevel>(recommended)

  // 当前选中那一档的说明文字。理论上一定找得到，兜个底免得显示空白。
  const info = STRENGTH_MET_INFO.find((x) => x.key === level)

  // 选的和建议的不一样。要显眼地说出来，不能靠一个标签的颜色深浅。
  const deviated = level !== recommended

  // "沿用上次"按钮：只有"上次"存在、且和本次建议不是同一档时才出现。
  // 两者相同时它没有任何意义（那一档本来就默认选中了）。
  const canReuseLast = lastLevel !== undefined && lastLevel !== recommended

  return (
    // 半透明遮罩 + 居中面板，和"新建动作""记一次有氧"同一套写法
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="animate-pop card max-h-full w-full max-w-[440px] overflow-y-auto p-5">
        <h2 className="mb-1 text-lg font-semibold text-ink">
          结束今天的训练？
        </h2>
        <p className="mb-3 text-sm text-muted">
          这次练得有多累？
          {/* 注意：这里是 JSX 不是 markdown，写 **粗体** 会原样显示成星号，
              所以加粗要用 span + CSS 类 */}
          <span className="text-ink-2">这一项只影响热量估算</span>
          ，不影响记录本身。
        </p>

        {/* ---------- 本次训练多久 / 从几点开始（★ 2026-09-24 加的）----------
            加这块的直接原因：用户几点开始热身，App 是猜不到的 ——
            它自动记的是"第一次掏出手机加动作"那一刻，前面热身的十几分钟
            会丢。而时长是热量公式的乘数，少记了就少算。

            为什么放在这个面板里：结束训练时人本来就要操作一次 App，
            顺手把开始时间改了，不需要另外记住去点什么东西。
            为什么不做成"开始计时"按钮：那样会忘，一忘就是整场没计时；
            自动开始最多差十几分钟，而且随时能改。 */}
        <div className="mb-3 well p-3">
          <div className="text-sm text-ink">
            本次训练{' '}
            <span className="font-semibold">
              {durationSec === null ? '算不出来' : formatDuration(durationSec)}
            </span>
          </div>
          {startedAt !== undefined && (
            <StartTimeEditor
              startedAt={startedAt}
              latestStartISO={latestStartISO}
              onChangeStart={onChangeStart}
            />
          )}
        </div>

        {/* ---------- 系统建议（整块，不是小标签）---------- */}
        <div className="mb-2.5 rounded-md border border-brand/40 p-3">
          <div className="text-sm font-medium text-ink">
            系统建议：
            <span className="text-brand">{metLabel(recommended)}</span>
          </div>
          {reason !== '' && (
            <div className="mt-0.5 text-xs text-ink-2">依据：{reason}</div>
          )}
        </div>

        {/* ---------- 五档（数组顺序 = 从弱到强）----------
            【为什么竖着排五行，而不是让它们自己折行】
            原来是 flex-wrap：五个按钮宽窄不一，"中高强度 5.0"比"中等 3.5"宽
            一大截，折出来的行参差不齐，看着就挤。改成一行一个、占满宽度，
            每行都是完整的点击区域，反而更清爽。
            【为什么 MET 值单独靠右对齐】
            五个数字对齐成一列，才能一眼比出"这几档差多少"——
            主人原话是"不然我选的时候不知道差别有多大"。
            tabular-nums 是让数字等宽，不然 3.5 和 6.0 的小数点会对不齐。 */}
        <div className="ledger mb-2.5 divide-y divide-line">
          {STRENGTH_MET_INFO.map((item) => {
            const active = item.key === level
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setLevel(item.key)}
                // min-h-11 = 44 像素，手指点得准的最小尺寸
                //
                // 【选中那一行为什么从"整块实心橙"改成"淡橙底"】
                // 它上面那个"系统建议"框原来也是橙底 —— 两块实心橙上下摞着，
                // 分不清哪个是"建议"、哪个是"我已经选的"。
                // 现在上面只留橙边（是提示），下面选中那行用淡橙底（是状态），
                // 两个意思一眼分得开。五个选项也终于像"一列可选的值"，
                // 而不是"五张各带边框的小卡片"。
                className={`press-row flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm ${
                  active
                    ? 'bg-brand/10 font-semibold text-brand'
                    : 'text-ink-2'
                }`}
              >
                {/* flex-1 把档位名撑开，后面的东西自然被推到右边 */}
                <span className="flex-1">{item.label}</span>
                {/* 系统推的那一档标一下。选中时整块是橙红的，
                    所以那个小字的颜色要跟着变，不然看不见 */}
                {item.key === recommended && (
                  <span className={`text-xs ${active ? '' : 'text-brand'}`}>
                    建议
                  </span>
                )}
                <span
                  className={`t-num w-8 text-right ${
                    active ? '' : 'text-muted'
                  }`}
                >
                  {item.met.toFixed(1)}
                </span>
              </button>
            )
          })}
        </div>

        {/* ---------- 选的和建议不一样（★ 这行是这次加的重点）---------- */}
        {deviated && (
          <p className="mb-2.5 rounded-md border border-brand/40 p-3 text-sm text-brand">
            {/* 整句拼成一个字符串再渲染，是为了不让 JSX 在换行处
                自作主张地塞空格或吃掉空格（引号「」里多一个空格很扎眼）。
                强调"你选的"要用 span + CSS —— 这里写 markdown 的星号
                会被原样显示出来，因为这个面板是 JSX 不是 markdown */}
            {`你选的是「${metLabel(level)}」，和系统建议的「${metLabel(recommended)}」不一样。热量会按`}
            <span className="font-semibold">你选的</span>
            这一档算。
          </p>
        )}

        {/* 选中那一档什么意思。这些说法直接来自 Compendium 的档位定义，
            不是随口写的 —— 主人就是靠这句话判断该点哪个。 */}
        {info !== undefined && (
          <p className="mb-3 text-xs text-muted">{info.hint}</p>
        )}

        {/* ---------- 沿用上次（要自己点，不自动选中）---------- */}
        {canReuseLast && (
          <button
            type="button"
            onClick={() => setLevel(lastLevel)}
            className="press mb-3 min-h-11 w-full rounded-lg border border-line-2 px-3 text-sm text-ink-2"
          >
            沿用上次：{metLabel(lastLevel)}
          </button>
        )}

        {/* ---------- 这次练了什么 ---------- */}
        <div className="mb-4 well p-3 text-sm text-ink-2">
          {summary}
        </div>

        {/* ---------- 底部两个按钮 ---------- */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="press min-h-11 flex-1 rounded-lg border border-line-2 text-ink-2"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(level)}
            className="press min-h-11 flex-1 rounded-lg bg-brand font-semibold text-on-brand"
          >
            结束训练
          </button>
        </div>
      </div>
    </div>
  )
}
