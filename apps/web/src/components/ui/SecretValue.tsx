import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";

interface SecretValueProps {
    value: string;
    /** Table rows start masked; modals show full value with copy. */
    variant?: "table" | "modal";
    mono?: boolean;
    className?: string;
}

export function SecretValue({ value, variant = "table", mono = true, className = "" }: SecretValueProps) {
    const [revealed, setRevealed] = useState(variant === "modal");

    if (!value) return <span className="text-gray-400">—</span>;

    const isModal = variant === "modal";

    return (
        <div className={`flex items-start gap-1.5 ${className}`}>
            <code
                className={`min-w-0 flex-1 break-all whitespace-pre-wrap text-xs text-gray-700 ${
                    mono ? "font-mono" : ""
                } ${
                    isModal
                        ? "rounded-lg bg-gray-100 px-3 py-2.5 ring-1 ring-gray-200"
                        : "rounded-md bg-gray-100 px-1.5 py-0.5"
                } ${!revealed && !isModal ? "blur-xs select-none" : ""}`}
            >
                {value}
            </code>
            <div className="flex shrink-0 items-center gap-0.5">
                {!isModal && (
                    <button
                        type="button"
                        onClick={() => setRevealed((v) => !v)}
                        title={revealed ? "Hide" : "Reveal"}
                        aria-label={revealed ? "Hide value" : "Reveal value"}
                        className="rounded-md bg-slate-100 p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                    >
                        {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                )}
                {(isModal || revealed) && <CopyButton value={value} label="Copy value" />}
            </div>
        </div>
    );
}
