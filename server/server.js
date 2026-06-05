const express = require("express");
const cors = require("cors");

const parseQuery = require("./utils/queryParser");
const sourceRouter = require("./scrapers/sourceRouter");
const saveLead = require("./db/saveLead");
const db = require("./db/db");
const runLeadEngine = require("./services/leadEngine");

const app = express();

app.use(cors());
app.use(express.json());

app.post("/generate-leads", async (req, res) => {
  try {
    const { query } = req.body;
    console.log(`[Server] Received query: "${query}"`);

    // Parse user query
    const parsedData = parseQuery(query);
    console.log(`[Server] Parsed data: category="${parsedData.category}", location="${parsedData.location}"`);

    // Log query in searches database (skip if query was already searched before)
    if (query && query.trim()) {
      try {
        await db.query(
          "INSERT INTO searches (query) VALUES ($1) ON CONFLICT (query) DO NOTHING",
          [query.trim()]
        );
      } catch (err) {
        console.error("[Server] Search logging error:", err.message);
      }
    }

    // Call sourceRouter to resolve query category and city to appropriate scraper
    const city = parsedData.location || "Nagpur";
    const leads = await sourceRouter(parsedData.category, city);

    console.log(`[Server] Saving ${leads.length} leads to database...`);
    for (const lead of leads) {
      try {
        await saveLead(lead);
      } catch (err) {
        console.error(`[Server] Error saving lead ${lead.businessName || 'Unknown'}:`, err.message);
      }
    }

    console.log(`[Server] Request completed successfully!`);
    res.json({
      success: true,
      parsedData,
      totalLeads: leads.length,
      leads
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/universal-leads", async (req, res) => {
  try {
    const { query } = req.body;
    console.log(`[Server] Universal endpoint received: "${query}"`);

    const parsedData = parseQuery(query);
    const city = parsedData.location || "Mumbai";
    const category = parsedData.category || query;

    // Log search
    if (query && query.trim()) {
      try {
        await db.query(
          "INSERT INTO searches (query) VALUES ($1) ON CONFLICT (query) DO NOTHING",
          [query.trim()]
        );
      } catch (err) {
        console.error("[Server] Search logging error:", err.message);
      }
    }

    // Run universal lead engine
    const result = await runLeadEngine(query, category, city);

    // Save leads to database
    console.log(`[Server] Saving ${result.leads.length} leads to database...`);
    let savedCount = 0;
    for (const lead of result.leads) {
      try {
        await saveLead(lead);
        savedCount++;
      } catch (err) {
        console.error(`[Server] Error saving lead ${lead.businessName || 'Unknown'}:`, err.message);
      }
    }

    res.json({
      success: true,
      query,
      parsedData,
      discoveredUrls: result.urls,
      stats: result.stats,
      savedLeads: savedCount,
      leads: result.leads
    });
  } catch (error) {
    console.error("[Server] Universal endpoint error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/search-history", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM searches ORDER BY created_at DESC");
    res.json({
      success: true,
      history: result.rows
    });
  } catch (error) {
    console.error("[Server] GET /search-history error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/dashboard-stats", async (req, res) => {
  try {
    const leadsRes = await db.query("SELECT COUNT(*) FROM leads");
    const searchesRes = await db.query("SELECT COUNT(*) FROM searches");
    const emailsRes = await db.query("SELECT COUNT(DISTINCT email) FROM leads WHERE email IS NOT NULL");
    const phonesRes = await db.query("SELECT COUNT(DISTINCT phone) FROM leads WHERE phone IS NOT NULL");

    res.json({
      success: true,
      stats: {
        totalLeads: parseInt(leadsRes.rows[0].count, 10),
        totalSearches: parseInt(searchesRes.rows[0].count, 10),
        emailsFound: parseInt(emailsRes.rows[0].count, 10),
        phonesFound: parseInt(phonesRes.rows[0].count, 10)
      }
    });
  } catch (error) {
    console.error("[Server] GET /dashboard-stats error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(3000, () => {
  console.log("LeadSync server running on port 3000");
});
