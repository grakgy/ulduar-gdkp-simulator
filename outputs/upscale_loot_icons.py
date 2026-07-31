from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


workspace = Path(__file__).resolve().parent.parent
icon_directory = workspace / "photo" / "loot"
icons = sorted(icon_directory.glob("*.jpg"))

if len(icons) != 118:
    raise RuntimeError(f"Expected 118 loot icons, found {len(icons)}")

for index, icon_path in enumerate(icons, start=1):
    with Image.open(icon_path) as source:
        rgb = source.convert("RGB")
        enlarged = rgb.resize((224, 224), Image.Resampling.LANCZOS)
        enhanced = ImageEnhance.Contrast(enlarged).enhance(1.04)
        enhanced = ImageEnhance.Color(enhanced).enhance(1.03)
        enhanced = enhanced.filter(ImageFilter.UnsharpMask(radius=1.35, percent=145, threshold=2))
        enhanced.save(icon_path, "JPEG", quality=96, subsampling=0, optimize=True)
    if index % 20 == 0 or index == len(icons):
        print(f"UPSCALE_PROGRESS={index}/{len(icons)}")
