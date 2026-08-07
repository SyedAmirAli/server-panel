import { PartialType } from "@nestjs/swagger";
import { CreateMailboxDto } from "@/modules/mailboxes/dto/create-mailbox.dto";

export class UpdateMailboxDto extends PartialType(CreateMailboxDto) {}
