import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { MailsService } from "@/modules/mails/mails.service";
import { StudioStorageService } from "@/modules/ai-studio/services/studio-storage.service";

/**
 * Sends an application through the platform's existing mail pipeline.
 *
 * Deliberately a deliberate act: nothing here is triggered by generation or by
 * the assistant. A human picks the sending address and presses send, because an
 * application email cannot be unsent and the resume attached to it is what an
 * employer will judge.
 */
@Injectable()
export class ApplicationSendService {
    private readonly logger = new Logger(ApplicationSendService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mails: MailsService,
        private readonly storage: StudioStorageService
    ) {}

    async send(params: {
        applicationId: string;
        emailConfigId: string;
        toEmail?: string;
        attachResume?: boolean;
        attachCoverLetter?: boolean;
    }) {
        const application = await this.prisma.jobApplication.findUnique({
            where: { id: params.applicationId },
            include: { posting: true, profile: { select: { id: true, name: true } } },
        });
        if (!application) throw new NotFoundException("Application not found");
        if (application.status === "sent") {
            throw new BadRequestException("This application has already been sent.");
        }

        const to = (params.toEmail ?? application.toEmail ?? "").trim();
        if (!to) {
            throw new BadRequestException(
                "No recipient address. Add one before sending — this posting did not advertise an email."
            );
        }
        if (!application.subject || !application.body) {
            throw new BadRequestException("This draft has no subject or body yet.");
        }

        const config = await this.prisma.emailConfig.findUnique({ where: { id: params.emailConfigId } });
        if (!config) throw new NotFoundException("Email config not found");
        if (!config.isActive) throw new BadRequestException(`"${config.name}" is disabled.`);

        // Pull the documents *now* rather than trusting ids: attaching the wrong
        // resume is the one mistake that cannot be walked back.
        const attachments = await this.collectAttachments(application, params);

        const sent = await this.mails.send(
            null,
            {
                from: config.username,
                to: [to],
                subject: application.subject,
                text: application.body,
            } as never,
            attachments as never,
            {} as never
        );

        const updated = await this.prisma.$transaction(async (tx) => {
            const app = await tx.jobApplication.update({
                where: { id: application.id },
                data: {
                    status: "sent",
                    sentAt: new Date(),
                    toEmail: to,
                    emailConfigId: config.id,
                    sentMessageId: (sent as { id?: string })?.id ?? null,
                },
            });
            // Keep the posting's state honest — history is read from both.
            await tx.jobPosting.update({ where: { id: application.postingId }, data: { status: "applied" } });
            return app;
        });

        this.logger.log(`Application ${application.id} sent to ${to} via ${config.name}`);
        return { application: updated, attachmentCount: attachments.length, via: config.name };
    }

    private async collectAttachments(
        application: { resumeDocumentId: string | null; coverLetterDocumentId: string | null },
        params: { attachResume?: boolean; attachCoverLetter?: boolean }
    ) {
        const ids = [
            params.attachResume !== false ? application.resumeDocumentId : null,
            params.attachCoverLetter ? application.coverLetterDocumentId : null,
        ].filter((id): id is string => Boolean(id));

        const attachments: Array<{ originalname: string; buffer: Buffer; mimetype: string; size: number }> = [];

        for (const id of ids) {
            const doc = await this.prisma.resumeDocument.findUnique({ where: { id } });
            if (!doc?.storageKey) {
                throw new BadRequestException(
                    "The chosen document has not been generated yet — press Generate before sending."
                );
            }
            const buffer = await this.storage.getBuffer(doc.storageKey);
            attachments.push({
                originalname: doc.fileName ?? "resume.pdf",
                buffer,
                mimetype: "application/pdf",
                size: buffer.length,
            });
        }

        return attachments;
    }

    /** Application history, for the person page and the applications list. */
    async history(profileId?: string) {
        const rows = await this.prisma.jobApplication.findMany({
            where: profileId ? { profileId } : {},
            orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
            take: 100,
            include: {
                posting: { select: { id: true, title: true, company: true, url: true } },
                profile: { select: { id: true, name: true } },
            },
        });

        // Resolve the two pinned documents per application so the UI can link
        // straight to what actually went out.
        const docIds = rows.flatMap((r) => [r.resumeDocumentId, r.coverLetterDocumentId]).filter(Boolean) as string[];
        const docs = docIds.length
            ? await this.prisma.resumeDocument.findMany({
                  where: { id: { in: docIds } },
                  select: { id: true, title: true, kind: true, fileName: true, pageCount: true },
              })
            : [];
        const byId = new Map(docs.map((d) => [d.id, d]));

        const configIds = rows.map((r) => r.emailConfigId).filter(Boolean) as string[];
        const configs = configIds.length
            ? await this.prisma.emailConfig.findMany({
                  where: { id: { in: configIds } },
                  select: { id: true, name: true, username: true },
              })
            : [];
        const configById = new Map(configs.map((c) => [c.id, c]));

        return {
            data: rows.map((r) => ({
                ...r,
                resumeDocument: r.resumeDocumentId ? (byId.get(r.resumeDocumentId) ?? null) : null,
                coverLetterDocument: r.coverLetterDocumentId ? (byId.get(r.coverLetterDocumentId) ?? null) : null,
                emailConfig: r.emailConfigId ? (configById.get(r.emailConfigId) ?? null) : null,
            })),
            total: rows.length,
            sent: rows.filter((r) => r.status === "sent").length,
        };
    }

    /** Pin which generated documents an application should send. */
    async attachDocuments(applicationId: string, body: { resumeDocumentId?: string; coverLetterDocumentId?: string }) {
        const application = await this.prisma.jobApplication.findUnique({ where: { id: applicationId } });
        if (!application) throw new NotFoundException("Application not found");
        return this.prisma.jobApplication.update({
            where: { id: applicationId },
            data: {
                ...(body.resumeDocumentId !== undefined && { resumeDocumentId: body.resumeDocumentId }),
                ...(body.coverLetterDocumentId !== undefined && {
                    coverLetterDocumentId: body.coverLetterDocumentId,
                }),
            },
        });
    }
}
