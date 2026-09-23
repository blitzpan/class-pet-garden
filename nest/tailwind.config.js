/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', '"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        serif: ['Newsreader', '"Noto Serif SC"', '"Songti SC"', 'serif'],
        brand: ['"Funnel Sans"', '"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        mono: ['"Geist Mono"', '"Noto Sans SC"', 'monospace'],
      },
    },
  },
  plugins: [],
}
