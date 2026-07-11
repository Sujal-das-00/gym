// Entry point for shared hosting (cPanel "Setup Node.js App" / Phusion Passenger).
// Passenger loads this file by default; it simply boots the real server.
// The server reads process.env.PORT (a TCP port or Unix socket) provided by the host.
require("./backend/server.js");
