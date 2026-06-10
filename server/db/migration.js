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

    // Create task_leads join table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_leads (
          task_id VARCHAR(255) REFERENCES search_tasks(id) ON DELETE CASCADE,
          lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
          is_cached BOOLEAN DEFAULT FALSE,
          PRIMARY KEY (task_id, lead_id)
      );
    `);
    
    // Add is_cached column if it doesn't exist
    await pool.query(`
      ALTER TABLE task_leads ADD COLUMN IF NOT EXISTS is_cached BOOLEAN DEFAULT FALSE;
    `);
    console.log("[Migration] task_leads table and is_cached column checked/applied.");
    console.log("[Migration] Database migration completed successfully.");
  } catch (error) {
    console.error("[Migration] Error running database migration:", error);
  } finally {
    await pool.end();
  }
}

migrate();
