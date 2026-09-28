import "server-only";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type {
  ChatConversation,
  ChatConversationSummary,
  ChatMessage,
  ChatStats,
  ChatStatus,
} from "../types";

/**
 * Chat store — گفت‌وگوهای چت آنلاین با همان الگوی دو-پشتیبانِ بقیه‌ی استورها:
 *
 *  1. Upstash Redis  (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 *  2. Local file     data/chat.json  (dev / single-node)
 *
 * هر گفت‌وگو یک `token` دارد که فقط مرورگر بازدیدکننده آن را می‌داند؛ خواندن و
 * نوشتنِ سمت بازدیدکننده تنها با زوج «شناسه + توکن» ممکن است. ادمین از طریق
 * نشست خودش (role=admin) به همه‌ی گفت‌وگوها دسترسی دارد.
 *
 * نوشتن‌ها از یک صف درون‌حافظه‌ای رد می‌شوند تا دو درخواست هم‌زمان باعث
 * lost-update نشود.
 */

const KEY = "rosie-atelier:chat";
const FILE = path.join(process.cwd(), "data", "chat.json");

/** سقف نگهداری — از رشد بی‌نهایت فایل/کلید جلوگیری می‌کند. */
const MAX_CONVERSATIONS = 800;
const MAX_MESSAGES_PER_CONVERSATION = 400;
export const MAX_MESSAGE_LENGTH = 1200;

function redisEnabled() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redisCmd(args: string[]) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`redis ${response.status}`);
  return (await response.json()) as { result: unknown };
}

async function readAll(): Promise<ChatConversation[]> {
  try {
    const raw = redisEnabled()
      ? (await redisCmd(["GET", KEY])).result
      : await fs.readFile(FILE, "utf8");
    if (typeof raw !== "string") return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isConversation);
  } catch {
    return [];
  }
}

async function writeAll(conversations: ChatConversation[]) {
  const trimmed = [...conversations]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_CONVERSATIONS);
  const json = JSON.stringify(trimmed, null, 2);
  if (redisEnabled()) {
    await redisCmd(["SET", KEY, json]);
    return;
  }
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, json, "utf8");
}

function isConversation(value: unknown): value is ChatConversation {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<ChatConversation>;
  return typeof v.id === "string" && typeof v.token === "string" && Array.isArray(v.messages);
}

/**
 * صف نوشتن — هر عملیات تغییردهنده پس از پایان عملیات قبلی اجرا می‌شود.
 * (هر instance سرور صف خودش را دارد؛ برای این استور کافی است.)
 */
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

function newId(prefix: string) {
  return `${prefix}-${crypto.randomBytes(9).toString("hex")}`;
}

/** مقایسه‌ی زمان‌ثابت توکن دسترسی بازدیدکننده. */
export function tokenMatches(expected: string, provided: string | undefined | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function sanitizeMessageBody(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, MAX_MESSAGE_LENGTH);
}

function lastMessageOf(conversation: ChatConversation): ChatMessage | undefined {
  return conversation.messages[conversation.messages.length - 1];
}

export function toSummary(conversation: ChatConversation): ChatConversationSummary {
  const last = lastMessageOf(conversation);
  return {
    id: conversation.id,
    visitorId: conversation.visitorId,
    name: conversation.name,
    ...(conversation.email ? { email: conversation.email } : {}),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    status: conversation.status,
    unreadForAdmin: conversation.unreadForAdmin,
    unreadForVisitor: conversation.unreadForVisitor,
    messageCount: conversation.messages.length,
    ...(last ? { lastMessage: last } : {}),
    replied: conversation.messages.some((message) => message.role === "admin"),
  };
}

/** نسخه‌ی بدون توکن — چیزی که به مرورگر بازدیدکننده فرستاده می‌شود. */
export function toVisitorView(conversation: ChatConversation) {
  return {
    id: conversation.id,
    name: conversation.name,
    email: conversation.email ?? "",
    status: conversation.status,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    unreadForVisitor: conversation.unreadForVisitor,
    messages: conversation.messages,
  };
}

export type VisitorView = ReturnType<typeof toVisitorView>;

/* ──────────────────────────────── API ───────────────────────────────── */

export async function listConversationSummaries(): Promise<ChatConversationSummary[]> {
  const all = await readAll();
  return all
    .map(toSummary)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getConversation(id: string): Promise<ChatConversation | null> {
  const all = await readAll();
  return all.find((conversation) => conversation.id === id) ?? null;
}

/** خواندن گفت‌وگو توسط خود بازدیدکننده — نیازمند توکن. */
export async function getVisitorConversation(
  id: string,
  token: string | null | undefined,
): Promise<ChatConversation | null> {
  const conversation = await getConversation(id);
  if (!conversation) return null;
  // توکن اشتباه و گفت‌وگوی ناموجود پاسخ یکسانی می‌گیرند (نباید وجودِ شناسه لو برود).
  if (!tokenMatches(conversation.token, token)) return null;
  return conversation;
}

export interface StartConversationInput {
  visitorId: string;
  name: string;
  email?: string;
  page?: string;
  userAgent?: string;
  userId?: string;
}

/** ساخت گفت‌وگوی جدید یا برگرداندن گفت‌وگوی بازِ همان بازدیدکننده. */
export async function startConversation(input: StartConversationInput): Promise<ChatConversation> {
  return serialize(async () => {
    const all = await readAll();
    const existing = all.find(
      (conversation) => conversation.visitorId === input.visitorId && conversation.status === "open",
    );
    if (existing) {
      // اطلاعات تماس را به‌روز کن، ولی تاریخچه را دست نزن.
      const updated: ChatConversation = {
        ...existing,
        name: input.name || existing.name,
        ...(input.email ? { email: input.email } : {}),
        ...(input.page ? { page: input.page } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
      };
      await writeAll(all.map((c) => (c.id === existing.id ? updated : c)));
      return updated;
    }

    const now = new Date().toISOString();
    const conversation: ChatConversation = {
      id: newId("chat"),
      token: crypto.randomBytes(24).toString("hex"),
      visitorId: input.visitorId,
      name: input.name,
      ...(input.email ? { email: input.email } : {}),
      createdAt: now,
      updatedAt: now,
      status: "open",
      unreadForAdmin: 0,
      unreadForVisitor: 0,
      messages: [],
      ...(input.page ? { page: input.page } : {}),
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
    };
    await writeAll([conversation, ...all]);
    return conversation;
  });
}

export async function appendMessage(
  id: string,
  input: { role: "visitor" | "admin"; author: string; body: string },
): Promise<ChatConversation | null> {
  const body = sanitizeMessageBody(input.body);
  if (!body) return null;

  return serialize(async () => {
    const all = await readAll();
    const index = all.findIndex((conversation) => conversation.id === id);
    if (index < 0) return null;
    const conversation = all[index]!;

    const message: ChatMessage = {
      id: newId("msg"),
      role: input.role,
      author: cleanText(input.author, 80) || (input.role === "admin" ? "پشتیبانی" : "مهمان"),
      body,
      createdAt: new Date().toISOString(),
    };

    const next: ChatConversation = {
      ...conversation,
      messages: [...conversation.messages, message].slice(-MAX_MESSAGES_PER_CONVERSATION),
      updatedAt: message.createdAt,
      // پیام بازدیدکننده برای ادمین خوانده‌نشده است و برعکس.
      unreadForAdmin: input.role === "visitor" ? conversation.unreadForAdmin + 1 : 0,
      unreadForVisitor: input.role === "admin" ? conversation.unreadForVisitor + 1 : 0,
      // پاسخ ادمین یک گفت‌وگوی بسته را دوباره باز نمی‌کند؛ فقط ادمین وضعیت را عوض می‌کند.
      status: conversation.status,
    };

    all[index] = next;
    await writeAll(all);
    return next;
  });
}

/** علامت‌گذاری پیام‌ها به‌عنوان خوانده‌شده از سمت ادمین یا بازدیدکننده. */
export async function markRead(id: string, side: "admin" | "visitor"): Promise<void> {
  return serialize(async () => {
    const all = await readAll();
    const index = all.findIndex((conversation) => conversation.id === id);
    if (index < 0) return;
    const conversation = all[index]!;
    if (side === "admin" && conversation.unreadForAdmin === 0) return;
    if (side === "visitor" && conversation.unreadForVisitor === 0) return;
    all[index] = {
      ...conversation,
      unreadForAdmin: side === "admin" ? 0 : conversation.unreadForAdmin,
      unreadForVisitor: side === "visitor" ? 0 : conversation.unreadForVisitor,
    };
    await writeAll(all);
  });
}

export async function setConversationStatus(id: string, status: ChatStatus): Promise<boolean> {
  return serialize(async () => {
    const all = await readAll();
    const index = all.findIndex((conversation) => conversation.id === id);
    if (index < 0) return false;
    all[index] = { ...all[index]!, status, updatedAt: new Date().toISOString() };
    await writeAll(all);
    return true;
  });
}

export async function deleteConversation(id: string): Promise<boolean> {
  return serialize(async () => {
    const all = await readAll();
    const next = all.filter((conversation) => conversation.id !== id);
    if (next.length === all.length) return false;
    await writeAll(next);
    return true;
  });
}

export async function chatStats(): Promise<ChatStats> {
  const all = await readAll();
  const todayKey = new Date().toISOString().slice(0, 10);
  return {
    total: all.length,
    open: all.filter((conversation) => conversation.status === "open").length,
    unread: all.reduce((sum, conversation) => sum + conversation.unreadForAdmin, 0),
    unreadConversations: all.filter((conversation) => conversation.unreadForAdmin > 0).length,
    today: all.filter((conversation) => conversation.createdAt.slice(0, 10) === todayKey).length,
  };
}
