import { useState } from "react";
import { Briefcase, Sparkles, User, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { peopleApi } from "@/lib/people";
import { jobsApi } from "@/lib/jobs";
import { PaginatedPicker } from "@/components/studio/PaginatedPicker";

/**
 * Starting a conversation is where its purpose is decided.
 *
 * Person + job → a resume session, and the assistant is handed that person's
 * whole record. Neither → a general thread about platform data, where no resume
 * work happens at all. The mode follows the choice rather than being a separate
 * setting to get wrong.
 */
export function NewConversationModal({
    isOpen,
    onClose,
    onStart,
}: {
    isOpen: boolean;
    onClose: () => void;
    onStart: (profileId: string | null, postingId: string | null) => void;
}) {
    const [person, setPerson] = useState<{ id: string; label: string } | null>(null);
    const [job, setJob] = useState<{ id: string; label: string } | null>(null);
    const [picking, setPicking] = useState<"person" | "job" | null>(null);

    const profileId = person?.id ?? "";
    const postingId = job?.id ?? "";

    const mode = profileId && postingId ? "tailoring" : profileId ? "candidate" : "general";
    const explanation =
        mode === "tailoring"
            ? "A resume session. The assistant gets this person's full record and the job description, and can build a tailored resume."
            : mode === "candidate"
              ? "The assistant knows this person completely. Pick a job here or paste one in the chat to build a resume."
              : "A general thread about your mail, jobs, storage and applications. No resume work happens here.";

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="New conversation">
            <div className="space-y-3">
                <Slot
                    label="Person"
                    icon={User}
                    value={person?.label}
                    placeholder="None — general questions"
                    onPick={() => setPicking("person")}
                    onClear={() => {
                        setPerson(null);
                        setJob(null);
                    }}
                />

                <Slot
                    label="Job"
                    icon={Briefcase}
                    value={job?.label}
                    placeholder={person ? "None — or paste a description in the chat" : "Pick a person first"}
                    disabled={!person}
                    onPick={() => setPicking("job")}
                    onClear={() => setJob(null)}
                />

                <div className="rounded-lg bg-gray-50 p-2.5">
                    <p className="flex items-start gap-1.5 text-xs text-gray-600">
                        <Sparkles size={12} className="mt-0.5 shrink-0 text-indigo-400" />
                        <span>
                            <span className="font-medium text-gray-800">{mode}</span> — {explanation}
                        </span>
                    </p>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                        Cancel
                    </button>
                    <button
                        onClick={() => onStart(profileId || null, postingId || null)}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        Start conversation
                    </button>
                </div>
            </div>

            <Modal isOpen={picking === "person"} onClose={() => setPicking(null)} title="Choose a person">
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
                    onPick={(id, row) => {
                        setPerson({ id, label: row.primary });
                        setPicking(null);
                    }}
                />
            </Modal>

            <Modal isOpen={picking === "job"} onClose={() => setPicking(null)} title="Choose a job">
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
                    onPick={(id, row) => {
                        setJob({ id, label: `${row.primary} — ${row.secondary ?? ""}`.trim() });
                        setPicking(null);
                    }}
                />
            </Modal>
        </Modal>
    );
}

/** One chooser row: what is selected, or an invitation to choose. */
function Slot({
    label,
    icon: Icon,
    value,
    placeholder,
    disabled,
    onPick,
    onClear,
}: {
    label: string;
    icon: typeof User;
    value?: string;
    placeholder: string;
    disabled?: boolean;
    onPick: () => void;
    onClear: () => void;
}) {
    return (
        <div>
            <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={onPick}
                    disabled={disabled}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        disabled
                            ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
                            : value
                              ? "border-indigo-300 bg-indigo-50/50 text-gray-800"
                              : "border-gray-300 text-gray-400 hover:border-indigo-400"
                    }`}
                >
                    <Icon size={14} className="shrink-0 text-gray-400" />
                    <span className="truncate">{value ?? placeholder}</span>
                </button>
                {value && (
                    <button type="button" onClick={onClear} className="text-gray-400 hover:text-red-600" aria-label={`Clear ${label}`}>
                        <X size={14} />
                    </button>
                )}
            </div>
        </div>
    );
}
