import { useState } from "react";
import { HardDrive, Eye } from "lucide-react";
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

interface MailboxRow {
    id: string;
    address: string;
    imapHost: string;
    imapUser: string;
    smtpHost: string;
    smtpUser: string;
    isActive: boolean;
    lastSyncUid: number | null;
    createdAt: string;
    updatedAt: string;
}

function fetcher(p: { page: number; limit: number; search: string }) {
    return api<PaginatedResult<MailboxRow>>(
        `/utility/mailboxes?page=${p.page}&limit=${p.limit}&search=${encodeURIComponent(p.search)}`,
    );
}

function fmtDate(iso: string) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

import { DetailField, DetailGrid } from "@/components/ui/DetailField";
import { SecretValue } from "@/components/ui/SecretValue";

export function Mailboxes() {
    const { data, meta, isLoading, search, limit, setPage, setLimit, setSearch, refresh } = usePaginated(fetcher);
    const [viewing, setViewing] = useState<MailboxRow | null>(null);

    return (
        <>
            <PageHeader
                title="Mailboxes"
                description="IMAP mailboxes synced to this server. View connection details and sync status."
                breadcrumb={[{ label: "Mail Admin" }, { label: "Mailboxes", active: true }]}
                onRefresh={refresh}
                refreshing={isLoading}
            />

            <ListToolbar
                limit={limit}
                onLimitChange={setLimit}
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by address…"
            />

            <ListPageCard meta={meta} onPageChange={setPage}>
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                ) : data.length === 0 ? (
                    <EmptyState
                        icon={HardDrive}
                        title="No mailboxes"
                        description="Mailboxes configured in the backend will appear here."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/90">
                                    {[
                                        "Address",
                                        "IMAP host",
                                        "SMTP host",
                                        "Status",
                                        "Last sync UID",
                                        "Created",
                                        "",
                                    ].map((h) => (
                                        <ListTableHead key={h}>{h}</ListTableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {data.map((mb) => (
                                    <tr
                                        key={mb.id}
                                        onClick={() => setViewing(mb)}
                                        className="cursor-pointer hover:bg-gray-50/50 transition-colors"
                                    >
                                        <td className="px-4 py-3 font-medium text-gray-900">{mb.address}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{mb.imapHost}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{mb.smtpHost}</td>
                                        <td className="px-4 py-3">
                                            <Badge variant={mb.isActive ? "success" : "neutral"}>
                                                {mb.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {mb.lastSyncUid !== null ? (
                                                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-nowrap">
                                                    #{mb.lastSyncUid}
                                                </code>
                                            ) : (
                                                <span className="text-gray-400 text-xs text-nowrap">Not synced</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(mb.createdAt)}</td>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <ActionBtn
                                                icon={Eye}
                                                label="View details"
                                                variant="view"
                                                onClick={() => setViewing(mb)}
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
            <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title="Mailbox details">
                {viewing && (
                    <div className="space-y-3">
                        {/* Hero */}
                        <div className="rounded-xl border border-indigo-100 bg-linear-to-br from-indigo-50 to-slate-50 px-4 py-4">
                            <p className="font-mono text-base font-semibold text-gray-900">{viewing.address}</p>
                            <div className="mt-2 flex items-center gap-2">
                                <Badge variant={viewing.isActive ? "success" : "neutral"}>
                                    {viewing.isActive ? "Active" : "Inactive"}
                                </Badge>
                                {viewing.lastSyncUid !== null && (
                                    <code className="rounded-md bg-white/80 px-2 py-0.5 font-mono text-xs text-gray-500 ring-1 ring-gray-200">
                                        last UID #{viewing.lastSyncUid}
                                    </code>
                                )}
                            </div>
                        </div>

                        <DetailGrid>
                            <DetailField label="Mailbox ID" wide>
                                <SecretValue value={viewing.id} variant="modal" />
                            </DetailField>
                            <DetailField label="IMAP host">
                                <code className="font-mono text-xs">{viewing.imapHost}</code>
                            </DetailField>
                            <DetailField label="IMAP username">{viewing.imapUser}</DetailField>
                            <DetailField label="SMTP host">
                                <code className="font-mono text-xs">{viewing.smtpHost}</code>
                            </DetailField>
                            <DetailField label="SMTP username">{viewing.smtpUser}</DetailField>
                            <DetailField label="Created">{fmtDate(viewing.createdAt)}</DetailField>
                            <DetailField label="Updated">{fmtDate(viewing.updatedAt)}</DetailField>
                        </DetailGrid>
                    </div>
                )}
            </Modal>
        </>
    );
}
