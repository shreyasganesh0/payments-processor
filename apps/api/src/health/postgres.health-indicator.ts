import { HealthIndicator, HealthCheckError } from '@nestjs/terminus';
import { PG_POOL } from '../database/database.constants';
import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';


@Injectable()
export class PostgresHealthIndicator extends HealthIndicator {

    constructor(@Inject(PG_POOL) private readonly pool: Pool) { super(); };

    async pingCheck(key: string) {

        try {
            await this.pool.query('SELECT 1');
            return this.getStatus(key, true);

        } catch(err) {

            throw new HealthCheckError(
                'postgres down', 
                this.getStatus(key, false, { message: 'could not reach postgres' })
            );
        }

    }
}
