require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Test connection using a simple query (pool.query automatically handles client release)
pool.query("SELECT NOW()")
  .then(() => {
    console.log("LeadSync Neon Database Connected");
  })
  .catch((err) => {
    console.error("Database Connection Error:", err);
  });

module.exports = pool;
