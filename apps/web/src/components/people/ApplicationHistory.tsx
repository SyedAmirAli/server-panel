import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, FileText, Mail, Send } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { studioApi } from "@/lib/studio";
import { toastError, toastSuccess } from "@/lib/toast";

interface ApplicationRow {
    id: string;
    status: string;
    toEmail: string | null;
    subject: string | null;
    sentAt: string | null;
    createdAt: string;
    posting: { id: string; title: string; company: string; url: string } | null;
    profile: { id: string; name: string } | null;
    resumeDocument: { id: string; title: string; fileName: string | null; pageCount: number | null } | null;
    coverLetterDocument: { id: string; title: string } | null;
    emailConfig: { id: string; name: string; username: string } | null;
}

interface EmailConfigRow {
    id: string;
    name: string;
    username: string;
    isActive: boolean;
}

/**
 * What was applied to, with what, and from which address.
 *
 * The two document columns are the point: an application record that cannot
 * show the exact resume that went out is not really a record.
 */
export function ApplicationHistory({ profileId }: { profileId?: string }) {
    const [rows, setRows] = useState<ApplicationRow[]>([]);
    const [sent, setSent] = useState(0);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState<ApplicationRow | null>(null);
    const [configs, setConfigs] = useState<EmailConfigRow[]>([]);
    const [configId, setConfigId] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api<{ data: ApplicationRow[]; total: number; sent: number }>(
                `/admin/studio/applications${profileId ? `?profileId=${profileId}` : ""}`
            );
            setRows(res.data);
            setSent(res.sent);
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not load history");
        } finally {
            setLoading(false);
        }
    }, [profileId]);

    useEffect(() => {
        void load();
    }, [load]);

    async function openSend(row: ApplicationRow) {
        setSending(row);
        try {
            const list = await api<EmailConfigRow[]>("/admin/email-configs");
            const active = (Array.isArray(list) ? list : []).filter((c) => c.isActive);
            setConfigs(active);
            setConfigId(active[0]?.id ?? "");
        } catch {
            setConfigs([]);
        }
    }

    async function doSend() {
        if (!sending || !configId) return;
        setBusy(true);
        try {
            const res = await api<{ via: string; attachmentCount: number }>(
                `/admin/studio/applications/${sending.id}/send`,
                { method: "POST", body: { emailConfigId: configId } }
            );
            toastSuccess(`Sent via ${res.via} with ${res.attachmentCount} attachment(s)`);
            setSending(null);
            await load();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not send");
        } finally {
            setBusy(false);
        }
    }

    async function openDocument(id: string) {
        try {
            const doc = await studioApi.getDocument(id);
            if (doc.downloadUrl) window.open(doc.downloadUrl, "_blank", "noopener");
            else toastError("That document has not been generated yet");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not open the document");
        }
    }

    if (loading && !rows.length) {
        return (
            <div className="flex justify-center py-12">
                <Spinner />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-3 flex items-center gap-3 text-sm">
                <span className="font-semibold text-gray-900">{rows.length} application(s)</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-600">{sent} actually sent</span>
            </div>

            {rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
                    No applications yet.
                </div>
            ) : (
                <div className="space-y-2">
                    {rows.map((row) => (
                        <div key={row.id} className="rounded-xl border border-gray-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-sm font-medium text-gray-900">
                                            {row.posting ? `${row.posting.title} — ${row.posting.company}` : "Application"}
                                        </span>
                                        {row.status === "sent" ? (
                                            <Badge variant="success">
                                                <CheckCircle2 size={10} className="mr-0.5" />
                                                sent
                                            </Badge>
                                        ) : (
                                            <Badge variant="queued">
                                                <Clock size={10} className="mr-0.5" />
                                                {row.status}
                                            </Badge>
                                        )}
                                    </div>

                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                                        {row.toEmail && (
                                            <span className="inline-flex items-center gap-1">
                                                <Mail size={11} className="text-gray-400" />
                                                {row.toEmail}
                                            </span>
                                        )}
                                        {row.emailConfig && <span>from {row.emailConfig.username}</span>}
                                        <span>
                                            {row.sentAt
                                                ? `sent ${new Date(row.sentAt).toLocaleString()}`
                                                : `drafted ${new Date(row.createdAt).toLocaleDateString()}`}
                                        </span>
                                    </div>

                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {row.resumeDocument && (
                                            <button
                                                onClick={() => void openDocument(row.resumeDocument!.id)}
                                                className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 hover:bg-gray-200"
                                            >
                                                <FileText size={10} />
                                                {row.resumeDocument.fileName ?? row.resumeDocument.title}
                                            </button>
                                        )}
                                        {row.coverLetterDocument && (
                                            <button
                                                onClick={() => void openDocument(row.coverLetterDocument!.id)}
                                                className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 hover:bg-gray-200"
                                            >
                                                <FileText size={10} />
                                                cover letter
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {row.status !== "sent" && (
                                    <button
                                        onClick={() => void openSend(row)}
                                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                                    >
                                        <Send size={12} />
                                        Send
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal isOpen={sending !== null} onClose={() => setSending(null)} title="Send this application">
                <div className="space-y-3">
                    <p className="text-sm text-gray-600">
                        To <span className="font-medium text-gray-900">{sending?.toEmail ?? "—"}</span>
                        {sending?.resumeDocument && ` with ${sending.resumeDocument.fileName ?? "the resume"} attached`}.
                    </p>
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-600">Send from</span>
                        <select
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                            value={configId}
                            onChange={(e) => setConfigId(e.target.value)}
                        >
                            {configs.length === 0 && <option value="">No active email configs</option>}
                            {configs.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name} — {c.username}
                                </option>
                            ))}
                        </select>
                    </label>
                    <p className="text-xs text-amber-700">This cannot be unsent. Reread the draft before confirming.</p>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setSending(null)} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
                            Cancel
                        </button>
                        <button
                            onClick={() => void doSend()}
                            disabled={busy || !configId}
                            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {busy ? "Sending…" : "Send application"}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
