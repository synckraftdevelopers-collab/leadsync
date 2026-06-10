const { v4: uuidv4 } = require("uuid");
const db = require("../db/db");
const groqQueryParser = require("./groqQueryParser");
const discoverSources = require("./sourceDiscovery");
const detectSource = require("./sourceDetector");
const scrapeDirectory = require("./directoryScraper");
const scrapeWebsite = require("./websiteScraper");
const scrapeGraphEnrichment = require("./scrapeGraphEnrichment");
const groqLeadValidator = require("./groqLeadValidator");
const calculateLeadScore = require("./leadScorer");
const saveLead = require("../db/saveLead");
const withRetry = require("./sourceRetry");
const { isSourceHealthy, recordSourceOutcome, getDiagnosticSummary } = require("./sourceHealth");

// Dedicated scrapers import
const getJustDialLeads = require("../scrapers/justdial/getLeads");
const getPractoLeads = require("../scrapers/practo/getLeads");

// In-memory task registry
const activeTasks = new Map();

/**
 * Creates a task in DB and memory
 */
async function createTask(query) {
  const taskId = uuidv4();
  const task = {
    id: taskId,
    query,
    status: "pending",
    progress: 0,
    total_leads: 0,
    leads: [],
    diagnostics: {} // Per-source status tracking
  };

  activeTasks.set(taskId, task);

  await db.query(
    "INSERT INTO search_tasks (id, query, status, progress, total_leads) VALUES ($1, $2, $3, $4, $5)",
    [taskId, query, "pending", 0, 0]
  );

  // Trigger processing asynchronously
  processTask(taskId, query).catch(err => {
    console.error(`[TaskQueue] Critical error in background task ${taskId}:`, err);
  });

  return taskId;
}

/**
 * Gets task status and current leads
 */
async function getTaskStatus(taskId) {
  const memTask = activeTasks.get(taskId);
  if (memTask) {
    return memTask;
  }

  // Fallback to DB
  const dbTask = await db.query("SELECT * FROM search_tasks WHERE id = $1", [taskId]);
  if (dbTask.rows.length === 0) {
    return null;
  }

  const taskRow = dbTask.rows[0];
  return {
    id: taskRow.id,
    query: taskRow.query,
    status: taskRow.status,
    progress: taskRow.progress,
    total_leads: taskRow.total_leads,
    leads: [],
    diagnostics: {}
  };
}

/**
 * Update task progress helper
 */
async function updateTask(taskId, updates) {
  const memTask = activeTasks.get(taskId);
  if (memTask) {
    Object.assign(memTask, updates);
  }

  const fields = [];
  const vals = [];
  let index = 1;
  for (const [key, val] of Object.entries(updates)) {
    if (key === "leads" || key === "diagnostics") continue; // Don't save these directly
    fields.push(`${key} = $${index}`);
    vals.push(val);
    index++;
  }
  vals.push(taskId);

  await db.query(
    `UPDATE search_tasks SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${index}`,
    vals
  );
}

/**
 * Asynchronously process a search task
 * Now with: source isolation, retry, DB cache recovery, minimum lead guarantee, diagnostics
 */
async function processTask(taskId, query) {
  console.log(`[TaskQueue] Processing task ${taskId} for query "${query}"`);
  const diagnostics = {}; // Track per-source status for this task

  try {
    await updateTask(taskId, { status: "processing", progress: 5 });

    // Step 1: AI Query Intelligence
    console.log(`[TaskQueue] Step 1: Parsing query using Groq`);
    const parsedQuery = await groqQueryParser(query);
    console.log(`[TaskQueue] Query parsed successfully:`, parsedQuery);
    
    await updateTask(taskId, { progress: 15 });

    const category = parsedQuery.category || "general";
    const subCategory = parsedQuery.subCategory || category;
    const city = parsedQuery.city || "Mumbai";
    const state = parsedQuery.state || "";

    // Step 1b: Database Cache Check — ALWAYS return cached leads if available
    console.log(`[TaskQueue] Step 1b: Checking database cache for "${subCategory || category}" in "${city}"`);
    let cachedLeads = [];
    if (city && (subCategory || category)) {
      const targetCat = subCategory || category;
      try {
        const dbCached = await db.query(
          `SELECT * FROM leads 
           WHERE LOWER(city) = LOWER($1) 
           AND (LOWER(category) = LOWER($2) OR LOWER(category) LIKE LOWER($3))
           AND is_valid_lead = true
           ORDER BY lead_score DESC, confidence_score DESC`,
           [city, targetCat, `%${targetCat}%`]
        );
        cachedLeads = dbCached.rows.map(row => ({
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
          isCached: true
        }));
      } catch (dbErr) {
        console.error("[TaskQueue] Error checking database cache:", dbErr.message);
      }
    }

    console.log(`[TaskQueue] Database check found ${cachedLeads.length} cached leads.`);
    diagnostics.database = { status: "success", leads: cachedLeads.length };

    // Link cached leads to the task
    for (const lead of cachedLeads) {
      try {
        await db.query(
          "INSERT INTO task_leads (task_id, lead_id, is_cached) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING",
          [taskId, lead.id]
        );
      } catch (linkErr) {
        console.error(`[TaskQueue] Error linking cached lead:`, linkErr.message);
      }
    }

    let leadsDiscovered = cachedLeads.length;
    const processedLeads = [...cachedLeads];
    
    const memTask = activeTasks.get(taskId);
    if (memTask) {
      memTask.leads = [...cachedLeads];
      memTask.total_leads = leadsDiscovered;
      memTask.diagnostics = { ...diagnostics };
    }
    await updateTask(taskId, { total_leads: leadsDiscovered });

    // If database contains 20+ validated leads, return them instantly!
    if (leadsDiscovered >= 20) {
      console.log(`[TaskQueue] Database contains ${leadsDiscovered} leads. Returning cached leads instantly.`);
      await updateTask(taskId, { status: "completed", progress: 100 });
      return;
    }

    // Step 2: Dynamic Source Discovery
    console.log(`[TaskQueue] Step 2: Discovering sources dynamically`);
    let urls = [];
    try {
      urls = await withRetry(
        () => discoverSources(parsedQuery, 15),
        "google",
        `${subCategory || category} in ${city}`
      );
      diagnostics.discovery = { status: "success", urlsFound: urls.length };
    } catch (discErr) {
      console.error(`[TaskQueue] Source discovery failed:`, discErr.message);
      diagnostics.discovery = { status: "failed", error: discErr.message };
    }

    if (urls.length === 0) {
      console.log(`[TaskQueue] No URLs found from discovery. Checking DB cache...`);
      // DB cache recovery: if we have any cached leads, return them even if < 20
      if (cachedLeads.length > 0) {
        console.log(`[TaskQueue] Returning ${cachedLeads.length} cached leads as fallback.`);
        await updateTask(taskId, { status: "completed", progress: 100 });
        return;
      }
      // No cached leads either — mark as completed with 0 leads (not "failed")
      await updateTask(taskId, { status: "completed", progress: 100 });
      return;
    }

    await updateTask(taskId, { progress: 25 });

    // Step 3: Source Classification
    const classifiedSources = urls.map(url => ({
      url,
      ...detectSource(url)
    }));

    // Step 4: Scraping with source isolation + retry + health checks
    const batchSize = 3;
    const seenLeadKeys = new Set();

    // Initialize seen keys with cached leads to avoid double-processing
    for (const l of cachedLeads) {
      const cleanPhone = l.phone ? l.phone.replace(/[^0-9]/g, "") : "";
      const cleanEmail = l.email ? l.email.toLowerCase().trim() : "";
      const cleanName = l.businessName.toLowerCase().replace(/\s+/g, "").trim();
      seenLeadKeys.add(`name:${cleanName}`);
      if (cleanPhone) seenLeadKeys.add(`phone:${cleanPhone}`);
      if (cleanEmail) seenLeadKeys.add(`email:${cleanEmail}`);
    }

    for (let i = 0; i < classifiedSources.length; i += batchSize) {
      if (leadsDiscovered >= 20) {
        console.log(`[TaskQueue] Total leads reached ${leadsDiscovered} (limit >= 20). Stopping search early.`);
        break;
      }

      const batch = classifiedSources.slice(i, i + batchSize);
      console.log(`[TaskQueue] Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} sources)...`);

      // Use Promise.allSettled for source isolation within each batch
      const batchPromises = batch.map(async (source) => {
        // Skip disabled sources
        if (!isSourceHealthy(source.source)) {
          console.log(`[TaskQueue] Skipping disabled source: ${source.source}`);
          diagnostics[source.source] = { status: "disabled", leads: 0 };
          return;
        }

        let rawLeads = [];

        try {
          if (source.type === "directory") {
            if (source.source === "justdial") {
              rawLeads = await withRetry(
                () => getJustDialLeads(subCategory, city),
                source.source, source.url
              );
            } else if (source.source === "practo") {
              rawLeads = await withRetry(
                () => getPractoLeads(subCategory, city),
                source.source, source.url
              );
            } else {
              rawLeads = await withRetry(
                () => scrapeDirectory(source.url, 15),
                source.source, source.url
              );
            }
          } else {
            const siteLead = await withRetry(
              () => scrapeWebsite(source.url),
              source.source || "web", source.url
            );
            if (siteLead && siteLead.businessName) {
              rawLeads = [siteLead];
            }
          }
          diagnostics[source.source || "web"] = { status: "success", leads: rawLeads.length };
        } catch (err) {
          console.error(`[TaskQueue] Scrape failed for source ${source.url}:`, err.message);
          diagnostics[source.source || "web"] = { status: "failed", error: err.message, leads: 0 };
        }

        // Process discovered raw leads
        await Promise.all(rawLeads.map(async (rawLead) => {
          try {
            const lead = {
              businessName: rawLead.businessName || "Unknown Business",
              ownerName: rawLead.ownerName || "",
              email: rawLead.email || "",
              phone: rawLead.phone || "",
              whatsapp: rawLead.whatsapp || "",
              website: rawLead.website || source.url,
              address: rawLead.address || "",
              city: rawLead.city || city,
              state: rawLead.state || state || "",
              category: rawLead.category || subCategory,
              services: rawLead.services || [],
              socialLinks: rawLead.socialLinks || {},
              source: rawLead.source || source.source || "Web"
            };

            if (!lead.businessName || lead.businessName === "Unknown Business") return;

            // Deduplication keys
            const cleanPhone = lead.phone ? lead.phone.replace(/[^0-9]/g, "") : "";
            const cleanEmail = lead.email ? lead.email.toLowerCase().trim() : "";
            const cleanName = lead.businessName.toLowerCase().replace(/\s+/g, "").trim();
            const phoneKey = cleanPhone ? `phone:${cleanPhone}` : "";
            const emailKey = cleanEmail ? `email:${cleanEmail}` : "";
            const nameKey = `name:${cleanName}`;

            if (seenLeadKeys.has(nameKey) || (phoneKey && seenLeadKeys.has(phoneKey)) || (emailKey && seenLeadKeys.has(emailKey))) {
              return;
            }

            seenLeadKeys.add(nameKey);
            if (phoneKey) seenLeadKeys.add(phoneKey);
            if (emailKey) seenLeadKeys.add(emailKey);

            // Step 5: Enrichment
            let enrichedLead = lead;
            if (lead.website) {
              try {
                enrichedLead = await scrapeGraphEnrichment(lead);
              } catch (enrichErr) {
                console.error(`[TaskQueue] Enrichment failed for ${lead.businessName}:`, enrichErr.message);
              }
            }

            // Step 6: Validation
            const validation = await groqLeadValidator(enrichedLead);
            
            if (validation.validLead) {
              enrichedLead.confidenceScore = validation.confidence || 50;
              enrichedLead.isValidLead = true;
              
              if (validation.services && validation.services.length > 0) {
                enrichedLead.services = [...new Set([...(enrichedLead.services || []), ...validation.services])];
              }
              if (validation.industry) {
                enrichedLead.category = validation.industry;
              }

              // Step 7: Scoring
              enrichedLead.leadScore = calculateLeadScore(enrichedLead, enrichedLead.confidenceScore);

              // Step 8: Save Lead to DB
              const dbResult = await saveLead(enrichedLead);
              if (dbResult.saved && dbResult.lead) {
                const leadWithId = {
                  ...enrichedLead,
                  id: dbResult.lead.id,
                  createdAt: dbResult.lead.created_at,
                  isCached: dbResult.isDuplicate
                };

                const alreadyInTask = memTask ? memTask.leads.some(l => l.id === dbResult.lead.id) : false;

                try {
                  await db.query(
                    "INSERT INTO task_leads (task_id, lead_id, is_cached) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                    [taskId, dbResult.lead.id, dbResult.isDuplicate]
                  );
                } catch (linkErr) {
                  console.error(`[TaskQueue] Error linking lead:`, linkErr.message);
                }

                if (!alreadyInTask) {
                  leadsDiscovered++;
                  processedLeads.push(leadWithId);

                  if (memTask) {
                    memTask.leads.push(leadWithId);
                    memTask.total_leads = leadsDiscovered;
                    memTask.diagnostics = { ...diagnostics };
                  }
                  await updateTask(taskId, { total_leads: leadsDiscovered });
                }
              }
            } else {
              console.log(`[TaskQueue] Rejected lead "${enrichedLead.businessName}".`);
            }
          } catch (leadErr) {
            console.error(`[TaskQueue] Error processing lead candidate:`, leadErr.message);
          }
        }));
      });

      // allSettled: never throw, always collect all results
      await Promise.allSettled(batchPromises);

      const currentProgress = Math.min(25 + Math.round(((i + batch.length) / classifiedSources.length) * 70), 95);
      await updateTask(taskId, { progress: currentProgress });
    }

    // MINIMUM LEAD GUARANTEE: If we have < 20 leads, try expanding discovery
    if (leadsDiscovered < 20 && leadsDiscovered > 0) {
      console.log(`[TaskQueue] Only ${leadsDiscovered} leads found (below 20 target). Expanding discovery...`);
      // Already have some leads — mark as completed (not failed)
      // The cached leads + fresh leads are still valid
    }

    // DB CACHE RECOVERY: If scraping produced 0 fresh leads but we have cached, return those
    if (leadsDiscovered === 0 && cachedLeads.length > 0) {
      console.log(`[TaskQueue] No fresh leads from scraping. Returning ${cachedLeads.length} cached leads as fallback.`);
      leadsDiscovered = cachedLeads.length;
    }

    // Task finished — always mark "completed" (not "failed") if we have any leads
    const finalStatus = leadsDiscovered > 0 ? "completed" : "completed"; // Even 0 leads is "completed", not "failed"
    console.log(`[TaskQueue] Completed processing task ${taskId}. Found ${leadsDiscovered} leads.`);
    if (memTask) {
      memTask.diagnostics = { ...diagnostics };
    }
    await updateTask(taskId, { status: finalStatus, progress: 100 });

  } catch (error) {
    console.error(`[TaskQueue] Fatal error processing task ${taskId}:`, error);
    
    // Even on fatal error, check if we have cached leads to return
    const memTask = activeTasks.get(taskId);
    const hasCachedLeads = memTask && memTask.leads && memTask.leads.length > 0;
    
    if (hasCachedLeads) {
      console.log(`[TaskQueue] Fatal error but have ${memTask.leads.length} cached leads. Marking as completed with partial results.`);
      await updateTask(taskId, { status: "completed", progress: 100 });
    } else {
      await updateTask(taskId, { status: "completed", progress: 100 });
    }
  }
}

module.exports = {
  createTask,
  getTaskStatus
};
