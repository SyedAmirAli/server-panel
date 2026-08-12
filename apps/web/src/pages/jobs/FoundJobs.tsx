import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Briefcase,
    ExternalLink,
    Eye,
    Link2,
    Play,
    RefreshCw,
    Send,
    Settings,
    Star,
    Trash2,
    XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListPageCard, ListTableHead } from "@/components/ui/ListPageCard";
import { Modal } from "@/components/ui/Modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/RowMenu";
import { StarRating, VerdictBadge } from "@/components/jobs/StarRating";
import { jobsApi, type PostingRow, type PostingsPage } from "@/lib/jobs";
import { studioApi } from "@/lib/studio";
import { peopleApi } from "@/lib/people";
import { toastError, toastInfo, toastSuccess } from "@/lib/toast";
import { ApiError } from "@/lib/api";

const STAR_FILTERS = [
    { label: "All", value: 0 },
    { label: "3★+", value: 3 },
    { label: "4★+", value: 4 },
    { label: "5★", value: 5 },
];

const STATUS_FILTERS = [
    { label: "Open", value: "" },
    { label: "Shortlisted", value: "shortlisted" },
    { label: "Applied", value: "applied" },
    { label: "Dismissed", value: "dismissed" },
];

export function FoundJobs() {
    const navigate = useNavigate();

    const [page, setPage] = useState(1);
    const [minStars, setMinStars] = useState(0);
    const [status, setStatus] = useState("");
    const [search, setSearch] = useState("");

    const [result, setResult] = useState<PostingsPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [running, setRunning] = useState(false);

    const [importOpen, setImportOpen] = useState(false);
    const [importUrl, setImportUrl] = useState("");
    const [importing, setImporting] = useState(false);

    /**
     * Applying opens a Studio conversation about this job rather than a form.
     *
     * An existing thread for the same posting is reused — clicking Apply twice
     * should return you to the conversation you already started, not scatter
     * duplicates through the history.
     */
    const applyToPosting = useCallback(
        async (posting: PostingRow) => {
            setBusyId(posting.id);
            try {
                const existing = (await studioApi.listConversations()).find((c) => c.posting?.id === posting.id);
                if (existing) {
                    navigate(`/studio/${existing.id}?jobId=${posting.id}`);
                    return;
                }
                // Attach the default candidate so the thread starts in tailoring
                // mode instead of asking who it is for.
                const people = await peopleApi.list({ limit: 1 }).catch(() => null);
                const created = await studioApi.createConversation({
                    profileId: people?.data[0]?.id,
                    postingId: posting.id,
                });
                navigate(`/studio/${created.id}?jobId=${posting.id}`);
            } catch (err) {
                toastError(err instanceof Error ? err.message : "Could not open a conversation for this job");
            } finally {
                setBusyId(null);
            }
        },
        [navigate]
    );

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setResult(
                await jobsApi.listPostings({
                    page,
                    limit: 25,
                    minStars: minStars || undefined,
                    status: status || undefined,
                    search: search.trim() || undefined,
                })
            );
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not load jobs");
        } finally {
            setLoading(false);
        }
    }, [page, minStars, status, search]);

    useEffect(() => {
        void load();
    }, [load]);

    // Reset to the first page whenever a filter narrows the result set.
    useEffect(() => {
        setPage(1);
    }, [minStars, status, search]);

    async function findNow() {
        setRunning(true);
        try {
            const { id } = await jobsApi.startRun();
            toastInfo("Discovery started — follow it in Settings");
            navigate(`/jobs/settings?run=${id}`);
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not start a run");
        } finally {
            setRunning(false);
        }
    }

    async function setStatusFor(posting: PostingRow, next: string, label: string) {
        setBusyId(posting.id);
        try {
            await jobsApi.setPostingStatus(posting.id, next);
            toastSuccess(`${posting.title} — ${label}`);
            await load();
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not update the posting");
        } finally {
            setBusyId(null);
        }
    }

    async function rescore(posting: PostingRow) {
        setBusyId(posting.id);
        try {
            const match = await jobsApi.rescore(posting.id);
            toastSuccess(`Re-rated at ${match.stars}★`);
            await load();
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not re-rate");
        } finally {
            setBusyId(null);
        }
    }

    async function remove(posting: PostingRow) {
        setBusyId(posting.id);
        try {
            await jobsApi.deletePosting(posting.id);
            toastSuccess("Posting deleted");
            await load();
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not delete");
        } finally {
            setBusyId(null);
        }
    }

    async function submitImport() {
        if (!importUrl.trim()) return;
        setImporting(true);
        try {
            const posting = await jobsApi.importUrl(importUrl.trim());
            toastSuccess("Job imported and rated");
            setImportOpen(false);
            setImportUrl("");
            navigate(`/jobs/${posting.id}`);
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not import that URL");
        } finally {
            setImporting(false);
        }
    }

    const rows = result?.data ?? [];
    const unscored = useMemo(() => rows.filter((r) => !r.match).length, [rows]);

    return (
        <div>
            <PageHeader
                title="Found Jobs"
                description="Postings discovered across your active sources, newest first, rated 1–5 against your CV."
                onRefresh={() => void load()}
                refreshing={loading}
                actions={
                    <>
                        <button
                            type="button"
                            onClick={() => setImportOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                        >
                            <Link2 size={14} /> Import URL
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate("/jobs/settings")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                        >
                            <Settings size={14} /> Settings
                        </button>
                        <button
                            type="button"
                            onClick={() => void findNow()}
                            disabled={running}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
                        >
                            {running ? <Spinner size="sm" className="border-white/40 border-t-white" /> : <Play size={14} />}
                            Find Now
                        </button>
                    </>
                }
            />

            {/* Filters */}
            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center">
                <div className="flex items-center gap-1.5">
                    <Star size={15} className="text-gray-400" />
                    {STAR_FILTERS.map((f) => (
                        <button
                            key={f.value}
                            type="button"
                            onClick={() => setMinStars(f.value)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                                minStars === f.value
                                    ? "bg-indigo-50 text-indigo-600"
                                    : "text-gray-500 hover:bg-gray-100"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-1.5 sm:border-l sm:border-gray-200 sm:pl-3">
                    {STATUS_FILTERS.map((f) => (
                        <button
                            key={f.value}
                            type="button"
                            onClick={() => setStatus(f.value)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                                status === f.value ? "bg-indigo-50 text-indigo-600" : "text-gray-500 hover:bg-gray-100"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search title, company or location…"
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 sm:ml-auto sm:max-w-xs"
                />
            </div>

            {unscored > 0 && (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
                    {unscored} posting{unscored === 1 ? "" : "s"} on this page {unscored === 1 ? "is" : "are"} unrated —
                    import your CV in Settings, then re-rate.
                </p>
            )}

            <ListPageCard>
                {loading && !result ? (
                    <div className="flex justify-center py-20">
                        <Spinner size="lg" />
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={Briefcase}
                        title="No jobs yet"
                        description='Run a discovery pass with "Find Now", or import a single posting by URL.'
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-gray-100 bg-gray-50/60">
                                <tr>
                                    <ListTableHead>Role</ListTableHead>
                                    <ListTableHead>Fit</ListTableHead>
                                    <ListTableHead>Location</ListTableHead>
                                    <ListTableHead>Source</ListTableHead>
                                    <ListTableHead>Posted</ListTableHead>
                                    <ListTableHead>Actions</ListTableHead>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {rows.map((posting) => (
                                    <JobRow
                                        key={posting.id}
                                        posting={posting}
                                        busy={busyId === posting.id}
                                        onOpen={() => navigate(`/jobs/${posting.id}`)}
                                        onApply={() => void applyToPosting(posting)}
                                        onShortlist={() => void setStatusFor(posting, "shortlisted", "shortlisted")}
                                        onDismiss={() => void setStatusFor(posting, "dismissed", "dismissed")}
                                        onRescore={() => void rescore(posting)}
                                        onDelete={() => void remove(posting)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {result && result.lastPage > 1 && (
                    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
                        <span>
                            Page {result.currentPage} of {result.lastPage} · {result.total} job
                            {result.total === 1 ? "" : "s"}
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => p - 1)}
                                className="rounded-lg border border-gray-200 px-3 py-1 hover:bg-gray-50 disabled:opacity-40"
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                disabled={!result.hasMore}
                                onClick={() => setPage((p) => p + 1)}
                                className="rounded-lg border border-gray-200 px-3 py-1 hover:bg-gray-50 disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </ListPageCard>

            <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Import a job by URL">
                <div className="space-y-3">
                    <p className="text-sm text-gray-500">
                        Paste a job posting URL. The page is fetched, normalized and rated against your CV.
                    </p>
                    <input
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        placeholder="https://company.com/careers/backend-engineer"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setImportOpen(false)}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => void submitImport()}
                            disabled={importing || !importUrl.trim()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                            {importing && <Spinner size="sm" className="border-white/40 border-t-white" />}
                            Import
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function JobRow({
    posting,
    busy,
    onOpen,
    onApply,
    onShortlist,
    onDismiss,
    onRescore,
    onDelete,
}: {
    posting: PostingRow;
    busy: boolean;
    onOpen: () => void;
    onApply: () => void;
    onShortlist: () => void;
    onDismiss: () => void;
    onRescore: () => void;
    onDelete: () => void;
}) {
    const items: RowMenuItem[] = [
        { key: "details", label: "Details", icon: Eye, onClick: onOpen },
        { key: "shortlist", label: "Shortlist", icon: Star, onClick: onShortlist, disabled: posting.status === "shortlisted" },
        { key: "rescore", label: "Re-rate against CV", icon: RefreshCw, onClick: onRescore, loading: busy },
        { key: "dismiss", label: "Dismiss", icon: XCircle, onClick: onDismiss },
        { key: "delete", label: "Delete", icon: Trash2, onClick: onDelete, tone: "danger" },
    ];

    return (
        <tr className="hover:bg-gray-50/60">
            {/* RowMenu leads the first column, beside the name. */}
            <td className="px-4 py-3">
                <div className="flex items-start gap-2">
                    <RowMenu items={items} align="left" />
                    <div className="min-w-0">
                        <button
                            type="button"
                            onClick={onOpen}
                            className="block max-w-md truncate text-left text-sm font-medium text-gray-900 hover:text-indigo-600"
                        >
                            {posting.title}
                        </button>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{posting.company}</p>
                    </div>
                </div>
            </td>

            <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                    <StarRating stars={posting.match?.stars} />
                    <VerdictBadge verdict={posting.match?.verdict} />
                </div>
            </td>

            <td className="px-4 py-3">
                <span className="text-sm text-gray-600">{posting.location ?? "—"}</span>
                {posting.isRemote && (
                    <span className="ml-1.5 align-middle">
                        <Badge variant="success">Remote</Badge>
                    </span>
                )}
            </td>

            <td className="px-4 py-3 text-xs text-gray-500">{posting.sourceName ?? "—"}</td>

            <td className="px-4 py-3 text-xs text-gray-500">{formatWhen(posting.postedAt ?? posting.discoveredAt)}</td>

            <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={onApply}
                        title="Open a Studio conversation about this job"
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                        <Send size={12} /> Apply
                    </button>
                    <a
                        href={posting.applyUrl ?? posting.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Open the original posting"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                    >
                        <ExternalLink size={12} />
                    </a>
                </div>
            </td>
        </tr>
    );
}

/** Relative for the first day, absolute after — the list is 24h-centric. */
function formatWhen(value: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
