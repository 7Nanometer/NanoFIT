import { useState } from 'react'
import { EQUIPMENTS, EQUIPMENT_SET, MUSCLE_GROUPS, MUSCLE_LABELS } from '../types'
import type { Exercise, MuscleGroup } from '../types'
import { PRESET_EXERCISES, mergeExercises } from '../data/exercises'
import { readCustomExercises, writeCustomExercises } from '../lib/storage'
import { ExerciseForm } from '../components/ExerciseForm'

// ============================================================
// 动作库页面
// ============================================================
// 显示 40 个预置动作 + 你自己建的动作，可以搜索、按肌群筛选、点开看要领。
//
// 【数据从哪来】
//   预置的 40 个：写在 src/data/exercises.ts 的代码里，永远都在
//   自建的：存在浏览器储物柜里，打开这个页面时读出来
// ============================================================

// 肌群筛选条上的选项。除了 8 个肌群，还多一个 'all'（全部）
type Filter = MuscleGroup | 'all'

// 器械筛选条上"其他"那个按钮的内部代号。
//
// 【为什么不用中文"其他"当代号】
// 万一以后真有人把某个动作的器械填成"其他"，代码里就分不清
// "用户点了其他按钮"和"这个动作的器械叫其他"了。
// 用一对下划线包起来，跟任何正常的器械名都不会撞。
const OTHER_EQUIP = '__other__'

export function LibraryScreen({ onBack }: { onBack: () => void }) {
  // useState(函数) 这种写法表示："只在第一次显示这个页面时读一次储物柜"。
  // 如果写成 useState(readCustomExercises())，每次重画都会白读一遍。
  const [custom, setCustom] = useState<Exercise[]>(readCustomExercises)

  const [keyword, setKeyword] = useState('') // 搜索框里打的字
  const [filter, setFilter] = useState<Filter>('all') // 当前选中的肌群
  const [equipFilter, setEquipFilter] = useState('all') // 当前选中的器械
  const [expandedId, setExpandedId] = useState<string | null>(null) // 哪个动作被点开了
  const [isCreating, setIsCreating] = useState(false) // 新建弹窗要不要显示
  const [storageError, setStorageError] = useState(false) // 存不进去时的红色提示

  // 预置的 + 自建的，合成一个总列表
  const all = mergeExercises(custom)

  // 有没有"器械不在标准词表里"的动作？
  //
  // 【为什么要在意这个】
  // 老版本允许自由填器械，以前建的自建动作里可能存着"龙门架"这种词。
  // 那种动作在任何器械按钮下都点不出来 —— 看着像丢了。
  // 所以真有的话，就多长一个"其他"按钮把它们兜住。
  const hasOtherEquip = all.some((item) => !EQUIPMENT_SET.has(item.equipment))

  // 按搜索词、肌群、器械过三遍，得到最终要显示的列表。
  // 三个条件是"而且"的关系：选"胸" + "哑铃"，看的是"用哑铃练胸的动作"。
  const kw = keyword.trim()
  const list = all.filter((item) => {
    if (filter !== 'all' && item.muscleGroup !== filter) return false

    if (equipFilter !== 'all') {
      if (equipFilter === OTHER_EQUIP) {
        if (EQUIPMENT_SET.has(item.equipment)) return false
      } else if (item.equipment !== equipFilter) {
        return false
      }
    }

    if (kw === '') return true
    // includes 的意思是"包含"。搜"卧推"能命中"杠铃卧推"和"上斜哑铃卧推"；
    // 搜"哑铃"也行 —— 因为器械名也在这句话里跟着比
    return item.name.includes(kw) || item.equipment.includes(kw)
  })

  function handleSave(exercise: Exercise) {
    const next = [...custom, exercise]
    const ok = writeCustomExercises(next) // 先存进储物柜
    setCustom(next) // 再更新界面上的列表
    setIsCreating(false)
    setStorageError(!ok)
  }

  return (
    <div>
      {/* ---------- 顶部：返回 / 标题 / 新建 ---------- */}
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
        <h1 className="flex-1 text-lg font-semibold">动作库</h1>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="press min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand"
        >
          + 新建
        </button>
      </div>

      {/* ---------- 存不进去时的警告 ---------- */}
      {storageError && (
        <div className="mb-3 rounded-lg border border-brand bg-brand/10 p-3 text-sm text-brand">
          存不进去了，可能是手机存储满了。请先导出备份再清理（导出功能在阶段 6 做）。
        </div>
      )}

      {/* ---------- 搜索框 ---------- */}
      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="搜索动作名或器械…"
        className="mb-3 w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-ink outline-none transition duration-150 ease-mech focus:border-brand focus:ring-2 focus:ring-brand/25"
      />

      {/* ---------- 肌群筛选条 ---------- */}
      {/* overflow-x-auto = 选项太多时可以左右滑动，不会挤成两行 */}
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
        <FilterChip
          label="全部"
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        {MUSCLE_GROUPS.map((group) => (
          <FilterChip
            key={group}
            label={MUSCLE_LABELS[group]}
            active={filter === group}
            onClick={() => setFilter(group)}
          />
        ))}
      </div>

      {/* ---------- 器械筛选条 ----------
          和上面那条肌群筛选是"叠加"关系：选"胸" + "哑铃" = 哑铃练胸的动作。
          两条可以同时生效，再叠加搜索框里打的字。 */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <FilterChip
          label="全部器械"
          active={equipFilter === 'all'}
          onClick={() => setEquipFilter('all')}
        />
        {EQUIPMENTS.map((equip) => (
          <FilterChip
            key={equip}
            label={equip}
            active={equipFilter === equip}
            onClick={() => setEquipFilter(equip)}
          />
        ))}
        {/* 只有真的存在"非标准器械"的动作时才出现，见上面 hasOtherEquip 的说明 */}
        {hasOtherEquip && (
          <FilterChip
            label="其他"
            active={equipFilter === OTHER_EQUIP}
            onClick={() => setEquipFilter(OTHER_EQUIP)}
          />
        )}
      </div>

      {/* ---------- 数量提示 ---------- */}
      <p className="t-label mb-2.5">
        共 {list.length} 个动作
        {/* 预置的数量从数据里数出来，不写死 —— 不然每加一批动作都得回来改这里 */}
        {filter === 'all' &&
          kw === '' &&
          `（预置 ${PRESET_EXERCISES.length} 个 + 自建 ${custom.length} 个）`}
      </p>

      {/* ---------- 动作列表 ----------
          改成一整块账本（行与行之间细线分开），不再是"一张一张卡片"。
          这一页有一百六十多项，卡片写法每项要 100 像素、还要空 8 像素，
          翻起来没完；账本写法每项约 58 像素，省掉四成高度。
          动作库是"查一下"的地方，一次能看到多少个名字，比每个名字多好看重要得多。 */}
      {list.length > 0 && (
        <div className="ledger divide-y divide-line">
          {list.map((item) => {
            const expanded = expandedId === item.id
            return (
              <button
                key={item.id}
                type="button"
                // 再点一次就收起来
                onClick={() => setExpandedId(expanded ? null : item.id)}
                className="press w-full px-3.5 py-2.5 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-base font-semibold text-ink">
                    {item.name}
                  </span>
                  {/* 「自建」标签改成只有一圈描边、不上底色 ——
                      它是"标一下来源"，不是一个要点的东西。
                      原来那版透着橙底，在一列名字里格外扎眼。 */}
                  {item.isCustom && (
                    <span className="shrink-0 rounded border border-brand/40 px-1.5 py-0.5 text-xs text-brand">
                      自建
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {MUSCLE_LABELS[item.muscleGroup]}
                  {/* 器械留空时就不显示"·"，免得出现一个孤零零的圆点 */}
                  {item.equipment !== '' && ` · ${item.equipment}`}
                </div>
                {expanded && item.note && (
                  <p className="mt-2 border-t border-line pt-2 text-xs leading-relaxed text-ink-2">
                    {item.note}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ---------- 什么都没搜到 ---------- */}
      {list.length === 0 && (
        <p className="py-12 text-center text-sm text-muted">
          没找到符合条件的动作
          <br />
          换个词试试，或者点右上角"+ 新建"自己加一个
        </p>
      )}

      {/* ---------- 新建弹窗 ---------- */}
      {isCreating && (
        <ExerciseForm
          onSave={handleSave}
          onCancel={() => setIsCreating(false)}
        />
      )}
    </div>
  )
}

// 筛选条上的一个小圆角按钮。单独写出来是为了不用把同样的样式抄 7 遍。
//
// 【选中的那一个为什么不是"一整块橙"】
// 这一页有两条筛选条、十几个这样的按钮。原版选中的是一块实心橙红，
// 于是屏幕上会同时出现两块亮橙 —— 而且是这一页最响的东西。
// 它们只是"筛选用的小开关"，不该比下面那一百多个动作还抢眼。
// 改成"淡橙底 + 橙字 + 橙边"：一眼仍看得出选的是哪个，但不吵。
// （和设置页里「外观」那两个按钮、休息秒数那一排，用的是同一套。）
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press min-h-11 shrink-0 rounded-full border px-4 text-sm ${
        active
          ? 'border-brand bg-brand/10 font-semibold text-brand'
          : 'border-line-2 text-ink-2'
      }`}
    >
      {label}
    </button>
  )
}
