
import { Module } from "@nestjs/common";
//import { TerminusModule } from "@nestjs/terminus";
import { Pool } from 'pg';
import { PG_POOL, DB_URL } from './database.constants';

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

@Module({

    providers: [...dbProvider], 
    exports: [...dbProvider]
})
export class DatabaseModule{}
