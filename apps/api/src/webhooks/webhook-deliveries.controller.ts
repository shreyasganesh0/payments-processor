import { Controller, Get, Query } from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";
import { ListDeliveriesQueryDto } from "./dto/list-deliveries.query.dto";

@Controller('v1/webhook-deliveries')
export class WebhookDeliveriesController {
    constructor(
        private webhooks: WebhooksService
    ){}

    @Get()
    async list(@Query() q: ListDeliveriesQueryDto) {

        const rows = await this.webhooks.list_deliveries(q);
        let nextCursor = null;
        let data = rows;
        if (rows.length === q.limit + 1) {

            nextCursor = rows[rows.length - 2].id;
            data = rows.slice(0, q.limit);
        }

        return { data: data, nextCursor: nextCursor };
    }
}
