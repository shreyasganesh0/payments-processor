import { Module } from "@nestjs/common";
import { BankConfigController } from "./bank-config.controller";
import { BankConfigService } from "./bank-config.service";
import { DatabaseModule } from "../database/database.module";

@Module({

    imports: [DatabaseModule],
    providers: [BankConfigService],
    controllers: [BankConfigController]
})
export class AdminModule{}
