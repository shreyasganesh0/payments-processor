import { BASE_MS, CAP_MS } from './worker.constants';

export function computeBackoffMs(attempt: number): number {

    if (attempt < 1) throw new Error(`Non Positive attempt number passed (<=0)`);

    const exp = Math.min(BASE_MS * 2 ** (attempt - 1), CAP_MS);
    return exp / 2 + Math.random() * (exp /2 );
}
