import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Inbox, Eye, Mail as MailIcon, RefreshCw } from "lucide-react";
import type { MailboxView, MailMessageView } from "@appszone/shared";
import { api } from "@/lib/api";
import { toastError, toastSuccess } from "@/lib/toast";
import { useCursorPaginated, type CursorPage } from "@/hooks/useCursorPaginated";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { ListPageCard, ListTableHead } from "@/components/ui/ListPageCard";
import { Modal } from "@/components/ui/Modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/RowMenu";
import { EmailPreviewModal } from "@/components/mail/EmailPreviewModal";
import { DetailField, DetailGrid } from "@/components/ui/DetailField";
import { SecretValue } from "@/components/ui/SecretValue";
import { formatDate } from "@/lib/format";

function fmtDateTime(iso: string) {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
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

export function MailboxInbox() {
    const { id = "" } = useParams();
    const [mailbox, setMailbox] = useState<MailboxView | null>(null);

    function fetcher(p: { cursor?: string; limit: number; search: string }): Promise<CursorPage<MailMessageView>> {
        const qp = new URLSearchParams({ limit: String(p.limit), mailboxId: id });
        if (p.cursor) qp.set("cursor", p.cursor);
        if (p.search) qp.set("search", p.search);
        return api<CursorPage<MailMessageView>>(`/utility/mail-messages?${qp.toString()}`);
    }

    const { data, isLoading, isLoadingMore, hasMore, search, setSearch, loadMore, refresh } =
        useCursorPaginated(fetcher, { limit: 50 });
    const [viewing, setViewing] = useState<MailMessageView | null>(null);
    const [previewId, setPreviewId] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        if (!id) return;
        api<MailboxView>(`/admin/mailboxes/${id}`)
            .then(setMailbox)
            .catch((err) => toastError(err instanceof Error ? err.message : "Could not load mailbox"));
    }, [id]);

    async function syncNow() {
        setSyncing(true);
        try {
            const result = await api<{ imported: number }>(`/admin/mailboxes/${id}/sync`, { method: "POST" });
            toastSuccess(`Synced — ${result.imported} new message(s)`);
            refresh();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Sync failed");
        } finally {
            setSyncing(false);
        }
    }

    return (
        <>
            <PageHeader
                title={mailbox?.address ?? "Mailbox inbox"}
                description={
                    mailbox
                        ? `${mailbox.imapHost}:${mailbox.imapPort} · ${mailbox.isActive ? "Active" : "Inactive"} · Last synced ${formatDate(mailbox.lastSyncAt)}`
                        : "Loading…"
                }
                breadcrumb={[
                    { label: "Mail Admin" },
                    { label: "Mailboxes" },
                    { label: mailbox?.address ?? "Inbox", active: true },
                ]}
                onRefresh={refresh}
                refreshing={isLoading}
            />

            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                    <SearchBar value={search} onChange={setSearch} placeholder="Search by sender, subject…" />
                </div>
                <button
                    onClick={syncNow}
                    disabled={syncing}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                    {syncing ? <Spinner size="sm" /> : <RefreshCw size={15} />}
                    Sync now
                </button>
            </div>

            <ListPageCard
                footer={
                    hasMore ? (
                        <div className="flex justify-center border-t border-gray-100 py-3">
                            <button
                                onClick={loadMore}
                                disabled={isLoadingMore}
                                className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                            >
                                {isLoadingMore && <Spinner size="sm" />}
                                Load more
                            </button>
                        </div>
                    ) : undefined
                }
            >
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                ) : data.length === 0 ? (
                    <EmptyState
                        icon={Inbox}
                        title="No messages"
                        description="Sync this mailbox to pull in its messages."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/90">
                                    {["", "From", "To", "Subject", "Preview", "Received"].map((h) => (
                                        <ListTableHead key={h || "dot"}>{h}</ListTableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {data.map((msg) => {
                                    const items: RowMenuItem[] = [
                                        { key: "view", label: "View details", icon: Eye, onClick: () => setViewing(msg) },
                                        {
                                            key: "preview",
                                            label: "View rendered email",
                                            icon: MailIcon,
                                            onClick: () => setPreviewId(msg.id),
                                        },
                                    ];
                                    return (
                                        <tr
                                            key={msg.id}
                                            onClick={() => setViewing(msg)}
                                            className={`cursor-pointer hover:bg-gray-50/50 transition-colors ${
                                                !msg.isRead ? "bg-indigo-50/30" : ""
                                            }`}
                                        >
                                            <td className="pl-4 py-3 w-16">
                                                <div className="flex items-center gap-1.5">
                                                    <div onClick={(e) => e.stopPropagation()}>
                                                        <RowMenu items={items} align="left" />
                                                    </div>
                                                    {!msg.isRead && (
                                                        <span
                                                            className="block h-2 w-2 shrink-0 rounded-full bg-indigo-500"
                                                            title="Unread"
                                                        />
                                                    )}
                                                </div>
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
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </ListPageCard>

            {/* Details modal */}
            <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title="Message details" size="lg">
                {viewing && (
                    <div className="space-y-3">
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
                            <DetailField label="Record ID" wide>
                                <SecretValue value={viewing.id} variant="modal" />
                            </DetailField>
                        </DetailGrid>

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

            <EmailPreviewModal messageId={previewId} onClose={() => setPreviewId(null)} />
        </>
    );
}
