import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("booking reminders", { hours: 1 }, internal.reminders.sendDue, {});
export default crons;
