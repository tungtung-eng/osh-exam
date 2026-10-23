"""產生 App 圖示：綠底白色安全帽＋「乙」"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "docs"
FONT = "C:/Windows/Fonts/msjhbd.ttc"


def make(size):
    s = 4  # 先畫大再縮，邊緣比較平滑
    W = size * s
    im = Image.new("RGB", (W, W), "#1f6f5c")
    d = ImageDraw.Draw(im)
    # 安全帽：半圓帽體＋帽簷
    cx, top, r = W // 2, int(W * 0.17), int(W * 0.27)
    d.pieslice([cx - r, top, cx + r, top + 2 * r], 180, 360, fill="#ffffff")
    d.rounded_rectangle([cx - int(r * 1.3), top + r - int(W * .01), cx + int(r * 1.3), top + r + int(W * .06)], radius=int(W * .03), fill="#ffffff")
    d.rectangle([cx - int(W * .025), top + int(W * .015), cx + int(W * .025), top + r - int(W * .02)], fill="#1f6f5c")
    f = ImageFont.truetype(FONT, int(W * 0.36))
    d.text((cx, int(W * 0.73)), "乙級", font=f, fill="#ffd54a", anchor="mm")
    im.resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png")


for n in (180, 512):
    make(n)
print("ok")
