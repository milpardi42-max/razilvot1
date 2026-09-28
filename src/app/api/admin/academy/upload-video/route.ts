import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withNoStore } from "@/lib/http";
import { clientIp, tooManyAttempts, recordAttempt, retryAfterSeconds } from "@/lib/rate-limit";
import { storePublicMedia } from "@/lib/media-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
// These are broadly supported by current browsers; AVI/MOV/MPEG/OGG were accepted
// before but many browsers cannot play them consistently without transcoding.
const VIDEO_TYPES = ["video/mp4", "video/webm"];
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, withNoStore({ status }));
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return fail("unauthorized", 401);

  const rateKey = `upload:${clientIp(req)}-academy`;
  if (tooManyAttempts(rateKey)) {
    const response = fail("too_many_attempts", 429);
    const retry = retryAfterSeconds(rateKey);
    if (retry > 0) response.headers.set("retry-after", String(retry));
    return response;
  }
  recordAttempt(rateKey);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("invalid_form_data", 400);
  }
  const file = form.get("file");
  const fileType = form.get("fileType") === "image" ? "image" : "video";
  if (!(file instanceof File)) return fail("missing_file", 400);

  const allowed = fileType === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  const maxBytes = fileType === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (!allowed.includes(file.type)) {
    return fail(fileType === "image" ? "unsupported_image_type" : "unsupported_video_type", 415, { allowed });
  }
  if (file.size > maxBytes) return fail("file_too_large", 413, { maxBytes });

  try {
    const saved = await storePublicMedia(Buffer.from(await file.arrayBuffer()), file.type);
    return NextResponse.json({ ok: true, url: saved.url, sizeBytes: file.size, mime: saved.mime }, withNoStore());
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_media_data") {
      return fail(fileType === "image" ? "invalid_image_data" : "invalid_video_data", 415);
    }
    console.error("[academy/upload-video] media storage error:", error);
    return fail("storage_error", 502);
  }
}
