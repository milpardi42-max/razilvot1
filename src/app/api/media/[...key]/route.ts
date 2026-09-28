import { NextResponse } from "next/server";
import { serveMediaKey } from "@/lib/media/serve";
import { getMedia, mediaUrl, sanitizeKey } from "@/lib/media/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET/HEAD `/api/media/<key>` — سرو عمومی عکس و ویدیوی آپلودشده.
 *
 * چرا از یک روت خودمان سرو می‌شود و نه از دیسک `public/`؟
 *   · فایل‌های `public/` در هر بیلد از مخزن روی نسخه‌ی استند‌الون کپی می‌شوند و
 *     آپلودهای کاربر پاک می‌شدند؛ این روت از `data/media` می‌خواند که اسکریپت
 *     `preserve-data` میان بیلدها نگهش می‌دارد.
 *   · همه‌چیز از دامنه‌ی خود سایت می‌آید؛ هیچ هاست خارجی (تأخیر یا فیلتر) در مسیر
 *     نمایش تصویر و ویدیو وجود ندارد.
 */

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const joined = (key ?? []).map((segment) => decodeURIComponent(segment)).join("/");
  return serveMediaKey(request, joined);
}

export async function HEAD(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const safeKey = sanitizeKey((key ?? []).map((segment) => decodeURIComponent(segment)).join("/"));
  if (!safeKey) return new NextResponse(null, { status: 400 });

  const object = await getMedia(safeKey);
  if (!object) return new NextResponse(null, { status: 404 });

  return new NextResponse(null, {
    status: 200,
    headers: {
      "content-type": object.type,
      "content-length": String(object.size),
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      // آدرس عمومی برای ابزارهای بررسی
      "x-media-url": mediaUrl(safeKey),
    },
  });
}
