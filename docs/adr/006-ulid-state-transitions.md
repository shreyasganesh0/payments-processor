# Context
What kind of id to use for the id column

## Decision
We will be using ULIDs to prevent randomness causing fragmentation in the index
and allow approx time based sorting

## Transactions Transitions
PENDING -> PROCESSING
PROCESSING -> COMPLETED | FAILED | RETRYING
RETRYING -> PROCESSING
COMPLETED -> (end)
FAILED -> (end)

- enforced transitions in code via a transition check to reject illegal moves
- enforced at the db level with application level optimistic concurrency using 
CAS to check version, time id, status
    - if no rows follow all criteria then back off from update
