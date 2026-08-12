import { useEffect, useRef, useState } from "react";
import { Briefcase, FileText, Mail, Plus, Type, User } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { peopleApi } from "@/lib/people";
import { jobsApi } from "@/lib/jobs";
import { studioApi } from "@/lib/studio";
import { PaginatedPicker } from "@/components/studio/PaginatedPicker";

export interface Attachments {
    /** Persisted on the conversation — these decide its mode. */
    profileId?: string | null;
    postingId?: string | null;
    /** Attached to the next message only. */
    jobText?: string;
    documentId?: string;
    toEmail?: string;
}

type Picker = "person" | "job" | "jobText" | "document" | "email" | null;

/**
 * The composer's `+`.
 *
 * One place to pull context into the conversation, rather than a header select
 * per attachable thing — new kinds join the menu instead of crowding the layout.
 *
 * Person and job are conversation-level, because they decide what the assistant
 * is *for*. Everything else rides along with the next message.
 */
export function AttachMenu({
    profileId,
    onAttach,
}: {
    /** Whose documents to offer, when a person is attached. */
    profileId?: string | null;
    onAttach: (patch: Attachments) => void;
}) {
    const [open, setOpen] = useState(false);
    const [picker, setPicker] = useState<Picker>(null);
    const [draft, setDraft] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [open]);

    const items = [
        { key: "person" as const, label: "Person", hint: "Who this is for", icon: User },
        { key: "job" as const, label: "Saved job", hint: "From your job list", icon: Briefcase },
        { key: "jobText" as const, label: "Paste a job description", hint: "Anything not in the list", icon: Type },
        { key: "document" as const, label: "Previous resume", hint: "Work from an earlier one", icon: FileText },
        { key: "email" as const, label: "Recipient address", hint: "Where to send it", icon: Mail },
    ];

    function choose(key: Exclude<Picker, null>) {
        setOpen(false);
        setDraft("");
        setPicker(key);
    }

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                title="Attach context"
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 transition-colors hover:border-indigo-400 hover:text-indigo-600"
            >
                <Plus size={16} />
            </button>

            {open && (
                <div className="absolute bottom-full left-0 z-20 mb-1.5 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                    {items.map(({ key, label, hint, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => choose(key)}
                            className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-gray-50"
                        >
                            <Icon size={14} className="mt-0.5 shrink-0 text-gray-400" />
                            <span className="min-w-0">
                                <span className="block text-sm text-gray-800">{label}</span>
                                <span className="block text-[11px] text-gray-400">{hint}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* ── pickers ── */}

            <Modal isOpen={picker === "person"} onClose={() => setPicker(null)} title="Attach a person">
                <PaginatedPicker
                    emptyLabel="No people yet — add one under People."
                    searchPlaceholder="Search people…"
                    fetchPage={async ({ search, offset, limit }) => {
                        const res = await peopleApi.list({ search: search || undefined, offset, limit });
                        return {
                            rows: res.data.map((p) => ({
                                id: p.id,
                                primary: p.name,
                                secondary: p.headline ?? p.email ?? undefined,
                                meta: `${p._count.projectItems} projects`,
                            })),
                            total: res.total,
                        };
                    }}
                    onPick={(id) => {
                        onAttach({ profileId: id });
                        setPicker(null);
                    }}
                />
            </Modal>

            <Modal isOpen={picker === "job"} onClose={() => setPicker(null)} title="Attach a job">
                <PaginatedPicker
                    emptyLabel="No job postings found yet."
                    searchPlaceholder="Search by title or company…"
                    fetchPage={async ({ search, offset, limit }) => {
                        const res = await jobsApi.listPostings({
                            search: search || undefined,
                            page: Math.floor(offset / limit) + 1,
                            limit,
                        });
                        return {
                            rows: res.data.map((p) => ({
                                id: p.id,
                                primary: p.title,
                                secondary: p.company,
                                meta: p.isRemote ? "remote" : (p.location ?? undefined),
                            })),
                            total: res.total,
                        };
                    }}
                    onPick={(id) => {
                        onAttach({ postingId: id });
                        setPicker(null);
                    }}
                />
            </Modal>

            <Modal isOpen={picker === "document"} onClose={() => setPicker(null)} title="Attach a previous resume">
                <PaginatedPicker
                    emptyLabel={profileId ? "Nothing generated yet." : "Attach a person first."}
                    searchPlaceholder="Search documents…"
                    fetchPage={async ({ search, offset, limit }) => {
                        if (!profileId) return { rows: [], total: 0 };
                        // This endpoint returns the whole (small) set, so paging and
                        // filtering happen here rather than adding a query API for
                        // a list that is rarely more than a handful long.
                        const all = await studioApi.listDocuments(profileId);
                        const matched = search
                            ? all.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
                            : all;
                        return {
                            rows: matched.slice(offset, offset + limit).map((d) => ({
                                id: d.id,
                                primary: d.title,
                                secondary: d.kind.replace("_", " "),
                                meta: d.pageCount ? `${d.pageCount}p` : undefined,
                            })),
                            total: matched.length,
                        };
                    }}
                    onPick={(id) => {
                        onAttach({ documentId: id });
                        setPicker(null);
                    }}
                />
            </Modal>

            <Modal isOpen={picker === "jobText"} onClose={() => setPicker(null)} title="Paste a job description">
                <div className="space-y-3">
                    <textarea
                        autoFocus
                        rows={10}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Paste the full posting here…"
                        className={field}
                    />
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setPicker(null)} className={ghostBtn}>
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                if (!draft.trim()) return;
                                onAttach({ jobText: draft.trim() });
                                setPicker(null);
                            }}
                            disabled={!draft.trim()}
                            className={primaryBtn}
                        >
                            Attach
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={picker === "email"} onClose={() => setPicker(null)} title="Attach a recipient">
                <div className="space-y-3">
                    <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="careers@company.com"
                        className={field}
                    />
                    <p className="text-xs text-gray-500">
                        Attaching an address does not send anything — you will still be asked to confirm.
                    </p>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setPicker(null)} className={ghostBtn}>
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                if (!draft.includes("@")) return;
                                onAttach({ toEmail: draft.trim() });
                                setPicker(null);
                            }}
                            disabled={!draft.includes("@")}
                            className={primaryBtn}
                        >
                            Attach
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

const field =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
const ghostBtn = "rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100";
const primaryBtn =
    "rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";
