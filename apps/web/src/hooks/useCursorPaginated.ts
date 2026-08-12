import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toastError } from "@/lib/toast";

export interface CursorPage<T> {
    data: T[];
    nextCursor: string | null;
    /** Total rows matching the current search, independent of how many are loaded so far. Optional — not every cursor endpoint computes it. */
    total?: number;
}

export type CursorFetcher<T> = (params: { cursor?: string; limit: number; search: string }) => Promise<CursorPage<T>>;

export interface UseCursorPaginatedResult<T> {
    data: T[];
    total: number | undefined;
    isLoading: boolean;
    isLoadingMore: boolean;
    hasMore: boolean;
    search: string;
    setSearch: (s: string) => void;
    loadMore: () => void;
    refresh: () => void;
    /** True paging (replaces `data` instead of appending) — for prev/next arrow UIs instead of "Load more". */
    pageIndex: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    goToNextPage: () => void;
    goToPrevPage: () => void;
}

/**
 * Keyset-cursor pagination, not offset — pairs with endpoints like GET /utility/mail-messages
 * that return { data, nextCursor } instead of a Laravel-style page/total shape. The current
 * cursor and search query are mirrored into the URL's search params (via the `cursorParam`/
 * `searchParam` keys) so a reload or shared link resumes from roughly the same spot. Accumulated
 * results themselves live only in component state — reloading re-fetches starting at the
 * URL's cursor rather than replaying every earlier page.
 */
export function useCursorPaginated<T>(
    fetcher: CursorFetcher<T>,
    options: { limit?: number; cursorParam?: string; searchParam?: string } = {}
): UseCursorPaginatedResult<T> {
    const limit = options.limit ?? 50;
    const cursorParam = options.cursorParam ?? "cursor";
    const searchParam = options.searchParam ?? "q";

    const [searchParams, setSearchParams] = useSearchParams();
    const initialCursor = searchParams.get(cursorParam) ?? undefined;
    const [search, setSearchState] = useState(searchParams.get(searchParam) ?? "");
    const [debouncedSearch, setDebouncedSearch] = useState(search);

    const [data, setData] = useState<T[]>([]);
    const [total, setTotal] = useState<number | undefined>(undefined);
    const [nextCursor, setNextCursor] = useState<string | undefined>(initialCursor);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [tick, setTick] = useState(0);
    // Cursor used to fetch each visited page, indexed by page number (index 0 = the start).
    // Lets goToPrevPage re-fetch an earlier page without the server needing backward cursors.
    const pageCursorsRef = useRef<(string | undefined)[]>([initialCursor]);
    const [pageIndex, setPageIndex] = useState(0);
    const fetcherRef = useRef(fetcher);
    useEffect(() => {
        fetcherRef.current = fetcher;
    });
    // Only the very first fetch resumes from the URL's cursor (a reload mid-scroll); any
    // later fetch in this effect (search change, refresh) is a new list and starts fresh.
    const isFirstRun = useRef(true);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 400);
        return () => clearTimeout(t);
    }, [search]);

    // Fresh load: search changed, or an explicit refresh — always starts from the beginning,
    // ignoring any cursor already in the URL (a new search/refresh is a new list, not "load more").
    useEffect(() => {
        let cancelled = false;
        const resumeCursor = isFirstRun.current ? initialCursor : undefined;
        isFirstRun.current = false;
        pageCursorsRef.current = [resumeCursor];
        setPageIndex(0);
        setIsLoading(true);
        fetcherRef
            .current({ cursor: resumeCursor, limit, search: debouncedSearch })
            .then((page) => {
                if (cancelled) return;
                setData(page.data);
                setTotal(page.total);
                setNextCursor(page.nextCursor ?? undefined);
                setSearchParams(
                    (prev) => {
                        const next = new URLSearchParams(prev);
                        if (debouncedSearch) next.set(searchParam, debouncedSearch);
                        else next.delete(searchParam);
                        next.delete(cursorParam);
                        return next;
                    },
                    { replace: true }
                );
            })
            .catch((err: Error) => {
                if (!cancelled) toastError(err.message || "Failed to load");
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearch, limit, tick]);

    const loadMore = useCallback(() => {
        if (!nextCursor || isLoadingMore) return;
        setIsLoadingMore(true);
        fetcherRef
            .current({ cursor: nextCursor, limit, search: debouncedSearch })
            .then((page) => {
                setData((prev) => [...prev, ...page.data]);
                setTotal(page.total);
                setNextCursor(page.nextCursor ?? undefined);
                setSearchParams(
                    (prev) => {
                        const next = new URLSearchParams(prev);
                        next.set(cursorParam, nextCursor);
                        return next;
                    },
                    { replace: true }
                );
            })
            .catch((err: Error) => toastError(err.message || "Failed to load more"))
            .finally(() => setIsLoadingMore(false));
    }, [nextCursor, isLoadingMore, limit, debouncedSearch, cursorParam, setSearchParams]);

    // True paging: fetches with the cursor for the target page and replaces `data`, rather
    // than appending like loadMore. goToPrevPage re-fetches from a cursor recorded on the
    // way forward — the API only supports forward cursors, so going back means re-requesting
    // the earlier page rather than walking data already in memory.
    const goToNextPage = useCallback(() => {
        if (!nextCursor || isLoadingMore) return;
        setIsLoadingMore(true);
        fetcherRef
            .current({ cursor: nextCursor, limit, search: debouncedSearch })
            .then((page) => {
                pageCursorsRef.current[pageIndex + 1] = nextCursor;
                setData(page.data);
                setTotal(page.total);
                setNextCursor(page.nextCursor ?? undefined);
                setPageIndex((i) => i + 1);
                setSearchParams(
                    (prev) => {
                        const next = new URLSearchParams(prev);
                        next.set(cursorParam, nextCursor);
                        return next;
                    },
                    { replace: true }
                );
            })
            .catch((err: Error) => toastError(err.message || "Failed to load next page"))
            .finally(() => setIsLoadingMore(false));
    }, [nextCursor, isLoadingMore, limit, debouncedSearch, cursorParam, pageIndex, setSearchParams]);

    const goToPrevPage = useCallback(() => {
        if (pageIndex <= 0 || isLoadingMore) return;
        const targetIndex = pageIndex - 1;
        const targetCursor = pageCursorsRef.current[targetIndex];
        setIsLoadingMore(true);
        fetcherRef
            .current({ cursor: targetCursor, limit, search: debouncedSearch })
            .then((page) => {
                setData(page.data);
                setTotal(page.total);
                setNextCursor(page.nextCursor ?? undefined);
                setPageIndex(targetIndex);
                setSearchParams(
                    (prev) => {
                        const next = new URLSearchParams(prev);
                        if (targetCursor) next.set(cursorParam, targetCursor);
                        else next.delete(cursorParam);
                        return next;
                    },
                    { replace: true }
                );
            })
            .catch((err: Error) => toastError(err.message || "Failed to load previous page"))
            .finally(() => setIsLoadingMore(false));
    }, [pageIndex, isLoadingMore, limit, debouncedSearch, cursorParam, setSearchParams]);

    const setSearch = useCallback((s: string) => setSearchState(s), []);
    const refresh = useCallback(() => setTick((t) => t + 1), []);

    return {
        data,
        total,
        isLoading,
        isLoadingMore,
        hasMore: !!nextCursor,
        search,
        setSearch,
        loadMore,
        refresh,
        pageIndex,
        hasNextPage: !!nextCursor,
        hasPrevPage: pageIndex > 0,
        goToNextPage,
        goToPrevPage,
    };
}
