import { IsString, IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PAYMENT_STATUS, PaymentStatus } from '@payments/shared';

export class ListPaymentsQueryDto {
    

    @IsOptional()
    @IsIn(PAYMENT_STATUS)
    status?: PaymentStatus;

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
