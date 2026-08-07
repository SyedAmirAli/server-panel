import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Spinner } from "./Spinner";

export interface RowMenuItem {
    key: string;
    label: string;
    icon: LucideIcon;
    onClick: () => void;
    tone?: "default" | "danger";
    disabled?: boolean;
    disabledReason?: string;
    loading?: boolean;
}

const PANEL_WIDTH = 224; // w-56
const ITEM_HEIGHT = 36;
const VIEWPORT_MARGIN = 8;

/**
 * Kebab-triggered dropdown for per-row actions in a table (replaces a row of individual icon buttons).
 * The panel is portaled to <body> and positioned with `fixed` coordinates computed from the trigger
 * button, so it always renders on top instead of being clipped by a scrollable table container.
 */
export function RowMenu({ items, align = "right" }: { items: RowMenuItem[]; align?: "left" | "right" }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!open || !btnRef.current) return;
        const rect = btnRef.current.getBoundingClientRect();
        const panelHeight = items.length * ITEM_HEIGHT + 8;

        let left = align === "left" ? rect.left : rect.right - PANEL_WIDTH;
        left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN));

        let top = rect.bottom + 4;
        if (top + panelHeight > window.innerHeight - VIEWPORT_MARGIN) {
            top = rect.top - panelHeight - 4; // not enough room below — open upward instead
        }
        setPos({ top, left });
    }, [open, align, items.length]);

    useEffect(() => {
        if (!open) return;
        function onDocPointerDown(e: MouseEvent) {
            const target = e.target as Node;
            if (btnRef.current?.contains(target)) return;
            if (panelRef.current?.contains(target)) return;
            setOpen(false);
        }
        function onScrollOrResize() {
            setOpen(false);
        }
        document.addEventListener("mousedown", onDocPointerDown);
        // capture:true catches scroll on any ancestor scroll container, not just window
        window.addEventListener("scroll", onScrollOrResize, true);
        window.addEventListener("resize", onScrollOrResize);
        return () => {
            document.removeEventListener("mousedown", onDocPointerDown);
            window.removeEventListener("scroll", onScrollOrResize, true);
            window.removeEventListener("resize", onScrollOrResize);
        };
    }, [open]);

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                title="Actions"
                aria-label="Actions"
                onClick={() => setOpen((o) => !o)}
                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
                <MoreVertical size={15} strokeWidth={2.25} />
            </button>
            {open &&
                pos &&
                createPortal(
                    <div
                        ref={panelRef}
                        style={{ position: "fixed", top: pos.top, left: pos.left, width: PANEL_WIDTH }}
                        className="z-50 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg shadow-gray-200/60"
                    >
                        {items.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                title={item.disabled ? item.disabledReason : undefined}
                                disabled={item.disabled || item.loading}
                                onClick={() => {
                                    setOpen(false);
                                    item.onClick();
                                }}
                                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                    item.tone === "danger"
                                        ? "text-red-600 hover:bg-red-50"
                                        : "text-gray-700 hover:bg-gray-50"
                                }`}
                            >
                                {item.loading ? <Spinner size="sm" /> : <item.icon size={14} strokeWidth={2.25} />}
                                {item.label}
                            </button>
                        ))}
                    </div>,
                    document.body
                )}
        </>
    );
}
