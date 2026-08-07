import { useEffect, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import type { MailMessageDetailView } from "@appszone/shared";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate, formatBytes } from "@/lib/format";

/** Renders a synced message's actual email body — HTML in a sandboxed iframe, plain text as a fallback. */
export function EmailPreviewModal({ messageId, onClose }: { messageId: string | null; onClose: () => void }) {
    const [detail, setDetail] = useState<MailMessageDetailView | null>(null);
    const [loading, setLoading] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        if (!messageId) {
            setDetail(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        api<MailMessageDetailView>(`/utility/mail-messages/${messageId}`)
            .then((d) => !cancelled && setDetail(d))
            .catch((err) => {
                if (!cancelled) toastError(err instanceof Error ? err.message : "Could not load message");
            })
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [messageId]);

    // Grow the iframe to fit its rendered content instead of showing a fixed-size scrollbox.
    function onIframeLoad() {
        const doc = iframeRef.current?.contentDocument;
        if (doc?.documentElement) {
            iframeRef.current!.style.height = `${doc.documentElement.scrollHeight + 20}px`;
        }
    }

    return (
        <Modal isOpen={!!messageId} onClose={onClose} title="Email preview" size="lg">
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Spinner size="lg" />
                </div>
            ) : detail ? (
                <div className="space-y-3">
                    <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
                        <p className="text-base font-semibold text-gray-900 line-clamp-2">{detail.subject}</p>
                        <div className="mt-1.5 space-y-0.5 text-xs text-gray-500">
                            <p>
                                <span className="font-medium text-gray-600">From:</span> {detail.from}
                            </p>
                            <p>
                                <span className="font-medium text-gray-600">To:</span> {detail.to.join(", ") || "—"}
                            </p>
                            {detail.cc.length > 0 && (
                                <p>
                                    <span className="font-medium text-gray-600">Cc:</span> {detail.cc.join(", ")}
                                </p>
                            )}
                            <p>{formatDate(detail.receivedAt)}</p>
                        </div>
                    </div>

                    {detail.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {detail.attachments.map((a, i) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600"
                                    title={a.contentType}
                                >
                                    <Paperclip size={11} />
                                    {a.filename ?? "attachment"} · {formatBytes(a.size)}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="overflow-hidden rounded-xl border border-gray-100">
                        {detail.html ? (
                            <iframe
                                ref={iframeRef}
                                title="Email body"
                                // No allow-scripts: renders the email's HTML/CSS but never executes embedded
                                // scripts — the standard safe way to display untrusted email HTML.
                                sandbox="allow-same-origin"
                                srcDoc={detail.html}
                                onLoad={onIframeLoad}
                                className="w-full min-h-[200px] max-h-[65vh] overflow-y-auto bg-white"
                            />
                        ) : (
                            <pre className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap break-words bg-white p-4 text-xs leading-relaxed text-gray-700">
                                {detail.body || "(empty message)"}
                            </pre>
                        )}
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}
