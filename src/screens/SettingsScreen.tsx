import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Settings, Theme } from '../types'
import { PRESET_EXERCISES } from '../data/exercises'
import { registerBackHandler } from '../lib/backbutton'
import { downloadBackup, importBackup } from '../lib/json'
import {
  getRestNotifyStatus,
  openExactAlarmSetting,
  refreshRestNotify,
  requestRestNotify,
  sendTestNotification,
  subscribeRestNotify,
} from '../lib/restnotify'
import { isOnPhone } from '../lib/savefile'
import { readSettings, writeSettings } from '../lib/storage'
import { applyTheme } from '../lib/theme'
import { textToNumber } from '../lib/calc'
import { NumberField } from '../components/NumberField'
import { Switch } from '../components/Switch'
import { VersionLine } from '../components/VersionLine'
import { BodyScreen } from './BodyScreen'
import { LibraryScreen } from './LibraryScreen'
import { TemplateScreen } from './TemplateScreen'

// 外观的两个选项。两个按钮比下拉框快，和"个人资料"里选性别是同一个做法。
const THEMES: { key: Theme; label: string }[] = [
  { key: 'light', label: '日间（白底）' },
  { key: 'dark', label: '夜间（深色）' },
]

// ============================================================
// "设置"页 —— 按你的决定，这里当工具箱用
// ============================================================
// 动作库、训练模板、身体数据、备份，都从这里点第二下进去。
// 训练 tab 只负责记训练，保持干净。
//
// 【现在只有"动作库"是通的】
// 其他几项先显示成灰色并标上阶段号，让你一眼看到全貌和进度。
// ============================================================

// 记住当前显示的是"设置列表"还是某个子页面。
// 这是"不装路由"方案的核心：用一个变量代替网址栏。
type Sub = 'list' | 'library' | 'templates' | 'body'

export function SettingsScreen() {
  const [sub, setSub] = useState<Sub>('list')
  const [settings, setSettings] = useState<Settings>(readSettings)
  const [restPickerOpen, setRestPickerOpen] = useState(false)

  // ---------- 默认体重 ----------
  // 和休息计时器一样是"点一下展开"，不切子页面。
  // 【为什么放在这儿而不是「身体数据」里】
  // 设置页这份 settings 是挂载时读一次的，而「身体数据」是子页面、
  // 设置页不会卸载。在子页面里改了值，返回后这一页的 hint 还是旧的。
  // 放在本页展开就没有这个问题。
  const [weightPickerOpen, setWeightPickerOpen] = useState(false)
  const [weightText, setWeightText] = useState(() =>
    settings.defaultWeightKg !== undefined
      ? String(settings.defaultWeightKg)
      : '',
  )

  // ---------- 后台提醒 ----------
  // 和休息计时器、默认体重一样是"点一下展开"，不切子页面。
  const [notifyOpen, setNotifyOpen] = useState(false)
  // 状态直接问 restnotify.ts 要。它是同步的（状态一直存在内存里），
  // 所以能当 useState 的初值用。
  const [notifyStatus, setNotifyStatus] = useState(getRestNotifyStatus)
  const [testResult, setTestResult] = useState<string | null>(null)

  // 【为什么要订阅，而不是挂载时查一次就完事】
  // 你点「去开启」会跳到系统设置页，回来时这个页面并没有卸载 ——
  // 不订阅的话状态会一直停在"未开启"，看着像没生效，你会以为白点了。
  // restnotify.ts 那边每次回到前台都会重查一遍，查完通知这里重画。
  useEffect(() => {
    void refreshRestNotify()
    return subscribeRestNotify(() => setNotifyStatus(getRestNotifyStatus()))
  }, [])

  // 申请通知权限（弹系统那个"允许通知吗"的框）
  async function enableNotify() {
    await requestRestNotify()
    setNotifyStatus(getRestNotifyStatus())
  }

  // 点「试一下」：预约一条 5 秒后的测试提醒
  async function runTest() {
    setTestResult(null)
    const ok = await sendTestNotification()
    setTestResult(
      ok
        ? '已预约，5 秒后响。可以现在就把 App 切到后台试试。'
        : '没能发出去 —— 先把上面的「通知权限」打开。',
    )
  }

  const weightValue = textToNumber(weightText)
  // 空着也算合法 —— 那表示"取消这个设置"
  const weightValid =
    weightValue === null || (weightValue >= 20 && weightValue <= 300)

  function saveDefaultWeight() {
    if (!weightValid) return
    // 注意这里写 undefined 而不是 0：0 是"体重 0 公斤"，那是个假数字，
    // 会让热量算出个 0。undefined 才是"没这个设置"。
    saveSettings({ ...settings, defaultWeightKg: weightValue ?? undefined })
    setWeightPickerOpen(false)
  }
  const [storageError, setStorageError] = useState(false)

  // 改设置的统一出口。先写储物柜，再看写成功没有，
  // 失败就亮红字警告 —— 和动作库、训练页用的是同一套处理方式。
  function saveSettings(next: Settings) {
    const ok = writeSettings(next)
    setSettings(next)
    setStorageError(!ok)
  }

  // 切换外观。两件事必须一起做：
  //   1. 存进储物柜 —— 下次打开、甚至关了浏览器再开，还记得你选的是哪个
  //   2. 立刻挂到 <html> 上 —— 这一秒就换颜色，不用刷新
  // 只做第 1 件的话，要等下次打开才变色；只做第 2 件的话，一刷新就打回原形。
  function changeTheme(next: Theme) {
    saveSettings({ ...settings, theme: next })
    applyTheme(next)
  }

  // ---------- 导出 / 导入备份 ----------
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importMessage, setImportMessage] = useState('')
  const [importOk, setImportOk] = useState(false)

  // 导出备份。
  //
  // ★ 2026-09-24 重写的，原因值得记着：
  //   原来这里是"点一下、立刻说'已导出'"。那句话在手机上是【假的】——
  //   安卓的 WebView 根本不会下载文件，点了等于什么都没发生，
  //   而界面上照样说导出成功。详见 lib/savefile.ts 顶部那段。
  //
  //   现在它真的会去写文件、调起系统分享面板，所以这里要【等结果】，
  //   并且按结果说实话 —— 用户取消了就别说成功，失败了也别瞒着。
  async function handleExport() {
    setImportMessage('') // 先清掉上一次的话，免得两次看串了

    const outcome = await downloadBackup()

    if (outcome === 'cancelled') {
      setImportOk(false)
      setImportMessage('你关掉了分享面板，这次没存下来。想存的话再点一次。')
      return
    }
    if (outcome === 'failed') {
      setImportOk(false)
      setImportMessage('导出失败了。数据还在手机里，没丢 —— 先把这个情况告诉我。')
      return
    }

    setImportOk(true)
    setImportMessage(
      isOnPhone()
        ? '分享面板已经打开了 —— 要选「保存到文件」或者发到微信收藏，才算真存下来。'
        : '已导出，在浏览器的「下载」里。',
    )
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // 把选择框清空，这样同一个文件连续选两次也能触发
    e.target.value = ''
    if (file === undefined) return

    const confirmed = window.confirm(
      '导入会用备份文件里的数据，覆盖现在手机里的全部记录。\n\n确定要恢复吗？',
    )
    if (!confirmed) return

    const result = await importBackup(file)

    if (result.ok) {
      setImportOk(true)
      setImportMessage(`导入成功：${result.summary}页面稍后会自动刷新。`)
      // 各个页面都是"打开的时候才去读数据"的，
      // 导入完必须刷新一次才能看到新数据
      window.setTimeout(() => window.location.reload(), 1800)
    } else {
      setImportOk(false)
      setImportMessage(result.message)
    }
  }

  // ---------- 安卓的物理返回键 ----------
  // 在子页面（动作库 / 训练模板 / 身体数据）里按返回，先退回设置列表，
  // 而不是整个 App 退出去 —— 不然填到一半数据、手一滑 App 就没了。
  // 回到列表页（sub === 'list'）就把这个处理函数注销掉，
  // 让返回键交回给上一层逻辑（App.tsx 那边决定切页还是退出）。
  useEffect(() => {
    if (sub === 'list') return
    return registerBackHandler(() => {
      setSub('list')
      return true // 告诉上层：这次返回我处理了，别退出 App
    })
  }, [sub])

  // 如果当前在动作库里，就整个换成动作库页面。
  // 点"返回"时把它设回 'list'，就回到设置列表了。
  if (sub === 'library') {
    return <LibraryScreen onBack={() => setSub('list')} />
  }
  if (sub === 'templates') {
    return <TemplateScreen onBack={() => setSub('list')} />
  }
  if (sub === 'body') {
    return <BodyScreen onBack={() => setSub('list')} />
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">设置</h1>

      {storageError && (
        <div className="mb-3 rounded-lg border border-brand bg-brand/10 p-3 text-sm text-brand">
          设置存不进去了，可能是手机存储满了。
        </div>
      )}

      {/* 【这一页为什么从"一叠卡片"改成了"一本账"】
          以前每一项都是一张独立卡片（各带圆角、投影，之间还空 8px），
          七项加起来有 700 多像素 —— 在一屏只能放 800 多像素的手机上，
          光设置列表就要滑一屏半，而每一项只有"一个名字 + 一句说明"。
          改成账本之后：一块大的、行与行之间一条细线、行高砍掉近一半。
          同样的七项现在一屏基本能看完，而且"这是一份列表"的意思更清楚。

        divide-y = "给除了第一个以外每个孩子加一条上边线"，
        就是账本一行行画下去的画法。 */}
      <div className="ledger">
        <div className="divide-y divide-line">
        {/* ---------- 外观：日间 / 夜间 ---------- */}
        <div className="px-3.5 py-3">
          <div className="text-base font-semibold text-ink">外观</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            日间是白底，夜间是深色。点一下立刻换，也记得住。
          </p>
          <div className="mt-3 flex gap-2">
            {THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => changeTheme(t.key)}
                // 【选中的那一个为什么不再是"一整块橙"】
                // 它原来是一块实心橙红，是整页最响的东西 ——
                // 可设置页的正事是"从这些行里挑一个点进去"，
                // 眼睛不该先被一个偏好开关拽走。
                // 改成"淡橙底 + 橙字 + 橙边"：一眼仍看得出选的是哪个，
                // 但不再压过下面那些真正要点的行。
                className={`press min-h-11 flex-1 rounded-lg border text-sm ${
                  // 没选过（undefined）就是夜间 —— 和 index.css 的默认值、
                  // 以及 index.html 里那段防闪白光的脚本保持一致
                  (settings.theme ?? 'dark') === t.key
                    ? 'border-brand bg-brand/10 font-semibold text-brand'
                    : 'border-line-2 text-ink-2'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <SettingRow
          label="动作库"
          // 数字直接用 PRESET_EXERCISES.length 数出来，不写死 ——
          // 写死的话，以后每加一批动作都得记得回来改这里，一定会忘
          hint={`${PRESET_EXERCISES.length} 个预置动作 + 自建`}
          onClick={() => setSub('library')}
        />
        {/* 休息计时器：点一下展开秒数选项。
            【为什么行和展开的面板要包在同一个 div 里】
            divide-y 只对"直接的孩子"画线。包在一起之后，
            这一行和它展开出来的面板算作同一格，中间不会多出一条线；
            面板自己用 border-t 画线把自己和上面那行分开。 */}
        <div>
          <SettingRow
            label="休息计时器"
            hint={`组间休息 ${settings.restSec} 秒`}
            onClick={() => setRestPickerOpen(!restPickerOpen)}
          />
          {restPickerOpen && (
            <div className="flex flex-wrap gap-2 border-t border-line bg-surface-2 px-3.5 py-3">
              {[30, 45, 60, 90, 120, 150, 180].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => {
                    saveSettings({ ...settings, restSec: sec })
                    setRestPickerOpen(false)
                  }}
                  // 和上面「外观」那两个按钮用同一套选中样式（淡橙底 + 橙字 + 橙边），
                  // 两个地方的选择长得一样，才不用各学一遍
                  className={`press min-h-11 rounded-lg border px-3 text-sm ${
                    settings.restSec === sec
                      ? 'border-brand bg-brand/10 font-semibold text-brand'
                      : 'border-line-2 text-ink-2'
                  }`}
                >
                  {sec} 秒
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 后台提醒：切到别的 App 也能响（2026-09-24 加的）。
            它和上面那个「休息计时器」是一对：一个管休息多久，一个管到点怎么叫醒你。 */}
        <div>
          <SettingRow
            label="后台提醒"
            hint={
              !notifyStatus.native
                ? '只在手机 App 里生效'
                : !notifyStatus.granted
                  ? '未开启 · 切到别的 App 就不会提醒你'
                  : notifyStatus.exact
                    ? '已开启 · 锁屏、切 App 都会提醒'
                    : '已开启 · 可能晚几秒'
            }
            onClick={() => setNotifyOpen(!notifyOpen)}
          />
          {notifyOpen && (
            <div className="space-y-3 border-t border-line bg-surface-2 px-3.5 py-3">
              {!notifyStatus.native ? (
                <p className="text-xs text-muted">
                  「后台提醒」是把"到点叫我"这件事交给手机系统去办，
                  所以只有装在手机上的 App 才有这个能力，网页版做不到。
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted">
                    组间休息到点时，就算你切到别的 App 或者锁了屏，手机也会响。
                    原理是把这条提醒交给手机系统预约，而不是让 App 自己掐着表等 ——
                    App 切到后台后，自己掐的表就不走了。
                  </p>

                  <NotifyLine
                    label="通知权限"
                    ok={notifyStatus.granted}
                    okText="已开启"
                    badText="未开启，切到后台就不会提醒你"
                    actionLabel="去开启"
                    onAction={() => void enableNotify()}
                  />

                  <NotifyLine
                    label="精确闹钟"
                    ok={notifyStatus.exact}
                    okText="已授权 · 到点准响"
                    badText="未授权 · 可能晚几秒到几十秒"
                    actionLabel="去设置"
                    onAction={() => void openExactAlarmSetting()}
                  />

                  {/* 电池优化引导。这一段是【文字说明】，不跳转 ——
                      国内各家的设置页路径又乱又常改，跳过去也不一定落在对的地方，
                      写清楚让你自己点反而更靠谱。 */}
                  <div className="rounded-lg border border-line-2 p-3">
                    <div className="text-sm font-medium text-ink">
                      小米 / 华为 / OPPO / vivo 看这里
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      这几家的系统为了省电，会把后台 App 的提醒延迟、甚至直接吞掉。
                      如果发现「有时响有时不响」，去把本应用加进省电白名单：
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      <li>· 小米：设置 → 应用设置 → 应用管理 → NanoFIT → 省电策略 → 选「无限制」，再把「自启动」打开</li>
                      <li>· 华为：设置 → 应用 → 应用启动管理 → NanoFIT → 关掉「自动管理」，三个开关全打开</li>
                      <li>· OPPO：设置 → 电池 → 应用耗电管理 → NanoFIT → 允许「完全后台行为」</li>
                      <li>· vivo：设置 → 电池 → 后台耗电管理 → NanoFIT → 允许「后台高耗电」</li>
                      <li>· 原生安卓：设置 → 应用 → NanoFIT → 电池 → 选「不受限制」</li>
                    </ul>
                    <p className="mt-1 text-xs text-muted">
                      （系统版本不同，菜单名字会有点出入。）
                    </p>
                  </div>

                  {/* 试一下：不用真练一组，5 秒后就能看到效果。
                      权限、声音、震动、横幅、点一下能不能回到 App，全都能试出来。 */}
                  <button
                    type="button"
                    onClick={() => void runTest()}
                    className="press min-h-11 w-full rounded-lg border border-line-2 px-4 text-sm text-ink-2"
                  >
                    试一下：5 秒后提醒我
                  </button>
                    {testResult !== null && (
                    <p className="text-xs text-muted">{testResult}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* 默认体重：没在「身体数据」里记过体重时，算热量用它兜底。
            hint 里那句"填个体重就能看到热量统计"是这个功能的入口 ——
            没填过的时候统计页那一节是空的，主人得知道去哪补。 */}
        <div>
          <SettingRow
            label="默认体重"
            hint={
              settings.defaultWeightKg !== undefined
                ? `${settings.defaultWeightKg} kg · 没记过体重时用它算热量`
                : '填个体重就能看到热量统计'
            }
            onClick={() => setWeightPickerOpen(!weightPickerOpen)}
          />
          {weightPickerOpen && (
            <div className="border-t border-line bg-surface-2 px-3.5 py-3">
              <p className="mb-2 text-xs leading-relaxed text-muted">
                算热量估算用的。在「身体数据」里记过体重的话以那个为准，
                这里只是"从没记过"时的兜底。
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <NumberField
                    value={weightText}
                    onChange={setWeightText}
                    placeholder="75"
                  />
                </div>
                <button
                  type="button"
                  onClick={saveDefaultWeight}
                  disabled={!weightValid}
                  className="press min-h-11 shrink-0 rounded-lg bg-brand px-5 text-sm font-semibold text-on-brand shadow-[var(--elev-brand)] disabled:bg-surface-2 disabled:text-muted disabled:shadow-none disabled:border disabled:border-line"
                >
                  保存
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">
                单位 kg，合理范围 20–300。清空再保存 = 取消这个设置。
              </p>
            </div>
          )}
        </div>

        {/* 记录 RPE 的开关 */}
        <button
          type="button"
          onClick={() =>
            saveSettings({ ...settings, rpeEnabled: !settings.rpeEnabled })
          }
          // 【为什么整行都是按钮，还要再标 role 和 aria-checked】
          // 读屏软件看到 <button> 只会念"记录 RPE"，不会告诉你
          // "这其实是个开关，而且现在是开着的"。这两条属性就是补这个的。
          role="switch"
          aria-checked={settings.rpeEnabled}
          className="press flex w-full items-center gap-3 px-3.5 py-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-ink">记录 RPE</div>
            {/* 【这句说明为什么改短了】
                原来写的是"自感用力程度 1-10。关掉的话，记一组时少填一个框"。
                在 375px 的手机上，右边那个开关占掉 56 像素之后这一行只剩 250 像素，
                24 个字放不下 —— 最后那个"框"会单独掉到第二行，
                把这一格撑得比别人高出一截（截图里一眼就看出来了）。
                缩到 19 个字刚好一行放得下，意思一点没少。 */}
            <div className="mt-0.5 text-xs leading-relaxed text-muted">
              自感用力程度 1-10。关掉就少填一个框。
            </div>
          </div>
          <Switch checked={settings.rpeEnabled} />
        </button>

        <SettingRow
          label="训练模板"
          hint="推日 / 拉日 / 腿日，一键套用"
          onClick={() => setSub('templates')}
        />
        <SettingRow
          label="身体数据"
          hint="身高、体重、体脂"
          onClick={() => setSub('body')}
        />
        {/* ---------- 备份 ---------- */}
        <div className="px-3.5 py-3">
          <div className="text-base font-semibold text-ink">备份</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            数据只存在这台手机里，清缓存或换手机都会丢。
            建议每周导一次，顺手发到微信收藏。
          </p>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="press min-h-11 flex-1 rounded-lg bg-brand font-semibold text-on-brand shadow-[var(--elev-brand)]"
            >
              导出备份
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="press min-h-11 flex-1 rounded-lg border border-line-2 text-ink-2"
            >
              导入恢复
            </button>
          </div>

          {/* 这个文件选择框是藏起来的，点"导入恢复"按钮才会替你点它 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImport}
            className="hidden"
          />

          {importMessage !== '' && (
            <p
              className={`mt-3 text-xs leading-relaxed ${
                importOk ? 'text-ink-2' : 'text-brand'
              }`}
            >
              {importMessage}
            </p>
          )}
          </div>
        </div>
      </div>

      {/* 最底下这一行版本号。
          放在设置列表【外面】，不跟上面那些设置项混在一起 ——
          它是"查一下"用的说明文字，不是一个可以点的功能。 */}
      <VersionLine />
    </div>
  )
}

// 设置列表里的一行。
// 单独写成一个小零件，是为了几行不用把同样的样式抄好几遍。
//
// 【它自己为什么没有边框、没有圆角、没有底色】
// 那些全交给外面那个 .ledger 管：块有边线，行与行之间靠 divide-y 画细线。
// 每一行都自己带一套框，就又变回"一叠卡片"了 —— 那正是这一轮要改掉的。
function SettingRow({
  label,
  hint,
  onClick,
}: {
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // px-3.5 py-3：比原来那张卡片的 p-4 紧一档。
      // 一行"名字 + 说明"从 100 像素压到 62 像素左右 ——
      // 七行下来省掉将近 300 像素，一屏就能看完大半。
      className="press flex w-full items-center gap-3 px-3.5 py-3 text-left"
    >
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold text-ink">{label}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</div>
      </div>
      {/* 箭头用 SVG 画，不用「›」这个字符。
          字符的粗细和大小是跟着字体走的 —— 不同手机上的系统字体不一样，
          那个箭头就会一会儿粗一会儿细，而且它比旁边的字细太多，
          看着像没画完。SVG 的线宽由 strokeWidth 定死，到哪儿都一样。 */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-muted"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  )
}

// 「后台提醒」里的一行状态：一个名字、一句现状、需要时给个按钮。
//
// 【为什么单独写一个】
// 通知权限和精确闹钟是两条几乎一样的行，只有文案和按钮不一样。
// 手抄两遍的话，改样式时一定会漏掉一处。
//
// 【为什么"已完成"时按钮整个不显示】
// 显示一个点不动的灰按钮，比不显示更让人困惑。
function NotifyLine({
  label,
  ok,
  okText,
  badText,
  actionLabel,
  onAction,
}: {
  label: string
  ok: boolean
  okText: string
  badText: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-ink">{label}</div>
        {/* 没完成时用主色（橙红）标出来 —— 这两条是"要你去处理"的，
            和旁边那些纯说明文字得区分开 */}
        <div className={`mt-0.5 text-xs ${ok ? 'text-muted' : 'text-brand'}`}>
          {ok ? okText : badText}
        </div>
      </div>
      {!ok && (
        <button
          type="button"
          onClick={onAction}
          className="press min-h-11 shrink-0 rounded-lg border border-line-2 px-3 text-sm text-ink-2"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
