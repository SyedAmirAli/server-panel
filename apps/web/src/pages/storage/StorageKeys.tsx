import { useEffect, useState } from "react";
import { KeyRound, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import type { BucketView, StorageKeySecretView, StorageKeyView } from "@appszone/shared";
import { api } from "@/lib/api";
import { toastError, toastSuccess } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import type { PaginatedResult } from "@/lib/types";
import { usePaginated } from "@/hooks/usePaginated";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListToolbar, PrimaryActionButton } from "@/components/ui/ListToolbar";
import { ListPageCard, ListTableHead } from "@/components/ui/ListPageCard";
import { Modal } from "@/components/ui/Modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/RowMenu";
import { SecretValue } from "@/components/ui/SecretValue";
import { CopyButton } from "@/components/ui/CopyButton";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

function fetcher(p: { page: number; limit: number; search: string }) {
    return api<PaginatedResult<StorageKeyView>>(
        `/admin/storage/keys?page=${p.page}&limit=${p.limit}&search=${encodeURIComponent(p.search)}`,
    );
}

type ModalMode = "create" | "edit";

interface FormState {
    name: string;
    allowedBuckets: string[];
    defaultBucketId: string;
    allowedOrigins: string;
    allowedIps: string;
    expiresAt: string;
}

const EMPTY: FormState = {
    name: "",
    allowedBuckets: [],
    defaultBucketId: "",
    allowedOrigins: "",
    allowedIps: "",
    expiresAt: "",
};

const inputCls =
    "h-9 w-full rounded-lg border border-gray-200 px-3 text-sm placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

export function StorageKeys() {
    const { data, meta, isLoading, search, limit, setPage, setLimit, setSearch, refresh } = usePaginated(fetcher);

    const [buckets, setBuckets] = useState<BucketView[]>([]);
    const [modal, setModal] = useState<ModalMode | null>(null);
    const [editing, setEditing] = useState<StorageKeyView | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [submitting, setSubmitting] = useState(false);
    const [secret, setSecret] = useState<string | null>(null);
    const [confirmDel, setConfirmDel] = useState<StorageKeyView | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        api<PaginatedResult<BucketView>>("/admin/storage/buckets?limit=100")
            .then((r) => setBuckets(r.data))
            .catch(() => undefined);
    }, []);

    function toLines(arr: string[]) {
        return arr.join("\n");
    }
    function fromLines(text: string) {
        return text
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
    }

    function openCreate() {
        setForm(EMPTY);
        setSecret(null);
        setEditing(null);
        setModal("create");
    }

    function openEdit(k: StorageKeyView) {
        setForm({
            name: k.name,
            allowedBuckets: k.allowedBuckets,
            defaultBucketId: k.defaultBucketId ?? "",
            allowedOrigins: toLines(k.allowedOrigins),
            allowedIps: toLines(k.allowedIps),
            expiresAt: k.expiresAt ? k.expiresAt.slice(0, 10) : "",
        });
        setSecret(null);
        setEditing(k);
        setModal("edit");
    }

    function closeModal() {
        setModal(null);
        setEditing(null);
        setSecret(null);
    }

    function toggleBucket(publicId: string) {
        setForm((f) => {
            const has = f.allowedBuckets.includes(publicId);
            const allowedBuckets = has
                ? f.allowedBuckets.filter((b) => b !== publicId)
                : [...f.allowedBuckets, publicId];
            const defaultBucketId = has && f.defaultBucketId === publicId ? "" : f.defaultBucketId;
            return { ...f, allowedBuckets, defaultBucketId };
        });
    }

    async function submit() {
        setSubmitting(true);
        try {
            const payload = {
                name: form.name,
                allowedBuckets: form.allowedBuckets,
                defaultBucketId: form.defaultBucketId || null,
                allowedOrigins: fromLines(form.allowedOrigins),
                allowedIps: fromLines(form.allowedIps),
                expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
            };
            if (modal === "create") {
                const res = await api<StorageKeySecretView>("/admin/storage/keys", { method: "POST", body: payload });
                setSecret(res.secret);
                refresh();
                toastSuccess("Storage key created");
            } else if (editing) {
                await api(`/admin/storage/keys/${editing.id}`, { method: "PUT", body: payload });
                refresh();
                closeModal();
                toastSuccess("Storage key updated");
            }
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Failed to save key");
        } finally {
            setSubmitting(false);
        }
    }

    async function toggleActive(k: StorageKeyView) {
        setBusyId(k.id + ":toggle");
        try {
            await api(`/admin/storage/keys/${k.id}/toggle-active`, {
                method: "PATCH",
                body: { isActive: !k.isActive },
            });
            refresh();
            toastSuccess(k.isActive ? "Key deactivated" : "Key activated");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Toggle failed");
        } finally {
            setBusyId(null);
        }
    }

    async function rotate(k: StorageKeyView) {
        setBusyId(k.id + ":rotate");
        try {
            const res = await api<StorageKeySecretView>(`/admin/storage/keys/${k.id}/refresh`, { method: "POST" });
            openEdit(k);
            setSecret(res.secret);
            toastSuccess("Secret rotated — copy the new value now");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Rotate failed");
        } finally {
            setBusyId(null);
        }
    }

    async function doDelete() {
        if (!confirmDel) return;
        setDeleting(true);
        try {
            await api(`/admin/storage/keys/${confirmDel.id}`, { method: "DELETE" });
            toastSuccess(`"${confirmDel.name}" deleted`);
            setConfirmDel(null);
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
                title="Storage API Keys"
                description="Keys that let apps upload, list, and delete files through the storage API. Scope to buckets, set a default, restrict origins/IPs, and add an expiry."
                breadcrumb={[{ label: "Storage" }, { label: "API Keys", active: true }]}
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
                        icon={KeyRound}
                        title="No storage keys yet"
                        description="Create a key so your apps can upload files through the storage API."
                        action={
                            <button
                                onClick={openCreate}
                                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                            >
                                <Plus size={14} /> New key
                            </button>
                        }
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/90">
                                    {["Name", "Key", "Status", "Buckets", "Expires", "Last used"].map((h) => (
                                        <ListTableHead key={h}>{h}</ListTableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {data.map((k) => {
                                    const items: RowMenuItem[] = [
                                        { key: "edit", label: "Edit", icon: Pencil, onClick: () => openEdit(k) },
                                        {
                                            key: "rotate",
                                            label: "Rotate secret",
                                            icon: RefreshCw,
                                            loading: busyId === k.id + ":rotate",
                                            onClick: () => rotate(k),
                                        },
                                        {
                                            key: "delete",
                                            label: "Delete",
                                            icon: Trash2,
                                            tone: "danger",
                                            onClick: () => setConfirmDel(k),
                                        },
                                    ];
                                    return (
                                    <tr key={k.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <RowMenu items={items} align="left" />
                                                <span className="font-medium text-gray-900">{k.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 max-w-60">
                                            {k.secret ? (
                                                <SecretValue value={k.secret} variant="table" />
                                            ) : (
                                                <span className="text-xs text-gray-400">rotate to reveal</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => toggleActive(k)}
                                                disabled={busyId === k.id + ":toggle"}
                                                className="cursor-pointer disabled:opacity-50"
                                            >
                                                <Badge variant={k.isActive ? "success" : "neutral"}>
                                                    {k.isActive ? "Active" : "Inactive"}
                                                </Badge>
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-nowrap">
                                            {k.allowedBuckets.length === 0 ? (
                                                <span className="text-xs text-gray-400">All</span>
                                            ) : (
                                                `${k.allowedBuckets.length} scoped`
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-nowrap">
                                            {k.expiresAt ? (
                                                formatDate(k.expiresAt)
                                            ) : (
                                                <span className="text-xs text-gray-400">Never</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-nowrap">
                                            {formatDate(k.lastUsedAt)}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </ListPageCard>

            <Modal
                isOpen={modal !== null}
                onClose={closeModal}
                title={modal === "create" ? "New storage key" : "Edit storage key"}
                size="lg"
            >
                {secret && (
                    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <p className="mb-2.5 text-xs font-semibold text-amber-800">
                            Copy this key now — you can also reveal it later from the list
                        </p>
                        <div className="flex items-start gap-2">
                            <code className="min-w-0 flex-1 break-all rounded-lg bg-amber-100/70 px-3 py-2.5 font-mono text-xs text-amber-900">
                                {secret}
                            </code>
                            <CopyButton
                                value={secret}
                                label="Copy secret"
                                size="md"
                                className="bg-amber-100 hover:bg-amber-200"
                            />
                        </div>
                    </div>
                )}

                {secret && modal === "create" ? (
                    <button
                        onClick={closeModal}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
                                className={inputCls}
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="Mobile App Uploader"
                                maxLength={120}
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                Allowed buckets{" "}
                                <span className="ml-1.5 font-normal text-gray-400">none selected = all buckets</span>
                            </label>
                            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
                                {buckets.length === 0 ? (
                                    <p className="px-1 py-2 text-xs text-gray-400">No buckets registered yet.</p>
                                ) : (
                                    buckets.map((b) => (
                                        <label
                                            key={b.publicId}
                                            className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={form.allowedBuckets.includes(b.publicId)}
                                                onChange={() => toggleBucket(b.publicId)}
                                            />
                                            <span className="font-medium">{b.name}</span>
                                            <span className="font-mono text-xs text-gray-400">{b.publicId}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                Default bucket{" "}
                                <span className="ml-1.5 font-normal text-gray-400">
                                    used when a request omits bucketId
                                </span>
                            </label>
                            <select
                                className={inputCls}
                                value={form.defaultBucketId}
                                onChange={(e) => setForm((f) => ({ ...f, defaultBucketId: e.target.value }))}
                            >
                                <option value="">— none —</option>
                                {(form.allowedBuckets.length > 0
                                    ? buckets.filter((b) => form.allowedBuckets.includes(b.publicId))
                                    : buckets
                                ).map((b) => (
                                    <option key={b.publicId} value={b.publicId}>
                                        {b.name} ({b.publicId})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                    Allowed origins <span className="font-normal text-gray-400">1/line</span>
                                </label>
                                <textarea
                                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                    rows={3}
                                    value={form.allowedOrigins}
                                    onChange={(e) => setForm((f) => ({ ...f, allowedOrigins: e.target.value }))}
                                    placeholder={"https://app.example.com"}
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                    Allowed IPs/CIDRs <span className="font-normal text-gray-400">1/line</span>
                                </label>
                                <textarea
                                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                    rows={3}
                                    value={form.allowedIps}
                                    onChange={(e) => setForm((f) => ({ ...f, allowedIps: e.target.value }))}
                                    placeholder={"203.0.113.4\n10.0.0.0/8"}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                Expiry date <span className="ml-1.5 font-normal text-gray-400">blank = never</span>
                            </label>
                            <input
                                type="date"
                                className={inputCls}
                                value={form.expiresAt}
                                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                            />
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={closeModal}
                                className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submit}
                                disabled={submitting || !form.name.trim()}
                                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {submitting && <Spinner size="sm" />}
                                {modal === "create" ? "Create key" : "Save changes"}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <ConfirmModal
                isOpen={!!confirmDel}
                title="Delete storage key"
                message={
                    <>
                        Delete <strong>{confirmDel?.name}</strong>? Apps using this key will immediately lose access.
                    </>
                }
                confirmLabel="Delete key"
                busy={deleting}
                onConfirm={doDelete}
                onClose={() => setConfirmDel(null)}
            />
        </>
    );
}
