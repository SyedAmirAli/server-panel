import { useState } from "react";
import { AlertTriangle, Check, Pencil, X } from "lucide-react";
import type { DocumentBlock, ResumeDocument } from "@appszone/shared";
import { studioApi } from "@/lib/studio";
import { toastError, toastSuccess } from "@/lib/toast";

/**
 * Live preview of a draft, with a numbered gutter.
 *
 * The numbers are display for **stable block ids**, not wrapped visual lines.
 * Visual numbering renumbers on every edit, so a later "also fix line 24" would
 * land on whatever moved into that position — the model and the user would be
 * talking about different text.
 *
 * The page itself is the same print route Chromium prints, loaded in an iframe,
 * so what you see is the artifact rather than a lookalike.
 */
export function ResumePreview({
    document: doc,
    onChanged,
}: {
    document: ResumeDocument;
    onChanged: (doc: ResumeDocument) => void;
}) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [highlight, setHighlight] = useState<string | null>(null);

    const blocks = (doc.blocks ?? []) as DocumentBlock[];
    const warnings = (doc.warnings ?? []) as string[];

    async function save(block: DocumentBlock) {
        if (!draft.trim()) return;
        setSaving(true);
        try {
            const updated = await studioApi.updateBlock(doc.id, block.id, draft.trim());
            onChanged(updated);
            setEditingId(null);
            toastSuccess("Block updated");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not update");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            {/* ─── the artifact ─── */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2">
                    <span className="text-xs font-medium text-gray-600">
                        Preview — this is exactly what gets printed
                    </span>
                    {doc.pageCount != null && (
                        <span className={`text-xs ${doc.pageCount > 2 ? "text-amber-600" : "text-gray-400"}`}>
                            {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"}
                        </span>
                    )}
                </div>
                <iframe
                    // Same route the renderer drives, so the preview cannot drift
                    // from the PDF.
                    src={`/print/resume/${doc.id}`}
                    title="Resume preview"
                    className="h-[720px] w-full border-0 bg-white"
                />
            </div>

            {/* ─── numbered blocks ─── */}
            <div className="rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-3 py-2">
                    <h3 className="text-sm font-semibold text-gray-900">Numbered blocks</h3>
                    <p className="text-xs text-gray-500">
                        Reference a number in chat (“fix line 4”) or click one to edit it here.
                    </p>
                </div>

                {warnings.length > 0 && (
                    <div className="border-b border-amber-100 bg-amber-50 px-3 py-2">
                        {warnings.map((w, i) => (
                            <p key={i} className="flex items-start gap-1 text-xs text-amber-800">
                                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                {w}
                            </p>
                        ))}
                    </div>
                )}

                <div className="max-h-[660px] overflow-y-auto p-2">
                    {blocks.length === 0 && (
                        <p className="px-2 py-6 text-center text-sm text-gray-400">No blocks in this document.</p>
                    )}
                    {blocks.map((block) => (
                        <div
                            key={block.id}
                            onMouseEnter={() => setHighlight(block.id)}
                            onMouseLeave={() => setHighlight(null)}
                            className={`group flex gap-2 rounded-lg px-2 py-1.5 ${
                                highlight === block.id ? "bg-indigo-50" : ""
                            }`}
                        >
                            {/* Gutter number — no-print, never reaches the PDF. */}
                            <span className="w-6 shrink-0 select-none pt-0.5 text-right font-mono text-[11px] text-gray-400">
                                {block.number}
                            </span>

                            <div className="min-w-0 flex-1">
                                {editingId === block.id ? (
                                    <div className="space-y-1.5">
                                        <textarea
                                            autoFocus
                                            rows={3}
                                            value={draft}
                                            onChange={(e) => setDraft(e.target.value)}
                                            className="w-full rounded-lg border border-indigo-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
                                        />
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => void save(block)}
                                                disabled={saving}
                                                className="rounded bg-emerald-600 p-1 text-white hover:bg-emerald-700 disabled:opacity-50"
                                            >
                                                <Check size={12} />
                                            </button>
                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="rounded border border-gray-200 p-1 text-gray-500 hover:bg-gray-50"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-start gap-1.5">
                                        <p
                                            className={`flex-1 text-sm ${
                                                block.unsupported ? "text-amber-700" : "text-gray-700"
                                            }`}
                                        >
                                            {block.text}
                                            {block.unsupported && (
                                                <span className="ml-1 text-[10px] font-medium uppercase text-amber-600">
                                                    unverified
                                                </span>
                                            )}
                                        </p>
                                        <button
                                            onClick={() => {
                                                setEditingId(block.id);
                                                setDraft(block.text);
                                            }}
                                            className="opacity-0 transition-opacity group-hover:opacity-100"
                                        >
                                            <Pencil size={12} className="text-gray-400 hover:text-indigo-600" />
                                        </button>
                                    </div>
                                )}
                                <span className="text-[10px] uppercase tracking-wide text-gray-300">
                                    {block.section}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
