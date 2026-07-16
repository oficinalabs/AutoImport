ALTER TABLE "listings" ADD COLUMN "us_version_id" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "match_confidence" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "match_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_us_version_id_us_versions_version_id_fk" FOREIGN KEY ("us_version_id") REFERENCES "public"."us_versions"("version_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listings_us_version_idx" ON "listings" USING btree ("us_version_id");