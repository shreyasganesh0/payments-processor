import { Module } from "@nestjs/common";
import { config } from '../config';
import { selectProvider } from '../common/provider-registry';
import { BANK, BREAKER } from './bank.constants';
import { SimulatedBankAdapter } from "./simulated-bank.adapter";
import { CircuitBreaker } from "./circuit-breaker";

// BANK_ADAPTER (config.bank.adapter) selects the implementation. To add a real
// adapter later: implement BankPort, add its key here + to BANK_ADAPTERS in
// config.ts, and set BANK_ADAPTER — nothing that injects BANK changes.
const BANK_REGISTRY = { simulated: SimulatedBankAdapter };

@Module({

    providers: [
        selectProvider(BANK, BANK_REGISTRY, config.bank.adapter),
        { provide: BREAKER, useClass: CircuitBreaker },
    ],
    exports: [BANK, BREAKER]
})
export class BankModule{}
