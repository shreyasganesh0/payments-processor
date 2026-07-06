// The canonical valid payment request body (matches CreatePaymentDto: amount is
// a decimal STRING — money is parsed to integer cents once, at the API boundary).
// Override any field to build the malformed variants the validation tests need.
export interface PaymentInput {
  customerId: string;
  sourceAccount: string;
  destinationAccount: string;
  amount: string;
  reference?: string;
  currency?: string;
}

export function aValidPayment(overrides: Partial<PaymentInput> = {}): PaymentInput {
  return {
    customerId: 'C-E2E',
    sourceAccount: 'VA10001',
    destinationAccount: 'EXT98765',
    amount: '250.00',
    reference: `E2E-${Date.now()}`,
    ...overrides,
  };
}
