import { Type } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsEmail,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from "class-validator";

const LINK_KINDS = ["linkedin", "github", "portfolio", "other"] as const;

export class CreatePersonDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(191)
    name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    headline?: string;

    /** Not @IsEmail-strict on purpose — some CVs carry an obfuscated address. */
    @IsOptional()
    @IsString()
    @MaxLength(191)
    email?: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    phone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(191)
    location?: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    timezone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    availability?: string;

    @IsOptional()
    @IsString()
    summary?: string;

    /** Free-form "about me" — context for the Studio chat, never printed verbatim. */
    @IsOptional()
    @IsString()
    bio?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(20)
    titles?: string[];

    /** What this person is actually targeting, which is not always the CV headline. */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(20)
    preferredTitles?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(30)
    certifications?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(30)
    languages?: string[];
}

export class UpdatePersonDto extends CreatePersonDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(191)
    declare name: string;
}

/* ─── links ──────────────────────────────────────────────────── */

export class UpsertLinkDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    label!: string;

    @IsUrl({ require_protocol: true }, { message: "url must include http:// or https://" })
    @MaxLength(2000)
    url!: string;

    @IsOptional()
    @IsIn(LINK_KINDS)
    kind?: (typeof LINK_KINDS)[number];

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}

/* ─── projects ───────────────────────────────────────────────── */

export class UpsertProjectDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(191)
    name!: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    @MaxLength(191)
    role?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    period?: string;

    /**
     * Required, and required to be non-empty: the stack is the ranking key the
     * tailoring engine sorts on. A project with no tags can never be matched to
     * a job, so accepting one silently would make it invisible.
     */
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(40)
    stack!: string[];

    @IsOptional()
    @IsArray()
    metrics?: Array<[string, string]>;

    @IsOptional()
    @IsString()
    note?: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    url?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

/* ─── experience ─────────────────────────────────────────────── */

export class UpsertExperienceDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(191)
    company!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(191)
    position!: string;

    /** Stored verbatim — never recomputed into a new duration. */
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    period!: string;

    @IsOptional()
    @IsString()
    @MaxLength(191)
    location?: string;

    /** Part-time stays part-time in every generated document. */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    employmentType?: string;

    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(30)
    points!: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(40)
    stack?: string[];

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

/* ─── education ──────────────────────────────────────────────── */

export class UpsertEducationDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(191)
    institution!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(191)
    degree!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    period!: string;

    @IsOptional()
    @IsString()
    @MaxLength(191)
    location?: string;

    @IsOptional()
    @IsString()
    note?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

/* ─── skills ─────────────────────────────────────────────────── */

export class UpsertSkillDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    category?: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    level?: string;

    @IsOptional()
    @IsBoolean()
    highlighted?: boolean;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}

/** Bulk skill entry — typing skills one request at a time is unusable in practice. */
export class BulkSkillsDto {
    @IsArray()
    @ArrayMaxSize(200)
    @ValidateNested({ each: true })
    @Type(() => UpsertSkillDto)
    skills!: UpsertSkillDto[];
}

/* ─── ordering ───────────────────────────────────────────────── */

export class ReorderDto {
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(200)
    ids!: string[];
}

/* ─── list query ─────────────────────────────────────────────── */

export class ListPeopleQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(191)
    search?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    offset?: number;
}
