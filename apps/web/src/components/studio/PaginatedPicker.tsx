import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

export interface PickerRow {
    id: string;
    primary: string;
    secondary?: string;
    meta?: string;
}

export interface PickerPage {
    rows: PickerRow[];
    total: number;
}

const PER_PAGE = 50;

/**
 * A chooser for lists that are too long to hold in the browser.
 *
 * The job list alone runs to five figures, so filtering an array the client
 * already downloaded is not an option — search and paging both happen on the
 * server, and the footer states plainly how much you are looking at out of how
 * much there is.
 */
export function PaginatedPicker({
    fetchPage,
    onPick,
    emptyLabel,
    searchPlaceholder = "Search…",
}: {
    fetchPage: (params: { search: string; offset: number; limit: number }) => Promise<PickerPage>;
    onPick: (id: string, row: PickerRow) => void;
    emptyLabel: string;
    searchPlaceholder?: string;
}) {
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(0);
    const [result, setResult] = useState<PickerPage>({ rows: [], total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(
        async (searchTerm: string, pageIndex: number) => {
            setLoading(true);
            setError(null);
            try {
                setResult(await fetchPage({ search: searchTerm, offset: pageIndex * PER_PAGE, limit: PER_PAGE }));
            } catch (err) {
                setError(err instanceof Error ? err.message : "Could not load");
                setResult({ rows: [], total: 0 });
            } finally {
                setLoading(false);
            }
        },
        [fetchPage]
    );

    // Debounced so typing does not fire a request per keystroke, and any search
    // change returns to the first page — page 7 of the old results is meaningless.
    useEffect(() => {
        const timer = setTimeout(() => void load(search, page), search ? 250 : 0);
        return () => clearTimeout(timer);
    }, [search, page, load]);

    useEffect(() => {
        setPage(0);
    }, [search]);

    const from = result.total === 0 ? 0 : page * PER_PAGE + 1;
    const to = Math.min((page + 1) * PER_PAGE, result.total);
    const hasPrev = page > 0;
    const hasNext = to < result.total;

    return (
        <div className="space-y-2">
            <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
            </div>

            <div className="min-h-[280px]">
                {loading ? (
                    <div className="flex justify-center py-16">
                        <Spinner />
                    </div>
                ) : error ? (
                    <p className="py-16 text-center text-sm text-red-600">{error}</p>
                ) : result.rows.length === 0 ? (
                    <p className="py-16 text-center text-sm text-gray-400">
                        {search ? "Nothing matched that search." : emptyLabel}
                    </p>
                ) : (
                    <div className="max-h-[340px] overflow-y-auto">
                        {result.rows.map((row) => (
                            <button
                                key={row.id}
                                onClick={() => onPick(row.id, row)}
                                className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-gray-50"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm text-gray-800">{row.primary}</span>
                                    {row.secondary && (
                                        <span className="block truncate text-xs text-gray-400">{row.secondary}</span>
                                    )}
                                </span>
                                {row.meta && (
                                    <span className="shrink-0 text-[11px] text-gray-400">{row.meta}</span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Always shown, even for one page — "3 of 3" answers "is that all?" */}
            <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                <span className="text-xs text-gray-500">
                    {result.total === 0 ? "No entries" : `${from.toLocaleString()}–${to.toLocaleString()} of ${result.total.toLocaleString()} entries`}
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={!hasPrev || loading}
                        aria-label="Previous page"
                        className={pagerBtn}
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <button
                        onClick={() => setPage((p) => p + 1)}
                        disabled={!hasNext || loading}
                        aria-label="Next page"
                        className={pagerBtn}
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}

const pagerBtn =
    "flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent";
