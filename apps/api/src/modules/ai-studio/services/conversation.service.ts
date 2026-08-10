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
        return this.prisma.studioConversation.findMany({
            where: profileId ? { profileId } : {},
            orderBy: { updatedAt: "desc" },
            take: 50,
            include: {
                profile: { select: { id: true, name: true } },
                posting: { select: { id: true, title: true, company: true } },
                _count: { select: { messages: true } },
            },
        });
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
        return conversation;
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
                await this.prisma.studioConversation.update({
                    where: { id: params.conversationId },
                    data: { title: params.content.slice(0, 80) },
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

function modeFor(profileId?: string | null, postingId?: string | null): string {
    if (profileId && postingId) return "tailoring";
    if (profileId) return "candidate";
    return "general";
}
