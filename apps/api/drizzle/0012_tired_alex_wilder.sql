DROP TABLE IF EXISTS "outbox";--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"webhook_dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_id_created_at_pk" PRIMARY KEY("id","created_at")
) PARTITION BY RANGE ("created_at");--> statement-breakpoint
CREATE TABLE "outbox_default" PARTITION OF "outbox" DEFAULT;--> statement-breakpoint
DO $$
DECLARE d date := (now() at time zone 'utc')::date - 1;
BEGIN
	WHILE d < (now() at time zone 'utc')::date + 15 LOOP
		EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF "outbox" FOR VALUES FROM (%L) TO (%L)',
			'outbox_p' || to_char(d, 'YYYYMMDD'),
			to_char(d, 'YYYY-MM-DD') || ' 00:00:00+00',
			to_char(d + 1, 'YYYY-MM-DD') || ' 00:00:00+00');
		d := d + 1;
	END LOOP;
END $$;
