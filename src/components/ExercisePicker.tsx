import { useState } from 'react'
import { MUSCLE_GROUPS, MUSCLE_LABELS } from '../types'
import type { Exercise, MuscleGroup } from '../types'
import { exerciseKind, mergeExercises } from '../data/exercises'

// ============================================================
// 选动作的弹层
// ============================================================
// 记训练时点"+ 添加动作"弹出它。
// 里面的"搜索 + 筛选"逻辑和动作库页面是一样的 ——
// 是的，有一点重复。故意这么做的：
// 动作库页面点一条是"展开看要领"，这里点一条是"选中它"，
// 两边的行为不一样，硬凑成一个组件反而更难懂。
//
// 如果以后搜索的规矩要改（比如也搜要领），记得两个文件都要改：
//   src/screens/LibraryScreen.tsx
//   src/components/ExercisePicker.tsx
// ============================================================

type Filter = MuscleGroup | 'all'

type Props = {
  customExercises: Exercise[] // 你自己建的动作
  onPick: (exerciseId: string) => void
  onClose: () => void
}

export function ExercisePicker({ customExercises, onPick, onClose }: Props) {
  const [keyword, setKeyword] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  // 【为什么要把有氧动作滤掉】
  // 这个弹层的下一步是"渲染一张力量卡片"（重量 × 次数输入行）。
  // 有氧动作在这条路上走不通 —— 它要的是"时长 + 距离"。
  // 所以有氧有它自己的入口：训练页的"+ 记有氧"按钮。
  // 不滤掉的话，在这里选中"跑步机"会得到一张填不了东西的卡片。
  const all = mergeExercises(customExercises).filter(
    (item) => exerciseKind(item) === 'strength',
  )
  const kw = keyword.trim()
  const list = all.filter((item) => {
    if (filter !== 'all' && item.muscleGroup !== filter) return false
    if (kw === '') return true
    return item.name.includes(kw) || item.equipment.includes(kw)
  })

  return (
    // 盖住整个屏幕。flex-col 让下面的列表能自己滚动，搜索框和筛选条固定不动。
    <div className="animate-fade fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="animate-sheet mx-auto flex w-full max-w-[480px] flex-1 flex-col overflow-hidden p-4">
        {/* ---------- 标题栏 ---------- */}
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex-1 text-lg font-semibold">选一个动作</h2>
          <button
            type="button"
            onClick={onClose}
            className="press min-h-11 rounded-lg border border-line-2 px-4 text-sm text-ink-2"
          >
            取消
          </button>
        </div>

        {/* ---------- 搜索框 ---------- */}
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索动作名或器械…"
          className="mb-3 w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-ink outline-none transition duration-150 ease-mech focus:border-brand focus:ring-2 focus:ring-brand/25"
        />

        {/* ---------- 肌群筛选条 ---------- */}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm ${
              filter === 'all'
                ? 'border-brand bg-brand/10 font-semibold text-brand'
                : 'border-line-2 text-ink-2'
            }`}
          >
            全部
          </button>
          {/* 肌群按钮里要去掉"有氧" —— 上面已经把有氧动作滤掉了，
              留着这个按钮的话，点下去只会得到一片空白，
              像是 App 坏了。全身那一类要留着，硬拉深蹲这些是能选的。 */}
          {MUSCLE_GROUPS.filter((group) => group !== 'cardio').map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setFilter(group)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm ${
                filter === group
                  ? 'border-brand bg-brand/10 font-semibold text-brand'
                  : 'border-line-2 text-ink-2'
              }`}
            >
              {MUSCLE_LABELS[group]}
            </button>
          ))}
        </div>

        {/* ---------- 动作列表（可滚动）---------- */}
        <div className="flex-1 overflow-y-auto">
          {/* 列表用账本写法（细线分行），和动作库那一页保持一致 ——
              同一个东西在两个地方长得一样，不用各学一遍 */}
          <div className="ledger divide-y divide-line">
          {list.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item.id)}
              className="press-row flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-medium text-ink">{item.name}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {MUSCLE_LABELS[item.muscleGroup]}
                  {item.equipment !== '' && ` · ${item.equipment}`}
                </div>
              </div>
              {item.isCustom && (
                <span className="shrink-0 rounded border border-brand/40 px-1.5 py-0.5 text-xs text-brand">
                  自建
                </span>
              )}
            </button>
          ))}
          </div>

          {list.length === 0 && (
            <p className="py-12 text-center text-sm text-muted">
              没找到符合条件的动作
              <br />
              想新建的话，去「设置 → 动作库」
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
