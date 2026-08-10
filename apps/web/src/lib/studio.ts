import { api, getToken } from "@/lib/api";
import type { ResumeDocument, StudioConversation, StudioMessage } from "@appszone/shared";

const BASE = "/admin/studio";

export interface EntityReference {
    type: string;
    id: string;
    label?: string;
}

export interface TailoringDecision {
    itemId: string;
    itemType: "project" | "experience";
    included: boolean;
    overlapScore: number;
    matchedTags: string[];
    reason: string;
}

export interface TailoringOutput {
    decisions: TailoringDecision[];
    summary: string[];
    rewrittenPoints: Record<string, string[]>;
    unsupportedClaims: string[];
    rejectedTechnologies: string[];
    model: string | null;
}

export interface ConversationSummary extends StudioConversation {
    profile: { id: string; name: string } | null;
    posting: { id: string; title: string; company: string } | null;
    _count: { messages: number };
}

export interface ConversationDetail extends StudioConversation {
    messages: StudioMessage[];
    profile: { id: string; name: string } | null;
    posting: { id: string; title: string; company: string } | null;
}

export const studioApi = {
    listConversations: (profileId?: string) =>
        api<ConversationSummary[]>(`${BASE}/conversations${profileId ? `?profileId=${profileId}` : ""}`),
    getConversation: (id: string) => api<ConversationDetail>(`${BASE}/conversations/${id}`),
    createConversation: (body: { profileId?: string; postingId?: string }) =>
        api<StudioConversation>(`${BASE}/conversations`, { method: "POST", body }),
    setContext: (id: string, body: { profileId?: string | null; postingId?: string | null }) =>
        api<StudioConversation>(`${BASE}/conversations/${id}/context`, { method: "PUT", body }),
    renameConversation: (id: string, title: string) =>
        api<StudioConversation>(`${BASE}/conversations/${id}/title`, { method: "PUT", body: { title } }),
    removeConversation: (id: string) => api<{ id: string }>(`${BASE}/conversations/${id}`, { method: "DELETE" }),
    ask: (id: string, question: string) =>
        api<{ answer: string; references: EntityReference[] }>(`${BASE}/conversations/${id}/ask`, {
            method: "POST",
            body: { question },
        }),

    tailor: (body: { profileId: string; postingId?: string; jobText?: string }) =>
        api<TailoringOutput>(`${BASE}/tailor`, { method: "POST", body }),
    execute: (body: { profileId: string; postingId?: string; jobText?: string }) =>
        api<{ document: ResumeDocument; tailoring: TailoringOutput }>(`${BASE}/execute`, { method: "POST", body }),

    listDocuments: (profileId: string) => api<ResumeDocument[]>(`${BASE}/documents?profileId=${profileId}`),
    getDocument: (id: string) => api<ResumeDocument & { downloadUrl: string | null }>(`${BASE}/documents/${id}`),
    updateBlock: (id: string, blockId: string, text: string) =>
        api<ResumeDocument>(`${BASE}/documents/${id}/blocks/${blockId}`, { method: "PUT", body: { text } }),
    generate: (id: string) =>
        api<ResumeDocument & { downloadUrl: string }>(`${BASE}/documents/${id}/generate`, { method: "POST", body: {} }),
    removeDocument: (id: string) => api<{ id: string }>(`${BASE}/documents/${id}`, { method: "DELETE" }),
};

/**
 * Map an entity reference to an in-app route.
 *
 * The model never emits URLs — asked for one it invents paths that 404 — so it
 * names the entity and this table decides where that lives.
 */
export function routeForReference(ref: EntityReference): string | null {
    switch (ref.type) {
        case "message":
            return `/inbox`;
        case "mailbox":
            return `/mailboxes/${ref.id}/inbox`;
        case "posting":
            return `/jobs/${ref.id}`;
        case "candidate":
            return `/people/${ref.id}`;
        case "emailConfig":
            return `/email-configs`;
        case "bucket":
            return `/storage/${ref.id}`;
        case "application":
        case "document":
            return null; // opened in place rather than navigated to
        default:
            return null;
    }
}

/* ─── live thinking stream ───────────────────────────────────── */

export type StudioStreamEvent =
    | { type: "thinking"; text: string }
    | { type: "token"; text: string }
    | { type: "tool_call"; name: string; args: Record<string, unknown> }
    | { type: "tool_result"; name: string; summary: string }
    | { type: "references"; references: EntityReference[] }
    | { type: "done"; messageId: string }
    | { type: "error"; message: string };

/**
 * Follow a conversation's reasoning as it happens.
 *
 * `EventSource` rather than a fetch reader, because this endpoint is guarded by
 * AdminSseGuard, which already accepts the admin token in the query string for
 * exactly this reason — EventSource cannot set an Authorization header.
 *
 * Returns a close function.
 */
export function streamConversation(
    conversationId: string,
    onEvent: (event: StudioStreamEvent) => void
): () => void {
    const base = import.meta.env.VITE_API_BASE_URL || "/api/v1";
    const token = getToken() ?? "";
    const source = new EventSource(
        `${base}${BASE}/conversations/${conversationId}/stream?token=${encodeURIComponent(token)}`
    );

    source.onmessage = (message) => {
        try {
            onEvent(JSON.parse(message.data) as StudioStreamEvent);
        } catch {
            // A malformed frame should not tear down a working stream.
        }
    };
    // The browser reconnects on its own; surfacing every blip as an error would
    // make a healthy stream look broken.
    source.onerror = () => undefined;

    return () => source.close();
}
