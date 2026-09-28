import dns from "node:dns/promises";
import net from "node:net";

/**
 * محافظت SSRF برای روت «نجات مدیای بیرونی».
 *
 * سرور ما فایل را از آدرس بیرونی می‌گیرد، پس باید مطمئن شویم کسی نمی‌تواند آن را
 * به سرویس‌های داخلی/شبکه‌ی خصوصی (یا متادیتای ابری) وصل کند.
 */

export function isPrivateAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (version === 6) {
    const value = address.toLowerCase();
    if (value === "::" || value === "::1") return true;
    if (value.startsWith("fe80") || value.startsWith("fc") || value.startsWith("fd")) return true;
    if (value.startsWith("::ffff:")) return isPrivateAddress(value.replace("::ffff:", ""));
    return false;
  }
  return true;
}

/** فقط http/https روی پورت ۸۰/۴۴۳، بدون credential، و مقصد عمومی. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("bad_protocol");
  if (url.username || url.password) throw new Error("credentials_not_allowed");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443) throw new Error("bad_port");

  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    throw new Error("bad_host");
  }
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length) throw new Error("dns_failure");
  for (const entry of addresses) {
    if (isPrivateAddress(entry.address)) throw new Error("private_address");
  }
  return url;
}
