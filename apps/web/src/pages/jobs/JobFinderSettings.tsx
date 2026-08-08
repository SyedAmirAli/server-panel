import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Clock, FileUser, Play, Save, Terminal } from "lucide-react";
import type { CandidateProfile, JobFinderSettings as Settings, JobRunLog, JobSource } from "@appszone/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { RunTerminal } from "@/components/jobs/RunTerminal";
import { jobsApi, streamRunLogs } from "@/lib/jobs";
import { toastError, toastInfo, toastSuccess } from "@/lib/toast";
import { ApiError } from "@/lib/api";

const CRON_PRESETS = [
    { label: "Every hour", value: "0 * * * *" },
    { label: "Every 3 hours", value: "0 */3 * * *" },
    { label: "Every 6 hours", value: "0 */6 * * *" },
    { label: "Twice daily", value: "0 9,18 * * *" },
    { label: "Daily 9am", value: "0 9 * * *" },
];

const inputCls =
    "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400";

export function JobFinderSettings() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();

    const [settings, setSettings] = useState<Settings | null>(null);
    const [sources, setSources] = useState<JobSource[]>([]);
    const [profile, setProfile] = useState<CandidateProfile | null>(null);
    const [nextRun, setNextRun] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [running, setRunning] = useState(false);

    const [logs, setLogs] = useState<JobRunLog[]>([]);
    const [runId, setRunId] = useState<string | null>(params.get("run"));
    const stopStream = useRef<(() => void) | null>(null);

    /* ─── Load ───────────────────────────────────────────────── */

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [s, src, prof] = await Promise.all([
                jobsApi.getSettings(),
                jobsApi.listSources(),
                jobsApi.activeProfile().catch(() => null),
            ]);
            setSettings(s);
            setNextRun(s.nextRun);
            setSources(src);
            setProfile(prof);
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not load settings");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    /* ─── Run log: replay history, then follow live ──────────── */

    useEffect(() => {
        if (!runId) return;

        let cancelled = false;

        void (async () => {
            try {
                const run = await jobsApi.getRun(runId);
                if (cancelled) return;

                setLogs(run.logs ?? []);
                const finished = run.status !== "running";
                setRunning(!finished);
                if (finished) return;

                stopStream.current = streamRunLogs(runId, {
                    onLog: (log) =>
                        // Runs can emit fast; de-dupe by id so a replayed line
                        // never appears twice when the stream overlaps history.
                        setLogs((prev) => (prev.some((l) => l.id === log.id) ? prev : [...prev, log])),
                    onDone: () => {
                        setRunning(false);
                        void load();
                    },
                    onError: () => setRunning(false),
                });
            } catch {
                if (!cancelled) setRunning(false);
            }
        })();

        return () => {
            cancelled = true;
            stopStream.current?.();
            stopStream.current = null;
        };
    }, [runId, load]);

    /* ─── Actions ────────────────────────────────────────────── */

    async function findNow() {
        setRunning(true);
        setLogs([]);
        try {
            const { id } = await jobsApi.startRun();
            setRunId(id);
            setParams({ run: id }, { replace: true });
            toastInfo("Discovery started");
        } catch (err) {
            setRunning(false);
            toastError(err instanceof ApiError ? err.message : "Could not start a run");
        }
    }

    async function save() {
        if (!settings) return;
        setSaving(true);
        try {
            const saved = await jobsApi.updateSettings({
                cronEnabled: settings.cronEnabled,
                cronExpression: settings.cronExpression,
                lookbackHours: settings.lookbackHours,
                minStars: settings.minStars,
                maxJobsPerRun: settings.maxJobsPerRun,
                scoringModel: settings.scoringModel,
                writingModel: settings.writingModel,
                keywords: settings.keywords ?? [],
                locations: settings.locations ?? [],
                excludeCompanies: settings.excludeCompanies ?? [],
            });
            setSettings(saved);
            setNextRun(saved.nextRun);
            toastSuccess(saved.cronEnabled ? "Saved — schedule active" : "Saved — schedule off");
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not save settings");
        } finally {
            setSaving(false);
        }
    }

    async function importProfile() {
        setImporting(true);
        try {
            const imported = await jobsApi.importProfile({ force: true });
            setProfile(imported);
            toastSuccess(`Imported ${imported.name}`);
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not import the CV");
        } finally {
            setImporting(false);
        }
    }

    async function toggleSource(source: JobSource, isActive: boolean) {
        try {
            const updated = await jobsApi.updateSource(source.id, { isActive });
            setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        } catch (err) {
            toastError(err instanceof ApiError ? err.message : "Could not update the source");
        }
    }

    function patch(next: Partial<Settings>) {
        setSettings((prev) => (prev ? { ...prev, ...next } : prev));
    }

    if (loading || !settings) {
        return (
            <div className="flex justify-center py-24">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                title="Job Finder Settings"
                description="Schedule discovery, choose sources, and keep your CV profile in sync."
                nav={
                    <button
                        type="button"
                        onClick={() => navigate("/jobs")}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        aria-label="Back to found jobs"
                    >
                        <ArrowLeft size={16} />
                    </button>
                }
                actions={
                    <>
                        <button
                            type="button"
                            onClick={() => void save()}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                        >
                            {saving ? <Spinner size="sm" /> : <Save size={14} />} Save
                        </button>
                        <button
                            type="button"
                            onClick={() => void findNow()}
                            disabled={running}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                            {running ? <Spinner size="sm" className="border-white/40 border-t-white" /> : <Play size={14} />}
                            Find Now
                        </button>
                    </>
                }
            />

            <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                    {/* Terminal */}
                    <section>
                        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
                            <Terminal size={13} /> Run log
                        </h2>
                        <RunTerminal logs={logs} running={running} />
                    </section>

                    {/* Schedule */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
                                <Clock size={13} /> Schedule
                            </h2>
                            <Toggle
                                checked={settings.cronEnabled}
                                onChange={(v) => patch({ cronEnabled: v })}
                            />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-gray-500">Cron expression</span>
                                <input
                                    value={settings.cronExpression}
                                    onChange={(e) => patch({ cronExpression: e.target.value })}
                                    className={`${inputCls} font-mono`}
                                />
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                    {CRON_PRESETS.map((p) => (
                                        <button
                                            key={p.value}
                                            type="button"
                                            onClick={() => patch({ cronExpression: p.value })}
                                            className={`rounded-md px-2 py-0.5 text-[11px] ${
                                                settings.cronExpression === p.value
                                                    ? "bg-indigo-50 text-indigo-600"
                                                    : "text-gray-500 hover:bg-gray-100"
                                            }`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </label>

                            <div className="space-y-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-gray-500">
                                        Only jobs posted in the last (hours)
                                    </span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={720}
                                        value={settings.lookbackHours}
                                        onChange={(e) => patch({ lookbackHours: Number(e.target.value) })}
                                        className={inputCls}
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-gray-500">
                                        Max jobs scored per run
                                    </span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={500}
                                        value={settings.maxJobsPerRun}
                                        onChange={(e) => patch({ maxJobsPerRun: Number(e.target.value) })}
                                        className={inputCls}
                                    />
                                </label>
                            </div>
                        </div>

                        <p className="mt-3 text-xs text-gray-400">
                            {settings.cronEnabled
                                ? nextRun
                                    ? `Next automatic run: ${new Date(nextRun).toLocaleString()}`
                                    : "Schedule on — save to register it."
                                : "Automatic discovery is off. Use Find Now to run on demand."}
                        </p>
                    </section>

                    {/* Search terms */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                            What to look for
                        </h2>
                        <div className="space-y-3">
                            <CsvField
                                label="Role keywords"
                                hint="Searched on the boards that support it, and used to filter the rest."
                                value={settings.keywords ?? []}
                                onChange={(keywords) => patch({ keywords })}
                            />
                            <CsvField
                                label="Locations"
                                hint="Leave empty for anywhere."
                                value={settings.locations ?? []}
                                onChange={(locations) => patch({ locations })}
                            />
                            <CsvField
                                label="Exclude companies"
                                hint="Postings from these companies are dropped."
                                value={settings.excludeCompanies ?? []}
                                onChange={(excludeCompanies) => patch({ excludeCompanies })}
                            />
                        </div>
                    </section>
                </div>

                {/* Right column */}
                <div className="space-y-5">
                    {/* CV profile */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
                            <FileUser size={13} /> CV profile
                        </h2>

                        {profile ? (
                            <div className="space-y-1.5 text-sm">
                                <p className="font-medium text-gray-900">{profile.name}</p>
                                {profile.headline && <p className="text-xs text-gray-500">{profile.headline}</p>}
                                <p className="text-xs text-gray-400">
                                    {profile.experience?.length ?? 0} roles · {profile.skills?.length ?? 0} skills ·
                                    updated {new Date(profile.updatedAt).toLocaleDateString()}
                                </p>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">
                                No profile yet. Import your CV so postings can be rated.
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={() => void importProfile()}
                            disabled={importing}
                            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                        >
                            {importing && <Spinner size="sm" />}
                            {profile ? "Re-import from resume repo" : "Import from resume repo"}
                        </button>
                        <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
                            Reads your resume repository read-only and normalizes it. The repo is never modified.
                        </p>
                    </section>

                    {/* Sources */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Sources</h2>
                        <ul className="space-y-2.5">
                            {sources.map((source) => {
                                const blocked = source.requiresCredentials && !source.credentialsReady;
                                return (
                                    <li key={source.id} className="flex items-start gap-2">
                                        <Toggle
                                            checked={source.isActive}
                                            disabled={blocked}
                                            onChange={(v) => void toggleSource(source, v)}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-gray-800">{source.name}</p>
                                            {blocked ? (
                                                <p className="text-[11px] text-amber-600">
                                                    Needs API credentials before it can be enabled
                                                </p>
                                            ) : source.lastRunStatus ? (
                                                <p className="text-[11px] text-gray-400">
                                                    Last run: {source.lastRunStatus}
                                                    {source.lastRunAt &&
                                                        ` · ${new Date(source.lastRunAt).toLocaleString()}`}
                                                </p>
                                            ) : (
                                                <p className="text-[11px] text-gray-400">Not run yet</p>
                                            )}
                                            {source.lastRunError && (
                                                <p className="mt-0.5 truncate text-[11px] text-red-500" title={source.lastRunError}>
                                                    {source.lastRunError}
                                                </p>
                                            )}
                                        </div>
                                        {source.isActive && !blocked && <Badge variant="success">on</Badge>}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>

                    {/* Models */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Models</h2>
                        <div className="space-y-3">
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-gray-500">Rating</span>
                                <input
                                    value={settings.scoringModel}
                                    onChange={(e) => patch({ scoringModel: e.target.value })}
                                    className={`${inputCls} font-mono text-xs`}
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-gray-500">Application writing</span>
                                <input
                                    value={settings.writingModel}
                                    onChange={(e) => patch({ writingModel: e.target.value })}
                                    className={`${inputCls} font-mono text-xs`}
                                />
                            </label>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

/** Comma-separated list editor — simpler than tag chips for these short lists. */
function CsvField({
    label,
    hint,
    value,
    onChange,
}: {
    label: string;
    hint: string;
    value: string[];
    onChange: (next: string[]) => void;
}) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
            <input
                value={value.join(", ")}
                onChange={(e) =>
                    onChange(
                        e.target.value
                            .split(",")
                            .map((v) => v.trim())
                            .filter(Boolean)
                    )
                }
                placeholder="comma, separated, values"
                className={inputCls}
            />
            <span className="mt-1 block text-[11px] text-gray-400">{hint}</span>
        </label>
    );
}
