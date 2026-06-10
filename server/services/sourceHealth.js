const db = require("../db/db");

/**
 * Source Health Monitor
 * Tracks success/failure rates per source.
 * Temporarily disables sources with poor health.
 * Logs all source outcomes to source_logs table.
 */

// In-memory health registry: { sourceName: { success, failure, totalLeads, disabled, lastFailure } }
const healthRegistry = {};

/**
 * Record a source outcome (success or failure)
 */
async function recordSourceOutcome(sourceName, status, leadsCount, query, errorMessage) {
  // Update in-memory registry
  if (!healthRegistry[sourceName]) {
    healthRegistry[sourceName] = { success: 0, failure: 0, totalLeads: 0, disabled: false, lastFailure: null };
  }
  const entry = healthRegistry[sourceName];

  if (status === "success") {
    entry.success++;
    entry.totalLeads += (leadsCount || 0);
    // Re-enable source if it recovers
    if (entry.disabled && getSuccessRate(sourceName) > 0.5) {
      entry.disabled = false;
      console.log(`[SourceHealth] Re-enabled source: ${sourceName}`);
    }
  } else {
    entry.failure++;
    entry.lastFailure = new Date();
    // Auto-disable if success rate drops below 30% with at least 5 attempts
    const total = entry.success + entry.failure;
    if (total >= 5 && getSuccessRate(sourceName) < 0.3) {
      entry.disabled = true;
      console.log(`[SourceHealth] Auto-disabled source: ${sourceName} (success rate: ${(getSuccessRate(sourceName) * 100).toFixed(1)}%)`);
    }
  }

  // Log to database
  try {
    await db.query(
      `INSERT INTO source_logs (source_name, status, leads_count, query, error_message) VALUES ($1, $2, $3, $4, $5)`,
      [sourceName, status, leadsCount || 0, query || "", errorMessage || null]
    );
  } catch (err) {
    console.error(`[SourceHealth] Failed to log source outcome for ${sourceName}:`, err.message);
  }
}

/**
 * Get success rate for a source (0-1)
 */
function getSuccessRate(sourceName) {
  const entry = healthRegistry[sourceName];
  if (!entry) return 1;
  const total = entry.success + entry.failure;
  if (total === 0) return 1;
  return entry.success / total;
}

/**
 * Check if a source is healthy enough to use
 */
function isSourceHealthy(sourceName) {
  const entry = healthRegistry[sourceName];
  if (!entry) return true; // Unknown sources are assumed healthy
  if (entry.disabled) return false;
  return true;
}

/**
 * Get health stats for all sources
 */
function getAllSourceHealth() {
  const result = {};
  for (const [name, entry] of Object.entries(healthRegistry)) {
    const total = entry.success + entry.failure;
    result[name] = {
      success: entry.success,
      failure: entry.failure,
      successRate: total > 0 ? Math.round((entry.success / total) * 100) : 100,
      avgLeads: entry.success > 0 ? Math.round(entry.totalLeads / entry.success) : 0,
      disabled: entry.disabled,
      lastFailure: entry.lastFailure,
      status: entry.disabled ? "disabled" : (getSuccessRate(name) > 0.5 ? "healthy" : "degraded")
    };
  }
  return result;
}

/**
 * Manually re-enable a disabled source
 */
function enableSource(sourceName) {
  if (healthRegistry[sourceName]) {
    healthRegistry[sourceName].disabled = false;
    console.log(`[SourceHealth] Manually re-enabled source: ${sourceName}`);
  }
}

/**
 * Get diagnostic summary for frontend
 */
function getDiagnosticSummary() {
  const all = getAllSourceHealth();
  const knownSources = ["google", "justdial", "indiamart", "practo", "sulekha", "tradeindia", "realestateindia", "web"];
  const result = {};

  for (const src of knownSources) {
    if (all[src]) {
      result[src] = {
        ...all[src],
        icon: src === "google" ? "🔍" : src === "justdial" ? "📞" : src === "indiamart" ? "🏭" : src === "practo" ? "🏥" : src === "sulekha" ? "📋" : src === "tradeindia" ? "🚢" : src === "realestateindia" ? "🏠" : "🌐"
      };
    } else {
      result[src] = {
        success: 0, failure: 0, successRate: 100, avgLeads: 0,
        disabled: false, lastFailure: null, status: "idle",
        icon: src === "google" ? "🔍" : src === "justdial" ? "📞" : src === "indiamart" ? "🏭" : src === "practo" ? "🏥" : "🌐"
      };
    }
  }

  return result;
}

module.exports = {
  recordSourceOutcome,
  getSuccessRate,
  isSourceHealthy,
  getAllSourceHealth,
  enableSource,
  getDiagnosticSummary
};
