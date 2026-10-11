// 升級音效, created by code, no need to download

;(() => {
  const MUTE_KEY = 'gear-fx-muted'
  const storage = {
    get: (key) => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(key, value)
      } catch {}
    },
  }

  const isMuted = () => storage.get(MUTE_KEY) === '1'
  const setMuted = (muted) => storage.set(MUTE_KEY, muted ? '1' : '0')

  let ctx = null
  const unlock = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return
    ctx = ctx || new AudioContextClass()
    if (ctx.state === 'suspended') ctx.resume()
  }

  const tone = (freq, start, duration, type = 'triangle', volume = 0.18) => {
    const t = ctx.currentTime + start
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)

    // 音量快速淡入、再指數淡出，聽起來才不會有「啪」的爆音
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + duration + 0.02)
  }

  const SOUNDS = {
    // 成功：四個音往上（Do Mi Sol 高音 Do）
    success: () =>
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, i * 0.07, 0.18),
      ),
    // 失敗：兩個低音往下
    fail: () => {
      tone(311.13, 0, 0.16, 'square', 0.07)
      tone(233.08, 0.14, 0.28, 'square', 0.07)
    },
    rejected: () => tone(196, 0, 0.15, 'sine', 0.12),
    reset: () =>
      [784, 659.25, 523.25].forEach((f, i) =>
        tone(f, i * 0.05, 0.12, 'sine', 0.1),
      ),
  }

  const playSound = (name) => {
    if (isMuted() || !ctx || !SOUNDS[name]) return
    try {
      SOUNDS[name]()
    } catch {}
  }

  const GEAR_SELECTOR = {
    helmet_lv: '.helmet',
    armor_lv: '.armor',
    weapon_lv: '.weapon',
  }

  // 加上動畫 class；動畫結束後移除，下次才能再播一次
  const animate = (el, className) => {
    if (!el) return
    el.classList.remove(className)
    void el.offsetWidth // 強制瀏覽器重新計算，讓同一個 class 能重新觸發動畫
    el.classList.add(className)
    el.addEventListener('animationend', () => el.classList.remove(className), {
      once: true,
    })
  }

  // 在裝備圖片中間往上飄的文字（+1 Lv!／FAIL）
  const floatText = (gearEl, text, className) => {
    const img = gearEl?.querySelector('img')
    if (!img) return
    const label = document.createElement('span')
    label.className = `fx-float ${className}`
    label.textContent = text
    label.style.left = `${img.offsetWidth / 2}px`
    label.style.top = `${img.offsetHeight / 3}px`
    gearEl.appendChild(label)
    label.addEventListener('animationend', () => label.remove(), { once: true })
    // prefers-reduced-motion 時沒有動畫，animationend 不會觸發：保險起見一秒後移除
    setTimeout(() => label.remove(), 1500)
  }

  // 播放一次升級結果的特效；回傳建議等幾毫秒再重新整理（讓動畫播完）
  const play = ({ result, slot }, button) => {
    const gearEl = document.querySelector(GEAR_SELECTOR[slot])
    const img = gearEl?.querySelector('img')
    if (result === 'success') {
      animate(img, 'fx-success')
      animate(button, 'fx-btn-success')
      floatText(gearEl, '+1 Lv!', 'fx-float-success')
    } else if (result === 'fail') {
      animate(img, 'fx-fail')
      animate(button, 'fx-btn-fail')
      floatText(gearEl, 'FAIL', 'fx-float-fail')
    } else if (result === 'rejected') {
      animate(button, 'fx-btn-fail')
    }
    playSound(result)
    return result === 'success' || result === 'fail' ? 1000 : 500
  }

  window.GearFx = { unlock, play, playSound, isMuted, setMuted }
})()
