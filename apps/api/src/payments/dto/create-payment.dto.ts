import { IsString, IsOptional, IsNotEmpty, Matches, Length } from 'class-validator';

export class CreatePaymentDto {
    

    @IsString()
    @IsNotEmpty()
    customerId!: string;

    @IsString()
    @IsNotEmpty()
    sourceAccount!: string;

    @IsString()
    @IsNotEmpty()
    destinationAccount!: string;

    @IsString()
    @Matches(/^\d+(\.\d{1,2})?$/)
    amount!: string;

    @IsString()
    @IsOptional()
    @Length(3, 3)
    currency?: string;

    @IsString() //not sure if this should be optional
    @IsOptional()
    reference?: string;
}
