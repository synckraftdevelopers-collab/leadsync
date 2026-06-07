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

    if (checkDup.rows.length === 0) {
      const res = await db.query(
        `INSERT INTO leads (business_name, owner_name, email, phone, website, address, city, category, source, confidence_score, is_valid_lead) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          lead.businessName,
          lead.ownerName,
          lead.email,
          lead.phone,
          lead.website,
          lead.address,
          lead.city,
          lead.category || lead.industry || null,
          lead.source,
          lead.confidenceScore || null,
          lead.isValidLead !== undefined ? lead.isValidLead : true
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
