CREATE TABLE "stand_cost_settings" (
	"stand_id" text PRIMARY KEY NOT NULL,
	"transport" jsonb,
	"legalization" integer,
	"despachante" integer,
	"preparation" integer,
	"min_margin_eur" integer,
	"min_margin_pct" real,
	"vat_registered" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trial_email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stand_id" text,
	"kind" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_cost_estimates" ADD COLUMN "vat_regime" text DEFAULT 'margem' NOT NULL;--> statement-breakpoint
ALTER TABLE "import_cost_estimates" ADD COLUMN "origin_price_net" integer;--> statement-breakpoint
ALTER TABLE "import_cost_estimates" ADD COLUMN "vat_deposit" integer;--> statement-breakpoint
ALTER TABLE "import_cost_estimates" ADD COLUMN "preparation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "import_cost_estimates" ADD COLUMN "despachante" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "import_cost_estimates" ADD COLUMN "output_vat" integer;--> statement-breakpoint
ALTER TABLE "import_cost_estimates" ADD COLUMN "gross_margin" integer;--> statement-breakpoint
ALTER TABLE "import_cost_estimates" ADD COLUMN "gross_margin_pct" real;--> statement-breakpoint
ALTER TABLE "import_cost_estimates" ADD COLUMN "pt_sample" jsonb;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "vat_regime" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "price_net" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "image_urls" text[];--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "plate" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "km_check" jsonb;--> statement-breakpoint
ALTER TABLE "stand_cost_settings" ADD CONSTRAINT "stand_cost_settings_stand_id_organization_id_fk" FOREIGN KEY ("stand_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_email_log" ADD CONSTRAINT "trial_email_log_stand_id_organization_id_fk" FOREIGN KEY ("stand_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trial_email_log_stand_kind_uidx" ON "trial_email_log" USING btree ("stand_id","kind");