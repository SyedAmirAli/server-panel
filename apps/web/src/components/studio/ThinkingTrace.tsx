import { useState } from "react";
import { Brain, ChevronDown, ChevronRight, Loader2, Terminal } from "lucide-react";

export interface TraceStep {
    kind: "thinking" | "tool_call" | "tool_result";
    text: string;
    /** Machine name, shown alongside the human phrasing for tool steps. */
    tool?: string;
}

/**
 * What the assistant did under the hood.
 *
 * Expanded while it works, so you can watch it happen; collapsed once finished,
 * because a completed answer should not be buried under its own workings. The
 * trace stays available — being able to see *which* lookup produced a number is
 * what makes the answer checkable rather than merely plausible.
 */
export function ThinkingTrace({
    steps,
    running,
    seconds,
}: {
    steps: TraceStep[];
    running: boolean;
    seconds?: number;
}) {
    const [open, setOpen] = useState(false);
    if (steps.length === 0) return null;

    // While running it is always shown; afterwards it is the user's choice.
    const expanded = running || open;
    const latest = steps[steps.length - 1];

    return (
        <div className="mb-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50/80">
            <button
                onClick={() => setOpen((v) => !v)}
                disabled={running}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-gray-100 disabled:hover:bg-transparent"
            >
                {running ? (
                    <Loader2 size={12} className="shrink-0 animate-spin text-indigo-500" />
                ) : (
                    <Brain size={12} className="shrink-0 text-gray-400" />
                )}

                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-gray-600">
                    {running ? latest.text : thoughtSummary(steps, seconds)}
                </span>

                {!running &&
                    (open ? (
                        <ChevronDown size={12} className="shrink-0 text-gray-400" />
                    ) : (
                        <ChevronRight size={12} className="shrink-0 text-gray-400" />
                    ))}
            </button>

            {expanded && (
                <div className="space-y-1 border-t border-gray-200/70 px-2.5 py-2">
                    {steps.map((step, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[11px]">
                            {step.kind === "tool_call" ? (
                                <Terminal size={10} className="mt-0.5 shrink-0 text-indigo-400" />
                            ) : (
                                <span
                                    className={`mt-1 h-1 w-1 shrink-0 rounded-full ${
                                        step.kind === "tool_result" ? "bg-emerald-400" : "bg-gray-300"
                                    }`}
                                />
                            )}
                            <span
                                className={
                                    step.kind === "tool_result"
                                        ? "text-gray-600"
                                        : step.kind === "tool_call"
                                          ? "font-mono text-indigo-600"
                                          : "text-gray-500"
                                }
                            >
                                {step.text}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function thoughtSummary(steps: TraceStep[], seconds?: number): string {
    const lookups = steps.filter((s) => s.kind === "tool_call").length;
    const duration = seconds ? ` for ${seconds}s` : "";
    if (lookups === 0) return `Thought${duration}`;
    return `Thought${duration} · ${lookups} lookup${lookups === 1 ? "" : "s"}`;
}
