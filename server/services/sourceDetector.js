/**
 * Source Detector Service
 * Classifies a URL as either "directory" or "website" based on known patterns.
 * 
 * Directory sites list multiple businesses (JustDial, IndiaMART, Sulekha, etc.)
 * Websites belong to a single business (companywebsite.com)
 */

// Known directory platforms (add more as you discover them)
const DIRECTORY_PATTERNS = [
  // Indian directories
  "justdial.com",
  "indiamart.com",
  "tradeindia.com",
  "sulekha.com",
  "realestateindia.com",
  "99acres.com",
  "magicbricks.com",
  "housing.com",
  "nobroker.in",
  "squareyards.com",
  "commonfloor.com",
  "makaan.com",
  
  // Medical directories
  "practo.com",
  "lybrate.com",
  "doctorinsta.com",
  
  // Global directories
  "yellowpages.com",
  "yelp.com",
  "foursquare.com",
  "thumbtack.com",
  "angieslist.com",
  "bbb.org",
  
  // B2B directories
  "alibaba.com",
  "made-in-china.com",
  "globalsources.com",
  "exportersindia.com",
  
  // Service directories
  "urbanclap.com",
  "urbncompany.com",
  "housejoy.in",
];

/**
 * Detect the source type of a URL
 * @param {string} url - The URL to classify
 * @returns {object} - { type: "directory"|"website", source: string, confidence: number }
 */
function detectSource(url) {
  if (!url || typeof url !== "string") {
    return { type: "website", source: "unknown", confidence: 0 };
  }

  const normalizedUrl = url.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");

  // Check against known directory patterns
  for (const pattern of DIRECTORY_PATTERNS) {
    if (normalizedUrl.includes(pattern)) {
      return {
        type: "directory",
        source: pattern.split(".")[0], // e.g. "justdial" from "justdial.com"
        confidence: 1.0
      };
    }
  }

  // Heuristic checks for unknown directories
  const directorySignals = [
    /\/listing[s]?\//i.test(url),
    /\/directory\//i.test(url),
    /\/category\//i.test(url),
    /\/business\//i.test(url),
    /\/search\?/i.test(url),
    /top.*in.*city/i.test(url),
    /best.*in.*city/i.test(url),
  ];

  const signalCount = directorySignals.filter(Boolean).length;
  if (signalCount >= 2) {
    return {
      type: "directory",
      source: "unknown-directory",
      confidence: 0.7
    };
  }

  // Default: treat as individual website
  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    const sourceName = hostname.split(".")[0];
    return {
      type: "website",
      source: sourceName,
      confidence: 1.0
    };
  } catch (e) {
    return { type: "website", source: "unknown", confidence: 0.5 };
  }
}

module.exports = detectSource;
