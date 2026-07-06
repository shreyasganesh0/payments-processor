# ADR-009: Observability

## Context
require a correlation id to tag logs to processes. and choosing logging library

## Options
- correlation id
    - generate a server side id that is passed one per payment lifecycle
    - accept id in header as x-correlation-id or mint one if not provided
- logging library
    - nestjs-pino that supports DI injection
    - raw pino library need to write ports manually
    - nestjs-prometheus library
    - raw prometheus


## Decision
- accept id from header and generate one if not provided
- use the nestjs-pino library to allow smooth logging integration
- use nestjs-prometheus for logging metrics except for in the standalone worker server

## Consequences
- allows for clients to structure their tracing as they wish
    - by providing the same id for logically grouped logs
- must accept risk of client generated ids 
    - fine as this is only used in internal observability never from an external source
- allows for DI injections into existing nestjs code 
    - may run into some issues for finegrained control on pino
