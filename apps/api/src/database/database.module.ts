
import { Module } from "@nestjs/common";
//import { TerminusModule } from "@nestjs/terminus";
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PG_POOL, DRIZZLE } from './database.constants';
import { config } from '../config';
import * as schema from './schema';

const dbProvider = [{

    provide: PG_POOL,
    useFactory: () => {

        const pool = new Pool({
            connectionString: config.databaseUrl,
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
