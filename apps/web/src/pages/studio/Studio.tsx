import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, ExternalLink, FileText, Play, Send, Sparkles, Wand2 } from "lucide-react";
import type { ResumeDocument } from "@appszone/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { peopleApi, type PersonRow } from "@/lib/people";
import { jobsApi, type PostingRow } from "@/lib/jobs";
import {
    routeForReference,
    studioApi,
    type ConversationDetail,
    type EntityReference,
    type TailoringOutput,
} from "@/lib/studio";
import { toastError, toastSuccess } from "@/lib/toast";
import { ResumePreview } from "@/components/studio/ResumePreview";

/**
 * One chat surface whose capability grows with context.
 *
 * With nothing selected it answers questions about the platform's own data.
 * Select a person and a job and Execute unlocks, producing a tailored resume.
 */
export function Studio() {
    const { conversationId } = useParams();
    const navigate = useNavigate();

    const [conversation, setConversation] = useState<ConversationDetail | null>(null);
    const [people, setPeople] = useState<PersonRow[]>([]);
    const [postings, setPostings] = useState<PostingRow[]>([]);
    const [question, setQuestion] = useState("");
    const [asking, setAsking] = useState(false);
    const [loading, setLoading] = useState(true);

    const [jobText, setJobText] = useState("");
    const [executing, setExecuting] = useState(false);
    const [tailoring, setTailoring] = useState<TailoringOutput | null>(null);
    const [document, setDocument] = useState<ResumeDocument | null>(null);
    const [generating, setGenerating] = useState(false);

    const bottomRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [p, j] = await Promise.all([peopleApi.list({ limit: 100 }), jobsApi.listPostings({ limit: 100 })]);
            setPeople(p.data);
            setPostings(j.data);

            if (conversationId) {
                setConversation(await studioApi.getConversation(conversationId));
            } else {
                const created = await studioApi.createConversation({});
                navigate(`/studio/${created.id}`, { replace: true });
            }
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not open the Studio");
        } finally {
            setLoading(false);
        }
    }, [conversationId, navigate]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [conversation?.messages.length, asking]);

    async function ask() {
        if (!question.trim() || !conversation) return;
        const q = question.trim();
        setQuestion("");
        setAsking(true);
        try {
            await studioApi.ask(conversation.id, q);
            setConversation(await studioApi.getConversation(conversation.id));
        } catch (err) {
            toastError(err instanceof Error ? err.message : "The assistant could not answer");
        } finally {
            setAsking(false);
        }
    }

    async function setContext(patch: { profileId?: string | null; postingId?: string | null }) {
        if (!conversation) return;
        try {
            await studioApi.setContext(conversation.id, patch);
            setConversation(await studioApi.getConversation(conversation.id));
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not update context");
        }
    }

    async function execute() {
        if (!conversation?.profileId) return;
        setExecuting(true);
        try {
            const res = await studioApi.execute({
                profileId: conversation.profileId,
                postingId: conversation.postingId ?? undefined,
                jobText: jobText.trim() || undefined,
            });
            setTailoring(res.tailoring);
            setDocument(res.document);
            toastSuccess("Draft ready — review it before generating");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Execute failed");
        } finally {
            setExecuting(false);
        }
    }

    async function generate() {
        if (!document) return;
        setGenerating(true);
        try {
            const generated = await studioApi.generate(document.id);
            setDocument(generated);
            toastSuccess(`PDF generated — ${generated.pageCount} page(s)`);
            if (generated.downloadUrl) window.open(generated.downloadUrl, "_blank", "noopener");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not generate the PDF");
        } finally {
            setGenerating(false);
        }
    }

    const canExecute = Boolean(conversation?.profileId && (conversation?.postingId || jobText.trim()));

    if (loading && !conversation) {
        return (
            <div className="flex justify-center py-24">
                <Spinner />
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                title="AI Studio"
                description={
                    conversation?.profileId
                        ? "Tailor a resume for a specific job, or just ask about your data."
                        : "Ask about your mail, jobs, storage and applications. Select a person and a job to build a resume."
                }
                actions={<Badge variant="info">{conversation?.mode ?? "general"}</Badge>}
            />

            {/* ─── context pickers ─── */}
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">Person</span>
                    <select
                        className={select}
                        value={conversation?.profileId ?? ""}
                        onChange={(e) => void setContext({ profileId: e.target.value || null })}
                    >
                        <option value="">None — general questions</option>
                        {people.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">Job</span>
                    <select
                        className={select}
                        value={conversation?.postingId ?? ""}
                        onChange={(e) => void setContext({ postingId: e.target.value || null })}
                    >
                        <option value="">None — or paste a description below</option>
                        {postings.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.title} — {p.company}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {/* ─── chat ─── */}
                <div className="flex h-[560px] flex-col rounded-xl border border-gray-200 bg-white">
                    <div className="flex-1 space-y-3 overflow-y-auto p-4">
                        {(conversation?.messages ?? []).filter((m) => m.role !== "tool").length === 0 && (
                            <div className="py-10 text-center text-sm text-gray-400">
                                <Sparkles size={20} className="mx-auto mb-2 text-gray-300" />
                                Try “how many email configs are there?” or “show me recent mail from Google”.
                            </div>
                        )}
                        {(conversation?.messages ?? [])
                            .filter((m) => m.role !== "tool")
                            .map((m) => (
                                <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
                                    <div
                                        className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                                            m.role === "user"
                                                ? "bg-indigo-600 text-white"
                                                : "bg-gray-100 text-gray-800"
                                        }`}
                                    >
                                        <p className="whitespace-pre-wrap">{m.content}</p>
                                        {m.references && (m.references as EntityReference[]).length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {(m.references as EntityReference[]).map((ref) => {
                                                    const route = routeForReference(ref);
                                                    if (!route) return null;
                                                    return (
                                                        <button
                                                            key={`${ref.type}-${ref.id}`}
                                                            onClick={() => navigate(route)}
                                                            className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50"
                                                        >
                                                            <ExternalLink size={10} />
                                                            {ref.label ?? ref.type}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        {asking && (
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                <Spinner />
                                Thinking…
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    <div className="border-t border-gray-100 p-3">
                        <div className="flex gap-2">
                            <input
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void ask()}
                                placeholder="Ask about your data…"
                                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                            />
                            <button
                                onClick={() => void ask()}
                                disabled={asking || !question.trim()}
                                className="rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                                <Send size={15} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ─── build ─── */}
                <div className="space-y-3">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <h2 className="mb-2 text-sm font-semibold text-gray-900">Build a resume</h2>
                        <textarea
                            rows={4}
                            value={jobText}
                            onChange={(e) => setJobText(e.target.value)}
                            placeholder="Paste a job description here, or pick a job above…"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                        />
                        <div className="mt-2 flex items-center gap-2">
                            <button
                                onClick={() => void execute()}
                                disabled={!canExecute || executing}
                                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                                <Wand2 size={14} />
                                {executing ? "Tailoring…" : "Execute"}
                            </button>
                            {document && (
                                <button
                                    onClick={() => void generate()}
                                    disabled={generating}
                                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    <Play size={14} />
                                    {generating ? "Generating…" : "Generate PDF"}
                                </button>
                            )}
                            {document?.storageKey && (
                                <a
                                    href={(document as ResumeDocument & { downloadUrl?: string }).downloadUrl ?? "#"}
                                    target="_blank"
                                    rel="noopener"
                                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    <Download size={14} />
                                    Download
                                </a>
                            )}
                        </div>
                        {!canExecute && (
                            <p className="mt-2 text-xs text-gray-500">
                                Select a person, and either pick a job or paste a description.
                            </p>
                        )}
                    </div>

                    {tailoring && <TailoringPanel tailoring={tailoring} />}
                </div>
            </div>

            {document && (
                <div className="mt-4">
                    <ResumePreview document={document} onChanged={setDocument} />
                </div>
            )}
        </div>
    );
}

function TailoringPanel({ tailoring }: { tailoring: TailoringOutput }) {
    const dropped = tailoring.decisions.filter((d) => !d.included);
    const kept = tailoring.decisions.filter((d) => d.included);

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <FileText size={14} className="text-gray-400" />
                What was selected
            </h2>

            {(tailoring.rejectedTechnologies.length > 0 || tailoring.unsupportedClaims.length > 0) && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                    <p className="text-xs font-medium text-amber-900">Rejected as unsupported by this profile</p>
                    {tailoring.rejectedTechnologies.length > 0 && (
                        <p className="mt-0.5 text-xs text-amber-800">
                            Technologies: {tailoring.rejectedTechnologies.join(", ")}
                        </p>
                    )}
                    {tailoring.unsupportedClaims.map((c, i) => (
                        <p key={i} className="mt-0.5 text-xs text-amber-800">
                            “{c}”
                        </p>
                    ))}
                </div>
            )}

            <div className="space-y-1">
                {kept.map((d) => (
                    <Row key={d.itemId} decision={d} />
                ))}
                {dropped.length > 0 && <p className="pt-2 text-[11px] font-medium uppercase text-gray-400">Dropped</p>}
                {dropped.map((d) => (
                    <Row key={d.itemId} decision={d} />
                ))}
            </div>
        </div>
    );
}

function Row({ decision }: { decision: TailoringOutput["decisions"][number] }) {
    return (
        <div className="flex items-start justify-between gap-2 text-xs">
            <span className={decision.included ? "text-gray-700" : "text-gray-400 line-through"}>
                {decision.itemType}
            </span>
            <span className="flex-1 text-right text-gray-500">{decision.reason}</span>
            <span className="w-6 text-right text-gray-400">{decision.overlapScore}</span>
        </div>
    );
}

const select =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
