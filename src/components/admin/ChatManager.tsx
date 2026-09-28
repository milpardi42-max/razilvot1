"use client";

import {
  CheckCheck,
  Clock,
  Inbox,
  Mail,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn, faNum } from "@/lib/utils";
import type { ChatConversation, ChatConversationSummary, ChatStats } from "@/lib/types";

/**
 * صندوق چت پنل ادمین — پاسخ‌دادن به گفت‌وگوهای «چت آنلاین».
 *
 *   · راست: فهرست گفت‌وگوها با جست‌وجو، فیلتر و شمارنده‌ی خوانده‌نشده‌ها
 *   · چپ: رشته‌ی پیام‌ها + کادر پاسخ (Enter برای ارسال، Shift+Enter خط جدید)
 *   · هر ۸ ثانیه فهرست و گفت‌وگوی باز به‌روزرسانی می‌شوند (poll سبک، بدون WebSocket)
 */

const POLL_MS = 8000;

type Filter = "all" | "unread" | "open" | "closed";

const QUICK_REPLIES = [
  "سلام، ممنون از پیام‌تان. در اولین فرصت بررسی می‌کنیم.",
  "لطفاً شماره سفارش یا ایمیل حساب را بفرستید تا سریع‌تر پیگیری کنیم.",
  "این طرح به‌صورت سفارشی هم قابل تولید است؛ جزئیات را همین‌جا می‌فرستیم.",
  "ساعت پاسخ‌گویی ما ۹ تا ۱۸ روزهای کاری است. ممنون از صبر شما.",
];

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "همین حالا";
  if (minutes < 60) return `${faNum(minutes)} دقیقه پیش`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${faNum(hours)} ساعت پیش`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${faNum(days)} روز پیش`;
  return new Date(iso).toLocaleDateString("fa-IR");
}

function fullTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
}

export function ChatManager() {
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [stats, setStats] = useState<ChatStats | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<ChatConversation | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  /* ── فهرست گفت‌وگوها ─────────────────────────────────────────────────── */
  const loadList = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoadingList(true);
    try {
      const response = await fetch("/api/admin/chat", { credentials: "include", cache: "no-store" });
      if (response.status === 401) {
        setError("نشست ادمین منقضی شده است — دوباره وارد شوید.");
        return;
      }
      if (!response.ok) throw new Error("load_failed");
      const data = (await response.json()) as {
        conversations: ChatConversationSummary[];
        stats: ChatStats;
      };
      setConversations(data.conversations ?? []);
      setStats(data.stats ?? null);
      setError(null);
    } catch {
      if (!options.silent) setError("دریافت گفت‌وگوها با خطا مواجه شد.");
    } finally {
      if (!options.silent) setLoadingList(false);
    }
  }, []);

  /* ── یک گفت‌وگو ──────────────────────────────────────────────────────── */
  const loadThread = useCallback(async (id: string, options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoadingThread(true);
    try {
      const response = await fetch(`/api/admin/chat/${id}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("load_failed");
      const data = (await response.json()) as { conversation: ChatConversation };
      if (activeIdRef.current !== id) return;
      setActive(data.conversation);
    } catch {
      if (!options.silent) setError("این گفت‌وگو بارگذاری نشد.");
    } finally {
      if (!options.silent) setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  /* باز کردن اولین گفت‌وگو به‌صورت خودکار */
  useEffect(() => {
    if (activeId || conversations.length === 0) return;
    const first = conversations.find((conversation) => conversation.unreadForAdmin > 0) ?? conversations[0];
    if (first) setActiveId(first.id);
  }, [activeId, conversations]);

  useEffect(() => {
    if (!activeId) return;
    setActive(null);
    void loadThread(activeId);
  }, [activeId, loadThread]);

  /* ── polling ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void loadList({ silent: true });
      const id = activeIdRef.current;
      if (id) void loadThread(id, { silent: true });
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [loadList, loadThread]);

  /* اسکرول به آخرین پیام */
  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [active?.messages.length, activeId]);

  /* ── پاسخ ────────────────────────────────────────────────────────────── */
  const sendReply = useCallback(async () => {
    const body = reply.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    try {
      const response = await fetch(`/api/admin/chat/${activeId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ body }),
      });
      if (!response.ok) throw new Error("send_failed");
      const data = (await response.json()) as { conversation: ChatConversation };
      setActive(data.conversation);
      setReply("");
      void loadList({ silent: true });
      textareaRef.current?.focus();
    } catch {
      setError("ارسال پاسخ انجام نشد. دوباره تلاش کنید.");
    } finally {
      setSending(false);
    }
  }, [activeId, loadList, reply, sending]);

  const patchConversation = useCallback(
    async (id: string, payload: { status?: "open" | "closed"; markRead?: boolean }) => {
      try {
        const response = await fetch(`/api/admin/chat/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("patch_failed");
        const data = (await response.json()) as { conversation: ChatConversation };
        if (activeIdRef.current === id) setActive(data.conversation);
        void loadList({ silent: true });
      } catch {
        setError("تغییر وضعیت گفت‌وگو انجام نشد.");
      }
    },
    [loadList],
  );

  const removeConversation = useCallback(
    async (id: string) => {
      if (!window.confirm("این گفت‌وگو برای همیشه حذف شود؟")) return;
      try {
        const response = await fetch(`/api/admin/chat/${id}`, {
          method: "DELETE",
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("delete_failed");
        if (activeIdRef.current === id) {
          setActiveId(null);
          setActive(null);
        }
        void loadList({ silent: true });
      } catch {
        setError("حذف گفت‌وگو انجام نشد.");
      }
    },
    [loadList],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (filter === "unread" && conversation.unreadForAdmin === 0) return false;
      if (filter === "open" && conversation.status !== "open") return false;
      if (filter === "closed" && conversation.status !== "closed") return false;
      if (!term) return true;
      return (
        conversation.name.toLowerCase().includes(term) ||
        (conversation.email ?? "").toLowerCase().includes(term) ||
        (conversation.lastMessage?.body ?? "").toLowerCase().includes(term)
      );
    });
  }, [conversations, filter, query]);

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "همه", count: conversations.length },
    { id: "unread", label: "خوانده‌نشده", count: stats?.unread ?? 0 },
    { id: "open", label: "باز", count: stats?.open ?? 0 },
    { id: "closed", label: "بسته", count: Math.max(0, conversations.length - (stats?.open ?? 0)) },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      {/* سرتیتر و آمار */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">چت آنلاین</h1>
            <p className="text-xs text-gray-400">
              {loadingList ? "در حال بارگذاری…" : `${faNum(conversations.length)} گفت‌وگو · ${faNum(stats?.unread ?? 0)} پیام خوانده‌نشده`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(stats?.total ?? 0) > 0 && (
            <span className="hidden items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 sm:flex">
              <Clock className="h-3.5 w-3.5" /> امروز: {faNum(stats?.today ?? 0)}
            </span>
          )}
          <button
            type="button"
            onClick={() => void loadList()}
            disabled={loadingList}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loadingList && "animate-spin")} /> بارگذاری
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* ── فهرست گفت‌وگوها ── */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white lg:col-span-5 xl:col-span-4">
          <div className="border-b border-gray-100 p-3">
            <div className="relative">
              <Search className="absolute top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 end-3" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="جست‌وجوی نام، ایمیل یا متن پیام…"
                className="h-9 w-full rounded-lg border border-gray-200 bg-white ps-3 pe-9 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    filter === item.id
                      ? "bg-accent text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  {item.label}
                  {item.count > 0 && <span className="ms-1 opacity-80">{faNum(item.count)}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[560px] flex-1 divide-y divide-gray-100 overflow-y-auto">
            {loadingList && conversations.length === 0 && (
              <div className="space-y-2 p-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
                ))}
              </div>
            )}

            {!loadingList && filtered.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
                <Inbox className="h-7 w-7 text-gray-300" />
                <p className="text-sm text-gray-400">
                  {conversations.length === 0 ? "هنوز گفت‌وگویی ثبت نشده است." : "گفت‌وگویی با این فیلتر پیدا نشد."}
                </p>
              </div>
            )}

            {filtered.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveId(conversation.id)}
                className={cn(
                  "flex w-full flex-col gap-1 px-3.5 py-3 text-right transition-colors",
                  activeId === conversation.id ? "bg-accent/5" : "hover:bg-gray-50",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-500">
                    {(conversation.name || "؟").charAt(0)}
                  </span>
                  <span className="truncate text-sm font-semibold text-gray-800">{conversation.name}</span>
                  {conversation.status === "closed" && (
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">بسته</span>
                  )}
                  {conversation.unreadForAdmin > 0 && (
                    <span className="ms-auto rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {faNum(conversation.unreadForAdmin)}
                    </span>
                  )}
                </div>
                <p className="line-clamp-1 text-xs text-gray-500">
                  {conversation.lastMessage ? (
                    <>
                      <span className="text-gray-400">
                        {conversation.lastMessage.role === "admin" ? "پشتیبانی: " : ""}
                      </span>
                      {conversation.lastMessage.body}
                    </>
                  ) : (
                    "بدون پیام"
                  )}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span>{relativeTime(conversation.updatedAt)}</span>
                  <span className="text-gray-300">·</span>
                  <span>{faNum(conversation.messageCount)} پیام</span>
                  {conversation.replied && (
                    <span className="flex items-center gap-0.5 text-emerald-600">
                      <CheckCheck className="h-3 w-3" /> پاسخ داده‌شده
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── رشته‌ی گفت‌وگو ── */}
        <section className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white lg:col-span-7 xl:col-span-8">
          {!activeId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <MessageCircle className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-400">یک گفت‌وگو را از فهرست انتخاب کنید.</p>
            </div>
          ) : (
            <>
              {/* سرتیتر گفت‌وگو */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                    {active?.name ?? "…"}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                    {active?.email ? (
                      <span className="flex items-center gap-1" dir="ltr">
                        <Mail className="h-3 w-3" /> {active.email}
                      </span>
                    ) : (
                      <span>ایمیل ثبت نشده</span>
                    )}
                    {active?.createdAt && <span>شروع: {fullTime(active.createdAt)}</span>}
                    {active?.page && (
                      <span className="rounded bg-white px-1.5 py-0.5 text-gray-500" dir="ltr">
                        {active.page}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => active && void patchConversation(active.id, { status: active.status === "open" ? "closed" : "open" })}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    {active?.status === "open" ? "بستن گفت‌وگو" : "بازکردن گفت‌وگو"}
                  </button>
                  <button
                    type="button"
                    onClick={() => active && void removeConversation(active.id)}
                    title="حذف گفت‌وگو"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* پیام‌ها */}
              <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto bg-[#fafafa] px-4 py-4">
                {loadingThread && !active && (
                  <div className="space-y-2">
                    <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-gray-100" />
                    <div className="ms-auto h-12 w-1/2 animate-pulse rounded-2xl bg-gray-100" />
                  </div>
                )}
                {active?.messages.length === 0 && (
                  <p className="py-10 text-center text-sm text-gray-400">هنوز پیامی در این گفت‌وگو نیست.</p>
                )}
                {active?.messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("flex flex-col gap-1", message.role === "admin" ? "items-end" : "items-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-sm",
                        message.role === "admin"
                          ? "rounded-ee-sm bg-accent text-white"
                          : "rounded-es-sm border border-gray-200 bg-white text-gray-800",
                      )}
                    >
                      {message.body}
                    </div>
                    <span className="px-1 text-[10px] text-gray-400">
                      {message.role === "admin" ? `پشتیبانی (${message.author})` : message.author} · {fullTime(message.createdAt)}
                    </span>
                  </div>
                ))}
              </div>

              {/* پاسخ */}
              <div className="border-t border-gray-100 p-3">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {QUICK_REPLIES.map((template) => (
                    <button
                      key={template}
                      type="button"
                      onClick={() => setReply(template)}
                      className="max-w-full truncate rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 transition-colors hover:border-accent hover:text-accent"
                    >
                      {template}
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendReply();
                      }
                    }}
                    rows={2}
                    maxLength={1200}
                    placeholder="پاسخ خود را بنویسید… (Enter = ارسال، Shift+Enter = خط جدید)"
                    className="max-h-40 min-h-[52px] w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10"
                  />
                  <button
                    type="button"
                    onClick={() => void sendReply()}
                    disabled={sending || reply.trim().length === 0}
                    className="flex h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send className="h-4 w-4 -scale-x-100" />
                    {sending ? "در حال ارسال…" : "ارسال"}
                  </button>
                </div>
                {active?.status === "closed" && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600">
                    <X className="h-3 w-3" /> این گفت‌وگو بسته است؛ برای ادامه آن را باز کنید.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
