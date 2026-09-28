import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withNoStore } from "@/lib/http";
import { chatStats, listConversationSummaries } from "@/lib/data/chat";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/chat
 *
 * صندوق ورودی چت برای پنل ادمین: فهرست گفت‌وگوها (بدون توکن دسترسی) + آمار
 * برای نشان منو. `?stats=1` فقط آمار را برمی‌گرداند (poll سبک برای badge).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, withNoStore({ status: 401 }));
  }

  const stats = await chatStats();
  if (new URL(req.url).searchParams.get("stats") === "1") {
    return NextResponse.json({ ok: true, stats }, withNoStore());
  }

  const conversations = await listConversationSummaries();
  return NextResponse.json({ ok: true, conversations, stats }, withNoStore());
}
