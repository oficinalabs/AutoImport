CREATE TABLE "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stand_id" text NOT NULL,
	"name" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"countries" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stand_id" text NOT NULL,
	"listing_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_cost_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"origin_price" integer NOT NULL,
	"transport" integer NOT NULL,
	"isv" integer NOT NULL,
	"iuc" integer NOT NULL,
	"legalization" integer NOT NULL,
	"total_pt" integer NOT NULL,
	"pt_estimated_price" integer NOT NULL,
	"pt_sample_size" integer NOT NULL,
	"pt_confidence" text NOT NULL,
	"savings" integer NOT NULL,
	"savings_pct" real NOT NULL,
	"verdict" text NOT NULL,
	"isv_table_year" integer NOT NULL,
	"inputs" jsonb,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "import_cost_estimates_listing_id_unique" UNIQUE("listing_id")
);
--> statement-breakpoint
CREATE TABLE "isv_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"observed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_site" text NOT NULL,
	"external_id" text NOT NULL,
	"source_id" uuid,
	"model_id" uuid,
	"make_raw" text,
	"model_raw" text,
	"variant" text,
	"year" integer,
	"km" integer,
	"fuel_raw" text,
	"fuel" text,
	"gearbox" text,
	"engine_raw" text,
	"displacement_cc" integer,
	"color" text,
	"doors" integer,
	"category" text,
	"price" integer,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"country" text,
	"region" text,
	"postal_code" text,
	"detail_url" text,
	"image_url" text,
	"co2" integer,
	"power_hp" integer,
	"first_registration" date,
	"seller_name" text,
	"seller_type" text,
	"price_evaluation" integer,
	"is_damaged" boolean,
	"vin" text,
	"raw" jsonb,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"stand_id" text,
	"savings" integer NOT NULL,
	"savings_pct" real NOT NULL,
	"flagged_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "opportunities_listing_id_unique" UNIQUE("listing_id")
);
--> statement-breakpoint
CREATE TABLE "pt_price_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"listing_id" uuid,
	"year" integer,
	"km_band" integer,
	"price" integer NOT NULL,
	"source_site" text,
	"observed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"kind" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "vehicle_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"fuel" text NOT NULL,
	"norm_key" text NOT NULL,
	"displacement_cc" integer,
	"co2" integer,
	"power_hp" integer,
	"transmission" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_models_norm_key_unique" UNIQUE("norm_key")
);
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_stand_id_organization_id_fk" FOREIGN KEY ("stand_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_stand_id_organization_id_fk" FOREIGN KEY ("stand_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_cost_estimates" ADD CONSTRAINT "import_cost_estimates_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_price_history" ADD CONSTRAINT "listing_price_history_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stand_id_organization_id_fk" FOREIGN KEY ("stand_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_price_observations" ADD CONSTRAINT "pt_price_observations_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_price_observations" ADD CONSTRAINT "pt_price_observations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_events_alert_listing_uidx" ON "alert_events" USING btree ("alert_id","listing_id");--> statement-breakpoint
CREATE INDEX "alerts_stand_idx" ON "alerts" USING btree ("stand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_stand_listing_uidx" ON "favorites" USING btree ("stand_id","listing_id");--> statement-breakpoint
CREATE INDEX "import_cost_estimates_verdict_idx" ON "import_cost_estimates" USING btree ("verdict","savings");--> statement-breakpoint
CREATE UNIQUE INDEX "isv_tables_year_kind_uidx" ON "isv_tables" USING btree ("year","kind");--> statement-breakpoint
CREATE INDEX "listing_price_history_listing_idx" ON "listing_price_history" USING btree ("listing_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_source_external_uidx" ON "listings" USING btree ("source_site","external_id");--> statement-breakpoint
CREATE INDEX "listings_model_country_price_idx" ON "listings" USING btree ("model_id","country","price");--> statement-breakpoint
CREATE INDEX "listings_last_seen_idx" ON "listings" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "opportunities_stand_savings_idx" ON "opportunities" USING btree ("stand_id","savings");--> statement-breakpoint
CREATE INDEX "opportunities_savings_idx" ON "opportunities" USING btree ("savings");--> statement-breakpoint
CREATE INDEX "pt_price_observations_model_idx" ON "pt_price_observations" USING btree ("model_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_slug_uidx" ON "sources" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_models_norm_key_uidx" ON "vehicle_models" USING btree ("norm_key");