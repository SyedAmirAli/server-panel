import { Injectable, Logger } from "@nestjs/common";
import { Subject } from "rxjs";
import { PrismaService } from "@/prisma/prisma.service";
import { LlmService, extractJson } from "@/modules/job-finder/llm/llm.service";
import { ConversationService } from "@/modules/ai-studio/services/conversation.service";
import { StudioToolsService, type EntityReference } from "@/modules/ai-studio/services/studio-tools.service";
import { buildAssistantPrompt, renderToolResult } from "@/modules/ai-studio/prompts/assistant.prompt";
import type { ChatMessage } from "@/modules/job-finder/llm/llm.types";

export type StudioStreamEvent =
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

        const system = buildAssistantPrompt({
            tools: this.tools.definitions,
            profileName: conversation.profile?.name ?? null,
            postingLabel: conversation.posting ? `${conversation.posting.title} at ${conversation.posting.company}` : null,
        });

        const history = await this.conversations.history(conversationId, 12);
        const messages: ChatMessage[] = [
            { role: "system", content: system },
            ...history.map((h) => ({ role: h.role, content: h.content }) as ChatMessage),
        ];

        const references: EntityReference[] = [];

        try {
            for (let step = 0; step <= MAX_TOOL_STEPS; step++) {
                const result = await this.llm.complete(messages, { temperature: 0.2, maxTokens: 1200 });
                const text = (result.text ?? "").trim();
                const call = parseToolCall(text);

                if (!call || step === MAX_TOOL_STEPS) {
                    // Either a plain answer, or we have spent the tool budget and
                    // must give the user whatever we have rather than looping.
                    const answer = call
                        ? "I could not finish looking that up — try narrowing the question."
                        : text || "I could not produce an answer.";
                    stream.next({ type: "token", text: answer });
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
