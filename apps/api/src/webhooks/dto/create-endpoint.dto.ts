import { IsUrl, IsOptional, IsString } from 'class-validator';

export class CreateEndpointDto {

    @IsUrl()
    url!: string;

    @IsString()
    @IsOptional()
    description?: string;
}
