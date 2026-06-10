const db = require("./db");
const { validateAndFormatPhone, validateEmail } = require("../utils/validator");
const calculateLeadScore = require("../services/leadScorer");

async function saveLead(lead) {
  try {
    const cleanPhone = validateAndFormatPhone(lead.phone);
    const cleanEmail = validateEmail(lead.email);
    const cleanWhatsapp = validateAndFormatPhone(lead.whatsapp);

    // Uniqueness checks: website, phone, email, or (businessName + city)
    const conditions = [];
    const params = [];

    if (lead.website) {
      params.push(lead.website);
      conditions.push(`website = $${params.length}`);
    }
    if (cleanPhone) {
      params.push(cleanPhone);
      conditions.push(`phone = $${params.length}`);
    }
    if (cleanEmail) {
      params.push(cleanEmail);
      conditions.push(`email = $${params.length}`);
    }
    if (lead.businessName && lead.city) {
      params.push(lead.businessName, lead.city);
      conditions.push(`(business_name = $${params.length - 1} AND city = $${params.length})`);
    }

    let checkDup = { rows: [] };
    if (conditions.length > 0) {
      checkDup = await db.query(
        `SELECT * FROM leads WHERE ${conditions.join(" OR ")} LIMIT 1`,
        params
      );
    }

    if (checkDup.rows.length === 0) {
      const computedLeadScore = calculateLeadScore({
        website: lead.website || null,
        email: cleanEmail,
        phone: cleanPhone,
        address: lead.address || null
      }, lead.confidenceScore || 50);

      const res = await db.query(
        `INSERT INTO leads (business_name, owner_name, email, phone, website, address, city, category, source, confidence_score, is_valid_lead, whatsapp, state, services, social_links, lead_score) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          lead.businessName,
          lead.ownerName || null,
          cleanEmail,
          cleanPhone,
          lead.website || null,
          lead.address || null,
          lead.city || null,
          lead.category || lead.industry || null,
          lead.source || "Unknown",
          lead.confidenceScore !== undefined ? lead.confidenceScore : null,
          lead.isValidLead !== undefined ? lead.isValidLead : true,
          cleanWhatsapp,
          lead.state || null,
          JSON.stringify(lead.services || []),
          JSON.stringify(lead.socialLinks || {}),
          computedLeadScore
        ]
      );
      console.log(`[Database] Saved new lead: ${lead.businessName}`);
      return { saved: true, lead: res.rows[0], isDuplicate: false };
    } else {
      const existing = checkDup.rows[0];

      // Merge fields (COALESCE new fields into existing null ones)
      const mergedOwner = existing.owner_name || lead.ownerName || null;
      const mergedEmail = existing.email || cleanEmail || null;
      const mergedPhone = existing.phone || cleanPhone || null;
      const mergedWebsite = existing.website || lead.website || null;
      const mergedAddress = existing.address || lead.address || null;
      const mergedCity = existing.city || lead.city || null;
      const mergedState = existing.state || lead.state || null;
      const mergedWhatsapp = existing.whatsapp || cleanWhatsapp || null;

      let mergedServices = existing.services || [];
      if (lead.services && Array.isArray(lead.services)) {
        mergedServices = [...new Set([...mergedServices, ...lead.services])];
      }

      let mergedSocialLinks = existing.social_links || {};
      if (lead.socialLinks && typeof lead.socialLinks === "object") {
        mergedSocialLinks = { ...lead.socialLinks, ...mergedSocialLinks };
      }

      // Improve confidence score
      const newConfidence = Math.max(existing.confidence_score || 0, lead.confidenceScore || 0);

      // Recalculate lead score
      const newLeadScore = calculateLeadScore({
        website: mergedWebsite,
        email: mergedEmail,
        phone: mergedPhone,
        address: mergedAddress
      }, newConfidence);

      const updateRes = await db.query(
        `UPDATE leads SET
           owner_name = $1,
           email = $2,
           phone = $3,
           website = $4,
           address = $5,
           city = $6,
           state = $7,
           whatsapp = $8,
           services = $9,
           social_links = $10,
           confidence_score = $11,
           lead_score = $12
         WHERE id = $13
         RETURNING *`,
        [
          mergedOwner,
          mergedEmail,
          mergedPhone,
          mergedWebsite,
          mergedAddress,
          mergedCity,
          mergedState,
          mergedWhatsapp,
          JSON.stringify(mergedServices),
          JSON.stringify(mergedSocialLinks),
          newConfidence,
          newLeadScore,
          existing.id
        ]
      );

      console.log(`[Database] Handled duplicate and updated existing lead: ${lead.businessName}`);
      return { saved: true, lead: updateRes.rows[0], isDuplicate: true };
    }
  } catch (err) {
    console.error(`[Database] Error saving lead ${lead.businessName || 'Unknown'}:`, err.message);
    throw err;
  }
}

module.exports = saveLead;

