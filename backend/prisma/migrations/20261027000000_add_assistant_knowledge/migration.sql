-- CreateTable
CREATE TABLE "AssistantKnowledge" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "sourceThreadId" TEXT,
    "sourceMessageId" TEXT,
    "createdById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantKnowledge_active_createdAt_idx" ON "AssistantKnowledge"("active", "createdAt");
CREATE INDEX "AssistantKnowledge_sourceThreadId_idx" ON "AssistantKnowledge"("sourceThreadId");

-- AddForeignKey
ALTER TABLE "AssistantKnowledge" ADD CONSTRAINT "AssistantKnowledge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL;
