import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  pill?: boolean;
}

export function SearchBar({ value, onChange, placeholder = 'Search…', pill = false }: SearchBarProps) {
  return (
    <div className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`h-10 w-full border border-gray-200 bg-gray-50/80 pr-10 pl-4 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100 ${
          pill ? 'rounded-full' : 'rounded-xl'
        }`}
      />
      <Search size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-9 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label="Clear search"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
