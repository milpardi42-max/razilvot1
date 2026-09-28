/**
 * ساخت تصاویر جانشین (placeholder) برند — با sharp از SVG، بدون هیچ فونت سیستمی.
 *
 * چرا این فایل‌ها لازم‌اند؟
 *   اگر عکسی از هر دلیلی بارگذاری نشود (فایلِ نبوده، اینترنت کاربر قطع باشد، آدرس
 *   خارجی مسدود باشد)، مرورگر آیکون «تصویر شکسته» نشان می‌دهد. `MediaGuard`
 *   (src/components/media/MediaGuard.tsx) در این حالت این تصاویر را جایگزین می‌کند
 *   تا کاربر هیچ‌وقت تصویر شکسته نبیند.
 *
 * اجرا:  node scripts/generate-placeholders.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT_IMAGES = path.join(process.cwd(), "public", "images", "media");
const OUT_ARTISTS = path.join(process.cwd(), "public", "images", "artists");

/* پالت برند (هماهنگ با globals.css) */
const ACCENT = "#b5713a";
const ACCENT_SOFT = "#f6ede4";
const INK = "#1e2230";

/* نقش هندسی ملایم — بدون متن تا به فونت نیاز نباشد */
function patternDefs(id, colour, opacity = 0.18) {
  return `
    <pattern id="${id}" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="64" height="64" fill="none"/>
      <circle cx="16" cy="16" r="6" fill="${colour}" fill-opacity="${opacity}"/>
      <path d="M40 8l10 10-10 10-10-10z" fill="${colour}" fill-opacity="${opacity * 0.8}"/>
      <path d="M8 44h20M18 34v20" stroke="${colour}" stroke-opacity="${opacity * 0.75}" stroke-width="2" fill="none"/>
    </pattern>`;
}

/** مونوگرام انتزاعی «رزی» — چند قوس تودرتو، بدون حرف */
function monogram(cx, cy, scale, colour, opacity = 0.5) {
  return `
    <g transform="translate(${cx} ${cy}) scale(${scale})" fill="none" stroke="${colour}"
       stroke-opacity="${opacity}" stroke-width="7" stroke-linecap="round">
      <path d="M-58 42c0-46 26-72 58-72s58 26 58 72"/>
      <path d="M-30 42c0-26 13-42 30-42s30 16 30 42"/>
      <path d="M0 -58v104"/>
    </g>`;
}

/* ── ۱) تصویر جانشین عمومی ─────────────────────────────────────────────── */
const imagePlaceholder = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    ${patternDefs("p1", ACCENT, 0.16)}
    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ACCENT_SOFT}"/>
      <stop offset="1" stop-color="#efe3d6"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#g1)"/>
  <rect width="1200" height="800" fill="url(#p1)"/>
  <rect x="34" y="34" width="1132" height="732" fill="none" stroke="${ACCENT}" stroke-opacity="0.35" stroke-width="2" rx="18"/>
  <rect x="52" y="52" width="1096" height="696" fill="none" stroke="${ACCENT}" stroke-opacity="0.16" stroke-width="1" rx="12"/>
  ${monogram(600, 380, 2.1, ACCENT, 0.42)}
  <g fill="${ACCENT}" fill-opacity="0.32">
    <circle cx="600" cy="640" r="5"/>
    <circle cx="576" cy="640" r="5"/>
    <circle cx="624" cy="640" r="5"/>
  </g>
</svg>`;

/* ── ۲) تصویر جانشین ویدیو ─────────────────────────────────────────────── */
const videoPlaceholder = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    ${patternDefs("p2", "#ffffff", 0.06)}
    <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${INK}"/>
      <stop offset="1" stop-color="#2c3244"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#g2)"/>
  <rect width="1280" height="720" fill="url(#p2)"/>
  <g opacity="0.9">
    <circle cx="640" cy="360" r="104" fill="#ffffff" fill-opacity="0.06"/>
    <circle cx="640" cy="360" r="78" fill="none" stroke="${ACCENT}" stroke-opacity="0.65" stroke-width="3"/>
    <path d="M614 322l64 38-64 38z" fill="${ACCENT}" fill-opacity="0.95"/>
  </g>
  <g stroke="#ffffff" stroke-opacity="0.14" stroke-width="2">
    <path d="M120 600h1040"/>
    <path d="M120 620h1040"/>
  </g>
</svg>`;

/* ── ۳) جای‌نگهدار تصویر هنرمند (مربع) ─────────────────────────────────── */
const artistPlaceholder = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    ${patternDefs("p3", ACCENT, 0.1)}
    <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f7efe7"/>
      <stop offset="1" stop-color="#e9dccd"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g3)"/>
  <rect width="600" height="600" fill="url(#p3)"/>
  <g fill="${ACCENT}" fill-opacity="0.5">
    <circle cx="300" cy="240" r="86"/>
    <path d="M300 348c-86 0-150 58-158 152h316c-8-94-72-152-158-152z"/>
  </g>
</svg>`;

/* ── ۴) جای‌نگهدار کاور هنرمند (پهن) ──────────────────────────────────── */
const artistCoverPlaceholder = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600" viewBox="0 0 1600 600">
  <defs>
    ${patternDefs("p4", ACCENT, 0.14)}
    <linearGradient id="g4" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#efe3d6"/>
      <stop offset="0.55" stop-color="#f7efe7"/>
      <stop offset="1" stop-color="#e6d5c3"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="600" fill="url(#g4)"/>
  <rect width="1600" height="600" fill="url(#p4)"/>
  <path d="M0 470c220-90 420 40 640-30s480-140 960-40v200H0z" fill="${ACCENT}" fill-opacity="0.14"/>
  <path d="M0 520c260-80 460 30 700-40s440-130 900-50v170H0z" fill="${ACCENT}" fill-opacity="0.1"/>
</svg>`;

async function write(svg, target, format) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const pipeline = sharp(Buffer.from(svg));
  const data =
    format === "jpeg"
      ? await pipeline.jpeg({ quality: 86, mozjpeg: true, progressive: true }).toBuffer()
      : await pipeline.png({ compressionLevel: 9 }).toBuffer();
  await fs.writeFile(target, data);
  return data.byteLength;
}

const results = [
  ["placeholder.png", await write(imagePlaceholder, path.join(OUT_IMAGES, "placeholder.png"), "png")],
  ["placeholder-video.png", await write(videoPlaceholder, path.join(OUT_IMAGES, "placeholder-video.png"), "png")],
  ["artists/placeholder.jpg", await write(artistPlaceholder, path.join(OUT_ARTISTS, "placeholder.jpg"), "jpeg")],
  ["artists/cover-placeholder.jpg", await write(artistCoverPlaceholder, path.join(OUT_ARTISTS, "cover-placeholder.jpg"), "jpeg")],
];

for (const [name, bytes] of results) {
  console.log(`✓ public/images/${name} — ${(bytes / 1024).toFixed(1)} KB`);
}
