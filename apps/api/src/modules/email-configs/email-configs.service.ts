import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { EmailConfig } from "@prisma/client";
import PrismaQueryBuilder, { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateEmailConfigDto } from "@/modules/email-configs/dto/create-email-config.dto";
import { UpdateEmailConfigDto } from "@/modules/email-configs/dto/update-email-config.dto";
import HelperClass from "@/common/HelperClass";
import { ToggleActiveClassDto } from "@/common/toggle-active-class.dto";
import { ApiResponse } from "@/common/api-response";

@Injectable()
export class EmailConfigsService {
    constructor(private readonly prisma: PrismaService) {}

    async create(dto: CreateEmailConfigDto): Promise<any> {
        try {
            const record = await this.prisma.emailConfig.create({
                data: {
                    name: dto.name,
                    host: dto.host,
                    port: dto.port,
                    username: dto.username,
                    password: dto.password,
                    tls: dto.tls ? (dto.tls as Prisma.InputJsonValue) : undefined,
                    requireTLS: dto.requireTLS ?? false,
                    secure: dto.secure ?? false,
                },
            });
            return ApiResponse.success(record, "Email config created successfully");
        } catch (err) {
            this.rethrowUniqueUsername(err);
            throw err;
        }
    }

    async getEmailConfigs(params: BasicQueryParams) {
        const { page, limit, order, orderBy, search, fromDate, toDate, baseUrl, pageName, select } =
            PrismaQueryBuilder.parseParams(params);

        console.log("params", params, "parsed", {
            page,
            limit,
            order,
            orderBy,
            search,
            fromDate,
            toDate,
            baseUrl,
            pageName,
            select,
        });

        const builder = PrismaQueryBuilder.create<EmailConfig>(this.prisma, "emailConfig")
            .select(select)
            .search(search, ["name", "host", "username"])
            .orderBy(orderBy, order);

        if (fromDate) {
            builder.where("createdAt", ">=", fromDate);
        }
        if (toDate) {
            builder.where("createdAt", "<=", toDate);
        }

        return await builder.paginate({ page, limit, baseUrl, pageName });
    }

    async findOne(id: string): Promise<any> {
        const record = await this.assertExists(id);
        return ApiResponse.success(record, "Email config found successfully");
    }

    async update(id: string, dto: UpdateEmailConfigDto): Promise<any> {
        if (
            dto.name === undefined &&
            dto.host === undefined &&
            dto.port === undefined &&
            dto.username === undefined &&
            dto.password === undefined &&
            dto.tls === undefined &&
            dto.requireTLS === undefined &&
            dto.secure === undefined
        ) {
            throw new BadRequestException("At least one field must be provided");
        }

        await this.assertExists(id);

        try {
            const record = await this.prisma.emailConfig.update({
                where: { id },
                data: {
                    ...(dto.name !== undefined ? { name: dto.name } : {}),
                    ...(dto.host !== undefined ? { host: dto.host } : {}),
                    ...(dto.port !== undefined ? { port: dto.port } : {}),
                    ...(dto.username !== undefined ? { username: dto.username } : {}),
                    ...(dto.password !== undefined ? { password: dto.password } : {}),
                    ...(dto.tls !== undefined
                        ? {
                              tls: dto.tls === null ? Prisma.JsonNull : (dto.tls as Prisma.InputJsonValue),
                          }
                        : {}),
                    ...(dto.requireTLS !== undefined ? { requireTLS: dto.requireTLS } : {}),
                    ...(dto.secure !== undefined ? { secure: dto.secure } : {}),
                },
            });
            return ApiResponse.success(record, "Email config updated successfully");
        } catch (err) {
            this.rethrowUniqueUsername(err);
            throw err;
        }
    }

    async remove(id: string): Promise<any> {
        const record = await this.assertExists(id);
        await this.prisma.emailConfig.delete({ where: { id } });
        return ApiResponse.success(record, "Email config deleted successfully");
    }

    private async assertExists(id: string): Promise<EmailConfig> {
        const record = await this.prisma.emailConfig.findUnique({ where: { id } });
        if (!record) throw new NotFoundException("Email config not found");
        return record;
    }

    private rethrowUniqueUsername(err: unknown): void {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            throw new ConflictException("An email config with this username already exists");
        }
    }

    async toggleActive(id: string, body: ToggleActiveClassDto): Promise<any> {
        const record = await this.assertExists(id);
        const isActive = body?.isActive === undefined ? !record.isActive : HelperClass.isTrue(body.isActive);
        const updatedRecord = await this.prisma.emailConfig.update({ where: { id }, data: { isActive } });
        return ApiResponse.success(updatedRecord, "Email config updated successfully");
    }
}
