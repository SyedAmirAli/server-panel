import { Module } from "@nestjs/common";
import { AuthModule } from "@/auth/auth.module";
import { PrismaModule } from "@/prisma/prisma.module";
import { EmailConfigsController } from "@/modules/email-configs/email-configs.controller";
import { EmailConfigsService } from "@/modules/email-configs/email-configs.service";

@Module({
    imports: [PrismaModule, AuthModule],
    controllers: [EmailConfigsController],
    providers: [EmailConfigsService],
    exports: [EmailConfigsService],
})
export class EmailConfigsModule {}
