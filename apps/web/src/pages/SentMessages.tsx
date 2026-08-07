import { useState } from "react";
import { CheckCheck, Eye } from "lucide-react";
import { RowMenu, type RowMenuItem } from "@/components/ui/RowMenu";
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

interface SentMessage {
    id: string;
    apiKeyId: string | null;
    from: string;
    to: string[];
    cc: string[] | null;
    bcc: string[] | null;
    subject: string;
    status: "queued" | "sent" | "failed";
    error: string | null;
    createdAt: string;
}

function fetcher(p: { page: number; limit: number; search: string }) {
    return api<PaginatedResult<SentMessage>>(
        `/utility/sent-messages?page=${p.page}&limit=${p.limit}&search=${encodeURIComponent(p.search)}`
    );
}

const statusVariant: Record<SentMessage["status"], BadgeVariant> = {
    sent: "success",
    queued: "queued",
    failed: "error",
};

function fmtDateTime(iso: string) {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(iso));
}

function recipientSummary(to: string[]) {
    if (to.length === 0) return "—";
    if (to.length === 1) return to[0];
    return `${to[0]} +${to.length - 1} more`;
}

import { DetailField, DetailGrid } from "@/components/ui/DetailField";
import { SecretValue } from "@/components/ui/SecretValue";

export function SentMessages() {
    const { data, meta, isLoading, search, limit, setPage, setLimit, setSearch, refresh } = usePaginated(fetcher);
    const [viewing, setViewing] = useState<SentMessage | null>(null);

    return (
        <>
            <PageHeader
                title="Sent Messages"
                description="All outbound email records with delivery status. Track queued, sent, and failed messages."
                breadcrumb={[{ label: "Mail Admin" }, { label: "Sent Messages", active: true }]}
                onRefresh={refresh}
                refreshing={isLoading}
            />

            <ListToolbar
                limit={limit}
                onLimitChange={setLimit}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by sender, subject, or status…"
            />

            <ListPageCard meta={meta} onPageChange={setPage}>
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                ) : data.length === 0 ? (
                    <EmptyState
                        icon={CheckCheck}
                        title="No sent messages"
                        description="Messages appear here once your app calls POST /mails/send."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/90">
                                    {["From", "To", "Subject", "Status", "Error", "Sent at"].map((h) => (
                                        <ListTableHead key={h}>{h}</ListTableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {data.map((msg) => {
                                    const items: RowMenuItem[] = [
                                        { key: "view", label: "View details", icon: Eye, onClick: () => setViewing(msg) },
                                    ];
                                    return (
                                    <tr
                                        key={msg.id}
                                        onClick={() => setViewing(msg)}
                                        className="cursor-pointer hover:bg-gray-50/50 transition-colors"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <RowMenu items={items} align="left" />
                                                </div>
                                                <span className="text-gray-700">{msg.from}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">{recipientSummary(msg.to)}</td>
                                        <td className="max-w-[220px] px-4 py-3">
                                            <span className="block truncate text-gray-700" title={msg.subject}>
                                                {msg.subject}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant={statusVariant[msg.status]}>{msg.status}</Badge>
                                        </td>
                                        <td className="max-w-[180px] px-4 py-3 text-xs text-red-600">
                                            {msg.error ? (
                                                <span className="block truncate" title={msg.error}>
                                                    {msg.error}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                            {fmtDateTime(msg.createdAt)}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </ListPageCard>

            {/* Preview modal */}
            <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title="Sent message details" size="lg">
                {viewing && (
                    <div className="space-y-3">
                        {/* Hero */}
                        <div
                            className={`rounded-xl border px-4 py-4 ${
                                viewing.status === "sent"
                                    ? "border-emerald-100 bg-linear-to-br from-emerald-50 to-green-50"
                                    : viewing.status === "failed"
                                    ? "border-red-100 bg-linear-to-br from-red-50 to-rose-50"
                                    : "border-amber-100 bg-linear-to-br from-amber-50 to-yellow-50"
                            }`}
                        >
                            <p className="text-base font-semibold text-gray-900 line-clamp-2">{viewing.subject}</p>
                            <div className="mt-2 flex items-center gap-2">
                                <Badge variant={statusVariant[viewing.status]}>{viewing.status}</Badge>
                                <span className="text-xs text-gray-500">{fmtDateTime(viewing.createdAt)}</span>
                            </div>
                        </div>

                        <DetailGrid>
                            <DetailField label="From" wide>
                                {viewing.from}
                            </DetailField>
                            <DetailField label="Message ID" wide>
                                <SecretValue value={viewing.id} variant="modal" />
                            </DetailField>
                            <DetailField label="To" wide>
                                <ul className="space-y-0.5">
                                    {viewing.to.map((addr) => (
                                        <li key={addr} className="font-mono text-xs">
                                            {addr}
                                        </li>
                                    ))}
                                </ul>
                            </DetailField>
                            {viewing.cc && viewing.cc.length > 0 && (
                                <DetailField label="CC" wide>
                                    <ul className="space-y-0.5">
                                        {viewing.cc.map((addr) => (
                                            <li key={addr} className="font-mono text-xs">
                                                {addr}
                                            </li>
                                        ))}
                                    </ul>
                                </DetailField>
                            )}
                            {viewing.bcc && viewing.bcc.length > 0 && (
                                <DetailField label="BCC" wide>
                                    <ul className="space-y-0.5">
                                        {viewing.bcc.map((addr) => (
                                            <li key={addr} className="font-mono text-xs">
                                                {addr}
                                            </li>
                                        ))}
                                    </ul>
                                </DetailField>
                            )}
                            {viewing.apiKeyId && (
                                <DetailField label="API key ID" wide>
                                    <SecretValue value={viewing.apiKeyId} variant="modal" />
                                </DetailField>
                            )}
                        </DetailGrid>

                        {/* Error */}
                        {viewing.error && (
                            <div className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-3">
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-400">
                                    Error
                                </p>
                                <p className="text-sm text-red-700">{viewing.error}</p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </>
    );
}
