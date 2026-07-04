import { 
    Controller,
    Post, Get,
    Body, Res, HttpCode, Param, Query, Headers,
    BadRequestException 
} from "@nestjs/common";
import { Response } from 'express';
import { PaymentsService } from "./payments.service";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { ListPaymentsQueryDto } from "./dto/list-payments.query.dto";
import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

@Controller('v1/payments')
export class PaymentsController {
    constructor(
        private payments: PaymentsService
    ){}

    @Post()
    @HttpCode(202)
    async create_payment(
        @Body() dto: CreatePaymentDto,
        @Res({ passthrough: true }) res: Response,
        @Headers('idempotency-key') key: string
    ) {

        if(!key) throw new BadRequestException('Idempotency-Key header required');

        const canonical = canonicalize(dto); //can replace with hand rolled recursion
        const requestHash = createHash('sha256').update(canonical!).digest('hex');

        const payment = await this.payments.insert_txn(dto, key, requestHash);
        res.setHeader("Location", `/v1/payments/${payment.body.id}`);
        return payment.body; 
    }

    @Get(':id')
    async find_one(@Param('id') id: string) {

        return await this.payments.find_one(id);
    }

    @Get()
    async list(@Query() q: ListPaymentsQueryDto) {

        const rows = await this.payments.list(q);
        let nextCursor = null;
        let data = rows;
        if (rows.length === q.limit + 1) {

            nextCursor = rows[rows.length - 2].id;
            data = rows.slice(0, q.limit);
        } 

        return { data: data, nextCursor: nextCursor };
    }
}
