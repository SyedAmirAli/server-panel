export interface PaginatedResult<T> {
  data: T[];
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
  totalPages: number;
  from: number;
  to: number;
  currentTotal: number;
  path: string;
  firstPageUrl: string | null;
  lastPageUrl: string | null;
  prevPageUrl: string | null;
  nextPageUrl: string | null;
  links: { url: string | null; label: string; active: boolean }[];
}

export interface PageMeta {
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
  from: number;
  to: number;
}
