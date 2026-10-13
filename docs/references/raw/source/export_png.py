"""Render the provided SVG masters to transparent PNG files.
Install dependency: python -m pip install cairosvg
Example: python export_png.py --scale 4
"""
from __future__ import annotations
import argparse
from pathlib import Path
import cairosvg

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=float, default=1.0)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.scale <= 0:
        parser.error("--scale must be positive")
    root = Path(__file__).resolve().parent.parent
    output = args.output or root / "png" / f"custom-{args.scale:g}x"
    output.mkdir(parents=True, exist_ok=True)
    for source in sorted((root / "svg").glob("*.svg")):
        if source.name == "lcd-symbols.svg":
            continue
        cairosvg.svg2png(url=str(source), write_to=str(output / f"{source.stem}.png"), scale=args.scale)
    print(f"PNG files saved to {output}")

if __name__ == "__main__":
    main()
