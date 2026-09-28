import "server-only";
import crypto from "crypto";
import { getStream, putBuffer } from "@/lib/marketplace/storage";

const IMAGE_TYPES: Record<string, { ext: string; matches: (bytes: Buffer) => boolean }> = {
  "image/jpeg": { ext: "jpg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", matches: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/webp": { ext: "webp", matches: (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
  "image/avif": { ext: "avif", matches: (b) => b.toString("ascii", 4, 8) === "ftyp" && /^(avif|avis|mif1)$/.test(b.toString("ascii", 8, 12)) },
};

const VIDEO_TYPES: Record<string, { ext: string; matches: (bytes: Buffer) => boolean }> = {
  "video/mp4": { ext: "mp4", matches: (b) => b.toString("ascii", 4, 8) === "ftyp" },
  "video/webm": { ext: "webm", matches: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
};

export type PublicMediaType = "image" | "video";

const LEGACY_MEDIA_HOSTS = new Set(["res.cloudinary.com"]);

function isLegacyMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const allowedHost = LEGACY_MEDIA_HOSTS.has(hostname)
      || hostname.endsWith(".public.blob.vercel-storage.com")
      || hostname.endsWith(".blob.vercel-storage.com");
    return url.protocol === "https:" && !url.port && allowedHost
      && /\.(?:jpe?g|png|webp|avif|mp4|webm)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

/** Route known old Cloudinary/Vercel public uploads through our own host during migration. */
export function firstPartyMediaUrl(value: string): string {
  if (value.startsWith("/api/media/legacy?")) return value;
  return isLegacyMediaUrl(value) ? `/api/media/legacy?url=${encodeURIComponent(value)}` : value;
}

export function rewriteLegacyMediaUrls<T>(value: T): T {
  if (typeof value === "string") return firstPartyMediaUrl(value) as T;
  if (Array.isArray(value)) return value.map((entry) => rewriteLegacyMediaUrls(entry)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rewriteLegacyMediaUrls(entry)])) as T;
  }
  return value;
}

/** Validate actual file signatures and store media behind this site's own origin. */
export async function storePublicMedia(buffer: Buffer, claimedType: string): Promise<{ id: string; url: string; mime: string; type: PublicMediaType }> {
  const type = claimedType.toLowerCase().split(";")[0]?.trim() ?? "";
  const rule = IMAGE_TYPES[type] ?? VIDEO_TYPES[type];
  if (!rule || buffer.length < 12 || !rule.matches(buffer)) throw new Error("invalid_media_data");
  const id = `${crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 32)}.${rule.ext}`;
  await putBuffer(`public/media/${id}`, buffer, type);
  return { id, url: `/api/media/${id}`, mime: type, type: type.startsWith("video/") ? "video" : "image" };
}

export function publicMediaMime(id: string): string | null {
  const ext = id.split(".").at(-1)?.toLowerCase();
  const mapping: Record<string, string> = {
    jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif",
    mp4: "video/mp4", webm: "video/webm",
  };
  return mapping[ext ?? ""] ?? null;
}

export async function streamPublicMedia(id: string, range?: { start: number; end?: number }) {
  return getStream(`public/media/${id}`, range);
}
