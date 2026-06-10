require("dotenv").config();
const express = require("express");
const cors = require("cors");

const parseQuery = require("./utils/queryParser");
const sourceRouter = require("./scrapers/sourceRouter");
const saveLead = require("./db/saveLead");
const db = require("./db/db");
const runLeadEngine = require("./services/leadEngine");
const groqQueryParser = require("./services/groqQueryParser");
const leadOrchestrator = require("./services/leadOrchestrator");
const scrapeGraphEnrichment = require("./services/scrapeGraphEnrichment");
const groqLeadValidator = require("./services/groqLeadValidator");
const taskQueue = require("./services/taskQueue");
const { getDiagnosticSummary, enableSource, getAllSourceHealth } = require("./services/sourceHealth");


const app = express();

app.use(cors());
app.use(express.json());

app.post(
  "/generate-leads",
  async (req, res) => {
    try {
      const { query } = req.body;
      console.log(`[Server] Received query for generate-leads: "${query}"`);

      const parsed = await groqQueryParser(query);
      console.log(`[Server] Groq parsed:`, parsed);

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

      const uniqueLeads = await leadOrchestrator(parsed);
      const validatedLeads = [];

      for (const lead of uniqueLeads) {
        let currentLead = {
          ...lead,
          city: lead.city || parsed.city || "Pune",
          category: lead.category || parsed.category || "healthcare"
        };

        // ScrapeGraphAI Enrichment
        if (currentLead.website) {
          try {
            currentLead = await scrapeGraphEnrichment(currentLead);
          } catch (enrichErr) {
            console.error(`[Server] Enrichment failed for ${currentLead.businessName}:`, enrichErr.message);
          }
        }

        // Groq Validation
        try {
          const validation = await groqLeadValidator(currentLead);
          currentLead.confidenceScore = validation.confidence || 50;
          currentLead.industry = validation.industry || parsed.category || "unknown";

          if (validation.validLead) {
            try {
              await saveLead(currentLead);
              validatedLeads.push(currentLead);
            } catch (saveErr) {
              console.error(`[Server] Error saving lead ${currentLead.businessName}:`, saveErr.message);
            }
          } else {
            console.log(`[Server] Rejected invalid lead: "${currentLead.businessName}" (Confidence: ${validation.confidence}%)`);
          }
        } catch (valErr) {
          console.error(`[Server] Validation failed for ${currentLead.businessName}:`, valErr.message);
        }
      }

      res.json({
        success: true,
        query,
        parsedData: parsed,
        totalLeads: validatedLeads.length,
        leads: validatedLeads
      });
    } catch (error) {
      console.error("[Server] Error in /generate-leads:", error.message);
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

app.post("/tasks", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, error: "Query is required" });
    }

    // Smart Caching Check: Has this query been run in the last 24 hours and completed?
    const cachedTask = await db.query(
      `SELECT * FROM search_tasks 
       WHERE LOWER(TRIM(query)) = LOWER(TRIM($1)) 
       AND status = 'completed' 
       AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC LIMIT 1`,
      [query.trim()]
    );

    if (cachedTask.rows.length > 0) {
      console.log(`[Server] Found cached completed task for query "${query}": ${cachedTask.rows[0].id}`);
      return res.json({
        success: true,
        cached: true,
        taskId: cachedTask.rows[0].id,
        message: "Cached results available."
      });
    }

    // Otherwise, start a new task
    const taskId = await taskQueue.createTask(query);

    // Log search query in searches table
    try {
      await db.query(
        "INSERT INTO searches (query) VALUES ($1) ON CONFLICT (query) DO NOTHING",
        [query.trim()]
      );
    } catch (err) {
      console.error("[Server] Search logging error:", err.message);
    }

    res.json({
      success: true,
      taskId,
      message: "Background scraping task initiated."
    });
  } catch (error) {
    console.error("[Server] Error in POST /tasks:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const task = await taskQueue.getTaskStatus(id);

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    // Fetch leads associated with this task via the task_leads join table
    let leads = [];
    try {
      const result = await db.query(
        `SELECT l.*, tl.is_cached FROM leads l 
         JOIN task_leads tl ON l.id = tl.lead_id
         WHERE tl.task_id = $1
         ORDER BY l.lead_score DESC, l.confidence_score DESC`,
         [id]
      );
      leads = result.rows.map(row => ({
        id: row.id,
        businessName: row.business_name,
        ownerName: row.owner_name,
        email: row.email,
        phone: row.phone,
        whatsapp: row.whatsapp,
        website: row.website,
        address: row.address,
        city: row.city,
        state: row.state,
        category: row.category,
        services: row.services || [],
        socialLinks: row.social_links || {},
        source: row.source,
        confidenceScore: row.confidence_score,
        leadScore: row.lead_score,
        isValidLead: row.is_valid_lead,
        createdAt: row.created_at,
        isCached: row.is_cached
      }));
    } catch (dbErr) {
      console.error(`[Server] Error fetching leads for task ${id}:`, dbErr.message);
    }

    res.json({
      success: true,
      task: {
        id: task.id,
        query: task.query,
        status: task.status,
        progress: task.progress,
        totalLeads: task.total_leads || leads.length,
        leads
      }
    });
  } catch (error) {
    console.error("[Server] Error in GET /tasks/:id:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/leads", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM leads ORDER BY created_at DESC");
    
    // Map database columns (snake_case) to frontend camelCase keys
    const leads = result.rows.map(row => ({
      id: row.id,
      businessName: row.business_name,
      ownerName: row.owner_name,
      email: row.email,
      phone: row.phone,
      whatsapp: row.whatsapp,
      website: row.website,
      address: row.address,
      city: row.city,
      state: row.state,
      category: row.category,
      services: row.services || [],
      socialLinks: row.social_links || {},
      source: row.source,
      confidenceScore: row.confidence_score,
      leadScore: row.lead_score,
      isValidLead: row.is_valid_lead,
      createdAt: row.created_at
    }));

    res.json({
      success: true,
      totalLeads: leads.length,
      leads
    });
  } catch (error) {
    console.error("[Server] GET /leads error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/source-health", async (req, res) => {
  try {
    const diagnostics = getDiagnosticSummary();
    const recentLogs = await db.query(
      "SELECT * FROM source_logs ORDER BY created_at DESC LIMIT 50"
    );
    res.json({
      success: true,
      diagnostics,
      recentLogs: recentLogs.rows
    });
  } catch (error) {
    console.error("[Server] GET /source-health error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/source-health/:source/enable", async (req, res) => {
  try {
    const { source } = req.params;
    enableSource(source);
    res.json({ success: true, message: `Source ${source} re-enabled` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LeadSync server running on port ${PORT}`);
});
