import { useState } from "react";
import { Inbox, Eye } from "lucide-react";
import { api } from "@/lib/api";
import type { PaginatedResult } from "@/lib/types";
import { usePaginated } from "@/hooks/usePaginated";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { ListPageCard, ListTableHead } from "@/components/ui/ListPageCard";
import { Modal } from "@/components/ui/Modal";
import { ActionBtn } from "@/components/ui/ActionBtn";

interface MailMessage {
    id: string;
    uid: number | null;
    mailboxId: string;
    messageId: string;
    from: string;
    to: string[];
    subject: string;
    snippet: string;
    receivedAt: string;
    isRead: boolean;
    syncedAt: string;
}

function fetcher(p: { page: number; limit: number; search: string }) {
    return api<PaginatedResult<MailMessage>>(
        `/utility/mail-messages?page=${p.page}&limit=${p.limit}&search=${encodeURIComponent(p.search)}`
    );
}

function fmtDateTime(iso: string) {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(iso));
}

function fmtDateTimeFull(iso: string) {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(new Date(iso));
}

function recipientSummary(to: string[]) {
    if (to.length === 0) return "—";
    if (to.length === 1) return to[0];
    return `${to[0]} +${to.length - 1}`;
}

import { DetailField, DetailGrid } from "@/components/ui/DetailField";
import { SecretValue } from "@/components/ui/SecretValue";

export function MailMessages() {
    const { data, meta, isLoading, search, limit, setPage, setLimit, setSearch, refresh } = usePaginated(fetcher);
    const [viewing, setViewing] = useState<MailMessage | null>(null);

    return (
        <>
            <PageHeader
                title="Inbox"
                description="Synced messages from all connected mailboxes. Click a row to view full message details."
                breadcrumb={[{ label: "Mail Admin" }, { label: "Inbox", active: true }]}
                onRefresh={refresh}
                refreshing={isLoading}
            />

            <ListToolbar
                limit={limit}
                onLimitChange={setLimit}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by sender, subject…"
            />

            <ListPageCard meta={meta} onPageChange={setPage}>
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                ) : data.length === 0 ? (
                    <EmptyState
                        icon={Inbox}
                        title="No messages"
                        description="Messages will appear here once mailboxes are synced."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/90">
                                    {["", "From", "To", "Subject", "Preview", "Received", ""].map((h) => (
                                        <ListTableHead key={h || "dot"}>{h}</ListTableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {data.map((msg) => (
                                    <tr
                                        key={msg.id}
                                        onClick={() => setViewing(msg)}
                                        className={`cursor-pointer hover:bg-gray-50/50 transition-colors ${
                                            !msg.isRead ? "bg-indigo-50/30" : ""
                                        }`}
                                    >
                                        <td className="pl-4 py-3 w-6">
                                            {!msg.isRead && (
                                                <span
                                                    className="block h-2 w-2 rounded-full bg-indigo-500"
                                                    title="Unread"
                                                />
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                            <span className={!msg.isRead ? "font-semibold text-gray-900" : ""}>
                                                {msg.from}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                            {recipientSummary(msg.to)}
                                        </td>
                                        <td className="max-w-[200px] px-4 py-3">
                                            <span
                                                className={`block truncate ${
                                                    !msg.isRead ? "font-semibold text-gray-900" : "text-gray-700"
                                                }`}
                                                title={msg.subject}
                                            >
                                                {msg.subject}
                                            </span>
                                        </td>
                                        <td className="max-w-[260px] px-4 py-3 text-xs text-gray-400">
                                            <span className="block truncate">{msg.snippet}</span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                            {fmtDateTime(msg.receivedAt)}
                                        </td>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <ActionBtn
                                                icon={Eye}
                                                label="View message"
                                                variant="view"
                                                onClick={() => setViewing(msg)}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </ListPageCard>

            {/* Preview modal */}
            <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title="Message details" size="lg">
                {viewing && (
                    <div className="space-y-3">
                        {/* Hero */}
                        <div className="rounded-xl border border-indigo-100 bg-linear-to-br from-indigo-50 to-blue-50 px-4 py-4">
                            <p className="text-base font-semibold text-gray-900 line-clamp-2">{viewing.subject}</p>
                            <div className="mt-1.5 flex items-center gap-2">
                                <Badge variant={viewing.isRead ? "neutral" : "info"}>
                                    {viewing.isRead ? "Read" : "Unread"}
                                </Badge>
                                <span className="text-xs text-gray-500">{fmtDateTimeFull(viewing.receivedAt)}</span>
                            </div>
                        </div>

                        <DetailGrid>
                            <DetailField label="From" wide>
                                {viewing.from}
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
                            <DetailField label="Received">{fmtDateTimeFull(viewing.receivedAt)}</DetailField>
                            <DetailField label="Synced">{fmtDateTimeFull(viewing.syncedAt)}</DetailField>
                            {viewing.uid !== null && (
                                <DetailField label="UID">
                                    <code className="font-mono text-xs">#{viewing.uid}</code>
                                </DetailField>
                            )}
                            <DetailField label="Message-ID" wide>
                                <SecretValue value={viewing.messageId} variant="modal" />
                            </DetailField>
                            <DetailField label="Mailbox ID" wide>
                                <SecretValue value={viewing.mailboxId} variant="modal" />
                            </DetailField>
                            <DetailField label="Record ID" wide>
                                <SecretValue value={viewing.id} variant="modal" />
                            </DetailField>
                        </DetailGrid>

                        {/* Snippet */}
                        {viewing.snippet && (
                            <div>
                                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                    Preview
                                </p>
                                <p className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
                                    {viewing.snippet}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </>
    );
}
