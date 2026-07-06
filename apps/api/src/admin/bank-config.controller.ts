import { Controller, Get, Put, Body } from "@nestjs/common";
import { BankConfigService } from "./bank-config.service";
import { UpdateBankConfigDto } from "./dto/update-bank-config.dto";

@Controller('v1/admin/bank-config')
export class BankConfigController {
    constructor(
        private bankConfig: BankConfigService
    ){}

    @Get()
    async get() {

        return await this.bankConfig.get();
    }

    @Put()
    async update(@Body() dto: UpdateBankConfigDto) {

        return await this.bankConfig.update(dto);
    }
}
