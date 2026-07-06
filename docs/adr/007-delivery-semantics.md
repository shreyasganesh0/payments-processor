# ADR-007: Delivery semantics

## Context
payment must produce exactly one bank charge but every hop can retry and any process
can crash.

## Decision
- correctness maintained by at-least-once semantics
    - db row is the source of truth and queue is the trigger allows for queue to
    retry as many times as it wants and only do jobs that haven't been recorded as 
    completed
    - canTransition FSM + select.for(update) query allows for idempotency in updates
        - if a duplicate arrives it must wait until the fsm for one transitions
        - it is then blocked by the fsm logic post the transition caused by one
    - per payment idempotency bank key
        - provided by the bank so even duplicates that reach the bank charges only once 

## Failure Windows
- if there is a crash b/n PROCESSING claim and finalize a processing claim can be stranded
- if there is a crash b/n RETRYING commit and adding back to the queue it can be stuck in RETRYING state
    - these 2 happens because we choose dual-write over 2PC

## Solution
- we have a periodic reaper process based on some deadline (updated_at) that re enqueues
stale records as jobs for processing

## Consequences
- bank must support idempotency keys (real ACH providers do) 
- reaper adds latency recovery thats bounded
- per payment ordering not guaranteed
