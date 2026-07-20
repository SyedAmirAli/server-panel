import { useEffect, useRef, useState } from "react";
import { Download, FileArchive } from "lucide-react";
import type { ZipJobView } from "@appszone/shared";
import { api, getToken } from "@/lib/api";
import { toastError, toastSuccess } from "@/lib/toast";
import { formatBytes } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Spinner } from "@/components/ui/Spinner";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

interface ZipProgressModalProps {
    isOpen: boolean;
    bucketPublicId: string;
    /** Folder prefix to zip; empty/undefined = whole bucket. */
    prefix?: string;
    title: string;
    onClose: () => void;
}

/** Starts a ZIP job, streams live progress over SSE, allows cancel + download. */
export function ZipProgressModal({ isOpen, bucketPublicId, prefix, title, onClose }: ZipProgressModalProps) {
    const [job, setJob] = useState<ZipJobView | null>(null);
    const [starting, setStarting] = useState(false);
    const esRef = useRef<EventSource | null>(null);
    const startedRef = useRef(false);

    useEffect(() => {
        if (!isOpen) return;
        startedRef.current = false;
        setJob(null);
        setStarting(true);

        let cancelled = false;
        (async () => {
            try {
                const created = await api<ZipJobView>(`/admin/storage/buckets/${bucketPublicId}/zip`, {
                    method: "POST",
                    body: { prefix: prefix || undefined },
                });
                if (cancelled) return;
                setJob(created);
                startedRef.current = true;
                openStream(created.id);
            } catch (err) {
                if (!cancelled) toastError(err instanceof Error ? err.message : "Could not start ZIP job");
            } finally {
                if (!cancelled) setStarting(false);
            }
        })();

        return () => {
            cancelled = true;
            esRef.current?.close();
            esRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, bucketPublicId, prefix]);

    function openStream(jobId: string) {
        const token = getToken();
        const url = `${BASE_URL}/admin/storage/zip/${jobId}/events?token=${encodeURIComponent(token ?? "")}`;
        const es = new EventSource(url);
        esRef.current = es;
        es.onmessage = (e) => {
            try {
                const next = JSON.parse(e.data) as ZipJobView;
                setJob(next);
                if (next.status === "ready" || next.status === "error" || next.status === "cancelled") {
                    es.close();
                    esRef.current = null;
                    if (next.status === "ready") toastSuccess("Archive ready to download");
                    if (next.status === "error") toastError(next.error || "ZIP failed");
                }
            } catch {
                /* ignore malformed frame */
            }
        };
        es.onerror = () => {
            // Stream ends after the terminal event; only surface if still processing.
            es.close();
            esRef.current = null;
        };
    }

    async function cancelJob() {
        if (!job) return;
        try {
            await api(`/admin/storage/zip/${job.id}`, { method: "DELETE" });
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Cancel failed");
        }
    }

    function download() {
        if (!job) return;
        const token = getToken();
        const url = `${BASE_URL}/admin/storage/zip/${job.id}/download?token=${encodeURIComponent(token ?? "")}`;
        window.open(url, "_blank");
    }

    function handleClose() {
        // Cancel a still-running job when the user dismisses the dialog.
        if (job && (job.status === "processing" || job.status === "pending")) void cancelJob();
        esRef.current?.close();
        esRef.current = null;
        onClose();
    }

    const pct = job && job.totalBytes > 0 ? Math.round((job.processedBytes / job.totalBytes) * 100) : undefined;
    const statusLabel: Record<ZipJobView["status"], string> = {
        pending: "Preparing…",
        processing: "Archiving files…",
        ready: "Ready to download",
        error: "Failed",
        cancelled: "Cancelled",
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title={title} size="md">
            <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
                    <FileArchive size={20} className="text-indigo-500" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">
                            {prefix ? prefix : "Entire bucket"}
                        </p>
                        <p className="text-xs text-gray-500">
                            {job ? statusLabel[job.status] : starting ? "Starting…" : "…"}
                        </p>
                    </div>
                </div>

                {starting && !job && (
                    <div className="flex items-center justify-center py-6">
                        <Spinner size="lg" />
                    </div>
                )}

                {job && (
                    <>
                        <ProgressBar
                            value={job.status === "ready" ? 100 : pct}
                            tone={job.status === "error" || job.status === "cancelled" ? "amber" : "emerald"}
                            label={`${job.processedFiles}/${job.totalFiles} files · ${formatBytes(job.processedBytes)} / ${formatBytes(job.totalBytes)}`}
                        />

                        {job.status === "error" && <p className="text-xs text-red-600">{job.error}</p>}

                        <div className="flex gap-2 pt-1">
                            {(job.status === "processing" || job.status === "pending") && (
                                <button
                                    onClick={cancelJob}
                                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                            )}
                            {job.status === "ready" && (
                                <button
                                    onClick={download}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                                >
                                    <Download size={15} /> Download ZIP
                                </button>
                            )}
                            {(job.status === "ready" || job.status === "error" || job.status === "cancelled") && (
                                <button
                                    onClick={handleClose}
                                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    Close
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
