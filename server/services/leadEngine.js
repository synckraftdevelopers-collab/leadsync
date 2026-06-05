const discoverSources = require("./sourceDiscovery");
const detectSource = require("./sourceDetector");
const scrapeDirectory = require("./directoryScraper");
const scrapeWebsite = require("./websiteScraper");

/**
 * Lead Engine
 * Orchestrates the full universal lead generation flow:
 *   Query → Source Discovery → Detect Source → Scrape → Merge Leads
 */

/**
 * Deduplicate leads based on phone, email, and business name
 */
function deduplicateLeads(leads) {
  const unique = [];
  const seenKeys = new Set();

  for (const lead of leads) {
    if (!lead.businessName) continue;

    const basePhone = lead.phone ? lead.phone.split(/ext|\(|,/i)[0] : "";
    const phoneKey = basePhone ? basePhone.replace(/[^0-9]/g, "") : "";
    const emailKey = lead.email ? lead.email.toLowerCase().trim() : "";
    const nameKey = lead.businessName.toLowerCase().replace(/\s+/g, "").trim();

    let isDuplicate = false;
    if (phoneKey && seenKeys.has(`phone:${phoneKey}`)) isDuplicate = true;
    if (emailKey && seenKeys.has(`email:${emailKey}`)) isDuplicate = true;
    if (nameKey && seenKeys.has(`name:${nameKey}`)) isDuplicate = true;

    if (!isDuplicate) {
      unique.push(lead);
      if (phoneKey) seenKeys.add(`phone:${phoneKey}`);
      if (emailKey) seenKeys.add(`email:${emailKey}`);
      seenKeys.add(`name:${nameKey}`);
    } else {
      console.log(`[LeadEngine] Skipped duplicate: ${lead.businessName}`);
    }
  }

  return unique;
}

/**
 * Run the full lead generation pipeline
 * @param {string} query - Raw user query (e.g. "architects mumbai")
 * @param {string} category - Parsed category (e.g. "architects")
 * @param {string} city - Parsed city (e.g. "mumbai")
 * @returns {object} - { urls, leads, stats }
 */
async function runLeadEngine(query, category, city) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[LeadEngine] Starting universal lead generation`);
  console.log(`[LeadEngine] Query: "${query}" | Category: "${category}" | City: "${city}"`);
  console.log(`${"=".repeat(60)}\n`);

  // Step 1: Discover sources
  console.log(`[LeadEngine] Step 1: Discovering sources...`);
  const searchQuery = query || `${category} in ${city}`;
  const urls = await discoverSources(searchQuery, 20);

  if (urls.length === 0) {
    console.log("[LeadEngine] No sources found. Aborting.");
    return { urls: [], leads: [], stats: { discovered: 0, directories: 0, websites: 0, totalLeads: 0 } };
  }

  // Step 2: Detect source type for each URL
  console.log(`\n[LeadEngine] Step 2: Classifying ${urls.length} sources...`);
  const classified = urls.map(url => ({
    url,
    ...detectSource(url)
  }));

  const directories = classified.filter(c => c.type === "directory");
  const websites = classified.filter(c => c.type === "website");

  console.log(`[LeadEngine] Found ${directories.length} directories and ${websites.length} websites`);
  classified.forEach(c => {
    console.log(`  [${c.type.toUpperCase()}] ${c.url} (${c.source})`);
  });

  // Step 3: Scrape all sources
  console.log(`\n[LeadEngine] Step 3: Scraping sources...`);
  let allLeads = [];

  // Scrape directories
  for (const dir of directories) {
    try {
      console.log(`\n[LeadEngine] Scraping directory: ${dir.url}`);
      const leads = await scrapeDirectory(dir.url, 20);
      leads.forEach(l => { l.source = dir.source; l.category = category; l.city = city; });
      allLeads = allLeads.concat(leads);
    } catch (err) {
      console.error(`[LeadEngine] Directory scrape failed for ${dir.url}:`, err.message);
    }
  }

  // Scrape websites (limit to 10 to avoid rate limits)
  const websitesToScrape = websites.slice(0, 10);
  for (const site of websitesToScrape) {
    try {
      console.log(`\n[LeadEngine] Scraping website: ${site.url}`);
      const lead = await scrapeWebsite(site.url);
      lead.source = site.source;
      lead.category = category;
      lead.city = city;
      allLeads.push(lead);
    } catch (err) {
      console.error(`[LeadEngine] Website scrape failed for ${site.url}:`, err.message);
    }
  }

  // Step 4: Deduplicate and merge
  console.log(`\n[LeadEngine] Step 4: Merging and deduplicating ${allLeads.length} raw leads...`);
  const uniqueLeads = deduplicateLeads(allLeads);

  const stats = {
    discovered: urls.length,
    directories: directories.length,
    websites: websites.length,
    rawLeads: allLeads.length,
    totalLeads: uniqueLeads.length
  };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`[LeadEngine] Complete! Stats:`, stats);
  console.log(`${"=".repeat(60)}\n`);

  return { urls, leads: uniqueLeads, stats };
}

module.exports = runLeadEngine;
