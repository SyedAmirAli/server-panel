import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
    Folder,
    FileIcon,
    Upload,
    Trash2,
    Copy,
    Eye,
    FileArchive,
    ChevronRight,
    HardDrive,
    Boxes,
    Database,
    RefreshCw,
    Link2 as LinkIcon,
} from "lucide-react";
import type { BucketStats, BucketView, StorageListEntry, StorageListResult, UploadResult } from "@appszone/shared";
import { api } from "@/lib/api";
import { uploadWithProgress } from "@/lib/upload";
import { toastError, toastSuccess } from "@/lib/toast";
import { formatBytes } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ActionBtn } from "@/components/ui/ActionBtn";
import { CopyButton } from "@/components/ui/CopyButton";
import { ZipProgressModal } from "@/pages/storage/ZipProgressModal";

/** Label + link + copy button, used for the upload result URLs. */
function UrlRow({ label, url }: { label: string; url: string }) {
    return (
        <div>
            <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
            <div className="flex items-start gap-2">
                <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block min-w-0 flex-1 break-all rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-indigo-600"
                >
                    {url}
                </a>
                <CopyButton value={url} label="Copy URL" size="md" />
            </div>
        </div>
    );
}

interface DeleteTarget {
    entry: StorageListEntry;
    keys: string[]; // resolved keys to delete (folder = recursive)
}

/* ── URL builders (mirror the API's objects.service) ─────────────── */
function encodeKey(key: string): string {
    return key.split("/").map(encodeURIComponent).join("/");
}
function buildEndpointUrl(bucket: BucketView, key: string): string {
    const enc = encodeKey(key);
    if (bucket.endpoint) {
        const base = bucket.endpoint.replace(/\/+$/, "");
        return bucket.forcePathStyle ? `${base}/${bucket.bucketName}/${enc}` : `${base}/${enc}`;
    }
    const region = bucket.region && bucket.region !== "auto" ? `.${bucket.region}` : "";
    return `https://${bucket.bucketName}.s3${region}.amazonaws.com/${enc}`;
}
function buildPublicUrl(bucket: BucketView, key: string): string {
    if (bucket.publicBaseUrl) return `${bucket.publicBaseUrl.replace(/\/+$/, "")}/${encodeKey(key)}`;
    return buildEndpointUrl(bucket, key);
}

/** Popup showing an object's URLs (public/CDN, provider endpoint, and a fresh presigned link). */
function ObjectLinksModal({
    bucket,
    publicId,
    entry,
    onClose,
}: {
    bucket: BucketView;
    publicId: string;
    entry: StorageListEntry;
    onClose: () => void;
}) {
    const [presigned, setPresigned] = useState<string | null>(null);
    const publicUrl = buildPublicUrl(bucket, entry.key);
    const endpointUrl = buildEndpointUrl(bucket, entry.key);

    useEffect(() => {
        let cancelled = false;
        api<{ url: string }>(
            `/admin/storage/buckets/${publicId}/objects/presign?key=${encodeURIComponent(entry.key)}&expiresIn=3600`
        )
            .then((r) => !cancelled && setPresigned(r.url))
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [publicId, entry.key]);

    return (
        <Modal isOpen onClose={onClose} title="Object links" size="md">
            <div className="space-y-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 text-sm text-gray-700">
                    <code className="font-mono text-xs">{entry.key}</code>
                </div>
                <UrlRow label={bucket.publicBaseUrl ? "Public URL (custom domain)" : "Public URL"} url={publicUrl} />
                {endpointUrl !== publicUrl && <UrlRow label="Provider endpoint URL" url={endpointUrl} />}
                {presigned ? (
                    <UrlRow label="Presigned URL (temporary, ~1h)" url={presigned} />
                ) : (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Spinner size="sm" /> Generating presigned URL…
                    </div>
                )}
                <p className="text-[11px] leading-relaxed text-gray-400">
                    Public/endpoint URLs work only if the object (or bucket policy) allows public read. The presigned URL
                    always opens the file but expires.
                </p>
                <button
                    onClick={onClose}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Done
                </button>
            </div>
        </Modal>
    );
}

const inputCls =
    "h-9 w-full rounded-lg border border-gray-200 px-3 text-sm placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

export function BucketDetail() {
    const { publicId = "" } = useParams();
    const [bucket, setBucket] = useState<BucketView | null>(null);
    const [stats, setStats] = useState<BucketStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const [prefix, setPrefix] = useState(""); // current folder (no trailing slash)
    const [listing, setListing] = useState<StorageListResult | null>(null);
    const [loading, setLoading] = useState(true);

    const [folderSizes, setFolderSizes] = useState<Record<string, number | null>>({});
    const [linkEntry, setLinkEntry] = useState<StorageListEntry | null>(null);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [zipPrefix, setZipPrefix] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const loadBucket = useCallback(async () => {
        try {
            // The list endpoint is paginated; fetch this bucket's row via search.
            const res = await api<{ data: BucketView[] }>(
                `/admin/storage/buckets?search=${encodeURIComponent(publicId)}&limit=50`,
            );
            const found = res.data.find((b) => b.publicId === publicId) ?? null;
            setBucket(found);
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not load bucket");
        }
    }, [publicId]);

    const loadStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            setStats(await api<BucketStats>(`/admin/storage/buckets/${publicId}/stats`));
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not load stats");
        } finally {
            setStatsLoading(false);
        }
    }, [publicId]);

    const loadListing = useCallback(async () => {
        setLoading(true);
        try {
            const qp = new URLSearchParams({ source: "live", limit: "500" });
            if (prefix) qp.set("prefix", prefix);
            setListing(await api<StorageListResult>(`/admin/storage/buckets/${publicId}/objects?${qp.toString()}`));
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not list objects");
        } finally {
            setLoading(false);
        }
    }, [publicId, prefix]);

    useEffect(() => {
        loadBucket();
        loadStats();
    }, [loadBucket, loadStats]);

    useEffect(() => {
        loadListing();
    }, [loadListing]);

    // Compute each visible folder's size in the background via the stats endpoint.
    useEffect(() => {
        const folders = listing?.entries.filter((e) => e.type === "folder") ?? [];
        if (folders.length === 0) return;
        let cancelled = false;
        setFolderSizes(Object.fromEntries(folders.map((f) => [f.key, null])));
        folders.forEach(async (f) => {
            try {
                const stats = await api<BucketStats>(
                    `/admin/storage/buckets/${publicId}/stats?prefix=${encodeURIComponent(f.key)}`,
                );
                if (!cancelled) setFolderSizes((prev) => ({ ...prev, [f.key]: stats.totalSize }));
            } catch {
                if (!cancelled) setFolderSizes((prev) => ({ ...prev, [f.key]: -1 }));
            }
        });
        return () => {
            cancelled = true;
        };
    }, [listing, publicId]);

    /** Recursively collect all file keys under a folder prefix (for folder delete/zip enumeration). */
    async function collectKeys(folderPrefix: string): Promise<string[]> {
        const qp = new URLSearchParams({ source: "live", limit: "1000", prefix: folderPrefix });
        const res = await api<StorageListResult>(`/admin/storage/buckets/${publicId}/objects?${qp.toString()}`);
        const keys: string[] = res.entries.filter((e) => e.type === "file").map((e) => e.key);
        for (const folder of res.entries.filter((e) => e.type === "folder")) {
            keys.push(...(await collectKeys(folder.key.replace(/\/$/, ""))));
        }
        return keys;
    }

    async function requestDelete(entry: StorageListEntry) {
        if (entry.type === "file") {
            setDeleteTarget({ entry, keys: [entry.key] });
            return;
        }
        setBusyKey(entry.key);
        try {
            const keys = await collectKeys(entry.key.replace(/\/$/, ""));
            setDeleteTarget({ entry, keys });
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not enumerate folder");
        } finally {
            setBusyKey(null);
        }
    }

    async function confirmDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await api(`/admin/storage/buckets/${publicId}/objects`, {
                method: "DELETE",
                body: { keys: deleteTarget.keys },
            });
            toastSuccess(`Deleted ${deleteTarget.keys.length} object(s)`);
            setDeleteTarget(null);
            loadListing();
            loadStats();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Delete failed");
        } finally {
            setDeleting(false);
        }
    }

    /** Server-side duplicate the object in the bucket (creates a "-copy" file). */
    async function duplicateFile(entry: StorageListEntry) {
        setBusyKey(entry.key);
        try {
            await api(`/admin/storage/buckets/${publicId}/objects/copy`, {
                method: "POST",
                body: { sourceKey: entry.key },
            });
            toastSuccess("Duplicated");
            loadListing();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Duplicate failed");
        } finally {
            setBusyKey(null);
        }
    }

    async function previewFile(entry: StorageListEntry) {
        setBusyKey(entry.key);
        try {
            const { url } = await api<{ url: string }>(
                `/admin/storage/buckets/${publicId}/objects/presign?key=${encodeURIComponent(entry.key)}&expiresIn=600`,
            );
            window.open(url, "_blank");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not open file");
        } finally {
            setBusyKey(null);
        }
    }

    const crumbs = prefix ? prefix.split("/") : [];

    return (
        <>
            <PageHeader
                title={bucket?.name ?? publicId}
                description={
                    bucket ? `${bucket.provider.toUpperCase()} · ${bucket.bucketName} · ${bucket.publicId}` : "Loading…"
                }
                breadcrumb={[
                    { label: "Storage" },
                    { label: "Buckets" },
                    { label: bucket?.name ?? publicId, active: true },
                ]}
                onRefresh={() => {
                    loadListing();
                    loadStats();
                }}
                refreshing={loading || statsLoading}
            />

            {/* Stats */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                    icon={Boxes}
                    label="Objects"
                    value={statsLoading ? "…" : (stats?.objectCount ?? 0).toLocaleString()}
                    tone="indigo"
                />
                <StatCard
                    icon={HardDrive}
                    label="Total size"
                    value={statsLoading ? "…" : formatBytes(stats?.totalSize ?? 0)}
                    tone="emerald"
                />
                <StatCard
                    icon={Database}
                    label="Provider"
                    value={bucket?.provider?.toUpperCase() ?? "—"}
                    tone="violet"
                />
                <StatCard
                    icon={Boxes}
                    label="Status"
                    value={bucket?.isActive ? "Active" : "Disabled"}
                    tone={bucket?.isActive ? "emerald" : "amber"}
                />
            </div>

            {/* Browser toolbar */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex min-w-0 items-center gap-1 text-sm text-gray-600">
                    <button
                        onClick={() => setPrefix("")}
                        className="rounded px-1.5 py-0.5 font-medium hover:bg-gray-100"
                    >
                        root
                    </button>
                    {crumbs.map((seg, i) => {
                        const path = crumbs.slice(0, i + 1).join("/");
                        return (
                            <span key={path} className="flex items-center gap-1">
                                <ChevronRight size={13} className="text-gray-300" />
                                <button
                                    onClick={() => setPrefix(path)}
                                    className="rounded px-1.5 py-0.5 hover:bg-gray-100"
                                >
                                    {seg}
                                </button>
                            </span>
                        );
                    })}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setZipPrefix(prefix)}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        <FileArchive size={15} /> {prefix ? "Download folder" : "Download bucket"}
                    </button>
                    <button
                        onClick={() => setUploadOpen(true)}
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                    >
                        <Upload size={15} /> Upload
                    </button>
                </div>
            </div>

            {/* Listing */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm max-h-[min(63vh,600px)] overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                ) : !listing || listing.entries.length === 0 ? (
                    <EmptyState icon={Folder} title="Empty folder" description="Upload files or pick another folder." />
                ) : (
                    <table className="w-full table-fixed text-sm">
                        <thead>
                            <tr>
                                <th className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                    Name
                                </th>
                                <th className="sticky top-0 z-10 w-28 border-b border-gray-100 bg-gray-50 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                    Size
                                </th>
                                <th className="sticky top-0 z-10 w-32 border-b border-gray-100 bg-gray-50 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {listing.entries.map((entry) => (
                                <tr key={entry.key} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-4 py-3">
                                        {entry.type === "folder" ? (
                                            <button
                                                onClick={() => setPrefix(entry.key.replace(/\/$/, ""))}
                                                title={entry.name}
                                                className="flex w-full items-center gap-2 font-medium text-gray-900 hover:text-indigo-600"
                                            >
                                                <Folder size={15} className="shrink-0 text-indigo-400" />
                                                <span className="truncate">{entry.name}</span>
                                            </button>
                                        ) : (
                                            <span className="flex items-center gap-2 text-gray-700" title={entry.name}>
                                                <FileIcon size={15} className="shrink-0 text-gray-400" />
                                                <span className="truncate">{entry.name}</span>
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 text-nowrap">
                                        {entry.type === "file"
                                            ? formatBytes(entry.size ?? 0)
                                            : folderSizes[entry.key] === undefined || folderSizes[entry.key] === null
                                              ? "…"
                                              : folderSizes[entry.key] === -1
                                                ? "—"
                                                : formatBytes(folderSizes[entry.key] as number)}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-0.5">
                                            {entry.type === "file" && (
                                                <>
                                                    <ActionBtn
                                                        icon={Eye}
                                                        label="Preview"
                                                        variant="edit"
                                                        loading={busyKey === entry.key}
                                                        onClick={() => previewFile(entry)}
                                                    />
                                                    <ActionBtn
                                                        icon={LinkIcon}
                                                        label="Get links"
                                                        variant="copy"
                                                        onClick={() => setLinkEntry(entry)}
                                                    />
                                                    <ActionBtn
                                                        icon={Copy}
                                                        label="Duplicate"
                                                        variant="rotate"
                                                        loading={busyKey === entry.key}
                                                        onClick={() => duplicateFile(entry)}
                                                    />
                                                </>
                                            )}
                                            {entry.type === "folder" && (
                                                <ActionBtn
                                                    icon={FileArchive}
                                                    label="Download folder (ZIP)"
                                                    variant="rotate"
                                                    onClick={() => setZipPrefix(entry.key.replace(/\/$/, ""))}
                                                />
                                            )}
                                            <ActionBtn
                                                icon={busyKey === entry.key ? RefreshCw : Trash2}
                                                label="Delete"
                                                variant="delete"
                                                loading={busyKey === entry.key}
                                                onClick={() => requestDelete(entry)}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {uploadOpen && (
                <UploadModal
                    publicId={publicId}
                    prefix={prefix}
                    onClose={() => setUploadOpen(false)}
                    onUploaded={() => {
                        loadListing();
                        loadStats();
                    }}
                />
            )}

            <ConfirmModal
                isOpen={!!deleteTarget}
                title={deleteTarget?.entry.type === "folder" ? "Delete folder" : "Delete file"}
                message={
                    <>
                        Permanently delete <strong>{deleteTarget?.entry.name}</strong>
                        {deleteTarget?.entry.type === "folder" ? ` and its ${deleteTarget?.keys.length} file(s)` : ""}?
                        This cannot be undone.
                    </>
                }
                confirmLabel="Delete"
                busy={deleting}
                onConfirm={confirmDelete}
                onClose={() => setDeleteTarget(null)}
            />

            {zipPrefix !== null && (
                <ZipProgressModal
                    isOpen={zipPrefix !== null}
                    bucketPublicId={publicId}
                    prefix={zipPrefix || undefined}
                    title={zipPrefix ? `Download "${zipPrefix}" as ZIP` : "Download bucket as ZIP"}
                    onClose={() => setZipPrefix(null)}
                />
            )}

            {linkEntry && bucket && (
                <ObjectLinksModal
                    bucket={bucket}
                    publicId={publicId}
                    entry={linkEntry}
                    onClose={() => setLinkEntry(null)}
                />
            )}

            {!bucket && !loading && (
                <p className="mt-4 text-sm text-gray-400">
                    Bucket not found.{" "}
                    <Link to="/storage" className="text-indigo-600">
                        Back to buckets
                    </Link>
                </p>
            )}
        </>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    tone,
}: {
    icon: typeof Boxes;
    label: string;
    value: string;
    tone: "indigo" | "emerald" | "violet" | "amber";
}) {
    const tones = {
        indigo: "bg-indigo-50 text-indigo-600",
        emerald: "bg-emerald-50 text-emerald-600",
        violet: "bg-violet-50 text-violet-600",
        amber: "bg-amber-50 text-amber-600",
    };
    return (
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
            <div className="flex items-center gap-2.5">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
                    <Icon size={16} />
                </div>
                <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
                    <p className="text-lg font-semibold text-gray-900">{value}</p>
                </div>
            </div>
        </div>
    );
}

interface FolderProgress {
    total: number;
    done: number;
    failed: { path: string; error: string }[];
    current: string;
    currentPct: number;
    finished: boolean;
    cancelled: boolean;
}

function UploadModal({
    publicId,
    prefix,
    onClose,
    onUploaded,
}: {
    publicId: string;
    prefix: string;
    onClose: () => void;
    onUploaded: () => void;
}) {
    const [tab, setTab] = useState<"file" | "folder">("file");
    const [isPrivate, setIsPrivate] = useState(true);
    const [uploadPrefix, setUploadPrefix] = useState(prefix);

    // Single-file mode
    const [file, setFile] = useState<File | null>(null);
    const [convertToWebp, setConvertToWebp] = useState(false);
    const [compress, setCompress] = useState(false);
    const [quality, setQuality] = useState(80);
    const [pct, setPct] = useState<number | null>(null);
    const [result, setResult] = useState<UploadResult | null>(null);
    const cancelRef = useRef<(() => void) | null>(null);

    // Folder mode
    const [folderFiles, setFolderFiles] = useState<File[]>([]);
    const [folderProgress, setFolderProgress] = useState<FolderProgress | null>(null);
    const folderCancelRef = useRef(false);

    async function start() {
        if (!file) return;
        const form = new FormData();
        form.append("file", file);
        if (uploadPrefix) form.append("prefix", uploadPrefix);
        form.append("private", String(isPrivate));
        if (convertToWebp) form.append("convertToWebp", "true");
        if (compress) form.append("compress", "true");
        if (convertToWebp || compress) form.append("quality", String(quality));

        setPct(0);
        const handle = uploadWithProgress<UploadResult>(
            `/admin/storage/buckets/${publicId}/objects/upload`,
            form,
            (p) => setPct(p),
        );
        cancelRef.current = handle.cancel;
        try {
            const res = await handle.promise;
            setResult(res);
            toastSuccess("File uploaded");
            onUploaded();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Upload failed");
            setPct(null);
        } finally {
            cancelRef.current = null;
        }
    }

    /** Upload every file in the picked folder one-by-one, preserving its relative path verbatim. */
    async function startFolder() {
        if (folderFiles.length === 0) return;
        folderCancelRef.current = false;
        const failed: { path: string; error: string }[] = [];
        setFolderProgress({ total: folderFiles.length, done: 0, failed: [], current: "", currentPct: 0, finished: false, cancelled: false });

        for (let i = 0; i < folderFiles.length; i++) {
            if (folderCancelRef.current) break;
            const f = folderFiles[i];
            const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
            const keyPath = [uploadPrefix.trim(), rel].filter(Boolean).join("/");

            const form = new FormData();
            form.append("file", f);
            form.append("keyPath", keyPath); // raw: preserve name/ext, overwrite, no processing
            form.append("private", String(isPrivate));

            setFolderProgress((p) => p && { ...p, current: rel, currentPct: 0 });
            const handle = uploadWithProgress<UploadResult>(
                `/admin/storage/buckets/${publicId}/objects/upload`,
                form,
                (cp) => setFolderProgress((p) => p && { ...p, currentPct: cp }),
            );
            try {
                await handle.promise;
            } catch (err) {
                failed.push({ path: rel, error: err instanceof Error ? err.message : "failed" });
            }
            setFolderProgress((p) => p && { ...p, done: i + 1, failed: [...failed] });
        }

        const cancelled = folderCancelRef.current;
        setFolderProgress((p) => p && { ...p, finished: true, current: "", cancelled });
        onUploaded();
        if (cancelled) toastError("Folder upload cancelled");
        else if (failed.length === 0) toastSuccess(`Uploaded ${folderFiles.length} files`);
        else toastError(`${failed.length} of ${folderFiles.length} files failed`);
    }

    const isImage = file?.type.startsWith("image/") && file.type !== "image/svg+xml";
    const folderRoot = folderFiles[0]
        ? (folderFiles[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0]
        : undefined;
    const folderRunning = folderProgress !== null && !folderProgress.finished;
    const folderPct = folderProgress
        ? Math.round(((folderProgress.done + folderProgress.currentPct / 100) / folderProgress.total) * 100)
        : 0;

    return (
        <Modal isOpen onClose={onClose} title="Upload" size="md">
            {result ? (
                <div className="space-y-3">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
                        Uploaded as <code className="font-mono text-xs">{result.key}</code>
                    </div>
                    <UrlRow label={result.presigned ? "Presigned URL (expires)" : "Public URL"} url={result.url} />
                    {result.endpointUrl && result.endpointUrl !== result.url && (
                        <UrlRow label="Provider endpoint URL" url={result.endpointUrl} />
                    )}
                    <button
                        onClick={onClose}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        Done
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Mode tabs */}
                    <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
                        {(["file", "folder"] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                disabled={pct !== null || folderRunning}
                                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                                    tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                                }`}
                            >
                                {t === "file" ? "Single file" : "Folder"}
                            </button>
                        ))}
                    </div>

                    {tab === "file" ? (
                        <>
                            <input
                                type="file"
                                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-600"
                            />

                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-gray-700">Folder (prefix)</label>
                                <input
                                    className={inputCls}
                                    value={uploadPrefix}
                                    onChange={(e) => setUploadPrefix(e.target.value)}
                                    placeholder="documents/students"
                                />
                            </div>

                            <label className="flex items-center gap-2 text-sm text-gray-600">
                                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                                Private object (returns a presigned URL)
                            </label>

                            {isImage && (
                                <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                                    <label className="flex items-center gap-2 text-sm text-gray-600">
                                        <input type="checkbox" checked={convertToWebp} onChange={(e) => setConvertToWebp(e.target.checked)} /> Convert to WebP
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-gray-600">
                                        <input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} /> Compress
                                    </label>
                                    {(convertToWebp || compress) && (
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <span>Quality</span>
                                            <input type="range" min={1} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="flex-1" />
                                            <span className="w-8 text-right font-medium">{quality}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {pct !== null && <ProgressBar value={pct} tone="emerald" label="Uploading…" />}

                            <div className="flex gap-2 pt-1">
                                <button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                                    Cancel
                                </button>
                                <button
                                    onClick={start}
                                    disabled={!file || pct !== null}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {pct !== null && <Spinner size="sm" />}
                                    Upload
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <input
                                type="file"
                                multiple
                                ref={(el) => {
                                    // webkitdirectory isn't a typed React attr; set it on the DOM node.
                                    if (el) el.setAttribute("webkitdirectory", "");
                                }}
                                onChange={(e) => setFolderFiles(Array.from(e.target.files ?? []))}
                                disabled={folderRunning}
                                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-600"
                            />

                            {folderFiles.length > 0 && (
                                <p className="text-xs text-gray-500">
                                    <strong>{folderFiles.length}</strong> file(s){folderRoot ? ` from “${folderRoot}”` : ""} — uploaded verbatim (names, extensions, and subfolders preserved; overwrites existing).
                                </p>
                            )}

                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                    Destination prefix <span className="font-normal text-gray-400">optional — prepended to each path</span>
                                </label>
                                <input className={inputCls} value={uploadPrefix} onChange={(e) => setUploadPrefix(e.target.value)} placeholder="e.g. backups/2026" disabled={folderRunning} />
                            </div>

                            <label className="flex items-center gap-2 text-sm text-gray-600">
                                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} disabled={folderRunning} />
                                Upload as private objects
                            </label>

                            {folderProgress && (
                                <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                                    <ProgressBar
                                        value={folderPct}
                                        tone={folderProgress.cancelled ? "amber" : "emerald"}
                                        label={`${folderProgress.done}/${folderProgress.total} files`}
                                    />
                                    {folderProgress.current && <p className="truncate text-xs text-gray-500" title={folderProgress.current}>Uploading: {folderProgress.current}</p>}
                                    {folderProgress.finished && folderProgress.failed.length > 0 && (
                                        <div className="max-h-24 overflow-y-auto text-xs text-red-600">
                                            {folderProgress.failed.map((f) => (
                                                <p key={f.path} className="truncate" title={`${f.path}: ${f.error}`}>✗ {f.path}</p>
                                            ))}
                                        </div>
                                    )}
                                    {folderProgress.finished && folderProgress.failed.length === 0 && !folderProgress.cancelled && (
                                        <p className="text-xs text-emerald-600">All files uploaded ✓</p>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-2 pt-1">
                                {folderProgress?.finished ? (
                                    <button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                                        Close
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => (folderRunning ? (folderCancelRef.current = true) : onClose())}
                                            className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                        >
                                            {folderRunning ? "Cancel" : "Close"}
                                        </button>
                                        <button
                                            onClick={startFolder}
                                            disabled={folderFiles.length === 0 || folderRunning}
                                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                                        >
                                            {folderRunning && <Spinner size="sm" />}
                                            Upload folder
                                        </button>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </Modal>
    );
}
