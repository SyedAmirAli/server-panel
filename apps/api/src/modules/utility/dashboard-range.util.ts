import type { DashboardPeriod, DashboardPresetPeriod } from "@appszone/shared";

export interface ResolvedDashboardRange {
    period: DashboardPeriod;
    offset: number;
    from: Date | null;
    to: Date;
}

const PERIOD_VALUES: DashboardPresetPeriod[] = ["today", "week", "month", "year", "all"];

export function isDashboardPeriod(value: string): value is DashboardPresetPeriod {
    return (PERIOD_VALUES as string[]).includes(value);
}

function startOfUtcDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function endOfUtcDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(23, 59, 59, 999);
    return d;
}

function parseOffset(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function startOfUtcWeekContaining(date: Date, weekOffset: number): Date {
    const d = startOfUtcDay(date);
    const day = d.getUTCDay();
    const daysFromMonday = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - daysFromMonday + weekOffset * 7);
    return d;
}

function endOfUtcWeek(weekStart: Date): Date {
    const end = new Date(weekStart);
    end.setUTCDate(end.getUTCDate() + 6);
    return endOfUtcDay(end);
}

/** Resolve dashboard date window from preset period + offset or explicit fromDate/toDate. */
export function resolveDashboardRange(params: {
    period?: string;
    offset?: unknown;
    fromDate?: string;
    toDate?: string;
}): ResolvedDashboardRange {
    const fromDate = params.fromDate?.trim();
    const toDate = params.toDate?.trim();

    if (fromDate || toDate) {
        if (!fromDate || !toDate) {
            throw new Error("Both fromDate and toDate are required for a custom range");
        }
        const from = startOfUtcDay(new Date(fromDate));
        const to = endOfUtcDay(new Date(toDate));
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
            throw new Error("Invalid custom date range");
        }
        return { period: "custom", offset: 0, from, to };
    }

    const period: DashboardPresetPeriod =
        params.period && isDashboardPeriod(params.period) ? params.period : "month";
    const offset = parseOffset(params.offset);
    const now = new Date();

    switch (period) {
        case "today": {
            const from = startOfUtcDay(now);
            from.setUTCDate(from.getUTCDate() + offset);
            const to = endOfUtcDay(from);
            return { period, offset, from, to };
        }
        case "week": {
            const from = startOfUtcWeekContaining(now, offset);
            const to = endOfUtcWeek(from);
            return { period, offset, from, to };
        }
        case "month": {
            const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
            const from = startOfUtcDay(anchor);
            const to = endOfUtcDay(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)));
            return { period, offset, from, to };
        }
        case "year": {
            const year = now.getUTCFullYear() + offset;
            const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
            const to = endOfUtcDay(new Date(Date.UTC(year, 11, 31)));
            return { period, offset, from, to };
        }
        case "all":
            return { period, offset: 0, from: null, to: now };
        default: {
            const _exhaustive: never = period;
            return _exhaustive;
        }
    }
}

/** Prisma-compatible createdAt/receivedAt filter for the resolved range. */
export function prismaDateRangeFilter(range: ResolvedDashboardRange): { gte?: Date; lte: Date } | undefined {
    if (range.period === "all") return undefined;
    if (range.from) return { gte: range.from, lte: range.to };
    return { lte: range.to };
}
