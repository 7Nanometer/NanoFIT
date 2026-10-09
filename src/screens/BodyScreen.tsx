import { useState } from 'react'
import type { BodyFatSource, BodyMetric, Settings } from '../types'
import { SEXES, SEX_LABELS } from '../types'
import {
  readBodyMetrics,
  readSettings,
  upsertBodyMetric,
  writeBodyMetrics,
  writeSettings,
} from '../lib/storage'
import { formatDateCN, todayKey } from '../lib/date'
import { bodyComposition, textToNumber } from '../lib/calc'
import { NumberField } from '../components/NumberField'

// ============================================================
// 身体数据页（在"设置"里面）
// ============================================================
// 记录身高、体重、体脂。一天只留一条 —— 同一天再记一次是覆盖，不是新增。
//
// 【体脂率会自动算（2026-09-23 加的）】
// 公式来自主人：
//   BMI = 体重kg ÷ 身高m²
//   男性体脂率 = 1.2×BMI + 0.23×年龄 - 16.2
//   女性体脂率 = 1.2×BMI + 0.23×年龄 - 5.4
// 所以要问一次"性别"和"出生年份"（存在设置里，填一次永久记住）。
//
// 【两个体脂率必须分得清】
//   18% 实测    ← 你自己用体脂秤量了、手填的
//   ≈21.4% 估算 ← App 按公式算的
// 绝不混在一起。理由见 lib/calc.ts 顶部那段。
//
// 趋势图在阶段 5 做，这一页只管"记下来"和"看列表"。
// ============================================================

export function BodyScreen({ onBack }: { onBack: () => void }) {
  const [metrics, setMetrics] = useState<BodyMetric[]>(readBodyMetrics)
  const [settings, setSettings] = useState<Settings>(readSettings)
  const [dateText, setDateText] = useState(todayKey)
  const [weightText, setWeightText] = useState('')
  const [fatText, setFatText] = useState('')
  const [storageError, setStorageError] = useState(false)

  // 出生年份在界面上存一份"正在打的字"。
  // 打字途中不往储物柜里写，否则你刚打完一个 "1"，储物柜里就已经存了个 1。
  const [birthYearText, setBirthYearText] = useState(() =>
    settings.birthYear !== undefined ? String(settings.birthYear) : '',
  )

  // 身高预填成"上一次记的那个"。
  // 因为身高成年后基本不变，每次都要重新输一遍太烦。
  const [heightText, setHeightText] = useState(() => {
    const latest = latestOne(readBodyMetrics())
    return latest?.heightCm !== undefined ? String(latest.heightCm) : ''
  })

  const sorted = [...metrics].sort((a, b) => b.date.localeCompare(a.date))

  const weight = textToNumber(weightText)
  const height = textToNumber(heightText)
  const fat = textToNumber(fatText)
  // 三个都没填就不让存，免得记下一堆空记录
  const canSave = weight !== null || height !== null || fat !== null

  // 这一天之前如果已经有记录，把旧值先接过来（下面几处都要用）
  const existing = metrics.find((m) => m.date === dateText)

  // 算体脂率时实际用的体重 / 身高：
  //   优先用这两个格子里填的，空着就借之前记过的。
  //   体重只能借"同一天"的（借三个月前的体重没意义）；
  //   身高可以借更早的（成年后基本不变）。
  const weightInUse = weight ?? existing?.weightKg
  const heightInUse = height ?? heightNearby(metrics, dateText)

  // 边填边算：身高体重一填，下面立刻出现 BMI 和估算体脂率
  const preview = bodyComposition(
    weightInUse,
    heightInUse,
    settings.birthYear,
    settings.sex,
    dateText,
  )

  // 算不出来的时候，下面那块小方框该说哪句话。
  // 三条提示按"最该先解决哪件事"排列。
  const previewHint =
    settings.sex === undefined || settings.birthYear === undefined
      ? '把上面的「个人资料」填完，这里就会自动算出体脂率。'
      : weightInUse === undefined || heightInUse === undefined
        ? '填了身高和体重，这里就会自动算出体脂率。'
        : '数字超出合理范围了（身高 100–250 cm、体重 20–300 kg），先不算。检查一下是不是把 175 打成了 1.75。'

  // 个人资料改动后立刻存进储物柜，不用等点"保存"
  function saveProfile(patch: Partial<Settings>) {
    const next = { ...settings, ...patch }
    const ok = writeSettings(next)
    setSettings(next)
    setStorageError(!ok)
  }

  function handleBirthYear(text: string) {
    setBirthYearText(text)
    const n = textToNumber(text)
    if (n === null) {
      // 把格子清空了，就把记住的年份也一起删掉
      saveProfile({ birthYear: undefined })
    } else if (n >= 1900 && n <= 2100) {
      // 只有看起来像个完整年份时才写进去，避免存下一堆中间状态
      saveProfile({ birthYear: Math.round(n) })
    }
  }

  function handleSave() {
    if (!canSave) return

    // ---------- 体脂率怎么定 ----------
    // 你自己填了 → 用你填的，标"实测"
    // 你没填     → 让公式算一个，标"估算"
    // 算不出来   → 沿用这条记录原来存着的那个
    const measured = fat !== null
    const estimate = measured
      ? null
      : bodyComposition(
          weightInUse,
          heightInUse,
          settings.birthYear,
          settings.sex,
          dateText,
        )

    let bodyFat: number | undefined
    let bodyFatSource: BodyFatSource | undefined
    if (measured) {
      bodyFat = fat ?? undefined
      bodyFatSource = 'measured'
    } else if (estimate !== null) {
      bodyFat = estimate.bodyFat
      bodyFatSource = 'formula'
    } else {
      bodyFat = existing?.bodyFat
      bodyFatSource = existing?.bodyFatSource
    }

    // ---------- 身高体重怎么定 ----------
    // 【填了的格子覆盖旧值，空着的格子沿用旧值】
    // 为什么不是整条替换掉：假设你今天先称了体重、存了一次，
    // 然后又想起身高没填、补存一次。整条替换的话，第二次会把刚记的体重弄丢。
    //
    // 注意存进记录的 heightCm 只用"这一天自己填的"，
    // 不去存上面借来的那个身高 —— 记录要如实反映那天量了什么。
    const ok = upsertBodyMetric({
      date: dateText,
      weightKg: weightInUse,
      heightCm: height ?? existing?.heightCm,
      bodyFat,
      bodyFatSource,
    })

    setMetrics(readBodyMetrics())
    setStorageError(!ok)
    // 清空体重和体脂（下次量的数字肯定不一样），保留身高（基本不变）
    setWeightText('')
    setFatText('')
  }

  function handleDelete(date: string) {
    if (!window.confirm(`删掉 ${formatDateCN(date)} 这条记录？`)) return
    const next = metrics.filter((m) => m.date !== date)
    const ok = writeBodyMetrics(next)
    setMetrics(next)
    setStorageError(!ok)
  }

  return (
    <div>
      {/* ---------- 顶部 ---------- */}
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="press inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line-2 px-3 text-sm text-ink-2"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-4 w-4 shrink-0"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
          返回
        </button>
        <h1 className="flex-1 text-lg font-semibold">身体数据</h1>
      </div>

      {storageError && (
        <div className="mb-3 rounded-lg border border-brand bg-brand/10 p-3 text-sm text-brand">
          存不进去了，可能是手机存储满了。请先告诉我。
        </div>
      )}

      {/* ---------- 个人资料（体脂率公式要用的两样） ---------- */}
      <div className="ledger mb-2.5 p-3.5">
        <div className="t-label mb-1">个人资料</div>
        <p className="mb-3 text-xs text-muted">
          体脂率公式要用这两样。填一次就永久记住，以后不用再管。
        </p>

        {/* 性别只有两个选项，用两个按钮比下拉框快得多 */}
        <div className="mb-3 flex gap-2">
          {SEXES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => saveProfile({ sex: s })}
              className={`min-h-11 flex-1 rounded-lg border text-sm ${
                settings.sex === s
                  ? 'border-brand bg-brand/10 font-semibold text-brand'
                  : 'border-line-2 text-ink-2'
              }`}
            >
              {SEX_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="mb-1 text-xs text-muted">出生年份</div>
        <NumberField
          value={birthYearText}
          onChange={handleBirthYear}
          placeholder="1995"
        />
        <p className="mt-1 text-xs text-muted">
          存的是年份不是年龄 —— 过生日的时候年龄会自己长一岁，你永远不用管它。
        </p>
      </div>

      {/* ---------- 录入 ---------- */}
      <div className="ledger mb-2.5 p-3.5">
        <div className="t-label mb-3">记一次</div>

        <label className="mb-1 block text-sm text-ink-2">量的是哪一天</label>
        <input
          type="date"
          value={dateText}
          onChange={(e) => setDateText(e.target.value)}
          className="mb-3 w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-ink outline-none transition duration-150 ease-mech focus:border-brand focus:ring-2 focus:ring-brand/25"
        />

        <div className="mb-3 flex gap-3">
          <div className="flex-1">
            <div className="mb-1 text-xs text-muted">身高 cm</div>
            <NumberField
              value={heightText}
              onChange={setHeightText}
              placeholder="175"
            />
          </div>
          <div className="flex-1">
            <div className="mb-1 text-xs text-muted">体重 kg</div>
            <NumberField
              value={weightText}
              onChange={setWeightText}
              placeholder="70.5"
            />
          </div>
          <div className="flex-1">
            <div className="mb-1 text-xs text-muted">体脂 %</div>
            <NumberField
              value={fatText}
              onChange={setFatText}
              placeholder="18"
            />
          </div>
        </div>

        {/* ---------- 算给你看 ---------- */}
        <div className="mb-3 well p-3">
          {preview !== null ? (
            <>
              <div className="text-sm text-ink-2">
                BMI{' '}
                <span className="font-semibold text-ink">
                  {preview.bmi.toFixed(1)}
                </span>
                <span className="text-muted"> · </span>
                估算体脂率{' '}
                <span className="font-semibold text-ink">
                  {preview.bodyFat}%
                </span>
                {fat !== null && (
                  <>
                    <span className="text-muted"> · </span>
                    你填的 <span className="font-semibold text-ink">{fat}%</span>
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">
                公式算的是"身高体重年龄性别是这样的人平均多少"，不是测出来的。
                肌肉多的人会被算高。你自己称的（实测）永远优先。
              </p>
            </>
          ) : (
            <p className="text-xs text-muted">{previewHint}</p>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="press min-h-11 w-full rounded-lg bg-brand font-semibold text-on-brand shadow-[var(--elev-brand)] disabled:bg-surface-2 disabled:text-muted disabled:shadow-none disabled:border disabled:border-line"
        >
          保存
        </button>

        <p className="mt-2 text-xs text-muted">
          三个格子填哪个都行，不用全填。体脂那一格空着的话，App 会按公式帮你估一个。
          同一天再存一次是补齐，填了的格子换新值，空着的沿用旧值。
        </p>
      </div>

      {/* ---------- 历史列表 ---------- */}
      <h2 className="sec">
        <span className="t-label">记录（{sorted.length} 条）</span>
        <span className="sec-rule" aria-hidden="true" />
      </h2>

      {sorted.length > 0 && (
        <p className="mb-2.5 text-xs text-muted">
          「实测」= 你自己称的 ·「估算」= App 按公式算的
        </p>
      )}

      {sorted.length > 0 && (
        <div className="ledger divide-y divide-line">
          {sorted.map((m) => (
            <div key={m.date} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-ink">
                  {formatDateCN(m.date)}
                </div>
                <div className="mt-0.5 text-xs text-muted">{describe(m)}</div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(m.date)}
                className="press -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xs text-muted"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">
          还没记过。上面填一个数，点保存就开始了。
        </p>
      )}
    </div>
  )
}

// ============================================================
// 下面都是小工具函数
// ============================================================

// 把一条记录写成"70.5 kg · 175 cm · ≈21.4% 估算"这样
function describe(m: BodyMetric): string {
  const parts: string[] = []
  if (m.weightKg !== undefined) parts.push(`${m.weightKg} kg`)
  if (m.heightCm !== undefined) parts.push(`${m.heightCm} cm`)
  const fat = describeFat(m)
  if (fat !== '') parts.push(fat)
  return parts.length > 0 ? parts.join(' · ') : '（空）'
}

// 体脂率单独写，因为要带上"是称的还是算的"。
// 「≈」这个符号本身就是"约等于"，看到它就知道不是称出来的。
function describeFat(m: BodyMetric): string {
  if (m.bodyFat === undefined) return ''
  // 老记录没有 bodyFatSource 这个字段，一律当成"自己填的"
  return m.bodyFatSource === 'formula'
    ? `≈${m.bodyFat}% 估算`
    : `${m.bodyFat}% 实测`
}

// 找出日期最靠后的那一条
function latestOne(list: BodyMetric[]): BodyMetric | undefined {
  return [...list].sort((a, b) => b.date.localeCompare(a.date))[0]
}

// 找出"这一天或它之前"最近一次量过的身高。
//
// 【为什么要这个】身高成年后基本不变，没必要每次称体重都重填一遍。
// 只往前找、不往后找 —— 用未来的数据算过去，那就成了作弊。
function heightNearby(list: BodyMetric[], date: string): number | undefined {
  const prior = list
    .filter((m) => m.heightCm !== undefined && m.date <= date)
    // 日期是 '2026-09-23' 这种格式，按文字排序的结果正好等于按时间排序
    .sort((a, b) => b.date.localeCompare(a.date))
  return prior[0]?.heightCm
}
