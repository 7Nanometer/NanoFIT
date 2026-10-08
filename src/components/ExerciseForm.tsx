import { useState } from 'react'
import { MUSCLE_GROUPS, MUSCLE_LABELS } from '../types'
import type { Exercise, MuscleGroup } from '../types'
import { newId } from '../lib/id'

// ============================================================
// "新建动作"的弹窗表单
// ============================================================
// 让用户填名字、选肌群、填器械和要领。
// 只有名字是必填的，其他都可以留空。
//
// 【这个组件自己不存数据】
// 它只负责"收集用户填的内容"，填好了交给父组件（动作库页面）去存。
// 这叫"单一职责"：改界面只动这里，改存储只动 storage.ts，互不干扰。
// ============================================================

type Props = {
  onSave: (exercise: Exercise) => void // 点"保存"时，把填好的动作交出去
  onCancel: () => void // 点"取消"时通知父组件关掉弹窗
}

export function ExerciseForm({ onSave, onCancel }: Props) {
  // 四个输入各自记自己的内容
  const [name, setName] = useState('')
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('chest')
  const [equipment, setEquipment] = useState('')
  const [note, setNote] = useState('')

  // trim() 的作用是去掉首尾的空格。目的是：只打了一堆空格也算"没填"
  const canSave = name.trim() !== ''

  function handleSave() {
    if (!canSave) return
    onSave({
      id: newId(),
      name: name.trim(),
      muscleGroup,
      equipment: equipment.trim(),
      isCustom: true, // 标记成"自建"，列表里会显示一个小标签
      note: note.trim() === '' ? undefined : note.trim(),
    })
  }

  return (
    // 半透明的黑遮罩，盖住整个屏幕，让用户知道这里是弹窗、后面点不了
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="animate-pop max-h-full w-full max-w-[440px] overflow-y-auto card rounded-2xl p-5">
        <h2 className="mb-4 text-lg font-semibold text-ink">新建动作</h2>

        {/* ---------- 动作名称 ---------- */}
        <label className="mb-1 block text-sm text-ink-2">
          动作名称（必填）
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：坐姿推肩"
          className="mb-4 w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-ink outline-none transition duration-150 ease-mech focus:border-brand focus:ring-2 focus:ring-brand/25"
        />

        {/* ---------- 肌群 ---------- */}
        <label className="mb-1 block text-sm text-ink-2">属于哪个肌群</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {MUSCLE_GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setMuscleGroup(group)}
              // min-h-11 = 44 像素，手指点得准的最小尺寸
              className={`min-h-11 rounded-lg border px-3 text-sm ${
                muscleGroup === group
                  ? 'border-brand bg-brand font-semibold text-on-brand'
                  : 'border-line-2 text-ink-2'
              }`}
            >
              {MUSCLE_LABELS[group]}
            </button>
          ))}
        </div>

        {/* ---------- 器械 ---------- */}
        <label className="mb-1 block text-sm text-ink-2">
          用什么器械（可以留空）
        </label>
        <input
          type="text"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          placeholder="例如：哑铃 / 固定器械 / 自重"
          className="mb-4 w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-ink outline-none transition duration-150 ease-mech focus:border-brand focus:ring-2 focus:ring-brand/25"
        />

        {/* ---------- 动作要领 ---------- */}
        <label className="mb-1 block text-sm text-ink-2">
          一句话要领（可以留空）
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="例如：肘贴近身体，别耸肩"
          className="mb-5 w-full resize-none rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-ink outline-none transition duration-150 ease-mech focus:border-brand focus:ring-2 focus:ring-brand/25"
        />

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
            className="press min-h-11 flex-1 rounded-lg bg-brand font-semibold text-on-brand shadow-[var(--elev-brand)] disabled:bg-line disabled:text-muted disabled:shadow-none"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
