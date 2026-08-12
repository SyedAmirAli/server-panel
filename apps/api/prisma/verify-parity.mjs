// Content-level parity check: counts matching proves nothing about whether
// LongText bodies, Json columns or datetimes survived intact.
import { PrismaClient as PgClient } from "@prisma/client";
import { PrismaClient as MyClient } from "./.mysql-client/index.js";
import { createHash } from "node:crypto";

const my = new MyClient(), pg = new PgClient();
const md5 = (s) => createHash("md5").update(s).digest("hex");
let bad = 0;
const check = (label, a, b) => {
    const ok = a === b;
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${label}\n        mysql=${a}\n        pg   =${b}`);
};

// 1. Body/html text fidelity across the 500 newest messages (LongText -> text).
const sel = { orderBy: { id: "asc" }, take: 500, select: { id: true, body: true, html: true, subject: true } };
const [m1, p1] = await Promise.all([my.mailMessage.findMany(sel), pg.mailMessage.findMany(sel)]);
check("mailMessage body+html+subject digest (500 rows)",
    md5(m1.map(r => `${r.id}|${r.body}|${r.html}|${r.subject}`).join("\n")),
    md5(p1.map(r => `${r.id}|${r.body}|${r.html}|${r.subject}`).join("\n")));

// 2. Json columns (to/cc/bcc/flags/attachments) — the DbNull handling is the risk.
const jsel = { orderBy: { id: "asc" }, take: 500, select: { id: true, to: true, cc: true, bcc: true, flags: true, attachments: true } };
const [m2, p2] = await Promise.all([my.mailMessage.findMany(jsel), pg.mailMessage.findMany(jsel)]);
check("mailMessage Json columns digest (500 rows)",
    md5(m2.map(r => JSON.stringify(r)).join("\n")),
    md5(p2.map(r => JSON.stringify(r)).join("\n")));

// 3. Datetimes — timezone drift would shift every receivedAt silently.
const dsel = { orderBy: { id: "asc" }, take: 500, select: { id: true, receivedAt: true, syncedAt: true } };
const [m3, p3] = await Promise.all([my.mailMessage.findMany(dsel), pg.mailMessage.findMany(dsel)]);
check("mailMessage datetime digest (500 rows)",
    md5(m3.map(r => `${r.id}|${r.receivedAt.toISOString()}|${r.syncedAt.toISOString()}`).join("\n")),
    md5(p3.map(r => `${r.id}|${r.receivedAt.toISOString()}|${r.syncedAt.toISOString()}`).join("\n")));

// 4. Encrypted credential blobs must be byte-identical or nothing decrypts.
const bsel = { orderBy: { id: "asc" }, select: { id: true, accessKeyEnc: true, secretKeyEnc: true, lockedPrefixes: true } };
const [m4, p4] = await Promise.all([my.bucket.findMany(bsel), pg.bucket.findMany(bsel)]);
check("bucket encrypted credentials + lockedPrefixes",
    md5(JSON.stringify(m4)), md5(JSON.stringify(p4)));

// 5. Booleans (MySQL tinyint(1) -> Postgres boolean).
const [mb, pb] = await Promise.all([
    my.mailMessage.count({ where: { isRead: true } }),
    pg.mailMessage.count({ where: { isRead: true } }),
]);
check("mailMessage isRead=true count", String(mb), String(pb));

// 6. Postgres-only: the case-insensitive search now behaves like MySQL did.
const ci = await pg.mailMessage.count({ where: { from: { contains: "GMAIL", mode: "insensitive" } } });
const cs = await pg.mailMessage.count({ where: { from: { contains: "GMAIL" } } });
console.log(`\ncase-insensitive search sanity: insensitive=${ci} sensitive=${cs} (insensitive should be >= sensitive)`);

await my.$disconnect(); await pg.$disconnect();
console.log(bad === 0 ? "\nALL CONTENT CHECKS PASSED" : `\n${bad} CHECK(S) FAILED`);
process.exit(bad === 0 ? 0 : 1);
