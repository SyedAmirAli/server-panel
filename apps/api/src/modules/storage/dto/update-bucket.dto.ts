import { PartialType } from "@nestjs/swagger";
import { CreateBucketDto } from "@/modules/storage/dto/create-bucket.dto";

/** All fields optional; credentials are only re-encrypted when both keys are supplied. */
export class UpdateBucketDto extends PartialType(CreateBucketDto) {}
