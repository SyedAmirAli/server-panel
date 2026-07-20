import { useState } from "react";
import { Key, Plus, Pencil, Trash2, RefreshCw, CheckCircle2 } from "lucide-react";
import type { ApiKeyView, ApiKeySecretView } from "@appszone/shared";
import { api } from "@/lib/api";
import { toastError, toastSuccess } from "@/lib/toast";
import type { PaginatedResult } from "@/lib/types";
import { usePaginated } from "@/hooks/usePaginated";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListToolbar, PrimaryActionButton } from "@/components/ui/ListToolbar";
import { ListPageCard, ListTableHead } from "@/components/ui/ListPageCard";
import { Modal } from "@/components/ui/Modal";
import { ActionBtn } from "@/components/ui/ActionBtn";
import { SecretValue } from "@/components/ui/SecretValue";
import { CopyButton } from "@/components/ui/CopyButton";
import { DetailField, DetailGrid } from "@/components/ui/DetailField";

function StatusToggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onChange}
            disabled={disabled}
            title={checked ? "Active — click to deactivate" : "Inactive — click to activate"}
            className={`relative h-5 w-9 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                checked ? "bg-indigo-600" : "bg-gray-200"
            }`}
        >
            <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    checked ? "translate-x-4" : "translate-x-0"
                }`}
            />
        </button>
    );
}

function fetcher(p: { page: number; limit: number; search: string }) {
    return api<PaginatedResult<ApiKeyView>>(
        `/admin/keys?page=${p.page}&limit=${p.limit}&search=${encodeURIComponent(p.search)}`,
    );
}

function fmtDate(iso: string | null) {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

type ModalMode = "create" | "edit";

export function ApiKeys() {
    const { data, meta, isLoading, search, limit, setPage, setLimit, setSearch, refresh } = usePaginated(fetcher);

    const [modal, setModal] = useState<ModalMode | null>(null);
    const [editingKey, setEditingKey] = useState<ApiKeyView | null>(null);
    const [form, setForm] = useState({ name: "", allowedFrom: "" });
    const [submitting, setSubmitting] = useState(false);
    const [secret, setSecret] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [viewing, setViewing] = useState<ApiKeyView | null>(null);

    function openCreate() {
        setForm({ name: "", allowedFrom: "" });
        setSecret(null);
        setEditingKey(null);
        setModal("create");
    }

    function openEdit(key: ApiKeyView) {
        setForm({ name: key.name, allowedFrom: key.allowedFrom.join("\n") });
        setSecret(null);
        setEditingKey(key);
        setModal("edit");
    }

    function closeModal() {
        setModal(null);
        setEditingKey(null);
        setSecret(null);
    }

    async function submit() {
        setSubmitting(true);
        const allowedFrom = form.allowedFrom
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        try {
            if (modal === "create") {
                const res = await api<ApiKeySecretView>("/admin/keys", {
                    method: "POST",
                    body: { name: form.name, allowedFrom },
                });
                setSecret(res.secret);
                refresh();
                toastSuccess("API key created");
            } else if (editingKey) {
                await api<ApiKeyView>(`/admin/keys/${editingKey.id}`, {
                    method: "PUT",
                    body: { name: form.name, allowedFrom },
                });
                refresh();
                closeModal();
                toastSuccess("API key updated");
            }
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Failed to save");
        } finally {
            setSubmitting(false);
        }
    }

    async function toggleActive(key: ApiKeyView) {
        setBusyId(key.id + ":toggle");
        try {
            await api(`/admin/keys/${key.id}/toggle-active`, {
                method: "PATCH",
                body: { isActive: !key.isActive },
            });
            refresh();
            toastSuccess(key.isActive ? "Key deactivated" : "Key activated");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Failed to toggle key");
        } finally {
            setBusyId(null);
        }
    }

    async function handleRefresh(key: ApiKeyView) {
        if (!confirm(`Rotate the secret for "${key.name}"? The old secret will stop working immediately.`)) return;
        setBusyId(key.id + ":refresh");
        try {
            const res = await api<ApiKeySecretView>(`/admin/keys/${key.id}/refresh`, { method: "POST" });
            setEditingKey(key);
            setForm({ name: key.name, allowedFrom: key.allowedFrom.join("\n") });
            setSecret(res.secret);
            setModal("edit");
            toastSuccess("Secret rotated — copy the new value now");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Failed to rotate secret");
        } finally {
            setBusyId(null);
        }
    }

    async function deleteKey(key: ApiKeyView) {
        if (!confirm(`Delete "${key.name}"? This cannot be undone.`)) return;
        try {
            await api(`/admin/keys/${key.id}`, { method: "DELETE" });
            refresh();
            toastSuccess(`"${key.name}" deleted`);
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Delete failed");
        }
    }

    return (
        <>
            <PageHeader
                title="API Keys"
                description="Manage keys used by apps to send transactional email. Create, rotate, activate, or restrict sender addresses."
                breadcrumb={[{ label: "Mail Admin" }, { label: "API Keys", active: true }]}
                onRefresh={refresh}
                refreshing={isLoading}
            />

            <ListToolbar
                limit={limit}
                onLimitChange={setLimit}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by name or key…"
                action={
                    <PrimaryActionButton icon={Plus} onClick={openCreate}>
                        New key
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
                        icon={Key}
                        title="No API keys yet"
                        description="Create a key to let your apps send email through this server."
                        action={
                            <button
                                onClick={openCreate}
                                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                            >
                                <Plus size={14} />
                                New key
                            </button>
                        }
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/90">
                                    {["Name", "API key", "Status", "Senders", "Last used", "Created", ""].map((h) => (
                                        <ListTableHead key={h}>{h}</ListTableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {data.map((key) => (
                                    <tr
                                        key={key.id}
                                        onClick={() => setViewing(key)}
                                        className="cursor-pointer hover:bg-gray-50/50 transition-colors"
                                    >
                                        <td className="px-4 py-3 font-medium text-gray-900">{key.name}</td>
                                        <td className="px-4 py-3 max-w-70" onClick={(e) => e.stopPropagation()}>
                                            {key.secret ? (
                                                <SecretValue value={key.secret} variant="table" />
                                            ) : (
                                                <span
                                                    className="text-xs text-gray-400"
                                                    title="Rotate this key to store and display the full value"
                                                >
                                                    Unavailable — rotate key
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <StatusToggle
                                                checked={key.isActive}
                                                onChange={() => toggleActive(key)}
                                                disabled={busyId === key.id + ":toggle"}
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {key.allowedFrom.length === 0 ? (
                                                <span className="text-gray-400 text-xs">Unrestricted</span>
                                            ) : (
                                                `${key.allowedFrom.length} sender${
                                                    key.allowedFrom.length !== 1 ? "s" : ""
                                                }`
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-nowrap">
                                            {fmtDate(key.lastUsedAt)}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-nowrap">
                                            {fmtDate(key.createdAt)}
                                        </td>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-0.5">
                                                <ActionBtn
                                                    icon={Pencil}
                                                    label="Edit"
                                                    variant="edit"
                                                    onClick={() => openEdit(key)}
                                                />
                                                <ActionBtn
                                                    icon={RefreshCw}
                                                    label="Rotate secret"
                                                    variant="rotate"
                                                    loading={busyId === key.id + ":refresh"}
                                                    onClick={() => handleRefresh(key)}
                                                />
                                                <ActionBtn
                                                    icon={Trash2}
                                                    label="Delete"
                                                    variant="delete"
                                                    onClick={() => deleteKey(key)}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </ListPageCard>

            <Modal
                isOpen={modal !== null}
                onClose={closeModal}
                title={modal === "create" ? "New API key" : "Edit API key"}
            >
                {secret && (
                    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <p className="mb-2.5 text-xs font-semibold text-amber-800">
                            Copy this key now — you can also reveal it anytime from the list
                        </p>
                        <div className="flex items-start gap-2">
                            <code className="min-w-0 flex-1 break-all rounded-lg bg-amber-100/70 px-3 py-2.5 font-mono text-xs leading-relaxed text-amber-900">
                                {secret}
                            </code>
                            <CopyButton
                                value={secret}
                                label="Copy secret"
                                size="md"
                                className="bg-amber-100 hover:bg-amber-200"
                            />
                        </div>
                        {secret.startsWith("azm_live_") && (
                            <p className="mt-2 flex items-center gap-1 text-xs text-amber-700">
                                <CheckCircle2 size={12} /> Full key ready to paste into your app
                            </p>
                        )}
                    </div>
                )}

                {secret && modal === "create" ? (
                    <button
                        onClick={closeModal}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        Done — I've saved the secret
                    </button>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. Sales App"
                                maxLength={120}
                                className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                Allowed senders
                                <span className="ml-1.5 font-normal text-gray-400">
                                    one email per line · leave blank for unrestricted
                                </span>
                            </label>
                            <textarea
                                value={form.allowedFrom}
                                onChange={(e) => setForm((f) => ({ ...f, allowedFrom: e.target.value }))}
                                placeholder={"sales@example.com\nnoreply@example.com"}
                                rows={3}
                                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            />
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={closeModal}
                                className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submit}
                                disabled={submitting || !form.name.trim()}
                                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                                {submitting && <Spinner size="sm" />}
                                {modal === "create" ? "Create key" : "Save changes"}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title="API Key details" size="lg">
                {viewing && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-indigo-100 bg-linear-to-br from-indigo-50 to-violet-50 px-4 py-4">
                            <p className="text-base font-semibold text-gray-900">{viewing.name}</p>
                            <div className="mt-2">
                                <Badge variant={viewing.isActive ? "success" : "neutral"}>
                                    {viewing.isActive ? "Active" : "Inactive"}
                                </Badge>
                            </div>
                        </div>

                        <div>
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                API key
                            </p>
                            {viewing.secret ? (
                                <SecretValue value={viewing.secret} variant="modal" />
                            ) : (
                                <p className="text-sm text-gray-500">
                                    Full key not stored for this entry. Use <strong>Rotate secret</strong> to generate a
                                    new key you can copy.
                                </p>
                            )}
                        </div>

                        <div>
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                Key ID
                            </p>
                            <SecretValue value={viewing.id} variant="modal" />
                        </div>

                        <DetailGrid>
                            <DetailField label="Allowed senders" wide>
                                {viewing.allowedFrom.length === 0 ? (
                                    <span className="font-normal text-gray-400">Unrestricted</span>
                                ) : (
                                    <ul className="mt-0.5 space-y-0.5">
                                        {viewing.allowedFrom.map((e) => (
                                            <li key={e} className="font-mono text-xs">
                                                {e}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </DetailField>
                            <DetailField label="Last used">{fmtDate(viewing.lastUsedAt)}</DetailField>
                            <DetailField label="Created">{fmtDate(viewing.createdAt)}</DetailField>
                        </DetailGrid>
                    </div>
                )}
            </Modal>
        </>
    );
}
