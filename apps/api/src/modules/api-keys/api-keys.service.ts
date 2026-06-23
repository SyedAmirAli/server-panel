import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiKey } from "@prisma/client";
import type { ApiKeyView, ApiKeySecretView } from "@appszone/shared";
import { PrismaService } from "@/prisma/prisma.service";
import { generateApiKey, hashApiKey, encryptSecret, decryptSecret } from "@/common/crypto";
import { CreateApiKeyDto } from "@/modules/api-keys/dto/create-api-key.dto";
import { UpdateApiKeyDto } from "@/modules/api-keys/dto/update-api-key.dto";
import PrismaQueryBuilder, { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { ToggleActiveClassDto } from "@/common/toggle-active-class.dto";
import HelperClass from "@/common/HelperClass";

@Injectable()
export class ApiKeysService {
    constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

    private get pepper(): string {
        return this.config.get<string>("API_KEY_PEPPER") ?? "";
    }

    private get encryptionKey(): string {
        return this.config.get<string>("ENCRYPTION_KEY") ?? "";
    }

    async create(dto: CreateApiKeyDto): Promise<ApiKeySecretView> {
        const { secret, prefix } = generateApiKey();
        const key = await this.prisma.apiKey.create({
            data: {
                name: dto.name,
                keyHash: hashApiKey(secret, this.pepper),
                keyPrefix: prefix,
                keySecret: encryptSecret(secret, this.encryptionKey),
                allowedFrom: dto.allowedFrom ?? [],
            },
        });
        return this.toSecretView(key, secret);
    }

    async getApiKeys(params: BasicQueryParams) {
        const { page, limit, order, orderBy, search, fromDate, toDate, baseUrl, pageName, select } =
            PrismaQueryBuilder.parseParams(params);

        const builder = PrismaQueryBuilder.create<ApiKey>(this.prisma, "apiKey")
            .select(select)
            .search(search, ["name", "keyPrefix"])
            .orderBy(orderBy, order);

        if (fromDate) {
            builder.where("createdAt", ">=", fromDate);
        }
        if (toDate) {
            builder.where("createdAt", "<=", toDate);
        }

        return builder.paginate({ page, limit, baseUrl, pageName }).then((result) => ({
            ...result,
            data: result.data.map((row) => this.toView(row as ApiKey)),
        }));
    }

    async updateApiKey(id: string, dto: UpdateApiKeyDto): Promise<ApiKeyView> {
        if (dto.name === undefined && dto.allowedFrom === undefined) {
            throw new BadRequestException("At least one of name or allowedFrom must be provided");
        }

        await this.assertExists(id);

        const key = await this.prisma.apiKey.update({
            where: { id },
            data: {
                ...(dto.name !== undefined ? { name: dto.name } : {}),
                ...(dto.allowedFrom !== undefined ? { allowedFrom: dto.allowedFrom } : {}),
            },
        });

        return this.toView(key);
    }

    async refreshApiKey(id: string): Promise<ApiKeySecretView> {
        await this.assertExists(id);

        const { secret, prefix } = generateApiKey();
        const key = await this.prisma.apiKey.update({
            where: { id },
            data: {
                keyHash: hashApiKey(secret, this.pepper),
                keyPrefix: prefix,
                keySecret: encryptSecret(secret, this.encryptionKey),
            },
        });

        return this.toSecretView(key, secret);
    }

    async deleteApiKey(id: string): Promise<ApiKeyView> {
        const key = await this.assertExists(id);
        await this.prisma.apiKey.delete({ where: { id } });
        return this.toView(key);
    }

    async toggleActiveApiKey(id: string, dto: ToggleActiveClassDto): Promise<ApiKeyView> {
        const key = await this.assertExists(id);
        const isActive = dto?.isActive === undefined ? !key.isActive : HelperClass.isTrue(dto.isActive);

        const updatedKey = await this.prisma.apiKey.update({
            where: { id },
            data: { isActive },
        });

        return this.toView(updatedKey);
    }

    /** Look up an active key by its plaintext secret (used by the guard). */
    async findActiveBySecret(secret: string): Promise<ApiKey | null> {
        const key = await this.prisma.apiKey.findUnique({
            where: { keyHash: hashApiKey(secret, this.pepper) },
        });
        return key && key.isActive ? key : null;
    }

    touch(id: string): void {
        // Fire-and-forget: don't block the request on the lastUsedAt write.
        void this.prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    }

    private async assertExists(id: string): Promise<ApiKey> {
        const key = await this.prisma.apiKey.findUnique({ where: { id } });
        if (!key) throw new NotFoundException("API key not found");
        return key;
    }

    private decryptKeySecret(k: ApiKey): string | null {
        if (!k.keySecret) return null;
        try {
            return decryptSecret(k.keySecret, this.encryptionKey);
        } catch {
            return null;
        }
    }

    private toView(k: ApiKey): ApiKeyView {
        return {
            id: k.id,
            name: k.name,
            keyPrefix: k.keyPrefix,
            secret: this.decryptKeySecret(k),
            isActive: k.isActive,
            allowedFrom: (k.allowedFrom as string[]) ?? [],
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        };
    }

    private toSecretView(k: ApiKey, secret: string): ApiKeySecretView {
        return { ...this.toView(k), secret };
    }
}
