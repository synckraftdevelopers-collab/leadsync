const pool = require("./db");

async function migrate() {
  try {
    console.log("[Migration] Running database schema upgrade...");

    // Add new columns to leads table if they don't exist
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS state TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS services JSONB;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS social_links JSONB;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score INTEGER;
    `);
    console.log("[Migration] Column upgrades for leads table checked/applied.");

    // Create search_tasks table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS search_tasks (
          id VARCHAR(255) PRIMARY KEY,
          query TEXT NOT NULL,
          status VARCHAR(50) NOT NULL,
          progress INTEGER DEFAULT 0,
          total_leads INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[Migration] search_tasks table checked/applied.");
    console.log("[Migration] Database migration completed successfully.");
  } catch (error) {
    console.error("[Migration] Error running database migration:", error);
  } finally {
    await pool.end();
  }
}

migrate();
