import type { Exercise, Template } from '../types'
import { exerciseName } from '../data/exercises'
import { mergeTemplates } from '../data/templates'

// ============================================================
// 选模板的弹层
// ============================================================
// 在训练页点"套用模板"时弹出来。
// 点一个模板 → 它里面的动作和"目标几组几次"就自动填进今天这次训练。
// ============================================================

type Props = {
  customTemplates: Template[]
  allExercises: Exercise[] // 用来把动作 id 翻成中文名
  onPick: (template: Template) => void
  onClose: () => void
}

export function TemplatePicker({
  customTemplates,
  allExercises,
  onPick,
  onClose,
}: Props) {
  const templates = mergeTemplates(customTemplates)

  return (
    <div className="animate-fade fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="animate-sheet mx-auto flex w-full max-w-[480px] flex-1 flex-col overflow-hidden p-4">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="flex-1 text-lg font-semibold">套用一个模板</h2>
          <button
            type="button"
            onClick={onClose}
            className="press min-h-11 rounded-lg border border-line-2 px-4 text-sm text-ink-2"
          >
            取消
          </button>
        </div>
        <p className="mb-3 text-sm text-muted">
          模板里的动作会自动加到今天的训练里，并标出"目标几组几次"
        </p>

        <div className="flex-1 overflow-y-auto">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onPick(template)}
              className="press mb-2 w-full card p-3 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 font-medium text-ink">
                  {template.name}
                </span>
                {template.id.startsWith('preset-') && (
                  <span className="shrink-0 text-xs text-muted">预置</span>
                )}
              </div>
              <div className="mt-1 text-sm text-muted">
                {template.items.length} 个动作
              </div>
              <div className="mt-1 text-xs text-muted">
                {template.items
                  .map((item) => exerciseName(allExercises, item.exerciseId))
                  .join('、')}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

