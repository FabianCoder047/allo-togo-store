-- Discussion publique de l'assistant, reprise par un employé après escalade.

CREATE TABLE "AssistantThread" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantThreadMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantThreadMessage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification" ADD COLUMN "assistantThreadId" TEXT;

CREATE UNIQUE INDEX "AssistantThread_sessionId_key" ON "AssistantThread"("sessionId");
CREATE UNIQUE INDEX "AssistantThread_reference_key" ON "AssistantThread"("reference");
CREATE INDEX "AssistantThread_status_updatedAt_idx" ON "AssistantThread"("status", "updatedAt");
CREATE INDEX "AssistantThreadMessage_threadId_createdAt_idx" ON "AssistantThreadMessage"("threadId", "createdAt");
CREATE INDEX "Notification_assistantThreadId_idx" ON "Notification"("assistantThreadId");

ALTER TABLE "AssistantThreadMessage"
    ADD CONSTRAINT "AssistantThreadMessage_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "AssistantThread"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssistantThreadMessage"
    ADD CONSTRAINT "AssistantThreadMessage_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_assistantThreadId_fkey"
    FOREIGN KEY ("assistantThreadId") REFERENCES "AssistantThread"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
