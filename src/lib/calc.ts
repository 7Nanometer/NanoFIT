import type { SetEntry, Sex } from '../types'

// ============================================================
// 计算公式（公式来自 CLAUDE.md，是定好的）
// ============================================================

// 容量 = 重量 × 次数
//
// 【容量是什么】
// 衡量"这一组总共搬动了多少重量"的指标。
// 例：80 公斤做了 8 次 = 640 公斤的容量。
// 它是比"重量"更能反映训练总量的数字：
// 你今天用 100 公斤做 1 次，和用 50 公斤做 10 次，容量完全不同。
export function setVolume(set: SetEntry): number {
  return set.weightKg * set.reps
}

// 算出某次训练的总容量（把每一组的容量全加起来）
//
// reduce 的解释：它像一个"滚雪球"的动作。
// sum 是滚到现在的雪球，s 是下一个要滚上去的数据。
// 从 0 开始，每碰到一组就把它的容量加进去。
export function sessionVolume(entries: SetEntry[]): number {
  return entries.reduce((sum, s) => sum + setVolume(s), 0)
}

// 估算 1RM = 重量 × (1 + 次数 / 30)
//
// 1RM 的意思是"你拼尽全力只能举起一次的那个最大重量"。
// 这个公式（叫 Epley 公式）用你实际做的一组来反推它。
// 例：80 公斤做了 8 次 → 80 × (1 + 8/30) ≈ 101.3 公斤。
//
// 【为什么需要它】
// 你平时练 8 次和练 3 次用的重量不一样，这两种成绩没法直接比。
// 统统换算成 1RM 之后，不同次数的进步就能放在同一张图里比较了。
//
// 【提醒】做的次数越多，这个估算就越不准（做 20 次反推出来的数字会明显偏大）。
// 所以它的参考价值主要体现在 12 次以内。
export function estimate1RM(weightKg: number, reps: number): number {
  if (reps <= 0) return weightKg
  return weightKg * (1 + reps / 30)
}

// 把输入框里的文字转成数字。
//
// 【为什么需要这个转换】
// 用户打字过程中，输入框里是文字。三种情况要分清楚：
//   ''     → null，表示"根本没填"
//   '0'    → 0，表示"真的是零负重"（引体向上、平板支撑就是这样）
//   其它   → 对应的数字
//
// 把 null 和 0 混为一谈，会导致引体向上这类动作没法记录。
export function textToNumber(text: string): number | null {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  // 如果转出来不是个有效数字（比如只打了一个"."），也当成没填
  return Number.isNaN(n) ? null : n
}

// ============================================================
// 身体数据：BMI 和体脂率
// ============================================================
//
// 【这两个数的公式（主人 2026-09-23 提供）】
//   BMI = 体重(kg) ÷ 身高(m)²      例：60kg、1.65m → 60 ÷ 1.65² ≈ 22.03
//   男性体脂率 = 1.2 × BMI + 0.23 × 年龄 - 16.2
//   女性体脂率 = 1.2 × BMI + 0.23 × 年龄 -  5.4
//
// 【★必须记住的一句话：这是"估算"，不是"测量"】
// 这个公式（1991 年荷兰人 Deurenberg 提出的）的做法是：
// 找来一大群人，量出他们每个人的**真实体脂**，再配上各自的**身高体重年龄性别**，
// 最后拟合出这么一条式子。所以它回答的是：
//   "身高体重年龄性别是这样的人，平均体脂是多少"
// 而不是"你的体脂是多少"。
//
// 误差通常有 ±4～5 个百分点。最要命的一点是：
// **肌肉多的人会被算高** —— 公式只看得见体重，看不见这重量是肌肉还是肥肉。
// 一个 75kg 的肌肉男和一个 75kg 的胖子，它给的答案几乎一样。
//
// 所以界面上永远写着"估算"两个字，绝不假装它是称出来的。
// ============================================================

// 保留一位小数。21.37684… 显示成 21.4，够用且不啰嗦。
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// BMI = 体重(kg) ÷ 身高(m)²
//
// 【它是什么】身体质量指数，只用身高体重就能算的一个粗略指标。
// 【它的毛病】一样分不出肌肉和肥肉：练得壮的运动员 BMI 常被算成"超重"。
// 所以它只能当参考，所以我们才要继续往下算体脂率。
export function bmi(weightKg: number, heightCm: number): number {
  const meters = heightCm / 100
  return weightKg / (meters * meters)
}

// 由 BMI、年龄、性别估算体脂率（%）
export function estimateBodyFat(
  bmiValue: number,
  age: number,
  sex: Sex,
): number {
  const base = 1.2 * bmiValue + 0.23 * age
  return round1(sex === 'male' ? base - 16.2 : base - 5.4)
}

// 算出"记录的那一天"是几岁。
//
// 【为什么用记录那天，而不是用今天】
// 三个月前记的那一条，应该按三个月前的年龄算才对。
// 而且按记录当天算和按今天算，代码一样简单，没有理由选差的。
//
// 【为什么只精确到年份，不问生日】
// 这里就是两个年份相减。因为公式本身的误差（±4～5 个百分点）
// 远远大于"差一岁"的影响，为了它多问一个生日不值得。
export function ageOn(birthYear: number, date: string): number {
  // date 是 '2026-09-23' 这种格式，前 4 个字符就是年份
  return Number(date.slice(0, 4)) - birthYear
}

// 合理的输入范围。超出这个范围，八成是打错了 ——
// 最常见的就是把身高输成了 1.75（米），那样 BMI 会算出二十多万。
const HEIGHT_CM_RANGE = [100, 250] as const
const WEIGHT_KG_RANGE = [20, 300] as const
const AGE_RANGE = [14, 100] as const

export type BodyComposition = {
  bmi: number // 保留一位小数
  bodyFat: number // 保留一位小数，单位是 %
}

// 把四样东西凑齐 → 算出 BMI 和估算体脂率。
// 缺任何一样、或者数字明显不对，就返回 null，界面上安静地什么都不显示。
//
// 【为什么返回 null，而不是报错、也不是给个 0】
// "算不出来"是这个函数的一种正常结果，不是出了故障。
// 如果返回 0，界面上会出现一个 0% 的假数字，那比不显示更糟。
export function bodyComposition(
  weightKg: number | undefined,
  heightCm: number | undefined,
  birthYear: number | undefined,
  sex: Sex | undefined,
  date: string,
): BodyComposition | null {
  if (weightKg === undefined || heightCm === undefined) return null
  if (birthYear === undefined || sex === undefined) return null
  if (heightCm < HEIGHT_CM_RANGE[0] || heightCm > HEIGHT_CM_RANGE[1]) return null
  if (weightKg < WEIGHT_KG_RANGE[0] || weightKg > WEIGHT_KG_RANGE[1]) return null

  const age = ageOn(birthYear, date)
  if (age < AGE_RANGE[0] || age > AGE_RANGE[1]) return null

  const bmiValue = bmi(weightKg, heightCm)
  const fat = estimateBodyFat(bmiValue, age, sex)
  // 上面的范围已经挡掉了负数，这里是最后一道保险：
  // 宁可"不算"，也不显示一个负的体脂率
  if (fat <= 0) return null

  return { bmi: round1(bmiValue), bodyFat: fat }
}

// ============================================================
// 有氧：田径场距离、配速、以及时间/距离的显示格式
// ============================================================

// ---------- 田径场 ----------
//
// 【为什么每条道不一样长】
// 田径场里所有道的终点线是同一条，但外道的弯道半径更大 ——
// 沿着外道跑一整圈，实际跑过的距离就更长。
// 标准场地的道宽是 1.22 米，换算到一圈上大约多 7 米。
//
// 所以：第 1 道 400 米、第 2 道 407 米、第 3 道 414 米……
//
// 【为什么基准长度要能改】
// 不是所有学校的操场都是标准 400 米，300 米、350 米的都有。
// 所以第 1 道的长度做成可填的（默认 400）。
// 每道 +7 米暂时写死 —— 真碰上道宽不一样的场地，改这一个常量就行。
const TRACK_LANE_STEP_M = 7

// 第 N 道跑一整圈是多少米
export function trackLapMeters(lane: number, baseLapM = 400): number {
  return baseLapM + (lane - 1) * TRACK_LANE_STEP_M
}

// 第 N 道跑 laps 圈一共多少米。圈数允许是小数（12.5 圈 = 五公里出头）
export function trackDistanceM(lane: number, laps: number, baseLapM = 400): number {
  return trackLapMeters(lane, baseLapM) * laps
}

// ---------- 配速 ----------
//
// 配速 = 跑一公里用了多少秒。跑者之间聊"快慢"用的就是这个，
// 比"总共跑了多久"有用得多 —— 跑了 30 分钟可能是 3 公里也可能是 6 公里。
//
// 【为什么算不出来时返回 null 而不是 0】
// 和体脂率那边一个道理：没填距离的时候，0 是个**假数字**，
// 显示出来会让人以为你跑了一公里用了 0 秒。
// null 表示"这项数据没有"，界面上直接不显示配速那一栏。
export function paceSecPerKm(
  durationSec: number,
  distanceM: number,
): number | null {
  if (distanceM <= 0 || durationSec <= 0) return null
  return durationSec / (distanceM / 1000)
}

// 360 → "6'00\""（6 分 00 秒每公里）
export function formatPace(secPerKm: number): string {
  const total = Math.round(secPerKm)
  const min = Math.floor(total / 60)
  const sec = total % 60
  // padStart(2, '0')：只有 5 秒时补成 "05"，不然会显示成 6'5"
  return `${min}'${String(sec).padStart(2, '0')}"`
}

// 把用户打的配速文字转成"每公里多少秒"。读不懂就返回 null。
//
// 【为什么要单独写一个，不用 NumberField】
// 跑者脑子里的配速是"5 分 30 秒"，打出来就是 `5:30`。
// 而 NumberField 的正则只放行数字和一个小数点，**冒号根本打不进去**。
// 所以配速这一栏用的是普通输入框 + 这个解析函数。
//
// 【两种写法都收】
//   '5:30' → 330 秒   （5 分 30 秒，跑者的习惯写法）
//   '5.5'  → 330 秒   （同样意思的小数写法，用计算器的人会这么打）
//   '5'    → 300 秒   （5 分整）
//   '5:3'  → 303 秒   （秒那一位按字面理解，就是 3 秒，不是 30 秒）
export function parsePaceText(text: string): number | null {
  const t = text.trim()
  // 只打了冒号或小数点、或者什么都没打，都算"还没填完"
  if (t === '' || t === ':' || t === '.') return null

  if (t.includes(':')) {
    const [minPart, secPart] = t.split(':')
    const min = minPart === '' ? 0 : Number(minPart)
    const sec = secPart === undefined || secPart === '' ? 0 : Number(secPart)
    if (Number.isNaN(min) || Number.isNaN(sec)) return null
    const total = min * 60 + sec
    return total > 0 ? total : null
  }

  const minutes = Number(t)
  if (Number.isNaN(minutes) || minutes <= 0) return null
  return Math.round(minutes * 60)
}

// 只放行配速输入框能接受的字符：数字、一个小数点、一个冒号。
// 和 NumberField 那边是同一个思路，只是多让一个冒号过去。
export function isPaceTextAllowed(text: string): boolean {
  return /^\d*[:.]?\d*$/.test(text)
}

// 秒 → 人话。1800 → "30 分钟"，3900 → "1 小时 5 分"
export function formatDuration(sec: number): string {
  const totalMin = Math.round(sec / 60)
  if (totalMin < 60) return `${totalMin} 分钟`
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  if (minutes === 0) return `${hours} 小时`
  return `${hours} 小时 ${minutes} 分`
}

// 秒 → 秒表样子。1800 → "30:00"，4835 → "1:20:35"
//
// 【它和上面 formatDuration 的分工】
// formatDuration 写的是"人话"（"30 分钟"），用在句子中间最自然 ——
// 比如历史记录的摘要、有氧的说明，那里是"读到"的。
//
// 这个 formatClock 写的是"秒表"，用在【正在跳动的读数】上 ——
// 训练页顶部"已练"那一格。理由有两个：
//   1. 它在跳。中文写法的字数是会变的（"9 分钟" → "10 分钟" 宽度不同），
//      旁边又写着"已练"两个字，等于"已练"重复了两遍，很啰嗦。
//   2. 秒表是每秒都在动的，配 .t-num（等宽数字）才不会左右抖；
//      而中文的"分钟"两个字塞在数字中间，等宽就白做了。
export function formatClock(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  // 补零：1 分 5 秒要写成 "1:05" 而不是 "1:5"，否则那一格宽度会跳
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  // 不到一小时就不显示小时位，省一格宽度
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`
}

// 米 → 人话。不到一公里时说米，更好读
// （操场上一圈半说"600 米"比说"0.60 公里"自然）
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} 米`
  return `${(m / 1000).toFixed(2)} 公里`
}

// 把一条有氧记录描述成一句话，训练页和历史页共用。
//
// 例：跑了 30 分钟、5.00 公里 → "30 分钟 · 5.00 公里 · 配速 6'00"/公里"
//
// 【为什么抽成公用函数】
// 训练页的卡片和历史页的明细都显示这个 —— 两处各写一遍的话，
// 哪天想改格式（比如配速改成"每公里 6 分"）就得记得改两个地方，
// 漏一个就会出现"同一件事在两个页面上长得不一样"。
export function describeCardio(set: SetEntry): string {
  const parts: string[] = []
  if (set.durationSec !== undefined) parts.push(formatDuration(set.durationSec))
  if (set.distanceM !== undefined) parts.push(formatDistance(set.distanceM))

  // 只有时长和距离都有才算得出配速
  const pace =
    set.durationSec !== undefined && set.distanceM !== undefined
      ? paceSecPerKm(set.durationSec, set.distanceM)
      : null
  if (pace !== null) parts.push(`配速 ${formatPace(pace)}/公里`)

  // 理论上不会走到这儿（时长是必填的），但万一数据坏了，
  // 显示一句"没有数据"也比显示一个空白格子让人以为界面坏了强
  return parts.length > 0 ? parts.join(' · ') : '（没有数据）'
}
