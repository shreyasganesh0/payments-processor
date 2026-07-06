import { IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { bankMode } from '../../database/schema';

type BankMode = (typeof bankMode.enumValues)[number];

export class UpdateBankConfigDto {

    @IsOptional()
    @IsIn(bankMode.enumValues)
    mode?: BankMode;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(30000)
    latencyMs?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    failN?: number;

}
