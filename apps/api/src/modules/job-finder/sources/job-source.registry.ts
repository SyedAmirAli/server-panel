import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { JobSourceAdapter } from "@/modules/job-finder/sources/job-source.types";
import { RemotiveSource } from "@/modules/job-finder/sources/remotive.source";
import { RemoteOkSource } from "@/modules/job-finder/sources/remoteok.source";
import { ArbeitnowSource } from "@/modules/job-finder/sources/arbeitnow.source";
import { JobicySource } from "@/modules/job-finder/sources/jobicy.source";
import { AdzunaSource } from "@/modules/job-finder/sources/adzuna.source";
import { UrlImportSource } from "@/modules/job-finder/sources/url-import.source";
import { LinkedInEmailSource } from "@/modules/job-finder/sources/linkedin-email.source";

/**
 * Holds the adapter instances and keeps the `job_sources` table in step with
 * them.
 *
 * On boot every adapter is upserted as a row so the UI has something to toggle;
 * `isActive` and `config` are admin-owned and never overwritten by a later boot.
 */
@Injectable()
export class JobSourceRegistry implements OnModuleInit {
    private readonly logger = new Logger(JobSourceRegistry.name);
    private readonly adapters: JobSourceAdapter[];

    constructor(
        private readonly prisma: PrismaService,
        remotive: RemotiveSource,
        remoteOk: RemoteOkSource,
        arbeitnow: ArbeitnowSource,
        jobicy: JobicySource,
        adzuna: AdzunaSource,
        urlImport: UrlImportSource,
        linkedInEmail: LinkedInEmailSource
    ) {
        this.adapters = [remotive, remoteOk, arbeitnow, jobicy, adzuna, urlImport, linkedInEmail];
    }

    async onModuleInit(): Promise<void> {
        await this.syncSourceRows();
    }

    all(): JobSourceAdapter[] {
        return this.adapters;
    }

    get(key: string): JobSourceAdapter | undefined {
        return this.adapters.find((adapter) => adapter.key === key);
    }

    /**
     * Create a row for any adapter that lacks one and refresh the
     * credential-readiness flag (env vars can change between boots).
     */
    private async syncSourceRows(): Promise<void> {
        for (const adapter of this.adapters) {
            const ready = adapter.isReady();

            await this.prisma.jobSource.upsert({
                where: { key: adapter.key },
                // Only provenance/readiness is refreshed — the admin owns isActive and config.
                update: {
                    name: adapter.name,
                    adapter: adapter.key,
                    requiresCredentials: adapter.requiresCredentials,
                    credentialsReady: ready,
                },
                create: {
                    key: adapter.key,
                    name: adapter.name,
                    adapter: adapter.key,
                    requiresCredentials: adapter.requiresCredentials,
                    credentialsReady: ready,
                    // Credentialed and on-demand adapters start off; boards start on.
                    isActive: !adapter.requiresCredentials && adapter.key !== "url-import",
                    config: {},
                },
            });
        }

        const pending = this.adapters.filter((a) => a.requiresCredentials && !a.isReady());
        if (pending.length) {
            this.logger.log(
                `Job sources awaiting credentials: ${pending.map((a) => a.name).join(", ")} — they stay disabled until set.`
            );
        }
    }
}
