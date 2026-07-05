import {
    Controller,
    Post, Get, Delete,
    Body, HttpCode, Param,
} from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";
import { CreateEndpointDto } from "./dto/create-endpoint.dto";

@Controller('v1/webhook-endpoints')
export class WebhooksController {
    constructor(
        private webhooks: WebhooksService
    ){}

    @Post()
    async create_endpoint(@Body() dto: CreateEndpointDto) {

        // returns the secret — the ONLY response that exposes it
        return await this.webhooks.insert_endpoint(dto.url);
    }

    @Delete(':id')
    @HttpCode(204)
    async delete(@Param('id') id: string) {

        await this.webhooks.delete(id);
    }

    @Get()
    async list() {

        return await this.webhooks.list();
    }
}
