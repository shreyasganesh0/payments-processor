export class BankTimeoutError extends Error {

    constructor(ms: number) { super(`bank call timed out after ${ms}ms`); 
        this.name = 'BankTimeoutError';}
}

export function withTimeout<T>(p: Promise<T>, ms:number): Promise<T> {

    let timer: NodeJS.Timeout;

    const timeout = new Promise<never>((_, reject) =>
        timer = setTimeout(() => reject(new BankTimeoutError(ms)), ms)
    );

    return Promise.race([p, timeout]).finally(() => {clearTimeout(timer);});
}
