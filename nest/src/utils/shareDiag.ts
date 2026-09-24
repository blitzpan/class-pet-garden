// 移动端成长卡导出诊断（临时工具，定位完成后整体删除即可）
//
// 用法：分享链接加 ?diag=1 打开（会记到 localStorage，之后直接打开也带诊断）
//      访问 ?diag=0 关闭
// 面板会吐出：运行环境 + 真实异常 + 各倍率画布的 getContext/绘制/toBlob/toDataURL 结果
// 由于无法在手机上远程调试，这些信息靠截图或「复制」取回。

const JPEG = 'image/jpeg'
const QUALITY = 0.92

/** 每改一版诊断就 +1：日志里第一行会打出来，用来确认手机跑的是不是最新构建 */
export const DIAG_VERSION = 'v5'

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

function loadOnce(url: string, cors: boolean): Promise<{ status: string; img?: HTMLImageElement }> {
  return new Promise((resolve) => {
    const img = new Image()
    if (cors) img.crossOrigin = 'anonymous'
    let done = false
    let timer: ReturnType<typeof setTimeout>
    const finish = (status: string, i?: HTMLImageElement) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ status, img: i })
    }
    timer = setTimeout(() => finish('加载超时(8s)'), 8000)
    img.onerror = () => finish('onerror 加载失败')
    img.onload = () => finish('loaded', img)
    img.src = url
  })
}

function taintTest(img: HTMLImageElement): string {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  if (!ctx) return '64x64 画布都拿不到 ctx'
  try {
    ctx.drawImage(img, 0, 0, 64, 64)
    c.toDataURL(JPEG)
    return '画布未被污染'
  } catch (e) {
    return `导出被拒绝 ${errText(e)} ← 跨域污染`
  } finally {
    release(c)
  }
}

/** fetch 成 Blob 再用同源 blob: URL 加载：代理改不到 blob:，理论上不可能污染 */
async function loadViaBlob(url: string): Promise<{ status: string; img?: HTMLImageElement }> {
  try {
    const res = await fetch(url)
    if (!res.ok) return { status: `fetch HTTP ${res.status}` }
    const blobUrl = URL.createObjectURL(await res.blob())
    const r = await loadOnce(blobUrl, false)
    URL.revokeObjectURL(blobUrl)
    return r
  } catch (e) {
    return { status: `fetch 失败 ${errText(e)}` }
  }
}

/**
 * 宠物图三种取法对照：no-cors / cors / blob。
 * 关键看哪一路能「加载成功 + 画布未被污染」，那一路就是卡片能用上宠物图的取法。
 */
export async function probeImage(url: string): Promise<string> {
  if (!url) return 'pet: 无宠物图（走爪印兜底）'
  const out: string[] = []
  for (const cors of [false, true]) {
    const r = await loadOnce(url, cors)
    const tag = `pet[${cors ? 'cors' : 'no-cors'}]`
    if (!r.img) {
      out.push(`${tag}: ${r.status}（卡片会退化成爪印）`)
      continue
    }
    // currentSrc 才是真正取到图的地址：被重定向或被浏览器走代理时，它和 src 不一样
    const real = r.img.currentSrc || url
    let crossed = false
    try {
      crossed = new URL(real, window.location.href).origin !== window.location.origin
    } catch {
      crossed = false
    }
    out.push(
      `${tag}: ${r.status} ${r.img.naturalWidth}x${r.img.naturalHeight}，实际取图 ${real}${crossed ? ' ← 跨源！' : ''}，${taintTest(r.img)}`,
    )
  }
  const b = await loadViaBlob(url)
  out.push(
    b.img
      ? `pet[blob]: ${b.status} ${b.img.naturalWidth}x${b.img.naturalHeight}，${taintTest(b.img)}`
      : `pet[blob]: ${b.status}（取不到图）`,
  )
  return out.join('\n')
}

export function envInfo(): string[] {
  const na = navigator as any
  const canvasProto = HTMLCanvasElement.prototype as any
  const ctxProto: any =
    typeof CanvasRenderingContext2D === 'undefined' ? {} : (CanvasRenderingContext2D.prototype as any)
  const perf = performance as any
  return [
    `诊断版本: ${DIAG_VERSION} / 页面文件时间: ${document.lastModified}`,
    `时间: ${new Date().toISOString()}`,
    `URL: ${window.location.href}`,
    `UA: ${na.userAgent}`,
    `平台: ${na.platform || '-'} / DPR ${window.devicePixelRatio} / 屏幕 ${screen.width}x${screen.height} / 视口 ${window.innerWidth}x${window.innerHeight}`,
    `deviceMemory: ${na.deviceMemory ?? '-'} / cores: ${na.hardwareConcurrency ?? '-'} / jsHeapSizeLimit: ${perf?.memory?.jsHeapSizeLimit ?? '-'}`,
    `API: toBlob=${typeof canvasProto.toBlob} ellipse=${typeof ctxProto.ellipse} roundRect=${typeof ctxProto.roundRect} OffscreenCanvas=${typeof OffscreenCanvas} document.fonts=${typeof document.fonts}`,
  ]
}
