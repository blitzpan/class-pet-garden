// 移动端成长卡导出诊断（临时工具，定位完成后整体删除即可）
//
// 用法：分享链接加 ?diag=1 打开（会记到 localStorage，之后直接打开也带诊断）
//      访问 ?diag=0 关闭
// 面板会吐出：运行环境 + 真实异常 + 各倍率画布的 getContext/绘制/toBlob/toDataURL 结果
// 由于无法在手机上远程调试，这些信息靠截图或「复制」取回。

const JPEG = 'image/jpeg'
const QUALITY = 0.92

export function errText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}${e.stack ? `\n${e.stack}` : ''}`
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

function release(c: HTMLCanvasElement) {
  c.width = 0
  c.height = 0
}

/** 单独测一次 toBlob：区分「没有这个 API」「回调拿 null」「超时不回调」「抛异常」 */
function blobOnce(c: HTMLCanvasElement, ms: number): Promise<string> {
  return new Promise((resolve) => {
    if (typeof c.toBlob !== 'function') return resolve('toBlob 不是函数')
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      resolve(`回调未触发(超时 ${ms}ms)`)
    }, ms)
    try {
      c.toBlob(
        (b) => {
          if (done) return
          done = true
          clearTimeout(timer)
          resolve(b ? `ok size=${b.size} type=${b.type}` : 'null')
        },
        JPEG,
        QUALITY,
      )
    } catch (e) {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(`throw ${errText(e)}`)
    }
  })
}

function sampleDraw(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#FDF8F3')
  g.addColorStop(1, '#FBEBDC')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#3A2F28'
  ctx.font = '700 96px sans-serif'
  ctx.fillText('123', 10, 200)
  ctx.beginPath()
  ctx.ellipse(w / 2, h / 2, 40, 30, 0, 0, Math.PI * 2)
  ctx.fill()
}

const SIZES = [
  { label: 'S=1  ', w: 750, h: 1160 },
  { label: 'S=1.5', w: 1125, h: 1740 },
  { label: 'S=2  ', w: 1500, h: 2320 },
]

async function probeOne(size: { label: string; w: number; h: number }, attach: boolean): Promise<string> {
  const tag = `${size.label} ${size.w}x${size.h}${attach ? ' [挂到DOM]' : ''}`
  const c = document.createElement('canvas')
  c.width = size.w
  c.height = size.h
  if (attach) c.setAttribute('style', 'position:fixed;left:-99999px;top:0')

  const ctx = c.getContext('2d')
  if (!ctx) {
    release(c)
    return `${tag}: getContext('2d')=null ← 画布超限/内存不足`
  }

  if (attach) document.body.appendChild(c)
  let drawMsg = 'draw=ok'
  try {
    sampleDraw(ctx, size.w, size.h)
  } catch (e) {
    drawMsg = `draw=throw ${errText(e)}`
  }

  const blob = await blobOnce(c, 8000)
  let dataUrl: string
  try {
    const t0 = Date.now()
    dataUrl = `toDataURL=${c.toDataURL(JPEG, QUALITY).length}字符/${Date.now() - t0}ms`
  } catch (e) {
    dataUrl = `toDataURL=throw ${errText(e)}`
  }

  if (attach) c.remove()
  release(c)
  return `${tag}: ctx=ok ${drawMsg} toBlob=${blob} ${dataUrl}`
}

/** 逐级试探：实际卡片尺寸（S=2）、降倍率（S=1.5 / S=1）、以及挂到 DOM 的 S=2 */
export async function probeCanvas(): Promise<string[]> {
  const out: string[] = []
  for (const s of SIZES) out.push(await probeOne(s, false))
  out.push(await probeOne(SIZES[2], true))
  return out
}

/** 宠物图：能否加载 + 画上去之后画布是否被污染（污染会导致导出被拒绝） */
export function probeImage(url: string): Promise<string> {
  return new Promise((resolve) => {
    if (!url) return resolve('pet: 无宠物图（走爪印兜底）')
    const img = new Image()
    let done = false
    let timer: ReturnType<typeof setTimeout>
    const finish = (msg: string) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(msg)
    }
    timer = setTimeout(() => finish(`pet: 加载超时(8s) ${url}`), 8000)

    img.onerror = () => finish(`pet: onerror 加载失败 ${url}`)
    img.onload = () => {
      const size = `${img.naturalWidth}x${img.naturalHeight}`
      const c = document.createElement('canvas')
      c.width = c.height = 64
      const ctx = c.getContext('2d')
      if (!ctx) return finish(`pet: loaded ${size}，但 64x64 画布也拿不到 ctx`)
      try {
        ctx.drawImage(img, 0, 0, 64, 64)
        c.toDataURL(JPEG)
        finish(`pet: loaded ${size}，画布未被污染`)
      } catch (e) {
        finish(`pet: loaded ${size}，导出被拒绝 ${errText(e)} ← 跨域污染`)
      } finally {
        release(c)
      }
    }
    img.src = url
  })
}

export function envInfo(): string[] {
  const na = navigator as any
  const canvasProto = HTMLCanvasElement.prototype as any
  const ctxProto: any =
    typeof CanvasRenderingContext2D === 'undefined' ? {} : (CanvasRenderingContext2D.prototype as any)
  const perf = performance as any
  return [
    `时间: ${new Date().toISOString()}`,
    `URL: ${window.location.href}`,
    `UA: ${na.userAgent}`,
    `平台: ${na.platform || '-'} / DPR ${window.devicePixelRatio} / 屏幕 ${screen.width}x${screen.height} / 视口 ${window.innerWidth}x${window.innerHeight}`,
    `deviceMemory: ${na.deviceMemory ?? '-'} / cores: ${na.hardwareConcurrency ?? '-'} / jsHeapSizeLimit: ${perf?.memory?.jsHeapSizeLimit ?? '-'}`,
    `API: toBlob=${typeof canvasProto.toBlob} ellipse=${typeof ctxProto.ellipse} roundRect=${typeof ctxProto.roundRect} OffscreenCanvas=${typeof OffscreenCanvas} document.fonts=${typeof document.fonts}`,
  ]
}
