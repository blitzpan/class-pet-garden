# 家长端字体：两个必须知道的坑

家长端在手机上打开，字体处理有两条硬规矩。改动前请先看完，否则很容易做出「本地看着没问题、家长手机上要等几十秒」的页面。

---

## 坑一：图标字体是「子集」，加新图标必须重跑脚本

### 现状

- 页面只用了 **14 个** Material Symbols 图标：
  `arrow_back` `close` `emoji_events` `expand_more` `format_list_numbered`
  `groups` `help` `lock` `login` `logout` `pets` `search` `share` `workspace_premium`
- 完整字体 **5.2 MB**，子集后 **约 16 KB**，构建产物里放的是子集：

| 文件 | 作用 | 大小 |
|---|---|---|
| `scripts/fonts/material-symbols-rounded-full.woff2` | 母字体（完整版，**不参与构建**） | 5.2 MB |
| `public/fonts/material-symbols-rounded.woff2` | 子集产物（**构建产物，不要手改**） | ~16 KB |

### 踩坑方式

图标是靠**连字（ligature）**显示的：模板里写的是 `<span class="material-symbols-rounded">pets</span>`，
字体用 GSUB 把 `p-e-t-s` 这串字母替换成一个小狗图标。

如果你在模板里新加一个图标，比如：

```html
<span class="material-symbols-rounded">star</span>
```

而**没有重跑生成脚本**，那么子集字体里根本没有 `star` 这个字形，浏览器只能当普通文字渲染——
家长手机上会直接看到英文单词 **`star`**，而不是星星图标。而且这个问题**本地开发时不会出现**，
因为本地 `npm run dev` 用的是同一份子集字体……只有在你忘记重跑、又恰好新增了图标时才会暴露。

### 正确做法

```bash
# 依赖一次性安装
pip install fonttools brotli

python scripts/subset-icon-font.py
```

脚本会**自动扫描 `src/**/*.vue`** 里用到的图标名，重新生成子集，并在生成后自检每个图标的连字是否还在。
所以你只要加完图标跑一次就行，不用手工维护图标名单。

> 脚本末尾会打印本次打包了哪几个图标和最终体积，看到「校验通过」才算成功。

---

## 坑二：不要自己手写 `pyftsubset`，必须关掉布局闭包

想当然的写法是这样的：

```bash
pyftsubset full.woff2 --text="pets close search ..." --flavor=woff2   # ❌ 错误
```

结果会得到一个 **3.2 MB** 的所谓「子集」——几乎没变小。

原因：fonttools 默认会做**布局闭包（layout closure）**。你给的是字母 `p e t s c l o s e a r h …`，
它会顺着 GSUB 连字规则，把**所有能由这些字母拼出来的图标**全部保留下来。14 个图标名几乎覆盖了全部小写字母，
于是 3000 多个图标被整包拉了回来。

正确写法必须关掉闭包，并**显式给出图标的码位**（而不是只给字母）：

```bash
pyftsubset full.woff2 \
  --unicodes="U+5F,U+61-7A,U+E5C4,U+E5CD,U+EA23,U+E5CF,U+E242,U+F233,U+E8FD,U+E899,U+EA77,U+E9BA,U+E91D,U+EF7A,U+E80D,U+E7AF" \
  --layout-features=liga,ccmp,locl,rlig,calt \
  --no-layout-closure \
  --flavor=woff2
```

- `U+5F,U+61-7A` 是下划线和 a-z：连字要靠这些字母触发，必须保留；
- 后面那串是 14 个图标的码位（`scripts/subset-icon-font.py` 会自动从母字体里查出来）；
- `--no-layout-closure` 是**关键**，漏了就等于白做。

> 注意：用 fontTools Python API 时属性名是 `options.layout_closure = False`，
> 只有命令行才叫 `--no-layout-closure`。写成 `options.no_layout_closure = True` 不会报错，但**完全不生效**。

---

## 坑三：中文不要加 Web Font

曾经这里加载过 `noto-sans-sc`（5 个字重）+ `noto-serif-sc`（3 个字重），合计 **9.9 MB**，
而且 fontsource 的中文字体**不带 `unicode-range` 分片**，只要页面上出现一个汉字就得整包下载。
结果就是家长在微信里点开链接，要先等十几秒甚至更久，中文才从系统字体切换成 Noto——很多人没等就退出了。

现在的做法：**中文一律用系统字体**（iOS 苹方 / 安卓系统黑体 / Windows 雅黑），见：

- `src/fonts.css` —— 只保留西文字体（Geist / Geist Mono / Funnel Sans / Newsreader），每个 9~29 KB
- `src/style.css` —— `body { font-family: 'Geist', 'PingFang SC', 'Microsoft YaHei', sans-serif }`
- `tailwind.config.js` —— `sans` / `serif` / `brand` / `mono` 里都不含 Noto

**请保持这个状态。** 如果确实要上中文字体，先想清楚两件事：

1. 家长端会显示**学生姓名**，姓名里可能有生僻字。用 `unicode-range` 分片的话，
   不在分片里的字会临时掉回系统字体，出现「同一页两种中文字体混排」，比统一用系统字体更难看。
2. 任何中文字重都是 1 MB 起步，移动端首屏基本不可接受。

---

## 坑四：`.material-symbols-rounded` 必须写在 `@tailwind utilities` 之前

`src/style.css` 里的顺序是刻意安排的：

```css
@tailwind base;

@font-face { ... }                /* 图标字体 */
.material-symbols-rounded { ... } /* 注意位置 */

@tailwind components;
@tailwind utilities;              /* text-[18px] 之类的工具类在这里 */
```

`.material-symbols-rounded` 里有一条 `font-size: 24px`。如果它排在 `@tailwind utilities` **后面**，
同优先级下后写的胜出，模板里的 `text-[14px]` / `text-[16px]` / `text-[18px]` / `text-[20px]` / `text-[22px]`
会**全部失效**，所有图标都变成 24px。

曾经这就是实际状态（图标一律 24px），排查时很容易误判成「图标组件有问题」。

---

## 快速自检清单

改完字体相关代码后：

1. `python scripts/subset-icon-font.py` —— 新增过图标就跑，看到「校验通过」；
2. `npm run build` —— 看 `dist` 总体积，正常应在 **1 MB 以内**（图标 ~16KB + 西文字体 ~0.3MB + JS/CSS ~0.25MB）；
   如果发现中文字体（文件名含 `noto`）出现在 `dist/assets/` 里，说明有人又把中文字体加回来了；
3. 真机上用**手机网络**（不是 WiFi）打开一次，确认中文和图标是**立刻可见**的，没有先冒英文单词。
