CREATE TYPE "public"."bank_mode" AS ENUM('always_authorize', 'always_decline', 'always_error', 'fail_n_then_authorize');--> statement-breakpoint
CREATE TABLE "bank_config" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" "bank_mode" DEFAULT 'always_authorize' NOT NULL,
	"latency_ms" integer DEFAULT 200 NOT NULL,
	"fail_n" integer DEFAULT 2 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "bank_config" ("id") VALUES ('singleton') ON CONFLICT ("id") DO NOTHING;
