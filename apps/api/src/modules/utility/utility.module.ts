import { Module } from "@nestjs/common";
import { AuthModule } from "@/auth/auth.module";
import { PrismaModule } from "@/prisma/prisma.module";
import { UtilityController } from "./utility.controller";
import { UtilityService } from "./utility.service";

@Module({
    imports: [PrismaModule, AuthModule],
    controllers: [UtilityController],
    providers: [UtilityService],
    exports: [UtilityService],
})
export class UtilityModule {}
