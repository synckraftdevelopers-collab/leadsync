const sourceMap = require("../config/sourceMap");
const getGoogleLeads = require("../scrapers/google/getLeads");
const getJustDialLeads = require("../scrapers/justdial/getLeads");
const getPractoLeads = require("../scrapers/practo/getLeads");
const removeDuplicates = require("./removeDuplicates");
const withRetry = require("./sourceRetry");
const { isSourceHealthy, recordSourceOutcome } = require("./sourceHealth");

/**
 * Lead Orchestrator
 * Runs multiple scrapers with source isolation (one failure won't block others).
 * Uses Promise.allSettled so failed sources are skipped gracefully.
 * Applies retry wrapper with exponential backoff.
 * Skips sources that are currently disabled by health monitor.
 * 
 * @param {object} parsedQuery - { category, subCategory, city }
 * @returns {Promise<Array>} - Array of merged lead objects
 */
async function leadOrchestrator(parsedQuery) {
  const { category, subCategory, city } = parsedQuery;
  const searchTerm = subCategory || category;
  const queryStr = `${searchTerm} in ${city}`;

  if (!category) {
    console.warn("[LeadOrchestrator] No category provided. Defaulting to google scraper.");
    return await withRetry(() => getGoogleLeads(searchTerm, city), "google", queryStr);
  }

  const normCategory = category.toLowerCase().trim();
  const sources = sourceMap[normCategory] || [];

  console.log(`[LeadOrchestrator] Category "${normCategory}" resolved to sources:`, sources);

  // Build source promises with health check + retry
  const sourcePromises = [];

  for (const source of sources) {
    // Skip disabled sources
    if (!isSourceHealthy(source)) {
      console.log(`[LeadOrchestrator] Skipping disabled source: ${source}`);
      continue;
    }

    let scraperFn;
    if (source === "google") {
      console.log(`[LeadOrchestrator] Adding Google source for "${searchTerm}" in "${city}"`);
      scraperFn = () => getGoogleLeads(searchTerm, city);
    } else if (source === "justdial") {
      console.log(`[LeadOrchestrator] Adding JustDial source for "${searchTerm}" in "${city}"`);
      scraperFn = () => getJustDialLeads(searchTerm, city);
    } else if (source === "practo") {
      console.log(`[LeadOrchestrator] Adding Practo source for "${searchTerm}" in "${city}"`);
      scraperFn = () => getPractoLeads(searchTerm, city);
    }

    if (scraperFn) {
      sourcePromises.push(
        withRetry(scraperFn, source, queryStr)
          .catch(err => {
            // This catch is a final safety net — withRetry already returns [] on failure
            console.error(`[LeadOrchestrator] Unexpected error from ${source}:`, err.message);
            return [];
          })
      );
    }
  }

  // Default to Google if no source is mapped or all sources disabled
  if (sourcePromises.length === 0) {
    console.log(`[LeadOrchestrator] No healthy scraper mapped for category "${normCategory}". Defaulting to Google.`);
    sourcePromises.push(
      withRetry(() => getGoogleLeads(searchTerm, city), "google", queryStr)
        .catch(() => [])
    );
  }

  // Run all scrapers with Promise.allSettled for full source isolation
  console.log(`[LeadOrchestrator] Initiating parallel execution of ${sourcePromises.length} scrapers...`);
  const settledResults = await Promise.allSettled(sourcePromises);

  // Collect successful results (allSettled never rejects)
  const mergedLeads = [];
  for (const result of settledResults) {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      mergedLeads.push(...result.value);
    } else if (result.status === "rejected") {
      console.error(`[LeadOrchestrator] Source rejected:`, result.reason?.message || "Unknown error");
    }
  }

  console.log(`[LeadOrchestrator] Parallel scrape completed. Total merged leads: ${mergedLeads.length}`);

  // Apply duplicate removal
  const uniqueLeads = removeDuplicates(mergedLeads);
  console.log(`[LeadOrchestrator] Deduplication complete. Remaining unique leads: ${uniqueLeads.length}`);

  return uniqueLeads;
}

module.exports = leadOrchestrator;
