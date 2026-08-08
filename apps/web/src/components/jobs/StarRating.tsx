import { Star } from "lucide-react";

const TONE: Record<number, string> = {
    5: "text-emerald-500",
    4: "text-emerald-500",
    3: "text-amber-500",
    2: "text-gray-400",
    1: "text-gray-300",
};

/**
 * 1–5 star fit rating. Renders a muted placeholder when a posting has not been
 * scored yet, so the column never collapses and unscored rows stay obvious.
 */
export function StarRating({ stars, size = 14 }: { stars: number | null | undefined; size?: number }) {
    if (!stars) {
        return <span className="text-xs text-gray-300">Unrated</span>;
    }

    const tone = TONE[stars] ?? "text-gray-400";

    return (
        <span className="inline-flex items-center gap-0.5" title={`${stars} of 5`} aria-label={`${stars} of 5 stars`}>
            {[1, 2, 3, 4, 5].map((n) => (
                <Star
                    key={n}
                    size={size}
                    className={n <= stars ? tone : "text-gray-200"}
                    fill={n <= stars ? "currentColor" : "none"}
                    strokeWidth={2}
                />
            ))}
        </span>
    );
}

const VERDICT_STYLES: Record<string, string> = {
    strong: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    good: "bg-sky-50 text-sky-700 ring-sky-200",
    stretch: "bg-amber-50 text-amber-700 ring-amber-200",
    weak: "bg-gray-100 text-gray-500 ring-gray-200",
};

export function VerdictBadge({ verdict }: { verdict: string | null | undefined }) {
    if (!verdict) return null;
    const style = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.weak;
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${style}`}>
            {verdict}
        </span>
    );
}
