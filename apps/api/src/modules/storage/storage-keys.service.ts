import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { StorageApiKey } from "@prisma/client";
import type { StorageKeySecretView, StorageKeyView } from "@appszone/shared";
import { PrismaService } from "@/prisma/prisma.service";
import { generateStorageKey, hashApiKey, encryptSecret, decryptSecret } from "@/common/crypto";
import PrismaQueryBuilder, { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { ToggleActiveClassDto } from "@/common/toggle-active-class.dto";
import HelperClass from "@/common/HelperClass";
import { CreateStorageKeyDto } from "@/modules/storage/dto/create-storage-key.dto";
import { UpdateStorageKeyDto } from "@/modules/storage/dto/update-storage-key.dto";

@Injectable()
export class StorageKeysService {
    constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

    private get pepper(): string {
        return this.config.get<string>("API_KEY_PEPPER") ?? "";
    }
    private get encryptionKey(): string {
        return this.config.get<string>("ENCRYPTION_KEY") ?? "";
    }

    private validateScope(dto: CreateStorageKeyDto | UpdateStorageKeyDto): void {
        if (dto.defaultBucketId && dto.allowedBuckets && dto.allowedBuckets.length > 0) {
            if (!dto.allowedBuckets.includes(dto.defaultBucketId)) {
                throw new BadRequestException("defaultBucketId must be one of allowedBuckets");
            }
        }
    }

    async create(dto: CreateStorageKeyDto): Promise<StorageKeySecretView> {
        this.validateScope(dto);
        const { secret, prefix } = generateStorageKey();
        const key = await this.prisma.storageApiKey.create({
            data: {
                name: dto.name,
                keyHash: hashApiKey(secret, this.pepper),
                keyPrefix: prefix,
                keySecret: encryptSecret(secret, this.encryptionKey),
                allowedBuckets: dto.allowedBuckets ?? [],
                defaultBucketId: dto.defaultBucketId ?? null,
                allowedOrigins: dto.allowedOrigins ?? [],
                allowedIps: dto.allowedIps ?? [],
                expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            },
        });
        return this.toSecretView(key, secret);
    }

    async getKeys(params: BasicQueryParams) {
        const { page, limit, order, orderBy, search, baseUrl, pageName, select } =
            PrismaQueryBuilder.parseParams(params);

        return PrismaQueryBuilder.create<StorageApiKey>(this.prisma, "storageApiKey")
            .select(select)
            .search(search, ["name", "keyPrefix"])
            .orderBy(orderBy, order)
            .paginate({ page, limit, baseUrl, pageName })
            .then((result) => ({ ...result, data: result.data.map((row) => this.toView(row as StorageApiKey)) }));
    }

    async update(id: string, dto: UpdateStorageKeyDto): Promise<StorageKeyView> {
        await this.assertExists(id);
        this.validateScope(dto);
        const data: Record<string, unknown> = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.allowedBuckets !== undefined) data.allowedBuckets = dto.allowedBuckets;
        if (dto.defaultBucketId !== undefined) data.defaultBucketId = dto.defaultBucketId || null;
        if (dto.allowedOrigins !== undefined) data.allowedOrigins = dto.allowedOrigins;
        if (dto.allowedIps !== undefined) data.allowedIps = dto.allowedIps;
        if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

        if (Object.keys(data).length === 0) throw new BadRequestException("No fields to update");
        const key = await this.prisma.storageApiKey.update({ where: { id }, data });
        return this.toView(key);
    }

    async refresh(id: string): Promise<StorageKeySecretView> {
        await this.assertExists(id);
        const { secret, prefix } = generateStorageKey();
        const key = await this.prisma.storageApiKey.update({
            where: { id },
            data: {
                keyHash: hashApiKey(secret, this.pepper),
                keyPrefix: prefix,
                keySecret: encryptSecret(secret, this.encryptionKey),
            },
        });
        return this.toSecretView(key, secret);
    }

    async remove(id: string): Promise<StorageKeyView> {
        const key = await this.assertExists(id);
        await this.prisma.storageApiKey.delete({ where: { id } });
        return this.toView(key);
    }

    async toggleActive(id: string, dto: ToggleActiveClassDto): Promise<StorageKeyView> {
        const key = await this.assertExists(id);
        const isActive = dto?.isActive === undefined ? !key.isActive : HelperClass.isTrue(dto.isActive);
        const updated = await this.prisma.storageApiKey.update({ where: { id }, data: { isActive } });
        return this.toView(updated);
    }

    /** Look up an active, unexpired key by its plaintext secret (used by the guard). */
    async findActiveBySecret(secret: string): Promise<StorageApiKey | null> {
        const key = await this.prisma.storageApiKey.findUnique({
            where: { keyHash: hashApiKey(secret, this.pepper) },
        });
        if (!key || !key.isActive) return null;
        if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null;
        return key;
    }

    touch(id: string): void {
        void this.prisma.storageApiKey
            .update({ where: { id }, data: { lastUsedAt: new Date() } })
            .catch(() => undefined);
    }

    private async assertExists(id: string): Promise<StorageApiKey> {
        const key = await this.prisma.storageApiKey.findUnique({ where: { id } });
        if (!key) throw new NotFoundException("Storage API key not found");
        return key;
    }

    private decryptKeySecret(k: StorageApiKey): string | null {
        if (!k.keySecret) return null;
        try {
            return decryptSecret(k.keySecret, this.encryptionKey);
        } catch {
            return null;
        }
    }

    private toView(k: StorageApiKey): StorageKeyView {
        return {
            id: k.id,
            name: k.name,
            keyPrefix: k.keyPrefix,
            secret: this.decryptKeySecret(k),
            isActive: k.isActive,
            allowedBuckets: (k.allowedBuckets as string[]) ?? [],
            defaultBucketId: k.defaultBucketId,
            allowedOrigins: (k.allowedOrigins as string[]) ?? [],
            allowedIps: (k.allowedIps as string[]) ?? [],
            expiresAt: k.expiresAt?.toISOString() ?? null,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        };
    }

    private toSecretView(k: StorageApiKey, secret: string): StorageKeySecretView {
        return { ...this.toView(k), secret };
    }
}
