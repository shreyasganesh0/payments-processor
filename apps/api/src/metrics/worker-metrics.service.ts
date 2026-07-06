import { BREAKER } from '../bank/bank.constants';
import { CircuitBreaker } from '../bank/circuit-breaker';
import { OnModuleInit, Injectable, Inject } from '@nestjs/common';
import { Gauge } from 'prom-client';
import { breakerState } from './worker-metrics';

@Injectable()
export class WorkerMetricsService implements OnModuleInit {
    constructor(@Inject(BREAKER) private readonly breaker: CircuitBreaker) {}

    onModuleInit() {
        const VAL = { 'CLOSED': 0, 'OPEN': 1, 'HALF-OPEN': 2 } as const;
        (breakerState as Gauge<string> & { collect: () => void }).collect = () => {
            breakerState.set(VAL[this.breaker.getState()]);
        };
    }
}
