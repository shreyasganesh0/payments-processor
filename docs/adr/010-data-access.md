# Context
On the choice of which tool to use for sql transaction managment for the underlying postgres db that will be used to store the data.

## Options
raw pg - writing raw queries in sql for all the transacitons
drizzle - ORM that is typescript native and semantics similar to sql.
prisma - ORM with its own DSL that allows 
        it to make optimizations under the hood.


## Decision
- for this project we are proceeding with drizzle
- the reason for our choice of drizzle is
    1. Does not require learning another Domain Specific Language
    2. Team working on it is well versed in SQL/PG and optimizations
    3. All code data and app logic can be written in the same language (typescript)
    4. Allows for specific control over multi-insert and CAS txn mechanisms.

## Tradeoff
- may require more lines of code in the long term which Prisma might have an edge over
- will require a slight indirection from code to raw sql that could require regression testing in the long run.

