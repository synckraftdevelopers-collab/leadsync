const sourceMap = require("../config/sourceMap");
const getGoogleLeads = require("../scrapers/google/getLeads");
const getJustDialLeads = require("../scrapers/justdial/getLeads");
const getPractoLeads = require("../scrapers/practo/getLeads");
const removeDuplicates = require("./removeDuplicates");

/**
 * Lead Orchestrator
 * Runs multiple scrapers in parallel based on source configuration and merges results.
 * 
 * @param {object} parsedQuery - { category, subCategory, city }
 * @returns {Promise<Array>} - Array of merged lead objects
 */
async function leadOrchestrator(parsedQuery) {
  const { category, subCategory, city } = parsedQuery;
  const searchTerm = subCategory || category;

  if (!category) {
    console.warn("[LeadOrchestrator] No category provided. Defaulting to google scraper.");
    return await getGoogleLeads(searchTerm, city);
  }

  // Look up mapped sources using lowercase category (e.g. "healthcare")
  const normCategory = category.toLowerCase().trim();
  const sources = sourceMap[normCategory] || [];

  console.log(`[LeadOrchestrator] Category "${normCategory}" resolved to sources:`, sources);

  const promises = [];

  for (const source of sources) {
    if (source === "google") {
      console.log(`[LeadOrchestrator] Adding Google source for "${searchTerm}" in "${city}"`);
      promises.push(getGoogleLeads(searchTerm, city));
    } else if (source === "justdial") {
      console.log(`[LeadOrchestrator] Adding JustDial source for "${searchTerm}" in "${city}"`);
      promises.push(getJustDialLeads(searchTerm, city));
    } else if (source === "practo") {
      console.log(`[LeadOrchestrator] Adding Practo source for "${searchTerm}" in "${city}"`);
      promises.push(getPractoLeads(searchTerm, city));
    }
  }

  // Default to Google if no source is mapped or promises array is empty
  if (promises.length === 0) {
    console.log(`[LeadOrchestrator] No scraper mapped for category "${normCategory}". Defaulting to Google.`);
    promises.push(getGoogleLeads(searchTerm, city));
  }

  // Run all scrapers in parallel
  console.log(`[LeadOrchestrator] Initiating parallel execution of ${promises.length} scrapers...`);
  const results = await Promise.all(promises);

  // Flatten the results array
  const mergedLeads = results.flat();
  console.log(`[LeadOrchestrator] Parallel scrape completed. Total merged leads: ${mergedLeads.length}`);

  // Apply duplicate removal
  const uniqueLeads = removeDuplicates(mergedLeads);
  console.log(`[LeadOrchestrator] Deduplication complete. Remaining unique leads: ${uniqueLeads.length}`);

  return uniqueLeads;
}

module.exports = leadOrchestrator;
