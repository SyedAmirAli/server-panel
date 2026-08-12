import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { ResumeDocument } from "@appszone/shared";
import { AtsResume } from "@/components/resume/AtsResume";

/**
 * Print-only view of a generated document.
 *
 * Rendered outside the app shell — no sidebar, no nav — because two things load
 * it: the Studio preview iframe, and headless Chromium when generating the PDF.
 * Using the same route for both is what makes the preview the artifact rather
 * than a lookalike.
 *
 * Chromium cannot carry an Authorization header, so this route accepts the admin
 * token via `?token=` (the same accommodation the SSE endpoints already make).
 */
export function PrintResume() {
    const { documentId = "" } = useParams();
    const [params] = useSearchParams();
    const [doc, setDoc] = useState<ResumeDocument | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Deliberately same-origin, ignoring VITE_API_BASE_URL: this page is only
        // ever served by the API itself (Chromium loads it from 127.0.0.1, the
        // preview iframe from wherever the admin is). An absolute base configured
        // for a split-origin deploy would differ by hostname and CORS would block
        // the fetch — which is exactly what happened when it did use it.
        const base = "/api/v1";
        const token = params.get("token") ?? localStorage.getItem("azm_admin_token") ?? "";

        void (async () => {
            try {
                const res = await fetch(`${base}/admin/studio/documents/${documentId}/content?token=${encodeURIComponent(token)}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (!res.ok) throw new Error(`Could not load document (${res.status})`);
                setDoc((await res.json()) as ResumeDocument);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load");
            }
        })();
    }, [documentId, params]);

    if (error) {
        // Rendered as visible text rather than thrown: when Chromium prints a
        // failure we want a readable PDF explaining why, not a blank sheet.
        return <div className="p-10 font-sans text-sm text-red-600">{error}</div>;
    }
    if (!doc) return <div className="p-10 font-sans text-sm text-gray-400">Loading…</div>;

    return (
        <div
            // `data-print-ready` is what the renderer waits for before printing —
            // polling a fixed timeout would either race the render or waste seconds.
            data-print-ready="true"
            data-page-hint={doc.pageCount ?? ""}
            className="flex min-h-screen items-start justify-center bg-gray-100 p-4 print:bg-white print:p-0"
        >
            <AtsResume content={doc.contentJson} blocks={doc.blocks} />
        </div>
    );
}
