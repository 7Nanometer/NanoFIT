# NanoFIT

个人健身记录 App。项目主人是编程新手，代码与沟通要让他能看懂、能自己排查。

## 铁律

1. 纯前端：不接后端、不接数据库、不做登录注册、不碰需 API Key 或付费的服务。
2. 技术栈：Vite + React + TypeScript + Tailwind CSS + recharts。状态管理只用 useState / useContext。数据存 localStorage。
3. 不写测试框架。
4. 不擅自扩范围：社交、排行、云同步、AI 教练、动作识别都不做。
5. 改代码前先 git commit。

## 沟通

中文、简短、一次一件事。不堆术语，用类比解释。需求有冲突直接说，别照着错的做。

## ★ 这个仓库是公开的（2026-10-09 补记）

代码托管在 **`https://github.com/7Nanometer/NanoFIT`**，**visibility = public** ——
推上去的东西全世界都看得到，而且会被搜索引擎和第三方存档抓走，删掉也可能留着副本。

所以提交之前多看一眼 `git status`：别把备份文件、个人记录、
`android/local.properties` 这类带本机路径的东西提交上去。
（这些都是 gitignore 挡着的，但**新加的文件不会被自动挡住**，得自己看。）

仓库 2026-10-09 前叫 `nanofit`（小写），后来改成 `NanoFIT`，
本地 remote 已同步改成新地址。旧地址现在靠 GitHub 的跳转在工作，
但**跳转不保证一直在**（万一有人注册了 `nanofit` 这个名字就会被顶掉），
所以别再用旧地址。换电脑/重新克隆时用新的那个 URL。

## 这台电脑的环境（2026-09-23 记）

- **网络**：国内，`github.com` 常被卡住，`api.github.com` 通。
  机器上跑着 Clash Verge（`clash-verge.exe` + `verge-mihomo.exe`，监听 `127.0.0.1:7897`）。
  **git 不读 Windows 的系统代理设置**，所以本项目已在 `.git/config` 里配了 `http.proxy`。
  代理没开时 `git push` 会失败（提示连不上 7897）——开起来，或 `git config --local --unset http.proxy`。
  详细步骤写在 README 的「代码推不上去怎么办」。
- **`gh` 命令行**在 `/c/Program Files/GitHub CLI/gh.exe`，账号 7Nanometer。
  它连的是 `api.github.com`，**不需要代理**。但令牌只有 gist / read:org / repo 三个权限，
  动账户设置（比如加 SSH 密钥）会报 404 并要求 `admin:public_key`。
- **开发服务器**：`npm run dev`，端口 5173。真机测试用 `npm run dev -- --host` + 局域网 IP（192.168.3.21）。

## 节奏

一次只推进一个阶段，做完停下告诉主人浏览器能看到什么。
每阶段结束必须 npm run dev 无报错，并 git commit 一次。
不一次性生成十几个文件，逐个创建，每个附一句说明。

## 数据模型

Exercise { id, name, muscleGroup, equipment, isCustom, kind?, note? }
SetEntry { id, exerciseId, weightKg, reps, rpe?, completedAt, durationSec?, distanceM?, kcal? }
WorkoutSession { id, date, name?, entries: SetEntry[], note?, durationSec?, startedAt?, metLevel?, restEndsAt? }
Template { id, name, items: { exerciseId, targetSets, targetReps }[] }
BodyMetric { date, weightKg, heightCm?, bodyFat?, bodyFatSource? }
Settings { restSec, rpeEnabled, sex?, birthYear?, theme?, defaultWeightKg?, lastMetLevel? }

肌群 8 个：chest / back / legs / shoulders / arms / core / fullbody / cardio
器械 8 种：杠铃 / 哑铃 / 史密斯 / 固定器械 / 绳索 / 自重 / 壶铃 / 有氧器械
力量强度档 4 个：low(3.0) / moderate(3.5) / high(6.0) / circuit(8.0)

2026-09-23 按主人决定：
- BodyMetric 加 heightCm
- 同日加 bodyFatSource：'measured'（自己称的）/ 'formula'（公式算的）。
  这两个数在界面上必须分开显示，绝不混在一起。没有这个字段的老记录一律当 measured。
- Settings 加 sex 和 birthYear（体脂率公式要用）。存出生年份而不是年龄，过生日自动长一岁。
- Settings 加 theme：'light' / 'dark'。没选过（undefined）一律按夜间，和原来的观感一致。

2026-09-24 按主人决定（加有氧）：
- MUSCLE_GROUPS 从 6 个扩到 8 个，新增 fullbody（全身）和 cardio（有氧）。
  MUSCLE_LABELS 是穷尽 Record，漏写中文会编译报错——这是故意的，别绕开。
- 新增 EQUIPMENTS 词表（见上）。`Exercise.equipment` **类型保持 string 不收窄**，
  因为老自建动作里可能有"史密斯机"这种自由文字，收窄后运行时照样是任意字符串，
  查表得 undefined。改为"只在新建表单和筛选按钮里用 EQUIPMENTS 约束新数据"。
- Exercise 加 kind：'strength' / 'cardio'，**可选**。读取一律走
  `exerciseKind(e)`（在 src/data/exercises.ts），内部兜底 `kind ?? 'strength'`。
  ★ 兜底必须写在消费点：手机盘上已有的老数据不经过导入备份，只在导入点补字段会漏。
- SetEntry 加 durationSec? 和 distanceM?（有氧用）。
  ★ weightKg / reps **保持必填**，有氧记录填 0。改成可选会让全项目 6 处算出 NaN
  并污染所有图表，而填 0 时 0×0=0 天然无害，只需在"显示"处按 kind 分支。
- 有氧记录进**现有的 entries 数组**，靠 exerciseId 指向动作 + exerciseKind 区分。
  ★ 不新开存储键：另开键必须同步改 json.ts 的 buildBackup/importBackup/isBackup，
  那才是真会丢数据的地方。塞进 entries 则历史页、导出、导入全自动带上。
- 分流靠 `cardioIdSet(all)` 把 sessions 切成"只有力量"和"只有有氧"两份视图，
  再喂给现有统计函数——**stats.ts 的函数签名一个都不用改**。
- 有氧公式（src/lib/calc.ts）：田径场第 1 道算 400 米，每往外一道 +7 米；
  配速 = 秒 ÷ 公里数。
- **不做 GPS 定位测距**（主人明确否决：耗电、精度、权限链路，且会偏离"记录本"定位）。

2026-09-24 按主人决定（加热量估算）：
- ★★★ **界面上一律写"约 XXX 千卡"，绝不写"消耗 523 千卡"。**
  MET 公式的实测偏差本来就有 10–20%，写成精确数字是在骗人。
  凡是显示热量的地方，附近必须有"这是估算、不含运动后持续燃烧"的说明。
- 公式 `消耗 = (MET − 1) × 体重(kg) × 时长(小时)`，减 1 是为了只算
  "运动额外多消耗的"，不含躺着也要烧的基础代谢。**界面上必须解释这一点**，
  否则主人拿它跟手环对数字（手环常给总消耗）会困惑。
- SetEntry 加 kcal?（有氧器械上显示的数值，填了就用它）；力量动作**不开**
  这个口子 —— 健身房里没哪台器械会告诉你"这次深蹲烧了多少"。
- WorkoutSession 的 durationSec **从这天起真的写上**（之前是纯占位，
  全项目零写入零读取）。在 finishWorkout 里写，取"开始 → 点结束那一刻"，
  ★ 必须含组间休息：MET 档位是按整场平均强度定的，只算做组时间会严重高估。
- Settings 加 defaultWeightKg? 和 lastMetLevel?。体重优先取 BodyMetric
  最近一次，都没有才用 defaultWeightKg，再没有就不显示热量。
- ★ **混合训练的时长要去重**：一次训练里既有力量又有有氧时，
  力量部分 = 整场时长 − 有氧总时长。直接用整场时长会把跑步那段算两遍。
- 力量档位推荐（src/lib/kcal.ts 的 recommendMetLevel）。优先级从高到低：
  ★★ **第一步：记了 RPE 就信 RPE。** 理由：RPE 是用户**亲口说的"这一组有多难"**，
    而"休息多久""练了哪些动作"都只是间接推测。2026-09-24 之前系统放着 RPE
    不用去猜，结果"倒蹬机 90kg×8 练到 RPE 10、16 组、42 分钟"被判成低强度，
    热量差 2.5 倍。
    ★ 取中位数不取最大值、也不取平均数：取最大值的话一组冲到 10 就把整场带偏；
      平均数会被"中间接个电话"那种极端值整个带偏。中位数答的是
      "这次训练**典型**有多累"，那才是我们要问的问题。
    ★★ **先摘掉热身组再算中位数**（2026-09-26 加）：RPE < 6 的组算热身，
      不参与判定。热身不代表这次训练的强度，参与算只会把结果往下拽。
      真机案例：23 组里前 3 组是 RPE 3/4/5 的热身，不摘 → 中位数 7（判"中等"）；
      摘掉 → 中位数 7.5（判"中高"，对上了）。
      ★ 全被摘掉（整场都是热身）→ **低强度**。绝不能因为"正式组为空"就掉到
        下面那条"猜"的路上去 —— 那样会猜出个高强度，和实际情况正好相反。
    档位边界（中位数）：**≥9 → 高强度 6.0 ｜ ≥7.5 → 中高强度 5.0 ｜ 其余 → 中等 3.5**
    ★ 再加一条叠加规则：**RPE ≥ 8 且组间休息中位数 < 60 秒 → 循环训练 8.0**。
      ⚠️ 这条的门槛（8）**比"高强度"那条（9）低，是故意的**，不是笔误：
        它判的是"喘不上气地连轴转"，和"单组很重"本来就不是一回事。
      ⚠️ 2026-09-26 之前"高强度"的门槛也是 8，两条并列、分不开；
        加了 5.0 那一档之后它们才各归各位。
  没记 RPE 才退回按数据推测（取第一个命中的）：
    ①每组之间隔不到 60 秒→循环 ②含大重量复合动作→高强度 ③时长<30分或组数<8→低强度 ④中等
    ★ **这条路上永远猜不到"中高强度 5.0"** —— 不是漏了，是主人 2026-09-26
      明确决定不动它：没记 RPE 时的推荐本来就是兜底，规则越多越容易猜错，
      而那时用户自己知道这场练了什么，直接手选就行。
  ★ 推荐和落盘必须用**同一个时长**（都走 TrainScreen 的 completedSession()），
    否则会在"不到 30 分钟算低强度"这条分界线上打架。
  ★ 它返回 `{ level, reason }`，理由和档位必须从**同一个函数**里出来。
    另写一个 explain 函数的话两份判断逻辑一定会走偏，
    到时候界面上的理由和实际用的档位对不上，比不说还糟。
- HEAVY_COMPOUND_IDS = "能上大重量的多关节推 / 拉 / 蹲 / 髋铰链"，
  杠铃 + 史密斯 + 固定器械 + 绳索都算（2026-09-24 从 14 个补到 26 个）。
  ★ 有判据地**不加**：单侧单臂变体、辅助引体向上（那是"借力做引体"的机器，
    恰恰是**轻**的信号不是重的）、下拉的握法变体（父类已覆盖）、孤立动作。
- 结束训练时弹 MetPicker（src/components/MetPicker.tsx）让主人确认档位。
  ★★ **打开时默认选中的永远是"本次推荐"，不是"上次选的"。**
    以前是 `settings.lastMetLevel ?? recommended` —— "上次选的"永远赢，
    而 lastMetLevel 一旦写进去，全项目**没有任何地方会作废它**，
    一次选错就永久错下去。这就是 2026-09-24 那次热量偏低的直接原因。
    现在"沿用上次"降级成一个**要自己点**的快捷按钮（出现了但不自动选中）。
  ★ lastMetLevel 读的是"点结束训练那一刻现读"的值，不是页面挂载时的
    settings —— 一次打开 App 里练两场的话，挂载时那个值是过时的。
  ★ 选的和建议不一样时，必须用主色写**一句完整的话**
    （"你选的是 X，和系统建议的 Y 不一样，热量会按你选的算"）。
    只在按钮上挂一个小「建议」标签是不够的：用户根本注意不到，
    出了事也不知道自己选的和系统想的不一样。
  ★ 档位按钮**竖着排、一行一个、占满宽度**（2026-09-26 改，原来是 flex-wrap）。
    五个按钮宽窄不一，"中高强度 5.0"比"中等 3.5"宽一大截，
    自己折行会折得参差不齐，看着就挤。
  ★ **每行左边档位名、右边 MET 值**，MET 用 tabular-nums + 右对齐。
    五个数字对齐成一列才能一眼比出"这几档差多少" ——
    主人原话："不然我选的时候不知道差别有多大"。
  ★ 说明文字（hint）只显示**当前选中**那一档的一行，不要五行都写 ——
    五行都写面板要高出一大截。
- ★ 没有体重时，统计页那一节**整节不显示**，改成一句"填个体重就能看到热量统计"；
  设置页「默认体重」那行的 hint 也是这句。显示一堆 0 只会让人以为坏了。
- 统计页那一节的说明文字（不含运动后持续燃烧、为什么减 1、跟手环对不上是正常的、
  误差 10–20%）**不是客套话，是这个功能的一部分，不许删**。

2026-09-26 按主人决定（修"同一天练两次"）：
- ★★ **同一天可以有多条 WorkoutSession**。落盘时按 **id** 去重，不按 date：
  `readSessions().filter(s => s.id !== finished.id)`。
  ★ 原来写的是 `s.date !== session.date` —— 那等于"这天有过记录就全删掉"，
  同一天练第二场会把第一场**无声无息地顶掉**。这条从 dcf5890「阶段3-1」
  （第一个能记训练的版本）就在，属于**已经丢过的数据**，改不回来。
  ★ 成立的前提：`completedSession()` **不重新生成 id**（它只做
  `{ ...s, durationSec }`）。以后要改那个函数，必须保住这条 ——
  否则按 id 去重会失效，变成攒重复。
  ★ 新写法严格比旧的**更不容易丢数据**：只顶掉 id 相同的那一条。
- 历史页排序判据从 1 个加到 3 个（`HistoryScreen.tsx`）：
  ① 日期倒序 ② 同一天内按开始时刻倒序（**晚的在前**，跟整页"最近的在最上面"
  同方向）③ 兜底按 id。三者合起来保证**任何时候打开顺序都一模一样**；
  只按日期排的话，同一天谁上谁下由数组原始顺序决定，不是我们说了算。
  `startedAt` 取不到就退回第一组的完成时间 —— 这个口径抽成了
  `kcal.ts` 的 `sessionStartISO()`，和 `sessionSeconds()` 共用一份定义。
  ★ 另外三处只按日期排的地方（`StatsScreen.tsx` 本周列表、`stats.ts` 的
  `lastSessionDate` / `lastSessionVolume`）**故意不动** —— 它们不给人看列表。
- ★ 有氧那边不受影响：它不写 sessions，走的是 entries。

localStorage 前缀 nanofit:v1:。读写集中在 src/lib/storage.ts。支持导出/导入 JSON。

## 界面

移动优先 375px，桌面居中最大 480px。
点击区最小 44×44px。重量与次数输入用 inputMode="decimal"。
底部 4 tab：训练 / 历史 / 统计 / 设置。

动作库（设置 → 动作库）有**两条筛选条：肌群 + 器械，叠加生效**
（选"胸"+"哑铃" = 哑铃练胸的动作），再叠加搜索框里打的字。

- 器械条上那个"其他"按钮**只在存在非标准器械的自建动作时才出现**。
  老版本允许自由填器械，不兜住的话那些动作在任何器械按钮下都看不见，
  像是数据丢了。
- 训练页的选动作弹层（ExercisePicker）**不加器械条** —— 它在训练中间用，
  少一层操作更重要；想按器械找直接搜"史密斯"就行（器械名也在搜索范围内）。

### 配色：两套，靠 CSS 变量整套切换

夜间（默认）：底 #121212 / 卡片 #1E1E1E / 主色 #FF4D2E / 橙红上的字 #121212
日间：底 #FFFFFF / 卡片 #F5F5F4 / 主色 #D93A1E / 橙红上的字 #FFFFFF

- **颜色只在 src/index.css 的 @theme 里定义一次**，日间那套写在 `:root[data-theme='light']` 里整套覆盖。
  切换时 JS 只做一件事：往 `<html>` 挂 `data-theme="light"`。
- **绝不要**给单个元素写两遍（`bg-white dark:bg-[#121212]`）—— 几百处里漏一处，日间模式下就是白底白字。
- 日间的主色必须比夜间深一档：鲜橙红 #FF4D2E 在白底上当文字只有 3.3:1，达不到 4.5:1。
- 图表颜色不能写死十六进制（recharts 不认 CSS 类名），用 `lib/theme.ts` 的 `chartColors()` 现读。

## 公式

训练时长（2026-09-24 补的显示和修正，算法一直在 src/lib/kcal.ts 的 sessionSeconds）：
  · **开始时刻** = 第一次加动作那一刻（`startedAt`，在 addExercise /
    applyTemplate / addCardio 三处都是 `base.startedAt ?? new Date()`，
    写完就不覆盖）。**有意的**：不做"开始计时"按钮 ——
    手动点的毛病是**会忘**，一忘就是整场没计时；自动开始最多差十几分钟，
    而且随时能改（见下）。
  · **结束时刻** = 点"结束训练"那一刻。★ 所以它包括**组间休息**
    （热量那套 MET 档位是按整场平均强度定的，只算做组时间会严重高估）。
  · ★★ **超过 6 小时（SESSION_STALE_MAX_SEC）就按"最后一组的时间"算结束**，
    不按"现在"。练完忘点结束、隔一夜才打开 App，不保护的话会记成
    20~72 小时、热量上万。
    ★ 这是"换成拿用户自己的最后一组当依据"，**不是**发明一个上限去截断 ——
      截掉的那几个小时是编的，而"最后一组记到几点"是用户记的。
      而且硬砍 6 小时会误伤"昨晚练到 00:30"这种真实情况（最后一组就在 00:20）。
    ★ 判据用**时长**不用"日期是不是今天"：早上 8 点开练、当天晚上 8 点
      才打开，开始日期还是今天，但照样会记成 12 小时。
    ★ 训练页顶部要出横幅说清楚（用户会以为系统擅自改短了他的时长）。
  · ★★ **结束时刻要在点"结束训练"那一刻冻结**（TrainScreen 的 finishEndISO），
    面板显示和最终落盘都用它。面板开着时用户可能磨蹭几分钟，
    两处各读一次表就会"面板写 42 分钟、存进去 44 分钟"。
    ★ 这就是"推荐时长 ≠ 落盘时长"那个坑的同一类，**已经踩过两次了**
      （第一次是推荐档位和热量用了不同的时长）。以后凡是"显示一个数、
      待会儿再存同一个数"的地方，都要先问一句：这两处读的是同一次吗？
    ★ 纯有氧那条路要把 endISO **显式传下去**：同一个事件处理函数里
      setState 还没生效，紧接着读那个 state 拿到的是旧值。
  · **开始时间可以改**（components/StartTimeEditor.tsx，入口在选档面板里）：
    用户几点开始热身 App 猜不到，只能让他自己往回推 ——
    猜不到的事就别猜。快捷档（提前 10/20/30 分钟/1 小时）+ 手填一个时刻。
    · ⚠️ 手填的时间解释成"和当前开始时间**同一天**的那个时刻"，
      日期不变。跨天的歧义说不清楚，而热身要补的也就是几十分钟。
      界面上要把这句写出来。
    · ⚠️ 不能晚于第一组（跑到第一组后面就说不通了），也不能晚于现在，超了夹住。
    · 只改正在进行的这次，**历史记录不跟着变**（和"老记录不重算档位"同一个规矩）。
  · ★ **时长的算法只有一份**：`sessionSeconds()`。stats.ts 里全是汇总
    （thisWeekDurationSec / averageSessionSec / dailyDurations），
    不重算一遍 —— 重算的话历史页的时长和统计页的总和对不上，用户没法核对。
  · ★ 算不出时长的（老记录没记开始时间）**跳过，不拿 0 顶替**：
    0 是"练了 0 秒"，混进"平均每次"的分母里会把数字往下拽。
  · 统计页的时长趋势**按天合并**（一天两次算那天的总时长），
    因为按"次"画会在同一个日期上叠两个点。合并会丢掉"那天几次"这个信息，
    所以「看数字」表多一列标出来（ProgressChart 的 extraLabel/extra，
    可选参数，别的调用点不受影响）。

容量 = Σ(weightKg × reps)
估算 1RM（Epley）= weightKg × (1 + reps / 30)
  ★ 图上画的**不是**"当天最好那一组"，是"截至那天、前 90 天里的最好水平"。
    当天最好的那个数只能反映"今天怎么练的"：今天冲大重量点就高、
    明天小重量多组点就低，同一个人练法一变曲线就抖，看不出进步。
    滚动窗口才反映能力变化。实现在 stats.ts 的 oneRmSeries()。
  ★ 只统计**次数 1~12、且重量 > 0** 的组（ONE_RM_MAX_REPS）：
    · 次数多时 Epley 会明显高估（70kg×20 推出 116kg，但那人举不起 116kg）
    · 重量 0 的自重动作推出来永远是 0，只会画出一条贴底的假线
  ★ PR 线 = 截至那天的历史最高，在循环外累积所以天然是阶梯、只升不降。
  ★ 换了一张图之后才敢删的：ExercisePoint.best1RM 是"当天最好"那个旧口径。
BMI = 体重kg ÷ 身高m²

估算体脂率（Deurenberg）：
  男 = 1.2×BMI + 0.23×年龄 - 16.2
  女 = 1.2×BMI + 0.23×年龄 - 5.4
  ★ 它算的是"这种身高体重年龄性别的人平均多少"，不是测量值。
    误差 ±4～5 个百分点，肌肉多的人会被算高。界面上必须标"估算"。

有氧（2026-09-24 加）：
  田径场单圈 = 第1道长度 + (道次 - 1) × 7 米     （第1道默认 400，可改）
  距离 = 单圈 × 圈数                            （圈数允许小数，如 12.5）
  配速（秒/公里）= 时长秒 ÷ 公里数                （缺任一项返回 null，不显示 0）
  ★ 每道 +7 米是标准场地的近似值（道宽 1.22 米），写在 calc.ts 的
    TRACK_LANE_STEP_M 里。碰上道宽不一样的场地改这一个常量。

消耗热量（2026-09-24 加，全部在 src/lib/kcal.ts）：
  消耗（千卡）= (MET − 1) × 体重(kg) × 时长(小时)
  ★ 减 1 是为了只算"运动额外多消耗的"，不含躺着也要烧的基础代谢。
    界面上必须解释，否则跟手环对数字（手环常给总消耗）会以为算错了。
  力量五档：low 3.0 / moderate 3.5 / midHigh 5.0 / high 6.0 / circuit 8.0
    ★ midHigh（中高强度 5.0）是 2026-09-26 加的。5.0 不是编的：
      Compendium 编码 02052「抗阻（重量）训练：深蹲，慢速或爆发完成」= 5.0 METs。
      加它的原因：3.5 到 6.0 之间差 71%，而"23 组、9000kg 容量、RPE 中位数 7.5"
      这种训练正好落在空档里 —— 判"中等"太轻、判"高强度"太重。
    ⚠️ 加档位时编译器**不会报任何错**（STRENGTH_MET_INFO 是数组不是 Record，
      全项目没有穷尽映射、没有 switch、没有测试）。漏改的话 metOf() 会静默
      按 3.5 算热量、metLabel() 会直接吐裸英文给用户看。所以加档位必须
      同时改 types.ts 的 STRENGTH_MET_LEVELS 和这里的表，并跑一遍
      "每一档的 metOf / metLabel 都对"的检查。
  有氧固定值：椭圆机5 动感单车7 划船机7 卧式车5 楼梯机9 风阻车10 跳绳12 开合跳8 高抬腿8
  跑步按速度插值：5km/h=3.5、6.4=6.0、8=8.3、10=9.8、12=11.8（超出按两端算）
    ★ 没填距离也没填配速时按 FALLBACK_RUN_MET=8.3（慢跑）兜底，界面要标出来
  混合训练：力量时长 = 整场时长 − 有氧总时长（不去重会把跑步算两遍）
  ★ 一律显示成"约 520 千卡"（抹到最近 10），绝不显示"523 千卡"
  ★★ **同一个页面上只能有一种精度。** 2026-09-24 出过这么一件事：
    卡片写"约 110 千卡"，下面那张热量柱状图的「看数字」表里写 113 ——
    看着像哪里算错了，用户就是顺着这个 113 反推出"用了 3.0 那一档"的。
    现在 `dailyKcal()` 里也走 `roundKcal()`，抹在**数据那一层**，
    柱子高度/鼠标提示/看数字表/纵轴刻度一次性全统一。
  ★ 那张柱状图是**按天**画的（2026-09-30 从"按周"改的）：最近 14 天、
    一天一根柱子（力量的柱子和有氧的柱子并排）。理由：
    · 一周一百多根柱子压成一根，会把"这周只练了一次"和"天天练"画得一模一样
    · 天数取 14：7 天太短、跟上一周没法比；30 天柱子在手机上细到看不清
    · **一天练两次累加进同一根柱子**，不是并排画两根（一天只有一个位置）
    · **没练的日子补 0，不许跳过** —— 连着几天空着本身就是信息，
      跳过的话横轴会变成"练过的那些天"挤在一起，看着天天都在练
    · 横轴 14 个日期排不下，用 `X_TICK_MIN_GAP` + `X_TICK_INTERVAL`
      抽稀（和几张折线图同一组常量），别自己另发明一套
    · 「本周消耗 / 本月消耗」那两个卡片**没动** —— 它们回答的是
      "到现在为止攒了多少"，跟"每天怎么分布的"是两回事
  ★ 全项目**只有一份热量算法**：`explainSessionKcal()` 算出"用了哪一档、
    MET、体重、整场多久、其中有氧多久、力量按多久算、结果多少"，
    `sessionKcal()` 和 `sessionKcalSplit()` 都只是取它的字段。
    界面要展示算式时**必须**调它，绝不许照着公式在界面里重算一遍 ——
    重算的迟早会和原件走偏，那种"解释"比不解释更糟。
  ★ 统计页有一块可展开的「这些数是怎么算出来的？」，逐次列出本周用到的
    每一样输入。加它的原因就是上面那件事：页面上只有结果、没有过程时，
    用户只能靠反推去猜，猜完还得来问。

## 后台休息提醒（2026-09-24 加）

组间休息到点时，切到别的 App、锁屏也要能提醒。**原理是把"到点叫我"交给安卓系统
预约一个闹钟**，而不是让 App 自己掐表 —— App 一进后台，网页自己的定时器就被降频甚至冻住。

绝大部分在 `src/lib/restnotify.ts`（网页端整条链路空转，一行原生代码都不执行）。
**唯一一处原生代码**是 `android/.../MainActivity.java` —— 它负责亲手建通知渠道，
理由见下面"渠道"那一条。

- ★★ **核心是一条不变式，只有一个出口**：
  `预约 ⟺ 在手机上 且 通知权限已给 且 App 不在前台 且 休息没结束`，其余一律取消。
  所有改状态的地方都只调 `syncRestNotify()`，不自己决定约还是取消 ——
  分开写一定会漏出口（切 tab / 点跳过 / 训练结束 / 权限被撤销…）。
- **它不接参数，自己去读存档**（`readActiveWorkout()?.restEndsAt`）：
  切 tab 会把训练页整个卸载，那时只有读存档才拿得到"休息到几点结束"。
- ★★ **通知渠道由 [MainActivity.java](android/app/src/main/java/com/nanometer7/nanofit/app/MainActivity.java)
  亲手建，不走插件的 `createChannel`**（2026-09-26 改，震动那条踩过大坑）。
  渠道：id `rest-timer-v2`、**重要性 4(HIGH)**、锁屏可见、`enableVibration(true)`、
  **带明确的震动节奏** `new long[]{0,400,250,400}`、**不设 sound**（= 系统默认通知音）。
  - **为什么必须自己建**：插件的 `createChannel` 只会调 `enableVibration(true)`，
    **从不设震动节奏**（整个 local-notifications 插件里搜不到一处 `setVibrationPattern`）。
    而"开了震动开关、没给节奏"在真机上**就是不震**，而且系统设置里那个渠道
    **连「震动」这一项都不显示**。真机实测 12 次全不震，换成自己建 + 给节奏之后
    **每次都震**。★ 系统设置里显不显示那一项**不等于**震不震，别拿它当判据。
  - **为什么放在 `onCreate` 里**：`createNotificationChannel()` 对**已存在**的渠道
    是空操作，谁先建谁说了算；`MainActivity.onCreate` 跑在网页加载之前，一定赢过插件。
  - **`REST_CHANNEL_ID` 必须和 `restnotify.ts` 的 `CHANNEL_ID` 一字不差**，
    对不上的话这里建的没人用，通知会落回插件建的那个（没节奏的那个）。
  - ⚠️ 整段包在 try/catch 里 —— 建渠道失败最多是不震，但 **App 必须能打开**（数据在 App 里）。
  - ⚠️ Java 源码里的中文（渠道名/描述）有被 Gradle 用错编码搞坏的风险
    （和 build.gradle 里那个 `·` 是同一类坑）。打完包要去 **dex** 里按 UTF-8
    原始字节核对一遍。★ 这个包是**分包**的（11 个 dex），自己写的类在
    `classes11.dex` 里 —— 只在 `classes.dex` 里找会什么都找不到，误判成"编码坏了"。
  - ⚠️ 安卓 7 上 `createChannel` 会直接抛错，要包一层 catch。
- **旧渠道 `rest-timer` 要删掉**：换编号时留下的，不删的话系统设置里会有
  两条都叫「组间休息」，主人不知道该看哪条（真机反馈过）。
  ★ 但 **只在"新渠道确实存在"的前提下才删** —— 反过来的话，万一新渠道没建起来、
  旧的又删了，安卓 8 起"渠道不存在"的通知会被**直接丢掉**，提醒彻底失效。
  所以 `removeLegacyChannel()` 先 `listChannels()` 确认新的在，再动旧的。
- ★★ **通知 id 按"这条提醒的结束时刻"算，不是固定数字**（2026-09-26 改，踩过大坑）。
  插件源码里**写死**了一句 `mBuilder.setOnlyAlertOnce(true)`
  （`LocalNotificationManager.kt:199`，没有任何开关能关掉它）。含义是：
  **同一个 id 的通知再次出现时，系统当成"更新"——只换文字，不再响、不再震、不弹横幅**。
  原来这里固定用 1 号（本意是"新的顶掉旧的、不攒一排"），两句一撞 →
  **当天第一条提醒之后，后面每一条都哑**（看着就是"没震动、也没声音"）。
  现在 `restNotifyIdFor(endsAt) = 1_000_000 + (endsAt % 10亿)`：
  · 两次**不同**的休息 → 号不同 → 每条都是全新的一条 → 该响就响、该震就震
  · **同一次**休息重复预约（App 被杀掉又打开之类）→ 号相同 → 顶掉旧的，不攒两条
    （这正是原来固定用 1 号想要的效果，保住了）
  「试一下」另起一段号：`2_000_000_000 + (Date.now() % 1亿)`。
  ⚠️ 那里的模数**必须是 1 亿**：2,000,000,000 + 99,999,999 正好卡在安卓要求的
  32 位整数上限 **2,147,483,647** 以下。照抄休息提醒那边的 10 亿会算到 30 亿，
  **溢出成负数**（这个坑是跑测试当场抓到的，不是推出来的）。
  ⚠️ 撤销必须按 `lastRestNotifyId` **记下来的那个号**撤（`cancelRest()`），不能写死。
  ★ **以后再加任何"会重复出现"的通知，都必须换新 id** —— 否则一样会哑。
  `schedule.at` 必须配 `allowWhileIdle: true`（→ `setExactAndAllowWhileIdle`，
  **会唤醒睡着的手机**）。点"跳过"和结束训练时必须**成套取消**，
  否则会出现"已经进下一组了，通知还在响"。
- ★★ **同一场休息只准响一次：系统响了，应用内就不再补响**（2026-09-30 修）。
  现象：切到微信、系统通知响了，切回 App 又"叮三声 + 震两下"。
  原因：应用内那声铃（`RestTimer` 的 `beep() + vibrate()`）只看"倒计时归零"，
  不知道系统已经在后台替它响过。
  现在 `restnotify.ts` 记两笔账，`RestTimer` 响之前先问一句
  `claimRestAlertOnce(endsAt)`（返回 false 就别响）：
  · `notifiedEndsAt` = 跟系统预约成功的那个结束时刻（`scheduleRest` 里记）
  · `alertedEndsAt` = 应用内已经响过的那个结束时刻（"只准响一次"写死在函数里）
  ★★ **`cancelRest()` 里那行"作废"不能删**：撤掉的是**还没到点**的通知时，
    把 `notifiedEndsAt` 清掉 —— 它根本没响过。少了这行，
    "切出去瞄一眼、没到点又切回来"会**两头都不响**（系统那条刚被撤掉，
    应用内又被 claim 拦住），一声都没有。这是最日常的用法。
  ★ 判据**不能**用 `lastRestNotifyId`：回前台必然走一次 `cancelRest()`，
    它一进门就把那个号清空了（这正是这次没用它的原因）。
  ★ 冷启动**不用管**：App 被杀掉再打开时，训练页会把已经过期的休息整个丢掉
    （`TrainScreen` 里 `restEndsAt` 初值那句 `saved > Date.now()`），
    连倒计时都不显示，也就不会补响。
  ★ 同理，**"切到别的 tab、休息在那边结束、再切回来"本来就不响** ——
    那是上面那句初值判断拦掉的，**不是漏了**，别在那里加"补响"。
  ★ 这条在电脑上能复现：那套"假手机"（预置 `CapacitorCustomPlatform` +
    顶掉 `AudioContext` 数叮了几声 + 手动喂 `appStateChange`）改之前跑，
    场景一当场就是"叮 3 声、震 2 次"。
- **权限**：通知权限在**第一次开始休息时**才申请（安卓上拒绝过之后系统
  就不再弹框了，第一次机会很宝贵）。精确闹钟用 `SCHEDULE_EXACT_ALARM`，
  **故意不用 USE_EXACT_ALARM** —— 那条自动授予、用户撤不掉，用着更舒服，
  但 Google Play 只允许"核心功能就是闹钟/计时器"的 App 用它，上架要过审 + 填声明。
  ⚠️ 安卓 14 起这个权限**默认是拒绝**的，所以引导流程是主路径、不是兜底。
  ⚠️ 撤销它时安卓会**重启 App 并清空所有已预约的精确闹钟**，
  所以每次回到前台都要重查一遍、需要时重新预约。
  没给也不用手写降级 —— 插件自己会退回不精确闹钟（`setExactIfPossible`）。
  ⚠️⚠️ **但这个"退回"是【悄悄的】**：插件只在 logcat 里打一句 warn，
  JS 那边 `schedule()` 照常 resolve，我们这边的 catch 碰不到
  （`LocalNotificationManager.kt:357-372`）。它换用的是 `setAndAllowWhileIdle` ——
  **不精确的闹钟系统可以推迟几分钟甚至几十分钟**，表现就是"通知压根没来"，
  而 App 里一切正常、毫无提示。真机排查时先看这一条。
  ★ 插件另有个"硬失败"开关：通知上写 `isExactMandatory: true`，
  没授权时整批 `schedule()` 会被 reject（我们就能 catch 到、在界面上说出来）。
  代价是那时**一条提醒都发不出去**。取舍见当时的决定，目前**没用**它。
- ★ 查源码才知道的两件事，别凭印象改：
  · **Capacitor 切后台不冻结 WebView**（`Bridge.onPause()` 只是通知各插件），
    所以 `appStateChange` 里调 `schedule()` 来得及。被冻的是网页自己的定时器 ——
    而倒计时那套本来就只把定时器当"刷新画面"用，判断靠 `endsAt` 时间戳。
  · 插件的 `schedule()` 在没通知权限时**直接 reject**，必须 catch。
- 小图标 `res/drawable/ic_stat_rest.xml` 是自己画的纯白秒表（在 capacitor.config.ts 里配）。
  不配的话插件会退回系统的"ⓘ"灰图标，看着像别人的通知。
- ★ **真机行为**（响不响、震不震、弹不弹横幅）只能装 APK 用真手机验 ——
  那是系统的活儿，浏览器里整条链路空转，测不到任何东西。
  **但"我们发给系统的那串参数"可以在电脑上验**，而且这轮就是靠它才抓到
  上面那个 32 位溢出的：抢在 App 的代码加载之前预置
  `window.CapacitorCustomPlatform`（让 `isNativePlatform()` 为 true）
  和 `window.Capacitor.PluginHeaders`（把方法列成原生方法），
  再把自己的 `nativePromise` / `nativeCallback` 换成记录器 ——
  这样 `LocalNotifications.schedule()` 收到的入参会被原样录下来。
  ⚠️ 四个坑（前两个早就踩过，后两个是 2026-09-30 踩的）：
  · `addListener` 只要这个插件**有原生 header 就走原生回调那条路**
    （core 里 `case 'addListener': return pluginHeader ? addListenerNative : addListener`），
    **根本不会去实例化网页版实现**。所以"切后台"得自己回调
    `{ isActive: false }` 来驱动，别指望 `document.visibilitychange`。
  · 假扮成手机之后 `storage.ts` 会改走 Preferences 插件（不是 localStorage），
    所以那个也得一起接住，否则 App 写进去的东西一点都看不到。
  · ⚠️⚠️ **假的 `nativeCallback` 绝不能顺手调一下那个 callback。**
    core 里 `removeListener` 是把回调**也一起传过去**的
    （`removeListener({eventName, callbackId}, callback)`），真机的原生桥
    只把它当"新登记的回调"、永远不会去调它。假手机要是"好心"调一下
    （`cb({})`）= 自己按了返回键 → 训练页那个"确定要退出 App 吗"的
    `window.confirm` 被顶出来 → **整个页面的 JS 全卡死**，
    表现是 CDP 求值全部超时、`Debugger.pause` 也抓不到栈（弹窗不算 JS 在跑）。
    排查这类"页面卡死"的第一件事：监听 `Page.javascriptDialogOpening`。
  · **隔着 CDP 传 Date 会读不出内容**：`Runtime.evaluate` 把返回值序列化一遍，
    `schedule.at` 这种 Date 到了 Node 这边就成了空壳，`new Date(它)` = NaN。
    → 换算在页面里做（`at instanceof Date ? at.getTime() : ...`），只传数字回来。
  · **存档是"内存快照"，直接往 localStorage 写格子骗不过它**（见 storage.ts 顶部）。
    种数据只有两条路：调用 `storage.ts` 的写函数（源码版才行），
    或者写格子**之后再重新打开一次**。★ 但重新打开会把模块级变量清零，
    所以顺序必须是"先种数据、重新打开，再制造前后台事件" ——
    反过来的话，那两笔账被清干净了，测试等于什么都没验。

## 安卓打包（2026-09-23 加的）

Capacitor 套壳。**网页版和安卓端共用同一份 src/ 代码**，靠 `Capacitor.isNativePlatform()` 分流。
铁律"纯前端"依然成立 —— 壳里跑的还是一个纯前端网页，没有任何后端。

- appId `com.nanometer7.nanofit.app`（主人拍板，上架后一辈子不能改）
- appName `NanoFIT`，webDir `dist`
- 5 个插件：preferences、haptics、app、status-bar、keep-awake（社区版）。
  都只在原生端生效
- 存储：网页端仍是 localStorage、安卓端走 preferences。
  **内存快照**的设计和理由见 src/lib/storage.ts 顶部那段（改存储前必须读）
- 桌面图标链路：public/favicon.svg → gen-android-icons.mjs → assets/ → @capacitor/assets
- 物理返回键：src/lib/backbutton.ts 的返回栈

改完代码同步到安卓：`npm run build && npx cap sync android`
打包 APK：`cd android && ./gradlew assembleDebug`
详见 README 的「安卓 App」一节。

### 版本号（2026-09-24 定的）

**每次打包前**改 `android/app/build.gradle` 这两行：

```groovy
versionCode 20260924                  // = 打包那天的日期 YYYYMMDD
versionName "2026.09.24 · 18d4d1a"    // = 日期 · 7 位存档号
```

- `versionCode` 是安卓用来比大小的，**只能往大改**；改小了会
  `INSTALL_FAILED_VERSION_DOWNGRADE`（屏幕上只显示"应用未安装"，不说明原因）
- `versionName` 是给人看的。里面那串存档号 = 这份 APK 里代码对应的 git 存档
- ★ **存档号有个先后顺序的讲究**：先把代码提交掉、拿到哈希，再把它写进
  build.gradle 提交。所以 APK 里的代码 = 那个哈希对应的存档（外加一行版本号）
- 设置页底部显示版本号（`src/components/VersionLine.tsx`），走
  `App.getInfo()` 读**手机里那个包**的 versionName，不是写死的字符串。
  浏览器里不调这个接口（AppWeb 里它是 `throw unimplemented`），显示"网页预览"
- 同一天打第二个包号不变没关系，安卓允许同号覆盖
- ★ 中文/特殊字符会不会被 Gradle 弄坏（Windows 上默认编码可能是 GBK）——
  打完后用 `aapt2 dump badging` 验一遍

### 打完包之后要做的四件事（2026-10-09 定的）

包的存放位置（**仓库外面**，不进 git）：
`E:\Vibe Coding\Nanofit\安卓安装包\` ——
`NanoFIT.apk` 永远是最新版那一格，`历史版本\` 里是带版本号的老包。

顺序不能乱，尤其第 1 步必须在编译**之前**：

1. **先归档旧包**（在编译新包之前做，否则新包会把老的盖掉）：
   ```bash
   cd "E:/Vibe Coding/Nanofit/安卓安装包"
   cp -p NanoFIT.apk "历史版本/NanoFIT-<旧版本名>.apk"
   ```
   `cp -p` 的 `-p` 是"保留原来的修改时间"——归档件的时间戳应该是它
   被造出来的那天，不是被复制的那天。
   复制完**立刻对一遍校验和**（`sha256sum` 两边都要跑）：
   备份最怕的就是默默复制坏掉，而对校验和是唯一能发现它的办法。

2. **编译**：`npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`
   （网页代码改完**必须先 build 再 sync**，否则打进包里的是旧网页资源）

3. **验三样**（三样都过了才能往手机上装）：
   - `aapt2 dump badging` 看 versionCode / versionName —— 顺带验中文有没有被 Gradle 弄坏
   - `apksigner verify --print-certs` 看签名 —— **必须和上一个包的 SHA-256 逐位相同**。
     不同就意味着手机上装不上（只能先卸载，而卸载 = 训练数据全没）
   - 把 APK 当压缩包解开，确认 `assets/public/assets/index-*.css` 里
     有这次改动的痕迹、没有上一版删掉的东西（新代码真的打进去了）

4. **装进最新版那一格**，再对一遍校验和：
   ```bash
   cp android/app/build/outputs/apk/debug/app-debug.apk "../../../安卓安装包/NanoFIT.apk"
   ```
   注意**不能用 `cp -p`**：最新版那一格的时间戳应该是"这次打包的时间"，
   保留旧时间戳会让人以为没更新。

★ 用的是 **assembleDebug 不是 assembleRelease**，别改。
debug 包的签名来自这台电脑的 `~/.android/debug.keystore`（自动生成、不随仓库走）；
换成 release 会生成一把全新的钥匙，签名一变手机上就只能先卸载 —— 数据全丢。

### 打包环境（2026-09-23 装好并验证过）

- **Android Studio**：`C:\Program Files\Android\Android Studio`（自带 JBR **25**）
- **安卓 SDK**：`C:\Users\Administrator\AppData\Local\Android\Sdk`
  （platforms 有 android-36 / android-37.0，build-tools 35.0.0 / 36.0.0）
- **★ 但打包不用它自带的 Java 25**：Gradle 8.14.3 只认到 Java 24，
  用 25 会报 `Unsupported class file major version 69`。
  所以另装了 **Microsoft OpenJDK 21**（`C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot`），
  并在**用户级**配置 `C:\Users\Administrator\.gradle\gradle.properties` 里写
  `org.gradle.java.home=...` 指向它。那个文件不属于仓库。
- **项目路径含中文**（`Nanofit工程`）会让安卓构建工具直接拒绝干活，
  已在 `android/gradle.properties` 加 `android.overridePathCheck=true` 跳过。
  ★ 以后打包报奇怪的错，第一个怀疑这里。
- `android/local.properties` 里是 SDK 路径（已 gitignore，不进仓库）。
- ★★ **签名变了的后果比想象中重**：debug 包的签名来自这台电脑的
  `~/.android/debug.keystore`（自动生成、**不随仓库走**）。
  签名一变，新版就装不上（`INSTALL_FAILED_UPDATE_INCOMPATIBLE`，
  手机上只显示"应用未安装"），只能先卸载 —— **而卸载 = 手机上的训练数据全没**，
  因为数据只在那台手机里。
  → **换电脑打包之前，先让主人导一份备份**，再动手。
  → 打包后验签名的两句命令见 README「怎么打包 APK」那节。
- Gradle 第一次下载会超时（重定向到 GitHub），要挂代理：
  `GRADLE_OPTS="-Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897"`。只影响第一次。

### 这些坑别再踩（都是踩过的）

- ★ **切 tab 会卸载整个页面**（App.tsx 是 `{tab === 'train' && <TrainScreen />}`），
  页面内存里的 state 全没。所以"跨 tab 要留着的东西"必须存进 localStorage。
  休息倒计时就是这么修的（WorkoutSession.restEndsAt）。
  ★ 同一个坑还在等着：**训练页的任何临时状态**（选中的动作、展开的卡片…）
  都不会跨 tab 保留 —— 加新功能时先想一句"切走再回来，这个该不该还在"
- App.tsx 里返回键的监听**必须只挂一次**，当前 tab 用 ref 读。
  改成依赖 [tab] 会让 App 的处理器爬到设置页上面，子页面按返回会跳过设置列表
- 原生壳里**不要**注册 Service Worker（否则"重装了 App 界面还是老的"），
  但网页版的注册一个字都不能动
- 安卓自适应图标的前景层，安全区是个**圆**，判断标准是"离中心最远的笔画 ≤ 50%"，
  不是"图形有多宽"。推导在 gen-android-icons.mjs 里
- `@capacitor/status-bar` 的 Style 枚举名字指的是**背景**不是字：
  夜间模式（深底）传 `Style.Dark`、日间模式（白底）传 `Style.Light`。传反了状态栏看不见
- ★★ **安卓 WebView 不会下载文件**（2026-09-24 查出来的真 bug，藏了很久）：
  网页那套"造个临时文件 + 点一下隐藏链接"的导出写法，在安卓壳里是**静默失效**的
  —— 不报错、不弹提示、JS 那边收不到任何信号，而界面上照样跳出"已导出"。
  安卓要 App 自己接一根 `DownloadListener` 才写得了文件，而 **Capacitor 没接**
  （它的安卓源码里 `DownloadListener` / `onDownloadStart` / `DownloadManager`
  一个都搜不到；官方仓库有开着的问题 #5478）。
  ★ 最能说明问题的旁证：**导入是通的、导出不通** —— Capacitor 实现了"选文件"
    那个对话框（`BridgeWebChromeClient` 的 onShowFileChooser），却没实现"存文件"。
    所以这个 App 一直能**读**备份，却永远**写不出**备份。
  正确做法在 `src/lib/savefile.ts`：手机端写进 App 缓存目录（`Directory.Cache`，
  正好在 FileProvider 允许分享的名单里）再调起系统分享面板，用户自己选存哪；
  网页端还是老路子，一个字没改。
  ★ 用户取消分享时插件是**抛错**的（`"Share canceled"`），不是正常返回 ——
    不把这种情况挑出来，用户自己关掉面板会看到"导出失败"。
  ★ Filesystem 写文件必须**显式写 `Encoding.UTF8`**：备份 JSON 里有中文动作名，
    编码搞错会导出个乱码文件，而且当场看不出来，等真要恢复时才发现。
  ★ 以后凡是"让浏览器干点什么"的写法（下载文件、`window.open`、`target="_blank"`），
    都要先问一句：**WebView 里有人管这件事吗？** 没人管的话是静默失效。
