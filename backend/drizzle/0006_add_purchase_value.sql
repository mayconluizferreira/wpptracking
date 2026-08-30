ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "valor" numeric(12, 2);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "moeda" text DEFAULT 'BRL';
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "purchase_sent" boolean DEFAULT false;
