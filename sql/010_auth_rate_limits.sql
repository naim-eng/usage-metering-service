CREATE TABLE "auth"."rateLimit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "count" INTEGER NOT NULL CHECK ("count" >= 0),
    "lastRequest" BIGINT NOT NULL
);

CREATE INDEX "rateLimit_lastRequest_idx"
    ON "auth"."rateLimit" ("lastRequest");
