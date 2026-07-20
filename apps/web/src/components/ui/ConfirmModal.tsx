import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "danger" | "default";
    busy?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

/** Reusable warning/confirm dialog built on Modal (replaces native confirm()). */
export function ConfirmModal({
    isOpen,
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    tone = "danger",
    busy = false,
    onConfirm,
    onClose,
}: ConfirmModalProps) {
    const confirmClasses =
        tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700";
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
            <div className="flex items-start gap-3">
                {tone === "danger" && (
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                        <AlertTriangle size={18} />
                    </div>
                )}
                <div className="text-sm text-gray-600">{message}</div>
            </div>
            <div className="mt-5 flex gap-2">
                <button
                    onClick={onClose}
                    disabled={busy}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                    {cancelLabel}
                </button>
                <button
                    onClick={onConfirm}
                    disabled={busy}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-colors ${confirmClasses}`}
                >
                    {busy && <Spinner size="sm" />}
                    {confirmLabel}
                </button>
            </div>
        </Modal>
    );
}
