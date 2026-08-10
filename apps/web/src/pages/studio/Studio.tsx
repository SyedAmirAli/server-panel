import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ExternalLink, MessageSquarePlus, Send, Sparkles, User } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { peopleApi, type PersonRow } from "@/lib/people";
import { jobsApi, type PostingRow } from "@/lib/jobs";
import {
    routeForReference,
    streamConversation,
    studioApi,
    type ConversationDetail,
    type ConversationSummary,
    type EntityReference,
} from "@/lib/studio";
import { toastError, toastSuccess } from "@/lib/toast";
import { ChatMarkdown } from "@/components/studio/ChatMarkdown";
import { ThinkingTrace, type TraceStep } from "@/components/studio/ThinkingTrace";
import { NewConversationModal } from "@/components/studio/NewConversationModal";
import { ConversationList } from "@/components/studio/ConversationList";
import { AttachMenu, type Attachments } from "@/components/studio/AttachMenu";
import { AttachedChips } from "@/components/studio/AttachedChips";
import type { ResumeDocument } from "@appszone/shared";

/**
 * The Studio is a conversation, not a form.
 *
 * Everything happens by talking: you pick who and which job when starting a
 * thread, then ask for what you want. Conversations are kept and listed, because
 * an assistant you cannot go back to is one whose answers you cannot check.
 */
export function Studio() {
    const { conversationId } = useParams();
    const navigate = useNavigate();

    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [conversation, setConversation] = useState<ConversationDetail | null>(null);
    const [people, setPeople] = useState<PersonRow[]>([]);
    const [postings, setPostings] = useState<PostingRow[]>([]);

    const [question, setQuestion] = useState("");
    const [asking, setAsking] = useState(false);
    const [loading, setLoading] = useState(true);
    const [newOpen, setNewOpen] = useState(false);
    const [documents, setDocuments] = useState<ResumeDocument[]>([]);
    // Message-scoped context from the + menu; person/job go straight to the
    // conversation instead, since they decide what it is for.
    const [pending, setPending] = useState<Attachments>({});

    // The turn currently in flight.
    const [trace, setTrace] = useState<TraceStep[]>([]);
    const [liveAnswer, setLiveAnswer] = useState("");
    const [elapsed, setElapsed] = useState<number | undefined>(undefined);

    const bottomRef = useRef<HTMLDivElement>(null);

    const loadSidebar = useCallback(async () => {
        try {
            const [list, p, j] = await Promise.all([
                studioApi.listConversations(),
                peopleApi.list({ limit: 100 }),
                jobsApi.listPostings({ limit: 100 }),
            ]);
            setConversations(list);
            setPeople(p.data);
            setPostings(j.data);
            return list;
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not load conversations");
            return [];
        }
    }, []);

    useEffect(() => {
        void (async () => {
            setLoading(true);
            const list = await loadSidebar();
            // Land on the most recent thread rather than silently minting a new
            // one — an empty conversation per page load is how history becomes junk.
            if (!conversationId && list.length > 0) {
                navigate(`/studio/${list[0].id}`, { replace: true });
            }
            setLoading(false);
        })();
    }, [loadSidebar, conversationId, navigate]);

    useEffect(() => {
        if (!conversationId) {
            setConversation(null);
            return;
        }
        void (async () => {
            try {
                const detail = await studioApi.getConversation(conversationId);
                setConversation(detail);
                setTrace([]);
                setLiveAnswer("");
                setPending({});
                setDocuments(detail.profileId ? await studioApi.listDocuments(detail.profileId).catch(() => []) : []);
            } catch (err) {
                toastError(err instanceof Error ? err.message : "Could not open that conversation");
                navigate("/studio", { replace: true });
            }
        })();
    }, [conversationId, navigate]);

    // One stream per conversation, opened on entry so the first events of a turn
    // are never lost to a race with connecting.
    useEffect(() => {
        if (!conversationId) return;
        return streamConversation(conversationId, (event) => {
            switch (event.type) {
                case "thinking":
                    setTrace((prev) => [...prev, { kind: "thinking", text: event.text }]);
                    break;
                case "tool_call":
                    setTrace((prev) => [...prev, { kind: "tool_call", text: event.name, tool: event.name }]);
                    break;
                case "tool_result":
                    setTrace((prev) => [...prev, { kind: "tool_result", text: event.summary }]);
                    break;
                case "token":
                    setLiveAnswer((prev) => prev + event.text);
                    break;
                case "error":
                    setTrace((prev) => [...prev, { kind: "thinking", text: event.message }]);
                    break;
                default:
                    break;
            }
        });
    }, [conversationId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [conversation?.messages.length, asking, liveAnswer, trace.length]);

    async function ask() {
        if (!question.trim() || !conversation) return;
        const q = question.trim();
        setQuestion("");
        setAsking(true);
        setTrace([]);
        setLiveAnswer("");
        setElapsed(undefined);
        const startedAt = Date.now();
        try {
            await studioApi.ask(conversation.id, q, {
                jobText: pending.jobText,
                documentId: pending.documentId,
                toEmail: pending.toEmail,
            });
            setPending({});
            setConversation(await studioApi.getConversation(conversation.id));
            void loadSidebar();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "The assistant could not answer");
        } finally {
            setElapsed(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
            setAsking(false);
            // The stored message now carries the text; clearing avoids it
            // appearing twice for a frame.
            setLiveAnswer("");
        }
    }

    async function startConversation(profileId: string | null, postingId: string | null) {
        try {
            const created = await studioApi.createConversation({
                profileId: profileId ?? undefined,
                postingId: postingId ?? undefined,
            });
            setNewOpen(false);
            await loadSidebar();
            navigate(`/studio/${created.id}`);
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not start a conversation");
        }
    }

    async function removeConversation(id: string) {
        try {
            await studioApi.removeConversation(id);
            toastSuccess("Conversation deleted");
            const list = await loadSidebar();
            if (id === conversationId) navigate(list.length ? `/studio/${list[0].id}` : "/studio", { replace: true });
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not delete");
        }
    }

    /** Person and job change the conversation; everything else waits for send. */
    async function attach(patch: Attachments) {
        if (!conversation) return;
        if (patch.profileId !== undefined || patch.postingId !== undefined) {
            try {
                await studioApi.setContext(conversation.id, {
                    ...(patch.profileId !== undefined ? { profileId: patch.profileId } : {}),
                    ...(patch.postingId !== undefined ? { postingId: patch.postingId } : {}),
                });
                const detail = await studioApi.getConversation(conversation.id);
                setConversation(detail);
                setDocuments(detail.profileId ? await studioApi.listDocuments(detail.profileId).catch(() => []) : []);
                void loadSidebar();
            } catch (err) {
                toastError(err instanceof Error ? err.message : "Could not attach that");
            }
            return;
        }
        setPending((prev) => ({ ...prev, ...patch }));
    }

    async function rename(id: string, title: string) {
        try {
            await studioApi.renameConversation(id, title);
            await loadSidebar();
            if (id === conversationId) setConversation(await studioApi.getConversation(id));
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not rename");
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center py-24">
                <Spinner />
            </div>
        );
    }

    const visible = (conversation?.messages ?? []).filter((m) => m.role !== "tool");

    return (
        <div>
            <PageHeader
                title="AI Studio"
                description="Talk to your data, and build resumes by asking."
                actions={
                    <button
                        onClick={() => setNewOpen(true)}
                        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                    >
                        <MessageSquarePlus size={15} />
                        New conversation
                    </button>
                }
            />

            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <ConversationList
                    conversations={conversations}
                    activeId={conversationId}
                    onOpen={(id) => navigate(`/studio/${id}`)}
                    onDelete={removeConversation}
                    onRename={rename}
                />

                {!conversation ? (
                    <div className="flex h-[620px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
                        <Sparkles size={22} className="mb-2 text-gray-300" />
                        <p className="text-sm font-medium text-gray-700">No conversation open</p>
                        <p className="mb-4 max-w-xs text-sm text-gray-500">
                            Start one by choosing a person and a job to build a resume, or with neither to just ask
                            about your data.
                        </p>
                        <button
                            onClick={() => setNewOpen(true)}
                            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                        >
                            New conversation
                        </button>
                    </div>
                ) : (
                    <div className="flex h-[620px] flex-col rounded-xl border border-gray-200 bg-white">
                        {/* context strip */}
                        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2">
                            <Badge variant="info">{conversation.mode}</Badge>
                            {conversation.profile ? (
                                <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                                    <User size={11} className="text-gray-400" />
                                    {conversation.profile.name}
                                </span>
                            ) : (
                                <span className="text-xs text-gray-400">No person — general questions only</span>
                            )}
                            {conversation.posting && (
                                <span className="truncate text-xs text-gray-600">
                                    · {conversation.posting.title} at {conversation.posting.company}
                                </span>
                            )}
                        </div>

                        <div className="flex-1 space-y-3 overflow-y-auto p-4">
                            {visible.length === 0 && (
                                <div className="py-10 text-center text-sm text-gray-400">
                                    {conversation.profile
                                        ? `Ask me to build a resume for ${conversation.profile.name}, or anything about your data.`
                                        : "Try “how many emails are in my inboxes?” or “show me recent mail from Google”."}
                                </div>
                            )}

                            {visible.map((m) => (
                                <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
                                    <div
                                        className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 text-left text-sm ${
                                            m.role === "user" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-800"
                                        }`}
                                    >
                                        {m.role === "user" ? (
                                            <p className="whitespace-pre-wrap">{m.content}</p>
                                        ) : (
                                            <ChatMarkdown content={m.content ?? ""} />
                                        )}

                                        {m.references && (m.references as EntityReference[]).length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {(m.references as EntityReference[]).map((ref) => {
                                                    const route = routeForReference(ref);
                                                    if (!route) return null;
                                                    return (
                                                        <button
                                                            key={`${ref.type}-${ref.id}`}
                                                            onClick={() => navigate(route)}
                                                            className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50"
                                                        >
                                                            <ExternalLink size={10} />
                                                            {ref.label ?? ref.type}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* the turn in flight */}
                            {asking && (
                                <div>
                                    <ThinkingTrace steps={trace} running />
                                    {liveAnswer ? (
                                        <div className="inline-block max-w-[85%] rounded-2xl bg-gray-100 px-3 py-2 text-gray-800">
                                            <ChatMarkdown content={liveAnswer} />
                                        </div>
                                    ) : (
                                        trace.length === 0 && (
                                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                                <Spinner />
                                                Thinking…
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                            {!asking && trace.length > 0 && (
                                <ThinkingTrace steps={trace} running={false} seconds={elapsed} />
                            )}

                            <div ref={bottomRef} />
                        </div>

                        <div className="border-t border-gray-100 p-3">
                            <AttachedChips
                                conversation={conversation}
                                pending={pending}
                                documents={documents}
                                onRemove={(what) => {
                                    if (what === "person") void attach({ profileId: null });
                                    else if (what === "job") void attach({ postingId: null });
                                    else setPending((prev) => ({ ...prev, [what]: undefined }));
                                }}
                            />
                            <div className="flex gap-2">
                                <AttachMenu
                                    people={people}
                                    postings={postings}
                                    documents={documents}
                                    onAttach={(patch) => void attach(patch)}
                                />
                                <input
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void ask()}
                                    placeholder={
                                        conversation.profile
                                            ? "Ask, or say “build a resume for this job”…"
                                            : "Ask about your data…"
                                    }
                                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                                />
                                <button
                                    onClick={() => void ask()}
                                    disabled={asking || !question.trim()}
                                    className="rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    <Send size={15} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <NewConversationModal
                isOpen={newOpen}
                onClose={() => setNewOpen(false)}
                people={people}
                postings={postings}
                onStart={startConversation}
            />
        </div>
    );
}
