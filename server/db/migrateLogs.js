const db = require("./db");

async function migrate() {
  try {
    console.log("Running migration: Adding source_logs and scraping_logs tables...");

    await db.query(`
      CREATE TABLE IF NOT EXISTS source_logs (
          id SERIAL PRIMARY KEY,
          source_name TEXT NOT NULL,
          status TEXT NOT NULL,
          leads_count INTEGER DEFAULT 0,
          query TEXT,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ source_logs table ready");

    await db.query(`
      CREATE TABLE IF NOT EXISTS scraping_logs (
          id SERIAL PRIMARY KEY,
          source_name TEXT NOT NULL,
          url TEXT,
          status TEXT NOT NULL,
          retry_count INTEGER DEFAULT 0,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ scraping_logs table ready");

    console.log("Migration complete!");
  } catch (err) {
    console.error("Migration error:", err.message);
  } finally {
    db.end();
  }
}

migrate();
