"use client";

import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/providers/AppProviders";
import { cn, faNum } from "@/lib/utils";

/**
 * چت آنلاین — آیکون شناور + پنل گفت‌وگو برای بازدیدکننده‌ی سایت.
 *
 * شناسه‌ی گفت‌وگو و توکن دسترسی در `localStorage` نگه داشته می‌شوند (بدون کوکی و
 * بدون حساب کاربری). ارسال و خواندن از طریق `/api/chat` انجام می‌شود؛ تا وقتی پنل
 * بسته است هر ۲۰ ثانیه و در حالت باز هر ۶ ثانیه یک‌بار پیام‌های تازه بررسی می‌شوند
 * تا نشان «پاسخ خوانده‌نشده» روی آیکون ظاهر شود. فقط وقتی پنل باز است (`read=1`)
 * پیام‌ها خوانده‌شده علامت می‌خورند.
 */

interface ChatMessageView {
  id: string;
  role: "visitor" | "admin";
  author: string;
  body: string;
  createdAt: string;
}

interface ChatConversationView {
  id: string;
  name: string;
  email: string;
  status: "open" | "closed";
  unreadForVisitor: number;
  messages: ChatMessageView[];
}

const STORAGE_KEY = "ra-chat";
const PROFILE_KEY = "ra-chat-profile";
const OPEN_POLL_MS = 6000;
const CLOSED_POLL_MS = 20000;

interface StoredChat {
  conversationId: string;
  token: string;
  visitorId: string;
}

interface StoredProfile {
  name: string;
  email: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage disabled — the chat still works for this session */
  }
}

function makeVisitorId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID().replace(/-/g, "");
    }
  } catch {
    /* fall through to the random fallback */
  }
  return `v${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function timeLabel(iso: string, fa: boolean) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(fa ? "fa-IR" : "en-US", { hour: "2-digit", minute: "2-digit" });
}

export function ChatWidget() {
  const { locale, dict } = useLocale();
  const pathname = usePathname();
  const fa = locale === "fa";

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [stored, setStored] = useState<StoredChat | null>(null);
  const [conversation, setConversation] = useState<ChatConversationView | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<"network" | "rate" | null>(null);
  const [unread, setUnread] = useState(0);
  /* فرم شروع گفت‌وگو */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const openRef = useRef(false);

  /* صفحه‌های تمام‌صفحه (پخش زنده) ویجت نمی‌گیرند */
  const hideForFullscreen = /\/academy\/[^/]+\/(live|broadcast)\/?$/.test(pathname);

  useEffect(() => {
    setMounted(true);
    const profile = readJson<StoredProfile>(PROFILE_KEY);
    if (profile) {
      setName(profile.name ?? "");
      setEmail(profile.email ?? "");
    }
    const saved = readJson<StoredChat>(STORAGE_KEY);
    if (saved?.conversationId && saved.token && saved.visitorId) setStored(saved);
  }, []);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  /* ── خواندن گفت‌وگو ──────────────────────────────────────────────────── */
  const loadConversation = useCallback(async (options: { silent?: boolean; read?: boolean } = {}) => {
    const current = readJson<StoredChat>(STORAGE_KEY);
    if (!current?.conversationId || !current.token) return;
    const requestId = ++requestRef.current;
    if (!options.silent) setLoading(true);

    try {
      const query = new URLSearchParams({
        conversationId: current.conversationId,
        token: current.token,
      });
      if (options.read) query.set("read", "1");

      const response = await fetch(`/api/chat?${query.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (response.status === 404) {
        // گفت‌وگو در سرور وجود ندارد (حذف‌شده) — از صفر شروع می‌کنیم.
        window.localStorage.removeItem(STORAGE_KEY);
        setStored(null);
        setConversation(null);
        setUnread(0);
        return;
      }
      if (!response.ok) throw new Error("load_failed");

      const data = (await response.json()) as { conversation: ChatConversationView };
      if (requestId !== requestRef.current) return;
      setConversation(data.conversation);
      setUnread(options.read ? 0 : (data.conversation.unreadForVisitor ?? 0));
      setError(null);
    } catch {
      if (!options.silent) setError("network");
    } finally {
      if (!options.silent && requestId === requestRef.current) setLoading(false);
    }
  }, []);

  /* بارگذاری اولیه‌ی گفت‌وگوی ذخیره‌شده */
  useEffect(() => {
    if (!mounted || !stored) return;
    void loadConversation();
  }, [mounted, stored, loadConversation]);

  /* ── polling ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!mounted || !stored || hideForFullscreen) return;
    const interval = window.setInterval(
      () => void loadConversation({ silent: true, read: openRef.current }),
      open ? OPEN_POLL_MS : CLOSED_POLL_MS,
    );
    return () => window.clearInterval(interval);
  }, [mounted, stored, open, hideForFullscreen, loadConversation]);

  /* اسکرول به آخرین پیام */
  useEffect(() => {
    if (!open) return;
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [open, conversation?.messages.length]);

  /* بستن با Esc */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openPanel = useCallback(() => {
    setOpen(true);
    void loadConversation({ silent: true, read: true });
    window.setTimeout(() => inputRef.current?.focus(), 260);
  }, [loadConversation]);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setStored(null);
    setConversation(null);
    setUnread(0);
    setDraft("");
  }, []);

  /* ── ارسال پیام ──────────────────────────────────────────────────────── */
  const sendTo = useCallback(
    async (conversationId: string, token: string, body: string) => {
      /* خوش‌بینانه: پیام بلافاصله در فهرست ظاهر می‌شود */
      const optimistic: ChatMessageView = {
        id: `local-${Date.now()}`,
        role: "visitor",
        author: name || (fa ? "شما" : "You"),
        body,
        createdAt: new Date().toISOString(),
      };
      setConversation((prev) => (prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev));
      setDraft("");

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          body: JSON.stringify({ action: "send", conversationId, token, body }),
        });
        if (response.status === 429) {
          setError("rate");
          return;
        }
        if (!response.ok) throw new Error("send_failed");
        const data = (await response.json()) as { conversation: ChatConversationView };
        setConversation(data.conversation);
        setError(null);
        setUnread(0);
      } catch {
        setError("network");
        await loadConversation({ silent: true, read: true });
      }
    },
    [fa, loadConversation, name],
  );

  const send = useCallback(
    async (text: string) => {
      const body = text.trim();
      if (!body || busy) return;

      if (stored) {
        setBusy(true);
        try {
          await sendTo(stored.conversationId, stored.token, body);
        } finally {
          setBusy(false);
        }
        return;
      }

      /* اولین پیام: گفت‌وگو ساخته می‌شود و بعد پیام می‌رود */
      if (name.trim().length < 2) {
        // بدون نام نمی‌توان گفت‌وگو را ساخت — نشانگر را به فیلد نام ببر.
        nameRef.current?.focus();
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const visitorId = makeVisitorId();
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          body: JSON.stringify({ action: "start", visitorId, name, email, page: pathname }),
        });
        if (response.status === 429) {
          setError("rate");
          return;
        }
        if (!response.ok) throw new Error("start_failed");

        const data = (await response.json()) as { token: string; conversation: ChatConversationView };
        const record: StoredChat = { conversationId: data.conversation.id, token: data.token, visitorId };
        writeJson(STORAGE_KEY, record);
        writeJson(PROFILE_KEY, { name, email });
        setStored(record);
        setConversation(data.conversation);
        setError(null);
        await sendTo(data.conversation.id, data.token, body);
      } catch {
        setError("network");
      } finally {
        setBusy(false);
      }
    },
    [busy, email, name, pathname, sendTo, stored],
  );

  if (!mounted || hideForFullscreen) return null;

  const hasConversation = Boolean(stored);
  const messages = conversation?.messages ?? [];
  const closed = conversation?.status === "closed";

  const t = {
    button: fa ? "چت آنلاین با پشتیبانی" : "Chat with support",
    title: fa ? "چت آنلاین رزی آتلیه" : "Rosie Atelier live chat",
    subtitle: fa
      ? "پاسخ‌گویی در ساعات کاری · معمولاً کمتر از یک روز کاری"
      : "Replies during business hours · usually within one working day",
    close: dict.nav.close,
    greeting: fa ? "سلام! خوش آمدید 🌿" : "Hi there! Welcome 🌿",
    intro: fa ? "چطور می‌توانیم کمکتان کنیم؟" : "How can we help you?",
    introHint: fa
      ? "نامتان را بنویسید و پیام‌تان را بفرستید؛ پاسخ پشتیبانی همین‌جا نمایش داده می‌شود."
      : "Add your name and send a message — our reply shows up right here.",
    name: fa ? "نام شما" : "Your name",
    namePlaceholder: fa ? "مثلاً مریم" : "e.g. Maryam",
    email: fa ? "ایمیل (اختیاری، برای پیگیری)" : "Email (optional, for follow-up)",
    placeholder: fa ? "پیام‌تان را بنویسید…" : "Write your message…",
    send: fa ? "ارسال پیام" : "Send message",
    sending: fa ? "در حال ارسال…" : "Sending…",
    network: fa ? "ارتباط برقرار نشد. دوباره تلاش کنید." : "Connection failed. Please try again.",
    rate: fa ? "پیام‌های زیادی فرستادید؛ چند دقیقه بعد دوباره تلاش کنید." : "Too many messages — please try again in a few minutes.",
    support: fa ? "پشتیبانی رزی آتلیه" : "Rosie Atelier support",
    you: fa ? "شما" : "You",
    closed: fa ? "این گفت‌وگو بسته شده است." : "This conversation is closed.",
    newChat: fa ? "شروع گفت‌وگوی جدید" : "Start a new conversation",
    agentNote: fa ? "پیام‌ها مستقیماً برای تیم پشتیبانی ارسال می‌شود." : "Your messages go straight to our support team.",
  };

  const quickReplies = fa
    ? ["پیگیری سفارش و ارسال", "مشاوره انتخاب الگو", "همکاری و فروش طرح"]
    : ["Order & delivery", "Pattern advice", "Selling my designs"];

  return (
    <>
      {/* ── آیکون شناور ── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[80] flex justify-end px-5">
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPanel())}
          aria-label={open ? t.close : t.button}
          aria-expanded={open}
          className={cn(
            "pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-elevated",
            "transition-[transform,background-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-glow",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          )}
        >
          <MessageCircle className={cn("h-6 w-6 transition-transform duration-300", open && "scale-0 opacity-0")} aria-hidden />
          <X className={cn("absolute h-6 w-6 transition-transform duration-300", open ? "scale-100 opacity-100" : "scale-0 opacity-0")} aria-hidden />
          {!open && (
            <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-accent/40 [animation-duration:2.6s]" aria-hidden />
          )}
          {unread > 0 && !open && (
            <span className="absolute -top-0.5 -end-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[11px] font-bold text-white">
              {fa ? faNum(unread) : unread}
            </span>
          )}
        </button>
      </div>

      {/* ── پنل گفت‌وگو ── */}
      <div
        role="dialog"
        aria-modal="false"
        aria-label={t.title}
        aria-hidden={!open}
        inert={!open}
        dir={fa ? "rtl" : "ltr"}
        className={cn(
          "fixed bottom-24 z-[80] flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated transition-[opacity,transform] duration-300",
          "inset-x-4 max-h-[min(560px,calc(100dvh-8rem))] sm:inset-x-auto sm:end-5 sm:w-[380px]",
          open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        {/* سرتیتر */}
        <div className="flex items-start gap-3 border-b border-border bg-gradient-to-br from-accent-soft to-surface px-4 py-3.5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{t.title}</p>
            <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-4 text-foreground-secondary">
              <span className="relative mt-1 flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70 [animation-duration:2s]" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              {t.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t.close}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground-secondary transition-colors hover:bg-background-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* پیام‌ها / فرم شروع */}
        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
          {!hasConversation ? (
            <div className="space-y-4">
              <div className="rounded-2xl rounded-es-sm bg-background-secondary px-4 py-3 text-sm text-foreground">
                <p className="font-medium">{t.greeting}</p>
                <p className="mt-1 text-foreground-secondary">{t.intro}</p>
                <p className="mt-1.5 text-xs text-muted">{t.introHint}</p>
              </div>
              <div className="space-y-2.5">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground-secondary">{t.name}</span>
                  <input
                    ref={nameRef}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    maxLength={60}
                    className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
                    placeholder={t.namePlaceholder}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground-secondary">{t.email}</span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    inputMode="email"
                    dir="ltr"
                    autoComplete="email"
                    maxLength={120}
                    className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
                    placeholder="you@example.com"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    disabled={name.trim().length < 2 || busy}
                    onClick={() => void send(reply)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            </div>
          ) : loading && messages.length === 0 ? (
            <div className="space-y-2">
              <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-background-secondary" />
              <div className="ms-auto h-10 w-1/2 animate-pulse rounded-2xl bg-background-secondary" />
            </div>
          ) : (
            <>
              <div className="rounded-2xl rounded-es-sm bg-background-secondary px-4 py-3 text-sm text-foreground">
                {t.greeting} {t.intro}
              </div>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex flex-col gap-1", message.role === "visitor" ? "items-end" : "items-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm leading-6",
                      message.role === "visitor"
                        ? "rounded-2xl rounded-ee-sm bg-accent text-accent-foreground"
                        : "rounded-2xl rounded-es-sm border border-border bg-background-secondary text-foreground",
                    )}
                  >
                    {message.body}
                  </div>
                  <span className="px-1 text-[10px] text-muted">
                    {message.role === "admin" ? message.author || t.support : t.you} · {timeLabel(message.createdAt, fa)}
                  </span>
                </div>
              ))}
            </>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
              {error === "rate" ? t.rate : t.network}
            </p>
          )}
          {closed && (
            <div className="rounded-lg border border-border bg-background-secondary px-3 py-2 text-xs text-foreground-secondary">
              <p>{t.closed}</p>
              <button
                type="button"
                onClick={reset}
                className="mt-1.5 font-medium text-accent underline-offset-2 hover:underline"
              >
                {t.newChat}
              </button>
            </div>
          )}
        </div>

        {/* نوشتن پیام */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
          className="border-t border-border bg-surface px-3 py-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              rows={1}
              maxLength={1200}
              disabled={closed}
              aria-label={t.placeholder}
              placeholder={hasConversation ? t.placeholder : fa ? "پیام‌تان را بنویسید و ارسال کنید…" : "Write your message and send…"}
              className="max-h-28 min-h-10 w-full resize-none rounded-md border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || closed || draft.trim().length === 0 || (!hasConversation && name.trim().length < 2)}
              aria-label={t.send}
              title={t.send}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground transition-[background-color,transform] duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className={cn("h-4 w-4", fa && "-scale-x-100")} aria-hidden />
            </button>
          </div>
          <p className="mt-2 text-[10px] text-muted">{busy ? t.sending : t.agentNote}</p>
        </form>
      </div>
    </>
  );
}
