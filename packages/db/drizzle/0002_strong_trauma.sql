ALTER TYPE "public"."render_status" ADD VALUE 'running' BEFORE 'ok';--> statement-breakpoint
ALTER TYPE "public"."render_status" ADD VALUE 'superseded';--> statement-breakpoint
ALTER TABLE "pdf_renders" ADD COLUMN "main_file" text;--> statement-breakpoint
ALTER TABLE "pdf_renders" ADD COLUMN "stats" jsonb;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "batch_id" uuid;