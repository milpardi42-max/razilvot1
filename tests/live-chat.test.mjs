import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * چت آنلاین — تست‌های سطح-منبع (هم‌سبک با بقیه‌ی فایل‌های tests/):
 * مسیرها، قواعد دسترسی، و اینکه فایل‌های runtime در گیت کامیت نمی‌شوند.
 */

test('visitor chat endpoints exist and are always dynamic + no-store', () => {
  const route = fs.readFileSync('src/app/api/chat/route.ts', 'utf8');
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /withNoStore\(/);
  // توکن بازدیدکننده فقط با زوج «شناسه + توکن» پذیرفته می‌شود
  assert.match(route, /getVisitorConversation\(/);
  assert.match(route, /action === "send"/);
  assert.match(route, /action === "start"/);
});

test('admin chat endpoints require an admin session', () => {
  for (const file of ['src/app/api/admin/chat/route.ts', 'src/app/api/admin/chat/[id]/route.ts']) {
    const route = fs.readFileSync(file, 'utf8');
    assert.match(route, /getSession\(\)/, file);
    assert.match(route, /role !== "admin"/, file);
    assert.match(route, /error: "unauthorized"/, file);
  }
});

test('chat store never exposes the visitor token in the admin payload', () => {
  const store = fs.readFileSync('src/lib/data/chat.ts', 'utf8');
  const summary = store.slice(store.indexOf('export function toSummary'));
  assert.doesNotMatch(summary.slice(0, summary.indexOf('export function toVisitorView')), /token/);
  assert.match(store, /export async function markRead/);
  assert.match(store, /export async function appendMessage/);
});

test('chat rate limits are configured for both sending and starting', () => {
  const limits = fs.readFileSync('src/lib/rate-limit.ts', 'utf8');
  assert.match(limits, /chat: \{ window: .*max: 60 \}/);
  assert.match(limits, /"chat-start": \{ window: .*max: 12 \}/);
});

test('the chat widget is mounted on every public page and hides on fullscreen live routes', () => {
  const layout = fs.readFileSync('src/app/[locale]/layout.tsx', 'utf8');
  assert.match(layout, /<ChatWidget key="chat-widget" \/>/);

  const widget = fs.readFileSync('src/components/chat/ChatWidget.tsx', 'utf8');
  assert.match(widget, /academy\\\/\[\^\/\]\+\\\/\(live\|broadcast\)/, 'fullscreen guard');
  assert.match(widget, /className="pointer-events-none fixed inset-x-0 bottom-5 z-\[80\] flex justify-end px-5"/, 'floating icon row');
  assert.match(widget, /aria-label=\{open \? t\.close : t\.button\}/);
  assert.match(widget, /ra-chat"/, 'conversation is persisted per browser');
});

test('admin panel exposes a chat tab with an unread badge', () => {
  const admin = fs.readFileSync('src/components/admin/AdminApp.tsx', 'utf8');
  assert.match(admin, /import \{ ChatManager \} from "@\/components\/admin\/ChatManager"/);
  assert.match(admin, /id: "chat", label: "چت آنلاین"/);
  assert.match(admin, /\{section === "chat" && <ChatManager \/>\}/);
  assert.match(admin, /\/api\/admin\/chat\?stats=1/);

  const manager = fs.readFileSync('src/components/admin/ChatManager.tsx', 'utf8');
  assert.match(manager, /method: "POST"/, 'reply endpoint');
  assert.match(manager, /method: "PATCH"/, 'close/reopen');
  assert.match(manager, /method: "DELETE"/, 'delete conversation');
});

test('the social icon row is rendered in the footer and on the contact page', () => {
  const footer = fs.readFileSync('src/components/layout/Footer.tsx', 'utf8');
  assert.match(footer, /<SocialLinks socials=\{socials\} size="md" \/>/);

  const contact = fs.readFileSync('src/app/[locale]/contact/page.tsx', 'utf8');
  assert.match(contact, /<SocialLinks socials=\{site\.socials\} size="sm" \/>/);

  const layout = fs.readFileSync('src/app/[locale]/layout.tsx', 'utf8');
  assert.match(layout, /<Footer key="footer" socials=\{site\.socials\} \/>/);
});

test('every social platform has a brand icon, a label and a brand colour', () => {
  const socials = fs.readFileSync('src/lib/socials.ts', 'utf8');
  const icons = fs.readFileSync('src/components/icons/BrandIcons.tsx', 'utf8');
  const platforms = [...socials.matchAll(/^  (\w+): \{ label:/gm)].map((m) => m[1]);
  assert.ok(platforms.length >= 8, 'expected at least 8 platforms');
  for (const platform of platforms) {
    if (platform === 'email' || platform === 'phone') continue; // lucide Mail/Phone
    assert.ok(icons.includes(`"${platform}":`), `missing brand icon for ${platform}`);
  }
  assert.match(socials, /export const defaultSocials/);
});

test('runtime chat data is not committed to git', () => {
  const ignore = fs.readFileSync('.gitignore', 'utf8');
  assert.match(ignore, /\/data\/\*\.json/, 'data/*.json stays untracked');
});
