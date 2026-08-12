import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    AlertTriangle,
    ArrowLeft,
    Building2,
    CheckCircle2,
    Copy,
    ExternalLink,
    MapPin,
    Sparkles,
    Star,
    Trash2,
    XCircle,
} from "lucide-react";
import type { JobApplication } from "@appszone/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { StarRating, VerdictBadge } from "@/components/jobs/StarRating";
import { jobsApi, type PostingDetail } from "@/lib/jobs";
import { toastError, toastSuccess } from "@/lib/toast";
import { ApiError } from "@/lib/api";

export function JobDetail() {
    const { id = "" } = useParams();
    const navigate = useNavigate();

    const [posting, setPosting] = useState<PostingDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [drafting, setDrafting] = useState(false);
    const [busy, setBusy] = useState(false);

    const [draft, setDraft] = useState<JobApplication | null>(null);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await jobsApi.getPosting(id);
            setPosting(data);
            const latest = data.applications?.[0] ?? null;
            setDraft(latest);
            setSubject(latest?.subject ?? "");
            setBody(latest?.body ?? "");
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not load the posting");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void load();
    }, [load]);

    async function generate() {
        setDrafting(true);
        try {
            const application = await jobsApi.generateApplication(id);
            setDraft(application);
            setSubject(application.subject ?? "");
            setBody(application.body ?? "");
            toastSuccess("Draft ready — attach your CV before sending");
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not draft an application");
        } finally {
            setDrafting(false);
        }
    }

    async function saveDraft() {
        if (!draft) return;
        setBusy(true);
        try {
            const updated = await jobsApi.updateApplication(draft.id, { subject, body });
            setDraft(updated);
            toastSuccess("Draft saved");
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not save the draft");
        } finally {
            setBusy(false);
        }
    }

    async function markSent() {
        if (!draft) return;
        setBusy(true);
        try {
            await jobsApi.markSent(draft.id);
            toastSuccess("Marked as applied");
            await load();
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not mark as sent");
        } finally {
            setBusy(false);
        }
    }

    async function setStatus(status: string, label: string) {
        setBusy(true);
        try {
            await jobsApi.setPostingStatus(id, status);
            toastSuccess(label);
            await load();
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not update");
        } finally {
            setBusy(false);
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center py-24">
                <Spinner size="lg" />
            </div>
        );
    }

    if (!posting) return null;

    const match = posting.match ?? posting.matches?.[0] ?? null;

    return (
        <div>
            <PageHeader
                title={posting.title}
                description={`${posting.company}${posting.location ? ` · ${posting.location}` : ""}`}
                nav={
                    <button
                        type="button"
                        onClick={() => navigate("/jobs")}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        aria-label="Back to found jobs"
                    >
                        <ArrowLeft size={16} />
                    </button>
                }
                actions={
                    <>
                        <a
                            href={posting.applyUrl ?? posting.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                        >
                            <ExternalLink size={14} /> Original
                        </a>
                        <button
                            type="button"
                            onClick={() => void setStatus("shortlisted", "Shortlisted")}
                            disabled={busy || posting.status === "shortlisted"}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                            <Star size={14} /> Shortlist
                        </button>
                        <button
                            type="button"
                            onClick={() => void setStatus("dismissed", "Dismissed")}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                            <XCircle size={14} /> Dismiss
                        </button>
                    </>
                }
            />

            <div className="grid gap-5 lg:grid-cols-3">
                {/* Left: fit + facts */}
                <div className="space-y-5">
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Fit</h2>

                        {match ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <StarRating stars={match.stars} size={18} />
                                    <VerdictBadge verdict={match.verdict} />
                                    <span className="ml-auto text-xs text-gray-400">{match.score}/100</span>
                                </div>

                                {match.summary && <p className="text-sm leading-relaxed text-gray-600">{match.summary}</p>}

                                {match.strengths && match.strengths.length > 0 && (
                                    <div>
                                        <p className="mb-1 text-xs font-semibold text-emerald-700">Why you fit</p>
                                        <ul className="space-y-1">
                                            {match.strengths.map((s) => (
                                                <li key={s} className="flex gap-1.5 text-xs text-gray-600">
                                                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                                                    {s}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {match.gaps && match.gaps.length > 0 && (
                                    <div>
                                        <p className="mb-1 text-xs font-semibold text-amber-700">Gaps to be aware of</p>
                                        <ul className="space-y-1">
                                            {match.gaps.map((g) => (
                                                <li key={g} className="flex gap-1.5 text-xs text-gray-600">
                                                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
                                                    {g}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">
                                Not rated yet. Import your CV in Settings, then re-rate this posting.
                            </p>
                        )}
                    </section>

                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Details</h2>
                        <dl className="space-y-2 text-sm">
                            <Fact icon={Building2} label="Company" value={posting.company} />
                            <Fact icon={MapPin} label="Location" value={posting.location ?? "Not stated"} />
                            <Fact label="Type" value={posting.employmentType ?? "Not stated"} />
                            <Fact label="Salary" value={posting.salaryRaw ?? "Not stated"} />
                            <Fact label="Source" value={posting.sourceName ?? "—"} />
                            <Fact
                                label="Posted"
                                value={posting.postedAt ? new Date(posting.postedAt).toLocaleString() : "Not stated"}
                            />
                            {posting.applyEmail && <Fact label="Apply to" value={posting.applyEmail} />}
                        </dl>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {posting.isRemote && <Badge variant="success">Remote</Badge>}
                            <Badge variant="neutral">{posting.status}</Badge>
                            {(posting.tags ?? []).slice(0, 6).map((tag) => (
                                <Badge key={tag} variant="neutral">
                                    {tag}
                                </Badge>
                            ))}
                        </div>
                    </section>
                </div>

                {/* Right: application + description */}
                <div className="space-y-5 lg:col-span-2">
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                                Application email
                            </h2>
                            <button
                                type="button"
                                onClick={() => void generate()}
                                disabled={drafting}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                            >
                                {drafting ? (
                                    <Spinner size="sm" className="border-white/40 border-t-white" />
                                ) : (
                                    <Sparkles size={14} />
                                )}
                                {draft ? "Regenerate" : "Draft application"}
                            </button>
                        </div>

                        {draft ? (
                            <div className="space-y-3">
                                {draft.gapsNote && (
                                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                                        <strong className="font-semibold">For you, not the recruiter:</strong>{" "}
                                        {draft.gapsNote}
                                    </p>
                                )}

                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-gray-500">Subject</span>
                                    <input
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                                    />
                                </label>

                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-gray-500">Body</span>
                                    <textarea
                                        value={body}
                                        onChange={(e) => setBody(e.target.value)}
                                        rows={16}
                                        className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-indigo-400"
                                    />
                                </label>

                                <p className="text-xs text-gray-400">
                                    Attach your CV yourself before sending — this drafts, it never sends.
                                </p>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void saveDraft()}
                                        disabled={busy}
                                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                                    >
                                        Save
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void navigator.clipboard.writeText(`${subject}\n\n${body}`);
                                            toastSuccess("Copied to clipboard");
                                        }}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                                    >
                                        <Copy size={14} /> Copy
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void markSent()}
                                        disabled={busy || draft.status === "sent"}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                                    >
                                        <CheckCircle2 size={14} />
                                        {draft.status === "sent" ? "Sent" : "Mark as sent"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            await jobsApi.deleteApplication(draft.id);
                                            setDraft(null);
                                            setSubject("");
                                            setBody("");
                                            toastSuccess("Draft deleted");
                                        }}
                                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">
                                No draft yet. Generating one writes a short, CV-grounded email — no links, nothing your
                                CV doesn&apos;t back up — and reports any gaps separately.
                            </p>
                        )}
                    </section>

                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                            Job description
                        </h2>
                        {posting.description ? (
                            <pre className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-600">
                                {posting.description}
                            </pre>
                        ) : (
                            <p className="text-sm text-gray-500">
                                This source didn&apos;t include a description — open the original posting.
                            </p>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}

function Fact({
    icon: Icon,
    label,
    value,
}: {
    icon?: typeof Building2;
    label: string;
    value: string;
}) {
    return (
        <div className="flex gap-2">
            <dt className="flex w-24 shrink-0 items-center gap-1.5 text-xs text-gray-400">
                {Icon && <Icon size={13} />}
                {label}
            </dt>
            <dd className="min-w-0 flex-1 break-words text-sm text-gray-700">{value}</dd>
        </div>
    );
}
