const express = require("express");
const apiRoutes = require("./routes/apiRoutes");
const cors = require("./middleware/cors");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const mountFrontendRoutes = require("./routes/frontendRoutes");

function createApp() {
  const app = express();
  app.use(express.json({ limit: "20mb" }));
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
