## Context

4 axes on which to decide how idempotency will work in the api for payments
key, storage, payload fingerprint and concurrency


## Options
- we could use a global unique key or a customer specific unique key tuple (c_id, key)
- we can store the key in the payments table or have a dedicated idempotency table 
- the key can be a hash of the request body to verify key <-> request relations


## Decision
- we will use a per customer specific unique (cust_id, key) tuple
- store the key in a seperate idempotency table with related request and response
- using a fingerprint of the request to prevent reuse of idempotency tokens
- db unique constraint use to perform serialization of transactions

## Consequences
- unique tuple allows for per customer idempotency allowing for reuse of keys across customer and isolation of tenants
- unique constraint enforces serialization of requests without explicit application locking
- separate table for idempotency related columns allows for generalization of the idempotency to more than just payments in the future and separates concerns
- concurrency walk: two users try to write to the same index block based on the idempotency key. since it is unique the writer blocks the loser who gets an error message and their write fails
- responses must be stored as json not jsonb so that keys are not reordered
- the loser of the race must waste their time attempting a write

