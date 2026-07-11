const { PORT } = require("./src/config/constants");
const { createApp } = require("./src/app");
const { setModelMode } = require("./src/models");
const { bootstrapDatabase } = require("./src/services/bootstrapService");
const { getLocalIp } = require("./src/services/networkService");

async function start() {
  const boot = await bootstrapDatabase();
  setModelMode(boot.mode);
  const app = createApp();

  // On shared hosting (cPanel/Passenger) the platform provides the listen
  // target via process.env.PORT — it may be a TCP port OR a Unix socket path.
  // Locally we bind host+port so phones on the LAN can reach the check-in page.
  const rawPort = process.env.PORT;
  const listen = rawPort && Number.isNaN(Number(rawPort))
    ? (cb) => app.listen(rawPort, cb) // Unix socket path from Passenger
    : (cb) => app.listen(PORT, "0.0.0.0", cb);

  listen(() => {
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
