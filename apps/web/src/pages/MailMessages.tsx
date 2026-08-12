import { useState } from "react";
import { Inbox, Eye, Mail as MailIcon, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import type { MailMessageView } from "@appszone/shared";
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

function fetcher(p: { cursor?: string; limit: number; search: string }): Promise<CursorPage<MailMessageView>> {
    const qp = new URLSearchParams({ limit: String(p.limit) });
    if (p.cursor) qp.set("cursor", p.cursor);
    if (p.search) qp.set("search", p.search);
    return api<CursorPage<MailMessageView>>(`/utility/mail-messages?${qp.toString()}`);
}

// Received column always shows the year — messages can be months/years old, and without it
// "Aug 7, 2:30 PM" and "Aug 7, 2:30 PM" from different years look identical.
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

const PAGE_SIZE = 50;

export function MailMessages() {
    const {
        data,
        total,
        isLoading,
        isLoadingMore,
        search,
        setSearch,
        refresh,
        pageIndex,
        hasNextPage,
        hasPrevPage,
        goToNextPage,
        goToPrevPage,
    } = useCursorPaginated(fetcher, { limit: PAGE_SIZE });
    const [viewing, setViewing] = useState<MailMessageView | null>(null);
    const [previewId, setPreviewId] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);

    async function syncAll() {
        setSyncing(true);
        try {
            const result = await api<{ mailboxes: number; imported: number }>("/admin/mailboxes/sync-all", {
                method: "POST",
            });
            toastSuccess(`Synced ${result.mailboxes} mailbox(es) — ${result.imported} new message(s)`);
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
                title="Inbox"
                description="Synced messages from all connected mailboxes, newest first, in strict chronological order regardless of which mailbox they came from. Click a row to view full message details."
                breadcrumb={[{ label: "Mail Admin" }, { label: "Inbox", active: true }]}
                onRefresh={refresh}
                refreshing={isLoading}
            />

            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                    <SearchBar value={search} onChange={setSearch} placeholder="Search by sender, subject…" />
                </div>
                <button
                    onClick={syncAll}
                    disabled={syncing}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                    {syncing ? <Spinner size="sm" /> : <RefreshCw size={15} />}
                    Sync all mailboxes
                </button>
            </div>

            {data.length > 0 && (
                <div className="mb-4 flex items-center justify-center gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
                    <button
                        type="button"
                        onClick={goToPrevPage}
                        disabled={!hasPrevPage || isLoadingMore}
                        aria-label="Previous page"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                        <ChevronLeft size={16} />
                    </button>

                    <p className="text-sm text-gray-600">
                        <strong className="font-semibold text-gray-800">
                            {(pageIndex * PAGE_SIZE + 1).toLocaleString()}
                        </strong>
                        {"–"}
                        <strong className="font-semibold text-gray-800">
                            {(pageIndex * PAGE_SIZE + data.length).toLocaleString()}
                        </strong>{" "}
                        of <strong className="font-semibold text-gray-800">{(total ?? 0).toLocaleString()}</strong>{" "}
                        entries
                    </p>

                    <button
                        type="button"
                        onClick={goToNextPage}
                        disabled={!hasNextPage || isLoadingMore}
                        aria-label="Next page"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                        {isLoadingMore ? <Spinner size="sm" /> : <ChevronRight size={16} />}
                    </button>
                </div>
            )}

            <ListPageCard>
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

            <EmailPreviewModal messageId={previewId} onClose={() => setPreviewId(null)} />
        </>
    );
}
