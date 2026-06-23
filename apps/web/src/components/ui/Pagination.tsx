import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { PageMeta } from "@/lib/types";

interface PaginationProps {
    meta: PageMeta;
    onPageChange: (page: number) => void;
}

function NavBtn({
    onClick,
    disabled,
    label,
    children,
}: {
    onClick: () => void;
    disabled: boolean;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
            {children}
        </button>
    );
}

export function Pagination({ meta, onPageChange }: PaginationProps) {
    const { currentPage, lastPage, from, to, total } = meta;
    const pages = lastPage || 1;
    const showing = total === 0 ? 0 : to - from + 1;

    return (
        <div className="flex flex-col gap-3 border-t border-gray-100 bg-linear-to-r from-gray-50/80 to-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
                <strong className="font-semibold text-gray-800">{total.toLocaleString()}</strong> entries{" "}
                <span className="text-gray-400">(</span>
                Showing <strong className="font-semibold text-gray-800">{showing}</strong> items on page{" "}
                <strong className="font-semibold text-gray-800">{currentPage}</strong> of total{" "}
                <strong className="font-semibold text-gray-800">{pages}</strong> pages
                <span className="text-gray-400">)</span>
            </p>

            <div className="flex items-center justify-end gap-1">
                <NavBtn onClick={() => onPageChange(1)} disabled={currentPage <= 1} label="First page">
                    <ChevronsLeft size={15} />
                </NavBtn>
                <NavBtn onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1} label="Previous page">
                    <ChevronLeft size={15} />
                </NavBtn>

                <span className="mx-1 flex h-8 min-w-8 items-center justify-center rounded-full bg-emerald-600 px-2 text-sm font-semibold text-white shadow-sm">
                    {currentPage}
                </span>

                <NavBtn onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= pages} label="Next page">
                    <ChevronRight size={15} />
                </NavBtn>
                <NavBtn onClick={() => onPageChange(pages)} disabled={currentPage >= pages} label="Last page">
                    <ChevronsRight size={15} />
                </NavBtn>
            </div>
        </div>
    );
}
