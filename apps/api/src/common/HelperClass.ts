import { ApiQuery } from "@nestjs/swagger";
import { bool, BOOL } from "./prisma-query-builder.service";
import { applyDecorators } from "@nestjs/common";

export default class HelperClass {
    static isBoolean(value: unknown): boolean {
        return BOOL.includes(String(value).toLowerCase() as bool);
    }

    static isTrue(value: unknown): boolean {
        if (!value || value === undefined || value === null) return false;
        if (typeof value === "boolean") return value;
        return ["true", "yes", "1", "on", "active", "enabled", "true", "on"].includes(String(value).toLowerCase());
    }

    static paginatedQueryDocs(options?: { orderByExample?: string }): MethodDecorator {
        return applyDecorators(
            ApiQuery({ name: "page", required: false, type: Number, example: 1 }),
            ApiQuery({ name: "limit", required: false, type: Number, example: 20 }),
            ApiQuery({
                name: "orderBy",
                required: false,
                type: String,
                example: options?.orderByExample ?? "createdAt",
            }),
            ApiQuery({ name: "order", required: false, enum: ["asc", "desc"], example: "desc" }),
            ApiQuery({ name: "search", required: false, type: String }),
            ApiQuery({ name: "fromDate", required: false, type: String, example: "2026-01-01" }),
            ApiQuery({ name: "toDate", required: false, type: String, example: "2026-12-31" }),
            ApiQuery({
                name: "select",
                required: false,
                type: String,
                description: "Comma-separated fields to return",
            })
        );
    }

    static toJson(data: unknown, array: boolean = false): any {
        if (!data || data === null || data === undefined) return {};
        if (typeof data === "object") {
            if (!array && Array.isArray(data)) return {};
            return data;
        }

        if (typeof data === "string") {
            try {
                const json = JSON.parse(data);
                if (!array && Array.isArray(json)) return {};
                return json;
            } catch {
                return {};
            }
        }
        return {};
    }
}
