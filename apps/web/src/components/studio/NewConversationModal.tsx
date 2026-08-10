import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { PersonRow } from "@/lib/people";
import type { PostingRow } from "@/lib/jobs";

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
    people,
    postings,
    onStart,
}: {
    isOpen: boolean;
    onClose: () => void;
    people: PersonRow[];
    postings: PostingRow[];
    onStart: (profileId: string | null, postingId: string | null) => void;
}) {
    const [profileId, setProfileId] = useState("");
    const [postingId, setPostingId] = useState("");

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
                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">Person</span>
                    <select className={select} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                        <option value="">None — general questions</option>
                        {people.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                                {p.headline ? ` — ${p.headline}` : ""}
                            </option>
                        ))}
                    </select>
                    {people.length === 0 && (
                        <span className="mt-1 block text-[11px] text-amber-700">
                            No people yet — add one under People to build resumes.
                        </span>
                    )}
                </label>

                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">Job</span>
                    <select
                        className={select}
                        value={postingId}
                        onChange={(e) => setPostingId(e.target.value)}
                        disabled={!profileId}
                    >
                        <option value="">None — or paste a description in the chat</option>
                        {postings.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.title} — {p.company}
                            </option>
                        ))}
                    </select>
                    {!profileId && (
                        <span className="mt-1 block text-[11px] text-gray-400">
                            Pick a person first — a job on its own has nobody to tailor for.
                        </span>
                    )}
                </label>

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
        </Modal>
    );
}

const select =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400";
