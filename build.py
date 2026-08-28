#!/usr/bin/env python3
"""Build index.html from src/.

The landing page is one self-contained file — every image and every piece of
notation is embedded, so it has no external requests and works from anywhere.
That makes the built file unreadable, hence this: edit src/landing.html and run

    python3 build.py

Nothing is installed and nothing is fetched; it only reads src/ and writes
index.html. The size of the editor is measured here rather than typed, so the
download button and the README can't drift out of date.

    python3 build.py --check       report only, write nothing
"""

import base64
import json
import mimetypes
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
EDITOR = ROOT / "bass-notation.html"
OUT = ROOT / "index.html"
README = ROOT / "README.md"

DESCRIPTION = (
    "A bass transcription editor built on three rows: how long the note is, "
    "where it sits on the neck, and what it is called."
)


def data_uri(path: pathlib.Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def build() -> tuple[str, int]:
    page = (SRC / "landing.html").read_text()
    editor_kb = round(EDITOR.stat().st_size / 1024)

    parts = {
        "__PHOTO__": data_uri(SRC / "assets" / "paper.jpg"),
        "__SHOT__": data_uri(SRC / "assets" / "screen.jpg"),
        "__PANEL__": data_uri(SRC / "assets" / "chords.jpg"),
        "__PLAYER_SVG__": (SRC / "demo" / "player.svg").read_text(),
        "__PLAYER_PLAN__": json.dumps(
            json.loads((SRC / "demo" / "player.json").read_text()),
            separators=(",", ":"),
        ),
        "__CHART__": (SRC / "demo" / "sketch-chart.svg").read_text(),
        "__FILLED__": (SRC / "demo" / "sketch-filled.svg").read_text(),
        "__BOURREE_TAB__": (SRC / "demo" / "bourree-tab.svg").read_text(),
        "__BOURREE_STD__": (SRC / "demo" / "bourree-std.svg").read_text(),
        "__BOURREE_PLAN__": json.dumps(
            json.loads((SRC / "demo" / "bourree.json").read_text()),
            separators=(",", ":"),
        ),
        "__SIZE__": f"{editor_kb} KB",
    }
    for token, value in parts.items():
        if token not in page:
            sys.exit(f"error: {token} is missing from src/landing.html")
        page = page.replace(token, value)

    leftover = re.findall(r"__[A-Z_]+__", page)
    if leftover:
        sys.exit(f"error: unfilled placeholders: {sorted(set(leftover))}")

    # src/landing.html holds the <title> and <style> and then the body markup;
    # a real document needs the doctype (or browsers use quirks mode), a charset
    # for the ♯ and ♭ signs, and a viewport or phones render it at 980px wide.
    head_end = page.index("</style>") + len("</style>")
    doc = (
        "<!doctype html>\n"
        '<html lang="en">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f'<meta name="description" content="{DESCRIPTION}">\n'
        f"{page[:head_end]}\n"
        "</head>\n<body>"
        f"{page[head_end:]}\n"
        "</body>\n</html>\n"
    )
    return doc, editor_kb


def build_clip(editor_kb: int) -> str:
    """The vertical promo clip page — a complete document already, so this
    only fills its placeholders. Deploys to /threeline/clip.html."""
    page = (SRC / "clip.html").read_text()
    parts = {
        "__CLIP_SVG__": (SRC / "demo" / "clip-groove.svg").read_text(),
        "__CLIP_PLAN__": json.dumps(
            json.loads((SRC / "demo" / "clip-groove.json").read_text()),
            separators=(",", ":"),
        ),
        "__SIZE__": f"{editor_kb} KB",
    }
    for token, value in parts.items():
        if token not in page:
            sys.exit(f"error: {token} is missing from src/clip.html")
        page = page.replace(token, value)
    leftover = re.findall(r"__[A-Z_]+__", page)
    if leftover:
        sys.exit(f"error: unfilled placeholders in clip.html: {sorted(set(leftover))}")
    return page


def stamp_readme(editor_kb: int) -> bool:
    text = README.read_text()
    updated = re.sub(
        r"(`bass-notation\.html` — the editor itself, )\d+ KB",
        rf"\g<1>{editor_kb} KB",
        text,
    )
    if updated == text:
        return False
    README.write_text(updated)
    return True


def main() -> None:
    check = "--check" in sys.argv
    doc, editor_kb = build()
    clip = build_clip(editor_kb)
    clip_out = ROOT / "clip.html"

    same = OUT.exists() and OUT.read_text() == doc
    clip_same = clip_out.exists() and clip_out.read_text() == clip
    print(f"editor      {editor_kb} KB")
    print(f"index.html  {len(doc) // 1024} KB  ({'unchanged' if same else 'rebuilt'})")
    print(f"clip.html   {len(clip) // 1024} KB  ({'unchanged' if clip_same else 'rebuilt'})")

    if check:
        print("--check: nothing written")
        return

    if not same:
        OUT.write_text(doc)
    if not clip_same:
        clip_out.write_text(clip)
    if stamp_readme(editor_kb):
        print(f"README      size updated to {editor_kb} KB")


if __name__ == "__main__":
    main()
