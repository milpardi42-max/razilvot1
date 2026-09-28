/**
 * ابزارهای سمت کلاینت برای آدرس مدیا.
 *
 * هدف: هیچ عکسی در سایت «شکسته» دیده نشود.
 *   · هر آدرس خارجی (http/https) به مسیر هم‌دامنه‌ی خودمان (`/api/media/remote`)
 *     تبدیل می‌شود تا سرور آن را یک‌بار بگیرد، روی دامنه‌ی خودمان ذخیره کند و
 *     بعد از آن همیشه از ایران و بدون فیلترشکن باز شود.
 *   · آدرس خالی یا نامعتبر → تصویر جانشین برند.
 */

export const MEDIA_PLACEHOLDER_IMAGE = "/images/media/placeholder.png";
export const MEDIA_PLACEHOLDER_VIDEO = "/images/media/placeholder-video.png";

/** مسیر پروکسی مدیای خارجی (سرور آن را در `data/media/remote` کش می‌کند). */
export const REMOTE_MEDIA_PATH = "/api/media/remote";

export type MediaKind = "image" | "video";

/** آدرس بیرونی؟ (http، https یا //host) */
export function isExternalMediaSrc(src: unknown): src is string {
  return typeof src === "string" && /^(https?:)?\/\//i.test(src.trim());
}

/** آدرسی که خودمان میزبانی می‌کنیم و تضمینی در ایران باز می‌شود. */
export function isSelfHostedSrc(src: unknown): src is string {
  return (
    typeof src === "string" &&
    (src.startsWith("/api/media/") || src.startsWith("/images/") || src.startsWith("/videos/") || src.startsWith("data:") || src.startsWith("blob:"))
  );
}

export function proxiedMediaSrc(src: string, kind: MediaKind = "image"): string {
  return `${REMOTE_MEDIA_PATH}?src=${encodeURIComponent(src.trim())}&kind=${kind}`;
}

/**
 * آدرسی که در نهایت به `<img>`/`<video>` داده می‌شود.
 *
 * `fallback` می‌تواند برای هر نوعی جداگانه داده شود؛ پیش‌فرض: جانشین برند.
 */
export function resolveMediaSrc(
  src: unknown,
  options: { kind?: MediaKind; fallback?: string } = {},
): string {
  const kind = options.kind ?? "image";
  const fallback = options.fallback ?? (kind === "video" ? MEDIA_PLACEHOLDER_VIDEO : MEDIA_PLACEHOLDER_IMAGE);

  if (typeof src !== "string") return fallback;
  const value = src.trim();
  if (!value) return fallback;
  if (isExternalMediaSrc(value)) return proxiedMediaSrc(value, kind);
  return value;
}

/** آیا این آدرس باید بدون بهینه‌سازی `next/image` سرو شود؟ */
export function needsUnoptimized(src: unknown): boolean {
  return typeof src === "string" && (src.startsWith("/api/media/") || src.startsWith("data:") || src.startsWith("blob:"));
}
