import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Download, FileText, Mail, Paperclip, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import { toastError, toastSuccess } from "@/lib/toast";

interface Preview {
    applicationId: string;
    status: string;
    toEmail: string | null;
    subject: string | null;
    body: string | null;
    gapsNote: string | null;
    fromOptions: Array<{ id: string; name: string; username: string }>;
    selectedEmailConfigId: string | null;
    attachments: Array<{
        documentId: string;
        kind: string;
        title: string;
        fileName: string | null;
        pageCount: number | null;
        sizeBytes: number | null;
        downloadUrl: string | null;
    }>;
    warnings: string[];
    posting: { id: string; title: string; company: string } | null;
    profile: { id: string; name: string } | null;
}

/**
 * The approval step.
 *
 * The whole application as it will actually go out — recipient, sending address,
 * subject, body and the attached files — with Send and Cancel. Nothing above
 * this point can send anything; the assistant prepares, a person approves.
 *
 * Editable in place, because the most likely outcome of reading a generated
 * email is wanting to change one line of it.
 */
export function ApplicationPreview({ applicationId, onSent }: { applicationId: string; onSent?: () => void }) {
    const [preview, setPreview] = useState<Preview | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({ subject: "", body: "", toEmail: "" });
    const [fromId, setFromId] = useState("");
    const [confirming, setConfirming] = useState(false);

    const load = useCallback(async () => {
        try {
            const p = await api<Preview>(`/admin/studio/applications/${applicationId}/preview`);
            setPreview(p);
            setDraft({ subject: p.subject ?? "", body: p.body ?? "", toEmail: p.toEmail ?? "" });
            setFromId(p.selectedEmailConfigId ?? p.fromOptions[0]?.id ?? "");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not load the application");
        } finally {
            setLoading(false);
        }
    }, [applicationId]);

    useEffect(() => {
        void load();
    }, [load]);

    async function saveEdits() {
        setBusy(true);
        try {
            const p = await api<{ data: Preview }>(`/admin/studio/applications/${applicationId}/preview`, {
                method: "PUT",
                body: draft,
            });
            setPreview(p.data);
            setEditing(false);
            toastSuccess("Updated");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not save");
        } finally {
            setBusy(false);
        }
    }

    async function send() {
        setBusy(true);
        try {
            const res = await api<{ data: { via: string; attachmentCount: number } }>(
                `/admin/studio/applications/${applicationId}/send`,
                { method: "POST", body: { emailConfigId: fromId, toEmail: draft.toEmail || undefined } }
            );
            toastSuccess(`Sent via ${res.data.via} with ${res.data.attachmentCount} attachment(s)`);
            setConfirming(false);
            await load();
            onSent?.();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not send");
        } finally {
            setBusy(false);
        }
    }

    async function cancel() {
        setBusy(true);
        try {
            await api(`/admin/studio/applications/${applicationId}/cancel`, { method: "POST", body: {} });
            toastSuccess("Application cancelled — nothing was sent");
            await load();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not cancel");
        } finally {
            setBusy(false);
        }
    }

    if (loading) return <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-400">Loading application…</div>;
    if (!preview) return null;

    const sent = preview.status === "sent";
    const canSend = Boolean(fromId && draft.toEmail.includes("@"));

    return (
        <div className="mt-2 overflow-hidden rounded-xl border border-indigo-200 bg-white">
            <div className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50/60 px-3 py-2">
                <Mail size={13} className="text-indigo-500" />
                <span className="text-xs font-semibold text-gray-800">
                    {sent ? "Application sent" : "Application ready to send"}
                </span>
                {preview.posting && (
                    <span className="truncate text-[11px] text-gray-500">
                        · {preview.posting.title} at {preview.posting.company}
                    </span>
                )}
                {sent && <Check size={13} className="ml-auto text-emerald-600" />}
            </div>

            {preview.warnings.length > 0 && (
                <div className="border-b border-amber-100 bg-amber-50 px-3 py-2">
                    {preview.warnings.map((w, i) => (
                        <p key={i} className="flex items-start gap-1 text-[11px] text-amber-800">
                            <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                            {w}
                        </p>
                    ))}
                </div>
            )}

            <div className="space-y-2 p-3">
                {/* the email itself */}
                <Row label="To">
                    {editing ? (
                        <input
                            value={draft.toEmail}
                            onChange={(e) => setDraft({ ...draft, toEmail: e.target.value })}
                            placeholder="careers@company.com"
                            className={field}
                        />
                    ) : (
                        <span className={draft.toEmail ? "text-gray-800" : "text-amber-700"}>
                            {draft.toEmail || "No recipient yet — add one before sending"}
                        </span>
                    )}
                </Row>

                {!sent && (
                    <Row label="From">
                        <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={field}>
                            {preview.fromOptions.length === 0 && <option value="">No active email accounts</option>}
                            {preview.fromOptions.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.name} — {o.username}
                                </option>
                            ))}
                        </select>
                    </Row>
                )}

                <Row label="Subject">
                    {editing ? (
                        <input
                            value={draft.subject}
                            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                            className={field}
                        />
                    ) : (
                        <span className="text-gray-800">{draft.subject}</span>
                    )}
                </Row>

                <div>
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        Message
                    </span>
                    {editing ? (
                        <textarea
                            rows={9}
                            value={draft.body}
                            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                            className={field}
                        />
                    ) : (
                        <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-2.5 text-xs leading-relaxed text-gray-700">
                            {draft.body}
                        </p>
                    )}
                </div>

                {/* attachments */}
                <div>
                    <span className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        <Paperclip size={9} />
                        Attachments ({preview.attachments.length})
                    </span>
                    <div className="space-y-1">
                        {preview.attachments.length === 0 && (
                            <p className="text-[11px] text-amber-700">Nothing attached yet.</p>
                        )}
                        {preview.attachments.map((a) => (
                            <div
                                key={a.documentId}
                                className="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5"
                            >
                                <FileText size={12} className="shrink-0 text-gray-400" />
                                <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                                    {a.fileName ?? a.title}
                                </span>
                                <span className="shrink-0 text-[10px] text-gray-400">
                                    {a.pageCount ? `${a.pageCount}p` : ""}
                                    {a.sizeBytes ? ` · ${(a.sizeBytes / 1024).toFixed(0)}KB` : ""}
                                </span>
                                {a.downloadUrl && (
                                    <a
                                        href={a.downloadUrl}
                                        target="_blank"
                                        rel="noopener"
                                        title="Open"
                                        className="shrink-0 text-gray-400 hover:text-indigo-600"
                                    >
                                        <Download size={12} />
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {preview.gapsNote && (
                    <p className="rounded-lg bg-gray-50 p-2 text-[11px] text-gray-500">{preview.gapsNote}</p>
                )}

                {/* actions */}
                {!sent && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        {confirming ? (
                            <>
                                <span className="text-xs text-gray-700">
                                    Send to <span className="font-medium">{draft.toEmail}</span>? This cannot be undone.
                                </span>
                                <button onClick={() => void send()} disabled={busy} className={sendBtn}>
                                    {busy ? "Sending…" : "Yes, send"}
                                </button>
                                <button onClick={() => setConfirming(false)} className={ghostBtn}>
                                    Back
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => setConfirming(true)}
                                    disabled={busy || !canSend}
                                    title={canSend ? "" : "Set a recipient and a sending account first"}
                                    className={sendBtn}
                                >
                                    <Send size={12} />
                                    Send
                                </button>
                                <button
                                    onClick={() => (editing ? void saveEdits() : setEditing(true))}
                                    disabled={busy}
                                    className={ghostBtn}
                                >
                                    {editing ? "Save changes" : "Edit"}
                                </button>
                                <button onClick={() => void cancel()} disabled={busy} className={ghostBtn}>
                                    <X size={12} />
                                    Cancel
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-baseline gap-2">
            <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</span>
            <div className="min-w-0 flex-1 text-xs">{children}</div>
        </div>
    );
}

const field =
    "w-full rounded-lg border border-gray-300 px-2 py-1 text-xs outline-none transition-colors focus:border-indigo-500";
const sendBtn =
    "inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50";
const ghostBtn =
    "inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50";
