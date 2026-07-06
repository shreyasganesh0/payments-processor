import { config } from '../config';

export const PAYMENTS_QUEUE = 'payments';
export const WEBHOOKS_QUEUE = 'webhooks';
export const REDIS_URL = config.redisUrl;
