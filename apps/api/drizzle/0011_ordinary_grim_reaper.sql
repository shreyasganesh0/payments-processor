ALTER TABLE "payments" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "last_error_code" text;--> statement-breakpoint
UPDATE "payments" p SET "attempt_count" = sub.c FROM (SELECT "payment_id", count(*) AS c FROM "payment_events" WHERE "to_status" = 'RETRYING' GROUP BY "payment_id") sub WHERE p."id" = sub."payment_id";