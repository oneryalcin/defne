#!/usr/bin/env python3
"""Throwaway helper for testing gpt-image-2 prompts.

Usage:
    uv run --with openai scripts/gen_image.py <prompt-slug> [--ref <path>]

Reads scripts/prompts/<prompt-slug>.txt as the prompt body, calls
client.images.generate (no --ref) or client.images.edit (with --ref), and
writes the PNG + a sidecar .log to tmp/image-tests/<prompt-slug>.png.

Single helper file by design — per CLAUDE.md, prefer one reusable script over
many similar scrap files.
"""

import argparse
import base64
import datetime as dt
import os
import sys
from pathlib import Path

from openai import OpenAI

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROMPTS_DIR = PROJECT_ROOT / "scripts" / "prompts"
OUTPUT_DIR = PROJECT_ROOT / "tmp" / "image-tests"

# Rough cost estimates (USD) at gpt-image-2 medium quality, current public pricing.
# Used only for the log file — actual billing is OpenAI's number.
COST_HINT_PER_IMAGE = {
    ("1024x1024", "medium"): 0.04,
    ("1536x1024", "medium"): 0.06,
    ("1024x1536", "medium"): 0.06,
}


def load_prompt(slug: str) -> str:
    path = PROMPTS_DIR / f"{slug}.txt"
    if not path.exists():
        sys.exit(f"prompt file not found: {path}")
    return path.read_text().strip()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("slug", help="prompt filename (without .txt) under scripts/prompts/")
    p.add_argument("--ref", help="path to reference PNG; switches to images.edit")
    p.add_argument("--size", default="1024x1024",
                   choices=["1024x1024", "1024x1536", "1536x1024", "auto"])
    p.add_argument("--quality", default="medium",
                   choices=["low", "medium", "high", "auto"])
    p.add_argument("--background", default="auto",
                   choices=["auto", "opaque", "transparent"])
    p.add_argument("--model", default="gpt-image-2")
    args = p.parse_args()

    prompt = load_prompt(args.slug)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_png = OUTPUT_DIR / f"{args.slug}.png"
    out_log = OUTPUT_DIR / f"{args.slug}.log"

    client = OpenAI()
    t0 = dt.datetime.now(dt.timezone.utc)

    if args.ref:
        ref_path = Path(args.ref)
        if not ref_path.exists():
            sys.exit(f"reference image not found: {ref_path}")
        with ref_path.open("rb") as f:
            result = client.images.edit(
                model=args.model,
                prompt=prompt,
                image=f,
                size=args.size,
                quality=args.quality,
                background=args.background,
                n=1,
            )
        mode = f"edit (ref={ref_path.name})"
    else:
        result = client.images.generate(
            model=args.model,
            prompt=prompt,
            size=args.size,
            quality=args.quality,
            background=args.background,
            n=1,
        )
        mode = "generate"

    elapsed = (dt.datetime.now(dt.timezone.utc) - t0).total_seconds()
    image_b64 = result.data[0].b64_json
    if image_b64 is None:
        sys.exit("API returned no b64_json — check response_format and quota")

    out_png.write_bytes(base64.b64decode(image_b64))

    cost = COST_HINT_PER_IMAGE.get((args.size, args.quality))
    cost_str = f"~${cost:.2f}" if cost else "unknown"

    log = (
        f"# {args.slug}\n"
        f"timestamp: {t0.isoformat()}\n"
        f"mode: {mode}\n"
        f"model: {args.model}\n"
        f"size: {args.size}\n"
        f"quality: {args.quality}\n"
        f"background: {args.background}\n"
        f"elapsed_sec: {elapsed:.1f}\n"
        f"cost_estimate: {cost_str}\n"
        f"output: {out_png.relative_to(PROJECT_ROOT)}\n"
        f"\n--- prompt ---\n{prompt}\n"
    )
    out_log.write_text(log)

    print(f"OK  {out_png.relative_to(PROJECT_ROOT)}  ({elapsed:.1f}s, {cost_str})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
