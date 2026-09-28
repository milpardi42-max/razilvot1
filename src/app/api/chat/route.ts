import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withNoStore } from "@/lib/http";
import { clientIp, recordAttempt, retryAfterSeconds, tooManyAttempts } from "@/lib/rate-limit";
import {
  appendMessage,
  cleanText,
  getVisitorConversation,
  markRead,
  startConversation,
  toVisitorView,
} from "@/lib/data/chat";

export const dynamic = "force-dynamic";

/**
 * Live chat for site visitors.
 *
 *   POST { action: "start", visitorId, name?, email? }  → یک گفت‌وگو باز می‌کند
 *   POST { action: "send",  conversationId, token, body } → پیام بازدیدکننده
 *   GET  ?conversationId=…&token=…                      → پیام‌های گفت‌وگو
 *
 * Access control: a visitor only ever reaches the conversation it created, and
 * only with the secret token handed out at `start`. The token never leaves the
 * browser except on these two calls, and every response is `no-store`.
 */

const VISITOR_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function tooMany(key: string) {
  const wait = retryAfterSeconds(key);
  const response = NextResponse.json(
    { ok: false, error: "too_many_attempts", retryAfter: wait },
    withNoStore({ status: 429 }),
  );
  if (wait > 0) response.headers.set("Retry-After", String(wait));
  return response;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId") ?? "";
  const token = url.searchParams.get("token");

  if (!conversationId || !token) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, withNoStore({ status: 400 }));
  }

  const conversation = await getVisitorConversation(conversationId, token);
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "not_found" }, withNoStore({ status: 404 }));
  }

  /*
   * `read=1` یعنی پنل چت باز است و بازدیدکننده پیام‌ها را می‌بیند. polling پس‌زمینه
   * این پارامتر را نمی‌فرستد تا نشان «پاسخ خوانده‌نشده» روی آیکون از بین نرود.
   */
  const isRead = url.searchParams.get("read") === "1";
  if (isRead && conversation.unreadForVisitor > 0) {
    await markRead(conversation.id, "visitor");
  }

  return NextResponse.json(
    {
      ok: true,
      conversation: { ...toVisitorView(conversation), unreadForVisitor: isRead ? 0 : conversation.unreadForVisitor },
    },
    withNoStore(),
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
        action?: string;
        visitorId?: string;
        name?: string;
        email?: string;
        conversationId?: string;
        token?: string;
        body?: string;
        page?: string;
      }
    | null;

  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, withNoStore({ status: 400 }));
  }

  const action = body.action === "send" ? "send" : body.action === "start" ? "start" : null;
  if (!action) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, withNoStore({ status: 400 }));
  }

  const ip = clientIp(req);
  const session = await getSession();
  const identity = session ? session.email : ip;

  /* ── ارسال پیام ─────────────────────────────────────────────────────── */
  if (action === "send") {
    const key = `chat:${identity}`;
    if (tooManyAttempts(key)) return tooMany(key);

    const conversation = await getVisitorConversation(body.conversationId ?? "", body.token);
    if (!conversation) {
      return NextResponse.json({ ok: false, error: "not_found" }, withNoStore({ status: 404 }));
    }
    if (conversation.status === "closed") {
      return NextResponse.json({ ok: false, error: "conversation_closed" }, withNoStore({ status: 409 }));
    }

    recordAttempt(key);
    const updated = await appendMessage(conversation.id, {
      role: "visitor",
      author: conversation.name || "مهمان",
      body: body.body ?? "",
    });
    if (!updated) {
      return NextResponse.json({ ok: false, error: "empty_message" }, withNoStore({ status: 400 }));
    }
    return NextResponse.json({ ok: true, conversation: toVisitorView(updated) }, withNoStore());
  }

  /* ── شروع گفت‌وگو ───────────────────────────────────────────────────── */
  const key = `chat-start:${identity}`;
  if (tooManyAttempts(key)) return tooMany(key);

  const visitorId = cleanText(body.visitorId, 64);
  const name = cleanText(body.name, 60);
  const email = cleanText(body.email, 120).toLowerCase();

  if (!VISITOR_ID_RE.test(visitorId)) {
    return NextResponse.json({ ok: false, error: "invalid_visitor" }, withNoStore({ status: 400 }));
  }
  if (name.length < 2) {
    return NextResponse.json({ ok: false, error: "invalid_name" }, withNoStore({ status: 400 }));
  }
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, withNoStore({ status: 400 }));
  }

  recordAttempt(key);
  const conversation = await startConversation({
    visitorId,
    name: session?.name ? cleanText(session.name, 60) : name,
    ...(email || session?.email ? { email: email || session!.email } : {}),
    ...(body.page ? { page: cleanText(body.page, 200) } : {}),
    userAgent: cleanText(req.headers.get("user-agent"), 200),
    ...(session ? { userId: session.id } : {}),
  });

  const created = await getVisitorConversation(conversation.id, conversation.token);
  return NextResponse.json(
    {
      ok: true,
      // توکن فقط در همین یک پاسخ به بازدیدکننده داده می‌شود.
      token: conversation.token,
      conversation: toVisitorView(created ?? conversation),
    },
    withNoStore(),
  );
}
