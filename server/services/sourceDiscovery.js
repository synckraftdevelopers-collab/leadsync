const puppeteer = require("puppeteer");

/**
 * Source Discovery Service
 * Takes a raw query like "architects mumbai" and returns top URLs from search engines.
 * Uses DuckDuckGo (bypasses Google CAPTCHA on shared IPs).
 */
async function discoverSources(query, maxResults = 20) {
  console.log(`[SourceDiscovery] Searching for: "${query}" (max ${maxResults} results)`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Use DuckDuckGo HTML version for reliability
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for result links
    await page.waitForSelector("a.result__a", { timeout: 15000 }).catch(() => null);

    // Extract raw links
    const rawLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a.result__a"));
      return anchors.map((a) => a.href);
    });

    // Also try to get snippet text for context
    const snippets = await page.evaluate(() => {
      const results = Array.from(document.querySelectorAll(".result"));
      return results.map((r) => {
        const link = r.querySelector("a.result__a");
        const snippet = r.querySelector(".result__snippet");
        return {
          url: link ? link.href : null,
          text: snippet ? snippet.textContent.trim() : ""
        };
      });
    });

    // Resolve DuckDuckGo redirect URLs to actual destinations
    const resolvedUrls = [];
    for (const href of rawLinks) {
      if (!href) continue;

      let targetUrl = href;

      // Extract actual URL from DuckDuckGo redirect
      if (href.includes("uddg=")) {
        try {
          const urlObj = new URL(href);
          const uddg = urlObj.searchParams.get("uddg");
          if (uddg) targetUrl = decodeURIComponent(uddg);
        } catch (e) {
          // fallback to raw href
        }
      }

      // Filter out search engine and junk domains
      const skipDomains = [
        "duckduckgo.com", "google.com", "bing.com", "yahoo.com",
        "wikipedia.org", "youtube.com", "facebook.com", "twitter.com",
        "linkedin.com", "instagram.com", "pinterest.com"
      ];

      const isJunk = skipDomains.some((d) => targetUrl.toLowerCase().includes(d));
      if (targetUrl.startsWith("http") && !isJunk) {
        resolvedUrls.push(targetUrl);
      }
    }

    // Deduplicate by root domain (keep first occurrence per domain)
    const seen = new Set();
    const uniqueUrls = [];
    for (const url of resolvedUrls) {
      try {
        const hostname = new URL(url).hostname.replace("www.", "");
        if (!seen.has(hostname)) {
          seen.add(hostname);
          uniqueUrls.push(url);
        }
      } catch (e) {
        // skip malformed URLs
      }
    }

    const finalUrls = uniqueUrls.slice(0, maxResults);
    console.log(`[SourceDiscovery] Found ${finalUrls.length} unique source URLs`);
    finalUrls.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));

    return finalUrls;
  } catch (error) {
    console.error("[SourceDiscovery] Error:", error.message);
    return [];
  } finally {
    await browser.close();
  }
}

module.exports = discoverSources;
