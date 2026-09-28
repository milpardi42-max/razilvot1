import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withNoStore } from "@/lib/http";
import {
  appendMessage,
  deleteConversation,
  getConversation,
  markRead,
  setConversationStatus,
  toSummary,
} from "@/lib/data/chat";

export const dynamic = "force-dynamic";

/**
 * /api/admin/chat/:id — پاسخ‌دادن به یک گفت‌وگو از پنل ادمین.
 *
 *   GET    → گفت‌وگوی کامل (و علامت‌گذاری پیام‌های بازدیدکننده به‌عنوان خوانده‌شده)
 *   POST   { body }                → ارسال پاسخ پشتیبانی
 *   PATCH  { status: open|closed } → بستن یا بازکردن گفت‌وگو
 *   DELETE                         → حذف گفت‌وگو
 */

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

const unauthorized = () =>
  NextResponse.json({ ok: false, error: "unauthorized" }, withNoStore({ status: 401 }));

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "not_found" }, withNoStore({ status: 404 }));
  }

  // باز کردن گفت‌وگو در پنل = دیدن پیام‌ها.
  if (conversation.unreadForAdmin > 0) await markRead(id, "admin");

  return NextResponse.json(
    { ok: true, conversation: { ...conversation, unreadForAdmin: 0 } },
    withNoStore(),
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { body?: string } | null;
  const text = body?.body ?? "";
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ ok: false, error: "empty_message" }, withNoStore({ status: 400 }));
  }

  const conversation = await appendMessage(id, {
    role: "admin",
    author: session.name || "پشتیبانی",
    body: text,
  });
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "not_found" }, withNoStore({ status: 404 }));
  }

  return NextResponse.json({ ok: true, conversation }, withNoStore());
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as
    | { status?: string; markRead?: boolean }
    | null;

  if (body?.markRead) await markRead(id, "admin");

  if (body?.status === "open" || body?.status === "closed") {
    const ok = await setConversationStatus(id, body.status);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "not_found" }, withNoStore({ status: 404 }));
    }
  } else if (body?.status) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, withNoStore({ status: 400 }));
  }

  const conversation = await getConversation(id);
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "not_found" }, withNoStore({ status: 404 }));
  }
  return NextResponse.json(
    { ok: true, conversation, summary: toSummary(conversation) },
    withNoStore(),
  );
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await params;
  const ok = await deleteConversation(id);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "not_found" }, withNoStore({ status: 404 }));
  }
  return NextResponse.json({ ok: true }, withNoStore());
}
