import { useState } from "react";
import { ScrollText, Eye } from "lucide-react";
import { api } from "@/lib/api";
import type { PaginatedResult } from "@/lib/types";
import { usePaginated } from "@/hooks/usePaginated";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { ListPageCard, ListTableHead } from "@/components/ui/ListPageCard";
import { Modal } from "@/components/ui/Modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/RowMenu";
import { SecretValue } from "@/components/ui/SecretValue";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { HtmlContent } from "@/components/ui/HtmlContent";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { DetailField, DetailGrid } from "@/components/ui/DetailField";

interface AuditLogEntry {
    id: string;
    action: string;
    actorType: string;
    actorId: string | null;
    entityType: string | null;
    entityId: string | null;
    metadata: Record<string, unknown> | null;
    ip: string | null;
    userAgent: string | null;
    message: string | null;
    createdAt: string;
}

function fetcher(p: { page: number; limit: number; search: string }) {
    return api<PaginatedResult<AuditLogEntry>>(
        `/utility/audit-log?page=${p.page}&limit=${p.limit}&search=${encodeURIComponent(p.search)}`,
    );
}

function actionVariant(action: string): BadgeVariant {
    if (action.includes("success")) return "success";
    if (action.includes("failed") || action.includes("error")) return "error";
    return "neutral";
}

function fmtDateTime(iso: string) {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(iso));
}

function truncate(str: string | null | undefined, max: number) {
    if (!str) return "—";
    return str.length <= max ? str : str.slice(0, max) + "…";
}

function looksLikeHtml(value: string): boolean {
    return /<[a-z][\s\S]*>/i.test(value);
}

function metadataBody(metadata: Record<string, unknown> | null): string | null {
    if (!metadata || typeof metadata.body !== "string") return null;
    return metadata.body;
}

export function AuditLog() {
    const { data, meta, isLoading, search, limit, setPage, setLimit, setSearch, refresh } = usePaginated(fetcher);
    const [viewing, setViewing] = useState<AuditLogEntry | null>(null);

    return (
        <>
            <PageHeader
                title="Audit Log"
                description="Every send event and system action with full context — filter by action, actor, entity, or message."
                breadcrumb={[{ label: "Mail Admin" }, { label: "Audit Log", active: true }]}
                onRefresh={refresh}
                refreshing={isLoading}
            />

            <ListToolbar
                limit={limit}
                onLimitChange={setLimit}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by action, actor, or entity…"
            />

            <ListPageCard meta={meta} onPageChange={setPage}>
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                ) : data.length === 0 ? (
                    <EmptyState
                        icon={ScrollText}
                        title="No audit entries"
                        description="Events will appear here as mail is sent and keys are managed."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/90">
                                    {["Action", "Actor", "Entity", "Message", "IP", "Date"].map((h) => (
                                        <ListTableHead key={h}>{h}</ListTableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {data.map((entry) => {
                                    const items: RowMenuItem[] = [
                                        { key: "view", label: "View details", icon: Eye, onClick: () => setViewing(entry) },
                                    ];
                                    return (
                                    <tr
                                        key={entry.id}
                                        onClick={() => setViewing(entry)}
                                        className="cursor-pointer hover:bg-gray-50/50 transition-colors"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <RowMenu items={items} align="left" />
                                                </div>
                                                <Badge variant={actionVariant(entry.action)}>{entry.action}</Badge>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <span className="text-gray-700">{entry.actorType}</span>
                                            {entry.actorId && (
                                                <div className="mt-1 max-w-35">
                                                    <SecretValue value={entry.actorId} variant="table" />
                                                </div>
                                            )}
                                        </td>
                                        <td
                                            className="px-4 py-3 text-gray-500 text-nowrap"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {entry.entityType ?? "—"}
                                            {entry.entityId && (
                                                <div className="mt-1 max-w-35">
                                                    <SecretValue value={entry.entityId} variant="table" />
                                                </div>
                                            )}
                                        </td>
                                        <td className="max-w-xs px-4 py-3 text-gray-500 text-nowrap">
                                            <span className="line-clamp-2 text-xs leading-relaxed">
                                                {truncate(entry.message, 120)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{entry.ip ?? "—"}</td>
                                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                            {fmtDateTime(entry.createdAt)}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </ListPageCard>

            <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title="Audit entry" size="lg">
                {viewing && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-gray-200 bg-linear-to-br from-gray-50 to-slate-50 px-4 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={actionVariant(viewing.action)}>{viewing.action}</Badge>
                                <span className="text-sm font-medium text-gray-700">{viewing.actorType}</span>
                            </div>
                            <p className="mt-1.5 text-xs text-gray-400">{fmtDateTime(viewing.createdAt)}</p>
                        </div>

                        <DetailGrid>
                            {viewing.actorId && (
                                <DetailField label="Actor ID" wide>
                                    <SecretValue value={viewing.actorId} variant="modal" />
                                </DetailField>
                            )}
                            {viewing.entityType && <DetailField label="Entity">{viewing.entityType}</DetailField>}
                            {viewing.entityId && (
                                <DetailField label="Entity ID" wide>
                                    <SecretValue value={viewing.entityId} variant="modal" />
                                </DetailField>
                            )}
                            <DetailField label="IP address">
                                <code className="font-mono text-xs">{viewing.ip ?? "—"}</code>
                            </DetailField>
                            {viewing.userAgent && (
                                <DetailField label="User-agent" wide>
                                    <span className="break-all text-xs font-normal text-gray-600">
                                        {viewing.userAgent}
                                    </span>
                                </DetailField>
                            )}
                            <DetailField label="Entry ID" wide>
                                <SecretValue value={viewing.id} variant="modal" />
                            </DetailField>
                        </DetailGrid>

                        {viewing.message && (
                            <div>
                                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                    Message
                                </p>
                                <MarkdownContent content={viewing.message} />
                            </div>
                        )}

                        {metadataBody(viewing.metadata) && looksLikeHtml(metadataBody(viewing.metadata)!) && (
                            <div>
                                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                    Email body (HTML)
                                </p>
                                <HtmlContent html={metadataBody(viewing.metadata)!} />
                            </div>
                        )}

                        {viewing.metadata != null && (
                            <div>
                                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                    Metadata
                                </p>
                                <ScrollArea
                                    maxHeight="max-h-48"
                                    className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-xs leading-relaxed text-gray-700"
                                >
                                    {JSON.stringify(viewing.metadata, null, 2)}
                                </ScrollArea>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </>
    );
}
