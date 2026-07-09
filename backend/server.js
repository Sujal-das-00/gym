const { PORT } = require("./src/config/constants");
const { createApp } = require("./src/app");
const { setModelMode } = require("./src/models");
const { bootstrapDatabase } = require("./src/services/bootstrapService");
const { getLocalIp } = require("./src/services/networkService");

async function start() {
  const boot = await bootstrapDatabase();
  setModelMode(boot.mode);
  const app = createApp();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Storage mode: ${boot.mode}`);
    console.log(`Admin frontend: http://localhost:${PORT}/admin`);
    console.log(`Check-in frontend: http://localhost:${PORT}/checkin`);
    console.log(`Phone check-in URL: http://${getLocalIp()}:${PORT}/checkin`);
  });
}

start().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
