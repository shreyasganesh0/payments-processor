export const PAYMENT_STATUS = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "RETRYING"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

const transitionMap = {
    PENDING: ["PROCESSING"],
    PROCESSING: ["COMPLETED", "FAILED", "RETRYING"],
    RETRYING: ["PROCESSING"],
    COMPLETED: [],
    FAILED: [], 
} as const satisfies Record<PaymentStatus, readonly PaymentStatus[]>;

type ValidTransitions<S extends PaymentStatus> = (typeof transitionMap)[S][number];

const transitionSets = Object.fromEntries(
  Object.entries(transitionMap).map(
      ([state, targets]) => [state, new Set(targets as readonly string[])]
  )
) as { [K in PaymentStatus]: Set<PaymentStatus> };

export function canTransition<F extends PaymentStatus>(
    from: F, 
    to: PaymentStatus
): to is ValidTransitions<F> {
  return transitionSets[from].has(to);
}

export function convAmountToUnits(amount: string): number {

    if (amount.length > 20) throw new Error("Amount input string too long");
    const match = amount.match(/^(\d+)(?:\.(\d{1,2}))?$/);

    if (!match) throw new Error(`Invalid amount string format: ${amount}`); 

    const [, dollars, cents] = match;

    const padCents = (cents ?? '').padEnd(2, '0');

    const res = (Number(dollars) * 100 + Number(padCents));

    if (!Number.isSafeInteger(res)) throw new Error(`Amount exceeds safe int range: ${amount}`);

    return res;

}

export function convUnitsToAmount(cents: number): string {

    if (!Number.isInteger(cents)) throw new Error("Cents number must be integer");

    const val = Math.abs(cents);
    const dollars = Math.floor(val / 100);

    const rem = val % 100;

    return `${dollars}.${rem.toString().padStart(2, '0')}`;
}
