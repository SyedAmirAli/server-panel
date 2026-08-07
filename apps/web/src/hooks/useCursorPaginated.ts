import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toastError } from "@/lib/toast";

export interface CursorPage<T> {
    data: T[];
    nextCursor: string | null;
}

export type CursorFetcher<T> = (params: { cursor?: string; limit: number; search: string }) => Promise<CursorPage<T>>;

export interface UseCursorPaginatedResult<T> {
    data: T[];
    isLoading: boolean;
    isLoadingMore: boolean;
    hasMore: boolean;
    search: string;
    setSearch: (s: string) => void;
    loadMore: () => void;
    refresh: () => void;
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
    const [nextCursor, setNextCursor] = useState<string | undefined>(initialCursor);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [tick, setTick] = useState(0);
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
        setIsLoading(true);
        fetcherRef
            .current({ cursor: resumeCursor, limit, search: debouncedSearch })
            .then((page) => {
                if (cancelled) return;
                setData(page.data);
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

    const setSearch = useCallback((s: string) => setSearchState(s), []);
    const refresh = useCallback(() => setTick((t) => t + 1), []);

    return {
        data,
        isLoading,
        isLoadingMore,
        hasMore: !!nextCursor,
        search,
        setSearch,
        loadMore,
        refresh,
    };
}
