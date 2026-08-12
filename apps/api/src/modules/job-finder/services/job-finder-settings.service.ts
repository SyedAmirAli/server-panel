import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { UpdateJobFinderSettingsDto } from "@/modules/job-finder/dto/update-settings.dto";

/** Single-row settings for the module: schedule, window, thresholds, models. */
@Injectable()
export class JobFinderSettingsService {
    constructor(private readonly prisma: PrismaService) {}

    /** Reads the settings row, creating it with defaults on first access. */
    async get() {
        return this.prisma.jobFinderSetting.upsert({
            where: { id: "default" },
            update: {},
            create: { id: "default" },
        });
    }

    async update(dto: UpdateJobFinderSettingsDto) {
        await this.get(); // guarantee the row exists before updating it
        return this.prisma.jobFinderSetting.update({
            where: { id: "default" },
            data: {
                ...(dto.cronEnabled !== undefined && { cronEnabled: dto.cronEnabled }),
                ...(dto.cronExpression !== undefined && { cronExpression: dto.cronExpression }),
                ...(dto.lookbackHours !== undefined && { lookbackHours: dto.lookbackHours }),
                ...(dto.minStars !== undefined && { minStars: dto.minStars }),
                ...(dto.maxJobsPerRun !== undefined && { maxJobsPerRun: dto.maxJobsPerRun }),
                ...(dto.scoringModel !== undefined && { scoringModel: dto.scoringModel }),
                ...(dto.writingModel !== undefined && { writingModel: dto.writingModel }),
                ...(dto.extractionModel !== undefined && { extractionModel: dto.extractionModel }),
                ...(dto.keywords !== undefined && { keywords: dto.keywords }),
                ...(dto.locations !== undefined && { locations: dto.locations }),
                ...(dto.excludeCompanies !== undefined && { excludeCompanies: dto.excludeCompanies }),
                ...(dto.activeProfileId !== undefined && { activeProfileId: dto.activeProfileId }),
            },
        });
    }

    /** Convenience accessors used by the runner — always returns real arrays. */
    async resolved() {
        const settings = await this.get();
        return {
            ...settings,
            keywords: asStringArray(settings.keywords),
            locations: asStringArray(settings.locations),
            excludeCompanies: asStringArray(settings.excludeCompanies),
        };
    }
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string" && Boolean(v.trim())).map((v) => v.trim());
}
