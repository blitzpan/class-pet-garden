// 成长卡：离屏 Canvas 绘制 → 导出 JPEG
// 页面展示与下载用的是同一份产物，所以「看到的」和「发出去的」完全一致。
//
// 设计定位：小学班级的宠物养成积分系统，分享者是家长，晒在朋友圈/家庭群，
// 主角是「孩子 + 一只小宠物」。所以风格是：童趣、温柔治愈、精致——像绘本里的一页，
// 不是成绩单。落到执行上：
//   · 配色走低饱和奶油色系（高饱和橙会显廉价刺眼）
//   · 居中对称构图，唯一视觉主体是宠物头像，其余全部弱化
//   · 字号只保留 4 级（96 / 42 / 24 / 20），层级多了就散
//   · 不用 emoji 做装饰：不同手机渲染不一致，且会拉低质感，爪印改为手绘
//
// 尺寸：逻辑 750×1160（约 3:4.6 竖版），按 2 倍绘制保证清晰。
// 字体：中文走系统字体（项目未加载中文 Web Font），数字用已加载的 Geist。

const W = 750
const H = 1160
const SCALE = 2
const M = 56 // 左右安全边距
const CW = W - M * 2 // 内容宽 638

const C = {
  bgTop: '#FDF8F3',
  bgBottom: '#FBEBDC',
  ink: '#3A2F28', // 主文字（暖黑，不用纯黑）
  ink2: '#8A796B', // 次级
  ink3: '#BCAEA1', // 弱化
  accent: '#C96A3B', // 主色：低饱和暖橙棕
  accentSoft: '#F3E3D5',
  gold: '#C09A4E', // 排名高亮
  card: '#FFFCFA',
  soft: '#FFF3E7',
  line: '#F1E5DA',
  rule: '#E6D3C2',
  plus: '#4B8C6B',
  minus: '#C4553F',
}

const SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
const NUM = `Geist, ${SANS}`

export interface ShareCardData {
  name: string
  className: string
  totalPoints: number
  /** 宠物图片地址（同源 /pets/...）；没有宠物时传空 */
  petImageUrl: string
  petName: string
  levelText: string
  /** 环形成长进度，0-100 */
  progressPercent: number
  rank: number | null
  classSize: number | null
  checkinDays: number
  latest: { reason: string; points: number } | null
  quote: string
  dateText: string
  siteText: string
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** 居中绘制 + 字间距（canvas 的 letterSpacing 兼容性不稳，自己算最可靠） */
function drawTracked(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, tracking: number) {
  const chars = [...text]
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1)
  let x = cx - total / 2
  for (let i = 0; i < chars.length; i += 1) {
    ctx.fillText(chars[i], x, y)
    x += widths[i] + tracking
  }
}

/** 居中短分隔线，用作段落之间的呼吸符 */
function drawRule(ctx: CanvasRenderingContext2D, cy: number, width = 36, color = C.rule) {
  ctx.fillStyle = color
  roundRect(ctx, W / 2 - width / 2, cy, width, 2, 1)
  ctx.fill()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = ch
      if (lines.length === maxLines) break
    } else {
      line = test
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  return lines
}

/** 宽度超了就缩字号，缩到最小还超就截断加省略号（会同步改掉 ctx.font） */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: (size: number) => string, size: number, minSize: number): string {
  let s = size
  ctx.font = font(s)
  while (ctx.measureText(text).width > maxWidth && s > minSize) {
    s -= 2
    ctx.font = font(s)
  }
  if (ctx.measureText(text).width <= maxWidth) return text
  let out = text
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) out = out.slice(0, -1)
  return out + '…'
}

function loadImage(src: string, timeout = 8000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => resolve(null), timeout)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    img.src = src
  })
}

async function ensureFonts() {
  try {
    await document.fonts?.ready
  } catch {
    /* 字体没就绪也能画，只是回落系统字体 */
  }
}

/** 手绘小爪印：替代 emoji，各端渲染一致 */
function drawPaw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(cx, cy + s * 0.22, s * 0.34, s * 0.28, 0, 0, Math.PI * 2)
  ctx.fill()
  const toes: [number, number, number, number][] = [
    [-0.42, -0.14, 0.15, 0.19],
    [-0.16, -0.38, 0.16, 0.20],
    [0.16, -0.38, 0.16, 0.20],
    [0.42, -0.14, 0.15, 0.19],
  ]
  for (const [dx, dy, rx, ry] of toes) {
    ctx.beginPath()
    ctx.ellipse(cx + s * dx, cy + s * dy, s * rx, s * ry, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, C.bgTop)
  g.addColorStop(1, C.bgBottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // 顶部柔光：让画面像有自然光落下来
  const top = ctx.createRadialGradient(W / 2, 40, 0, W / 2, 40, 340)
  top.addColorStop(0, 'rgba(255,255,255,0.55)')
  top.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, W, 420)

  // 底部暖光
  const bottom = ctx.createRadialGradient(W / 2, H + 40, 0, W / 2, H + 40, 320)
  bottom.addColorStop(0, 'rgba(217,138,84,0.16)')
  bottom.addColorStop(1, 'rgba(217,138,84,0)')
  ctx.fillStyle = bottom
  ctx.fillRect(0, H - 360, W, 360)
}

function drawHeader(ctx: CanvasRenderingContext2D, dateText: string) {
  ctx.textAlign = 'left'
  ctx.fillStyle = C.ink3
  ctx.font = `500 20px ${SANS}`
  drawTracked(ctx, dateText, W / 2, 84, 3)
  drawRule(ctx, 110)
}

/** 宠物头像：圆形裁剪 + 外圈环形成长进度 */
async function drawAvatar(ctx: CanvasRenderingContext2D, d: ShareCardData) {
  const cx = W / 2
  const cy = 300
  const r = 104

  // 柔光晕，让头像像浮在光里
  const halo = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.75)
  halo.addColorStop(0, 'rgba(255,255,255,0.9)')
  halo.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(cx, cy, r * 1.75, 0, Math.PI * 2)
  ctx.fill()

  // 头像底（宠物图加载失败时可见）
  ctx.fillStyle = '#FBECDE'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  // 圆形裁剪后绘制宠物（图片自带底色也不会露出方角）
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  const pet = d.petImageUrl ? await loadImage(d.petImageUrl) : null
  if (pet) {
    const inner = r * 2
    const ratio = Math.min(inner / pet.width, inner / pet.height)
    const dw = pet.width * ratio
    const dh = pet.height * ratio
    ctx.drawImage(pet, cx - dw / 2, cy - dh / 2, dw, dh)
  } else {
    drawPaw(ctx, cx, cy, 88, '#E4D2C1')
  }
  ctx.restore()

  // 白色留白环，把头像和进度环分开
  ctx.strokeStyle = C.bgTop
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2)
  ctx.stroke()

  // 环形成长进度（外侧细环）
  const ringR = r + 22
  ctx.lineWidth = 6
  ctx.strokeStyle = C.accentSoft
  ctx.beginPath()
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
  ctx.stroke()

  const pct = Math.max(0, Math.min(100, d.progressPercent)) / 100
  if (pct > 0) {
    ctx.strokeStyle = '#D08A5C'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct)
    ctx.stroke()
    ctx.lineCap = 'butt'
  }
}

function drawName(ctx: CanvasRenderingContext2D, d: ShareCardData) {
  ctx.textAlign = 'left'
  ctx.fillStyle = C.ink
  const name = fitText(ctx, d.name, CW - 80, (s) => `600 ${s}px ${SANS}`, 42, 30)
  drawTracked(ctx, name, W / 2, 478, 1)

  ctx.fillStyle = C.ink2
  ctx.font = `500 22px ${SANS}`
  const sub = [d.className, d.petName].filter(Boolean).join(' · ')
  drawTracked(ctx, fitText(ctx, sub, CW - 40, (s) => `500 ${s}px ${SANS}`, 22, 18), W / 2, 516, 2)
}

function drawPoints(ctx: CanvasRenderingContext2D, d: ShareCardData) {
  ctx.textAlign = 'left'
  ctx.fillStyle = C.accent
  const text = fitText(ctx, d.totalPoints.toLocaleString('en-US'), CW - 60, (s) => `700 ${s}px ${NUM}`, 96, 64)
  drawTracked(ctx, text, W / 2, 636, -1)

  ctx.fillStyle = C.ink3
  ctx.font = `500 20px ${SANS}`
  drawTracked(ctx, '累计积分', W / 2, 670, 4)

  ctx.fillStyle = C.line
  ctx.fillRect(M + 120, 704, CW - 240, 1)
}

function drawStats(ctx: CanvasRenderingContext2D, d: ShareCardData) {
  const colW = CW / 3
  const cells: { value: string; label: string; gold?: boolean }[] = [
    {
      value: d.rank ? `第 ${d.rank} 名` : '—',
      label: d.rank && d.classSize ? `全班 ${d.classSize} 人` : '班级排名',
      gold: !!d.rank && d.rank <= 3,
    },
    { value: String(d.checkinDays), label: '打卡天数' },
    { value: d.levelText, label: '成长等级' },
  ]

  // 竖向细分隔线
  ctx.fillStyle = C.line
  for (let i = 1; i < 3; i += 1) {
    ctx.fillRect(M + colW * i, 720, 1, 40)
  }

  cells.forEach((cell, i) => {
    const cx = M + colW * (i + 0.5)
    ctx.textAlign = 'left'
    ctx.fillStyle = cell.gold ? C.gold : C.ink
    ctx.font = `700 32px ${NUM}`
    drawTracked(ctx, fitText(ctx, cell.value, colW - 16, (s) => `700 ${s}px ${NUM}`, 32, 24), cx, 748, 0)
    ctx.fillStyle = C.ink3
    ctx.font = `500 20px ${SANS}`
    drawTracked(ctx, fitText(ctx, cell.label, colW - 10, (s) => `500 ${s}px ${SANS}`, 20, 16), cx, 778, 1)
  })
}

function drawLatest(ctx: CanvasRenderingContext2D, d: ShareCardData) {
  ctx.textAlign = 'left'
  ctx.fillStyle = C.ink3
  ctx.font = `500 20px ${SANS}`
  drawTracked(ctx, '最近的小进步', W / 2, 826, 4)

  const boxY = 842
  const boxH = 64
  ctx.fillStyle = C.card
  roundRect(ctx, M, boxY, CW, boxH, 18)
  ctx.fill()
  ctx.strokeStyle = C.line
  ctx.lineWidth = 1
  roundRect(ctx, M, boxY, CW, boxH, 18)
  ctx.stroke()

  if (!d.latest) {
    ctx.fillStyle = C.ink3
    ctx.font = `500 22px ${SANS}`
    drawTracked(ctx, '还没有记录，就从第一次打卡开始吧', W / 2, boxY + 40, 1)
    return
  }

  ctx.fillStyle = C.ink
  ctx.font = `500 24px ${SANS}`
  ctx.fillText(fitText(ctx, d.latest.reason, CW - 48 - 110, (s) => `500 ${s}px ${SANS}`, 24, 20), M + 24, boxY + 40)

  ctx.textAlign = 'right'
  ctx.fillStyle = d.latest.points >= 0 ? C.plus : C.minus
  ctx.font = `700 26px ${NUM}`
  ctx.fillText(`${d.latest.points > 0 ? '+' : ''}${d.latest.points}`, W - M - 24, boxY + 40)
  ctx.textAlign = 'left'
}

function drawQuote(ctx: CanvasRenderingContext2D, quote: string) {
  drawRule(ctx, 940, 28)

  ctx.textAlign = 'left'
  ctx.fillStyle = C.ink
  ctx.font = `600 32px ${SANS}`
  const lines = wrapText(ctx, quote, CW - 60, 2)
  const startY = lines.length > 1 ? 998 : 1012
  lines.forEach((line, i) => {
    drawTracked(ctx, line, W / 2, startY + i * 48, 1)
  })
}

function drawFooter(ctx: CanvasRenderingContext2D, d: ShareCardData) {
  ctx.fillStyle = C.line
  ctx.fillRect(M, 1080, CW, 1)

  ctx.textAlign = 'left'
  ctx.fillStyle = C.ink3
  ctx.font = `500 20px ${SANS}`
  drawTracked(ctx, '每一次进步都在被看见', W / 2, 1114, 3)
  ctx.fillStyle = '#CBBDB0'
  ctx.font = `400 18px ${SANS}`
  drawTracked(ctx, d.siteText, W / 2, 1140, 1)
}

export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  await ensureFonts()

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 Canvas 绘图')
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'alphabetic'

  drawBackground(ctx)
  drawHeader(ctx, data.dateText)
  await drawAvatar(ctx, data)
  drawName(ctx, data)
  drawPoints(ctx, data)
  drawStats(ctx, data)
  drawLatest(ctx, data)
  drawQuote(ctx, data.quote)
  drawFooter(ctx, data)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片生成失败，请重试'))),
      'image/jpeg',
      0.92,
    )
  })
}

export const SHARE_CARD_SIZE = { width: W, height: H }
