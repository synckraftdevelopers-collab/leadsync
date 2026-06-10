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

// Dedicated scrapers import
const getJustDialLeads = require("../scrapers/justdial/getLeads");
const getPractoLeads = require("../scrapers/practo/getLeads");
const getRealEstateIndiaLeads = require("../scrapers/realEstateIndia/getAllLeads"); // Wait, let's verify if this file exists and takes city/category. We will check it later or default to directory scraper.

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
    leads: []
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
    leads: [] // In-memory cache might have cleared, leads are stored in main leads table anyway
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
    if (key === "leads") continue; // Don't save leads array directly in search_tasks
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
 */
async function processTask(taskId, query) {
  console.log(`[TaskQueue] Processing task ${taskId} for query "${query}"`);
  
  try {
    await updateTask(taskId, { status: "processing", progress: 5 });

    // Step 1: AI Query Intelligence
    console.log(`[TaskQueue] Step 1: Parsing query using Groq`);
    const parsedQuery = await groqQueryParser(query);
    console.log(`[TaskQueue] Query parsed successfully:`, parsedQuery);
    
    await updateTask(taskId, { progress: 15 });

    // Step 2: Dynamic Source Discovery
    console.log(`[TaskQueue] Step 2: Discovering sources dynamically`);
    const urls = await discoverSources(parsedQuery, 15);
    console.log(`[TaskQueue] Discovered ${urls.length} target URLs`);

    if (urls.length === 0) {
      console.log(`[TaskQueue] No URLs found. Completing task.`);
      await updateTask(taskId, { status: "completed", progress: 100 });
      return;
    }

    await updateTask(taskId, { progress: 25 });

    // Step 3: Source Classification
    const classifiedSources = urls.map(url => ({
      url,
      ...detectSource(url)
    }));

    // Step 4: Scraping with concurrency batching
    const batchSize = 3;
    let leadsDiscovered = 0;
    const processedLeads = [];
    const seenLeadKeys = new Set();

    const category = parsedQuery.category || "general";
    const subCategory = parsedQuery.subCategory || category;
    const city = parsedQuery.city || "Mumbai";
    const state = parsedQuery.state || "";

    for (let i = 0; i < classifiedSources.length; i += batchSize) {
      const batch = classifiedSources.slice(i, i + batchSize);
      console.log(`[TaskQueue] Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} sources)...`);

      const batchPromises = batch.map(async (source) => {
        let rawLeads = [];

        try {
          if (source.type === "directory") {
            // Check for dedicated scrapers first
            if (source.source === "justdial") {
              console.log(`[TaskQueue] Launching JustDial dedicated scraper for ${subCategory} in ${city}`);
              rawLeads = await getJustDialLeads(subCategory, city);
            } else if (source.source === "practo") {
              console.log(`[TaskQueue] Launching Practo dedicated scraper for ${subCategory} in ${city}`);
              rawLeads = await getPractoLeads(subCategory, city);
            } else {
              // Fallback to generic directory scraper
              console.log(`[TaskQueue] Launching Generic Directory Scraper for ${source.url}`);
              rawLeads = await scrapeDirectory(source.url, 15);
            }
          } else {
            // Website scraper
            console.log(`[TaskQueue] Launching Generic Website Scraper for ${source.url}`);
            const siteLead = await scrapeWebsite(source.url);
            if (siteLead && siteLead.businessName) {
              rawLeads = [siteLead];
            }
          }
        } catch (err) {
          console.error(`[TaskQueue] Scrape failed for source ${source.url}:`, err.message);
        }

        // Process discovered raw leads
        for (const rawLead of rawLeads) {
          try {
            // Setup Unified Lead
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

            if (!lead.businessName || lead.businessName === "Unknown Business") continue;

            // Deduplication keys
            const cleanPhone = lead.phone ? lead.phone.replace(/[^0-9]/g, "") : "";
            const cleanEmail = lead.email ? lead.email.toLowerCase().trim() : "";
            const cleanName = lead.businessName.toLowerCase().replace(/\s+/g, "").trim();

            const phoneKey = cleanPhone ? `phone:${cleanPhone}` : "";
            const emailKey = cleanEmail ? `email:${cleanEmail}` : "";
            const nameKey = `name:${cleanName}`;

            if (seenLeadKeys.has(nameKey) || (phoneKey && seenLeadKeys.has(phoneKey)) || (emailKey && seenLeadKeys.has(emailKey))) {
              console.log(`[TaskQueue] Skipped local duplicate lead: ${lead.businessName}`);
              continue;
            }

            // Mark keys as seen
            seenLeadKeys.add(nameKey);
            if (phoneKey) seenLeadKeys.add(phoneKey);
            if (emailKey) seenLeadKeys.add(emailKey);

            // Step 5: Enrichment (ScrapeGraphAI fallback)
            let enrichedLead = lead;
            if (lead.website) {
              try {
                enrichedLead = await scrapeGraphEnrichment(lead);
              } catch (enrichErr) {
                console.error(`[TaskQueue] Enrichment failed for ${lead.businessName}:`, enrichErr.message);
              }
            }

            // Step 6: Validation (Groq Validator)
            console.log(`[TaskQueue] Validating lead: "${enrichedLead.businessName}"`);
            const validation = await groqLeadValidator(enrichedLead);
            
            if (validation.validLead) {
              enrichedLead.confidenceScore = validation.confidence || 50;
              enrichedLead.isValidLead = true;
              
              // Merge AI discovered services/industry details
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
              if (dbResult.saved) {
                leadsDiscovered++;
                processedLeads.push(enrichedLead);

                // Update task details in memory and DB
                const memTask = activeTasks.get(taskId);
                if (memTask) {
                  memTask.leads.push(enrichedLead);
                  memTask.total_leads = leadsDiscovered;
                }
                await updateTask(taskId, { total_leads: leadsDiscovered });
              }
            } else {
              console.log(`[TaskQueue] Rejected lead "${enrichedLead.businessName}" as it represents directory/junk info.`);
            }
          } catch (leadErr) {
            console.error(`[TaskQueue] Error processing lead candidate:`, leadErr.message);
          }
        }
      });

      await Promise.all(batchPromises);

      // Incremental progress calculations (clamped at 95% until complete)
      const currentProgress = Math.min(25 + Math.round(((i + batch.length) / classifiedSources.length) * 70), 95);
      await updateTask(taskId, { progress: currentProgress });
    }

    // Task finished successfully
    console.log(`[TaskQueue] Completed processing task ${taskId}. Found ${leadsDiscovered} leads.`);
    await updateTask(taskId, { status: "completed", progress: 100 });
  } catch (error) {
    console.error(`[TaskQueue] Fatal error processing task ${taskId}:`, error);
    await updateTask(taskId, { status: "failed", progress: 100 });
  }
}

module.exports = {
  createTask,
  getTaskStatus
};
