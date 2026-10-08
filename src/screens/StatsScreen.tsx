import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BodyMetric, Exercise, WorkoutSession } from '../types'
import { cardioIdSet, mergeExercises } from '../data/exercises'
import {
  readBodyMetrics,
  readCustomExercises,
  readSessions,
  readSettings,
} from '../lib/storage'
import {
  ONE_RM_MIN_POINTS,
  bodySeries,
  cardioDistanceSeries,
  exerciseSeries,
  lastSessionDate,
  lastSessionVolume,
  niceAxis,
  oneRmSeries,
  splitSessions,
  thisMonthKcal,
  thisWeekCardioSec,
  thisWeekCount,
  thisWeekKcal,
  thisWeekStartKey,
  thisWeekVolume,
  usedExerciseIds,
  weeklyVolumes,
} from '../lib/stats'
import {
  averageSessionSec,
  dailyDurations,
  dailyKcal,
  thisWeekDurationSec,
} from '../lib/stats'
import type { OneRmPoint } from '../lib/stats'
import { formatDateCN } from '../lib/date'
import { formatDuration } from '../lib/calc'
import {
  explainSessionKcal,
  formatKcal,
  latestWeightKg,
  metLabel,
  resolveWeightKg,
  roundKcal,
} from '../lib/kcal'
import type { KcalExplain } from '../lib/kcal'
import { ChartCard } from '../components/ChartCard'
import { StatTile } from '../components/StatTile'
import { chartColors } from '../lib/theme'

// ============================================================
// 统计页
// ============================================================
// 四组内容：
//   1. 顶部两个大数字：本周练了多少、最近一次练了多少
//   2. 柱状图：最近 8 周每周的总容量
//   3. 三张折线图：选定的那个动作，重量 / 容量 / 估算 1RM 的变化
//   4. 身体数据趋势
//
// 【有一条设计原则，改的时候请守住】
// 一张图只画一个指标，绝不在同一张图里放两个纵轴。
// 比如"重量"和"容量"数值差了上百倍，硬画在一起，
// 其中一条会被压成贴着底边的一条直线，什么也看不出来。
// ============================================================

// ============================================================
// 图表配色
// ============================================================
// 【为什么图表这里不能像别的页面那样直接写 bg-brand 这种类名】
// recharts 画的是 SVG 图，它要的是**实实在在的颜色值**（#ff4d2e 这种），
// 不认"背景用主色"这种类名。所以颜色必须在这里以值的形式交给它。
//
// 【那怎么让它跟着日间/夜间变】
// chartColors() 现问浏览器："现在 --color-brand 是多少？"
// 问到的永远是当前主题的那套值 —— 颜色的定义仍然只有 src/index.css 一处，
// 这里不会跟它写重复，也就不会写岔。
//
// 外面套一层 useState(chartColors) 是有意为之：
// 读页面样式算"副作用"，包成 useState 的惰性初始化，
// 就能保证每次进入统计页只读一次、读完存住，而不是每次重画都去问一遍。
//
// 【★以后加新图表，颜色都从这里拿，不要写死十六进制】
// 写死的后果：切到日间模式时那条线还是深色模式的颜色，白底上几乎看不见。
// ============================================================

// 纵轴上的长数字加上千分位逗号：5240 → 5,240
function formatAxis(value: number): string {
  return value.toLocaleString()
}

// 手指点在图上时弹出来的那个小框的样式。
// 不写这个的话，recharts 默认给一个白底黑框，在深色界面上非常刺眼。
function tooltipStyle(C: ReturnType<typeof chartColors>) {
  return {
    contentStyle: {
      background: C.surface,
      border: `1px solid ${C.line}`,
      borderRadius: 8,
      fontSize: 12,
    },
    labelStyle: { color: C.muted },
    itemStyle: { color: C.ink },
  }
}

export function StatsScreen() {
  const [sessions] = useState<WorkoutSession[]>(readSessions)
  const [customExercises] = useState<Exercise[]>(readCustomExercises)
  const [bodyMetrics] = useState<BodyMetric[]>(readBodyMetrics)
  // 当前主题下的图表配色，下面 C.brand 这种写法都来自它
  const [C] = useState(chartColors)

  const allExercises = mergeExercises(customExercises)

  // ---------- 力量和有氧分成两条线 ----------
  //
  // 【为什么必须分】
  // 有氧记录的 weightKg 和 reps 都是 0（见 types.ts 的说明）。混进力量统计
  // 的话，周容量会被拉平、单动作曲线会冒出一串贴在 0 上的点。
  //
  // 【分完之后的规矩】
  //   下面凡是"容量 / 最大重量 / 1RM"的图，一律只吃 lifting 那一份。
  //   有氧的数据在最下面单独有一块。
  const cardioIds = cardioIdSet(allExercises)
  const { lifting, cardio } = splitSessions(sessions, cardioIds)

  // 下拉框里只列"真的练过"的动作。全列出来会很长，而且选到没练过的是一张空图。
  //
  // ★ 有氧动作也要排除：它们的重量永远是 0，选进去就是一条贴着底的直线。
  //   有氧的数据在最下面单独看。
  const usedIds = usedExerciseIds(lifting)
  const usedExercises = allExercises.filter(
    (e) => usedIds.includes(e.id) && !cardioIds.has(e.id),
  )

  // 当前选中的动作，默认选第一个练过的。
  // 注意不能写成 usedIds[0] —— 那个可能是个有氧动作，下拉框里根本没有它，
  // 选中的会是一个不存在的选项，界面上显示成空白。
  const [selectedId, setSelectedId] = useState(usedExercises[0]?.id ?? '')

  const weeks = weeklyVolumes(lifting, 8)
  const points = selectedId === '' ? [] : exerciseSeries(lifting, selectedId)
  // 1RM 那条曲线用的是另一套算法（滚动 90 天 + 只算 12 次以内的组），
  // 所以单独算一份。两个系列的数据点日期是一样的，但值不一样。
  const oneRmPoints =
    selectedId === '' ? [] : oneRmSeries(lifting, selectedId)
  const body = bodySeries(bodyMetrics)

  // 有氧那两块（只统计有氧记录，一条力量都不掺）
  const cardioSec = thisWeekCardioSec(cardio)
  const cardioPoints = cardioDistanceSeries(cardio)

  // ---------- 消耗热量（估算）----------
  //
  // 必须要有体重才算得出来。优先「身体数据」里最近一次，
  // 没记过才用设置里那个默认体重；两个都没有就整节不显示、改提示。
  const [settings] = useState(readSettings)
  const weightKg = resolveWeightKg(bodyMetrics, settings)

  const weekKcal = thisWeekKcal(sessions, weightKg, cardioIds)
  const monthKcal = thisMonthKcal(sessions, weightKg, cardioIds)
  // 图上是"最近 14 天，一天一根柱子"（2026-09-30 从"最近 8 周"改的）。
  // 天数写在这里，理由见 stats.ts 的 dailyKcal 那段注释。
  const kcalPoints = dailyKcal(sessions, weightKg, cardioIds, 14)

  // 纵轴刻度。两个 true 的含义见下面柱状图那段注释。
  const kcalAxis = niceAxis(
    kcalPoints.flatMap((p) => [p.strength, p.cardio]),
    true,
  )

  // ---------- 「看算式」要列的东西 ----------
  //
  // 把本周每一次训练用到的输入全摆出来：哪一档、MET 多少、体重、
  // 整场多久、其中有氧多久、力量按多久算、乘出来是多少。
  // 用户拿这些就能自己核对，不用每次都来问"为什么是这个数"。
  //
  // 【为什么只列本周，不列本月】
  // 上面一个卡片是本周、一个是本月。本月可能有十几条，全列出来太长。
  // 两个数用的是同一套算法累加的，看懂本周就会看本月。
  //
  // 【起点必须和 thisWeekKcal 用同一个】
  // 各算各的话，哪天"一周从周几开始"这个规矩变了，就会出现
  // "卡片说本周 300，明细只列出 200 的量"这种自相矛盾。
  const [showFormula, setShowFormula] = useState(false)
  const weekStart = thisWeekStartKey()
  const weekRows = sessions
    .filter((s) => s.date >= weekStart)
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((s) => {
      const explain = explainSessionKcal(s, weightKg, cardioIds)
      return explain === null ? [] : [{ session: s, explain }]
    })

  // 体重是从哪来的 —— 用户得知道这个 80 是谁。
  // 优先「身体数据」，没记过才用设置里那个默认值（见 resolveWeightKg）。
  const weightFromBody = latestWeightKg(bodyMetrics) !== undefined

  // ---------- 训练时长（★ 2026-09-24 加的）----------
  //
  // 时长的算法**只有一份**（kcal.ts 的 sessionSeconds），这里只做汇总。
  // 算不出来的那些（老记录没记开始时间）会被这几个函数跳过，
  // 不拿 0 顶替 —— 0 是"练了 0 秒"，那是另一个意思。
  const weekDurationSec = thisWeekDurationSec(sessions)
  const avgSec = averageSessionSec(sessions)
  // 30 天：按天画，一个月足够看出"最近练得久了还是短了"
  const durationPoints = dailyDurations(sessions, 30)

  // 柱状图的纵轴刻度。第二个参数 true = 一定要含 0 ——
  // 柱状图里"柱子的高度"直接表示大小，不從 0 起的话比例是骗人的。
  const weeksAxis = niceAxis(
    weeks.map((w) => w.volume),
    true,
  )

  const selectedName =
    usedExercises.find((e) => e.id === selectedId)?.name ?? ''

  // ---------- 一条记录都没有时，直接给提示，不画一堆空图 ----------
  if (sessions.length === 0) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">统计</h1>
        <p className="py-12 text-center text-sm text-muted">
          还没有任何数据。
          <br />
          去「训练」那一页记几次，这里就会长出图表来。
        </p>
      </div>
    )
  }

  const hasWeight = body.some((b) => b.weight !== undefined)
  const hasFat = body.some((b) => b.bodyFat !== undefined)
  const hasHeight = body.some((b) => b.height !== undefined)

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">统计</h1>

      {/* ---------- 1. 顶部两个大数字 ----------
          两个都用 lifting（只含力量的那一份），所以数字里一点有氧都不掺。

          "练了 N 次"数的是**全部**训练，包括只跑了步没撸铁的那些天 ——
          跑了步也算练了一次，不该被漏掉。 */}
      <div className="mb-3 flex gap-2">
        <StatTile
          label="本周总容量"
          value={thisWeekVolume(lifting).toLocaleString()}
          hint={`kg · 练了 ${thisWeekCount(sessions)} 次`}
        />
        <StatTile
          label="最近一次"
          value={lastSessionVolume(lifting).toLocaleString()}
          hint={
            lifting.length > 0
              ? `kg · ${formatDateCN(lastSessionDate(lifting))}`
              : 'kg · 还没有力量记录'
          }
        />
      </div>

      {/* ---------- 时长那两个数字（★ 2026-09-24 加的）----------
          ★ 为什么另起一行，而不是塞进上面那一排当第三个：
          "1 小时 24 分"在大字号下有 8 个字符宽，挤在三分之一行里会折成两行，
          把那一排撑得高低不齐。**实测过才这么定的**，不是凭感觉。 */}
      <div className="mb-3 flex gap-2">
        <StatTile
          label="本周练了多久"
          value={formatDuration(weekDurationSec)}
          hint="含组间休息"
        />
        <StatTile
          label="平均每次"
          value={avgSec === null ? '—' : formatDuration(avgSec)}
          hint={avgSec === null ? '还没有能算出时长的训练' : '所有训练的平均'}
        />
      </div>

      {/* ---------- 2. 每周总容量 ----------
          一条力量记录都没有时不画：8 根高度为 0 的柱子配上一条
          从 -1 到 1 的刻度，看着就像 App 坏了，不如什么都不显示。 */}
      {lifting.length > 0 && (
        <ChartCard
          title="每周总容量"
          subtitle="最近 8 周，每周练的总量（kg）。只算力量训练，有氧不算进来。"
          rows={weeks.map((w) => ({
            周: w.label,
            容量: w.volume.toLocaleString(),
          }))}
          columns={[
            { key: '周', label: '那一周（周一的日期）' },
            { key: '容量', label: '总容量 kg' },
          ]}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={weeks}
              // 【这个 left 不能是负数】留不出空间的话，纵轴上「12,000」这种
              // 五位数的标签会被切掉左边一位，显示成「2,000」——
              // 数字看着没毛病，但整整少了一位，很难发现。
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={C.line}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                stroke={C.muted}
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                stroke={C.muted}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatAxis}
                domain={weeksAxis.domain}
                ticks={weeksAxis.ticks}
                width={52}
              />
              <Tooltip
                {...tooltipStyle(C)}
                formatter={(value) => [
                  `${Number(value).toLocaleString()} kg`,
                  '总容量',
                ]}
                labelFormatter={(label) => `${String(label)} 那一周`}
              />
              <Bar dataKey="volume" fill={C.brand} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ---------- 训练时长（★ 2026-09-24 加的）----------
          一次训练都没记（或者老的都算不出时长）时不画：
          一张空图配上一条 0 到 1 的刻度，看着就像 App 坏了。 */}
      {durationPoints.length > 0 && (
        <>
          <h2 className="mb-2.5 mt-6 flex items-center gap-3">
            <span className="t-label">训练时长</span>
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
          </h2>
          <ProgressChart
            points={durationPoints}
            dataKey="minutes"
            title="每次训练有多久"
            subtitle="按天合并：一天练两次算那天的总时长。含组间休息。"
            unit="分钟"
            columnLabel="时长"
            color={C.brand}
            // 按天合并之后，光看分钟数看不出那天是一次还是两次 ——
            // 多给一列把这个说清楚
            extraLabel="那天练了几次"
            extra={(p) => `${p.count} 次`}
          />
        </>
      )}

      {/* ---------- 3. 单个动作的进步 ----------
          一个力量动作都没练过（比如刚装了 App 只跑过步）时，整块不显示 ——
          显示一个没有选项的下拉框只会让人以为坏了。 */}
      {usedExercises.length > 0 && (
        <>
          <h2 className="mb-2.5 mt-6 flex items-center gap-3">
            <span className="t-label">单个动作的进步</span>
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
          </h2>

          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mb-3 w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-ink outline-none transition duration-150 ease-mech focus:border-brand focus:ring-2 focus:ring-brand/25"
          >
            {usedExercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>

          {points.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              这个动作还没有记录
            </p>
          ) : (
            <>
              <ProgressChart
                points={points}
                dataKey="maxWeight"
                title="最大重量"
                subtitle={`${selectedName} · 每次练到的最重那一下（kg）`}
                unit="kg"
                columnLabel="最大重量"
                color={C.brand}
              />
              <ProgressChart
                points={points}
                dataKey="volume"
                title="总容量"
                subtitle={`${selectedName} · 每次练的总量（kg）`}
                unit="kg"
                columnLabel="总容量"
                color={C.chart2}
                startFromZero
              />
              {/* ---------- 估算 1RM ----------
                  这一块和上面两张口径不一样，所以单独写。上面两张画的是
                  "每次训练做了什么"，这条画的是"最近大概能举多少" ——
                  算法在 oneRmSeries 里，多一条 PR 线和上面那个大数字。 */}
              {oneRmPoints.length > 0 && (
                <div className="mb-3 flex gap-2">
                  <StatTile
                    label="当前估算 1RM"
                    value={`${oneRmPoints[oneRmPoints.length - 1].oneRm} kg`}
                    hint={`${selectedName} · 截至 ${formatDateCN(
                      oneRmPoints[oneRmPoints.length - 1].date,
                    )}`}
                  />
                </div>
              )}

              {oneRmPoints.length >= ONE_RM_MIN_POINTS ? (
                <>
                  <OneRmChart points={oneRmPoints} name={selectedName} />
                  {/* 这段说明不是客套话。不知道口径的人会把它当成
                      "我当天最好的成绩"，然后觉得数字偏低。 */}
                  <p className="mt-1 card p-3 text-xs text-muted">
                    曲线画的是"截至那天，往前 90 天里最好的水平"，
                    不是当天最好那一组 —— 所以它反映的是能力的变化，
                    不会因为今天练法不同就上下跳。
                    <br />
                    虚线是历史最高，只升不降，用来看哪天突破了。
                    <br />
                    只统计 12 次以内的组：次数越多，Epley 公式越会高估
                    （70kg 做 20 次会推出 116kg，但那个人举不起 116kg 一次）。
                  </p>
                </>
              ) : (
                <p className="card p-3 text-center text-sm text-muted">
                  再练几次就能看到趋势
                  {oneRmPoints.length === 0 && (
                    <>
                      <br />
                      这个动作还缺"12 次以内、带重量"的记录，有记录了才估得出来
                    </>
                  )}
                </p>
              )}
            </>
          )}
        </>
      )}

      {/* ---------- 4. 有氧 ----------
          只有记过有氧才显示这一块。

          【为什么单独一节，不并进上面的图】
          单位不一样：力量那边是 kg，这边是分钟和公里。硬画在一张图上，
          数值差着好几个数量级，会互相压平（这也是这个项目"一张图只画
          一个指标"的由来）。 */}
      {(cardioSec > 0 || cardioPoints.length > 0) && (
        <>
          <h2 className="mb-2.5 mt-6 flex items-center gap-3">
            <span className="t-label">有氧</span>
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
          </h2>

          <div className="mb-3 flex gap-2">
            <StatTile
              label="本周有氧"
              value={formatDuration(cardioSec)}
              hint="总时长"
            />
          </div>

          {cardioPoints.length > 0 && (
            <ProgressChart
              points={cardioPoints}
              dataKey="km"
              title="单次距离"
              subtitle="每次有氧的距离（公里）。没填距离的那些次不会画上来。"
              unit="公里"
              columnLabel="距离"
              color={C.chart2}
              startFromZero
            />
          )}
        </>
      )}

      {/* ---------- 5. 消耗热量（估算） ----------
          没有体重就算不出来。整节不显示，改成告诉主人去哪填 ——
          显示一堆 0 或者"—"只会让人以为是坏的。 */}
      {weightKg === undefined ? (
        <>
          <h2 className="mb-2.5 mt-6 flex items-center gap-3">
            <span className="t-label">消耗热量（估算）</span>
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
          </h2>
          <p className="card p-3 text-sm text-muted">
            填个体重就能看到热量统计。
            <br />
            去「设置 → 默认体重」填一个，或者在「设置 → 身体数据」里记一次
            —— 后者更准，而且能顺便看体重趋势。
          </p>
        </>
      ) : (
        <>
          <h2 className="mb-2.5 mt-6 flex items-center gap-3">
            <span className="t-label">消耗热量（估算）</span>
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
          </h2>

          <div className="mb-3 flex gap-2">
            {/* 拆分那两个数也先过 roundKcal，否则会出现
                "总共约 520，其中力量 188、有氧 330" 这种前后对不上 */}
            <StatTile
              label="本周消耗"
              value={formatKcal(weekKcal.total)}
              hint={`力量 ${roundKcal(weekKcal.strength)} + 有氧 ${roundKcal(weekKcal.cardio)}`}
            />
            <StatTile
              label="本月消耗"
              value={formatKcal(monthKcal.total)}
              hint={`力量 ${roundKcal(monthKcal.strength)} + 有氧 ${roundKcal(monthKcal.cardio)}`}
            />
          </div>

          {/* ---------- 看算式（★ 2026-09-24 加的）----------
              加这块的直接原因：有人发现热量明显偏低，但页面上只有结果、
              没有任何过程，他只能靠反推才猜出"是不是用了低强度那一档"，
              然后来问。把这些输入摆出来，他自己就能看出来。 */}
          <button
            type="button"
            onClick={() => setShowFormula(!showFormula)}
            className="press mb-3 min-h-11 w-full rounded-lg border border-line-2 px-3 text-sm text-ink-2"
          >
            {showFormula ? '收起算式' : '这些数是怎么算出来的？'}
          </button>

          {showFormula && (
            <div className="mb-3 card p-3 text-xs text-muted">
              <div className="text-ink-2">用到的数据</div>
              <div className="mt-0.5">
                体重 {weightKg} kg（
                {weightFromBody
                  ? '来自「身体数据」里最近一次'
                  : '来自「设置 → 默认体重」'}
                ）
              </div>
              <div className="mt-0.5">
                公式 消耗 =（MET − 1）× 体重(kg) × 时长(小时)
              </div>
              <div className="mt-0.5">
                减 1 是为了只算"运动额外多消耗的"，不含躺着也要烧的基础代谢
              </div>

              <div className="mt-3 text-ink-2">
                本周的每一次训练
                {weekRows.length > 0 && `（共 ${weekRows.length} 次）`}
              </div>
              {weekRows.length === 0 ? (
                <div className="mt-1">这周还没练过。</div>
              ) : (
                weekRows.map((row) => (
                  <KcalStepRow
                    key={row.session.id}
                    date={row.session.date}
                    explain={row.explain}
                    weightKg={weightKg}
                  />
                ))
              )}
            </div>
          )}

          <ChartCard
            title="每日消耗"
            // 最后那句"没练的日子是空的"不是废话：一天一根柱子之后，
            // 图上会真的出现一串贴着底的 0，不说清楚会以为图坏了。
            subtitle="最近 14 天。力量和有氧分开画，因为它们的算法完全不同。没练的日子是空的，不是图坏了。"
            rows={kcalPoints.map((p) => ({
              日: p.label,
              力量: p.strength.toLocaleString(),
              有氧: p.cardio.toLocaleString(),
            }))}
            columns={[
              { key: '日', label: '那一天' },
              { key: '力量', label: '力量训练，千卡' },
              { key: '有氧', label: '有氧，千卡' },
            ]}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={kcalPoints}
                // left 不能是负数，原因和上面那张柱状图一样：
                // 留不出空间的话五位数标签会被切掉一位
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={C.line}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  stroke={C.muted}
                  fontSize={11}
                  tickLine={false}
                  // 14 个 '9/24' 在手机上横着排不下，交给这两句抽稀
                  // （和下面那几张折线图用同一组常量，别各写各的）
                  minTickGap={X_TICK_MIN_GAP}
                  interval={X_TICK_INTERVAL}
                />
                <YAxis
                  stroke={C.muted}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatAxis}
                  domain={kcalAxis.domain}
                  ticks={kcalAxis.ticks}
                  width={52}
                />
                <Tooltip
                  {...tooltipStyle(C)}
                  formatter={(value, name) => [
                    `${Number(value).toLocaleString()} 千卡`,
                    String(name),
                  ]}
                  labelFormatter={(label) => `${String(label)} 那一天`}
                />
                <Bar
                  dataKey="strength"
                  name="力量"
                  fill={C.brand}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="cardio"
                  name="有氧"
                  fill={C.chart2}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* 这段说明不是客套话，是这个功能的一部分。
              热量是估的，界面上必须说清楚 —— 不写的话，
              主人拿它跟手环一对数字发现差很多，会以为是算错了。 */}
          <p className="mt-1 card p-3 text-xs text-muted">
            这是估算值，不含运动后持续燃烧的部分。
            <br />
            算法是（MET − 1）× 体重 × 时长，减掉 1 是为了刨去"躺着也要烧"
            的基础代谢，所以它比手环上那个数小 —— 手环给的常常是总消耗。
            <br />
            力量和有氧各用一套 MET 表推算，误差约 10–20%。
            手环和器械上显示的卡路里同样是估算，和这里对不上是正常的。
          </p>
        </>
      )}

      {/* ---------- 6. 身体数据 ---------- */}
      {(hasWeight || hasFat || hasHeight) && (
        <>
          <h2 className="mb-2.5 mt-6 flex items-center gap-3">
            <span className="t-label">身体数据</span>
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
          </h2>

          {hasWeight && (
            <BodyTrendChart
              body={body}
              dataKey="weight"
              title="体重"
              unit="kg"
            />
          )}
          {hasFat && (
            <BodyTrendChart
              body={body}
              dataKey="bodyFat"
              title="体脂"
              unit="%"
            />
          )}
          {hasHeight && (
            <BodyTrendChart
              body={body}
              dataKey="height"
              title="身高"
              unit="cm"
            />
          )}
        </>
      )}
    </div>
  )
}

// ---------- 横轴日期标签的密度 ----------
//
// 【这两个数是实测出来的，不是拍脑袋】
// 在 375px 的手机宽度下，图表的实际画布只有 317px 宽，
// 而一个 '9/23' 这样的日期标签大约 18px。
//
// 只留 24px 间距的话，标签之间只剩 6px 的空隙 —— 数据点一多看着就发闷。
// 放宽到 40px，标签之间留出 20 多像素，一眼能看清又不浪费地方。
//
// 【为什么还要 interval】
// minTickGap 是 recharts 自己算"挤不下就少显示几个"的阈值；
// interval="preserveStartEnd" 是明确告诉它"头一个和最后一个日期一定要显示"。
// 最后那个日期是"最近一次"，看不到会很难受 —— 别让它被自动省掉。
const X_TICK_MIN_GAP = 40
const X_TICK_INTERVAL = 'preserveStartEnd' as const

// ============================================================
// 「看算式」里的一次训练
// ============================================================
// 把这次训练用到的每一样输入都写出来，让人能自己核对：
// 哪一档、MET 多少、体重多少、按多长时间算的、乘出来是多少。
//
// 【为什么不自己算，全部用算好的数】
// 这里的每一个数都来自 lib/kcal.ts 的 explainSessionKcal()，
// 和页面上那个总数是**同一份算法**出来的。在这里重算一遍的话，
// 哪天公式改了，说明文字就会和数字对不上 —— 用户会照着一个错的
// 算式去核对，然后怀疑是自己算错了。
//
// 【为什么要显示"按中等算"这种话】
// 老记录没存过强度档位，系统用的是"中等"兜底。不说明的话，
// 用户会以为当初就是按中等判的 —— 那是两回事。
function KcalStepRow({
  date,
  explain,
  weightKg,
}: {
  date: string
  explain: KcalExplain
  weightKg: number
}) {
  // 小时保留两位小数 —— 和公式里那个"时长(小时)"对得上就行。
  // 42 分钟 → 0.70 小时。
  const hours = (sec: number) => (sec / 3600).toFixed(2)

  const hasCardioKcal = explain.cardioKcal > 0
  const hasStrengthKcal = explain.strengthKcal > 0

  return (
    <div className="mt-2 border-t border-line pt-2">
      <div className="text-ink-2">{formatDateCN(date)}</div>

      {/* 第一行：用了哪一档、总共多久
          ★ 纯有氧的场次【不能】显示强度档位。那个概念只对力量训练成立，
            而 explainSessionKcal 为了算数会给它填一个兜底的"中等"——
            照直显示的话会写出"中等 3.5（老记录没存档位）"，
            既难懂又是假的：那次训练压根没有"力量强度"这回事。
            strengthSec 是不是 null，就是"有没有力量记录"的判据。 */}
      <div className="mt-0.5">
        {explain.strengthSec === null
          ? '纯有氧，不涉及强度档位'
          : `${metLabel(explain.level)}${
              explain.levelIsDefault ? '（老记录没存档位，按中等算）' : ''
            }`}
        {explain.totalSec !== null &&
          ` · 整场 ${formatDuration(explain.totalSec)}`}
        {explain.cardioSec > 0 &&
          explain.strengthSec !== null &&
          // 注意 ${...} 和"算"之间不能有空格 —— 中文里塞个空格很扎眼
          ` · 其中有氧 ${formatDuration(explain.cardioSec)}，力量按 ${formatDuration(
            explain.strengthSec,
          )}算`}
      </div>

      {/* 第二行：算式本体 */}
      {explain.totalSec === null && !hasCardioKcal ? (
        <div className="mt-0.5">
          算不出来 —— 这条记录没记开始时间，也没有有氧时长
        </div>
      ) : (
        <>
          {hasStrengthKcal && (
            <div className="mt-0.5">
              力量 （{explain.met} − 1）× {weightKg} kg ×{' '}
              {hours(explain.strengthSec ?? 0)} 小时 ≈{' '}
              {roundKcal(explain.strengthKcal)} 千卡
            </div>
          )}
          {hasCardioKcal && (
            <div className="mt-0.5">
              有氧 按动作和时长查表 ≈ {roundKcal(explain.cardioKcal)} 千卡
            </div>
          )}
          {/* 两样都有时才写"合计"，只有一样时最后那个数就是它自己，
              再写一遍"合计"是啰嗦 */}
          {hasStrengthKcal && hasCardioKcal && (
            <div className="mt-0.5 text-ink-2">
              合计 ≈ {roundKcal(explain.total)} 千卡
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================
// 一张"跟着时间进步"的折线图
// ============================================================
// 三张（重量 / 容量 / 1RM）长得一模一样，只是数据列不同，
// 所以抽成一个组件，不用把同样的配置抄三遍。

function ProgressChart<T extends { label: string }>({
  points,
  dataKey,
  title,
  subtitle,
  unit,
  columnLabel,
  color,
  startFromZero = false,
  extraLabel,
  extra,
}: {
  points: T[]
  // 泛型 T 表示"这一张图画的是哪种数据"。dataKey 必须是 T 里面真的有的字段名，
  // 写错一个字母编译就会报错 —— 比运行时画出一张空图强。
  //
  // 【为什么不用原来写死的 'maxWeight' | 'volume' | 'best1RM'】
  // 加了有氧之后，这张图还要画"单次距离"（字段名是 km），
  // 写死的联合类型装不下它。改成泛型，力量的三个调用点一个字都不用改。
  dataKey: Extract<keyof T, string>
  title: string
  subtitle: string
  unit: string
  columnLabel: string
  color: string
  // 容量这种"从 0 开始才有意义"的指标要传 true；
  // 重量和 1RM 不传，让纵轴自动缩放，否则 80kg 涨到 85kg 这种进步会被压平看不出来
  startFromZero?: boolean
  // 可选：给「看数字」表多加一列。
  // 时长那张图用它标出"那天练了几次" —— 因为按天合并之后，
  // 光看分钟数看不出那天是一次还是两次。
  // ★ 两个都传才生效，所以另外三个调用点一个字都不用改。
  extraLabel?: string
  extra?: (p: T) => string
}) {
  const [C] = useState(chartColors)
  // 纵轴刻度：容量那种"从 0 起才有意义"的传 startFromZero=true，
  // 重量和 1RM 不传，让轴贴着数据走（80 涨到 85 这种进步才看得出来）
  //
  // Number(...) 是把值转成数字再交给刻度算法。泛型 T 的字段类型
  // TypeScript 推不出来一定是数字，而这里的字段确实都是数字，转一下最省事。
  const axis = niceAxis(
    points.map((p) => Number(p[dataKey])),
    startFromZero,
  )

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      rows={points.map((p) => ({
        日期: p.label,
        [columnLabel]: `${Number(p[dataKey]).toLocaleString()} ${unit}`,
        // 有 extra 才加这一列
        ...(extra !== undefined && extraLabel !== undefined
          ? { [extraLabel]: extra(p) }
          : {}),
      }))}
      columns={[
        { key: '日期', label: '日期' },
        { key: columnLabel, label: columnLabel },
        ...(extra !== undefined && extraLabel !== undefined
          ? [{ key: extraLabel, label: extraLabel }]
          : []),
      ]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 8, right: 10, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
          <XAxis
            dataKey="label"
            stroke={C.muted}
            fontSize={11}
            tickLine={false}
            minTickGap={X_TICK_MIN_GAP}
            interval={X_TICK_INTERVAL}
          />
          <YAxis
            stroke={C.muted}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatAxis}
            domain={axis.domain}
            ticks={axis.ticks}
            width={52}
          />
          <Tooltip
            {...tooltipStyle(C)}
            formatter={(value) => [
              `${Number(value).toLocaleString()} ${unit}`,
              columnLabel,
            ]}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ============================================================
// 估算 1RM 的能力曲线（两条线）
// ============================================================
//
// 【为什么不复用上面的 ProgressChart】
// 它只画一条线，而这张要画两条（主曲线 + PR 阶梯线），而且 PR 线要用
// 虚线和不同的线型。硬塞进 ProgressChart 会让那个组件到处是 if。
//
// 【主曲线画的是什么】
// 不是"当天最好那一组"，而是"截至那天，往前 90 天里最好的水平"。
// 这样曲线反映的是能力的变化，不会因为今天冲大重量、明天练轻重量
// 就上下跳。口径的来龙去脉写在 lib/stats.ts 的 oneRmSeries 里。

function OneRmChart({
  points,
  name,
}: {
  points: OneRmPoint[]
  name: string
}) {
  const [C] = useState(chartColors)

  // ★ 纵轴要**同时**装得下主曲线和 PR 线。
  //   只按主曲线算刻度的话，PR 线会比它高（历史最高永远 ≥ 最近水平），
  //   那截线会顶到图外面被切掉 —— 而且是静悄悄地切掉，不报错。
  const axis = niceAxis(
    points.flatMap((p) => [p.oneRm, p.pr]),
    false,
  )

  return (
    <ChartCard
      title="估算 1RM"
      subtitle={`${name} · 截至当天，前 90 天里的最好水平（kg）`}
      rows={points.map((p) => ({
        日期: p.label,
        水平: `${p.oneRm.toLocaleString()} kg`,
        历史最高: `${p.pr.toLocaleString()} kg`,
      }))}
      columns={[
        { key: '日期', label: '日期' },
        { key: '水平', label: '截至这天的水平，kg' },
        { key: '历史最高', label: '截至这天的历史最高，kg' },
      ]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 8, right: 10, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
          <XAxis
            dataKey="label"
            stroke={C.muted}
            fontSize={11}
            tickLine={false}
            minTickGap={X_TICK_MIN_GAP}
            interval={X_TICK_INTERVAL}
          />
          <YAxis
            stroke={C.muted}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatAxis}
            domain={axis.domain}
            ticks={axis.ticks}
            width={52}
          />
          <Tooltip
            {...tooltipStyle(C)}
            formatter={(value) => `${Number(value).toLocaleString()} kg`}
          />
          {/* PR 线画在前面（下面的图层）。它是背景参考，
              不该抢主曲线的视线，所以用浅色虚线、不画点。
              stepAfter = 阶梯：值不变就一直平着，涨了才跳一级 ——
              正好对应"只升不降"。 */}
          <Line
            type="stepAfter"
            dataKey="pr"
            name="历史最高"
            stroke={C.muted}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="oneRm"
            name="最近水平"
            stroke={C.chart3}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ============================================================
// 身体数据的一张折线图
// ============================================================

function BodyTrendChart({
  body,
  dataKey,
  title,
  unit,
}: {
  body: { label: string; weight?: number; height?: number; bodyFat?: number }[]
  dataKey: 'weight' | 'height' | 'bodyFat'
  title: string
  unit: string
}) {
  const [C] = useState(chartColors)

  // 只保留"这一项真的记了数"的那些日期。
  // 不过滤的话，没记的日期会是个空洞，折线会断开。
  const points = body
    .filter((b) => b[dataKey] !== undefined)
    .map((b) => ({ label: b.label, value: b[dataKey] as number }))

  // 纵轴刻度。体重、体脂、身高都不含 0 —— 从 0 起的话，
  // 72 到 75 公斤这条线会被压成贴着顶边的一条直线，变化全看不出来。
  const axis = niceAxis(points.map((p) => p.value))

  return (
    <ChartCard
      title={title}
      // 体脂这一张要额外说明一句：线上的点未必都是称出来的。
      // 没手填的那些天，App 按公式估算了一个，不写清楚用户会误会。
      subtitle={
        dataKey === 'bodyFat'
          ? `%（没手填体脂的那些天，按身高体重估算）`
          : `每次量的记录（${unit}）`
      }
      rows={points.map((p) => ({ 日期: p.label, [title]: `${p.value} ${unit}` }))}
      columns={[
        { key: '日期', label: '日期' },
        { key: title, label: title },
      ]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 8, right: 10, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
          <XAxis
            dataKey="label"
            stroke={C.muted}
            fontSize={11}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            stroke={C.muted}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            domain={axis.domain}
            ticks={axis.ticks}
            width={52}
          />
          <Tooltip
            {...tooltipStyle(C)}
            formatter={(value) => [`${value} ${unit}`, title]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={C.brand}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
