import { useState } from 'react'
import type { Exercise, WorkoutSession } from '../types'
import { mergeExercises } from '../data/exercises'
import {
  readBodyMetrics,
  readCustomExercises,
  readSessions,
  readSettings,
  writeSessions,
} from '../lib/storage'
import { resolveWeightKg, sessionStartISO } from '../lib/kcal'
import { SessionCard } from '../components/SessionCard'

// ============================================================
// 历史页
// ============================================================
// 按日期从近到远列出所有练过的训练，点开看每一组。
//
// 【数据从哪来】
// 就是你在训练页点"结束训练"时存进去的那些。
// 它们躺在储物柜的 nanofit:v1:sessions 那一格里。
// ============================================================

export function HistoryScreen() {
  const [sessions, setSessions] = useState<WorkoutSession[]>(readSessions)
  const [customExercises] = useState<Exercise[]>(readCustomExercises)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterExerciseId, setFilterExerciseId] = useState('')
  const [storageError, setStorageError] = useState(false)

  // 每条记录上的"约 XXX 千卡"要体重才算得出来。
  // 优先「身体数据」里最近一次，没记过才用设置里的默认体重。
  const [weightKg] = useState(() =>
    resolveWeightKg(readBodyMetrics(), readSettings()),
  )

  const allExercises = mergeExercises(customExercises)

  // 排序：三个判据，顺序在任何时候都是确定的。
  //
  // ① 日期倒序（最近的在最上面）。
  //    localeCompare 是按文字比较：'2026-09-24' 会排在 '2026-09-23' 前面，
  //    因为日期写成"年-月-日"这个格式，按文字比就等于按时间比。
  //
  // ② 同一天里按"开始时刻"倒序 —— 晚的在前（2026-09-26 加）。
  //    在这之前同一天只可能有一条：第二场会把第一场顶掉（那个 bug 刚修）。
  //    能出现两条之后，只按日期排就不够了 —— 同一天谁上谁下会交给
  //    "数组里原本的先后"去决定，不是我们说了算。
  //    方向选"晚的在前"，是为了跟整页"最近的在最上面"保持一致：
  //    你刚练完那一场就停在这一天那组的最上面，不用往下翻。
  //
  // ③ 兜底按 id 比。开始时刻完全相同时（比如两条都是没有 startedAt 的
  //    老记录）至少还有个确定的判据，保证任何时候打开顺序都一模一样。
  //
  // startedAt / completedAt 全项目都是用 new Date().toISOString() 写的，
  // 格式统一，所以按文字比就等于按时间比。
  const sorted = [...sessions].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    // 取不到开始时刻的（?? ''）排到当天最后 —— 不崩，也不占前面的位置
    const byStart = (sessionStartISO(b) ?? '').localeCompare(
      sessionStartISO(a) ?? '',
    )
    if (byStart !== 0) return byStart
    return a.id.localeCompare(b.id)
  })

  // 按动作筛选：只留下"练过这个动作"的那些训练
  const list =
    filterExerciseId === ''
      ? sorted
      : sorted.filter((s) =>
          s.entries.some((e) => e.exerciseId === filterExerciseId),
        )

  // 找出"历史里真正练过的动作"，用来做筛选下拉。
  // 注意不是把 40 个动作全列出来 —— 没练过的列出来只会碍事。
  const usedIds = new Set<string>()
  for (const s of sessions) {
    for (const e of s.entries) usedIds.add(e.exerciseId)
  }
  const usedExercises = allExercises.filter((e) => usedIds.has(e.id))

  function handleDelete(sessionId: string) {
    const target = sessions.find((s) => s.id === sessionId)
    const confirmed = window.confirm(
      `删掉 ${target?.date ?? ''} 这次训练？\n\n删掉就找不回来了。`,
    )
    if (!confirmed) return

    const next = sessions.filter((s) => s.id !== sessionId)
    const ok = writeSessions(next)
    setSessions(next)
    setStorageError(!ok)
  }

  return (
    <div>
      {/* 标题区和训练页用同一套排法（大标题 + 紧跟一行说明），
          这样在四个 tab 之间来回切的时候，每页开头的感觉是一致的 */}
      <header className="mb-5">
        <h1 className="t-num text-2xl font-bold">历史</h1>
        <p className="mt-1 text-sm text-ink-2">
          {sessions.length === 0
            ? '还没有记录'
            : `共 ${sessions.length} 次训练`}
        </p>
      </header>

      {storageError && (
        <div className="mb-3 rounded-xl border border-brand bg-brand/10 p-3 text-sm text-brand">
          存不进去了，可能是手机存储满了。请先告诉我。
        </div>
      )}

      {/* ---------- 按动作筛选 ----------
          造型和输入框统一（凹槽底 + 深一档的边界 + 聚焦时描边变主色），
          因为它们都是"能改控件"的同一类东西。 */}
      {usedExercises.length > 0 && (
        <select
          value={filterExerciseId}
          onChange={(e) => setFilterExerciseId(e.target.value)}
          className="mb-3.5 w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-ink outline-none transition duration-150 ease-mech focus:border-brand focus:ring-2 focus:ring-brand/25"
        >
          <option value="">看全部训练</option>
          {usedExercises.map((e) => (
            <option key={e.id} value={e.id}>
              只看练过「{e.name}」的
            </option>
          ))}
        </select>
      )}

      {/* ---------- 记录列表 ---------- */}
      {list.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          allExercises={allExercises}
          weightKg={weightKg}
          expanded={expandedId === session.id}
          onToggle={() =>
            setExpandedId(expandedId === session.id ? null : session.id)
          }
          onDelete={() => handleDelete(session.id)}
        />
      ))}

      {/* ---------- 空状态 ---------- */}
      {sessions.length === 0 && (
        <p className="py-12 text-center text-sm text-muted">
          还没练过。
          <br />
          去「训练」那一页记一次，结束训练后就会出现在这里。
        </p>
      )}

      {sessions.length > 0 && list.length === 0 && (
        <p className="py-12 text-center text-sm text-muted">
          没有练过这个动作的记录
        </p>
      )}
    </div>
  )
}
