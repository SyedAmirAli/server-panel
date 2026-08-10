import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

/**
 * Technology tags for a project or role.
 *
 * These are not decoration — they are the ranking key the tailoring engine sorts
 * on, so entry is made deliberately easy: Enter or comma commits a tag, and
 * Backspace on an empty field removes the last one.
 */
export function TagInput({
    value,
    onChange,
    placeholder = "Add a technology and press Enter",
}: {
    value: string[];
    onChange: (tags: string[]) => void;
    placeholder?: string;
}) {
    const [draft, setDraft] = useState("");

    function commit(raw: string) {
        const tag = raw.trim().replace(/,+$/, "");
        if (!tag) return;
        // Case-insensitive de-dupe, keeping the spelling already entered.
        if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
            setDraft("");
            return;
        }
        onChange([...value, tag]);
        setDraft("");
    }

    function handleKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(draft);
        } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
            {value.map((tag) => (
                <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                >
                    {tag}
                    <button
                        type="button"
                        onClick={() => onChange(value.filter((t) => t !== tag))}
                        className="text-indigo-400 hover:text-indigo-700"
                        aria-label={`Remove ${tag}`}
                    >
                        <X size={11} />
                    </button>
                </span>
            ))}
            <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKey}
                onBlur={() => commit(draft)}
                placeholder={value.length ? "" : placeholder}
                className="min-w-[140px] flex-1 border-0 bg-transparent py-0.5 text-sm outline-none placeholder:text-gray-400"
            />
        </div>
    );
}
