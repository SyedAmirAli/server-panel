import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, Plus, Pencil, Trash2, FileArchive } from "lucide-react";
import type { BucketView, CreateBucketDto, StorageProvider } from "@appszone/shared";

// Mirrors STORAGE_PROVIDERS from @appszone/shared (kept local: the SPA bundles
// only types from shared, never its CommonJS runtime values).
const STORAGE_PROVIDERS: StorageProvider[] = ["s3", "r2", "minio", "other"];
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
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { CopyButton } from "@/components/ui/CopyButton";
import { ZipProgressModal } from "@/pages/storage/ZipProgressModal";

function fetcher(p: { page: number; limit: number; search: string }) {
    return api<PaginatedResult<BucketView>>(
        `/admin/storage/buckets?page=${p.page}&limit=${p.limit}&search=${encodeURIComponent(p.search)}`
    );
}

type ModalMode = "create" | "edit";

const EMPTY_FORM: CreateBucketDto = {
    name: "",
    provider: "r2",
    endpoint: "",
    region: "auto",
    bucketName: "",
    forcePathStyle: true,
    accessKeyId: "",
    secretAccessKey: "",
    publicBaseUrl: "",
};

const inputCls =
    "h-9 w-full rounded-lg border border-gray-200 px-3 text-sm placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

export function Buckets() {
    const navigate = useNavigate();
    const { data, meta, isLoading, search, limit, setPage, setLimit, setSearch, refresh } = usePaginated(fetcher);

    const [modal, setModal] = useState<ModalMode | null>(null);
    const [editing, setEditing] = useState<BucketView | null>(null);
    const [form, setForm] = useState<CreateBucketDto>(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<BucketView | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [zipBucket, setZipBucket] = useState<BucketView | null>(null);

    function openCreate() {
        setForm(EMPTY_FORM);
        setEditing(null);
        setModal("create");
    }

    function openEdit(b: BucketView) {
        setForm({
            name: b.name,
            provider: b.provider,
            endpoint: b.endpoint ?? "",
            region: b.region ?? "",
            bucketName: b.bucketName,
            forcePathStyle: b.forcePathStyle,
            accessKeyId: "",
            secretAccessKey: "",
            publicBaseUrl: b.publicBaseUrl ?? "",
        });
        setEditing(b);
        setModal("edit");
    }

    function closeModal() {
        setModal(null);
        setEditing(null);
    }

    async function submit() {
        setSubmitting(true);
        try {
            const payload: Partial<CreateBucketDto> = {
                name: form.name,
                provider: form.provider,
                endpoint: form.endpoint || undefined,
                region: form.region || undefined,
                bucketName: form.bucketName,
                forcePathStyle: form.forcePathStyle,
                publicBaseUrl: form.publicBaseUrl || undefined,
            };
            // Only send credentials when provided (edit keeps existing if blank).
            if (form.accessKeyId) payload.accessKeyId = form.accessKeyId;
            if (form.secretAccessKey) payload.secretAccessKey = form.secretAccessKey;

            if (modal === "create") {
                await api("/admin/storage/buckets", { method: "POST", body: payload });
                toastSuccess("Bucket registered");
            } else if (editing) {
                await api(`/admin/storage/buckets/${editing.publicId}`, { method: "PUT", body: payload });
                toastSuccess("Bucket updated");
            }
            refresh();
            closeModal();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Failed to save bucket");
        } finally {
            setSubmitting(false);
        }
    }

    async function doDelete() {
        if (!confirmDelete) return;
        setDeleting(true);
        try {
            await api(`/admin/storage/buckets/${confirmDelete.publicId}`, { method: "DELETE" });
            toastSuccess(`"${confirmDelete.name}" deleted`);
            setConfirmDelete(null);
            refresh();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Delete failed");
        } finally {
            setDeleting(false);
        }
    }

    const canSubmit =
        form.name.trim() &&
        form.bucketName.trim() &&
        (modal === "edit" || (form.accessKeyId.trim() && form.secretAccessKey.trim()));

    return (
        <>
            <PageHeader
                title="Buckets"
                description="Register S3-compatible buckets (AWS S3, Cloudflare R2, MinIO). Credentials are encrypted at rest."
                breadcrumb={[{ label: "Storage" }, { label: "Buckets", active: true }]}
                onRefresh={refresh}
                refreshing={isLoading}
            />

            <ListToolbar
                limit={limit}
                onLimitChange={setLimit}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by name, ID, or bucket…"
                action={
                    <PrimaryActionButton icon={Plus} onClick={openCreate}>
                        New bucket
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
                        icon={Database}
                        title="No buckets yet"
                        description="Register a bucket to browse files and issue storage API keys."
                        action={
                            <button
                                onClick={openCreate}
                                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                            >
                                <Plus size={14} /> New bucket
                            </button>
                        }
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/90">
                                    {["Name", "Bucket ID", "Provider", "Bucket", "Status", "Created"].map((h) => (
                                        <ListTableHead key={h}>{h}</ListTableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {data.map((b) => (
                                    <tr
                                        key={b.id}
                                        onClick={() => navigate(`/storage/${b.publicId}`)}
                                        className="cursor-pointer hover:bg-gray-50/50 transition-colors"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <RowMenu
                                                        align="left"
                                                        items={
                                                            [
                                                                {
                                                                    key: "zip",
                                                                    label: "Download whole bucket (ZIP)",
                                                                    icon: FileArchive,
                                                                    onClick: () => setZipBucket(b),
                                                                },
                                                                { key: "edit", label: "Edit", icon: Pencil, onClick: () => openEdit(b) },
                                                                {
                                                                    key: "delete",
                                                                    label: "Delete",
                                                                    icon: Trash2,
                                                                    tone: "danger",
                                                                    onClick: () => setConfirmDelete(b),
                                                                },
                                                            ] satisfies RowMenuItem[]
                                                        }
                                                    />
                                                </div>
                                                <span className="font-medium text-gray-900">{b.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono text-xs text-gray-600">{b.publicId}</span>
                                                <CopyButton value={b.publicId} label="Copy bucket ID" />
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 uppercase text-xs text-gray-500">{b.provider}</td>
                                        <td className="px-4 py-3 text-gray-500">{b.bucketName}</td>
                                        <td className="px-4 py-3">
                                            <Badge variant={b.isActive ? "success" : "neutral"}>
                                                {b.isActive ? "Active" : "Disabled"}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">{formatDate(b.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </ListPageCard>

            <Modal isOpen={modal !== null} onClose={closeModal} title={modal === "create" ? "New bucket" : "Edit bucket"} size="lg">
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Name" required>
                            <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Student Documents" />
                        </Field>
                        <Field label="Provider">
                            <select
                                className={inputCls}
                                value={form.provider}
                                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as StorageProvider }))}
                            >
                                {STORAGE_PROVIDERS.map((p) => (
                                    <option key={p} value={p}>
                                        {p.toUpperCase()}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Bucket name" required>
                            <input className={inputCls} value={form.bucketName} onChange={(e) => setForm((f) => ({ ...f, bucketName: e.target.value }))} placeholder="my-bucket" />
                        </Field>
                        <Field label="Region">
                            <input className={inputCls} value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} placeholder="auto / us-east-1" />
                        </Field>
                    </div>

                    <Field label="Endpoint" hint="R2/MinIO custom endpoint; leave blank for AWS">
                        <input className={inputCls} value={form.endpoint} onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))} placeholder="https://<account>.r2.cloudflarestorage.com" />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Access key ID" required={modal === "create"} hint={modal === "edit" ? "leave blank to keep" : undefined}>
                            <input className={inputCls} value={form.accessKeyId} onChange={(e) => setForm((f) => ({ ...f, accessKeyId: e.target.value }))} autoComplete="off" />
                        </Field>
                        <Field label="Secret access key" required={modal === "create"} hint={modal === "edit" ? "leave blank to keep" : undefined}>
                            <input className={inputCls} type="password" value={form.secretAccessKey} onChange={(e) => setForm((f) => ({ ...f, secretAccessKey: e.target.value }))} autoComplete="new-password" />
                        </Field>
                    </div>

                    <Field label="Public base URL" hint="CDN/custom domain for public objects (optional)">
                        <input className={inputCls} value={form.publicBaseUrl} onChange={(e) => setForm((f) => ({ ...f, publicBaseUrl: e.target.value }))} placeholder="https://cdn.example.com" />
                    </Field>

                    <label className="flex items-center gap-2 text-sm text-gray-600">
                        <input type="checkbox" checked={form.forcePathStyle} onChange={(e) => setForm((f) => ({ ...f, forcePathStyle: e.target.checked }))} />
                        Force path-style URLs (required for R2/MinIO)
                    </label>

                    <div className="flex gap-2 pt-1">
                        <button onClick={closeModal} className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={submit}
                            disabled={submitting || !canSubmit}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            {submitting && <Spinner size="sm" />}
                            {modal === "create" ? "Register bucket" : "Save changes"}
                        </button>
                    </div>
                    {modal === "create" && (
                        <p className="text-xs text-gray-400">Credentials are verified against the provider before saving.</p>
                    )}
                </div>
            </Modal>

            <ConfirmModal
                isOpen={!!confirmDelete}
                title="Delete bucket"
                message={
                    <>
                        Delete <strong>{confirmDelete?.name}</strong> ({confirmDelete?.publicId})? This removes its tracked
                        object records. Files in the actual bucket are not deleted.
                    </>
                }
                confirmLabel="Delete bucket"
                busy={deleting}
                onConfirm={doDelete}
                onClose={() => setConfirmDelete(null)}
            />

            {zipBucket && (
                <ZipProgressModal
                    isOpen={!!zipBucket}
                    bucketPublicId={zipBucket.publicId}
                    title={`Download "${zipBucket.name}" as ZIP`}
                    onClose={() => setZipBucket(null)}
                />
            )}
        </>
    );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                {label} {required && <span className="text-red-500">*</span>}
                {hint && <span className="ml-1.5 font-normal text-gray-400">{hint}</span>}
            </label>
            {children}
        </div>
    );
}
