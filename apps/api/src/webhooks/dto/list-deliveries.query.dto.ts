import { IsString, IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { webhookStatus } from '../../database/schema';

type WebhookStatus = (typeof webhookStatus.enumValues)[number];

export class ListDeliveriesQueryDto {

    @IsOptional()
    @IsIn(webhookStatus.enumValues)
    status?: WebhookStatus;

    @IsString()
    @IsOptional()
    cursor?: string;

    @Type(() => Number)
    @IsInt()
    @IsOptional()
    @Min(1)
    @Max(100)
    limit: number = 20;

}
