import { useState } from 'react'
import type { Exercise, PlannedItem, Template } from '../types'
import { mergeExercises } from '../data/exercises'
import { mergeTemplates } from '../data/templates'
import {
  readCustomExercises,
  readTemplates,
  writeTemplates,
} from '../lib/storage'
import { newId } from '../lib/id'
import { ExercisePicker } from '../components/ExercisePicker'
import { exerciseName } from '../data/exercises'

// ============================================================
// 训练模板管理（在"设置"里面）
// ============================================================
// 显示 3 个预置模板（推日 / 拉日 / 腿日）+ 你自己建的。
//
// 【预置的不能改】
// 和 40 个预置动作一样，它们写在代码里。想改成自己的版本就新建一个。
// ============================================================

export function TemplateScreen({ onBack }: { onBack: () => void }) {
  const [custom, setCustom] = useState<Template[]>(readTemplates)
  const [customExercises] = useState<Exercise[]>(readCustomExercises)
  const [editing, setEditing] = useState<Template | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [storageError, setStorageError] = useState(false)

  const allExercises = mergeExercises(customExercises)
  const templates = mergeTemplates(custom)

  function saveTemplate(template: Template) {
    const exists = custom.some((t) => t.id === template.id)
    const next = exists
      ? custom.map((t) => (t.id === template.id ? template : t))
      : [...custom, template]
    const ok = writeTemplates(next)
    setCustom(next)
    setEditing(null)
    setStorageError(!ok)
  }

  function deleteTemplate(id: string) {
    if (!window.confirm('删掉这个模板？')) return
    const next = custom.filter((t) => t.id !== id)
    const ok = writeTemplates(next)
    setCustom(next)
    setStorageError(!ok)
  }

  // 正在编辑／新建模板时，整个页面换成编辑器
  if (editing !== null) {
    return (
      <TemplateEditor
        initial={editing}
        allExercises={allExercises}
        customExercises={customExercises}
        onSave={saveTemplate}
        onCancel={() => setEditing(null)}
      />
    )
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
        <h1 className="flex-1 text-lg font-semibold">训练模板</h1>
        <button
          type="button"
          onClick={() => setEditing({ id: newId(), name: '', items: [] })}
          className="press min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand"
        >
          + 新建
        </button>
      </div>

      {storageError && (
        <div className="mb-3 rounded-lg border border-brand bg-brand/10 p-3 text-sm text-brand">
          存不进去了，可能是手机存储满了。请先告诉我。
        </div>
      )}

      {/* ---------- 模板列表 ---------- */}
      {templates.map((template) => {
        const isPreset = template.id.startsWith('preset-')
        const expanded = expandedId === template.id
        return (
          <div
            key={template.id}
            className="mb-2 card"
          >
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : template.id)}
              className="press w-full p-3.5 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-lg font-semibold text-ink">
                  {template.name}
                </span>
                {isPreset && (
                  // 做成小胶囊而不是一行灰字：它是个"标签"，
                  // 标签就该有个边界，不然会跟旁边的文字糊成一句
                  <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
                    预置
                  </span>
                )}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ease-mech ${
                    expanded ? 'rotate-180' : ''
                  }`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
              {/* 【为什么要把动作名勾出来】
                  以前收起时这行只有"5 个动作" —— 于是"推日""拉日""腿日"
                  三张卡片长得一模一样，必须点开才知道哪个是哪个。
                  把动作名当预览文字铺在这儿，不用点开就能认出来。 */}
              <div className="mt-1 flex items-center gap-1.5 text-xs">
                <span className="t-num shrink-0 font-medium text-ink-2">
                  {template.items.length} 个动作
                </span>
                <span className="shrink-0 text-muted">·</span>
                <span className="truncate text-muted">
                  {template.items
                    .map((item) => exerciseName(allExercises, item.exerciseId))
                    .join('、')}
                </span>
              </div>
            </button>

            {expanded && (
              <div className="border-t border-line p-3">
                {template.items.map((item) => (
                  <div
                    key={item.exerciseId}
                    className="flex items-center gap-2 py-0.5 text-sm"
                  >
                    <span className="flex-1 text-ink">
                      {exerciseName(allExercises, item.exerciseId)}
                    </span>
                    <span className="shrink-0 text-muted">
                      {item.targetSets} 组 × {item.targetReps} 次
                    </span>
                  </div>
                ))}

                {isPreset ? (
                  <p className="mt-3 text-xs text-muted">
                    预置模板不能改。想改的话点右上角"+ 新建"做一个自己的。
                  </p>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(template)}
                      className="press min-h-11 flex-1 rounded-lg border border-line-2 text-sm text-ink-2"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTemplate(template.id)}
                      className="press min-h-11 flex-1 rounded-lg border border-line-2 text-sm text-muted"
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// 模板编辑器：起名字 + 挑动作 + 定"几组几次"
// ============================================================

function TemplateEditor({
  initial,
  allExercises,
  customExercises,
  onSave,
  onCancel,
}: {
  initial: Template
  allExercises: Exercise[]
  customExercises: Exercise[]
  onSave: (template: Template) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [items, setItems] = useState<PlannedItem[]>(initial.items)
  const [pickerOpen, setPickerOpen] = useState(false)

  // 名字和动作都填了才能保存
  const canSave = name.trim() !== '' && items.length > 0

  function addExercise(exerciseId: string) {
    setPickerOpen(false)
    // 已经加过就跳过，避免同一个动作出现两次
    if (items.some((item) => item.exerciseId === exerciseId)) return
    // 新加的动作默认给个"3 组 × 10 次"，你可以用加减按钮调
    setItems([...items, { exerciseId, targetSets: 3, targetReps: 10 }])
  }

  function updateItem(index: number, patch: Partial<PlannedItem>) {
    setItems(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="press inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line-2 px-3 text-sm text-ink-2"
        >
          取消
        </button>
        <h1 className="flex-1 text-lg font-semibold">
          {initial.name === '' ? '新建模板' : '编辑模板'}
        </h1>
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSave({ ...initial, name: name.trim(), items })
          }
          className="press min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand shadow-[var(--elev-brand)] disabled:bg-line disabled:text-muted disabled:shadow-none"
        >
          保存
        </button>
      </div>

      <label className="mb-1 block text-sm text-ink-2">模板名字（必填）</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="例如：我的推日"
        className="mb-4 w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-ink outline-none transition duration-150 ease-mech focus:border-brand focus:ring-2 focus:ring-brand/25"
      />

      {items.map((item, index) => (
        <div
          key={item.exerciseId}
          className="mb-2 card p-3"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="flex-1 font-medium text-ink">
              {exerciseName(allExercises, item.exerciseId)}
            </span>
            <button
              type="button"
              onClick={() => setItems(items.filter((_, i) => i !== index))}
              className="shrink-0 px-2 py-1 text-xs text-muted"
            >
              移除
            </button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Stepper
              label="组数"
              value={item.targetSets}
              onChange={(v) => updateItem(index, { targetSets: v })}
            />
            <Stepper
              label="每组次数"
              value={item.targetReps}
              onChange={(v) => updateItem(index, { targetReps: v })}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="press w-full rounded-xl border border-dashed border-line py-4 text-sm text-ink-2"
      >
        + 添加动作
      </button>

      {!canSave && (
        <p className="mt-3 text-xs text-muted">
          填好名字、并且至少加一个动作，"保存"才会亮起来。
        </p>
      )}

      {pickerOpen && (
        <ExercisePicker
          customExercises={customExercises}
          onPick={addExercise}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

// 加减按钮。
// 【为什么不用输入框】
// 手机上输数字要弹键盘、要收键盘，很麻烦；而且"3"改"4"还得先删再打。
// 加减按钮一戳就行，而且手指点得准（44×44 像素）。
function Stepper({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">{label}</span>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="press min-h-11 min-w-11 rounded-lg border border-line-2 text-lg text-ink-2"
      >
        −
      </button>
      <span className="w-10 text-center text-lg font-semibold tabular-nums text-ink">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(99, value + 1))}
        className="press min-h-11 min-w-11 rounded-lg border border-line-2 text-lg text-ink-2"
      >
        +
      </button>
    </div>
  )
}
