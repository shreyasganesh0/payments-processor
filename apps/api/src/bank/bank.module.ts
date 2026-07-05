import { Module } from "@nestjs/common";
import { BANK } from './bank.constants';
import { SimulatedBankAdapter } from "./simulated-bank.adapter";

@Module({

    providers: [{ provide: BANK, useClass:SimulatedBankAdapter }],
    exports: [BANK]
})
export class BankModule{}
