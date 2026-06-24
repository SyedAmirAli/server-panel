import { Logger } from "@nestjs/common";

// ANSI helpers — kept local, no external dep
const c = {
    reset:  "\x1b[0m",
    bold:   "\x1b[1m",
    dim:    "\x1b[2m",
    green:  "\x1b[32m",
    yellow: "\x1b[33m",
    cyan:   "\x1b[36m",
    white:  "\x1b[37m",
    indigo: "\x1b[35m", // magenta as closest terminal proxy for indigo
};

function col(color: string, text: string): string {
    return `${color}${text}${c.reset}`;
}

export interface StartupBannerOptions {
    name: string;
    version: string;
    env: string;
    app: string;
    url: string;
    docs: string;
    health: string;
    dbConnected: boolean;
    corsOrigins: string[];
    routes: string[];
}

export function printStartupBanner(opts: StartupBannerOptions): void {
    const log = new Logger("Bootstrap");

    const dbStatus = opts.dbConnected
        ? col(c.green, "✓ connected")
        : col(c.yellow, "⚠ unreachable");

    const envColor = opts.env === "production" ? c.yellow : c.cyan;

    const lines = [
        "",
        `  ${col(c.bold + c.white, opts.name)}  ${col(c.dim, "v" + opts.version)}  ${col(envColor, opts.env)}`,
        "",
        `  ${col(c.dim, "App    ")} ${col(c.cyan, opts.app)}`,
        `  ${col(c.dim, "API    ")} ${col(c.cyan, opts.url)}`,
        `  ${col(c.dim, "Docs   ")} ${col(c.cyan, opts.docs)}`,
        `  ${col(c.dim, "Health ")} ${col(c.cyan, opts.health)}`,
        `  ${col(c.dim, "DB     ")} ${dbStatus}`,
        `  ${col(c.dim, "CORS   ")} ${opts.corsOrigins.join(", ")}`,
        "",
        `  ${col(c.dim, "Routes")}`,
        ...opts.routes.map((r) => `    ${col(c.dim, r)}`),
        "",
    ];

    log.log(lines.join("\n"));
}
