interface ProgressBarProps {
    /** 0–100. If omitted, renders an indeterminate bar. */
    value?: number;
    label?: string;
    tone?: "indigo" | "emerald" | "amber";
}

const TONES: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
    indigo: "bg-indigo-600",
    emerald: "bg-emerald-600",
    amber: "bg-amber-500",
};

export function ProgressBar({ value, label, tone = "indigo" }: ProgressBarProps) {
    const pct = value === undefined ? undefined : Math.max(0, Math.min(100, value));
    return (
        <div className="w-full">
            {(label || pct !== undefined) && (
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                    <span>{label}</span>
                    {pct !== undefined && <span className="font-medium text-gray-700">{pct}%</span>}
                </div>
            )}
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                    className={`h-full rounded-full ${TONES[tone]} transition-[width] duration-300 ${
                        pct === undefined ? "w-1/3 animate-pulse" : ""
                    }`}
                    style={pct === undefined ? undefined : { width: `${pct}%` }}
                />
            </div>
        </div>
    );
}
