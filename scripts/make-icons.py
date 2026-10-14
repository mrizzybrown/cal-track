"""Generates the app icons in public/icons. Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw

S = 1024
img = Image.new("RGB", (S, S), "#0a7c55")
d = ImageDraw.Draw(img)
# A progress ring, three quarters full, centred inside the maskable safe zone.
r, w = 300, 96
box = (S // 2 - r, S // 2 - r, S // 2 + r, S // 2 + r)
d.arc(box, 0, 360, fill="#3a9a77", width=w)
d.arc(box, -90, 180, fill="#ffffff", width=w)
for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
    img.resize((size, size), Image.LANCZOS).save(f"public/icons/{name}")
