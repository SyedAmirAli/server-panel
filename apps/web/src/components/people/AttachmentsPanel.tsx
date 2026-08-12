import { useCallback, useEffect, useRef, useState } from "react";
import {
    AlertTriangle,
    Check,
    Download,
    FileText,
    Image as ImageIcon,
    Loader2,
    Paperclip,
    ScanLine,
    Sparkles,
    StickyNote,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { peopleApi, uploadInfoItem, type FactProposalRow, type InfoItemRow } from "@/lib/people";
import { toastError, toastInfo, toastSuccess } from "@/lib/toast";

const KIND_ICON = { pdf: FileText, image: ImageIcon, textfile: FileText, note: StickyNote } as const;

/**
 * Supporting documents plus the fact review queue.
 *
 * Nothing extracted here reaches the profile on its own — facts are proposed and
 * wait for a decision, because one bad OCR pass would otherwise quietly poison
 * every resume generated afterwards.
 */
export function AttachmentsPanel({ profileId, onProfileChanged }: { profileId: string; onProfileChanged: () => Promise<void> }) {
    const [items, setItems] = useState<InfoItemRow[]>([]);
    const [facts, setFacts] = useState<FactProposalRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [noteOpen, setNoteOpen] = useState(false);
    const [note, setNote] = useState({ title: "", text: "" });
    const [viewing, setViewing] = useState<{ title: string; text: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [i, f] = await Promise.all([peopleApi.listInfoItems(profileId), peopleApi.listFacts(profileId)]);
            setItems(i.data);
            setFacts(f.data);
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not load documents");
        } finally {
            setLoading(false);
        }
    }, [profileId]);

    useEffect(() => {
        void load();
    }, [load]);

    async function handleFiles(files: FileList | null) {
        if (!files?.length) return;
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                const item = await uploadInfoItem(profileId, file);
                toastSuccess(
                    item.extractionStatus === "pending"
                        ? `${file.name} uploaded — run extraction to read it`
                        : `${file.name} uploaded`
                );
            }
            await load();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    }

    async function extract(item: InfoItemRow) {
        setBusy(item.id);
        try {
            const res = await peopleApi.extractInfoItem(item.id);
            if (res.status === "done") toastSuccess(`Read ${res.chars} characters`);
            else toastInfo(res.message ?? "Nothing extracted");
            await load();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Extraction failed");
        } finally {
            setBusy(null);
        }
    }

    async function propose(item: InfoItemRow) {
        setBusy(item.id);
        try {
            const res = await peopleApi.proposeFacts(item.id);
            toastSuccess(res.proposed ? `${res.proposed} fact(s) queued for review` : "Nothing new to propose");
            await load();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not propose facts");
        } finally {
            setBusy(null);
        }
    }

    async function view(item: InfoItemRow) {
        try {
            const full = await peopleApi.getInfoItem(item.id);
            setViewing({ title: full.title ?? full.fileName ?? "Extracted text", text: full.rawText ?? "" });
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not load text");
        }
    }

    async function download(item: InfoItemRow) {
        try {
            const { url } = await peopleApi.downloadInfoItem(item.id);
            window.open(url, "_blank", "noopener");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not create download link");
        }
    }

    async function removeItem(item: InfoItemRow) {
        setBusy(item.id);
        try {
            await peopleApi.removeInfoItem(item.id);
            toastSuccess("Removed");
            await load();
            await onProfileChanged();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not remove");
        } finally {
            setBusy(null);
        }
    }

    async function decide(fact: FactProposalRow, accept: boolean) {
        setBusy(fact.id);
        try {
            if (accept) await peopleApi.acceptFact(fact.id);
            else await peopleApi.rejectFact(fact.id);
            toastSuccess(accept ? "Added to the profile" : "Rejected");
            await load();
            if (accept) await onProfileChanged();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not save decision");
        } finally {
            setBusy(null);
        }
    }

    async function addNote() {
        if (!note.text.trim()) return;
        try {
            await peopleApi.addNote(profileId, { title: note.title || undefined, text: note.text });
            toastSuccess("Note added");
            setNote({ title: "", text: "" });
            setNoteOpen(false);
            await load();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not add note");
        }
    }

    if (loading && !items.length && !facts.length) {
        return (
            <div className="flex justify-center py-16">
                <Spinner />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* ─── review queue first: it is the thing needing a decision ─── */}
            {facts.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                                <Sparkles size={14} className="text-amber-500" />
                                {facts.length} fact{facts.length === 1 ? "" : "s"} awaiting review
                            </h2>
                            <p className="text-xs text-gray-600">
                                Nothing is added to the profile until you accept it.
                            </p>
                        </div>
                        <button
                            onClick={async () => {
                                await peopleApi.rejectAllFacts(profileId);
                                toastSuccess("Queue cleared");
                                await load();
                            }}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-white"
                        >
                            Reject all
                        </button>
                    </div>

                    <div className="space-y-2">
                        {facts.map((fact) => (
                            <div key={fact.id} className="rounded-lg border border-amber-200 bg-white p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                                            <Badge variant="info">{fact.targetType}</Badge>
                                            {typeof fact.confidence === "number" && (
                                                <span className="text-[11px] text-gray-400">
                                                    {fact.confidence}% confident
                                                </span>
                                            )}
                                            {fact.infoItem && (
                                                <span className="truncate text-[11px] text-gray-400">
                                                    from {fact.infoItem.title ?? fact.infoItem.fileName}
                                                </span>
                                            )}
                                        </div>
                                        <FactSummary targetType={fact.targetType} payload={fact.payload} />
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <button
                                            onClick={() => void decide(fact, true)}
                                            disabled={busy === fact.id}
                                            title="Add to profile"
                                            className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            {busy === fact.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                        </button>
                                        <button
                                            onClick={() => void decide(fact, false)}
                                            disabled={busy === fact.id}
                                            title="Reject"
                                            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── upload ─── */}
            <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    void handleFiles(e.dataTransfer.files);
                }}
                className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 text-center"
            >
                <Upload size={20} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-700">Drop a PDF, image or text file here</p>
                <p className="mb-3 text-xs text-gray-500">
                    Text is pulled out and turned into facts you review. Images are read with OCR. Max 25 MB.
                </p>
                <div className="flex justify-center gap-2">
                    <button
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {uploading ? "Uploading…" : "Choose file"}
                    </button>
                    <button
                        onClick={() => setNoteOpen(true)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        Write a note
                    </button>
                </div>
                <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.json"
                    onChange={(e) => void handleFiles(e.target.files)}
                    className="hidden"
                />
            </div>

            {/* ─── items ─── */}
            {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
                    No documents yet.
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((item) => {
                        const Icon = KIND_ICON[item.kind as keyof typeof KIND_ICON] ?? Paperclip;
                        const canExtract = item.kind !== "note";
                        const canPropose = item.extractionStatus === "done" || item.kind === "note";
                        return (
                            <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                                        <Icon size={16} className="mt-0.5 shrink-0 text-gray-400" />
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="truncate text-sm font-medium text-gray-900">
                                                    {item.title ?? item.fileName}
                                                </span>
                                                <StatusBadge status={item.extractionStatus} />
                                                {item._count.proposals > 0 && (
                                                    <span className="text-[11px] text-gray-400">
                                                        {item._count.proposals} proposal(s)
                                                    </span>
                                                )}
                                            </div>
                                            {item.extractionError && (
                                                <p className="mt-0.5 flex items-start gap-1 text-xs text-amber-700">
                                                    <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                                    {item.extractionError}
                                                </p>
                                            )}
                                            <p className="text-[11px] text-gray-400">
                                                {item.sizeBytes ? `${(item.sizeBytes / 1024).toFixed(0)} KB · ` : ""}
                                                {new Date(item.createdAt).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1">
                                        {canExtract && (
                                            <IconBtn
                                                title="Extract text"
                                                onClick={() => void extract(item)}
                                                loading={busy === item.id}
                                                icon={ScanLine}
                                            />
                                        )}
                                        {canPropose && (
                                            <IconBtn
                                                title="Propose facts from this"
                                                onClick={() => void propose(item)}
                                                loading={busy === item.id}
                                                icon={Sparkles}
                                            />
                                        )}
                                        <IconBtn title="View text" onClick={() => void view(item)} icon={FileText} />
                                        {item.storageKey && (
                                            <IconBtn title="Download original" onClick={() => void download(item)} icon={Download} />
                                        )}
                                        <IconBtn title="Remove" onClick={() => void removeItem(item)} icon={Trash2} danger />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <Modal isOpen={noteOpen} onClose={() => setNoteOpen(false)} title="Write a note">
                <div className="space-y-3">
                    <input
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                        placeholder="Title (optional)"
                        value={note.title}
                        onChange={(e) => setNote({ ...note, title: e.target.value })}
                    />
                    <textarea
                        rows={6}
                        autoFocus
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                        placeholder="Used Redis at Hubbers for queue caching…"
                        value={note.text}
                        onChange={(e) => setNote({ ...note, text: e.target.value })}
                    />
                    <p className="text-xs text-gray-500">
                        Stored exactly as typed — no extraction pass. You can still propose facts from it.
                    </p>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setNoteOpen(false)} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
                            Cancel
                        </button>
                        <button
                            onClick={() => void addNote()}
                            disabled={!note.text.trim()}
                            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            Save note
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={viewing !== null} onClose={() => setViewing(null)} title={viewing?.title ?? ""}>
                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                    {viewing?.text || "(no extracted text)"}
                </pre>
            </Modal>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    if (status === "done") return <Badge variant="success">extracted</Badge>;
    if (status === "pending") return <Badge variant="queued">pending</Badge>;
    if (status === "failed") return <Badge variant="warning">needs attention</Badge>;
    return <Badge variant="neutral">{status}</Badge>;
}

function IconBtn({
    title,
    onClick,
    icon: Icon,
    loading,
    danger,
}: {
    title: string;
    onClick: () => void;
    icon: typeof FileText;
    loading?: boolean;
    danger?: boolean;
}) {
    return (
        <button
            title={title}
            onClick={onClick}
            disabled={loading}
            className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${
                danger ? "text-gray-400 hover:bg-red-50 hover:text-red-600" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            }`}
        >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
        </button>
    );
}

/** Render a proposal in the shape a human can judge at a glance. */
function FactSummary({ targetType, payload }: { targetType: string; payload: Record<string, unknown> }) {
    const s = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : "");
    const arr = (k: string) => (Array.isArray(payload[k]) ? (payload[k] as string[]) : []);

    if (targetType === "experience") {
        return (
            <div className="text-sm text-gray-700">
                <span className="font-medium">
                    {s("position")} · {s("company")}
                </span>
                <span className="text-gray-400"> · {s("period")}</span>
                {s("employmentType") && <span className="text-gray-400"> · {s("employmentType")}</span>}
                <ul className="mt-0.5">
                    {arr("points").map((p, i) => (
                        <li key={i} className="text-xs text-gray-600">
                            • {p}
                        </li>
                    ))}
                </ul>
            </div>
        );
    }
    if (targetType === "project") {
        return (
            <div className="text-sm text-gray-700">
                <span className="font-medium">{s("name")}</span>
                {s("description") && <p className="text-xs text-gray-600">{s("description")}</p>}
                <div className="mt-1 flex flex-wrap gap-1">
                    {arr("stack").map((t) => (
                        <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                            {t}
                        </span>
                    ))}
                </div>
            </div>
        );
    }
    if (targetType === "skill") {
        return (
            <span className="text-sm text-gray-700">
                {s("name")} {s("category") && <span className="text-gray-400">· {s("category")}</span>}
            </span>
        );
    }
    if (targetType === "link") {
        return (
            <span className="text-sm text-gray-700">
                {s("label")} — <span className="text-xs text-gray-500">{s("url")}</span>
            </span>
        );
    }
    return (
        <span className="text-sm text-gray-700">
            <span className="font-medium">{s("key")}</span> → {s("value")}
        </span>
    );
}
