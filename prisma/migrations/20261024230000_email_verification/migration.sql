-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailTokenExpires" TIMESTAMP(3),
ADD COLUMN     "emailTokenHash" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_emailTokenHash_key" ON "User"("emailTokenHash");

