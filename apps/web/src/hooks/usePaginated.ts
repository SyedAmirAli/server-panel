import { useState, useEffect, useRef } from 'react';
import type { PaginatedResult, PageMeta } from '@/lib/types';
import { toastError } from '@/lib/toast';

export interface FetchParams {
  page: number;
  limit: number;
  search: string;
}

export type Fetcher<T> = (params: FetchParams) => Promise<PaginatedResult<T>>;

export interface UsePaginatedResult<T> {
  data: T[];
  meta: PageMeta | null;
  isLoading: boolean;
  error: string | null;
  page: number;
  limit: number;
  search: string;
  setPage: (p: number) => void;
  setLimit: (limit: number) => void;
  setSearch: (s: string) => void;
  refresh: () => void;
}

export function usePaginated<T>(
  fetcher: Fetcher<T>,
  options: { limit?: number } = {},
): UsePaginatedResult<T> {
  const [limit, setLimitState] = useState(options.limit ?? 10);
  const [page, setPageState] = useState(1);
  const [search, setSearchState] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [data, setData] = useState<T[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetcherRef.current({ page, limit, search: debouncedSearch })
      .then((result) => {
        if (cancelled) return;
        setData(result.data);
        setMeta({
          total: result.total,
          perPage: result.perPage,
          currentPage: result.currentPage,
          lastPage: result.lastPage,
          from: result.from,
          to: result.to,
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        const message = err.message || 'Failed to load';
        setError(message);
        toastError(message);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [page, limit, debouncedSearch, tick]);

  const setPage = (p: number) => setPageState(p);
  const setLimit = (n: number) => {
    setLimitState(n);
    setPageState(1);
  };
  const setSearch = (s: string) => { setSearchState(s); setPageState(1); };
  const refresh = () => setTick((t) => t + 1);

  return { data, meta, isLoading, error, page, limit, search, setPage, setLimit, setSearch, refresh };
}
