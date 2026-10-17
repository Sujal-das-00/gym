// Runs the daily notification pass (pending-fee reminders + renewal notices).
//
//   npm run notify:daily            what a cron job should run at 10:00. Skips if
//                                   today's pass already ran (timer or earlier cron).
//   npm run notify:daily -- --force run again right now, for testing. It sends to real,
//                                   registered phones.
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });

const { setModelMode } = require("../src/models");
const { bootstrapDatabase } = require("../src/services/bootstrapService");
const { runClaimedDaily } = require("../src/services/autoNotificationService");

(async () => {
  const boot = await bootstrapDatabase();
  setModelMode(boot.mode);
  const force = process.argv.includes("--force");
  console.log(JSON.stringify(await runClaimedDaily({ force }), null, 2));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
