import { Module } from "@nestjs/common";
import { BANK, BREAKER } from './bank.constants';
import { SimulatedBankAdapter } from "./simulated-bank.adapter";
import { CircuitBreaker } from "./circuit-breaker";

@Module({

    providers: [
        { provide: BANK, useClass: SimulatedBankAdapter },
        { provide: BREAKER, useClass: CircuitBreaker },
    ],
    exports: [BANK, BREAKER]
})
export class BankModule{}
