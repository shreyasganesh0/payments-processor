# ADR-004: Queue technology

## Context
- choosing a queue for publishing jobs to.

## Options
- BullMQ over Valkey/Redis
    - Has native per job delay, built in retries, failed-set (DLQ)
    - Native Nest integration
- Kafka
    - allows streaming replay and partition ordering
    - heavy operations, no per message delay
- RabbitMQ
    - needs plugin for delay
    - provides routing and DLX via exchanges
- Postgres-as-Queue
    - SKIP locked with hand rolled delay and DLQ


## Decision
- use BullMQ over Valkey

## Consequences
- provides nest native queue interface
- lightweight queue implementation which suits the business needs
- does not have replicated log level durability but postgres can compensate as the 
source of truth
