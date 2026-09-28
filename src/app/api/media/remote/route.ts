import { NextResponse } from "next/server";
import { rescueRemoteMedia } from "@/lib/media/rescue";
import { serveMediaKey } from "@/lib/media/serve";
import { MEDIA_PLACEHOLDER_IMAGE, MEDIA_PLACEHOLDER_VIDEO, type MediaKind } from "@/lib/media/url";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET `/api/media/remote?src=<url>&kind=image|video`
 *
 * «نجات» مدیای بیرونی: سرور یک‌بار فایل را از آدرس بیرونی می‌گیرد (با نگهبان
 * SSRF)، روی دامنه‌ی خودمان در `data/media/remote-cache` ذخیره می‌کند و بلافاصله
 * با پشتیبانی `Range` سرو می‌کند. از آن به بعد همان آدرس از کش محلی پاسخ
 * می‌گیرد — یعنی تصویر/ویدیو با لوکیشن ایران و بدون فیلترشکن نمایش داده می‌شود.
 *
 * اگر هر مرحله شکست بخورد **هیچ‌وقت** پاسخ شکسته داده نمی‌شود: درخواست‌های تصویری
 * به تصویر جانشین برند ریدایرکت می‌شوند (بدون کش تا دفعه‌ی بعد دوباره تلاش شود)
 * و درخواست‌های ویدیویی به پوستر جانشین.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawSrc = searchParams.get("src") ?? "";
  const kind: MediaKind = searchParams.get("kind") === "video" ? "video" : "image";
  const fallback = kind === "video" ? MEDIA_PLACEHOLDER_VIDEO : MEDIA_PLACEHOLDER_IMAGE;

  if (!rawSrc) return NextResponse.redirect(new URL(fallback, request.url), 302);

  try {
    const rescued = await rescueRemoteMedia({ src: rawSrc, kind });
    return await serveMediaKey(request, rescued.key, {
      cacheControl: "public, max-age=86400, stale-while-revalidate=604800",
    });
  } catch {
    return NextResponse.redirect(new URL(fallback, request.url), 302);
  }
}
