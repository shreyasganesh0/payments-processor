import { Module } from "@nestjs/common";
import { RelayService } from "./relay.service";
import { DatabaseModule } from "../database/database.module";
import { QueueModule } from "../queue/queue.module";

@Module({

    imports: [DatabaseModule, QueueModule],
    providers: [RelayService],
})
export class RelayModule{}
