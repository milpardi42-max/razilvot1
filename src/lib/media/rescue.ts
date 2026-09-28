import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { assertPublicUrl } from "./guard";
import { contentTypeFor, extensionFor } from "./mime";
import type { MediaKind } from "./url";

/**
 * «نجات» مدیای بیرونی — قلب تضمین «هیچ عکس/ویدیوی شکسته‌ای در ایران».
 *
 * اگر محتوایی به آدرسی بیرون از سایت اشاره کند (لینک قدیمی Cloudinary، Vercel
 * Blob، هر CDN دیگر)، سرور یک‌بار فایل را می‌گیرد، روی دیسک خودمان ذخیره می‌کند
 * و از آن به بعد همیشه از `‎/api/media/remote-cache/…` سرو می‌شود؛ یعنی از دامنه‌ی
 * خود سایت و بدون هیچ وابستگی به هاست خارجی.
 *
 * امنیت:
 *   · اعتبارسنجی مقصد با `assertPublicUrl` (فقط http/https، پورت ۸۰/۴۴۳، بدون
 *     IP خصوصی/داخلی → جلوگیری از SSRF). برای تست می‌توان `validate` را تزریق
 *     کرد، ولی روت همیشه از همان نگهبان پیش‌فرض استفاده می‌کند.
 *   · ریدایرکت‌ها دوباره اعتبارسنجی می‌شوند (حداکثر ۳ پرش).
 *   · فقط `image/*` و `video/*` پذیرفته می‌شود.
 *   · سقف حجم هنگام نوشتن اعمال می‌شود (استریم، بدون بافر کل فایل در حافظه).
 */

export const CACHE_PREFIX = "remote-cache";

export const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 300 * 1024 * 1024;

/** مسیر ریشه‌ی کش (تابع است تا تست بتواند `cwd` را عوض کند). */
export function cacheRoot(): string {
  return path.join(process.cwd(), "data", "media", CACHE_PREFIX);
}

export function cacheKeyFor(url: string, ext: string): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 32);
  return `${CACHE_PREFIX}/${hash}.${ext}`;
}

export function extensionFromUrl(url: URL): string | null {
  const name = url.pathname.split("/").pop() ?? "";
  if (!name.includes(".")) return null;
  return name.split(".").pop()?.toLowerCase() || null;
}

/** پسوند نهایی: اول از Content-Type، بعد از خود آدرس — فقط اگر تصویر/ویدیو باشد. */
export function pickExtension(url: URL, contentType: string | null, kind: MediaKind): string | null {
  const byType = contentType ? extensionFor(contentType) : null;
  const byUrl = extensionFromUrl(url);
  const candidate = byType ?? byUrl;
  if (!candidate) return null;
  const type = contentTypeFor(`x.${candidate}`);
  const expected = kind === "video" ? "video/" : "image/";
  return type.startsWith(expected) ? candidate : null;
}

export interface RescueOptions {
  src: string;
  kind: MediaKind;
  /** پیش‌فرض: نگهبان SSRF؛ تست می‌تواند نسخه‌ی سست‌تری تزریق کند. */
  validate?: (raw: string) => Promise<URL>;
  maxBytes?: number;
  signal?: AbortSignal;
}

export interface RescueResult {
  key: string;
  type: string;
  bytes: number;
  /** از قبل در کش بود و فقط سرو شد. */
  cached: boolean;
}

export async function rescueRemoteMedia(options: RescueOptions): Promise<RescueResult> {
  const { src, kind } = options;
  const validate = options.validate ?? assertPublicUrl;
  const maxBytes = options.maxBytes ?? (kind === "video" ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES);

  const url = await validate(src);

  /* کش — همان آدرس، همان فایل. */
  const guessExt = extensionFromUrl(url) ?? (kind === "video" ? "mp4" : "jpg");
  const guessedKey = cacheKeyFor(url.toString(), guessExt);
  const guessedFile = path.join(cacheRoot(), path.basename(guessedKey));
  const cacheHit = await fs
    .stat(guessedFile)
    .then((stat) => stat.isFile() && stat.size > 0)
    .catch(() => false);
  if (cacheHit) {
    const type = await fs
      .readFile(path.join(cacheRoot(), `${path.basename(guessedKey)}.meta`), "utf8")
      .then((value) => value.trim())
      .catch(() => contentTypeFor(guessedKey));
    return { key: guessedKey, type, bytes: (await fs.stat(guessedFile)).size, cached: true };
  }

  /* دانلود با اعتبارسنجی هر پرش ریدایرکت. */
  let target = url;
  let response: Response | null = null;
  for (let hop = 0; hop < 4; hop += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      response = await fetch(target, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "RosieAtelier/1.0 (+self-hosted media rescue)",
          accept: "image/*,video/*,*/*;q=0.5",
        },
      });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("bad_redirect");
      target = await validate(new URL(location, target).toString());
      response = null;
      continue;
    }
    break;
  }
  if (!response || !response.ok) throw new Error("upstream_failed");

  const declaredType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const expected = kind === "video" ? "video/" : "image/";
  const urlType = (() => {
    const ext = extensionFromUrl(target);
    return ext ? contentTypeFor(`x.${ext}`) : "";
  })();
  if (declaredType && !declaredType.startsWith(expected) && !urlType.startsWith(expected)) {
    throw new Error("bad_content_type");
  }

  const ext = pickExtension(target, declaredType || null, kind) ?? (kind === "video" ? "mp4" : "jpg");
  const type = declaredType.startsWith(expected) ? declaredType : contentTypeFor(`x.${ext}`);

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength && declaredLength > maxBytes) throw new Error("too_large");

  const body = response.body;
  if (!body) throw new Error("empty_body");

  const key = cacheKeyFor(url.toString(), ext);
  const finalFile = path.join(cacheRoot(), path.basename(key));
  await fs.mkdir(cacheRoot(), { recursive: true });
  const tempFile = `${finalFile}.${Date.now().toString(36)}.part`;

  const handle = await fs.open(tempFile, "w");
  let written = 0;
  try {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      written += value.byteLength;
      if (written > maxBytes) throw new Error("too_large");
      await handle.write(Buffer.from(value));
    }
    if (written === 0) throw new Error("empty_body");
  } catch (error) {
    await handle.close().catch(() => undefined);
    await fs.unlink(tempFile).catch(() => undefined);
    throw error;
  }
  await handle.close();

  await fs.writeFile(`${finalFile}.meta`, type, "utf8");
  await fs.rename(tempFile, finalFile);

  return { key, type, bytes: written, cached: false };
}
