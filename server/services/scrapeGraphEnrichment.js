const axios = require("axios");
const scrapeWebsite = require("./websiteScraper");

/**
 * Enriches a lead with details extracted from its website using ScrapeGraphAI v2 API.
 * Falls back to local websiteScraper if api key is not set or request fails.
 * 
 * @param {object} lead - The lead object to enrich
 * @returns {Promise<object>} - Enriched lead object
 */
async function scrapeGraphEnrichment(lead) {
  const website = lead.website || lead.url;
  if (!website) {
    return lead;
  }

  const apiKey = process.env.SCRAPEGRAPH_API_KEY || process.env.SGAI_API_KEY;

  if (!apiKey) {
    console.log(`[ScrapeGraphEnrichment] No SCRAPEGRAPH_API_KEY or SGAI_API_KEY in .env. Using local scraper fallback...`);
    return await runLocalFallback(lead, website);
  }

  console.log(`[ScrapeGraphEnrichment] Requesting ScrapeGraphAI v2 API for "${lead.businessName}" (${website})...`);

  try {
    const response = await axios.post(
      "https://v2-api.scrapegraphai.com/api/extract",
      {
        url: website,
        prompt: "Extract the business name, owner's name, contact email, contact phone number, WhatsApp number, physical address, state/region, key services offered, and social media profile URLs (LinkedIn, Facebook, Instagram, Twitter) from the page.",
        schema: {
          type: "object",
          properties: {
            businessName: { type: "string", description: "The name of the business" },
            ownerName: { type: "string", description: "The name of the business owner, founder, or key practitioner" },
            email: { type: "string", description: "Business contact email" },
            phone: { type: "string", description: "Business contact phone number" },
            whatsapp: { type: "string", description: "WhatsApp contact number" },
            address: { type: "string", description: "Physical address of the business" },
            state: { type: "string", description: "State or province" },
            services: {
              type: "array",
              items: { type: "string" },
              description: "List of key services or products offered"
            },
            socialLinks: {
              type: "object",
              properties: {
                linkedin: { type: "string", description: "LinkedIn profile URL" },
                facebook: { type: "string", description: "Facebook page URL" },
                instagram: { type: "string", description: "Instagram profile URL" },
                twitter: { type: "string", description: "Twitter/X profile URL" }
              },
              description: "Social media links"
            }
          }
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          "SGAI-APIKEY": apiKey
        },
        timeout: 25000 // 25 seconds timeout
      }
    );

    if (response.data && response.data.status === "success") {
      const extracted = response.data.data || {};
      
      let parsedData = {};
      if (typeof extracted === "string") {
        try {
          const startIdx = extracted.indexOf("{");
          const endIdx = extracted.lastIndexOf("}");
          if (startIdx !== -1 && endIdx !== -1) {
            parsedData = JSON.parse(extracted.substring(startIdx, endIdx + 1));
          } else {
            parsedData = JSON.parse(extracted);
          }
        } catch (err) {
          console.warn("[ScrapeGraphEnrichment] Could not parse string data as JSON:", err.message);
        }
      } else {
        parsedData = extracted;
      }

      console.log(`[ScrapeGraphEnrichment] Enrichment success for ${website}:`, parsedData);

      return {
        ...lead,
        businessName: lead.businessName && lead.businessName !== "Unknown Business" ? lead.businessName : (parsedData.businessName || lead.businessName),
        ownerName: lead.ownerName || parsedData.ownerName || "",
        email: lead.email || parsedData.email || "",
        phone: lead.phone || parsedData.phone || "",
        whatsapp: lead.whatsapp || parsedData.whatsapp || "",
        address: lead.address || parsedData.address || "",
        state: lead.state || parsedData.state || "",
        services: lead.services && lead.services.length > 0 ? lead.services : (parsedData.services || []),
        socialLinks: lead.socialLinks && Object.keys(lead.socialLinks).length > 0 ? lead.socialLinks : (parsedData.socialLinks || {})
      };
    } else {
      console.warn(`[ScrapeGraphEnrichment] API responded with non-success status:`, response.data);
    }
  } catch (error) {
    console.error(`[ScrapeGraphEnrichment] ScrapeGraphAI API error:`, error.message);
  }

  console.log(`[ScrapeGraphEnrichment] Falling back to local scraper for ${website}...`);
  return await runLocalFallback(lead, website);
}

/**
 * Runs the local scraping fallback logic.
 */
async function runLocalFallback(lead, website) {
  try {
    const localResult = await scrapeWebsite(website);
    return {
      ...lead,
      businessName: lead.businessName && lead.businessName !== "Unknown Business" ? lead.businessName : localResult.businessName,
      ownerName: lead.ownerName || "",
      email: lead.email || localResult.email || "",
      phone: lead.phone || localResult.phone || "",
      whatsapp: lead.whatsapp || localResult.whatsapp || "",
      address: lead.address || localResult.address || "",
      state: lead.state || localResult.state || "",
      services: lead.services && lead.services.length > 0 ? lead.services : (localResult.services || []),
      socialLinks: lead.socialLinks && Object.keys(lead.socialLinks).length > 0 ? lead.socialLinks : (localResult.socialLinks || {})
    };
  } catch (err) {
    console.error(`[ScrapeGraphEnrichment] Local website scraper failed for ${website}:`, err.message);
    return lead;
  }
}

module.exports = scrapeGraphEnrichment;

