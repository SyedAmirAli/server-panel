import { Injectable, Logger } from "@nestjs/common";
import { Subject } from "rxjs";
import { PrismaService } from "@/prisma/prisma.service";
import { LlmService, extractJson } from "@/modules/job-finder/llm/llm.service";
import { ConversationService } from "@/modules/ai-studio/services/conversation.service";
import { StudioToolsService, type EntityReference } from "@/modules/ai-studio/services/studio-tools.service";
import { buildAssistantPrompt, renderProfileContext, renderToolResult } from "@/modules/ai-studio/prompts/assistant.prompt";
import type { ChatMessage } from "@/modules/job-finder/llm/llm.types";

export type StudioStreamEvent =
    | { type: "thinking"; text: string }
    | { type: "token"; text: string }
    | { type: "tool_call"; name: string; args: Record<string, unknown> }
    | { type: "tool_result"; name: string; summary: string }
    | { type: "references"; references: EntityReference[] }
    | { type: "done"; messageId: string }
    | { type: "error"; message: string };

/** How many tool calls one question may trigger before we stop and answer. */
const MAX_TOOL_STEPS = 4;

/**
 * The Studio assistant loop.
 *
 * The model may ask for data by emitting a JSON tool call; we run it, feed the
 * result back fenced as untrusted, and continue. The loop is capped so a model
 * that keeps asking for lookups cannot spin indefinitely on the user's time.
 */
@Injectable()
export class StudioChatService {
    private readonly logger = new Logger(StudioChatService.name);
    private readonly streams = new Map<string, Subject<StudioStreamEvent>>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly llm: LlmService,
        private readonly conversations: ConversationService,
        private readonly tools: StudioToolsService
    ) {}

    /** The attached candidate's full record, rendered for the system prompt. */
    private async loadProfileContext(profileId: string): Promise<string | null> {
        const profile = await this.prisma.candidateProfile.findUnique({
            where: { id: profileId },
            include: {
                projectItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
                experienceItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
                educationItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
                skillItems: { orderBy: { sortOrder: "asc" } },
                linkItems: { orderBy: { sortOrder: "asc" } },
                _count: { select: { infoItems: true } },
            },
        });
        if (!profile) return null;
        return renderProfileContext({ ...profile, infoItemCount: profile._count.infoItems });
    }

    private async loadJobContext(postingId: string): Promise<string | null> {
        const posting = await this.prisma.jobPosting.findUnique({
            where: { id: postingId },
            select: { title: true, company: true, location: true, isRemote: true, description: true },
        });
        if (!posting) return null;
        return [
            `${posting.title} at ${posting.company}`,
            posting.location ? `Location: ${posting.location}${posting.isRemote ? " (remote)" : ""}` : null,
            "",
            (posting.description ?? "").slice(0, 8000),
        ]
            .filter((l) => l !== null)
            .join("\n");
    }

    /** Event stream for one conversation, created on demand. */
    streamFor(conversationId: string): Subject<StudioStreamEvent> {
        let subject = this.streams.get(conversationId);
        if (!subject) {
            subject = new Subject<StudioStreamEvent>();
            this.streams.set(conversationId, subject);
        }
        return subject;
    }

    /**
     * Handle a user turn. Returns once the answer is stored; progress is pushed
     * to {@link streamFor} as it happens.
     */
    async ask(conversationId: string, question: string): Promise<{ answer: string; references: EntityReference[] }> {
        const stream = this.streamFor(conversationId);
        const conversation = await this.conversations.getOne(conversationId);

        await this.conversations.addMessage({ conversationId, role: "user", content: question });

        if (!this.llm.isConfigured()) {
            const message = "The assistant needs the AI gateway. Set AI_BASE_URL and AI_API_KEY, then try again.";
            stream.next({ type: "error", message });
            await this.conversations.addMessage({ conversationId, role: "assistant", content: message });
            return { answer: message, references: [] };
        }

        // The attached person's whole record goes in up front. Leaving the model
        // to fetch its own facts means it sometimes answers without bothering,
        // and every claim it makes about them must trace back to this.
        const profileContext = conversation.profileId ? await this.loadProfileContext(conversation.profileId) : null;
        const jobContext = conversation.postingId ? await this.loadJobContext(conversation.postingId) : null;

        const system = buildAssistantPrompt({
            tools: this.tools.definitions,
            profileName: conversation.profile?.name ?? null,
            postingLabel: conversation.posting ? `${conversation.posting.title} at ${conversation.posting.company}` : null,
            profileContext,
            jobContext,
        });

        const history = await this.conversations.history(conversationId, 12);
        const messages: ChatMessage[] = [
            { role: "system", content: system },
            ...history.map((h) => ({ role: h.role, content: h.content }) as ChatMessage),
        ];

        const references: EntityReference[] = [];

        try {
            for (let step = 0; step <= MAX_TOOL_STEPS; step++) {
                stream.next({
                    type: "thinking",
                    text: step === 0 ? "Reading your question" : "Working out what else is needed",
                });

                // The first pass may be a tool call, which must be parsed whole —
                // streaming a half-written JSON object to the user is noise. Only
                // once we know it is prose does streaming help, so buffer here and
                // stream the final answer below.
                const result = await this.llm.complete(messages, { temperature: 0.2, maxTokens: 1200 });
                const text = (result.text ?? "").trim();
                const call = parseToolCall(text);

                if (!call || step === MAX_TOOL_STEPS) {
                    // Either a plain answer, or we have spent the tool budget and
                    // must give the user whatever we have rather than looping.
                    let answer = call
                        ? "I could not finish looking that up — try narrowing the question."
                        : text || "I could not produce an answer.";

                    if (!call && references.length) {
                        // A tool ran, so the answer above was written without the
                        // user seeing anything appear. Re-ask with the same context
                        // and stream it, so the reply lands progressively.
                        stream.next({ type: "thinking", text: "Writing the answer" });
                        try {
                            let streamed = "";
                            const res = await this.llm.completeStream(
                                messages,
                                (chunk) => {
                                    streamed += chunk;
                                    stream.next({ type: "token", text: chunk });
                                },
                                { temperature: 0.2, maxTokens: 1200 }
                            );
                            answer = (res.text || streamed).trim() || answer;
                        } catch {
                            // Streaming is a presentation nicety; the buffered
                            // answer is already correct, so fall back to it.
                            stream.next({ type: "token", text: answer });
                        }
                    } else {
                        stream.next({ type: "token", text: answer });
                    }

                    if (references.length) stream.next({ type: "references", references });

                    const stored = await this.conversations.addMessage({
                        conversationId,
                        role: "assistant",
                        content: answer,
                        references,
                        model: result.model,
                    });
                    stream.next({ type: "done", messageId: stored.id });
                    return { answer, references };
                }

                stream.next({ type: "thinking", text: describeTool(call.tool) });
                stream.next({ type: "tool_call", name: call.tool, args: call.args });
                const outcome = await this.tools.run(call.tool, call.args);
                stream.next({ type: "tool_result", name: call.tool, summary: outcome.summary });

                for (const ref of outcome.references) {
                    if (!references.some((r) => r.type === ref.type && r.id === ref.id)) references.push(ref);
                }

                await this.conversations.addMessage({
                    conversationId,
                    role: "tool",
                    toolName: call.tool,
                    toolArgs: call.args,
                    toolResult: { summary: outcome.summary },
                });

                messages.push({ role: "assistant", content: text });
                messages.push({ role: "user", content: renderToolResult(call.tool, outcome.summary, outcome.data) });
            }

            return { answer: "", references };
        } catch (err) {
            const message = `The assistant could not answer: ${(err as Error).message}`;
            this.logger.warn(message);
            stream.next({ type: "error", message });
            await this.conversations.addMessage({ conversationId, role: "assistant", content: message });
            return { answer: message, references: [] };
        }
    }
}

/**
 * Recognise a tool call.
 *
 * Deliberately strict: the object must actually carry a `tool` string. Models
 * sometimes wrap JSON in prose or a fence, which `extractJson` handles, but
 * prose that merely mentions a tool name must not be mistaken for a call.
 */
function parseToolCall(text: string): { tool: string; args: Record<string, unknown> } | null {
    // extractJson *throws* when the text carries no JSON — which is the normal
    // case here, because a finished answer is plain prose. Absence of a tool call
    // is a success path, not an error.
    let parsed: { tool?: unknown; args?: unknown } | null = null;
    try {
        parsed = extractJson<{ tool?: unknown; args?: unknown }>(text);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed.tool !== "string" || !parsed.tool.trim()) return null;
    const args = parsed.args && typeof parsed.args === "object" ? (parsed.args as Record<string, unknown>) : {};
    return { tool: parsed.tool.trim(), args };
}

/** Human phrasing for a tool name, for the thinking trace. */
function describeTool(name: string): string {
    const phrases: Record<string, string> = {
        countEmailConfigs: "Counting your email configurations",
        listEmailConfigs: "Listing your email configurations",
        listMailboxes: "Looking at your mailboxes",
        searchMessages: "Searching your mail",
        getMessage: "Opening that message",
        countSentMessages: "Counting sent mail",
        listJobPostings: "Looking through discovered jobs",
        getJobPosting: "Opening that job posting",
        listCandidates: "Looking at your candidates",
        getCandidate: "Reading that candidate's profile",
        getApplicationHistory: "Checking your application history",
        listDocuments: "Listing generated documents",
        getStorageUsage: "Checking storage",
    };
    return phrases[name] ?? `Looking up ${name}`;
}
