
import { Module } from "@nestjs/common";
//import { TerminusModule } from "@nestjs/terminus";
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PG_POOL, DB_URL, DRIZZLE } from './database.constants';
import * as schema from './schema';

const dbProvider = [{

    provide: PG_POOL,
    useFactory: () => {

        const pool = new Pool({
            connectionString: process.env.DATABASE_URL ?? DB_URL, 
            connectionTimeoutMillis: 2000,
        });
        pool.on('error', (err) => {
            console.error('[pg pool] idle client error:', err.message);
        });

        return pool;
    },
}];

const drizzleProvider = {

    provide: DRIZZLE,
    inject: [PG_POOL],
    useFactory: (pool: Pool) => drizzle(pool, { schema }),
};

@Module({

    providers: [...dbProvider, drizzleProvider], 
    exports: [...dbProvider, drizzleProvider]
})
export class DatabaseModule{}
