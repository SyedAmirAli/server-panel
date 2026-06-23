import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import DOMPurify from "dompurify";
import type { EmailConfigView, MailBodyType, SentMessageView } from "@appszone/shared";
import { api } from "@/lib/api";
import type { PaginatedResult } from "@/lib/types";
import { Spinner } from "@/components/ui/Spinner";
import { ATTACHMENT_LIMITS } from "./SendMailReference";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BODY_BTN_ACTIVE =
    "px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 bg-white text-slate-900 shadow-sm ring-1 ring-slate-200";
const BODY_BTN_IDLE =
    "px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 text-slate-600 hover:text-slate-900";
const EXAMPLE_TAB_ACTIVE =
    "example-tab px-4 py-3.5 text-sm font-medium border-b-2 border-brand-500 text-brand-600 -mb-px";
const EXAMPLE_TAB_IDLE =
    "example-tab px-4 py-3.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 -mb-px";

type BodyTypeUi = "plain" | "html";
type ToastType = "success" | "error" | "warning";

interface ToastState {
    type: ToastType;
    title: string;
    body?: ReactNode;
}

async function postSendMail(
    apiKey: string,
    payload: {
        from: string;
        to: string[];
        cc: string[];
        bcc: string[];
        subject: string;
        bodyType: MailBodyType;
        body: string;
    },
    files: File[]
) {
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
    let body: BodyInit;

    if (files.length > 0) {
        const form = new FormData();
        form.append("from", payload.from);
        payload.to.forEach((e) => form.append("to", e));
        payload.cc.forEach((e) => form.append("cc", e));
        payload.bcc.forEach((e) => form.append("bcc", e));
        form.append("subject", payload.subject);
        form.append("bodyType", payload.bodyType);
        form.append("body", payload.body);
        files.forEach((f) => form.append("attachments", f, f.name));
        body = form;
    } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(payload);
    }

    const res = await fetch(`${BASE_URL}/mails/send`, { method: "POST", headers, body });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const message =
            (data && typeof data === "object" && "message" in data && String(data.message)) ||
            `Request failed (${res.status})`;
        throw new Error(message);
    }
    return data as { status: string; message: string; data: SentMessageView };
}

function RecipientTags({
    tags,
    onChange,
    containerId,
    inputId,
    placeholder,
    inputClassName,
}: {
    tags: string[];
    onChange: (tags: string[]) => void;
    containerId: string;
    inputId: string;
    placeholder: string;
    inputClassName: string;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [input, setInput] = useState("");
    const [invalid, setInvalid] = useState(false);

    function tryAdd(raw: string) {
        const val = raw.trim().replace(/,\s*$/, "");
        if (!val) return;
        if (!EMAIL_RE.test(val)) {
            setInvalid(true);
            window.setTimeout(() => setInvalid(false), 1000);
            return;
        }
        if (tags.includes(val)) {
            setInput("");
            return;
        }
        onChange([...tags, val]);
        setInput("");
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if ((e.key === "Enter" || e.key === ",") && input.trim()) {
            e.preventDefault();
            tryAdd(input);
        }
        if (e.key === "Backspace" && !input && tags.length) {
            onChange(tags.slice(0, -1));
        }
    }

    return (
        <div
            id={containerId}
            className="field-input min-h-11 h-auto flex flex-wrap gap-1.5 cursor-text"
            onClick={() => inputRef.current?.focus()}
        >
            {tags.map((email) => (
                <span
                    key={email}
                    className="email-tag inline-flex items-center gap-1 bg-brand-100 text-brand-700 text-xs font-medium px-2 py-0.5 rounded-full"
                >
                    {email}
                    <button
                        type="button"
                        className="hover:text-brand-900 ml-0.5"
                        onClick={(e) => {
                            e.stopPropagation();
                            onChange(tags.filter((t) => t !== email));
                        }}
                    >
                        ×
                    </button>
                </span>
            ))}
            <input
                id={inputId}
                ref={inputRef}
                type="email"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => input.trim() && tryAdd(input)}
                placeholder={placeholder}
                className={`${inputClassName}${invalid ? " outline outline-red-400" : ""}`}
            />
        </div>
    );
}

function FromEmailSuggestInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<EmailConfigView[]>([]);
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedSearch(value.trim()), 300);
        return () => window.clearTimeout(t);
    }, [value]);

    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        setLoading(true);

        api<PaginatedResult<EmailConfigView>>(
            `/admin/email-configs?page=1&limit=10&search=${encodeURIComponent(
                debouncedSearch
            )}&select=id,username,name,host,port&active=true&orderBy=username`
        )
            .then((res) => {
                if (cancelled) return;
                setSuggestions(res.data);
            })
            .catch(() => {
                if (!cancelled) setSuggestions([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [debouncedSearch, open]);

    useEffect(() => {
        function onDocClick(e: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    function pick(email: string) {
        onChange(email);
        setOpen(false);
    }

    const showDropdown = open && (loading || suggestions.length > 0 || debouncedSearch.length > 0);

    return (
        <div ref={wrapRef} className="relative">
            <input
                id="from"
                type="email"
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder="sales@yourdomain.com"
                className="field-input pr-9"
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={showDropdown}
                aria-controls="from-suggest-list"
            />
            <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                />
            </svg>

            {showDropdown && (
                <ul
                    id="from-suggest-list"
                    role="listbox"
                    className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-black/10"
                >
                    {loading ? (
                        <li className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-slate-500">
                            <Spinner size="sm" />
                            Loading senders…
                        </li>
                    ) : suggestions.length === 0 ? (
                        <li className="px-3 py-2.5 text-xs text-slate-400">No matching email configs</li>
                    ) : (
                        suggestions.map((cfg) => (
                            <li key={cfg.id} role="option">
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => pick(cfg.username)}
                                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-brand-50/80"
                                >
                                    <span className="text-sm font-medium text-slate-800">{cfg.username}</span>
                                    <span className="text-[11px] text-slate-400">
                                        {cfg.name} · {cfg.host}:{cfg.port}
                                    </span>
                                </button>
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
}

export function SendMail() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const toastRef = useRef<HTMLDivElement>(null);

    const [from, setFrom] = useState("");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [to, setTo] = useState<string[]>([]);
    const [cc, setCc] = useState<string[]>([]);
    const [bcc, setBcc] = useState<string[]>([]);
    const [bodyType, setBodyType] = useState<BodyTypeUi>("plain");
    const [previewOpen, setPreviewOpen] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [sending, setSending] = useState(false);
    const [toast, setToast] = useState<ToastState | null>(null);
    const [exampleTab, setExampleTab] = useState(0);

    const totalFileMb = files.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
    const overFileLimit = totalFileMb > ATTACHMENT_LIMITS.maxTotalBytes / 1024 / 1024;

    function showToast(type: ToastType, title: string, bodyContent?: ReactNode) {
        setToast({ type, title, body: bodyContent });
        requestAnimationFrame(() => {
            toastRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
    }

    function setBodyTypeUi(type: BodyTypeUi) {
        setBodyType(type);
        if (type === "plain") setPreviewOpen(false);
    }

    function resetForm() {
        setFrom("");
        setSubject("");
        setBody("");
        setApiKey("");
        setShowKey(false);
        setTo([]);
        setCc([]);
        setBcc([]);
        setBodyType("plain");
        setPreviewOpen(false);
        setFiles([]);
        setToast(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    async function handleSend(e: FormEvent) {
        e.preventDefault();
        setToast(null);

        const errors: string[] = [];
        if (!from.trim()) errors.push("From address is required.");
        if (to.length === 0) errors.push("At least one To recipient is required.");
        if (!subject.trim()) errors.push("Subject is required.");
        if (!body.trim()) errors.push("Body cannot be empty.");
        if (!apiKey.trim()) errors.push("API Key is required.");
        if (overFileLimit) errors.push("Attachments exceed the 25 MB total limit.");

        if (errors.length) {
            showToast(
                "error",
                "Please fix the following:",
                <ul className="mt-1 list-disc list-inside space-y-0.5">
                    {errors.map((err) => (
                        <li key={err}>{err}</li>
                    ))}
                </ul>
            );
            return;
        }

        setSending(true);
        try {
            const result = await postSendMail(
                apiKey.trim(),
                {
                    from: from.trim(),
                    to,
                    cc,
                    bcc,
                    subject: subject.trim(),
                    bodyType: bodyType === "html" ? "EMBED_HTML" : "PLAIN_TEXT",
                    body: body.trim(),
                },
                files
            );

            if (result.status === "error") {
                showToast("error", result.message);
            } else if (result.status === "warning") {
                showToast("warning", result.message, result.data.error ?? undefined);
            } else {
                showToast(
                    "success",
                    result.message || "Email queued for delivery",
                    <>
                        Message ID: <code className="font-mono">{result.data.id}</code> — status will transition to{" "}
                        <strong>{result.data.status}</strong> shortly.
                    </>
                );
            }
        } catch (err) {
            showToast("error", err instanceof Error ? err.message : "Send failed");
        } finally {
            setSending(false);
        }
    }

    const toastStyles: Record<ToastType, string> = {
        success: "bg-emerald-50 border border-emerald-200 text-emerald-800",
        error: "bg-red-50 border border-red-200 text-red-800",
        warning: "bg-amber-50 border border-amber-200 text-amber-800",
    };
    const toastIcons: Record<ToastType, string> = { success: "✓", error: "✕", warning: "⚠" };

    return (
        // {/* ─── Layout shell ─────────────────────────────────────────────────── */}
        <div className="w-full">
            {/* ═══ MAIN CONTENT ═══════════════════════════════════════════════════ */}
            {/* Top bar */}
            <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-slate-200/80 px-8 py-4 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-slate-900">Send Mail</h1>
                    <p className="text-sm text-slate-500">Compose and queue a transactional email</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="badge-green">
                        <span className="size-1.5 rounded-full bg-emerald-500 inline-block"></span>
                        API Connected
                    </span>
                    <a
                        href="#api-ref"
                        className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
                    >
                        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                        </svg>
                        API Reference
                    </a>
                </div>
            </div>

            <div className="px-8 py-8 max-w-6xl mx-auto space-y-12">
                {/* ── COMPOSE FORM + SIDEBAR ───────────────────────────────────── */}
                <section className="grid grid-cols-[1fr_320px] gap-8 items-start">
                    {/* FORM CARD */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 overflow-hidden">
                        {/* Card header */}
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                            <div className="size-9 rounded-xl bg-brand-50 flex items-center justify-center">
                                <svg
                                    className="size-5 text-brand-600"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                                    />
                                </svg>
                            </div>
                            <div>
                                <h2 className="font-semibold text-slate-900 text-sm">Compose Email</h2>
                                <p className="text-xs text-slate-500">
                                    Sent via{" "}
                                    <code className="bg-slate-100 px-1 py-0.5 rounded text-brand-600 font-mono">
                                        POST /api/v1/mails/send
                                    </code>
                                </p>
                            </div>
                        </div>

                        <form className="p-6 space-y-5" onSubmit={handleSend}>
                            {/* From / Subject row */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="field-label" htmlFor="from">
                                        From <span className="text-red-500">*</span>
                                    </label>
                                    <FromEmailSuggestInput value={from} onChange={setFrom} />
                                    <p className="text-xs text-slate-400 mt-1">
                                        Must match your key's <code className="text-slate-500">allowedFrom</code>
                                    </p>
                                </div>

                                <div>
                                    <label className="field-label" htmlFor="subject">
                                        Subject <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        id="subject"
                                        type="text"
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        placeholder="Welcome aboard 🎉"
                                        className="field-input"
                                        maxLength={2000}
                                    />
                                </div>
                            </div>

                            {/* To */}
                            <div>
                                <label className="field-label" htmlFor="to-input">
                                    To <span className="text-red-500">*</span>
                                    <span className="text-slate-400 font-normal ml-1">— up to 50 recipients</span>
                                </label>
                                <RecipientTags
                                    tags={to}
                                    onChange={setTo}
                                    containerId="to-container"
                                    inputId="to-input"
                                    placeholder="Add recipient and press Enter…"
                                    inputClassName="flex-1 min-w-48 outline-none bg-transparent text-sm placeholder:text-slate-400"
                                />
                                <p className="text-xs text-slate-400 mt-1">
                                    Press{" "}
                                    <kbd className="bg-slate-100 border border-slate-200 text-slate-500 rounded px-1 py-0.5 text-[10px] font-mono">
                                        Enter
                                    </kbd>{" "}
                                    or{" "}
                                    <kbd className="bg-slate-100 border border-slate-200 text-slate-500 rounded px-1 py-0.5 text-[10px] font-mono">
                                        ,
                                    </kbd>{" "}
                                    after each address
                                </p>
                            </div>

                            {/* CC / BCC row */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="field-label" htmlFor="cc-input">
                                        CC
                                        <span className="text-slate-400 font-normal ml-1">— up to 50</span>
                                    </label>
                                    <RecipientTags
                                        tags={cc}
                                        onChange={setCc}
                                        containerId="cc-container"
                                        inputId="cc-input"
                                        placeholder="cc@example.com"
                                        inputClassName="flex-1 min-w-32 outline-none bg-transparent text-sm placeholder:text-slate-400"
                                    />
                                </div>
                                <div>
                                    <label className="field-label" htmlFor="bcc-input">
                                        BCC
                                        <span className="text-slate-400 font-normal ml-1">— up to 50</span>
                                    </label>
                                    <RecipientTags
                                        tags={bcc}
                                        onChange={setBcc}
                                        containerId="bcc-container"
                                        inputId="bcc-input"
                                        placeholder="bcc@example.com"
                                        inputClassName="flex-1 min-w-32 outline-none bg-transparent text-sm placeholder:text-slate-400"
                                    />
                                </div>
                            </div>

                            {/* Body type toggle */}
                            <div>
                                <label className="field-label">
                                    Body Type <span className="text-red-500">*</span>
                                </label>
                                <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-1">
                                    <button
                                        type="button"
                                        id="btn-plain"
                                        onClick={() => setBodyTypeUi("plain")}
                                        className={bodyType === "plain" ? BODY_BTN_ACTIVE : BODY_BTN_IDLE}
                                    >
                                        Plain Text
                                    </button>
                                    <button
                                        type="button"
                                        id="btn-html"
                                        onClick={() => setBodyTypeUi("html")}
                                        className={bodyType === "html" ? BODY_BTN_ACTIVE : BODY_BTN_IDLE}
                                    >
                                        HTML
                                    </button>
                                </div>
                                <p id="body-type-hint" className="text-xs text-slate-400 mt-1.5">
                                    {bodyType === "plain" ? (
                                        <>
                                            Sends a <code className="text-slate-500">text/plain</code> email part.
                                        </>
                                    ) : (
                                        <>
                                            Sends a <code className="text-slate-500">text/html</code> email part. Write
                                            full HTML.
                                        </>
                                    )}
                                </p>
                            </div>

                            {/* Body textarea */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="field-label mb-0" htmlFor="body">
                                        Body <span className="text-red-500">*</span>
                                        <span className="text-slate-400 font-normal ml-1">— max ~1 MB</span>
                                    </label>
                                    {bodyType === "html" && (
                                        <button
                                            type="button"
                                            id="preview-btn"
                                            onClick={() => setPreviewOpen((v) => !v)}
                                            className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
                                        >
                                            {previewOpen ? (
                                                <>
                                                    <svg
                                                        className="size-3.5"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                        strokeWidth={2}
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                                        />
                                                    </svg>
                                                    Hide
                                                </>
                                            ) : (
                                                <>
                                                    <svg
                                                        className="size-3.5"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                        strokeWidth={2}
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                        />
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                                        />
                                                    </svg>
                                                    Preview
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                                <textarea
                                    id="body"
                                    rows={8}
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    placeholder={
                                        bodyType === "plain"
                                            ? "Write your plain-text message here…"
                                            : "<h1>Hello</h1>\n<p>Your message here…</p>"
                                    }
                                    className="field-input resize-y font-mono text-xs leading-relaxed"
                                ></textarea>
                                {bodyType === "html" && previewOpen && (
                                    <div
                                        id="html-preview"
                                        className="mt-2 border border-slate-200 rounded-xl p-4 bg-white min-h-32"
                                    >
                                        <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">
                                            Preview
                                        </p>
                                        <div
                                            id="preview-content"
                                            className="text-sm text-slate-800"
                                            dangerouslySetInnerHTML={{
                                                __html: DOMPurify.sanitize(
                                                    body.trim() ||
                                                        '<p class="text-slate-400 text-sm">Nothing to preview yet.</p>',
                                                    { USE_PROFILES: { html: true } }
                                                ),
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Attachments */}
                            <div>
                                <label className="field-label">
                                    Attachments
                                    <span className="text-slate-400 font-normal ml-1">
                                        — up to 10 files · 10 MB each · 25 MB total
                                    </span>
                                </label>
                                <label
                                    htmlFor="attachments"
                                    className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-6 cursor-pointer hover:border-brand-400 hover:bg-brand-50/50 transition-all duration-150 group"
                                >
                                    <div className="size-10 rounded-xl bg-slate-100 group-hover:bg-brand-100 flex items-center justify-center transition-colors">
                                        <svg
                                            className="size-5 text-slate-400 group-hover:text-brand-600 transition-colors"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                            />
                                        </svg>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-slate-700 group-hover:text-brand-700">
                                            Drop files here, or click to browse
                                        </p>
                                        <p className="text-xs text-slate-400 mt-0.5">PDF, PNG, JPG, DOCX and more</p>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        id="attachments"
                                        type="file"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
                                    />
                                </label>
                                {files.length > 0 && (
                                    <ul id="file-list" className="mt-2 space-y-1.5">
                                        {files.map((f) => (
                                            <li
                                                key={`${f.name}-${f.size}`}
                                                className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                                            >
                                                <span className="flex items-center gap-2 text-slate-700">
                                                    <svg
                                                        className="size-4 text-brand-500 shrink-0"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                        strokeWidth={2}
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                                        />
                                                    </svg>
                                                    {f.name}
                                                </span>
                                                <span className="text-slate-400 text-xs font-mono">
                                                    {(f.size / 1024 / 1024).toFixed(2)} MB
                                                </span>
                                            </li>
                                        ))}
                                        {overFileLimit && (
                                            <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                                                <svg
                                                    className="size-3.5"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                    strokeWidth={2}
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                                    />
                                                </svg>
                                                Total exceeds 25 MB limit ({totalFileMb.toFixed(1)} MB)
                                            </p>
                                        )}
                                    </ul>
                                )}
                            </div>

                            {/* API Key */}
                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                                <label className="field-label" htmlFor="apikey">
                                    API Key <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <input
                                        id="apikey"
                                        type={showKey ? "text" : "password"}
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder="azm_live_xxxxxxxxxxxxxxxxxxxxxxxx"
                                        className="field-input pr-10 font-mono text-xs"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowKey((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        <svg
                                            id="eye-icon"
                                            className="size-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                            />
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                            />
                                        </svg>
                                    </button>
                                </div>
                                <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                                    <svg
                                        className="size-3.5 shrink-0"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                        />
                                    </svg>
                                    Store in a server-side env var — never expose in frontend code.
                                </p>
                            </div>

                            {/* Submit row */}
                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
                                >
                                    Reset
                                </button>
                                <button
                                    type="submit"
                                    id="send-btn"
                                    disabled={sending || overFileLimit}
                                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-sm shadow-brand-500/30 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-50"
                                >
                                    {sending ? (
                                        <>
                                            <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle
                                                    className="opacity-25"
                                                    cx="12"
                                                    cy="12"
                                                    r="10"
                                                    stroke="currentColor"
                                                    strokeWidth={4}
                                                />
                                                <path
                                                    className="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                                />
                                            </svg>
                                            Sending…
                                        </>
                                    ) : (
                                        <>
                                            <svg
                                                className="size-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={2}
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                                                />
                                            </svg>
                                            Send Email
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>

                        {/* Toast */}
                        {toast && (
                            <div
                                ref={toastRef}
                                id="toast"
                                className={`mx-6 mb-6 rounded-xl p-4 text-sm font-medium flex items-start gap-3 ${
                                    toastStyles[toast.type]
                                }`}
                            >
                                <span className="text-lg leading-none shrink-0">{toastIcons[toast.type]}</span>
                                <div>
                                    <p className="font-semibold">{toast.title}</p>
                                    {toast.body && <div className="text-xs mt-0.5 opacity-80">{toast.body}</div>}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT SIDEBAR: Quick ref */}
                    <aside className="space-y-4 sticky top-20">
                        {/* Endpoint card */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 p-5 space-y-3">
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Endpoint</h3>
                            <div className="bg-slate-900 rounded-xl px-4 py-3 font-mono text-xs text-slate-100 flex items-center gap-2">
                                <span className="text-emerald-400 font-bold shrink-0">POST</span>
                                <span className="text-slate-300 break-all">/api/v1/mails/send</span>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Auth</span>
                                    <code className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-mono">
                                        Bearer &lt;key&gt;
                                    </code>
                                </div>
                                <div className="flex items-start justify-between text-xs gap-2">
                                    <span className="text-slate-500 shrink-0">Content-Type</span>
                                    <div className="text-right space-y-0.5">
                                        <div>
                                            <code className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                                                application/json
                                            </code>
                                        </div>
                                        <div>
                                            <code className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                                                multipart/form-data
                                            </code>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Success</span>
                                    <span className="badge-green">201 Created</span>
                                </div>
                            </div>
                        </div>

                        {/* Status meanings */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 p-5 space-y-3">
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Response Statuses
                            </h3>
                            <ul className="space-y-2 text-xs">
                                <li className="flex items-center gap-2">
                                    <span className="badge-blue">queued</span>
                                    <span className="text-slate-600">Accepted, awaiting delivery</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="badge-green">success</span>
                                    <span className="text-slate-600">Message delivered</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="badge-amber">warning</span>
                                    <span className="text-slate-600">
                                        Delivery failed — see <code className="font-mono">data.error</code>
                                    </span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="badge-red">error</span>
                                    <span className="text-slate-600">Validation or auth failed</span>
                                </li>
                            </ul>
                        </div>

                        {/* Error codes */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 p-5 space-y-3">
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                HTTP Error Codes
                            </h3>
                            <ul className="space-y-2 text-xs">
                                <li className="flex gap-2">
                                    <code className="shrink-0 w-8 font-mono font-bold text-amber-600">400</code>
                                    <span className="text-slate-600">Validation failed</span>
                                </li>
                                <li className="flex gap-2">
                                    <code className="shrink-0 w-8 font-mono font-bold text-red-500">401</code>
                                    <span className="text-slate-600">Missing or invalid API key</span>
                                </li>
                                <li className="flex gap-2">
                                    <code className="shrink-0 w-8 font-mono font-bold text-red-500">403</code>
                                    <span className="text-slate-600">
                                        <code>from</code> not permitted for this key
                                    </span>
                                </li>
                                <li className="flex gap-2">
                                    <code className="shrink-0 w-8 font-mono font-bold text-red-500">413</code>
                                    <span className="text-slate-600">Attachments exceed size limits</span>
                                </li>
                            </ul>
                        </div>

                        {/* Environments */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 p-5 space-y-3">
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Environments
                            </h3>
                            <div className="space-y-2">
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Local Dev</p>
                                    <code className="block text-xs font-mono bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-slate-700 break-all">
                                        http://localhost:3000/api/v1
                                    </code>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">
                                        Production
                                    </p>
                                    <code className="block text-xs font-mono bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-slate-700 break-all">
                                        https://app.mail.appszonebd.com/api/v1
                                    </code>
                                </div>
                            </div>
                        </div>
                    </aside>
                </section>

                {/* ── FIELD REFERENCE TABLE ─────────────────────────────────────── */}
                <section id="api-ref">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="size-8 rounded-lg bg-brand-50 flex items-center justify-center">
                            <svg
                                className="size-4 text-brand-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h8M4 18h8" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">Request Field Reference</h2>
                            <p className="text-sm text-slate-500">
                                Every parameter the <code>/mails/send</code> endpoint accepts
                            </p>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3.5 w-32">
                                        Field
                                    </th>
                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3.5 w-44">
                                        Type
                                    </th>
                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3.5 w-24">
                                        Required
                                    </th>
                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3.5">
                                        Notes
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <code className="text-brand-600 font-mono font-semibold">from</code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <code className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-mono">
                                            string (email)
                                        </code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="badge-red">Yes</span>
                                    </td>
                                    <td className="px-4 py-4 text-slate-600">
                                        Must be permitted by the key's{" "}
                                        <code className="text-xs font-mono bg-slate-100 px-1 py-0.5 rounded">
                                            allowedFrom
                                        </code>{" "}
                                        list, if set.
                                    </td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <code className="text-brand-600 font-mono font-semibold">to</code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <code className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-mono">
                                            string[]
                                        </code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="badge-red">Yes</span>
                                    </td>
                                    <td className="px-4 py-4 text-slate-600">
                                        1–50 recipients. In multipart, a comma-separated string also works.
                                    </td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <code className="text-brand-600 font-mono font-semibold">cc</code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <code className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-mono">
                                            string[]
                                        </code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="text-slate-400 text-xs">Optional</span>
                                    </td>
                                    <td className="px-4 py-4 text-slate-600">
                                        Up to 50 addresses. Recipients visible to each other.
                                    </td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <code className="text-brand-600 font-mono font-semibold">bcc</code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <code className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-mono">
                                            string[]
                                        </code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="text-slate-400 text-xs">Optional</span>
                                    </td>
                                    <td className="px-4 py-4 text-slate-600">
                                        Up to 50 addresses. Hidden from other recipients.
                                    </td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <code className="text-brand-600 font-mono font-semibold">subject</code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <code className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-mono">
                                            string
                                        </code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="badge-red">Yes</span>
                                    </td>
                                    <td className="px-4 py-4 text-slate-600">Maximum 2000 characters.</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <code className="text-brand-600 font-mono font-semibold">bodyType</code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col gap-1">
                                            <code className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-mono self-start">
                                                "PLAIN_TEXT"
                                            </code>
                                            <code className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-mono self-start">
                                                "EMBED_HTML"
                                            </code>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="badge-red">Yes</span>
                                    </td>
                                    <td className="px-4 py-4 text-slate-600">
                                        Controls how{" "}
                                        <code className="text-xs font-mono bg-slate-100 px-1 py-0.5 rounded">body</code>{" "}
                                        is interpreted. Pick one and format accordingly.
                                    </td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <code className="text-brand-600 font-mono font-semibold">body</code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <code className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-mono">
                                            string
                                        </code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="badge-red">Yes</span>
                                    </td>
                                    <td className="px-4 py-4 text-slate-600">
                                        Plain text or an HTML document per{" "}
                                        <code className="text-xs font-mono bg-slate-100 px-1 py-0.5 rounded">
                                            bodyType
                                        </code>
                                        . Max ~1 MB.
                                    </td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <code className="text-brand-600 font-mono font-semibold">attachments</code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <code className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-mono">
                                            file[]
                                        </code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="text-slate-400 text-xs">Optional</span>
                                    </td>
                                    <td className="px-4 py-4 text-slate-600">
                                        <strong>multipart only.</strong> Up to 10 files, 10 MB each, 25 MB total.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* ── CODE EXAMPLES ─────────────────────────────────────────────── */}
                <section>
                    <div className="flex items-center gap-3 mb-5">
                        <div className="size-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                            <svg
                                className="size-4 text-emerald-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                                />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">Code Examples</h2>
                            <p className="text-sm text-slate-500">Copy-paste ready snippets for common use cases</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Example tabs */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 overflow-hidden">
                            <div className="border-b border-slate-100 px-6 flex gap-0" id="example-tabs">
                                <button
                                    type="button"
                                    onClick={() => setExampleTab(0)}
                                    className={exampleTab === 0 ? EXAMPLE_TAB_ACTIVE : EXAMPLE_TAB_IDLE}
                                >
                                    JSON / No Attachments
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setExampleTab(1)}
                                    className={exampleTab === 1 ? EXAMPLE_TAB_ACTIVE : EXAMPLE_TAB_IDLE}
                                >
                                    Multipart + Files
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setExampleTab(2)}
                                    className={exampleTab === 2 ? EXAMPLE_TAB_ACTIVE : EXAMPLE_TAB_IDLE}
                                >
                                    Node.js (disk file)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setExampleTab(3)}
                                    className={exampleTab === 3 ? EXAMPLE_TAB_ACTIVE : EXAMPLE_TAB_IDLE}
                                >
                                    cURL
                                </button>
                            </div>

                            <div className="p-6 space-y-3">
                                {/* Tab 0 */}
                                <div className={`example-panel${exampleTab !== 0 ? " hidden" : ""}`}>
                                    <p className="text-sm text-slate-600 mb-3">
                                        Use{" "}
                                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">
                                            application/json
                                        </code>{" "}
                                        when you have no file attachments. Simplest approach.
                                    </p>
                                    <div
                                        className="w-full"
                                        dangerouslySetInnerHTML={{
                                            __html: `<pre class="code-block"><span class="kw">import</span> { readFile } <span class="kw">from</span> <span class="str">"node:fs/promises"</span>;

<span class="kw">const</span> API_BASE = <span class="str">"http://localhost:3000/api/v1"</span>; <span class="cm">// swap for prod</span>
<span class="kw">const</span> API_KEY  = process.env.APPSZONE_MAIL_KEY;

<span class="kw">const</span> buffer = <span class="kw">await</span> <span class="fn">readFile</span>(<span class="str">"./invoice.pdf"</span>);

<span class="kw">const</span> form = <span class="kw">new</span> <span class="fn">FormData</span>();
form.<span class="fn">append</span>(<span class="str">"from"</span>,        <span class="str">"sales@appszonebd.com"</span>);
form.<span class="fn">append</span>(<span class="str">"to"</span>,         <span class="str">"jon@gmail.com, doe@gmail.com"</span>); <span class="cm">// csv works too</span>
form.<span class="fn">append</span>(<span class="str">"subject"</span>,     <span class="str">"Your invoice"</span>);
form.<span class="fn">append</span>(<span class="str">"bodyType"</span>,    <span class="str">"PLAIN_TEXT"</span>);
form.<span class="fn">append</span>(<span class="str">"body"</span>,        <span class="str">"Invoice attached."</span>);
form.<span class="fn">append</span>(<span class="str">"attachments"</span>, <span class="kw">new</span> <span class="fn">Blob</span>([buffer], { type: <span class="str">"application/pdf"</span> }), <span class="str">"invoice.pdf"</span>);

<span class="kw">const</span> res = <span class="kw">await</span> <span class="fn">fetch</span>(<span class="str">\`\${API_BASE}/mails/send\`</span>, {
  method: <span class="str">"POST"</span>,
  headers: { Authorization: <span class="str">\`Bearer \${API_KEY}\`</span> },
  body: form,
});

console.<span class="fn">log</span>(res.status, <span class="kw">await</span> res.<span class="fn">json</span>());</pre>`,
                                        }}
                                    />
                                </div>

                                {/* Tab 1 */}
                                <div className={`example-panel${exampleTab !== 1 ? " hidden" : ""}`}>
                                    <p className="text-sm text-slate-600 mb-3">
                                        Use{" "}
                                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">
                                            FormData
                                        </code>{" "}
                                        with attachments. <strong>Do not</strong> set{" "}
                                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">
                                            Content-Type
                                        </code>{" "}
                                        — the runtime adds the multipart boundary automatically.
                                    </p>
                                    <div
                                        className="w-full"
                                        dangerouslySetInnerHTML={{
                                            __html: `<pre class="code-block"><span class="kw">const</span> API_BASE = <span class="str">"https://app.mail.appszonebd.com/api/v1"</span>;
<span class="kw">const</span> API_KEY  = process.env.APPSZONE_MAIL_KEY;

<span class="kw">async function</span> <span class="fn">sendWithAttachment</span>(file <span class="cm">/* File/Blob (browser) */</span>) {
  <span class="kw">const</span> form = <span class="kw">new</span> <span class="fn">FormData</span>();
  form.<span class="fn">append</span>(<span class="str">"from"</span>,     <span class="str">"sales@appszonebd.com"</span>);
  form.<span class="fn">append</span>(<span class="str">"to"</span>,      <span class="str">"jon@gmail.com"</span>);  <span class="cm">// repeat for each recipient</span>
  form.<span class="fn">append</span>(<span class="str">"to"</span>,      <span class="str">"doe@gmail.com"</span>);
  form.<span class="fn">append</span>(<span class="str">"subject"</span>,  <span class="str">"Your invoice"</span>);
  form.<span class="fn">append</span>(<span class="str">"bodyType"</span>, <span class="str">"PLAIN_TEXT"</span>);
  form.<span class="fn">append</span>(<span class="str">"body"</span>,     <span class="str">"Invoice attached. Thanks!"</span>);
  form.<span class="fn">append</span>(<span class="str">"attachments"</span>, file, <span class="str">"invoice.pdf"</span>);

  <span class="kw">const</span> res = <span class="kw">await</span> <span class="fn">fetch</span>(<span class="str">\`\${API_BASE}/mails/send\`</span>, {
    method: <span class="str">"POST"</span>,
    headers: { Authorization: <span class="str">\`Bearer \${API_KEY}\`</span> }, <span class="cm">// ← no Content-Type!</span>
    body: form,
  });

  <span class="kw">if</span> (!res.ok) <span class="kw">throw new</span> <span class="fn">Error</span>(<span class="str">\`Send failed (\${res.status})\`</span>);
  <span class="kw">return</span> res.<span class="fn">json</span>();
}</pre>`,
                                        }}
                                    />
                                </div>

                                {/* Tab 2 */}
                                <div className={`example-panel${exampleTab !== 2 ? " hidden" : ""}`}>
                                    <p className="text-sm text-slate-600 mb-3">
                                        Node 20+ has{" "}
                                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">
                                            fetch
                                        </code>
                                        ,{" "}
                                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">
                                            FormData
                                        </code>
                                        , and{" "}
                                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">
                                            Blob
                                        </code>{" "}
                                        built in — no extra packages needed.
                                    </p>
                                    <div
                                        className="w-full"
                                        dangerouslySetInnerHTML={{
                                            __html: `<pre class="code-block"><span class="kw">import</span> { readFile } <span class="kw">from</span> <span class="str">"node:fs/promises"</span>;

<span class="kw">const</span> API_BASE = <span class="str">"http://localhost:3000/api/v1"</span>; <span class="cm">// swap for prod</span>
<span class="kw">const</span> API_KEY  = process.env.APPSZONE_MAIL_KEY;

<span class="kw">const</span> buffer = <span class="kw">await</span> <span class="fn">readFile</span>(<span class="str">"./invoice.pdf"</span>);

<span class="kw">const</span> form = <span class="kw">new</span> <span class="fn">FormData</span>();
form.<span class="fn">append</span>(<span class="str">"from"</span>,        <span class="str">"sales@appszonebd.com"</span>);
form.<span class="fn">append</span>(<span class="str">"to"</span>,         <span class="str">"jon@gmail.com, doe@gmail.com"</span>); <span class="cm">// csv works too</span>
form.<span class="fn">append</span>(<span class="str">"subject"</span>,     <span class="str">"Your invoice"</span>);
form.<span class="fn">append</span>(<span class="str">"bodyType"</span>,    <span class="str">"PLAIN_TEXT"</span>);
form.<span class="fn">append</span>(<span class="str">"body"</span>,        <span class="str">"Invoice attached."</span>);
form.<span class="fn">append</span>(<span class="str">"attachments"</span>, <span class="kw">new</span> <span class="fn">Blob</span>([buffer], { type: <span class="str">"application/pdf"</span> }), <span class="str">"invoice.pdf"</span>);

<span class="kw">const</span> res = <span class="kw">await</span> <span class="fn">fetch</span>(<span class="str">\`\${API_BASE}/mails/send\`</span>, {
  method: <span class="str">"POST"</span>,
  headers: { Authorization: <span class="str">\`Bearer \${API_KEY}\`</span> },
  body: form,
});

console.<span class="fn">log</span>(res.status, <span class="kw">await</span> res.<span class="fn">json</span>());</pre>`,
                                        }}
                                    />
                                </div>

                                {/* Tab 3 */}
                                <div className={`example-panel${exampleTab !== 3 ? " hidden" : ""}`}>
                                    <p className="text-sm text-slate-600 mb-3">
                                        Quick test from the terminal using{" "}
                                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">
                                            curl
                                        </code>
                                        . Set{" "}
                                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">
                                            APPSZONE_MAIL_KEY
                                        </code>{" "}
                                        in your shell first.
                                    </p>
                                    <div
                                        className="w-full"
                                        dangerouslySetInnerHTML={{
                                            __html: `<pre class="code-block"><span class="fn">curl</span> -X POST <span class="str">"http://localhost:3000/api/v1/mails/send"</span> \\
  -H <span class="str">"Authorization: Bearer $APPSZONE_MAIL_KEY"</span> \\
  -H <span class="str">"Content-Type: application/json"</span> \\
  -d <span class="str">'{
    "from":     "sales@appszonebd.com",
    "to":       ["jon@gmail.com"],
    "subject":  "Hello from cURL",
    "bodyType": "PLAIN_TEXT",
    "body":     "Hi from AppsZone Mail"
  }'</span></pre>`,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Success + Error response examples */}
                        <div className="grid grid-cols-2 gap-6">
                            <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm shadow-black/5 overflow-hidden">
                                <div className="px-5 py-3.5 border-b border-emerald-100 flex items-center gap-2">
                                    <span className="badge-green">201 Created</span>
                                    <span className="text-sm font-medium text-slate-700">Success response</span>
                                </div>
                                <div
                                    className="w-full"
                                    dangerouslySetInnerHTML={{
                                        __html: `<pre class="code-block rounded-none text-xs p-5">{
  <span class="kw">"status"</span>:  <span class="str">"queued"</span>,
  <span class="kw">"message"</span>: <span class="str">"Email queued for delivery"</span>,
  <span class="kw">"data"</span>: {
    <span class="kw">"id"</span>:        <span class="str">"cmqq...id"</span>,
    <span class="kw">"from"</span>:      <span class="str">"sales@appszonebd.com"</span>,
    <span class="kw">"to"</span>:        [<span class="str">"jon@gmail.com"</span>],
    <span class="kw">"subject"</span>:   <span class="str">"Welcome aboard"</span>,
    <span class="kw">"status"</span>:    <span class="str">"queued"</span>,
    <span class="kw">"error"</span>:     <span class="num">null</span>,
    <span class="kw">"createdAt"</span>: <span class="str">"2026-06-23T09:34:51.467Z"</span>
  }
}</pre>`,
                                    }}
                                />
                            </div>
                            <div className="bg-white rounded-2xl border border-red-200 shadow-sm shadow-black/5 overflow-hidden">
                                <div className="px-5 py-3.5 border-b border-red-100 flex items-center gap-2">
                                    <span className="badge-red">400 Bad Request</span>
                                    <span className="text-sm font-medium text-slate-700">Validation error</span>
                                </div>
                                <div
                                    className="w-full h-full"
                                    dangerouslySetInnerHTML={{
                                        __html: `<pre class="code-block rounded-none text-xs p-5">
                                        
{
  <span class="kw">"status"</span>:  <span class="str">"error"</span>,
  <span class="kw">"message"</span>: <span class="str">"each value in to must be an email"</span>,
  <span class="kw">"data"</span>: {
    <span class="kw">"errors"</span>: [
      <span class="str">"each value in to must be an email"</span>,
      <span class="str">"subject should not be empty"</span>
    ]
  }
}
  

</pre>`,
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── TIPS ──────────────────────────────────────────────────────── */}
                <section>
                    <div className="flex items-center gap-3 mb-5">
                        <div className="size-8 rounded-lg bg-amber-50 flex items-center justify-center">
                            <svg
                                className="size-4 text-amber-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                                />
                            </svg>
                        </div>
                        <h2 className="text-base font-bold text-slate-900">Tips &amp; Best Practices</h2>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm shadow-black/5 space-y-2">
                            <div className="size-8 rounded-lg bg-red-50 flex items-center justify-center mb-3">
                                <svg
                                    className="size-4 text-red-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                    />
                                </svg>
                            </div>
                            <h3 className="font-semibold text-slate-900 text-sm">Keep keys server-side</h3>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Calling the API from browser code exposes your key. Proxy the call through your own
                                backend or a serverless function instead.
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm shadow-black/5 space-y-2">
                            <div className="size-8 rounded-lg bg-brand-50 flex items-center justify-center mb-3">
                                <svg
                                    className="size-4 text-brand-600"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                    />
                                </svg>
                            </div>
                            <h3 className="font-semibold text-slate-900 text-sm">Arrays in multipart</h3>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Repeat the field name (<code className="font-mono bg-slate-100 px-1 rounded">to</code>{" "}
                                twice) <em>or</em> send one comma-separated string — both normalize to an array
                                server-side.
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm shadow-black/5 space-y-2">
                            <div className="size-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-3">
                                <svg
                                    className="size-4 text-emerald-600"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                            </div>
                            <h3 className="font-semibold text-slate-900 text-sm">Poll for delivery status</h3>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                A <code className="font-mono bg-slate-100 px-1 rounded">201</code> means{" "}
                                <em>accepted/queued</em>, not necessarily delivered. Use{" "}
                                <code className="font-mono bg-slate-100 px-1 rounded">data.id</code> to track:{" "}
                                <code className="font-mono bg-slate-100 px-1 rounded">queued → sent / failed</code>.
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm shadow-black/5 space-y-2">
                            <div className="size-8 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
                                <svg
                                    className="size-4 text-slate-600"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h8m-8 6h16" />
                                </svg>
                            </div>
                            <h3 className="font-semibold text-slate-900 text-sm">bodyType matters</h3>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                <code className="font-mono bg-slate-100 px-1 rounded">PLAIN_TEXT</code> sends a{" "}
                                <code className="font-mono bg-slate-100 px-1 rounded">text/plain</code> part;{" "}
                                <code className="font-mono bg-slate-100 px-1 rounded">EMBED_HTML</code> sends a{" "}
                                <code className="font-mono bg-slate-100 px-1 rounded">text/html</code> part. Format{" "}
                                <code className="font-mono bg-slate-100 px-1 rounded">body</code> accordingly — no
                                mixing.
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm shadow-black/5 space-y-2">
                            <div className="size-8 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
                                <svg
                                    className="size-4 text-amber-600"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                            </div>
                            <h3 className="font-semibold text-slate-900 text-sm">No Content-Type in multipart</h3>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                When using <code className="font-mono bg-slate-100 px-1 rounded">FormData</code> with
                                attachments, omit{" "}
                                <code className="font-mono bg-slate-100 px-1 rounded">Content-Type</code> from your
                                headers. The browser/runtime sets it with the correct boundary.
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm shadow-black/5 space-y-2">
                            <div className="size-8 rounded-lg bg-red-50 flex items-center justify-center mb-3">
                                <svg
                                    className="size-4 text-red-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                </svg>
                            </div>
                            <h3 className="font-semibold text-slate-900 text-sm">Attachment limits</h3>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Max 10 files, each ≤ 10 MB, total ≤ 25 MB. Exceeding any limit returns{" "}
                                <code className="font-mono bg-slate-100 px-1 rounded">413</code>. Validate client-side
                                before sending.
                            </p>
                        </div>
                    </div>
                </section>

                {/* ── FAQ ──────────────────────────────────────────────────────────── */}
                <section>
                    <div className="flex items-center gap-3 mb-5">
                        <div className="size-8 rounded-lg bg-brand-50 flex items-center justify-center">
                            <svg
                                className="size-4 text-brand-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                        <h2 className="text-base font-bold text-slate-900">Frequently Asked Questions</h2>
                    </div>

                    <div className="space-y-3">
                        {/* FAQ items */}
                        <details className="group bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 overflow-hidden">
                            <summary className="flex items-center justify-between px-6 py-4 cursor-pointer select-none hover:bg-slate-50/50 transition-colors">
                                <span className="font-medium text-slate-900 text-sm">Where can I find my API key?</span>
                                <svg
                                    className="faq-chevron size-4 text-slate-400 shrink-0 transition-transform duration-200"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </summary>
                            <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4 space-y-2">
                                <p>
                                    Go to <strong>Admin → API Keys</strong> in the sidebar. Click{" "}
                                    <strong>New Key</strong>, give it a name and an optional{" "}
                                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">allowedFrom</code>{" "}
                                    restriction, then copy the key immediately — it is shown only once.
                                </p>
                                <p>
                                    You can also create keys programmatically via{" "}
                                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                                        POST /api/v1/admin/keys
                                    </code>{" "}
                                    with an existing admin key.
                                </p>
                            </div>
                        </details>

                        <details className="group bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 overflow-hidden">
                            <summary className="flex items-center justify-between px-6 py-4 cursor-pointer select-none hover:bg-slate-50/50 transition-colors">
                                <span className="font-medium text-slate-900 text-sm">
                                    What does{" "}
                                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-brand-600">
                                        allowedFrom
                                    </code>{" "}
                                    do?
                                </span>
                                <svg
                                    className="faq-chevron size-4 text-slate-400 shrink-0 transition-transform duration-200"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </summary>
                            <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
                                <p>
                                    If a key has an{" "}
                                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">allowedFrom</code>{" "}
                                    list, requests using that key <strong>must</strong> set{" "}
                                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">from</code> to one of
                                    those addresses — any other address returns{" "}
                                    <code className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-mono">
                                        403 Forbidden
                                    </code>
                                    . If the list is empty, the key can send from any address on a verified domain.
                                </p>
                            </div>
                        </details>

                        <details className="group bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 overflow-hidden">
                            <summary className="flex items-center justify-between px-6 py-4 cursor-pointer select-none hover:bg-slate-50/50 transition-colors">
                                <span className="font-medium text-slate-900 text-sm">
                                    Why is my email stuck on{" "}
                                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-amber-600">
                                        queued
                                    </code>
                                    ?
                                </span>
                                <svg
                                    className="faq-chevron size-4 text-slate-400 shrink-0 transition-transform duration-200"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </summary>
                            <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4 space-y-2">
                                <p>
                                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">queued</code> means
                                    the message was accepted and is waiting for the mail worker to pick it up. Under
                                    normal load this takes seconds.
                                </p>
                                <p>
                                    If it stays{" "}
                                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">queued</code> for
                                    more than a minute, check <strong>Logs → Audit Log</strong> for worker errors, or
                                    verify your SMTP / email-provider configuration under{" "}
                                    <strong>Admin → Email Configs</strong>.
                                </p>
                            </div>
                        </details>

                        <details className="group bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 overflow-hidden">
                            <summary className="flex items-center justify-between px-6 py-4 cursor-pointer select-none hover:bg-slate-50/50 transition-colors">
                                <span className="font-medium text-slate-900 text-sm">
                                    Can I send from the browser / frontend?
                                </span>
                                <svg
                                    className="faq-chevron size-4 text-slate-400 shrink-0 transition-transform duration-200"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </summary>
                            <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4 space-y-2">
                                <p>
                                    <strong>Not recommended.</strong> Your API key would be visible in the browser's
                                    network inspector and source, making it trivially easy to steal.
                                </p>
                                <p>
                                    Instead, expose a thin endpoint in your own backend (e.g.{" "}
                                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">POST /contact</code>)
                                    that validates the user's input and then calls the AppsZone Mail API
                                    server-to-server using the key stored in an environment variable.
                                </p>
                            </div>
                        </details>

                        <details className="group bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 overflow-hidden">
                            <summary className="flex items-center justify-between px-6 py-4 cursor-pointer select-none hover:bg-slate-50/50 transition-colors">
                                <span className="font-medium text-slate-900 text-sm">
                                    How do I send both plain-text and HTML (MIME multipart alternative)?
                                </span>
                                <svg
                                    className="faq-chevron size-4 text-slate-400 shrink-0 transition-transform duration-200"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </summary>
                            <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
                                <p>
                                    The current API supports a single body part per request. To achieve
                                    multipart/alternative, send your HTML version with{" "}
                                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                                        bodyType: "EMBED_HTML"
                                    </code>
                                    . Email clients that don't render HTML will fall back to their own plain-text
                                    extraction. Full multipart/alternative support is planned for a future release.
                                </p>
                            </div>
                        </details>

                        <details className="group bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 overflow-hidden">
                            <summary className="flex items-center justify-between px-6 py-4 cursor-pointer select-none hover:bg-slate-50/50 transition-colors">
                                <span className="font-medium text-slate-900 text-sm">
                                    What file types can I attach?
                                </span>
                                <svg
                                    className="faq-chevron size-4 text-slate-400 shrink-0 transition-transform duration-200"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </summary>
                            <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
                                <p>
                                    Any file type is accepted by the API as long as you use{" "}
                                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                                        multipart/form-data
                                    </code>
                                    . Practical limits: up to <strong>10 files</strong>, <strong>10 MB each</strong>,{" "}
                                    <strong>25 MB total</strong>. Keep in mind that many email providers and recipient
                                    mail clients impose their own limits (Gmail blocks .exe attachments, for example) —
                                    the API will still accept the request, but delivery may be rejected downstream.
                                </p>
                            </div>
                        </details>

                        <details className="group bg-white rounded-2xl border border-slate-200 shadow-sm shadow-black/5 overflow-hidden">
                            <summary className="flex items-center justify-between px-6 py-4 cursor-pointer select-none hover:bg-slate-50/50 transition-colors">
                                <span className="font-medium text-slate-900 text-sm">
                                    How do I track whether my email was actually delivered?
                                </span>
                                <svg
                                    className="faq-chevron size-4 text-slate-400 shrink-0 transition-transform duration-200"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </summary>
                            <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4 space-y-2">
                                <p>
                                    Save the{" "}
                                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">data.id</code> from
                                    the <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">201</code>{" "}
                                    response. The message transitions through:{" "}
                                    <code className="bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded font-mono">
                                        queued
                                    </code>{" "}
                                    →{" "}
                                    <code className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-mono">
                                        sent
                                    </code>{" "}
                                    or{" "}
                                    <code className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded font-mono">
                                        failed
                                    </code>
                                    .
                                </p>
                                <p>
                                    You can also monitor all messages from <strong>Logs → Sent Messages</strong> in the
                                    sidebar, which shows status, timestamps, and any delivery errors.
                                </p>
                            </div>
                        </details>
                    </div>
                </section>

                <div className="pb-16"></div>
            </div>
        </div>
    );
}
