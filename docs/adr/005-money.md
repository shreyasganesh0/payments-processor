# ADR-005: Money representation

## Context
Floating point arithmetic is imprecise and unacceptable for money transactions.
Need to represent it as the smallest currency units integer.

## Options
- Integer minor units: store the amounts in the DB as smallest unit BIGINT
- Store in DB as Numeric then convert using decimal.js per transactions

## Decision
- Will store as BIGINT amount of smallest form of currency (cents)

## Consequences
- have to take care to use string parsing instead of float for conversions
- parsing efficiency should only occur at the API boundary to avoid precision loss
- cents are JS number (not bigint), bounded to Number.MAX_SAFE_INTEGER → max ≈ $90T, enforced by a Number.isSafeInteger guard
