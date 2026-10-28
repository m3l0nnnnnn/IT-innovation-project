CREATE TABLE "corrective_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid,
	"title" text NOT NULL,
	"owner" text,
	"status" text DEFAULT 'Planned' NOT NULL,
	"due_at" timestamp with time zone,
	"completed" boolean DEFAULT false NOT NULL,
	"effectiveness_score" integer
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"town_council_id" uuid NOT NULL,
	"title" text NOT NULL,
	"severity" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'New' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_ref" text NOT NULL,
	"town_council_id" uuid NOT NULL,
	"block" text NOT NULL,
	"street" text,
	"postal_code" text,
	"location" text,
	"category" text NOT NULL,
	"channel" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'Open' NOT NULL,
	"assigned_officer" text,
	"duplicate_of_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_cases_case_ref_unique" UNIQUE("case_ref")
);
--> statement-breakpoint
CREATE TABLE "kpi_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"town_council_id" uuid NOT NULL,
	"name" text NOT NULL,
	"value" numeric NOT NULL,
	"threshold" numeric,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "town_councils" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "town_councils_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_town_council_id_town_councils_id_fk" FOREIGN KEY ("town_council_id") REFERENCES "public"."town_councils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_cases" ADD CONSTRAINT "feedback_cases_town_council_id_town_councils_id_fk" FOREIGN KEY ("town_council_id") REFERENCES "public"."town_councils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_cases" ADD CONSTRAINT "feedback_cases_duplicate_of_id_feedback_cases_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."feedback_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_measurements" ADD CONSTRAINT "kpi_measurements_town_council_id_town_councils_id_fk" FOREIGN KEY ("town_council_id") REFERENCES "public"."town_councils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_cases_council_received_idx" ON "feedback_cases" USING btree ("town_council_id","received_at");--> statement-breakpoint
CREATE INDEX "feedback_cases_block_idx" ON "feedback_cases" USING btree ("block");--> statement-breakpoint
CREATE INDEX "feedback_cases_status_idx" ON "feedback_cases" USING btree ("status");