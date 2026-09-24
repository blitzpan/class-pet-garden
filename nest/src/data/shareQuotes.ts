// 分享卡片文案库：分组 + 组内随机
//
// 选词红线（写给以后改文案的人）：
// 1. 禁止任何「终结 / 告别 / 旅程终点」类表达（如「这一程」「走完」「最后一程」），
//    在晒娃场景里极易被误读成不好的意思，会造成投诉。
// 2. 禁止「难 / 苦 / 熬 / 坚持到底」等沉重词，这个场景要的是轻盈、暖、有生命力。
// 3. 一句话读完，不绕，不鸡汤，不居高临下。

export type QuoteGroup = 'general' | 'highlight' | 'starter' | 'adopt'

const QUOTES: Record<QuoteGroup, string[]> = {
  // 通用治愈（默认档）
  general: [
    '每一个小小的进步，都在悄悄发光',
    '今天的努力，是明天惊喜的种子',
    '慢慢来也没关系，你一直都在往前走',
    '被认真记录的日子，会长出甜甜的果实',
    '一点点积累，总会变成大大的能量',
    '你专注的样子，比昨天更亮了一点',
    '认真的小孩，运气从来都不会差',
    '今天也很棒呀，明天继续一起发光',
  ],
  // 高光档：班级前三
  highlight: [
    '哇，闪闪发光的你，真是太棒啦',
    '这么棒的表现，值得被好好记住',
    '你努力的样子，本身就是一束光',
  ],
  // 起步档：还没有积分
  starter: [
    '万事开头难，你已经迈出第一步啦',
    '每个厉害的人，都从第一分开始',
    '别着急，精彩的故事才刚开头',
  ],
  // 待领养档：还没有宠物
  adopt: [
    '有一只小可爱，正在等着和你相遇',
    '先攒攒积分，再挑一位心仪的小伙伴吧',
  ],
}

export interface QuoteContext {
  hasPet: boolean
  totalPoints: number
  /** 班级排名，1 起；拿不到时传 null */
  rank: number | null
}

function pickGroup(ctx: QuoteContext): QuoteGroup {
  if (!ctx.hasPet) return 'adopt'
  if (!ctx.totalPoints) return 'starter'
  if (ctx.rank && ctx.rank <= 3) return 'highlight'
  return 'general'
}

/** 按当前学生的情况选一档，再在该档里随机抽一句 */
export function pickQuote(ctx: QuoteContext): string {
  const list = QUOTES[pickGroup(ctx)]
  return list[Math.floor(Math.random() * list.length)]
}
