import "server-only";
import { promises as fs, createReadStream } from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { s3Config, signedFetch, type S3Config } from "@/lib/marketplace/sigv4";
import { contentTypeFor } from "@/lib/media/mime";

export { contentTypeFor, extensionFor } from "@/lib/media/mime";

/**
 * استور عمومی مدیا (عکس و ویدیو) — ایرانی‌محور.
 *
 * ─ چرا این ماژول جدا از بقیه‌ی آپلودها وجود دارد؟ ─────────────────────────
 * قبلاً آپلودها اول به Cloudinary و بعد Vercel Blob می‌رفتند و فقط در نبود
 * آن‌ها روی دیسک می‌نشستند. هر دو سرویس بیرون از ایران‌اند (و `api.cloudinary.com`
 * بدون فیلترشکن جواب نمی‌دهد) — یعنی کاربر ایرانی یا فایل را آپلود نمی‌کرد یا
 * فایل آپلودشده را در سایت به‌صورت شکسته می‌دید.
 *
 * حالا ترتیب دقیقاً برعکس است:
 *
 *   1. `local` (پیش‌فرض) → `<cwd>/data/media/...`
 *      · پشت همان دامنه‌ی سایت سرو می‌شود (`/api/media/...`)
 *      · `scripts/preserve-data.mjs` کل `data/` را میان بیلدها حفظ می‌کند، پس
 *        آپلودها با هر دیپلوی پاک نمی‌شوند.
 *   2. `s3` → هر سرویس S3-سازگار ایرانی (آروان‌کلود، لیارا، پارس‌پک، ابزار ابری)
 *      یا MinIO داخلی، از طریق `MEDIA_S3_*` (یا همان `MARKETPLACE_S3_*`).
 *      فایل‌ها همیشه از دامنه‌ی خودمان (`/api/media/...`) سرو می‌شوند تا حتی اگر
 *      دامنه‌ی باکت مسدود بود، نمایش سایت خراب نشود.
 *
 * سرویس‌های خارجی (Cloudinary / Vercel Blob) فقط با پرچم صریح
 * `MEDIA_ALLOW_FOREIGN_CDN=1` استفاده می‌شوند و در حالت پیش‌فرض کنار گذاشته‌اند.
 */

export type MediaBackend = "local" | "s3";

const LOCAL_ROOT = path.join(process.cwd(), "data", "media");

export const MEDIA_PREFIX = "/api/media/";

/* ─────────────────────────── backend selection ─────────────────────────── */

function mediaS3Config(): S3Config | null {
  // ادمین می‌تواند برای مدیا باکت جدا بدهد؛ در غیر این صورت همان باکت را استفاده کن.
  const override = {
    bucket: process.env.MEDIA_S3_BUCKET,
    accessKeyId: process.env.MEDIA_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.MEDIA_S3_SECRET_ACCESS_KEY,
    region: process.env.MEDIA_S3_REGION,
    endpoint: process.env.MEDIA_S3_ENDPOINT,
  };
  const hasOverride = Boolean(override.bucket && override.accessKeyId && override.secretAccessKey);

  if (hasOverride) {
    const endpoint = override.endpoint?.trim();
    return {
      bucket: override.bucket!.trim(),
      region: override.region?.trim() || "us-east-1",
      accessKeyId: override.accessKeyId!.trim(),
      secretAccessKey: override.secretAccessKey!.trim(),
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: Boolean(endpoint) || process.env.MEDIA_S3_FORCE_PATH_STYLE === "1",
    };
  }
  return s3Config();
}

/** درخواست امضاشده به S3 را می‌فرستد (`signedFetch` فقط امضا می‌سازد). */
async function s3Fetch(
  config: S3Config,
  method: "GET" | "PUT" | "HEAD" | "DELETE",
  key: string,
  options: { body?: Buffer | string; headers?: Record<string, string> } = {},
): Promise<Response> {
  const { url, headers } = signedFetch(config, method, key, options);
  return fetch(url, {
    method,
    headers,
    cache: "no-store",
    ...(options.body === undefined
      ? {}
      : { body: typeof options.body === "string" ? options.body : new Uint8Array(options.body) }),
  });
}

export function mediaBackend(): MediaBackend {
  return mediaS3Config() ? "s3" : "local";
}

export function mediaBackendName(): string {
  const backend = mediaBackend();
  if (backend === "local") return "local (data/media)";
  const config = mediaS3Config();
  return `s3 (${config?.endpoint ?? "aws"} / ${config?.bucket})`;
}

/** آیا سرویس خارجی (Cloudinary/Vercel Blob) اجازه‌ی استفاده دارد؟ پیش‌فرض: نه. */
export function foreignCdnAllowed(): boolean {
  return process.env.MEDIA_ALLOW_FOREIGN_CDN === "1";
}

/* ─────────────────────────────── keys ─────────────────────────────────── */

/** کلید امن و تخت: بدون `..`، بدون کاراکتر کنترلی، بدون مسیر مطلق. */
export function sanitizeKey(rawKey: string): string | null {
  const cleaned = rawKey
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map((segment) => segment.replace(/[^\w.\-()\u0600-\u06FF ]+/g, "-"))
    .join("/");
  if (!cleaned || cleaned.length > 300) return null;
  if (cleaned.startsWith(".")) return null;
  return cleaned;
}

/** نام فایل یکتا و «immutable» — پس کش طولانی‌مدت امن است. */
export function buildMediaKey(folder: string, originalName: string, ext?: string): string {
  const safeFolder = sanitizeKey(folder) ?? "uploads";
  const base = path
    .basename(originalName || "file")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\u0600-\u06FF-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "file";
  const stamp = `${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
  const finalExt = (ext ?? path.extname(originalName).replace(".", "") ?? "bin").toLowerCase();
  return `${safeFolder}/${base}-${stamp}.${finalExt}`;
}

/** آدرس هم‌دامنه برای نمایش در سایت (بدون هیچ هاست خارجی). */
export function mediaUrl(key: string): string {
  return `${MEDIA_PREFIX}${key.split("/").map(encodeURIComponent).join("/")}`;
}

/* ─────────────────────────────── local ───────────────────────────────── */

function localPath(key: string): string | null {
  const safe = sanitizeKey(key);
  if (!safe) return null;
  const full = path.join(LOCAL_ROOT, safe);
  // محافظت نهایی: مسیر نهایی باید زیر LOCAL_ROOT بماند.
  if (!full.startsWith(LOCAL_ROOT)) return null;
  return full;
}

export async function putMedia(
  key: string,
  data: Buffer,
  contentType?: string,
): Promise<{ key: string; url: string; bytes: number }> {
  const safe = sanitizeKey(key);
  if (!safe) throw new Error("invalid_media_key");
  const type = contentType ?? contentTypeFor(safe);

  const config = mediaS3Config();
  if (config) {
    const response = await s3Fetch(config, "PUT", safe, { body: data, headers: { "content-type": type } });
    if (!response.ok) throw new Error(`s3_put_${response.status}`);
  } else {
    const target = localPath(safe)!;
    await fs.mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, target);
  }

  // یک فایل `.type` کوچک نگه می‌داریم تا هنگام سرو، نوع محتوا گم نشود
  // (پسوندها همیشه کافی نیستند).
  if (mediaBackend() === "local") {
    const meta = localPath(`${safe}.meta`);
    if (meta) {
      await fs.writeFile(meta, type, "utf8").catch(() => undefined);
    }
  } else {
    await s3Fetch(mediaS3Config()!, "PUT", `${safe}.meta`, {
      body: type,
      headers: { "content-type": "text/plain" },
    }).catch(() => undefined);
  }

  return { key: safe, url: mediaUrl(safe), bytes: data.byteLength };
}

export interface MediaObject {
  body: ReadableStream<Uint8Array> | null;
  /** حجم کل فایل (برای `Content-Range` ویدیو لازم است، نه حجم تکه). */
  size: number;
  /** حجم همین پاسخ (تکه در درخواست‌های Range، وگرنه برابر `size`). */
  length: number;
  type: string;
  /** برای درخواست‌های Range */
  range?: { start: number; end: number };
}

async function readStoredType(key: string): Promise<string | null> {
  if (mediaBackend() === "local") {
    const meta = localPath(`${key}.meta`);
    if (!meta) return null;
    try {
      return (await fs.readFile(meta, "utf8")).trim() || null;
    } catch {
      return null;
    }
  }
  try {
    const response = await s3Fetch(mediaS3Config()!, "GET", `${key}.meta`);
    if (!response.ok) return null;
    return (await response.text()).trim() || null;
  } catch {
    return null;
  }
}

export async function getMedia(
  key: string,
  range?: { start: number; end?: number },
): Promise<MediaObject | null> {
  const safe = sanitizeKey(key);
  if (!safe) return null;
  const storedType = (await readStoredType(safe)) ?? contentTypeFor(safe);

  if (mediaBackend() === "s3") {
    const response = await s3Fetch(mediaS3Config()!, "GET", safe, {
      ...(range ? { headers: { range: `bytes=${range.start}-${range.end ?? ""}` } } : {}),
    });
    if (!response.ok && response.status !== 206) return null;

    const lengthHeader = Number(response.headers.get("content-length") ?? 0);
    const rangeHeader = response.headers.get("content-range");
    const total = rangeHeader ? Number(rangeHeader.split("/").pop()) : lengthHeader;
    const size = Number.isFinite(total) && total > 0 ? total : lengthHeader;

    return {
      body: response.body as ReadableStream<Uint8Array> | null,
      size,
      length: Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : size,
      type: response.headers.get("content-type") ?? storedType,
      ...(range ? { range: { start: range.start, end: range.end ?? Math.max(0, size - 1) } } : {}),
    };
  }

  const target = localPath(safe);
  if (!target) return null;
  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  const start = range ? Math.max(0, Math.min(range.start, stat.size - 1)) : 0;
  const end = range ? (range.end === undefined ? stat.size - 1 : Math.min(range.end, stat.size - 1)) : stat.size - 1;
  const stream = range ? createReadStream(target, { start, end }) : createReadStream(target);

  return {
    body: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
    size: stat.size,
    length: end - start + 1,
    type: storedType,
    ...(range ? { range: { start, end } } : {}),
  };
}

export async function mediaExists(key: string): Promise<boolean> {
  const safe = sanitizeKey(key);
  if (!safe) return false;
  if (mediaBackend() === "s3") {
    const response = await s3Fetch(mediaS3Config()!, "HEAD", safe);
    return response.ok;
  }
  const target = localPath(safe);
  if (!target) return false;
  return fs
    .stat(target)
    .then((stat) => stat.isFile())
    .catch(() => false);
}

export async function deleteMedia(key: string): Promise<boolean> {
  const safe = sanitizeKey(key);
  if (!safe) return false;
  if (mediaBackend() === "s3") {
    const response = await s3Fetch(mediaS3Config()!, "DELETE", safe);
    await s3Fetch(mediaS3Config()!, "DELETE", `${safe}.meta`).catch(() => undefined);
    return response.ok;
  }
  const target = localPath(safe);
  if (!target) return false;
  try {
    await fs.unlink(target);
    await fs.unlink(`${target}.meta`).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
