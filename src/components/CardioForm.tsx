import { useState } from 'react'
import type { Exercise } from '../types'
import { RUNNING_IDS, cardioExercises } from '../data/exercises'
import { NumberField } from './NumberField'
import {
  formatDistance,
  formatDuration,
  formatPace,
  isPaceTextAllowed,
  paceSecPerKm,
  parsePaceText,
  textToNumber,
  trackDistanceM,
} from '../lib/calc'
import { estimateKcal, formatKcal, metForCardio } from '../lib/kcal'

// ============================================================
// "记一次有氧"的弹窗
// ============================================================
//
// 【为什么有氧要单独一个表单，不复用力量那套】
// 力量是"选动作 → 记多组"，每组填重量×次数。有氧完全不是这个形状：
// 跑一次就是一条记录，只关心"多久"和"多远"。
// 硬套力量的表单会逼你填重量和次数，那两个数对跑步毫无意义。
//
// 【交互为什么做得这么短】
// 手机上刚跑完，人是喘的、手上可能还有汗。每多一次点击都很难受。
// 所以：常用动作直接摆在最上面一排（点一下就选中），
// 时长是唯一必填项，距离能填就填、不填也能存。
//
// 【这个组件自己不存数据】
// 和 ExerciseForm 一样，它只负责收集，填好了交给训练页去存。
// ============================================================

type Props = {
  allExercises: Exercise[] // 全部动作，用来挑出有氧的那几个
  // 从卡片上的"再记一次"进来时，替用户把动作选好
  initialExerciseId?: string
  // 算热量估算用的体重。没有体重时传 undefined ——
  // 那就只显示"建议填个体重"，不显示热量
  weightKg?: number
  onSave: (
    exerciseId: string,
    durationSec: number,
    distanceM: number | undefined,
    kcal: number | undefined,
  ) => void
  onCancel: () => void
}

export function CardioForm({
  allExercises,
  initialExerciseId,
  weightKg,
  onSave,
  onCancel,
}: Props) {
  // 可选的有氧动作。顺序 = 数据文件里的顺序，最常用的排最前。
  const options = cardioExercises(allExercises)

  const [exerciseId, setExerciseId] = useState(
    initialExerciseId ?? options[0]?.id ?? '',
  )
  const [minutesText, setMinutesText] = useState('')
  const [distanceText, setDistanceText] = useState('')
  // 配速：跑者打"5:30"，用计算器的人打"5.5"，两种都收（见 parsePaceText）
  const [paceText, setPaceText] = useState('')
  // 器械上显示的卡路里，想抄就抄
  const [kcalText, setKcalText] = useState('')

  // ---------- 操场模式 ----------
  // 默认关着。只有"户外跑"才显示这个开关（室内机器自己会显示距离）。
  const [trackMode, setTrackMode] = useState(false)
  const [laneText, setLaneText] = useState('1') // 第几道
  const [lapsText, setLapsText] = useState('') // 跑了几圈，允许 12.5
  const [lapBaseText, setLapBaseText] = useState('400') // 第 1 道一圈多少米

  // 跑步类（户外跑 + 跑步机）：只有它们有"配速"这个概念，
  // 也只有它们的 MET 是按速度查表的。骑椭圆机和划船不会去想"每公里几分钟"。
  const isRunning = RUNNING_IDS.has(exerciseId)

  // ---------- 把界面上的文字换成数字 ----------
  // textToNumber 的规矩：空字符串 → null（没填）、'0' → 0（真的零）。
  // 所以判断"填没填"要用 !== null，不能写 > 0，否则填 0 会被当成没填。
  const minutes = textToNumber(minutesText)
  const distanceKm = textToNumber(distanceText)
  const paceSec = parsePaceText(paceText)
  const manualKcal = textToNumber(kcalText)

  const lane = textToNumber(laneText) ?? 1
  const laps = textToNumber(lapsText)
  const lapBase = textToNumber(lapBaseText) ?? 400

  // ---------- 算出最终要存的时长和距离 ----------
  // 分钟 → 秒。不足一秒的零头四舍五入掉（"30.5 分钟" → 1830 秒）
  const durationSec =
    minutes !== null && minutes > 0 ? Math.round(minutes * 60) : null

  // 距离有三个来源，优先级从上到下：
  //   ① 操场模式按道次圈数算的（开着就以它为准）
  //   ② 直接填的公里数
  //   ③ 没填距离但填了配速 —— 用「时长 ÷ 配速」倒推出来
  //      （跑步机上只看时间的人，经常记得自己跑多快却懒得算距离）
  let distanceM: number | undefined
  if (isRunning && trackMode) {
    if (laps !== null && laps > 0 && lapBase > 0 && lane > 0) {
      distanceM = Math.round(trackDistanceM(lane, laps, lapBase))
    }
  } else if (distanceKm !== null && distanceKm > 0) {
    distanceM = Math.round(distanceKm * 1000)
  } else if (isRunning && paceSec !== null && durationSec !== null) {
    // 秒 ÷ (秒/公里) = 公里，再 ×1000 换成米
    distanceM = Math.round((durationSec / paceSec) * 1000)
  }

  // 时长是唯一的必填项：跑了多久总知道，跑了多远不一定知道
  const canSave = durationSec !== null

  // 配速能算就算，算不出来（没填距离也没填配速）就整行不显示 ——
  // 绝不显示一个 0，那会让人以为你一秒跑完一公里
  const pace =
    durationSec !== null && distanceM !== undefined
      ? paceSecPerKm(durationSec, distanceM)
      : null

  // ---------- 消耗热量 ----------
  // 器械上抄来的优先；没抄才用公式估。
  // 估不出来（没有体重、或者这个动作没有 MET 数据）就是 null，不显示。
  const estimatedKcal = (() => {
    if (weightKg === undefined || durationSec === null) return null
    const met = metForCardio(exerciseId, durationSec, distanceM)
    if (met === null) return null
    return estimateKcal(met, weightKg, durationSec)
  })()
  const kcal =
    manualKcal !== null && manualKcal > 0 ? manualKcal : estimatedKcal
  const isManualKcal = manualKcal !== null && manualKcal > 0

  function handleSave() {
    if (durationSec === null) return
    // 只把"手填的"存进去。估算值不存 —— 它是算出来的，
    // 存下来的话以后改了公式或者体重，老记录里的数就不会跟着更新了。
    onSave(
      exerciseId,
      durationSec,
      distanceM,
      isManualKcal ? manualKcal : undefined,
    )
  }

  return (
    // 半透明遮罩 + 居中的面板，和"新建动作"那个弹窗同一套写法
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="animate-pop max-h-full w-full max-w-[440px] overflow-y-auto card rounded-2xl p-5">
        <div className="mb-4 flex items-center">
          <h2 className="flex-1 text-lg font-semibold text-ink">记一次有氧</h2>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 min-w-11 text-muted"
          >
            ✕
          </button>
        </div>

        {/* ---------- 练的什么（点一下就选中） ---------- */}
        <label className="mb-1 block text-sm text-ink-2">练的什么？</label>
        {/* overflow-x-auto = 一排放不下时可以左右滑，不会挤成两行占地方 */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {options.map((item) => {
            const active = item.id === exerciseId
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setExerciseId(item.id)}
                className={`min-h-11 shrink-0 rounded-full border px-4 text-sm ${
                  active
                    ? 'border-brand bg-brand font-semibold text-on-brand'
                    : 'border-line-2 text-ink-2'
                }`}
              >
                {item.name}
              </button>
            )
          })}
        </div>

        {/* ---------- 时长 / 距离 ---------- */}
        <div className="mb-4 flex gap-2">
          <div className="flex-1">
            <div className="mb-1 text-xs text-muted">时长 分钟（必填）</div>
            <NumberField
              value={minutesText}
              onChange={setMinutesText}
              placeholder="30"
            />
          </div>

          {/* 操场模式下距离是算出来的，就不用再手填了 —— 填两个反而会打架 */}
          {!(isRunning && trackMode) && (
            <div className="flex-1">
              <div className="mb-1 text-xs text-muted">距离 公里（可不填）</div>
              <NumberField
                value={distanceText}
                onChange={setDistanceText}
                placeholder="5"
              />
            </div>
          )}
        </div>

        {/* ---------- 配速（只有跑步类用得上） ----------
            跑步机上只看时间、不看距离的人很多，他们记得自己跑多快，
            但懒得算跑了多远。填了配速就能把距离倒推出来。

            这两栏都填了的话，以「距离」为准 —— 距离是量出来的，
            配速可能只是凭印象打的。 */}
        {isRunning && !trackMode && (
          <div className="mb-4">
            <div className="mb-1 text-xs text-muted">
              配速 分:秒/公里（没量距离就填它）
            </div>
            {/* 这个不用 NumberField：它的正则只放行数字和一个小数点，
                而配速是"5:30"这种写法，冒号根本打不进去 */}
            <input
              type="text"
              inputMode="decimal"
              value={paceText}
              onChange={(e) => {
                const next = e.target.value
                if (isPaceTextAllowed(next)) setPaceText(next)
              }}
              placeholder="5:30 或 5.5"
              className="w-full rounded-lg border border-line-2 bg-surface-2 px-2 py-2.5 text-center text-ink outline-none transition duration-150 ease-mech focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
          </div>
        )}

        {/* ---------- 操场模式（只有跑步类用得上） ---------- */}
        {isRunning && (
          <div className="mb-4 rounded-lg border border-line-2 p-3">
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={trackMode}
                onChange={(e) => setTrackMode(e.target.checked)}
                className="h-5 w-5 accent-[var(--color-brand)]"
              />
              操场模式（按道次和圈数算距离）
            </label>

            {trackMode && (
              <div className="mt-3">
                <div className="flex gap-2">
                  <div className="flex-[2]">
                    <div className="mb-1 text-xs text-muted">第几道</div>
                    <select
                      value={laneText}
                      onChange={(e) => setLaneText(e.target.value)}
                      className="min-h-11 w-full rounded-lg border border-line-2 bg-surface-2 px-2 text-ink outline-none transition duration-150 ease-mech focus:border-brand focus:ring-2 focus:ring-brand/25"
                    >
                      {/* 标准田径场最多 8 道 */}
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <option key={n} value={String(n)}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-[3]">
                    <div className="mb-1 text-xs text-muted">单圈 米</div>
                    <NumberField
                      value={lapBaseText}
                      onChange={setLapBaseText}
                      placeholder="400"
                    />
                  </div>
                  <div className="flex-[3]">
                    <div className="mb-1 text-xs text-muted">跑了 圈</div>
                    <NumberField
                      value={lapsText}
                      onChange={setLapsText}
                      placeholder="12.5"
                    />
                  </div>
                </div>

                {/* 算出来的结果立刻显示，省得人心里没底 */}
                <p className="mt-2 text-sm text-ink-2">
                  {distanceM !== undefined
                    ? `= ${formatDistance(distanceM)}`
                    : '填上圈数就能算出距离'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ---------- 热量（可选） ----------
            有氧器械上会显示"你消耗了多少千卡"。那是个估算（它也是按公式
            推的），但它至少是按现场情况推的，比我们拿通用表估的贴近。
            所以想抄就抄，抄了就用你的。 */}
        <div className="mb-4">
          <div className="mb-1 text-xs text-muted">
            热量 千卡（器械上显示了就抄，不填就估算）
          </div>
          <NumberField
            value={kcalText}
            onChange={setKcalText}
            placeholder="—"
          />
        </div>

        {/* ---------- 结果预览 ---------- */}
        {durationSec !== null && (
          <div className="mb-4 well p-3 text-sm text-ink-2">
            {formatDuration(durationSec)}
            {distanceM !== undefined && ` · ${formatDistance(distanceM)}`}
            {pace !== null && ` · 配速 ${formatPace(pace)}/公里`}

            {kcal !== null && (
              <div className="mt-1 text-xs text-muted">
                {formatKcal(kcal)}
                {isManualKcal
                  ? '（你从器械上抄的）'
                  : '（估算，不含运动后持续燃烧的部分）'}
              </div>
            )}

            {/* 没有体重就算不了热量。这里提一句，省得主人以为是坏了。
                真正改的地方在设置页，所以下面把路径也写清楚。 */}
            {kcal === null && weightKg === undefined && (
              <div className="mt-1 text-xs text-muted">
                想看热量估算，先去「设置 → 默认体重」填个体重
              </div>
            )}
          </div>
        )}

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
            onClick={handleSave}
            disabled={!canSave}
            className="press min-h-11 flex-1 rounded-lg bg-brand font-semibold text-on-brand disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
