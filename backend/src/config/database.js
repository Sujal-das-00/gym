const fs = require("fs");
const mysql = require("mysql2/promise");
const { DATA_DIR, SCHEMA_PATH, UPLOAD_DIR } = require("./constants");
const { dbConfig } = require("./env");

let pool;

function getPool() {
  if (!pool) {
    throw new Error("Database pool has not been initialized");
  }
  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function exec(sql, params = []) {
  const [result] = await getPool().execute(sql, params);
  return result;
}

// Text-protocol query for statements the prepared-statement protocol can't run
// (DDL / ALTER used by migrations). No parameter binding — never pass user input.
async function raw(sql) {
  const [result] = await getPool().query(sql);
  return result;
}

async function initDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  pool = mysql.createPool(dbConfig());
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  await getPool().query(schema);
  return pool;
}

module.exports = {
  exec,
  getPool,
  initDatabase,
  query,
  raw,
};
