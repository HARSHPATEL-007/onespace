ALTER TABLE "ChatPoll" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ChatPoll" ALTER COLUMN "status" TYPE "PollStatus" USING "status"::"PollStatus";
ALTER TABLE "ChatPoll" ALTER COLUMN "status" SET DEFAULT 'OPEN'::"PollStatus";

ALTER TABLE "Reminder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Reminder" ALTER COLUMN "status" TYPE "ReminderStatus" USING "status"::"ReminderStatus";
ALTER TABLE "Reminder" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"ReminderStatus";