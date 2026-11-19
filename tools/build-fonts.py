#!/usr/bin/env python3
"""
Rebuilds the bundled font subsets.

The studio ships two CJK faces restricted to the characters a preschool literacy
card actually needs. The full TTFs are 10–16 MB each; subsetting to GB2312
level-1 (3755 characters) plus ASCII, punctuation and the card's symbol set
brings the pair down to ~1.7 MB, which is what makes it reasonable to ship the
fonts with the app instead of relying on system fonts that differ per machine.

Both faces are open-licensed:
  - 站酷快乐体 ZCOOL KuaiLe — OFL 1.1
  - 霞鹜文楷 LXGW WenKai Lite — OFL 1.1

Usage:
  python tools/build-fonts.py --src /path/to/fonts
The directory must contain zcool-kuaile.ttf and lxgw-wenkai-lite.ttf.
Download sources:
  https://fonts.gstatic.com/s/zcoolkuaile/v22/tssqApdaRQokwFjFJjvM6h2Wpg.ttf
  https://github.com/lxgw/LxgwWenKai-Lite/releases/latest/download/LXGWWenKaiLite-Regular.ttf

Requires: pip install fonttools brotli
"""

import argparse
import subprocess
import sys
from pathlib import Path

SYMBOLS = "，。、；：？！“”‘’（）《》〈〉—…·　○●□■△▲◇◆☆★✓✗→←↑↓"
ASCII = "".join(chr(c) for c in range(0x20, 0x7F))


def gb2312_level1() -> str:
    out = []
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try:
                out.append(bytes([hi, lo]).decode("gb2312"))
            except UnicodeDecodeError:
                continue
    return "".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="directory with the source TTFs")
    ap.add_argument("--out", default="public/fonts", help="output directory")
    args = ap.parse_args()

    src = Path(args.src)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    chars = gb2312_level1() + ASCII + SYMBOLS
    text_file = out / ".charset.txt"
    text_file.write_text(chars, encoding="utf-8")
    print(f"charset: {len(chars)} characters")

    jobs = [
        ("zcool-kuaile.ttf", "zcool-kuaile.ttf", "zcool-kuaile.woff2"),
        ("lxgw-wenkai-lite.ttf", "lxgw-wenkai.ttf", "lxgw-wenkai-lite.woff2"),
    ]
    for source, ttf_name, woff_name in jobs:
        source_path = src / source
        if not source_path.exists():
            print(f"missing {source_path}", file=sys.stderr)
            return 1
        for fmt, target in (("", ttf_name), ("woff2", woff_name)):
            cmd = [
                sys.executable, "-m", "fontTools.subset", str(source_path),
                f"--text-file={text_file}",
                "--layout-features=",
                "--drop-tables+=DSIG",
                f"--output-file={out / target}",
            ]
            if fmt:
                cmd.insert(3, f"--flavor={fmt}")
            subprocess.run(cmd, check=True)
            print(f"wrote {out / target} ({(out / target).stat().st_size / 1024:.0f} KB)")

    text_file.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
