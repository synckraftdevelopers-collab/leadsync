/**
 * Lead Scorer
 * Calculates a lead score between 0 and 100 based on data completeness, validation confidence, and source credibility.
 * 
 * Rules:
 * - Website availability: +15 points
 * - Email availability: +25 points
 * - Phone availability: +20 points
 * - Address availability: +15 points
 * - AI validation confidence: +15 points (scaled from confidence score)
 * - Source credibility: +10 points (for trusted directories like google, justdial, indiamart, etc.)
 */
function calculateLeadScore(lead, confidenceScore = 50) {
  let score = 0;

  // 1. Data Availability
  if (lead.website) score += 15;
  if (lead.email) score += 25;
  if (lead.phone) score += 20;
  if (lead.address) score += 15;

  // 2. AI Validation Confidence (scale 0-100 to 0-15)
  const validationWeight = Math.round((confidenceScore / 100) * 15);
  score += validationWeight;

  // 3. Source Credibility (+10 points for reliable sources)
  const trustedSources = [
    "google", "justdial", "indiamart", "practo", "sulekha", 
    "tradeindia", "realestateindia", "crunchbase", "yellowpages", "yelp"
  ];
  
  const sourceLower = String(lead.source || "").toLowerCase();
  const isTrusted = trustedSources.some(ts => sourceLower.includes(ts));
  if (isTrusted) {
    score += 10;
  }

  // Ensure score is clamped between 0 and 100
  return Math.min(Math.max(score, 0), 100);
}

module.exports = calculateLeadScore;
