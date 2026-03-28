ALTER TABLE "SetupToken"
ADD COLUMN "token" TEXT;

CREATE UNIQUE INDEX "SetupToken_token_key" ON "SetupToken"("token");
