import type { Exercise, SetEntry, WorkoutSession } from '../types'
import { cardioIdSet, exerciseName } from '../data/exercises'
import { formatDateCN } from '../lib/date'
import { describeCardio, formatDuration, sessionVolume } from '../lib/calc'
import { formatKcal, metLabel, sessionKcal, sessionSeconds } from '../lib/kcal'

// ============================================================
// 历史记录里的一行
// ============================================================
// 有两种样子：
//   收起来时 —— 日期 + 一行摘要（总容量、几个动作、时长档位热量）
//   点开后   —— 显示每个动作、每一组的重量 × 次数
//
// 【为什么默认收起来】
// 练了半年就有 100 多条记录，全部展开会长得没法看。
// 摘要里放"总容量"这个数字，是因为它最能反映"这次练了多少"，
// 拿来跟以前比进步最直观。
//
// 【这一轮从"一张卡"改成了"账本里的一行"】
// 以前每条训练是一张独立卡片，卡与卡之间空 10px。三条记录下面就是
// 一大片空白，看着像"内容没加载完"。
// 现在所有记录装在同一个 .ledger 块里，行与行之间只用一根细线分开：
//   · 同样高度能多放下两三行
//   · 左边多了一列行号（01、02…），它们串成一条竖线，
//     眼睛沿着这列往下走，比看一堆卡片稳得多
//   · "一共有几条"变成一眼可数的事
// 这就是账本和卡片堆的区别：一个是"一本"，一个是"一叠"。
// ============================================================

type Props = {
  // 这是第几条（从 1 开始）。只用来显示左边那个行号。
  index: number
  session: WorkoutSession
  allExercises: Exercise[] // 用来把动作 id 翻成中文名
  // 算热量估算用的体重。没有就传 undefined —— 那就不显示热量。
  weightKg?: number
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
}

export function SessionRow({
  index,
  session,
  allExercises,
  weightKg,
  expanded,
  onToggle,
  onDelete,
}: Props) {
  const groups = groupByExercise(session, allExercises)

  // ---------- 力量和有氧分开说话 ----------
  //
  // 【为什么必须分】
  // 有氧记录的 weightKg 和 reps 都是 0（见 types.ts 的说明）。
  // 不分开的话，摘要会显示成"3 个动作 · 3 组 · 总容量 0 kg"，
  // 明细里每条都写"0 kg × 0" —— 数字全是真的，但一句都读不懂。
  const cardioIds = cardioIdSet(allExercises)
  const strengthEntries = session.entries.filter(
    (s) => !cardioIds.has(s.exerciseId),
  )
  const cardioSeconds = session.entries
    .filter((s) => cardioIds.has(s.exerciseId))
    .reduce((sum, s) => sum + (s.durationSec ?? 0), 0)

  // ---------- 收起时的三行怎么排 ----------
  //
  // 【改之前为什么难读】
  // 原来是一整句：「2 个动作 · 3 组 · 总容量 1,560 kg」。
  // 这句话里"1,560"是最该被看到的数字（它最能说明"这次练了多少"），
  // 却和"个动作""组"这些字一样大、一样颜色 —— 得逐字读才能挑出来。
  //
  // 【现在怎么排】
  // 第一行：几月几号（这一条的身份）
  // 第二行：总容量当主数字（放大加粗）+ 右边小字写"几个动作几组"
  // 第三行：时长 · 档位 · 热量（这三样正好是热量公式的三个输入，
  //         排在一起是为了让人能自己核对）
  // 这样一列往下扫，看到的是一串大小差不多的容量数字，
  // **进步还是退步，扫一眼就比出来了** —— 这才是历史页存在的意义。

  // 这里单独数一遍"几个动作"，不能用上面 groups.length ——
  // 那个把有氧动作也算进去了
  const strengthGroups = new Set(strengthEntries.map((s) => s.exerciseId)).size
  const volumeKg =
    strengthEntries.length > 0
      ? Math.round(sessionVolume(strengthEntries))
      : null
  const countText =
    strengthEntries.length > 0
      ? `${strengthGroups} 个动作 · ${strengthEntries.length} 组`
      : ''

  // 纯有氧的场次没有总容量可显示（那一条的 weightKg/reps 都是 0），
  // 就把有氧时长顶上"主数字"的位置，否则那一行会空着
  const cardioOnly = volumeKg === null && cardioSeconds > 0

  // ---------- 第三行：时长 · 档位 · 热量（★ 2026-09-24 加的）----------
  //
  // 【为什么档位必须显示出来】
  // 整个界面以前**从来不显示**它 —— 存了哪一档，用户无从核对。
  // 有人对着统计页的 113 千卡怎么算都对不上，只能来问为什么。
  // 而档位恰恰是热量公式里最大的变量（3.0 和 6.0 差一倍），
  // 它必须看得见，用户才能自己发现问题。
  const detailParts: string[] = []

  // 【为什么只在有力量记录时显示时长和档位】
  // 纯有氧的场次：上面已经写了"有氧 30 分钟"，再写一遍总时长是重复的；
  // 而且纯有氧压根不存档位（用不上那个概念）。
  if (strengthEntries.length > 0) {
    const durationSec = sessionSeconds(session)
    if (durationSec !== null) {
      detailParts.push(formatDuration(durationSec))
    }
    // 【老记录会怎样】那时候还没开始存档位，这个字段是空的 ——
    // 那就整个不出现，和下面"热量算不出来就不显示"一个规矩：
    // 没有的数据不占位置，绝不写"—"占位。
    if (session.metLevel !== undefined) {
      detailParts.push(metLabel(session.metLevel))
    }
  }

  // 消耗热量（估算）。算不出来时这一项**整个不出现** ——
  // 老记录尤其会走这条路：那时候还没开始记训练时长。
  const kcal = sessionKcal(session, weightKg, cardioIds)
  if (kcal !== null) {
    detailParts.push(formatKcal(kcal))
  }

  // 有氧时长：只有在"总容量已经占了主数字位置"时才写进说明行。
  // 纯有氧那条路它已经当主数字用了，这里再写一遍就是重复。
  if (cardioSeconds > 0 && volumeKg !== null) {
    detailParts.push(`有氧 ${formatDuration(cardioSeconds)}`)
  }

  return (
    <div>
      {/* ---------- 收起来时的样子（整行都能点）----------
          两列网格：左边一条窄窄的行号栏，右边是全部内容。
          用网格而不是"行号 + 缩进"，是因为网格能保证**每一条的
          正文都从同一个 x 开始** —— 这是整页对齐的关键。 */}
      <button
        type="button"
        onClick={onToggle}
        className="press grid w-full grid-cols-[1.5rem_1fr] items-start gap-x-2.5 px-3.5 py-2.5 text-left"
      >
        <span className="t-index mt-1">{String(index + 1).padStart(2, '0')}</span>

        <div className="min-w-0">
          {/* 第一行：日期（左） + 展开/收起 + 一个会转的箭头（右） */}
          <div className="flex items-center gap-1.5">
            <span className="flex-1 truncate text-base font-semibold text-ink">
              {formatDateCN(session.date)}
              {session.name !== undefined && ` · ${session.name}`}
            </span>
            <span className="shrink-0 text-xs text-muted">
              {expanded ? '收起' : '展开'}
            </span>
            {/* 箭头本身就是"能点开"的通用符号，比"展开"两个字更快被认出来。
                展开时转 180 度 —— 这一点转动把"状态变了"说清楚了，
                否则内容一多一少，眼睛会以为是页面跳了一下。
                两个都给（文字 + 箭头）是因为主人是新手：
                单给箭头怕他没意识到能点，单给文字又不如箭头快。 */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-muted transition-transform duration-250 ease-mech ${
                expanded ? 'rotate-180' : ''
              }`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>

          {/* 第二行：主数字（左） + 动作数/组数（右） */}
          <div className="mt-1 flex items-baseline gap-1.5">
            {volumeKg !== null && (
              <>
                {/* 顺序是"名称 → 数字 → 单位"。
                    写成"数字 → 单位 → 名称"（1,560 KG 总容量）会读成倒装，
                    得回头再看一眼才明白；中文里"总容量 1,560 kg"才是顺着念的。
                    单位用 .t-unit 压小压淡 —— 一列数字里，单位每行都一样，
                    不该和数字抢分量。 */}
                <span className="t-label">总容量</span>
                <span className="t-num text-lg font-semibold text-ink">
                  {volumeKg.toLocaleString()}
                </span>
                <span className="t-unit">kg</span>
              </>
            )}
            {/* 纯有氧的那一天：把一个"时长"顶上主数字的位置，
                否则这一行会空着、看着像缺了东西 */}
            {cardioOnly && (
              <span className="t-num text-lg font-semibold text-ink">
                {formatDuration(cardioSeconds)}
              </span>
            )}
            {countText !== '' && (
              <span className="ml-auto shrink-0 text-xs text-muted">
                {countText}
              </span>
            )}
          </div>

          {/* 第三行：这次怎么算的（时长 · 档位 · 热量）。
              比上面两行再退一档 —— 它是"用来核对的"，不是"用来比的"。 */}
          {detailParts.length > 0 && (
            <div className="mt-1 text-xs text-muted">
              {detailParts.join(' · ')}
            </div>
          )}
        </div>
      </button>

      {/* ---------- 点开后的样子 ----------
          底下垫一层更深的底色（surface-2），让它一眼看出是"嵌在这一行里的"，
          而不是这一行本身变长了。左边那 14px 的缩进是留给行号栏的 ——
          展开的内容和上面的正文对齐在同一条竖线上。 */}
      {expanded && (
        <div className="animate-fade border-t border-line bg-surface-2 px-3.5 py-3 pl-12">
          {groups.map((group) => {
            const isCardio = cardioIds.has(group.exerciseId)
            return (
              <div key={group.exerciseId} className="mb-3 last:mb-0">
                {/* 动作名当"标签"而不是"正文"：它在这一块里是分组标题，
                    和下面一行行的数据不是一类东西。做小了才像标题，
                    做大了反而会和每组的"80 kg × 8"抢着被执行。 */}
                <div className="t-label mb-1.5">{group.name}</div>
                {group.sets.map((set, setIndex) =>
                  isCardio ? (
                    // 有氧：一条就是一句话，没有组号也没有 RPE
                    <div
                      key={set.id}
                      className="t-num py-1 text-sm text-ink"
                    >
                      {describeCardio(set)}
                    </div>
                  ) : (
                    // 和训练页的组记录排法保持一致（组号 / 重量 / 次数 / RPE）——
                    // 这样刚记完的训练和翻出来看的老记录，读法是同一个，
                    // 不用在两套排版之间切换脑子。
                    // 数字右对齐，一列数字的右边缘落在同一条竖线上。
                    <div
                      key={set.id}
                      className="grid grid-cols-[1.25rem_1fr_1fr_2.5rem] items-baseline gap-x-2 py-1"
                    >
                      <span className="t-index">{setIndex + 1}</span>
                      <span className="t-num text-right text-sm font-medium text-ink">
                        {set.weightKg}
                      </span>
                      <span className="t-num text-right text-sm font-medium text-ink">
                        {set.reps}
                      </span>
                      <span className="t-num text-right text-xs text-ink-2">
                        {set.rpe ?? ''}
                      </span>
                    </div>
                  ),
                )}
              </div>
            )
          })}

          {/* 删除按钮刻意做得不起眼（灰字、细边、不高亮）——
              它是个"后悔药"，不该和页面上的正常操作抢注意力。
              点了之后还有一次系统确认弹窗兜底，所以这儿不用再做得更醒目。 */}
          <button
            type="button"
            onClick={onDelete}
            className="press mt-2 min-h-11 w-full rounded-lg border border-line-2 text-sm text-muted"
          >
            删除这次训练
          </button>
        </div>
      )}
    </div>
  )
}

// 把一次训练里那一长串"组"，按动作归拢到一起。
//
// 为什么要归拢：entries 是一条条平铺的组，
// 直接列出来会是"80kg×8、80kg×7、60kg×10、60kg×9……"这样一大串，
// 根本看不出哪个动作是哪个动作。
type Group = {
  exerciseId: string
  name: string
  sets: SetEntry[]
}

function groupByExercise(
  session: WorkoutSession,
  allExercises: Exercise[],
): Group[] {
  // Map 是一个"键值对"容器，这里用"动作 id"当键，把同一个动作的组攒在一起
  const buckets = new Map<string, SetEntry[]>()

  for (const entry of session.entries) {
    const list = buckets.get(entry.exerciseId) ?? []
    list.push(entry)
    buckets.set(entry.exerciseId, list)
  }

  // Map 会按"放进去的先后顺序"取出来，
  // 所以动作的排列顺序正好就是你当时练的顺序
  const groups: Group[] = []
  for (const [exerciseId, sets] of buckets) {
    groups.push({
      exerciseId,
      // 动作可能已经被删掉了（自建动作可以删），exerciseName 会给出提示而不是空白
      name: exerciseName(allExercises, exerciseId),
      sets,
    })
  }
  return groups
}
