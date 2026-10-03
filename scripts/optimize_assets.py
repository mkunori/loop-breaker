"""Resize generated art to production WebP. Requires Pillow; no generation/API calls.

Usage: python scripts/optimize_assets.py source-manifest.json
Manifest: {"hero": "absolute generated PNG path", "logo": "...",
           "enemy01": "...", "boss01": "...", "background01": "...", ...}
Only final WebP files go into the repository; source images remain untouched.
"""

import json
import sys
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1] / "public" / "assets"


def optimize(key, source):
    image = Image.open(source).convert("RGBA")
    if key.startswith("background"):
        folder, name, size = "backgrounds", "background-zone-" + key[-2:], (960, 540)
        image = ImageOps.fit(image.convert("RGB"), size, Image.Resampling.LANCZOS)
        alpha = False
    else:
        if image.getchannel("A").getextrema()[0] == 255:
            raise ValueError(f"{key}: expected generated transparency")
        alpha_channel = image.getchannel("A")
        # Generated logos can contain almost invisible alpha specks far from the
        # lettering. Ignore only these specks when finding the crop, keep alpha.
        bbox = (alpha_channel.point(lambda v: 255 if v >= 16 else 0)
                if key == "logo" else alpha_channel).getbbox()
        if not bbox:
            raise ValueError(f"{key}: empty image")
        image = image.crop(bbox)
        if key == "hero":
            folder, name, size = "characters", "hero", (256, 256)
        elif key == "logo":
            folder, name, size = "branding", "loop-breaker-logo", (720, 180)
        elif key.startswith("enemy"):
            folder, name, size = "enemies", "enemy-zone-" + key[-2:], (256, 256)
        elif key.startswith("boss"):
            folder, name, size = "bosses", "boss-zone-" + key[-2:], (320, 320)
        else:
            raise ValueError(f"Unknown asset: {key}")
        # Contain, rather than stretch; leave 6% transparent space at each edge.
        image.thumbnail((round(size[0] * 0.88), round(size[1] * 0.88)), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", size)
        canvas.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
        image = canvas
        alpha = True
    destination = ROOT / folder / (name + ".webp")
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=86 if alpha else 80, method=6)
    with Image.open(destination) as check:
        if check.size != size or (alpha and check.getchannel("A").getextrema()[0] != 0):
            raise ValueError(f"Invalid optimized file: {key}")
    return {"file": destination.relative_to(ROOT.parent).as_posix(),
            "width": size[0], "height": size[1], "bytes": destination.stat().st_size,
            "alpha": alpha}


if __name__ == "__main__":
    manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
    results = [optimize(key, source) for key, source in manifest.items()]
    print(json.dumps({"assets": results, "totalBytes": sum(r["bytes"] for r in results)}, indent=2))
