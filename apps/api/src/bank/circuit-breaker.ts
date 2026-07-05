import { OPEN_MS, FAILURE_THRESHOLD } from './bank.constants';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF-OPEN';

export class CircuitBreaker {

    private state: CircuitState = 'CLOSED';
    private openedAt: Date = new Date();
    private failures: number = 0;

    allow(): boolean {


        switch(this.state) {
        case 'CLOSED':
            return true;

        case 'OPEN': 
            {
            const now = new Date();
            if ( (now.getTime() - this.openedAt.getTime()) >= OPEN_MS) {
                this.state = 'HALF-OPEN';  
                return true;
            } else {
                return false;
            }
            }
        case 'HALF-OPEN':
            return false;
        default:
            const _exhaustive: never = this.state;
            throw new Error('Invalid state for CircuitBreaker');
        }
    }

    record(success: boolean): void {

        if (success) {
            this.state = 'CLOSED';
            this.failures = 0;
        } else {
            this.failures++;
            if (this.state === 'HALF-OPEN') {

                this.state = 'OPEN';
                this.openedAt = new Date();
            } else if (this.failures >= FAILURE_THRESHOLD) {

                this.state = 'OPEN';
                this.openedAt = new Date();
            }
        }
    }
}
