import { NextResponse } from "next/server";
import { parseRange } from "@/lib/media/range";
import { getMedia, sanitizeKey } from "@/lib/media/store";

/**
 * منطق مشترک سرو فایل‌های مدیا — هم برای آپلودهای خودمان (`/api/media/<key>`) و
 * هم برای مدیای بیرونی که روی دامنه‌ی خودمان کش شده است.
 */

export interface ServeOptions {
  /** `public, max-age=31536000, immutable` برای فایل‌های نام‌تغییرپذیر. */
  cacheControl?: string;
  /** در صورت نبود فایل، به این آدرس هم‌دامنه ریدایرکت کن (تصویر جانشین). */
  fallbackRedirect?: string;
}

export async function serveMediaKey(
  request: Request,
  rawKey: string,
  options: ServeOptions = {},
): Promise<NextResponse | Response> {
  const safeKey = sanitizeKey(rawKey);
  if (!safeKey) {
    return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
  }

  let object;
  try {
    object = await getMedia(safeKey);
  } catch {
    if (options.fallbackRedirect) return redirectToFallback(request, options.fallbackRedirect);
    return NextResponse.json({ ok: false, error: "storage_error" }, { status: 502 });
  }

  if (!object) {
    if (options.fallbackRedirect) return redirectToFallback(request, options.fallbackRedirect);
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const parsed = parseRange(rangeHeader, object.size);
    if (parsed && parsed.start > parsed.end) {
      return new NextResponse(null, {
        status: 416,
        headers: { "content-range": `bytes */${object.size}` },
      });
    }
    if (parsed) {
      try {
        object = await getMedia(safeKey, parsed);
      } catch {
        return NextResponse.json({ ok: false, error: "storage_error" }, { status: 502 });
      }
      if (!object) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
    }
  }

  const headers = new Headers({
    "content-type": object.type,
    "accept-ranges": "bytes",
    "cache-control": options.cacheControl ?? "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
  });

  if (object.range) {
    headers.set("content-length", String(object.length));
    headers.set("content-range", `bytes ${object.range.start}-${object.range.end}/${object.size}`);
    return new NextResponse(object.body, { status: 206, headers });
  }

  headers.set("content-length", String(object.length));
  return new NextResponse(object.body, { status: 200, headers });
}

/**
 * ریدایرکت به جانشین برند؛ `no-store` است تا اگر منبع لحظه‌ای در دسترس نبود،
 * دفعه‌ی بعد دوباره تلاش شود.
 */
export function redirectToFallback(request: Request, path: string): Response {
  return new NextResponse(null, {
    status: 302,
    headers: { location: new URL(path, request.url).toString(), "cache-control": "no-store" },
  });
}
