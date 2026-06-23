import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    Activity,
    AlertCircle,
    ArrowRight,
    CheckCheck,
    ChevronLeft,
    ChevronRight,
    Clock,
    HardDrive,
    Inbox,
    Key,
    Mail,
    RefreshCw,
    ScrollText,
    Send,
    Server,
} from "lucide-react";
import type { DashboardPresetPeriod, DashboardStats } from "@appszone/shared";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";

const PERIODS: { id: DashboardPresetPeriod; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
    { id: "year", label: "Year" },
    { id: "all", label: "All" },
];

function fmtNum(n: number) {
    return n.toLocaleString();
}

function fmtShortDate(iso: string) {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(iso));
}

function formatRangeLabel(stats: DashboardStats) {
    const { range } = stats;
    if (range.period === "all") return "All time";
    if (range.period === "today") return fmtShortDate(range.to);
    if (range.period === "month") {
        return new Intl.DateTimeFormat("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        }).format(new Date(range.from!));
    }
    if (range.period === "year") {
        return new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" }).format(new Date(range.from!));
    }
    if (range.from) return `${fmtShortDate(range.from)} – ${fmtShortDate(range.to)}`;
    return fmtShortDate(range.to);
}

function buildDashboardUrl(period: DashboardPresetPeriod, offset: number) {
    const params = new URLSearchParams({ period });
    if (offset !== 0 && period !== "all") params.set("offset", String(offset));
    return `/utility/dashboard?${params}`;
}

interface StatCardProps {
    label: string;
    value: number;
    hint?: string;
    icon: typeof Mail;
    tone: "brand" | "emerald" | "amber" | "red" | "slate";
    to?: string;
}

const toneStyles = {
    brand: {
        wrap: "border-indigo-100 bg-linear-to-br from-indigo-50/80 to-white",
        icon: "bg-indigo-100 text-indigo-600",
    },
    emerald: {
        wrap: "border-emerald-100 bg-linear-to-br from-emerald-50/80 to-white",
        icon: "bg-emerald-100 text-emerald-600",
    },
    amber: {
        wrap: "border-amber-100 bg-linear-to-br from-amber-50/80 to-white",
        icon: "bg-amber-100 text-amber-600",
    },
    red: {
        wrap: "border-red-100 bg-linear-to-br from-red-50/80 to-white",
        icon: "bg-red-100 text-red-600",
    },
    slate: {
        wrap: "border-gray-200 bg-linear-to-br from-gray-50/80 to-white",
        icon: "bg-gray-100 text-gray-600",
    },
};

function StatCard({ label, value, hint, icon: Icon, tone, to }: StatCardProps) {
    const styles = toneStyles[tone];
    const inner = (
        <div className={`rounded-xl border p-5 shadow-sm transition-shadow ${styles.wrap} ${to ? "hover:shadow-md" : ""}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
                    <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-gray-900">{fmtNum(value)}</p>
                    {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
                </div>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}>
                    <Icon size={18} />
                </div>
            </div>
        </div>
    );

    if (to) {
        return (
            <Link to={to} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 rounded-xl">
                {inner}
            </Link>
        );
    }
    return inner;
}

interface InventoryCardProps {
    label: string;
    total: number;
    active: number;
    icon: typeof Key;
    to: string;
}

function InventoryCard({ label, total, active, icon: Icon, to }: InventoryCardProps) {
    return (
        <Link
            to={to}
            className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
        >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100">
                <Icon size={20} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                    <span className="font-semibold text-emerald-600">{fmtNum(active)}</span> active · {fmtNum(total)} total
                </p>
            </div>
            <ArrowRight size={16} className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-500" />
        </Link>
    );
}

export function Dashboard() {
    const [period, setPeriod] = useState<DashboardPresetPeriod>("month");
    const [offset, setOffset] = useState(0);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api<DashboardStats>(buildDashboardUrl(period, offset));
            setStats(data);
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Failed to load dashboard stats");
        } finally {
            setLoading(false);
        }
    }, [period, offset]);

    useEffect(() => {
        load();
    }, [load]);

    function selectPeriod(next: DashboardPresetPeriod) {
        setPeriod(next);
        setOffset(0);
    }

    const canNavigate = period !== "all";
    const deliveryRate =
        stats && stats.activity.sentMessages > 0
            ? Math.round((stats.activity.sent / stats.activity.sentMessages) * 100)
            : null;

    return (
        <>
            <PageHeader
                title="Dashboard"
                description="Platform overview — inventory totals, delivery activity for the selected window, and live inbox queue."
                breadcrumb={[{ label: "Mail Admin" }, { label: "Dashboard", active: true }]}
                onRefresh={load}
                refreshing={loading}
                nav={
                    <>
                        <button
                            type="button"
                            onClick={() => setOffset((o) => o - 1)}
                            disabled={!canNavigate || loading}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Previous period"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={load}
                            disabled={loading}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
                            aria-label="Refresh"
                        >
                            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setOffset((o) => o + 1)}
                            disabled={!canNavigate || loading}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Next period"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </>
                }
            />

            {/* Period tabs + range label */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
                    {PERIODS.map(({ id, label }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => selectPeriod(id)}
                            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                                period === id
                                    ? "bg-indigo-600 text-white shadow-sm"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {stats && (
                    <p className="text-sm text-gray-500">
                        Showing <span className="font-medium text-gray-800">{formatRangeLabel(stats)}</span>
                        {stats.range.offset !== 0 && canNavigate && (
                            <span className="ml-1 text-gray-400">(offset {stats.range.offset})</span>
                        )}
                    </p>
                )}
            </div>

            {loading && !stats ? (
                <div className="flex items-center justify-center py-24">
                    <Spinner size="lg" />
                </div>
            ) : stats ? (
                <div className={`space-y-8 transition-opacity ${loading ? "opacity-60" : ""}`}>
                    {/* Live snapshot */}
                    <section>
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Live</h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <StatCard
                                label="Inbox unread"
                                value={stats.snapshot.inboxUnread}
                                hint="Current unread across all mailboxes"
                                icon={Inbox}
                                tone="brand"
                                to="/inbox"
                            />
                            <StatCard
                                label="Send queue"
                                value={stats.snapshot.sentQueued}
                                hint="Messages waiting to deliver"
                                icon={Clock}
                                tone="amber"
                                to="/sent-messages"
                            />
                        </div>
                    </section>

                    {/* Activity for selected period */}
                    <section>
                        <div className="mb-3 flex items-end justify-between gap-4">
                            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                                Activity · {formatRangeLabel(stats)}
                            </h2>
                            {deliveryRate !== null && (
                                <span className="text-xs text-gray-500">
                                    Delivery rate{" "}
                                    <span className="font-semibold text-emerald-600">{deliveryRate}%</span>
                                </span>
                            )}
                        </div>

                        {deliveryRate !== null && stats.activity.sentMessages > 0 && (
                            <div className="mb-4 h-2 overflow-hidden rounded-full bg-gray-100">
                                <div
                                    className="h-full rounded-full bg-linear-to-r from-emerald-500 to-emerald-400 transition-all"
                                    style={{ width: `${deliveryRate}%` }}
                                />
                            </div>
                        )}

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <StatCard
                                label="Delivered"
                                value={stats.activity.sent}
                                hint="Successfully sent in window"
                                icon={CheckCheck}
                                tone="emerald"
                                to="/sent-messages"
                            />
                            <StatCard
                                label="Failed"
                                value={stats.activity.sentFailed}
                                hint="Delivery failures in window"
                                icon={AlertCircle}
                                tone="red"
                                to="/sent-messages"
                            />
                            <StatCard
                                label="Outbound total"
                                value={stats.activity.sentMessages}
                                hint="All send attempts in window"
                                icon={Send}
                                tone="brand"
                                to="/sent-messages"
                            />
                            <StatCard
                                label="Inbox received"
                                value={stats.activity.mailMessages}
                                hint="Synced messages in window"
                                icon={Mail}
                                tone="slate"
                                to="/inbox"
                            />
                            <StatCard
                                label="Queued (period)"
                                value={stats.activity.queued}
                                hint="Queued sends created in window"
                                icon={Clock}
                                tone="amber"
                            />
                            <StatCard
                                label="Audit events"
                                value={stats.activity.auditLogs}
                                hint="Logged actions in window"
                                icon={ScrollText}
                                tone="slate"
                                to="/audit-log"
                            />
                        </div>
                    </section>

                    {/* Inventory (all-time) */}
                    <section>
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Inventory</h2>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <InventoryCard
                                label="API Keys"
                                total={stats.inventory.totalApiKeys}
                                active={stats.inventory.activeApiKeys}
                                icon={Key}
                                to="/keys"
                            />
                            <InventoryCard
                                label="Mailboxes"
                                total={stats.inventory.totalMailboxes}
                                active={stats.inventory.activeMailboxes}
                                icon={HardDrive}
                                to="/mailboxes"
                            />
                            <InventoryCard
                                label="Email configs"
                                total={stats.inventory.totalEmailConfigs}
                                active={stats.inventory.activeEmailConfigs}
                                icon={Server}
                                to="/email-configs"
                            />
                        </div>
                    </section>

                    {/* Quick actions */}
                    <section>
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Quick actions</h2>
                        <div className="flex flex-wrap gap-3">
                            <Link
                                to="/send"
                                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
                            >
                                <Send size={15} />
                                Send mail
                            </Link>
                            <Link
                                to="/inbox"
                                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                            >
                                <Inbox size={15} />
                                Open inbox
                            </Link>
                            <Link
                                to="/docs"
                                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                            >
                                <Activity size={15} />
                                API docs
                            </Link>
                        </div>
                    </section>
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
                    <p className="text-sm text-gray-500">Could not load dashboard stats.</p>
                    <button
                        type="button"
                        onClick={load}
                        className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                    >
                        Try again
                    </button>
                </div>
            )}
        </>
    );
}
