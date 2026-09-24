"""重新生成家长端图标字体子集。

什么时候必须跑这个脚本
----------------------
只要模板里出现了一个**新的 Material Symbols 图标名**（例如加了一个
`<span class="material-symbols-rounded">star</span>`），就必须重跑。
不重跑的后果：新图标的字形不在子集里，浏览器会把它当成普通文字，
页面上直接显示英文原字 `star`，而不是星星图标。

脚本会自动扫描 `src/**/*.vue` 里用到的图标名，所以不用手工维护名单，
跑一次就会把当前代码里用到的图标全部重新打包进去。

环境依赖
--------
    pip install fonttools brotli

用法
----
    python scripts/subset-icon-font.py

母字体（完整版，5.2MB，不参与构建）：scripts/fonts/material-symbols-rounded-full.woff2
产物（16KB 左右，会被构建到 dist）：public/fonts/material-symbols-rounded.woff2
"""

import re
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.subset import Options, Subsetter

ROOT = Path(__file__).resolve().parent.parent
SOURCE_FONT = ROOT / "scripts" / "fonts" / "material-symbols-rounded-full.woff2"
OUTPUT_FONT = ROOT / "public" / "fonts" / "material-symbols-rounded.woff2"

# 从模板里抓 <span class="...material-symbols-rounded...">图标名</span>
ICON_PATTERN = re.compile(
    r'class="[^"]*material-symbols-rounded[^"]*"[^>]*>\s*([a-z0-9_]+)\s*<'
)


def collect_icon_names():
    names = set()
    for vue in (ROOT / "src").rglob("*.vue"):
        names.update(ICON_PATTERN.findall(vue.read_text(encoding="utf-8")))
    return sorted(names)


def read_ligatures(font):
    """返回 {(输入字形名元组): 输出字形名}。LookupType 7 是 Extension 包装。"""
    order = font.getGlyphOrder()
    gname = lambda v: v if isinstance(v, str) else order[v]

    ligatures = {}
    for lookup in font["GSUB"].table.LookupList.Lookup:
        if lookup.LookupType not in (4, 7):
            continue
        for sub in lookup.SubTable:
            st = sub.ExtSubTable if lookup.LookupType == 7 else sub
            if not hasattr(st, "ligatures"):
                continue
            for first, lig_set in st.ligatures.items():
                for lig in lig_set:
                    comps = tuple(gname(c) for c in lig.Component)
                    ligatures[(gname(first),) + comps] = gname(lig.LigGlyph)
    return ligatures


def resolve(name, cmap, ligatures, order):
    """图标名 -> 码位；找不到返回 None。"""
    try:
        key = tuple(cmap[ord(ch)] for ch in name)
    except KeyError:
        return None
    glyph = ligatures.get(key)
    if glyph is None:
        return None
    rev = {v: k for k, v in cmap.items()}
    return rev.get(glyph)


def main():
    if not SOURCE_FONT.exists():
        sys.exit(f"找不到母字体：{SOURCE_FONT}")

    icon_names = collect_icon_names()
    if not icon_names:
        sys.exit("没有在 src/**/*.vue 里扫到任何 material-symbols-rounded 图标")

    font = TTFont(SOURCE_FONT)
    cmap = font.getBestCmap()
    ligatures = read_ligatures(font)

    unicodes = set()
    missing = []
    for name in icon_names:
        code = resolve(name, cmap, ligatures, font.getGlyphOrder())
        if code is None:
            missing.append(name)
            continue
        unicodes.add(code)
        unicodes.update(ord(ch) for ch in name)  # 连字要靠这些字母触发

    if missing:
        sys.exit(f"母字体里没有这些图标，请核对拼写：{', '.join(missing)}")

    options = Options()
    options.layout_features = ["liga", "ccmp", "locl", "rlig", "calt"]
    # 关键：不关掉布局闭包的话，fonttools 会顺着连字规则把 3000+ 图标全部拉进来，
    # 子集出来仍有 3MB 以上，等于白做。
    # 注意属性名是 layout_closure，命令行参数才是 --no-layout-closure。
    options.layout_closure = False
    options.glyph_names = True
    options.drop_tables += ["DSIG"]

    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    font.flavor = "woff2"
    OUTPUT_FONT.parent.mkdir(parents=True, exist_ok=True)
    font.save(OUTPUT_FONT)

    # 自检：产物里每一个图标的连字都还能解析出来
    out = TTFont(OUTPUT_FONT)
    out_cmap = out.getBestCmap()
    out_ligatures = read_ligatures(out)
    broken = [n for n in icon_names
              if resolve(n, out_cmap, out_ligatures, out.getGlyphOrder()) is None]
    if broken:
        sys.exit(f"子集校验失败，这些图标没有连字：{', '.join(broken)}")

    kb = OUTPUT_FONT.stat().st_size / 1024
    print(f"图标 {len(icon_names)} 个：{', '.join(icon_names)}")
    print(f"已生成 {OUTPUT_FONT.relative_to(ROOT)}  {kb:.1f} KB（校验通过）")


if __name__ == "__main__":
    main()
