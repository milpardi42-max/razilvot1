/**
 * نقشه‌ی نوع محتوا ↔ پسوند.
 *
 * برای سرو درست ویدیو و تصویر حیاتی است: اگر `Content-Type` غلط باشد مرورگر
 * تصویر را نشان نمی‌دهد یا ویدیو را پخش نمی‌کند (فایل سالم است ولی «شکسته»
 * به نظر می‌رسد).
 */
/** نوع محتوا بر اساس پسوند — مرورگر برای پخش ویدیو به این هدرها تکیه می‌کند. */
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mpeg: "video/mpeg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
};

export function contentTypeFor(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export function extensionFor(mime: string): string | null {
  const entry = Object.entries(CONTENT_TYPES).find(([, type]) => type === mime);
  return entry ? entry[0] : null;
}
