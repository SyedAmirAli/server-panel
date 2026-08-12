import { useState } from "react";
import { Briefcase, Check, MessageSquare, Pencil, Trash2, User, X } from "lucide-react";
import type { ConversationSummary } from "@/lib/studio";

/**
 * Every conversation, newest activity first.
 *
 * Each row shows who and which job it was about, because "what was I doing in
 * this thread" is the question this list exists to answer.
 */
export function ConversationList({
    conversations,
    activeId,
    onOpen,
    onDelete,
    onRename,
}: {
    conversations: ConversationSummary[];
    activeId?: string;
    onOpen: (id: string) => void;
    onDelete: (id: string) => void;
    onRename: (id: string, title: string) => void;
}) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [confirmId, setConfirmId] = useState<string | null>(null);

    return (
        <div className="flex h-[320px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white lg:h-full lg:min-h-0">
            <div className="border-b border-gray-100 px-3 py-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Conversations {conversations.length > 0 && `(${conversations.length})`}
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-1.5">
                {conversations.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-gray-400">No conversations yet.</p>
                )}

                {conversations.map((c) => {
                    const active = c.id === activeId;
                    return (
                        <div
                            key={c.id}
                            className={`group mb-0.5 rounded-lg px-2 py-1.5 transition-colors ${
                                active ? "bg-indigo-50" : "hover:bg-gray-50"
                            }`}
                        >
                            {editingId === c.id ? (
                                <div className="flex items-center gap-1">
                                    <input
                                        autoFocus
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                onRename(c.id, draft);
                                                setEditingId(null);
                                            }
                                            if (e.key === "Escape") setEditingId(null);
                                        }}
                                        className="min-w-0 flex-1 rounded border border-indigo-300 px-1.5 py-0.5 text-xs outline-none"
                                    />
                                    <button
                                        onClick={() => {
                                            onRename(c.id, draft);
                                            setEditingId(null);
                                        }}
                                        className="text-emerald-600"
                                    >
                                        <Check size={12} />
                                    </button>
                                    <button onClick={() => setEditingId(null)} className="text-gray-400">
                                        <X size={12} />
                                    </button>
                                </div>
                            ) : confirmId === c.id ? (
                                <div className="flex items-center justify-between gap-1">
                                    <span className="truncate text-xs text-red-700">Delete this thread?</span>
                                    <div className="flex shrink-0 gap-1">
                                        <button
                                            onClick={() => {
                                                onDelete(c.id);
                                                setConfirmId(null);
                                            }}
                                            className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] text-white"
                                        >
                                            Delete
                                        </button>
                                        <button
                                            onClick={() => setConfirmId(null)}
                                            className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600"
                                        >
                                            No
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-start gap-1.5">
                                        <button
                                            onClick={() => onOpen(c.id)}
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <span
                                                className={`block truncate text-xs font-medium ${
                                                    active ? "text-indigo-700" : "text-gray-800"
                                                }`}
                                            >
                                                {c.title ?? "Untitled conversation"}
                                            </span>
                                        </button>

                                        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                            <button
                                                onClick={() => {
                                                    setEditingId(c.id);
                                                    setDraft(c.title ?? "");
                                                }}
                                                title="Rename"
                                                className="text-gray-300 hover:text-indigo-600"
                                            >
                                                <Pencil size={11} />
                                            </button>
                                            <button
                                                onClick={() => setConfirmId(c.id)}
                                                title="Delete"
                                                className="text-gray-300 hover:text-red-600"
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-400">
                                        {c.profile && (
                                            <span className="inline-flex items-center gap-0.5">
                                                <User size={9} />
                                                {c.profile.name}
                                            </span>
                                        )}
                                        {c.posting && (
                                            <span className="inline-flex min-w-0 items-center gap-0.5">
                                                <Briefcase size={9} />
                                                <span className="truncate">{c.posting.company}</span>
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-0.5">
                                            <MessageSquare size={9} />
                                            {c._count.messages}
                                        </span>
                                        <span>{relative(c.updatedAt)}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** "3h ago" reads better than a timestamp in a dense list. */
function relative(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}
