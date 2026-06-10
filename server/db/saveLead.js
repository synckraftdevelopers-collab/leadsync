const db = require("./db");

async function saveLead(lead) {
  try {
    // Check if unique combination of business_name, email, and phone already exists
    const checkDup = await db.query(
      `SELECT 1 FROM leads WHERE 
       business_name = $1 
       AND (email = $2 OR (email IS NULL AND $2::text IS NULL)) 
       AND (phone = $3 OR (phone IS NULL AND $3::text IS NULL))`,
      [lead.businessName, lead.email, lead.phone]
    );

    const servicesParam = lead.services ? (typeof lead.services === "string" ? lead.services : JSON.stringify(lead.services)) : null;
    const socialLinksParam = lead.socialLinks ? (typeof lead.socialLinks === "string" ? lead.socialLinks : JSON.stringify(lead.socialLinks)) : null;

    if (checkDup.rows.length === 0) {
      const res = await db.query(
        `INSERT INTO leads (business_name, owner_name, email, phone, website, address, city, category, source, confidence_score, is_valid_lead, whatsapp, state, services, social_links, lead_score) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          lead.businessName,
          lead.ownerName || null,
          lead.email || null,
          lead.phone || null,
          lead.website || null,
          lead.address || null,
          lead.city || null,
          lead.category || lead.industry || null,
          lead.source || "Unknown",
          lead.confidenceScore !== undefined ? lead.confidenceScore : null,
          lead.isValidLead !== undefined ? lead.isValidLead : true,
          lead.whatsapp || null,
          lead.state || null,
          servicesParam,
          socialLinksParam,
          lead.leadScore !== undefined ? lead.leadScore : null
        ]
      );
      console.log(`[Database] Saved new lead: ${lead.businessName}`);
      return { saved: true, lead: res.rows[0] };
    } else {
      console.log(`[Database] Skipped duplicate lead: ${lead.businessName}`);
      return { saved: false, reason: "duplicate" };
    }
  } catch (err) {
    console.error(`[Database] Error saving lead ${lead.businessName || 'Unknown'}:`, err.message);
    throw err;
  }
}

module.exports = saveLead;

