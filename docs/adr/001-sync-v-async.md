# ADR-001: Sync vs async processing

## Context
posting payment requests to the api per client should the payments be inline calls to the bank or an accept and defer architecture.

## Options
this can either be sync or async requests

## Decision
- doing async post requests where the client gets back a 202 instead
of having to wait for the request to complete along with a submission id
to track their request via webhooks to notify them of status changes.
- we send back a location id of the clients initial request which they use to poll to track changes in their payment state.

## Consequences
- queries are not latency bound by external apis since they do not have to rely on an external request to the bank from responding to send them a response
- do not have to idle threads on sync blocking requests can be rerouted to handle
other requests
- currently the system has to own the durability of deferred work
- data is only eventually consistent and we must rely on progress status
