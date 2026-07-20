import { PartialType } from "@nestjs/swagger";
import { CreateStorageKeyDto } from "@/modules/storage/dto/create-storage-key.dto";

export class UpdateStorageKeyDto extends PartialType(CreateStorageKeyDto) {}
