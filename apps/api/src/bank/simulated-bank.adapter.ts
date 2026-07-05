import { BankPort, BankAuthorizeRequest, BankOutcome } from './bank.types';
import { Injectable } from '@nestjs/common';

type BankMode = 'always_authorize' | 'always_decline' | 'always_error' | 'fail_n_then_authorize'; // config for simulation states

@Injectable()
export class SimulatedBankAdapter implements BankPort {

    private mode: BankMode = 'always_authorize';
    private failCount: number = 0;
    private failN: number = 2;
    private latencyMs: number = 200;
    private readonly store = new Map<string, BankOutcome>();
    private charges = 0;

    getCharges(): number {
        return this.charges;
    }


    async authorize(req: BankAuthorizeRequest): Promise<BankOutcome> {

        await new Promise(res => setTimeout(res, this.latencyMs)); //sim latency
        const bankRef = `bank_${req.idempotencyKey}`;

        if (this.store.has(req.idempotencyKey)) return this.store.get(req.idempotencyKey)!;
        switch(this.mode) {

            case 'always_authorize': 
                this.charges++;
                const outcome: BankOutcome = { status:'authorized', bankRef: bankRef};
                this.store.set(req.idempotencyKey, outcome);
                return outcome;

            case 'always_decline':
                return { status:'declined', reason:'insufficient_funds'};

            case 'always_error':
                return { status:'error', retryable:true, reason:'bank_unavailable' };
            case 'fail_n_then_authorize': 
                {
                if (this.failCount < this.failN) { 
                    this.failCount++;
                    return { status:'error', retryable:true, reason:'bank_unavailable' }; 
                } else {
                    this.failCount = 0;
                    this.charges++;
                    const outcome: BankOutcome = { status:'authorized', bankRef: bankRef};
                    this.store.set(req.idempotencyKey, outcome);
                    return outcome; 
                }
                }
            default:
                {
                const _exhaustive: never = this.mode;
                throw new Error(`Unhandled status: ${this.mode}`);
                }
        }
    }

    setConfig(partial: Partial<{mode: BankMode; failN: number; latencyMs: number}>) {

        if (partial.mode !== undefined) { this.mode = partial.mode; this.failCount = 0; }
        if (partial.failN !== undefined) this.failN = partial.failN;
        if (partial.latencyMs !== undefined) this.latencyMs = partial.latencyMs
    }
}
