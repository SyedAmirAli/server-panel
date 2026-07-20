import type { Request } from "express";

/**
 * Resolve the real client IP, honoring Cloudflare/proxy headers. Order:
 * CF-Connecting-IP → first X-Forwarded-For hop → X-Real-IP → socket address.
 */
export function resolveClientIp(req: Request): string {
    const h = req.headers;
    const cf = h["cf-connecting-ip"];
    if (typeof cf === "string" && cf.trim()) return cf.trim();
    const xff = h["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
    const real = h["x-real-ip"];
    if (typeof real === "string" && real.trim()) return real.trim();
    return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/** Request origin/host for the origin allowlist. */
export function resolveOrigin(req: Request): string | null {
    const origin = req.headers.origin;
    if (typeof origin === "string" && origin.trim()) return origin.trim();
    const referer = req.headers.referer;
    if (typeof referer === "string" && referer.trim()) {
        try {
            return new URL(referer).origin;
        } catch {
            /* ignore */
        }
    }
    return null;
}

function normalizeHost(value: string): string {
    try {
        return new URL(value.includes("://") ? value : `https://${value}`).host.toLowerCase();
    } catch {
        return value.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
    }
}

/** Empty allowlist = unrestricted. Otherwise host-match (scheme/port-insensitive on host). */
export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
    if (!allowed || allowed.length === 0) return true;
    if (!origin) return false;
    const host = normalizeHost(origin);
    return allowed.some((a) => normalizeHost(a) === host);
}

function ipv4ToInt(ip: string): number | null {
    const parts = ip.split(".");
    if (parts.length !== 4) return null;
    let n = 0;
    for (const p of parts) {
        const o = Number(p);
        if (!Number.isInteger(o) || o < 0 || o > 255) return null;
        n = (n << 8) | o;
    }
    return n >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
    const [range, bitsRaw] = cidr.split("/");
    const bits = Number(bitsRaw);
    const ipInt = ipv4ToInt(ip);
    const rangeInt = ipv4ToInt(range);
    if (ipInt === null || rangeInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (ipInt & mask) === (rangeInt & mask);
}

/** Empty allowlist = unrestricted. Supports exact match and IPv4 CIDR. */
export function isIpAllowed(ip: string, allowed: string[]): boolean {
    if (!allowed || allowed.length === 0) return true;
    // Normalize IPv4-mapped IPv6 (::ffff:1.2.3.4).
    const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
    return allowed.some((entry) => {
        if (entry === ip || entry === normalized) return true;
        if (entry.includes("/")) return ipInCidr(normalized, entry);
        return false;
    });
}
