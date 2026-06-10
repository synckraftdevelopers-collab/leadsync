const db = require("../db/db");
const { recordSourceOutcome } = require("./sourceHealth");

/**
 * Source Retry Wrapper
 * Wraps an async scraper function with automatic retry logic.
 * Retries up to 3 times with exponential backoff before marking source failed.
 */

/**
 * Retry an async function with exponential backoff
 * @param {Function} fn - The async function to retry
 * @param {string} sourceName - Name of the source for logging
 * @param {string} query - The query being processed
 * @param {number} maxRetries - Maximum number of retries (default 3)
 * @returns {Promise<any>} - Result of the function or empty array on total failure
 */
async function withRetry(fn, sourceName, query, maxRetries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();

      // Log success on any successful attempt
      if (attempt > 1) {
        console.log(`[SourceRetry] ${sourceName} succeeded on attempt ${attempt}`);
      }

      // Log to scraping_logs
      try {
        await db.query(
          `INSERT INTO scraping_logs (source_name, url, status, retry_count, error_message) VALUES ($1, $2, $3, $4, $5)`,
          [sourceName, query || "", "success", attempt - 1, null]
        );
      } catch (logErr) {
        // Don't let logging errors break the flow
      }

      const leadsCount = Array.isArray(result) ? result.length : (result ? 1 : 0);
      await recordSourceOutcome(sourceName, "success", leadsCount, query);
      return result;

    } catch (error) {
      lastError = error;
      console.error(`[SourceRetry] ${sourceName} attempt ${attempt}/${maxRetries} failed:`, error.message);

      // Log failed attempt
      try {
        await db.query(
          `INSERT INTO scraping_logs (source_name, url, status, retry_count, error_message) VALUES ($1, $2, $3, $4, $5)`,
          [sourceName, query || "", "failed", attempt, error.message]
        );
      } catch (logErr) {
        // Don't let logging errors break the flow
      }

      // If not the last attempt, wait with exponential backoff
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`[SourceRetry] ${sourceName} waiting ${delayMs}ms before retry...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  // All retries exhausted - record as failure
  console.error(`[SourceRetry] ${sourceName} failed after ${maxRetries} attempts. Last error:`, lastError?.message);
  await recordSourceOutcome(sourceName, "failed", 0, query, lastError?.message);
  return []; // Return empty array so the pipeline continues
}

module.exports = withRetry;
