"""Generate Playgrader PWA icons and OG image. Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)
FONT = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
YELLOW_TOP, YELLOW_BOT = (255, 193, 7), (255, 193, 7)
RED = (211, 47, 47)
DARK = (51, 51, 51)


def gradient(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        r = int(YELLOW_TOP[0] + (YELLOW_BOT[0] - YELLOW_TOP[0]) * t)
        g = int(YELLOW_TOP[1] + (YELLOW_BOT[1] - YELLOW_TOP[1]) * t)
        b = int(YELLOW_TOP[2] + (YELLOW_BOT[2] - YELLOW_TOP[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b)
    return img


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def draw_a(img, size, scale=0.62, tilt=-8):
    # Big red tilted "A" on a white circle, mirroring the wordmark.
    d = ImageDraw.Draw(img)
    cr = int(size * 0.36)
    cx = cy = size // 2
    d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=(255, 255, 255))
    font = ImageFont.truetype(FONT, int(size * scale))
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    bbox = ld.textbbox((0, 0), "A", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    ld.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1] - size * 0.02), "A", font=font, fill=RED + (255,))
    layer = layer.rotate(tilt, resample=Image.BICUBIC, center=(cx, cy))
    img.paste(layer, (0, 0), layer)
    return img


def icon(size, maskable=False, radius_frac=0.22):
    base = gradient(size)
    base = draw_a(base, size, scale=0.52 if maskable else 0.62)
    if maskable:
        return base
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), rounded_mask(size, int(size * radius_frac)))
    return out


icon(192).save(os.path.join(OUT, "icon-192.png"))
icon(512).save(os.path.join(OUT, "icon-512.png"))
icon(512, maskable=True).save(os.path.join(OUT, "icon-512-maskable.png"))
icon(180, radius_frac=0).convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"))

# OG image 1200x630
og = Image.new("RGB", (1200, 630), (255, 249, 232))
d = ImageDraw.Draw(og)
badge = icon(260)
og.paste(badge, (90, 185), badge)
f_big = ImageFont.truetype(FONT, 92)
f_sub = ImageFont.truetype(FONT, 40)
d.text((410, 190), "playgrader", font=f_big, fill=DARK)
d.text((414, 310), "Snap. Grade. Parent like a pro.", font=f_sub, fill=(102, 102, 102))
f_small = ImageFont.truetype(FONT, 30)
d.text((414, 380), "Instant letter grades for kids' shows, snacks,", font=f_small, fill=(120, 120, 120))
d.text((414, 420), "toys, and books. Ages 2 to 5.", font=f_small, fill=(120, 120, 120))
og.save(os.path.join(OUT, "og-image.png"))
print("icons written to", os.path.abspath(OUT))
