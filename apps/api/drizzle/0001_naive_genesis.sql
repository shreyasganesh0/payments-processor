CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"from_status" "payment_status",
	"to_status" "payment_status" NOT NULL,
	"correlation_id" text,
	"metadata" jsonb,
	"occured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;