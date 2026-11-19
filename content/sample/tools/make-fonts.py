"""Static Regular and Bold instances of Noto Sans JP for in-canvas text (M3 W6, AB-T-0545; the text spike's verdict,
AB-T-0536: a variable font renders only its default instance, which for Noto Sans JP is Thin).

From the variable font (OFL; spike-text/fonts/fetch.sh downloads it) this pins wght to 400 and 700 and subsets each to
Latin, Latin-1, general and CJK punctuation, kana and full-width forms, which is what the sample's lines need, at about
a tenth of a megabyte each. --cjk keeps every glyph the font has (about 5 MB each): write those somewhere git ignores.

  <venv with fonttools>/bin/python -I content/sample/tools/make-fonts.py <NotoSansJP-wght.ttf> [--out content/sample/fonts] [--cjk]
"""
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

UNICODES = [
    *range(0x20, 0x7F), *range(0xA0, 0x100),  # Latin, Latin-1
    *range(0x2010, 0x2070),  # general punctuation (dashes, quotes, ellipsis)
    0x20AC, 0x2122,  # euro, trade mark
    *range(0x3000, 0x3040),  # CJK punctuation
    *range(0x3040, 0x30A0), *range(0x30A0, 0x3100),  # hiragana, katakana
    *range(0xFF00, 0xFFF0),  # full-width and half-width forms
]


def main():
    args = sys.argv[1:]
    src = Path(args[0])
    out = Path(args[args.index("--out") + 1]) if "--out" in args else Path(__file__).resolve().parent.parent / "fonts"
    out.mkdir(parents=True, exist_ok=True)
    for name, wght in (("Regular", 400), ("Bold", 700)):
        font = TTFont(src)
        static = instantiateVariableFont(font, {"wght": wght}, updateFontNames=True)
        if "--cjk" not in args:
            opts = subset.Options()
            opts.layout_features = ["*"]
            opts.name_IDs = ["*"]
            opts.name_languages = ["*"]
            opts.notdef_outline = True
            sub = subset.Subsetter(opts)
            sub.populate(unicodes=UNICODES)
            sub.subset(static)
        path = out / f"NotoSansJP-{name}{'-cjk' if '--cjk' in args else ''}.ttf"
        static.save(path)
        print(f"{path}: {path.stat().st_size // 1024} KB, {len(static.getGlyphOrder())} glyphs, wght {wght}")


if __name__ == "__main__":
    main()
