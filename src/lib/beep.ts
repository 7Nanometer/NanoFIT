import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

// ============================================================
// 休息结束时"叮"一声 + 震一下
// ============================================================
//
// 【为什么不用一个 mp3 文件】
// 用代码直接"合成"声音（Web Audio），不需要额外下载任何音频文件，
// 也就不用担心文件丢失、路径写错、加载慢这些问题。
//
// 【浏览器有个硬规矩：不在用户手指点击的那一瞬间，就不许出声】
// 这是为了防止网页一打开就自动放广告声音。
// 所以流程是：
//   1. 用户点 ✓ 记一组时 —— 那正好是一次点击 —— 顺手把音响"解锁"
//   2. 90 秒后要响的时候，音响已经解锁过了，就能正常响
//
// 【震动分两条路（2026-09-23 改的）】
//   网页版：用浏览器的 navigator.vibrate。
//           iPhone 从来不支持网页震动（苹果不给，不是代码写错），
//           所以写的是"能震就震，不能震就算了"。
//   安卓版：用 Capacitor 的原生震动插件 —— 这是真·原生震动，
//           不受"必须用户点击才能震"那条网页规矩限制，力度也能调。
//           健身房里手机可能在包里、环境也吵，震动比声音更容易注意到。
// ============================================================

// 现在是不是跑在安卓的原生壳里（在浏览器里打开时是 false）
const isNative = Capacitor.isNativePlatform()

// 全局只保留一个"音响"。第一次用到时才创建。
let audioContext: AudioContext | null = null

function getContext(): AudioContext | null {
  try {
    if (audioContext === null) {
      audioContext = new AudioContext()
    }
    return audioContext
  } catch {
    // 极老的浏览器可能没有这个功能，那就静默放弃（最多是没声音，不影响计时）
    return null
  }
}

// 在用户点击的那一刻调用，把音响"解锁"。
export function unlockAudio(): void {
  const ctx = getContext()
  if (ctx === null) return

  try {
    // 切到后台再回来时，音响可能被系统挂起，这里把它唤醒
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }

    // 【这一步是解锁 iPhone 的关键】
    // 光唤醒还不够，得真的"播一次"才算解锁。
    // 这里播一个音量为 0、时长 0.01 秒的音 —— 你听不见，但浏览器认账。
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    gain.gain.value = 0
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.01)
  } catch {
    // 解锁失败不影响主流程
  }
}

// 真正发声的部分。假定音响此刻已经准备好（没被挂起）。
function playBeeps(ctx: AudioContext): void {
  try {
    for (let i = 0; i < 3; i++) {
      // 每声之间隔 0.25 秒
      const startAt = ctx.currentTime + i * 0.25
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine' // 正弦波，听起来是"嘀"的纯净音
      osc.frequency.value = 880 // 880 赫兹，清脆不刺耳

      // 音量不能一上来就是最大，否则会有"啪"的爆音。
      // 所以让它用极短的时间淡入、再淡出。
      gain.gain.setValueAtTime(0, startAt)
      gain.gain.linearRampToValueAtTime(0.3, startAt + 0.01)
      gain.gain.linearRampToValueAtTime(0, startAt + 0.15)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(startAt)
      osc.stop(startAt + 0.16)
    }
  } catch {
    // 没声音也不影响计时器本身
  }
}

// 响三声"叮"
export function beep(): void {
  const ctx = getContext()
  if (ctx === null) return

  // ==========================================================
  // 【这里是"从后台切回来不响"这个 bug 的根源，改的时候别改回去】
  //
  // 你切到别的 App 时，系统会把音响（AudioContext）**挂起**省电。
  // 切回来时要先"唤醒"它，而唤醒（resume）是一个**异步**操作 ——
  // 它要过一会儿才真的醒过来。
  //
  // 原来的写法是：叫一声"快醒醒"，然后**不等它回答**就直接放声音。
  // 结果声音是在它还没醒的时候放出去的，被系统丢掉了 —— 你就什么也没听到。
  //
  // 正确的写法：等它答应（resume 成功后）再放。
  // 另外还留了一手保底：万一它磨蹭超过 250 毫秒还不答应，
  // 也硬着头皮放一次（总比完全没声音强）。
  // ==========================================================
  if (ctx.state === 'suspended') {
    let alreadyPlayed = false
    const play = () => {
      if (alreadyPlayed) return // 防止上面两条路都走通、放两遍
      alreadyPlayed = true
      playBeeps(ctx)
    }

    void ctx.resume().then(play).catch(play) // 正常情况：等它醒了再放
    setTimeout(play, 250) // 保底：它要是卡住了，也别死等
    return
  }

  // 音响本来就是醒着的，直接放
  playBeeps(ctx)
}

// 震一下
export function vibrate(): void {
  if (isNative) {
    vibrateNative()
    return
  }

  try {
    // 先检查这个功能存不存在。iPhone 上没有，直接调用会报错。
    if (typeof navigator.vibrate === 'function') {
      // 注意：有些浏览器在"不是用户手指点击"的场合会拒绝震动请求
      // （直接返回 false，不报错也不震）。这个绕不过去，只能尽力而为。
      // 所以声音才是主要提醒手段，震动算锦上添花。
      navigator.vibrate([200, 100, 200])
    }
  } catch {
    // 某些环境下调用它会直接抛错，这里兜住，别让它连累后面的代码
  }
}

// 安卓端的原生震动
function vibrateNative(): void {
  // 【为什么震两下、每下还比较长】
  // 健身房里手机常常在包里，环境也吵，单次短震很容易被忽略。
  // 两下各 400 毫秒、中间隔 250 毫秒，是一个很好认的节奏 ——
  // 和微信来消息那种"嗡"一下就完的震动能区分开。
  //
  // 失败也无所谓（有的手机被设成静音就完全不震），所以直接吞掉错误，
  // 绝不能让震动的问题连累到"休息结束"这件正事。
  void Haptics.vibrate({ duration: 400 }).catch(() => {})
  setTimeout(() => {
    void Haptics.vibrate({ duration: 400 }).catch(() => {})
  }, 650)
}

// ============================================================
// 轻轻"嗒"一下 —— 只给"记完一组"这种操作反馈用
// ============================================================
//
// 【为什么不直接用上面那个 vibrate()】
// vibrate() 是给"休息结束"用的：两下各 400 毫秒，是**叫你回来**的信号，
// 必须够重、够难忽略。
// 但"记一组"是每几十秒就要发生一次的动作 —— 用那个力度会烦死人，
// 而且真机上手感会明显变拖沓。
//
// 【安卓和浏览器为什么分开写】
// 安卓原生壳能调 Haptics 插件的 impact 档位（Light = 最轻的一档），
// 输出的是很短很脆的一下，正是"咔哒"该有的样子。
// 浏览器只有 navigator.vibrate 这个粗糙接口，只能传毫秒数 ——
// 给 10 毫秒，短到几乎只是"顿一下"，不会烦人。
// iPhone 的浏览器两者都没有，所以整段都吞掉错误：没震动也照样能记账。
export function tapFeedback(): void {
  if (isNative) {
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {
      // 有的手机被设成静音就完全不震，这不是错误，忽略
    })
    return
  }

  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(10)
    }
  } catch {
    // 某些环境下调用它会直接抛错，这里兜住，别让它连累"记下这一组"这件正事
  }
}
