const express = require("express");
const apiRoutes = require("./routes/apiRoutes");
const cors = require("./middleware/cors");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const mountFrontendRoutes = require("./routes/frontendRoutes");

function createApp() {
  const app = express();
  // Only the routes that carry a photo/logo may send a large body; everything else is
  // capped small so a stray or hostile request can't make the server buffer megabytes.
  app.use(["/api/members", "/api/settings"], express.json({ limit: "12mb" }));
  app.use(express.json({ limit: "256kb" }));
  app.use(cors);
  app.use("/api", apiRoutes);
  mountFrontendRoutes(app);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = {
  createApp,
};
