import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

export interface EntityReference {
    type: string;
    id: string;
    label?: string;
}

/**
 * Studio conversations.
 *
 * Mode is derived from what is attached rather than chosen by the caller: the
 * assistant's capability follows its context, so a conversation with a profile
 * and a posting is a tailoring session whether or not anyone said so.
 */
@Injectable()
export class ConversationService {
    constructor(private readonly prisma: PrismaService) {}

    async list(profileId?: string) {
        const rows = await this.prisma.studioConversation.findMany({
            where: profileId ? { profileId } : {},
            orderBy: { updatedAt: "desc" },
            take: 50,
            include: {
                profile: { select: { id: true, name: true } },
                posting: { select: { id: true, title: true, company: true } },
                _count: { select: { messages: true } },
            },
        });
        // The marker is an internal flag, never something a user should see.
        return rows.map((r) => ({ ...r, title: cleanTitle(r.title) }));
    }

    async getOne(id: string) {
        const conversation = await this.prisma.studioConversation.findUnique({
            where: { id },
            include: {
                messages: { orderBy: { createdAt: "asc" } },
                profile: { select: { id: true, name: true } },
                posting: { select: { id: true, title: true, company: true } },
            },
        });
        if (!conversation) throw new NotFoundException("Conversation not found");
        return { ...conversation, title: cleanTitle(conversation.title) };
    }

    async create(params: { profileId?: string | null; postingId?: string | null; title?: string }) {
        return this.prisma.studioConversation.create({
            data: {
                profileId: params.profileId ?? null,
                postingId: params.postingId ?? null,
                mode: modeFor(params.profileId, params.postingId),
                title: params.title ?? null,
            },
        });
    }

    /** Attach or detach a person/job mid-conversation; mode follows. */
    async setContext(id: string, params: { profileId?: string | null; postingId?: string | null }) {
        const existing = await this.getOne(id);
        const profileId = params.profileId === undefined ? existing.profileId : params.profileId;
        const postingId = params.postingId === undefined ? existing.postingId : params.postingId;
        return this.prisma.studioConversation.update({
            where: { id },
            data: { profileId, postingId, mode: modeFor(profileId, postingId) },
        });
    }

    async addMessage(params: {
        conversationId: string;
        role: "user" | "assistant" | "tool";
        content?: string | null;
        toolName?: string | null;
        toolArgs?: Record<string, unknown> | null;
        toolResult?: Record<string, unknown> | null;
        references?: EntityReference[] | null;
        model?: string | null;
        tokens?: number | null;
    }) {
        const message = await this.prisma.studioMessage.create({
            data: {
                conversationId: params.conversationId,
                role: params.role,
                content: params.content ?? null,
                toolName: params.toolName ?? null,
                toolArgs: (params.toolArgs ?? undefined) as Prisma.InputJsonValue | undefined,
                toolResult: (params.toolResult ?? undefined) as Prisma.InputJsonValue | undefined,
                references: (params.references ?? undefined) as Prisma.InputJsonValue | undefined,
                model: params.model ?? null,
                tokens: params.tokens ?? null,
            },
        });

        // Touch the conversation so the list orders by real activity, and title it
        // from the opening question rather than leaving a wall of "Untitled".
        await this.prisma.studioConversation.update({
            where: { id: params.conversationId },
            data: {
                updatedAt: new Date(),
                ...(params.role === "user" && params.content ? { title: undefined } : {}),
            },
        });

        if (params.role === "user" && params.content) {
            const conversation = await this.prisma.studioConversation.findUnique({
                where: { id: params.conversationId },
                select: { title: true },
            });
            if (!conversation?.title) {
                // A provisional title so the row is never blank; replaced by a
                // proper one once the first exchange is complete.
                await this.prisma.studioConversation.update({
                    where: { id: params.conversationId },
                    data: { title: PROVISIONAL_PREFIX + params.content.slice(0, 70) },
                });
            }
        }

        return message;
    }

    /** Recent turns, oldest first, for feeding back into the model. */
    async history(conversationId: string, limit = 20) {
        const rows = await this.prisma.studioMessage.findMany({
            where: { conversationId, role: { in: ["user", "assistant"] } },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { role: true, content: true },
        });
        return rows
            .reverse()
            .filter((r) => r.content)
            .map((r) => ({ role: r.role as "user" | "assistant", content: r.content as string }));
    }

    /**
     * Replace a provisional title with a real one.
     *
     * Refuses to touch a title the user chose: an assistant that renames your
     * threads behind you is worse than one that names them badly.
     */
    async applyGeneratedTitle(id: string, title: string) {
        const conversation = await this.prisma.studioConversation.findUnique({
            where: { id },
            select: { title: true },
        });
        if (conversation?.title && !conversation.title.startsWith(PROVISIONAL_PREFIX)) return null;
        return this.prisma.studioConversation.update({
            where: { id },
            data: { title: title.trim().slice(0, 120) },
        });
    }

    /** True while the conversation still carries its provisional title. */
    async needsTitle(id: string): Promise<boolean> {
        const conversation = await this.prisma.studioConversation.findUnique({
            where: { id },
            select: { title: true },
        });
        return !conversation?.title || conversation.title.startsWith(PROVISIONAL_PREFIX);
    }

    /** Rename a conversation. Titles are auto-set from the first question, but a
     *  long-running thread deserves a name its owner chose. */
    async rename(id: string, title: string) {
        await this.getOne(id);
        return this.prisma.studioConversation.update({
            where: { id },
            data: { title: title.trim().slice(0, 200) || null },
        });
    }

    async remove(id: string) {
        await this.getOne(id);
        await this.prisma.studioConversation.delete({ where: { id } });
        return { id };
    }
}

/** Marks a title as auto-generated placeholder text, not a user's choice. */
const PROVISIONAL_PREFIX = "\u200b";

function cleanTitle(title: string | null): string | null {
    return title ? title.replace(PROVISIONAL_PREFIX, "") : title;
}

function modeFor(profileId?: string | null, postingId?: string | null): string {
    if (profileId && postingId) return "tailoring";
    if (profileId) return "candidate";
    return "general";
}
