/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      // 中文一律不挂 Web Font：一个中文字重 1.1~1.5MB，移动端首屏扛不住。
      // 中文由系统字体兜底（iOS 苹方 / 安卓系统黑体 / Windows 雅黑）。
      fontFamily: {
        sans: ['Geist', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        serif: ['Newsreader', '"Songti SC"', 'serif'],
        brand: ['"Funnel Sans"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        mono: ['"Geist Mono"', 'monospace'],
      },
      keyframes: {
        // 呼吸感：轻微缩放 + 外扩光环，用于引导性主按钮（如「领养宠物」）
        breathe: {
          '0%, 100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(255,255,255,0.5)' },
          '50%': { transform: 'scale(1.05)', boxShadow: '0 0 0 10px rgba(255,255,255,0)' },
        },
      },
      animation: {
        breathe: 'breathe 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
