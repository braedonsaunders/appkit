ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "two_factors" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "secret" text NOT NULL,
 "backup_codes" text NOT NULL,
 "verified" boolean DEFAULT true,
 "failed_verification_count" integer DEFAULT 0,
 "locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "two_factors_user_idx" ON "two_factors" ("user_id");
--> statement-breakpoint
CREATE INDEX "two_factors_secret_idx" ON "two_factors" ("secret");
