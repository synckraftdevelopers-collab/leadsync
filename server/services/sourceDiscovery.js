const puppeteer = require("puppeteer");
const browserConfig = require("../config/browser");

/**
 * Source Discovery Service
 * Accepts either a raw query string or a parsed query object.
 * Runs query variations on DuckDuckGo, extracts URLs, and ranks them by relevance.
 */
async function discoverSources(queryInput, maxResults = 25) {
  let category = "";
  let subCategory = "";
  let city = "";
  let state = "";
  let relatedKeywords = [];
  let searchQueries = [];

  if (typeof queryInput === "object" && queryInput !== null) {
    category = queryInput.category || "";
    subCategory = queryInput.subCategory || "";
    city = queryInput.city || "";
    state = queryInput.state || "";
    relatedKeywords = queryInput.relatedKeywords || [];

    const mainTerm = subCategory || category;
    if (mainTerm && city) {
      searchQueries.push(`${mainTerm} in ${city} directory`);
      searchQueries.push(`best ${mainTerm} in ${city} list`);
      searchQueries.push(`${mainTerm} companies in ${city}`);
      
      // Add a query for related keywords
      if (relatedKeywords.length > 0) {
        searchQueries.push(`${relatedKeywords[0]} in ${city}`);
      }
    } else {
      searchQueries.push(queryInput.businessIntent || `${category} ${city}`);
    }
  } else {
    const rawQuery = String(queryInput);
    searchQueries.push(rawQuery);
    // Parse crude category/city from raw query as backup
    category = rawQuery;
  }

  // Deduplicate search queries
  searchQueries = [...new Set(searchQueries)].slice(0, 3);
  console.log(`[SourceDiscovery] Dynamic queries to search:`, searchQueries);

  const browser = await puppeteer.launch(browserConfig);
  const discoveredMap = new Map(); // url -> { title, snippet, rankScore }

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    for (const searchQuery of searchQueries) {
      try {
        console.log(`[SourceDiscovery] Crawling search page for: "${searchQuery}"`);
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
        await page.waitForSelector("a.result__a", { timeout: 8000 }).catch(() => null);

        // Extract title, URL, snippet
        const results = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll(".result"));
          return elements.map((r) => {
            const link = r.querySelector("a.result__a");
            const snippet = r.querySelector(".result__snippet");
            return {
              title: link ? link.innerText.trim() : "",
              url: link ? link.href : null,
              snippet: snippet ? snippet.textContent.trim() : ""
            };
          });
        });

        for (const res of results) {
          if (!res.url || !res.url.startsWith("http")) continue;

          let targetUrl = res.url;
          if (res.url.includes("uddg=")) {
            try {
              const urlObj = new URL(res.url);
              const uddg = urlObj.searchParams.get("uddg");
              if (uddg) targetUrl = decodeURIComponent(uddg);
            } catch (e) {
              // fallback
            }
          }

          // Skip search engines and giant platforms
          const skipDomains = [
            "duckduckgo.com", "google.com", "bing.com", "yahoo.com",
            "wikipedia.org", "youtube.com", "facebook.com", "twitter.com",
            "linkedin.com", "instagram.com", "pinterest.com", "github.com",
            "reddit.com", "quora.com", "medium.com"
          ];

          const isJunk = skipDomains.some((d) => targetUrl.toLowerCase().includes(d));
          if (isJunk) continue;

          // Add to discovery map or update snippet/title
          if (!discoveredMap.has(targetUrl)) {
            discoveredMap.set(targetUrl, {
              url: targetUrl,
              title: res.title,
              snippet: res.snippet,
              score: 0
            });
          }
        }
      } catch (err) {
        console.error(`[SourceDiscovery] Error searching "${searchQuery}":`, err.message);
      }
    }

    // Scoring & Ranking
    const trustedDirectories = [
      "justdial.com", "indiamart.com", "tradeindia.com", "sulekha.com",
      "realestateindia.com", "yellowpages.com", "yelp.com", "practo.com",
      "lybrate.com", "crunchbase.com", "99acres.com", "magicbricks.com",
      "housing.com", "exportersindia.com", "commonfloor.com"
    ];

    const resultsArray = Array.from(discoveredMap.values());
    for (const item of resultsArray) {
      let score = 0;
      const lowerUrl = item.url.toLowerCase();
      const lowerTitle = item.title.toLowerCase();
      const lowerSnippet = item.snippet.toLowerCase();

      // Heuristic 1: Is it a known directory? (Highly valuable for multiple leads)
      const isKnownDir = trustedDirectories.some(dir => lowerUrl.includes(dir));
      if (isKnownDir) {
        score += 80;
      }

      // Heuristic 2: Contains target city name
      if (city && (lowerUrl.includes(city.toLowerCase()) || lowerTitle.includes(city.toLowerCase()) || lowerSnippet.includes(city.toLowerCase()))) {
        score += 30;
      }

      // Heuristic 3: Contains category or sub-category or related keywords
      const terms = [subCategory, category, ...relatedKeywords].filter(Boolean);
      for (const term of terms) {
        const lowerTerm = term.toLowerCase();
        if (lowerUrl.includes(lowerTerm)) score += 20;
        if (lowerTitle.includes(lowerTerm)) score += 15;
        if (lowerSnippet.includes(lowerTerm)) score += 10;
      }

      // Heuristic 4: Is it a directory signals url?
      const isDirSignal = [
        /listing[s]?/i.test(item.url),
        /directory/i.test(item.url),
        /category/i.test(item.url),
        /business/i.test(item.url),
        /search/i.test(item.url),
        /top-10/i.test(item.url),
        /best-of/i.test(item.url)
      ].some(r => r);
      if (isDirSignal) {
        score += 25;
      }

      item.score = score;
    }

    // Sort by score descending
    resultsArray.sort((a, b) => b.score - a.score);

    // Filter to keep top unique root domains (while keeping their highest ranked page URL)
    const seenDomains = new Set();
    const rankedUrls = [];

    for (const item of resultsArray) {
      try {
        const hostname = new URL(item.url).hostname.replace("www.", "");
        // If it's a known directory, we can allow multiple distinct paths, otherwise enforce 1 URL per domain
        const isDir = trustedDirectories.some(dir => hostname.includes(dir));
        if (isDir) {
          rankedUrls.push(item.url);
        } else if (!seenDomains.has(hostname)) {
          seenDomains.add(hostname);
          rankedUrls.push(item.url);
        }
      } catch (e) {
        // skip malformed
      }
    }

    const finalUrls = rankedUrls.slice(0, maxResults);
    console.log(`[SourceDiscovery] Extracted & ranked ${finalUrls.length} source URLs`);
    finalUrls.forEach((u, i) => {
      const detail = discoveredMap.get(u);
      console.log(`  ${i + 1}. [Score: ${detail ? detail.score : 0}] ${u}`);
    });

    return finalUrls;
  } catch (error) {
    console.error("[SourceDiscovery] Fatal error:", error.message);
    return [];
  } finally {
    await browser.close();
  }
}

module.exports = discoverSources;

