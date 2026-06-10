const pool = require("./db");

const createLeadsTableQuery = `
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    business_name TEXT,
    owner_name TEXT,
    email TEXT,
    phone TEXT,
    website TEXT,
    address TEXT,
    city TEXT,
    category TEXT,
    source TEXT,
    confidence_score INTEGER,
    is_valid_lead BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_lead UNIQUE(business_name, email, phone)
);
`;

const createSearchesTableQuery = `
CREATE TABLE IF NOT EXISTS searches (
    id SERIAL PRIMARY KEY,
    query TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

async function init() {
  try {
    console.log("Initializing database...");
    console.log("Dropping old tables...");
    await pool.query("DROP TABLE IF EXISTS task_leads CASCADE;");
    await pool.query("DROP TABLE IF EXISTS search_tasks CASCADE;");
    await pool.query("DROP TABLE IF EXISTS leads CASCADE;");
    await pool.query("DROP TABLE IF EXISTS searches CASCADE;");
    
    console.log("Creating search_tasks table...");
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

    console.log("Creating leads table...");
    await pool.query(createLeadsTableQuery);
    
    console.log("Creating task_leads join table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_leads (
          task_id VARCHAR(255) REFERENCES search_tasks(id) ON DELETE CASCADE,
          lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
          is_cached BOOLEAN DEFAULT FALSE,
          PRIMARY KEY (task_id, lead_id)
      );
    `);

    console.log("Creating searches table...");
    await pool.query(createSearchesTableQuery);

    console.log("Creating source_logs table...");
    await pool.query(`
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

    console.log("Creating scraping_logs table...");
    await pool.query(`
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

    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Database initialization error:", err);
  } finally {
    await pool.end();
  }
}

init();
