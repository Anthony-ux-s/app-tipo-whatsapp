-- CreateTable
CREATE TABLE "AvatarImage" (
    "id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvatarImage_pkey" PRIMARY KEY ("id")
);
