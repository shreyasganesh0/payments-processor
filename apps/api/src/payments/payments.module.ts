
import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { DatabaseModule } from "../database/database.module";

@Module({

    imports: [DatabaseModule],
    providers: [PaymentsService],
    controllers: [PaymentsController]
})
export class PaymentsModule{}
