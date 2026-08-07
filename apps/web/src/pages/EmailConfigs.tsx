import { useState } from "react";
import { Server, Plus, Pencil, Trash2, Info } from "lucide-react";
import type { EmailConfigView } from "@appszone/shared";
import { api } from "@/lib/api";
import type { PaginatedResult } from "@/lib/types";
import { usePaginated } from "@/hooks/usePaginated";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListToolbar, PrimaryActionButton } from "@/components/ui/ListToolbar";
import { ListPageCard, ListTableHead } from "@/components/ui/ListPageCard";
import { Modal } from "@/components/ui/Modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/RowMenu";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { toastError, toastSuccess } from "@/lib/toast";
import { DetailField, DetailGrid } from "@/components/ui/DetailField";
import { SecretValue } from "@/components/ui/SecretValue";
import { Toggle } from "@/components/ui/Toggle";

function fetcher(p: { page: number; limit: number; search: string }) {
    return api<PaginatedResult<EmailConfigView>>(
        `/admin/email-configs?page=${p.page}&limit=${p.limit}&search=${encodeURIComponent(p.search)}`,
    );
}

function fmtDate(iso: string) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

type ConfigForm = {
    name: string;
    host: string;
    port: string;
    username: string;
    password: string;
    secure: boolean;
    requireTLS: boolean;
    rejectUnauthorized: boolean;
    useTls: boolean;
};

const defaultForm: ConfigForm = {
    name: "",
    host: "",
    port: "587",
    username: "",
    password: "",
    secure: false,
    requireTLS: false,
    rejectUnauthorized: true,
    useTls: false,
};

function StatusToggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onChange}
            disabled={disabled}
            title={checked ? "Active — click to deactivate" : "Inactive — click to activate"}
            className={`relative h-5 w-9 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                checked ? "bg-indigo-600" : "bg-gray-200"
            }`}
        >
            <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    checked ? "translate-x-4" : "translate-x-0"
                }`}
            />
        </button>
    );
}

export function EmailConfigs() {
    const { data, meta, isLoading, search, limit, setPage, setLimit, setSearch, refresh } = usePaginated(fetcher);

    const [busyToggleId, setBusyToggleId] = useState<string | null>(null);
    const [viewing, setViewing] = useState<EmailConfigView | null>(null);

    async function toggleActive(cfg: EmailConfigView) {
        setBusyToggleId(cfg.id);
        try {
            await api(`/admin/email-configs/${cfg.id}/toggle-active`, {
                method: "PATCH",
                body: { isActive: !cfg.isActive },
            });
            refresh();
            toastSuccess(cfg.isActive ? "Config deactivated" : "Config activated");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Failed to toggle config");
        } finally {
            setBusyToggleId(null);
        }
    }

    const [modal, setModal] = useState<"create" | "edit" | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<ConfigForm>(defaultForm);
    const [submitting, setSubmitting] = useState(false);

    function setField<K extends keyof ConfigForm>(k: K, v: ConfigForm[K]) {
        setForm((f) => ({ ...f, [k]: v }));
    }

    function openCreate() {
        setForm(defaultForm);
        setEditingId(null);
        setModal("create");
    }

    function openEdit(cfg: EmailConfigView) {
        setForm({
            name: cfg.name,
            host: cfg.host,
            port: String(cfg.port),
            username: cfg.username,
            password: "",
            secure: cfg.secure,
            requireTLS: cfg.requireTLS,
            rejectUnauthorized: cfg.tls?.rejectUnauthorized ?? true,
            useTls: cfg.tls !== null,
        });
        setEditingId(cfg.id);
        setModal("edit");
    }

    function closeModal() {
        setModal(null);
        setEditingId(null);
    }

    function buildBody(isEdit: boolean) {
        const body: Record<string, unknown> = {
            name: form.name,
            host: form.host,
            port: Number(form.port),
            username: form.username,
            secure: form.secure,
            requireTLS: form.requireTLS,
        };
        if (form.useTls) body.tls = { rejectUnauthorized: form.rejectUnauthorized };
        else if (!isEdit) body.tls = null;
        if (!isEdit || form.password) body.password = form.password;
        return body;
    }

    async function submit() {
        if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
            toastError("Name, host, and username are required.");
            return;
        }
        if (modal === "create" && !form.password.trim()) {
            toastError("Password is required when creating a config.");
            return;
        }
        setSubmitting(true);
        try {
            if (modal === "create") {
                await api("/admin/email-configs", { method: "POST", body: buildBody(false) });
            } else if (editingId) {
                await api(`/admin/email-configs/${editingId}`, { method: "PUT", body: buildBody(true) });
            }
            refresh();
            closeModal();
            toastSuccess(modal === "create" ? "Config created" : "Config updated");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Failed to save");
        } finally {
            setSubmitting(false);
        }
    }

    async function deleteConfig(cfg: EmailConfigView) {
        if (!confirm(`Delete "${cfg.name}"? This cannot be undone.`)) return;
        try {
            await api(`/admin/email-configs/${cfg.id}`, { method: "DELETE" });
            refresh();
            toastSuccess(`"${cfg.name}" deleted`);
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Delete failed");
        }
    }

    return (
        <>
            <PageHeader
                title="Email Configs"
                description="Per-sender SMTP credentials. Matched to the from address on each send — manage hosts, ports, TLS, and activation."
                breadcrumb={[{ label: "Mail Admin" }, { label: "Email Configs", active: true }]}
                onRefresh={refresh}
                refreshing={isLoading}
            />

            <ListToolbar
                limit={limit}
                onLimitChange={setLimit}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by name, host, or username…"
                action={
                    <PrimaryActionButton icon={Plus} onClick={openCreate}>
                        New config
                    </PrimaryActionButton>
                }
            />

            <ListPageCard meta={meta} onPageChange={setPage}>
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                ) : data.length === 0 ? (
                    <EmptyState
                        icon={Server}
                        title="No SMTP configs"
                        description="Add a config to route outbound mail through a specific SMTP account."
                        action={
                            <button
                                onClick={openCreate}
                                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                            >
                                <Plus size={14} />
                                New config
                            </button>
                        }
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/90">
                                    {["Name", "Host", "Port", "Username", "TLS", "Status", "Updated"].map((h) => (
                                        <ListTableHead key={h}>{h}</ListTableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {data.map((cfg) => {
                                    const items: RowMenuItem[] = [
                                        { key: "edit", label: "Edit", icon: Pencil, onClick: () => openEdit(cfg) },
                                        {
                                            key: "delete",
                                            label: "Delete",
                                            icon: Trash2,
                                            tone: "danger",
                                            onClick: () => deleteConfig(cfg),
                                        },
                                    ];
                                    return (
                                    <tr
                                        key={cfg.id}
                                        onClick={() => setViewing(cfg)}
                                        className="cursor-pointer hover:bg-gray-50/50 transition-colors"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <RowMenu items={items} align="left" />
                                                </div>
                                                <span className="font-medium text-gray-900">{cfg.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{cfg.host}</td>
                                        <td className="px-4 py-3">
                                            <code className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-600">
                                                {cfg.port}
                                            </code>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{cfg.username}</td>
                                        <td className="px-4 py-3">
                                            {cfg.secure ? (
                                                <Badge variant="success">Implicit TLS</Badge>
                                            ) : cfg.requireTLS ? (
                                                <Badge variant="info">STARTTLS</Badge>
                                            ) : (
                                                <Badge variant="neutral">None</Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <StatusToggle
                                                checked={cfg.isActive}
                                                onChange={() => toggleActive(cfg)}
                                                disabled={busyToggleId === cfg.id}
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-nowrap">
                                            {fmtDate(cfg.updatedAt)}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </ListPageCard>

            {/* Create / Edit modal */}
            <Modal
                isOpen={modal !== null}
                onClose={closeModal}
                title={modal === "create" ? "New SMTP config" : "Edit SMTP config"}
                size="lg"
            >
                <div className="space-y-4">
                    {/* Row 1 */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                value={form.name}
                                onChange={(e) => setField("name", e.target.value)}
                                placeholder="Mailcow SMTP"
                                maxLength={255}
                                className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                Username / From address <span className="text-red-500">*</span>
                            </label>
                            <input
                                value={form.username}
                                onChange={(e) => setField("username", e.target.value)}
                                placeholder="noreply@example.com"
                                maxLength={255}
                                className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            />
                        </div>
                    </div>

                    {/* Provider hint */}
                    <div className="flex gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-3 text-xs text-indigo-900">
                        <Info size={15} className="mt-0.5 shrink-0 text-indigo-500" />
                        <div className="space-y-1">
                            <p className="font-medium">Using Gmail with an App Password?</p>
                            <p className="text-indigo-700">
                                Host <code className="rounded bg-white/70 px-1 py-0.5 font-mono">smtp.gmail.com</code>,
                                port <code className="rounded bg-white/70 px-1 py-0.5 font-mono">587</code> (STARTTLS)
                                or <code className="rounded bg-white/70 px-1 py-0.5 font-mono">465</code> (Implicit
                                TLS). Username is your full Gmail address; password is the 16-character App Password
                                from your Google Account (requires 2-Step Verification enabled) — not your normal
                                login password.
                            </p>
                        </div>
                    </div>

                    {/* Row 2 */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">
                                SMTP host <span className="text-red-500">*</span>
                            </label>
                            <input
                                value={form.host}
                                onChange={(e) => setField("host", e.target.value)}
                                placeholder="mail.example.com"
                                maxLength={255}
                                className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">Port</label>
                            <input
                                type="number"
                                value={form.port}
                                onChange={(e) => setField("port", e.target.value)}
                                min={1}
                                max={65535}
                                className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-700">
                            Password{" "}
                            {modal === "edit" && (
                                <span className="font-normal text-gray-400">leave blank to keep unchanged</span>
                            )}
                            {modal === "create" && <span className="text-red-500"> *</span>}
                        </label>
                        <PasswordInput
                            value={form.password}
                            onChange={(v) => setField("password", v)}
                            placeholder={modal === "edit" ? "••••••••" : "SMTP password"}
                            autoComplete="new-password"
                        />
                    </div>

                    {/* Toggles */}
                    <div className="space-y-3 rounded-xl bg-gray-50 px-4 py-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">TLS options</p>
                        {[
                            {
                                key: "secure" as const,
                                label: "Implicit TLS (port 465)",
                                desc: "Wraps the connection in TLS from the start",
                            },
                            {
                                key: "requireTLS" as const,
                                label: "Require STARTTLS",
                                desc: "Upgrade to TLS or fail the connection",
                            },
                            {
                                key: "useTls" as const,
                                label: "Custom TLS settings",
                                desc: "Override default certificate validation",
                            },
                        ].map(({ key, label, desc }) => (
                            <div key={key} className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-gray-800">{label}</p>
                                    <p className="text-xs text-gray-500">{desc}</p>
                                </div>
                                <Toggle checked={form[key]} onChange={(v) => setField(key, v)} />
                            </div>
                        ))}

                        {form.useTls && (
                            <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
                                <div>
                                    <p className="text-sm font-medium text-gray-800">Reject unauthorized certs</p>
                                    <p className="text-xs text-gray-500">Turn off only for self-signed certs in dev</p>
                                </div>
                                <Toggle
                                    checked={form.rejectUnauthorized}
                                    onChange={(v) => setField("rejectUnauthorized", v)}
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={closeModal}
                            className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={submit}
                            disabled={submitting}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            {submitting && <Spinner size="sm" />}
                            {modal === "create" ? "Create config" : "Save changes"}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Preview modal */}
            <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title="Email Config details">
                {viewing && (
                    <div className="space-y-3">
                        {/* Hero */}
                        <div className="rounded-xl border border-indigo-100 bg-linear-to-br from-indigo-50 to-blue-50 px-4 py-4">
                            <p className="text-base font-semibold text-gray-900">{viewing.name}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Badge variant={viewing.isActive ? "success" : "neutral"}>
                                    {viewing.isActive ? "Active" : "Inactive"}
                                </Badge>
                                {viewing.secure ? (
                                    <Badge variant="success">Implicit TLS</Badge>
                                ) : viewing.requireTLS ? (
                                    <Badge variant="info">STARTTLS</Badge>
                                ) : (
                                    <Badge variant="neutral">No TLS</Badge>
                                )}
                            </div>
                        </div>

                        <DetailGrid>
                            <DetailField label="Config ID" wide>
                                <SecretValue value={viewing.id} variant="modal" />
                            </DetailField>
                            <DetailField label="Host" wide>
                                <code className="font-mono text-xs">{viewing.host}</code>
                            </DetailField>
                            <DetailField label="Port">
                                <code className="font-mono text-xs">{viewing.port}</code>
                            </DetailField>
                            <DetailField label="Username">{viewing.username}</DetailField>
                            <DetailField label="Created">{fmtDate(viewing.createdAt)}</DetailField>
                            <DetailField label="Updated">{fmtDate(viewing.updatedAt)}</DetailField>
                        </DetailGrid>
                    </div>
                )}
            </Modal>
        </>
    );
}
