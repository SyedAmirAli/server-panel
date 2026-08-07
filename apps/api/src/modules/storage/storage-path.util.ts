import { extname } from "node:path";
import slugify from "slugify";

/** Trim/normalize a folder prefix into `a/b/c` form (no leading/trailing slashes, no empty segments). */
export function normalizePrefix(prefix?: string | null): string {
    if (!prefix) return "";
    return prefix
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => slugify(s, { lower: false, strict: true, remove: /[^\w\s.-]/g }))
        .filter(Boolean)
        .join("/");
}

/** Split a filename into a slugified base + lowercased extension (e.g. "My Photo.JPG" → { base: "my-photo", ext: ".jpg" }). */
export function slugifyFilename(originalName: string): { base: string; ext: string } {
    const ext = extname(originalName).toLowerCase();
    const nameWithoutExt = ext ? originalName.slice(0, -ext.length) : originalName;
    const base = slugify(nameWithoutExt, { lower: true, strict: true }) || "file";
    return { base, ext };
}

/** Join a normalized prefix and a filename into a full object key. */
export function buildKey(prefix: string, filename: string): string {
    return prefix ? `${prefix}/${filename}` : filename;
}

/**
 * Normalize a full object key for a raw/folder upload: clean slashes and drop
 * empty/./.. segments, but preserve each segment's name + extension verbatim
 * (no slugify) — an exact clone of the source path.
 */
export function normalizeKeyPath(path: string): string {
    return path
        .split("/")
        .map((s) => s.trim())
        .filter((s) => s && s !== "." && s !== "..")
        .join("/");
}

/** Compose `base-<n>.ext` for the increment strategy (n omitted for the first candidate). */
export function candidateName(base: string, ext: string, n: number): string {
    return n === 0 ? `${base}${ext}` : `${base}-${n}${ext}`;
}

/**
 * If `key` falls under any locked folder prefix (the prefix itself or anything nested
 * beneath it), returns that prefix; otherwise null. Prefixes are compared normalized
 * (no leading/trailing slashes).
 */
export function findLockingPrefix(key: string, lockedPrefixes: string[]): string | null {
    const normalizedKey = key.replace(/^\/+|\/+$/g, "");
    for (const raw of lockedPrefixes) {
        const prefix = normalizePrefix(raw);
        if (!prefix) continue;
        if (normalizedKey === prefix || normalizedKey.startsWith(`${prefix}/`)) return prefix;
    }
    return null;
}
