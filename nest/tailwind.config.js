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
    },
  },
  plugins: [],
}
