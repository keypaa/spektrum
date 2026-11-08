ALTER TABLE "admin_actions" ALTER COLUMN "ip" SET DATA TYPE inet USING "ip"::inet;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_main_document_id_documents_id_fk" FOREIGN KEY ("main_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
