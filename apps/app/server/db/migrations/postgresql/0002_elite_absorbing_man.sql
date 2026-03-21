ALTER TABLE "apikey" DROP CONSTRAINT "apikey_userId_user_id_fk";
--> statement-breakpoint
DROP INDEX "apikey_userId_idx";--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "configId" SET DEFAULT 'default';--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "configId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "referenceId" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "apikey_configId_idx" ON "apikey" USING btree ("configId");--> statement-breakpoint
CREATE INDEX "apikey_referenceId_idx" ON "apikey" USING btree ("referenceId");--> statement-breakpoint
ALTER TABLE "apikey" DROP COLUMN "userId";