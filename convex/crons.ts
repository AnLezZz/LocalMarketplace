import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("booking reminders", { hours: 1 }, internal.reminders.sendDue, {});
crons.interval("remove old notifications", { hours: 24 }, internal.notifications.sweepOld, {});
export default crons;
