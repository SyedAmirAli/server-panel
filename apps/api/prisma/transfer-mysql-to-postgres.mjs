/**
 * One-off MySQL -> Postgres data transfer.
 *
 * Moves rows through two Prisma clients rather than CSV/SQL text so booleans,
 * JSON and datetimes stay type-correct by construction — CSV round-tripping is
 * where migrations like this usually lose data quietly (0/1 vs false/true,
 * JSON quoting, timezone drift).
 *
 * Safe to re-run: every insert uses skipDuplicates, so a partial run resumes.
 *
 *   node prisma/transfer-mysql-to-postgres.mjs [--dry-run]
 */
import { PrismaClient as PgClient, Prisma } from "@prisma/client";
import { PrismaClient as MyClient } from "./.mysql-client/index.js";

const DRY_RUN = process.argv.includes("--dry-run");
const CHUNK = 200; // mail bodies are LongText; keep statements modest

/**
 * Parent-before-child. Getting this wrong surfaces as a foreign key violation
 * rather than silent corruption, but ordering it correctly means one clean pass.
 */
const ORDER = [
    "apiKey",
    "mailbox",
    "emailConfig",
    "bucket",
    "storageApiKey",
    "auditLog",
    "candidateProfile",
    "jobSource",
    "jobFinderSetting",
    "mailMessage",
    "sentMessage",
    "storageObject",
    "jobPosting",
    "jobMatch",
    "jobApplication",
    "jobRun",
    "jobRunLog",
];

/** Json fields per model — needed because Prisma wants DbNull, not null, for them. */
function jsonFieldsByModel() {
    const map = new Map();
    for (const model of Prisma.dmmf.datamodel.models) {
        const fields = model.fields.filter((f) => f.type === "Json").map((f) => f.name);
        if (fields.length) map.set(model.name.charAt(0).toLowerCase() + model.name.slice(1), fields);
    }
    return map;
}

function normalize(row, jsonFields) {
    if (!jsonFields?.length) return row;
    const out = { ...row };
    for (const f of jsonFields) {
        // A nullable Json column holding SQL NULL must be handed back as DbNull;
        // plain null would be rejected, and JsonNull would write the *string* null.
        if (out[f] === null) out[f] = Prisma.DbNull;
    }
    return out;
}

async function main() {
    const mysql = new MyClient();
    const pg = new PgClient();
    const jsonMap = jsonFieldsByModel();
    const summary = [];

    try {
        for (const model of ORDER) {
            const source = mysql[model];
            const target = pg[model];
            if (!source || !target) {
                console.log(`skip   ${model} (not present in both clients)`);
                continue;
            }

            const total = await source.count();
            if (total === 0) {
                summary.push({ model, source: 0, copied: 0, target: 0 });
                console.log(`empty  ${model}`);
                continue;
            }

            let copied = 0;
            for (let skip = 0; skip < total; skip += CHUNK) {
                const rows = await source.findMany({ skip, take: CHUNK, orderBy: { id: "asc" } });
                if (!rows.length) break;
                const data = rows.map((r) => normalize(r, jsonMap.get(model)));
                if (!DRY_RUN) {
                    const res = await target.createMany({ data, skipDuplicates: true });
                    copied += res.count;
                }
                process.stdout.write(`\r  ${model}: ${Math.min(skip + CHUNK, total)}/${total}`);
            }
            process.stdout.write("\r");

            const targetCount = DRY_RUN ? 0 : await target.count();
            summary.push({ model, source: total, copied, target: targetCount });
            const ok = DRY_RUN || targetCount === total;
            console.log(`${ok ? "ok    " : "MISMATCH"} ${model}: source=${total} copied=${copied} target=${targetCount}`);
        }

        console.log("\n=== summary ===");
        console.table(summary);
        const bad = summary.filter((s) => !DRY_RUN && s.target !== s.source);
        if (bad.length) {
            console.error("row count mismatch in:", bad.map((b) => b.model).join(", "));
            process.exitCode = 1;
        } else if (!DRY_RUN) {
            console.log("all row counts match");
        }
    } finally {
        await mysql.$disconnect();
        await pg.$disconnect();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
