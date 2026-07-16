CREATE TABLE "us_models" (
	"mid" text PRIMARY KEY NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"slug" text NOT NULL,
	"model_year" integer,
	"url" text NOT NULL,
	"image_urls" jsonb,
	"collected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "us_versions" (
	"version_id" text PRIMARY KEY NOT NULL,
	"mid" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"fuel_section" text,
	"year" integer,
	"power_hp" integer,
	"power_kw" real,
	"displacement_cc" integer,
	"generation" text,
	"body" text,
	"doors" integer,
	"seats" integer,
	"fuel" text,
	"engine_code" text,
	"cylinders" text,
	"torque_nm" integer,
	"drivetrain" text,
	"gearbox" text,
	"co2_wltp" integer,
	"co2_nedc" integer,
	"emission_standard" text,
	"curb_weight_kg" integer,
	"image_url" text,
	"specs" jsonb,
	"collected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "us_versions" ADD CONSTRAINT "us_versions_mid_us_models_mid_fk" FOREIGN KEY ("mid") REFERENCES "public"."us_models"("mid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "us_models_make_model_idx" ON "us_models" USING btree ("make","model");--> statement-breakpoint
CREATE INDEX "us_versions_mid_idx" ON "us_versions" USING btree ("mid");--> statement-breakpoint
CREATE INDEX "us_versions_power_idx" ON "us_versions" USING btree ("power_hp");--> statement-breakpoint
CREATE INDEX "us_versions_cc_idx" ON "us_versions" USING btree ("displacement_cc");