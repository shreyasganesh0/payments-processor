export interface BankAuthorizeRequest {

    paymentId: string;
    amountCents: number;
    currency: string;
    idempotencyKey: string;
}

export type BankOutcome =
    | { status: 'authorized'; bankRef: string }
    | { status: 'declined'; reason: string }
    | { status: 'error'; retryable: true; reason: string };

export interface BankPort {
    authorize(req: BankAuthorizeRequest): Promise<BankOutcome>;
}
