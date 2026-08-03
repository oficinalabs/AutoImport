CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stand_id" text NOT NULL,
	"polar_customer_id" text,
	"polar_subscription_id" text NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_stand_id_organization_id_fk" FOREIGN KEY ("stand_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stand_uidx" ON "subscriptions" USING btree ("stand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_polar_subscription_uidx" ON "subscriptions" USING btree ("polar_subscription_id");