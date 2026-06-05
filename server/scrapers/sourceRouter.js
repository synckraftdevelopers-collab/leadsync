const sourceMap = require("../config/sourceMap");
const getAllLeadsREI = require("./realEstateIndia/getAllLeads");
const getAllLeadsJD = require("./justdial/getAllLeads");
const getAllLeadsIM = require("./indiamart/getAllLeads");
const getAllLeadsPR = require("./practo/getAllLeads");

async function sourceRouter(category, city) {
  console.log(`[SourceRouter] Routing category: "${category}" for city: "${city}"`);
  
  const sources = sourceMap[category] || [];
  console.log(`[SourceRouter] Category "${category}" mapped to sources:`, sources);

  let allLeads = [];

  for (const source of sources) {
    if (source === "realestateindia") {
      try {
        console.log(`[SourceRouter] Launching RealEstateIndia scraper for city: ${city}`);
        const leads = await getAllLeadsREI(city);
        allLeads = allLeads.concat(leads);
      } catch (err) {
        console.error(`[SourceRouter] Error running RealEstateIndia scraper:`, err.message);
      }
    } else if (source === "justdial") {
      try {
        console.log(`[SourceRouter] Launching JustDial scraper for category: ${category}, city: ${city}`);
        const leads = await getAllLeadsJD(category, city);
        allLeads = allLeads.concat(leads);
      } catch (err) {
        console.error(`[SourceRouter] Error running JustDial scraper:`, err.message);
      }
    } else if (source === "indiamart") {
      try {
        console.log(`[SourceRouter] Launching IndiaMART scraper for category: ${category}, city: ${city}`);
        const leads = await getAllLeadsIM(category, city);
        allLeads = allLeads.concat(leads);
      } catch (err) {
        console.error(`[SourceRouter] Error running IndiaMART scraper:`, err.message);
      }
    } else if (source === "practo") {
      try {
        console.log(`[SourceRouter] Launching Practo scraper for category: ${category}, city: ${city}`);
        const leads = await getAllLeadsPR(category, city);
        allLeads = allLeads.concat(leads);
      } catch (err) {
        console.error(`[SourceRouter] Error running Practo scraper:`, err.message);
      }
    }
    // Future scrapers (e.g. practo, indiamart) will go here as they are built
  }

  console.log(`[SourceRouter] Merged a total of ${allLeads.length} leads. Running deduplication...`);

  // Remove duplicates based on phone, email, and business name
  const uniqueLeads = [];
  const seenKeys = new Set();

  for (const rawLead of allLeads) {
    // Enforce the Unified Lead Model schema structure
    const lead = {
      businessName: rawLead.businessName || "Unknown",
      ownerName: rawLead.ownerName || "",
      email: rawLead.email || "",
      phone: rawLead.phone || "",
      website: rawLead.website || "",
      address: rawLead.address || "",
      city: rawLead.city || city,
      category: rawLead.category || category,
      source: rawLead.source || "Unknown"
    };

    if (!lead.businessName) continue;

    // Normalised keys for deduplication (strip out extension text/separators for phone mapping)
    const basePhone = lead.phone ? lead.phone.split(/ext|\(|,/i)[0] : "";
    const phoneKey = basePhone ? basePhone.replace(/[^0-9]/g, "") : "";
    const emailKey = lead.email ? lead.email.toLowerCase().trim() : "";
    const nameKey = lead.businessName.toLowerCase().replace(/\s+/g, "").trim();

    let isDuplicate = false;
    
    // Check constraints
    if (phoneKey && seenKeys.has(`phone:${phoneKey}`)) {
      isDuplicate = true;
    }
    if (emailKey && seenKeys.has(`email:${emailKey}`)) {
      isDuplicate = true;
    }
    if (nameKey && seenKeys.has(`name:${nameKey}`)) {
      isDuplicate = true;
    }

    if (!isDuplicate) {
      uniqueLeads.push(lead);
      if (phoneKey) seenKeys.add(`phone:${phoneKey}`);
      if (emailKey) seenKeys.add(`email:${emailKey}`);
      seenKeys.add(`name:${nameKey}`);
    } else {
      console.log(`[SourceRouter] Skipped duplicate lead: ${lead.businessName} (Phone: ${lead.phone || 'N/A'}, Email: ${lead.email || 'N/A'})`);
    }
  }

  console.log(`[SourceRouter] Deduplication complete. Returning ${uniqueLeads.length} unique leads.`);
  return uniqueLeads;
}

module.exports = sourceRouter;
