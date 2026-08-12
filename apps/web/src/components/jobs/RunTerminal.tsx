import { useEffect, useRef } from "react";
import type { JobRunLog, JobRunLogLevel } from "@appszone/shared";

const LEVEL_COLOR: Record<JobRunLogLevel, string> = {
    debug: "text-gray-500",
    info: "text-gray-300",
    warn: "text-amber-400",
    error: "text-red-400",
    success: "text-emerald-400",
};

const LEVEL_MARK: Record<JobRunLogLevel, string> = {
    debug: "·",
    info: "›",
    warn: "!",
    error: "✗",
    success: "✓",
};

/**
 * Terminal-style view of a discovery run.
 *
 * Auto-scrolls only while the user is already at the bottom, so scrolling up to
 * read an earlier line isn't yanked away by incoming output.
 */
export function RunTerminal({
    logs,
    running,
    emptyHint = 'No output yet — hit "Find Now" to start a run.',
}: {
    logs: JobRunLog[];
    running: boolean;
    emptyHint?: string;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const pinnedToBottom = useRef(true);

    function handleScroll() {
        const el = scrollRef.current;
        if (!el) return;
        pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    }

    useEffect(() => {
        if (!pinnedToBottom.current) return;
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [logs]);

    return (
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-2 font-mono text-[11px] text-gray-500">discovery run</span>
                {running && (
                    <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-emerald-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                        running
                    </span>
                )}
            </div>

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="h-80 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-relaxed"
            >
                {logs.length === 0 ? (
                    <p className="text-gray-600">{emptyHint}</p>
                ) : (
                    logs.map((log) => (
                        <div key={log.id} className="flex gap-2 whitespace-pre-wrap break-words">
                            <span className="shrink-0 text-gray-600">
                                {new Date(log.createdAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                })}
                            </span>
                            <span className={`shrink-0 ${LEVEL_COLOR[log.level]}`}>{LEVEL_MARK[log.level]}</span>
                            {log.source && <span className="shrink-0 text-indigo-400">[{log.source}]</span>}
                            <span className={LEVEL_COLOR[log.level]}>{log.message}</span>
                        </div>
                    ))
                )}
                {running && <div className="mt-1 animate-pulse text-emerald-400">▍</div>}
            </div>
        </div>
    );
}
