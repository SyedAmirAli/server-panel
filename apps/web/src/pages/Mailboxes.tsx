import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Plus, Info, Pencil, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import type { MailboxView, MailboxConnectionTestResult } from "@appszone/shared";
import { api } from "@/lib/api";
import type { PaginatedResult } from "@/lib/types";
import { usePaginated } from "@/hooks/usePaginated";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListToolbar, PrimaryActionButton } from "@/components/ui/ListToolbar";
import { ListPageCard, ListTableHead } from "@/components/ui/ListPageCard";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { RowMenu, type RowMenuItem } from "@/components/ui/RowMenu";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Toggle } from "@/components/ui/Toggle";
import { toastError, toastSuccess } from "@/lib/toast";
import { formatDate } from "@/lib/format";

function fetcher(p: { page: number; limit: number; search: string }) {
    return api<PaginatedResult<MailboxView>>(
        `/admin/mailboxes?page=${p.page}&limit=${p.limit}&search=${encodeURIComponent(p.search)}`,
    );
}

type MailboxForm = {
    address: string;
    displayName: string;
    imapHost: string;
    imapPort: string;
    imapUser: string;
    imapPassword: string;
    imapSecure: boolean;
    smtpHost: string;
    smtpPort: string;
    smtpUser: string;
    smtpPassword: string;
    smtpSecure: boolean;
    isActive: boolean;
};

const defaultForm: MailboxForm = {
    address: "",
    displayName: "",
    imapHost: "",
    imapPort: "993",
    imapUser: "",
    imapPassword: "",
    imapSecure: true,
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPassword: "",
    smtpSecure: false,
    isActive: true,
};

const inputCls =
    "h-9 w-full rounded-lg border border-gray-200 px-3 text-sm placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

function ProtocolResult({ label, result }: { label: string; result?: { ok: boolean; error?: string } }) {
    if (!result) return null;
    return (
        <div
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
            }`}
        >
            {result.ok ? (
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            ) : (
                <XCircle size={14} className="mt-0.5 shrink-0" />
            )}
            <div>
                <p className="font-medium">
                    {label} {result.ok ? "connected" : "failed"}
                </p>
                {result.error && <p className="mt-0.5 text-[11px] opacity-80">{result.error}</p>}
            </div>
        </div>
    );
}

export function Mailboxes() {
    const navigate = useNavigate();
    const { data, meta, isLoading, search, limit, setPage, setLimit, setSearch, refresh } = usePaginated(fetcher);

    const [modal, setModal] = useState<"create" | "edit" | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<MailboxForm>(defaultForm);
    const [submitting, setSubmitting] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<MailboxConnectionTestResult | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<MailboxView | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [testingRowId, setTestingRowId] = useState<string | null>(null);

    function setField<K extends keyof MailboxForm>(k: K, v: MailboxForm[K]) {
        setForm((f) => ({ ...f, [k]: v }));
    }

    function openCreate() {
        setForm(defaultForm);
        setEditingId(null);
        setTestResult(null);
        setModal("create");
    }

    function openEdit(mb: MailboxView) {
        setForm({
            address: mb.address,
            displayName: mb.displayName ?? "",
            imapHost: mb.imapHost,
            imapPort: String(mb.imapPort),
            imapUser: mb.imapUser,
            imapPassword: "",
            imapSecure: mb.imapSecure,
            smtpHost: mb.smtpHost,
            smtpPort: String(mb.smtpPort),
            smtpUser: mb.smtpUser,
            smtpPassword: "",
            smtpSecure: mb.smtpSecure,
            isActive: mb.isActive,
        });
        setEditingId(mb.id);
        setTestResult(null);
        setModal("edit");
    }

    function closeModal() {
        setModal(null);
        setEditingId(null);
        setTestResult(null);
    }

    function buildBody(isEdit: boolean) {
        const body: Record<string, unknown> = {
            address: form.address,
            displayName: form.displayName || undefined,
            imapHost: form.imapHost,
            imapPort: Number(form.imapPort),
            imapUser: form.imapUser,
            imapSecure: form.imapSecure,
            smtpHost: form.smtpHost,
            smtpPort: Number(form.smtpPort),
            smtpUser: form.smtpUser,
            smtpSecure: form.smtpSecure,
            isActive: form.isActive,
        };
        if (!isEdit || form.imapPassword) body.imapPassword = form.imapPassword;
        if (!isEdit || form.smtpPassword) body.smtpPassword = form.smtpPassword;
        return body;
    }

    function validate(): string | null {
        if (!form.address.trim()) return "Email address is required.";
        if (!form.imapHost.trim() || !form.imapUser.trim()) return "IMAP host and username are required.";
        if (!form.smtpHost.trim() || !form.smtpUser.trim()) return "SMTP host and username are required.";
        if (modal === "create" && (!form.imapPassword.trim() || !form.smtpPassword.trim())) {
            return "IMAP and SMTP passwords are required when creating a mailbox.";
        }
        return null;
    }

    async function submit() {
        const error = validate();
        if (error) {
            toastError(error);
            return;
        }
        setSubmitting(true);
        try {
            if (modal === "create") {
                await api("/admin/mailboxes", { method: "POST", body: buildBody(false) });
            } else if (editingId) {
                await api(`/admin/mailboxes/${editingId}`, { method: "PUT", body: buildBody(true) });
            }
            refresh();
            closeModal();
            toastSuccess(modal === "create" ? "Mailbox created" : "Mailbox updated");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Failed to save mailbox");
        } finally {
            setSubmitting(false);
        }
    }

    /** Create form: dry-run test against the in-progress values. Edit form: test the saved (already-encrypted) credentials. */
    async function testConnection() {
        if (modal === "edit" && editingId) {
            setTesting(true);
            setTestResult(null);
            try {
                const result = await api<MailboxConnectionTestResult>(`/admin/mailboxes/${editingId}/test`, {
                    method: "POST",
                });
                setTestResult(result);
                if (result.imap.ok && result.smtp.ok) toastSuccess("Connection successful");
                else toastError("Connection test failed — see details below");
            } catch (err) {
                toastError(err instanceof Error ? err.message : "Test failed");
            } finally {
                setTesting(false);
            }
            return;
        }

        const error = validate();
        if (error) {
            toastError(error);
            return;
        }
        setTesting(true);
        setTestResult(null);
        try {
            const result = await api<MailboxConnectionTestResult>("/admin/mailboxes/test", {
                method: "POST",
                body: buildBody(false),
            });
            setTestResult(result);
            if (result.imap.ok && result.smtp.ok) toastSuccess("Connection successful");
            else toastError("Connection test failed — see details below");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Test failed");
        } finally {
            setTesting(false);
        }
    }

    async function testRow(mb: MailboxView) {
        setTestingRowId(mb.id);
        try {
            const result = await api<MailboxConnectionTestResult>(`/admin/mailboxes/${mb.id}/test`, { method: "POST" });
            if (result.imap.ok && result.smtp.ok) toastSuccess(`"${mb.address}" — IMAP and SMTP both connected`);
            else
                toastError(
                    `"${mb.address}" — ${!result.imap.ok ? `IMAP: ${result.imap.error}` : ""} ${
                        !result.smtp.ok ? `SMTP: ${result.smtp.error}` : ""
                    }`.trim(),
                );
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Test failed");
        } finally {
            setTestingRowId(null);
        }
    }

    async function syncNow(mb: MailboxView) {
        setSyncingId(mb.id);
        try {
            const result = await api<{ imported: number }>(`/admin/mailboxes/${mb.id}/sync`, { method: "POST" });
            toastSuccess(`"${mb.address}" synced — ${result.imported} new message(s)`);
            refresh();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Sync failed");
        } finally {
            setSyncingId(null);
        }
    }

    async function confirmDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await api(`/admin/mailboxes/${deleteTarget.id}`, { method: "DELETE" });
            toastSuccess(`"${deleteTarget.address}" deleted`);
            setDeleteTarget(null);
            refresh();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Delete failed");
        } finally {
            setDeleting(false);
        }
    }

    return (
        <>
            <PageHeader
                title="Mailboxes"
                description="IMAP/SMTP accounts synced into the Inbox. Credentials are encrypted at rest; the sync worker imports new mail every few minutes."
                breadcrumb={[{ label: "Mail Admin" }, { label: "Mailboxes", active: true }]}
                onRefresh={refresh}
                refreshing={isLoading}
            />

            <ListToolbar
                limit={limit}
                onLimitChange={setLimit}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by address, host…"
                action={
                    <PrimaryActionButton icon={Plus} onClick={openCreate}>
                        New mailbox
                    </PrimaryActionButton>
                }
            />

            <ListPageCard meta={meta} onPageChange={setPage}>
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                ) : data.length === 0 ? (
                    <EmptyState
                        icon={Mail}
                        title="No mailboxes yet"
                        description="Add a mailbox to start syncing its inbox via IMAP."
                        action={
                            <button
                                onClick={openCreate}
                                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                            >
                                <Plus size={14} />
                                New mailbox
                            </button>
                        }
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/90">
                                    {["Address", "IMAP host", "SMTP host", "Status", "Last synced"].map((h) => (
                                        <ListTableHead key={h}>{h}</ListTableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {data.map((mb) => {
                                    const items: RowMenuItem[] = [
                                        {
                                            key: "edit",
                                            label: "Edit",
                                            icon: Pencil,
                                            onClick: () => openEdit(mb),
                                        },
                                        {
                                            key: "inbox",
                                            label: "View inbox",
                                            icon: Mail,
                                            onClick: () => navigate(`/mailboxes/${mb.id}/inbox`),
                                        },
                                        {
                                            key: "test",
                                            label: "Test connection",
                                            icon: CheckCircle2,
                                            loading: testingRowId === mb.id,
                                            onClick: () => testRow(mb),
                                        },
                                        {
                                            key: "sync",
                                            label: "Sync now",
                                            icon: RefreshCw,
                                            loading: syncingId === mb.id,
                                            onClick: () => syncNow(mb),
                                        },
                                        {
                                            key: "delete",
                                            label: "Delete",
                                            icon: XCircle,
                                            tone: "danger",
                                            onClick: () => setDeleteTarget(mb),
                                        },
                                    ];
                                    return (
                                        <tr
                                            key={mb.id}
                                            onClick={() => navigate(`/mailboxes/${mb.id}/inbox`)}
                                            className="cursor-pointer hover:bg-gray-50/50 transition-colors"
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1">
                                                    <div onClick={(e) => e.stopPropagation()}>
                                                        <RowMenu items={items} align="left" />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-gray-900">{mb.address}</p>
                                                        {mb.displayName && (
                                                            <p className="text-xs text-gray-400">{mb.displayName}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-gray-600">
                                                {mb.imapHost}:{mb.imapPort}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-gray-600">
                                                {mb.smtpHost}:{mb.smtpPort}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-1">
                                                    <Badge variant={mb.isActive ? "success" : "neutral"}>
                                                        {mb.isActive ? "Active" : "Inactive"}
                                                    </Badge>
                                                    {mb.lastSyncError && (
                                                        <span className="text-[11px] text-red-600" title={mb.lastSyncError}>
                                                            Sync error
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-nowrap">
                                                {formatDate(mb.lastSyncAt)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </ListPageCard>

            {/* Create / Edit modal */}
            <Modal
                isOpen={modal !== null}
                onClose={closeModal}
                title={modal === "create" ? "New mailbox" : "Edit mailbox"}
                size="lg"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                Email address <span className="text-red-500">*</span>
                            </label>
                            <input
                                value={form.address}
                                onChange={(e) => setField("address", e.target.value)}
                                placeholder="sales@example.com"
                                maxLength={255}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">Display name</label>
                            <input
                                value={form.displayName}
                                onChange={(e) => setField("displayName", e.target.value)}
                                placeholder="Sales Team"
                                maxLength={255}
                                className={inputCls}
                            />
                        </div>
                    </div>

                    <div className="flex gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-3 text-xs text-indigo-900">
                        <Info size={15} className="mt-0.5 shrink-0 text-indigo-500" />
                        <div className="space-y-1">
                            <p className="font-medium">Using Gmail with an App Password?</p>
                            <p className="text-indigo-700">
                                IMAP host <code className="rounded bg-white/70 px-1 py-0.5 font-mono">imap.gmail.com</code>,
                                port <code className="rounded bg-white/70 px-1 py-0.5 font-mono">993</code>. SMTP host{" "}
                                <code className="rounded bg-white/70 px-1 py-0.5 font-mono">smtp.gmail.com</code>, port{" "}
                                <code className="rounded bg-white/70 px-1 py-0.5 font-mono">587</code>. Username is your
                                full Gmail address; password is the 16-character App Password (requires 2-Step
                                Verification) — not your normal login password.
                            </p>
                        </div>
                    </div>

                    {/* IMAP */}
                    <div className="space-y-3 rounded-xl bg-gray-50 px-4 py-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">IMAP (incoming)</p>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                    Host <span className="text-red-500">*</span>
                                </label>
                                <input value={form.imapHost} onChange={(e) => setField("imapHost", e.target.value)} placeholder="imap.gmail.com" className={inputCls} />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-gray-700">Port</label>
                                <input type="number" value={form.imapPort} onChange={(e) => setField("imapPort", e.target.value)} min={1} max={65535} className={inputCls} />
                            </div>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                Username <span className="text-red-500">*</span>
                            </label>
                            <input value={form.imapUser} onChange={(e) => setField("imapUser", e.target.value)} placeholder="sales@example.com" className={inputCls} />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                Password{" "}
                                {modal === "edit" && <span className="font-normal text-gray-400">leave blank to keep unchanged</span>}
                                {modal === "create" && <span className="text-red-500"> *</span>}
                            </label>
                            <PasswordInput
                                value={form.imapPassword}
                                onChange={(v) => setField("imapPassword", v)}
                                placeholder={modal === "edit" ? "••••••••" : "IMAP password"}
                                autoComplete="new-password"
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-gray-800">SSL/TLS</p>
                                <p className="text-xs text-gray-500">Implicit TLS on connect (usually port 993)</p>
                            </div>
                            <Toggle checked={form.imapSecure} onChange={(v) => setField("imapSecure", v)} />
                        </div>
                    </div>

                    {/* SMTP */}
                    <div className="space-y-3 rounded-xl bg-gray-50 px-4 py-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">SMTP (outgoing)</p>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                    Host <span className="text-red-500">*</span>
                                </label>
                                <input value={form.smtpHost} onChange={(e) => setField("smtpHost", e.target.value)} placeholder="smtp.gmail.com" className={inputCls} />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-gray-700">Port</label>
                                <input type="number" value={form.smtpPort} onChange={(e) => setField("smtpPort", e.target.value)} min={1} max={65535} className={inputCls} />
                            </div>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                Username <span className="text-red-500">*</span>
                            </label>
                            <input value={form.smtpUser} onChange={(e) => setField("smtpUser", e.target.value)} placeholder="sales@example.com" className={inputCls} />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                Password{" "}
                                {modal === "edit" && <span className="font-normal text-gray-400">leave blank to keep unchanged</span>}
                                {modal === "create" && <span className="text-red-500"> *</span>}
                            </label>
                            <PasswordInput
                                value={form.smtpPassword}
                                onChange={(v) => setField("smtpPassword", v)}
                                placeholder={modal === "edit" ? "••••••••" : "SMTP password"}
                                autoComplete="new-password"
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-gray-800">SSL/TLS</p>
                                <p className="text-xs text-gray-500">Implicit TLS (port 465) vs. STARTTLS (587)</p>
                            </div>
                            <Toggle checked={form.smtpSecure} onChange={(v) => setField("smtpSecure", v)} />
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium text-gray-800">Active</p>
                            <p className="text-xs text-gray-500">Inactive mailboxes are skipped by the sync worker</p>
                        </div>
                        <Toggle checked={form.isActive} onChange={(v) => setField("isActive", v)} />
                    </div>

                    {testResult && (
                        <div className="space-y-2">
                            <ProtocolResult label="IMAP" result={testResult.imap} />
                            <ProtocolResult label="SMTP" result={testResult.smtp} />
                        </div>
                    )}

                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={testConnection}
                            disabled={testing || submitting}
                            className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                            {testing && <Spinner size="sm" />}
                            Test connection
                        </button>
                        <div className="flex-1" />
                        <button
                            onClick={closeModal}
                            className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={submit}
                            disabled={submitting}
                            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            {submitting && <Spinner size="sm" />}
                            {modal === "create" ? "Create mailbox" : "Save changes"}
                        </button>
                    </div>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteTarget}
                title="Delete mailbox"
                message={
                    <>
                        Delete <strong>{deleteTarget?.address}</strong>? This also permanently deletes its synced
                        messages from the Inbox. This cannot be undone.
                    </>
                }
                confirmLabel="Delete"
                busy={deleting}
                onConfirm={confirmDelete}
                onClose={() => setDeleteTarget(null)}
            />
        </>
    );
}
