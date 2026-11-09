CREATE TABLE "kpi_change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kpi_id" uuid NOT NULL,
	"town_council_id" uuid,
	"action" text NOT NULL,
	"changed_by" text NOT NULL,
	"changes" jsonb NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kpi_change_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kpi_council_targets" (
	"kpi_id" uuid NOT NULL,
	"town_council_id" uuid NOT NULL,
	"target" numeric NOT NULL,
	"warning" numeric NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_council_targets_kpi_id_town_council_id_pk" PRIMARY KEY("kpi_id","town_council_id")
);
--> statement-breakpoint
ALTER TABLE "kpi_council_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kpi_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"metric" text NOT NULL,
	"within_days" integer,
	"category" text,
	"target" numeric NOT NULL,
	"warning" numeric NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_definitions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "kpi_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kpi_change_log" ADD CONSTRAINT "kpi_change_log_kpi_id_kpi_definitions_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_change_log" ADD CONSTRAINT "kpi_change_log_town_council_id_town_councils_id_fk" FOREIGN KEY ("town_council_id") REFERENCES "public"."town_councils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_council_targets" ADD CONSTRAINT "kpi_council_targets_kpi_id_kpi_definitions_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_council_targets" ADD CONSTRAINT "kpi_council_targets_town_council_id_town_councils_id_fk" FOREIGN KEY ("town_council_id") REFERENCES "public"."town_councils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kpi_change_log_kpi_idx" ON "kpi_change_log" USING btree ("kpi_id","changed_at");