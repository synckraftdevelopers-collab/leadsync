/**
 * Normalizes phone numbers to standard 10-digit format for comparison.
 */
function normalizePhone(phone) {
  if (!phone) return "";
  let clean = phone.toString().replace(/[^0-9]/g, "");
  if (clean.length === 12 && clean.startsWith("91")) {
    clean = clean.substring(2);
  } else if (clean.length === 11 && clean.startsWith("0")) {
    clean = clean.substring(1);
  }
  return clean;
}

/**
 * Normalizes email address.
 */
function normalizeEmail(email) {
  if (!email) return "";
  return email.toString().toLowerCase().trim();
}

/**
 * Normalizes website URLs to compare raw domains/paths.
 */
function normalizeUrl(url) {
  if (!url) return "";
  try {
    let clean = url.toString().toLowerCase().trim();
    clean = clean.replace(/^(https?:\/\/)?(www\.)?/, "");
    clean = clean.replace(/\/$/, "");
    return clean;
  } catch (e) {
    return url;
  }
}

/**
 * Removes duplicate leads from a list.
 * Match criteria: Same Phone OR Same Email OR Same Website.
 * Empty values are ignored.
 *
 * @param {Array} leads - List of lead objects
 * @returns {Array} - List of unique lead objects
 */
function removeDuplicates(leads) {
  if (!Array.isArray(leads)) return [];

  const unique = [];
  const seenPhones = new Set();
  const seenEmails = new Set();
  const seenWebsites = new Set();

  for (const lead of leads) {
    const phone = normalizePhone(lead.phone);
    const email = normalizeEmail(lead.email);
    const website = normalizeUrl(lead.website);

    let isDuplicate = false;

    if (phone && seenPhones.has(phone)) {
      isDuplicate = true;
    }
    if (email && seenEmails.has(email)) {
      isDuplicate = true;
    }
    if (website && seenWebsites.has(website)) {
      isDuplicate = true;
    }

    if (isDuplicate) {
      console.log(`[Deduplication] Removed duplicate lead: "${lead.businessName}" (Phone: "${lead.phone || ''}", Email: "${lead.email || ''}", Website: "${lead.website || ''}")`);
      continue;
    }

    // Add to seen sets
    if (phone) seenPhones.add(phone);
    if (email) seenEmails.add(email);
    if (website) seenWebsites.add(website);

    unique.push(lead);
  }

  return unique;
}

module.exports = removeDuplicates;
