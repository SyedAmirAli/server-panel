import { Briefcase, FileText, Mail, Type, User, X } from "lucide-react";
import type { ResumeDocument } from "@appszone/shared";
import type { ConversationDetail } from "@/lib/studio";
import type { Attachments } from "@/components/studio/AttachMenu";

export type RemovableAttachment = "person" | "job" | "jobText" | "documentId" | "toEmail";

/**
 * What the assistant will be given, shown above the input.
 *
 * Attached context that is invisible is context you cannot trust: if the answer
 * turns out to be about the wrong person, the reason should be on screen rather
 * than buried in a header select.
 */
export function AttachedChips({
    conversation,
    pending,
    documents,
    onRemove,
}: {
    conversation: ConversationDetail;
    pending: Attachments;
    documents: ResumeDocument[];
    onRemove: (what: RemovableAttachment) => void;
}) {
    const document = pending.documentId ? documents.find((d) => d.id === pending.documentId) : undefined;

    const chips: Array<{ key: RemovableAttachment; icon: typeof User; label: string; sticky?: boolean }> = [];

    if (conversation.profile) {
        chips.push({ key: "person", icon: User, label: conversation.profile.name, sticky: true });
    }
    if (conversation.posting) {
        chips.push({
            key: "job",
            icon: Briefcase,
            label: `${conversation.posting.title} — ${conversation.posting.company}`,
            sticky: true,
        });
    }
    if (pending.jobText) {
        chips.push({ key: "jobText", icon: Type, label: `Job description (${wordCount(pending.jobText)} words)` });
    }
    if (pending.documentId) {
        chips.push({ key: "documentId", icon: FileText, label: document?.title ?? "Previous resume" });
    }
    if (pending.toEmail) {
        chips.push({ key: "toEmail", icon: Mail, label: pending.toEmail });
    }

    if (chips.length === 0) return null;

    return (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {chips.map(({ key, icon: Icon, label, sticky }) => (
                <span
                    key={key}
                    title={sticky ? "Stays for the whole conversation" : "Attached to your next message"}
                    className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${
                        sticky
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                            : "border-gray-200 bg-gray-50 text-gray-600"
                    }`}
                >
                    <Icon size={10} className="shrink-0" />
                    <span className="truncate">{label}</span>
                    <button
                        onClick={() => onRemove(key)}
                        className="shrink-0 opacity-50 transition-opacity hover:opacity-100"
                        aria-label={`Remove ${label}`}
                    >
                        <X size={10} />
                    </button>
                </span>
            ))}
        </div>
    );
}

function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}
