# ADR-003: Transactional outbox

## Context
transactions across two systems can cause dual writes. In our case jobs to the queue
must be submitted durably while the payment being recorded durably.

## Options
- Direct publish to queue after commit
    - two writes needed one to postgres and one to the queue
    - a crash between anywhere can cause failed events or phantom writes
- table as a queue
    - using the same table for payment record and a field that is polled to submit jobs
    - very clumsy would need to implement retries backoff and have a lot of bookkeeping fields
    - multiple fan out needed for webhooks from other notification systems
    - can only represent single lifecycle events
- CDC 
    - tail the WAL for events instead of having another table 
    - useful if there are multiple services that consume different types of jobs
- Transactional outbox table 
- insert publishing required events into a separate outbox
                        
## Decision
- We choose a transactional outbox table as the simplest choice for our usecase

## Consequences
- atomic with payments table no dual writes
- durable across failures of processes 
- can handle multiple lifecycle events and webhook delivery
- adds one extra insert overhead into outbox table 
- need a separate process to monitor and publish events from
- at-least-once delivery can cause duplicate publishes of already completed events
    - must be managed by idempotency
