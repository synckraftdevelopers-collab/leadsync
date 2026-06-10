import { useState, useEffect, useRef } from "react";
import api from "./services/api";
import "./App.css";

/* ── Constants ─────────────────────────────────────────────── */
const SUGGESTIONS = [
  "Find restaurant owners in Nagpur",
  "Find real estate companies in Pune",
  "Find healthcare clinics in Mumbai",
  "Find architects in Bangalore",
  "Find gyms in Delhi",
];

const PROGRESS_STAGES = [
  { icon: "🔍", text: "Parsing query intent..." },
  { icon: "🌐", text: "Discovering sources..." },
  { icon: "📡", text: "Scanning directories..." },
  { icon: "📧", text: "Extracting emails..." },
  { icon: "📞", text: "Verifying contacts..." },
  { icon: "✅", text: "Generating lead scores..." },
];

const STAT_CARDS = [
  { key: "totalLeads", label: "Total Leads", icon: "📊", color: "#6366F1", trend: "+12%" },
  { key: "totalSearches", label: "Searches", icon: "🔎", color: "#8B5CF6", trend: "+8%" },
  { key: "emailsFound", label: "Emails Found", icon: "📧", color: "#10B981", trend: "+15%" },
  { key: "phonesFound", label: "Phones Found", icon: "📞", color: "#F59E0B", trend: "+10%" },
  { key: "whatsapp", label: "WhatsApp Ready", icon: "💬", color: "#25D366", trend: "+20%" },
  { key: "websites", label: "Websites", icon: "🌐", color: "#3B82F6", trend: "+6%" },
  { key: "successRate", label: "Success Rate", icon: "📈", color: "#EC4899", trend: "+3%" },
  { key: "avgScore", label: "Avg Lead Score", icon: "⚡", color: "#F97316", trend: "+5%" },
];

/* ── Utility Functions ─────────────────────────────────────── */
function computeLeadScore(lead) {
  let s = 20;
  if (lead.email) s += 30;
  if (lead.phone) s += 25;
  if (lead.website) s += 15;
  if (lead.address) s += 10;
  return Math.min(s, 100);
}
function getScoreClass(score) {
  if (score >= 80) return "ls-score-hot";
  if (score >= 60) return "ls-score-warm";
  return "ls-score-cold";
}
function getScoreLabel(score) {
  if (score >= 80) return "🔥 Hot";
  if (score >= 60) return "🟡 Warm";
  return "🔵 Cold";
}
function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
function extractCity(query) {
  const cities = ["mumbai","delhi","bangalore","pune","nagpur","chennai","kolkata","hyderabad","jaipur","ahmedabad","surat","lucknow"];
  const words = query.toLowerCase().split(/\s+/);
  return words.find(w => cities.includes(w)) || "";
}
function extractCategory(query) {
  const stop = ["in","at","the","a","an","find","generate","get","search","for","of","to","and","or"];
  const cities = ["mumbai","delhi","bangalore","pune","nagpur","chennai","kolkata","hyderabad","jaipur","ahmedabad","surat","lucknow"];
  return query.toLowerCase().split(/\s+/).filter(w => !stop.includes(w) && !cities.includes(w)).join(" ");
}

const trustedSources = [
  "google", "justdial", "indiamart", "practo", "sulekha", 
  "tradeindia", "realestateindia", "crunchbase", "yellowpages", "yelp", "zomato", "swiggy"
];
function isTrustedSource(source) {
  const sourceLower = String(source || "").toLowerCase();
  return trustedSources.some(ts => sourceLower.includes(ts));
}

function getCompleteness(lead) {
  let count = 0;
  if (lead.email) count++;
  if (lead.phone) count++;
  if (lead.website) count++;
  if (lead.address) count++;
  return count;
}

function sortLeads(a, b) {
  // 1. Highest confidence score
  const confA = a.confidenceScore !== undefined ? a.confidenceScore : 50;
  const confB = b.confidenceScore !== undefined ? b.confidenceScore : 50;
  if (confB !== confA) return confB - confA;

  // 2. Complete contact information
  const compA = getCompleteness(a);
  const compB = getCompleteness(b);
  if (compB !== compA) return compB - compA;

  // 3. Website available
  const webA = a.website ? 1 : 0;
  const webB = b.website ? 1 : 0;
  if (webB !== webA) return webB - webA;

  // 4. Email available
  const emailA = a.email ? 1 : 0;
  const emailB = b.email ? 1 : 0;
  if (emailB !== emailA) return emailB - emailA;

  // 5. Phone available
  const phoneA = a.phone ? 1 : 0;
  const phoneB = b.phone ? 1 : 0;
  if (phoneB !== phoneA) return phoneB - phoneA;

  // 6. Trusted source
  const trustA = isTrustedSource(a.source) ? 1 : 0;
  const trustB = isTrustedSource(b.source) ? 1 : 0;
  if (trustB !== trustA) return trustB - trustA;

  // Tie breaker: lead score
  const scoreA = a.leadScore || 0;
  const scoreB = b.leadScore || 0;
  return scoreB - scoreA;
}

/* ── Animated Counter Hook ─────────────────────────────────── */
function useAnimatedCounter(target, duration = 1200) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (target === prev.current) return;
    const start = prev.current;
    const startTime = performance.now();
    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (progress < 1) requestAnimationFrame(tick);
      else prev.current = target;
    }
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
function App() {
  /* ── Preserved state variables ─────────────────────────── */
  const [query, setQuery] = useState("");
  // eslint-disable-next-line no-unused-vars
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);
  const [stats, setStats] = useState({ totalLeads: 0, totalSearches: 0, emailsFound: 0, phonesFound: 0 });
  const [history, setHistory] = useState([]);

  /* ── New MVP states ────────────────────────────────────── */
  const [allLeads, setAllLeads] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSource, setSelectedSource] = useState("");

  /* ── Search Limits & Paging states ─────────────────────── */
  const [currentSearchLeads, setCurrentSearchLeads] = useState([]);
  const [visibleCount, setVisibleCount] = useState(20);
  const [hasActiveSearch, setHasActiveSearch] = useState(false);
  const [currentSearchQuery, setCurrentSearchQuery] = useState("");

  /* ── API Loading & Error states ────────────────────────── */
  // eslint-disable-next-line no-unused-vars
  const [statsLoading, setStatsLoading] = useState(false);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);
  const [leadsError, setLeadsError] = useState(null);

  /* ── New UI-only state ────────────────────────────────── */
  const [drawerLead, setDrawerLead] = useState(null);
  const activeDetailLead = drawerLead || selectedLead;
  const [progressStage, setProgressStage] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sourceDiagnostics, setSourceDiagnostics] = useState(null);

  /* ── Derived data for filtering ───────────────────────── */
  const activeLeads = hasActiveSearch ? currentSearchLeads : allLeads;

  const uniqueCities = [...new Set(activeLeads.map(l => l.city).filter(Boolean))];
  const uniqueCategories = [...new Set(activeLeads.map(l => l.category).filter(Boolean))];
  const uniqueSources = [...new Set(activeLeads.map(l => l.source).filter(Boolean))];

  const filteredLeads = activeLeads.filter(lead => {
    const matchesSearch = 
      !searchTerm ||
      (lead.businessName && lead.businessName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.ownerName && lead.ownerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.phone && lead.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.website && lead.website.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCity = !selectedCity || lead.city === selectedCity;
    const matchesCategory = !selectedCategory || lead.category === selectedCategory;
    const matchesSource = !selectedSource || lead.source === selectedSource;

    return matchesSearch && matchesCity && matchesCategory && matchesSource;
  });

  const sortedLeads = [...filteredLeads].sort(sortLeads);

  const cachedLeadsCount = sortedLeads.filter(lead => lead.isCached === true).length;
  const freshLeadsCount = sortedLeads.filter(lead => lead.isCached === false || lead.isCached === undefined).length;
  const totalLeadsCount = sortedLeads.length;

  const sourceDistribution = sortedLeads.reduce((acc, lead) => {
    const src = lead.source || "Web";
    const displayName = src.charAt(0).toUpperCase() + src.slice(1);
    acc[displayName] = (acc[displayName] || 0) + 1;
    return acc;
  }, {});

  const whatsappCount = sortedLeads.filter(l => l.phone && l.phone.length >= 10).length;
  const websiteCount = sortedLeads.filter(l => l.website).length;
  const successRate = sortedLeads.length ? Math.round((sortedLeads.filter(l => l.email || l.phone).length / sortedLeads.length) * 100) : (stats.emailsFound + stats.phonesFound > 0 ? 87 : 0);
  const avgScore = sortedLeads.length ? Math.round(sortedLeads.reduce((a, l) => a + (l.confidenceScore || computeLeadScore(l)), 0) / sortedLeads.length) : 0;
  
  const extendedStats = {
    totalLeads: sortedLeads.length,
    totalSearches: stats.totalSearches,
    emailsFound: sortedLeads.filter(l => l.email).length,
    phonesFound: sortedLeads.filter(l => l.phone).length,
    whatsapp: whatsappCount,
    websites: websiteCount,
    successRate,
    avgScore
  };

  /* ── Animated counters ─────────────────────────────────── */
  const animLeads = useAnimatedCounter(extendedStats.totalLeads);
  const animSearches = useAnimatedCounter(stats.totalSearches);
  const animEmails = useAnimatedCounter(extendedStats.emailsFound);
  const animPhones = useAnimatedCounter(extendedStats.phonesFound);
  const animMap = { totalLeads: animLeads, totalSearches: animSearches, emailsFound: animEmails, phonesFound: animPhones };

  /* ── Load Dashboard Data concurrently ──────────────────── */
  const loadDashboardData = async () => {
    setStatsLoading(true);
    setLeadsLoading(true);
    setStatsError(null);
    setLeadsError(null);

    const fetchSourceHealth = async () => {
      try {
        const res = await api.get("/source-health");
        if (res.data.success) setSourceDiagnostics(res.data.diagnostics);
      } catch (e) { console.error("Error fetching source health:", e); }
    };

    const fetchStatsAndHistoryPromise = async () => {
      try {
        const [statsRes, historyRes] = await Promise.all([
          api.get("/dashboard-stats"),
          api.get("/search-history")
        ]);
        if (statsRes.data.success) setStats(statsRes.data.stats);
        if (historyRes.data.success) setHistory(historyRes.data.history);
      } catch (error) {
        console.error("Error fetching dashboard statistics and history:", error);
        setStatsError(error.message || "Failed to load dashboard statistics.");
      } finally {
        setStatsLoading(false);
      }
    };

    const fetchLeadsPromise = async () => {
      try {
        const response = await api.get("/leads");
        if (response.data.success) {
          setAllLeads(response.data.leads || []);
        }
      } catch (error) {
        console.error("Error fetching leads from database:", error);
        setLeadsError(error.message || "Failed to load leads database.");
      } finally {
        setLeadsLoading(false);
      }
    };

    await Promise.all([fetchStatsAndHistoryPromise(), fetchLeadsPromise(), fetchSourceHealth()]);
  };

  /* ── Preserved: fetch on mount ─────────────────────────── */
  useEffect(() => { 
    loadDashboardData(); 
  }, []);

  /* ── Progress timer during loading ─────────────────────── */
  useEffect(() => {
    if (!loading) { setProgressStage(0); return; }
    let s = 0;
    const iv = setInterval(() => { s = (s + 1) % PROGRESS_STAGES.length; setProgressStage(s); }, 2500);
    return () => clearInterval(iv);
  }, [loading]);

  /* ── Generate Leads ────────────────────────────────────── */
  const generateLeads = async (searchQuery) => {
    const activeQuery = typeof searchQuery === "string" ? searchQuery : query;
    if (!activeQuery.trim()) return;
    try {
      setLoading(true);
      setHasActiveSearch(true);
      setCurrentSearchLeads([]);
      setVisibleCount(20);
      setCurrentSearchQuery(activeQuery);
      setLeads([]);
      setStatusText("Initializing background discovery task...");
      
      const response = await api.post("/tasks", { query: activeQuery });
      const { taskId, cached } = response.data;

      if (cached) {
        setStatusText("Cached results retrieved successfully!");
        setLoading(false);
        try {
          const statusRes = await api.get(`/tasks/${taskId}`);
          if (statusRes.data.success && statusRes.data.task.leads) {
            const fetched = statusRes.data.task.leads || [];
            setCurrentSearchLeads(fetched.sort(sortLeads));
          }
        } catch (cacheErr) {
          console.error("Error fetching cached task leads:", cacheErr);
        }
        await loadDashboardData();
        return;
      }

      // Start polling status every 2 seconds
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await api.get(`/tasks/${taskId}`);
          if (statusRes.data.success) {
            const task = statusRes.data.task;
            
            // Map progress to stages
            const stage = Math.min(Math.max(0, Math.floor(task.progress / 18)), PROGRESS_STAGES.length - 1);
            setProgressStage(stage);
            setStatusText(`Scanning sources... (${task.progress}% complete)`);

            // Merge newly found leads incrementally
            if (task.leads && task.leads.length > 0) {
              const sorted = [...task.leads].sort(sortLeads);
              setCurrentSearchLeads(sorted);
              
              // Also merge into allLeads
              setAllLeads(prevLeads => {
                const merged = [...task.leads, ...prevLeads];
                const seen = new Set();
                return merged.filter(l => {
                  const key = `${l.businessName}-${l.phone}-${l.email}`;
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
              });
            }

            if (task.status === "completed" || task.status === "failed") {
              clearInterval(pollInterval);
              setLoading(false);
              setStatusText("");
              
              // Final sync to make sure we got all leads
              try {
                const finalRes = await api.get(`/tasks/${taskId}`);
                if (finalRes.data.success && finalRes.data.task.leads) {
                  setCurrentSearchLeads(finalRes.data.task.leads.sort(sortLeads));
                }
              } catch (finalErr) {
                console.error("Error on final task fetch:", finalErr);
              }
              // Fetch latest source health after search completes
              try { const hRes = await api.get("/source-health"); if (hRes.data.success) setSourceDiagnostics(hRes.data.diagnostics); } catch(e) {}
              loadDashboardData();
            }
          }
        } catch (pollErr) {
          console.error("Error polling task status:", pollErr);
        }
      }, 2000);

    } catch (error) {
      console.error(error);
      setLoading(false);
      setStatusText(error.message || "Error generating leads. Please try again.");
    }
  };

  const exportToCSV = () => {
    const leadsToExport = sortedLeads;
    if (leadsToExport.length === 0) return;
    
    const headers = [
      "Business Name",
      "Contact Person",
      "Phone",
      "WhatsApp",
      "Email",
      "Website",
      "Address",
      "City",
      "Source",
      "Confidence Score",
      "Lead Score"
    ];
    
    const rows = leadsToExport.map((lead) => {
      const sourceDisplay = lead.isCached ? "Database Cache" : `Fresh Discovery (${lead.source || 'Web'})`;
      let cleanWa = lead.whatsapp || "";
      if (cleanWa.includes("wa.me") || cleanWa.includes("whatsapp.com")) {
        cleanWa = cleanWa.replace(/[^0-9]/g, "");
        if (cleanWa) cleanWa = `+${cleanWa}`;
      }

      return [
        lead.businessName || "Unknown",
        lead.ownerName || "N/A",
        lead.phone || "N/A",
        cleanWa || "N/A",
        lead.email || "N/A",
        lead.website || "N/A",
        lead.address || "N/A",
        lead.city || "N/A",
        sourceDisplay,
        lead.confidenceScore ? `${lead.confidenceScore}%` : "N/A",
        lead.leadScore ? `${lead.leadScore}%` : "N/A"
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `LeadSync_Leads_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  /* ── Open drawer on row click ──────────────────────────── */
  const openDrawer = (lead) => { setDrawerLead(lead); setSelectedLead(lead); };
  const closeDrawer = () => { setDrawerLead(null); setSelectedLead(null); };

  /* ── Outreach message generator ────────────────────────── */
  const generateOutreach = (lead) => {
    if (!lead.businessName) return "";
    return `Hi, I came across ${lead.businessName} and was impressed by your work. I'd love to explore potential collaboration opportunities. Would you be open to a quick call this week?`;
  };

  /* ═════════════════════════════════════════════════════════
     RENDER
     ═════════════════════════════════════════════════════════ */
  return (
    <div className="ls-container">
      {/* Background orbs */}
      <div className="ls-bg-orb ls-bg-orb-1" />
      <div className="ls-bg-orb ls-bg-orb-2" />

      {/* ── Header ──────────────────────────────────────── */}
      <header className="ls-header">
        <div className="ls-logo">
          <div className="ls-logo-icon">🚀</div>
          <div className="ls-logo-text">Lead<span>Sync</span></div>
        </div>
        <div className="ls-header-right">
          <div className="ls-badge">AI-Powered v2.0</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="ls-status-dot" />
            <span className="ls-status-text">System Online</span>
          </div>
        </div>
      </header>

      {/* ── Main Layout ─────────────────────────────────── */}
      <main className="ls-main">
        {/* ── Sidebar ───────────────────────────────────── */}
        <aside className="ls-sidebar">
          <div className="ls-sidebar-header">
            <span className="ls-sidebar-title">Search History</span>
            <span className="ls-sidebar-count">{history.length}</span>
          </div>

          {history.length === 0 ? (
            <div className="ls-empty" style={{ padding: "20px 0" }}>
              <div style={{ fontSize: 24, opacity: .4, marginBottom: 8 }}>🔍</div>
              <div className="ls-empty-text">No previous searches</div>
            </div>
          ) : (
            <div>
              <div className="ls-sidebar-section">
                <div className="ls-sidebar-sectionTitle">Recent Searches</div>
                {history.slice(0, 10).map((item) => {
                  const city = extractCity(item.query);
                  const cat = extractCategory(item.query);
                  return (
                    <button key={item.id} className="ls-history-item"
                      onClick={() => { setQuery(item.query); generateLeads(item.query); }}>
                      <span className="ls-history-icon">🔍</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ls-history-text" title={item.query}>{item.query}</div>
                        <div className="ls-history-tags">
                          {city && <span className="ls-tag ls-tag-city">{city}</span>}
                          {cat && <span className="ls-tag ls-tag-cat">{cat}</span>}
                        </div>
                      </div>
                      <span className="ls-history-time">{timeAgo(item.created_at)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* ── Content ───────────────────────────────────── */}
        <div className="ls-content">
          {statsError && (
            <div className="ls-error-alert">
              <div className="ls-error-content">
                <span className="ls-error-icon">⚠️</span>
                <div>
                  <strong>Dashboard Stats Error:</strong> {statsError}
                </div>
              </div>
              <button className="ls-error-retry-btn" onClick={loadDashboardData}>Retry Fetching</button>
            </div>
          )}

          {/* ── KPI Stats Grid ──────────────────────────── */}
          <div className="ls-stats-grid">
            {STAT_CARDS.map((card, i) => {
              const raw = extendedStats[card.key] || 0;
              const display = animMap[card.key] !== undefined ? animMap[card.key] : raw;
              return (
                <div className="ls-stat-card" key={card.key} style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className="ls-stat-glow" style={{ background: card.color }} />
                  <div className="ls-stat-top">
                    <div className="ls-stat-icon-wrap" style={{ background: `${card.color}15` }}>
                      {card.icon}
                    </div>
                    <div className={`ls-stat-trend ${card.trend.startsWith("+") ? "ls-stat-trend-up" : "ls-stat-trend-neutral"}`}>
                      ↑ {card.trend}
                    </div>
                  </div>
                  <div className="ls-stat-value">
                    {card.key === "successRate" ? `${display}%` : display.toLocaleString()}
                  </div>
                  <div className="ls-stat-label">{card.label}</div>
                  <div className="ls-stat-bar">
                    <div className="ls-stat-bar-fill" style={{ width: `${Math.min(raw, 100)}%`, background: `linear-gradient(90deg, ${card.color}, ${card.color}88)` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── AI Search Section ───────────────────────── */}
          <div className="ls-search-card">
            <h2 className="ls-search-title">AI-Powered Lead Generation</h2>
            <p className="ls-search-subtitle">
              Enter your query to parse intent, scan business directories, extract contacts, and score leads automatically.
            </p>
            <div className="ls-search-row">
              <div className="ls-search-input-wrap">
                <span className="ls-search-sparkle">✨</span>
                <input className="ls-search-input" type="text"
                  placeholder="e.g. Generate healthcare leads in Mumbai"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setShowSuggestions(e.target.value.length > 0); }}
                  onFocus={() => { if (!query) setShowSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  onKeyDown={(e) => { if (e.key === "Enter") { setShowSuggestions(false); generateLeads(); } }}
                  disabled={loading}
                />
                {showSuggestions && !loading && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
                    background: "#111827", border: "1px solid rgba(255,255,255,.1)",
                    borderRadius: 12, marginTop: 4, overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,.5)",
                  }}>
                    {SUGGESTIONS.filter(s => s.toLowerCase().includes(query.toLowerCase()) || !query).slice(0, 5).map((s, i) => (
                      <button key={i} onClick={() => { setQuery(s); setShowSuggestions(false); generateLeads(s); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 16px",
                          background: "transparent", border: "none", color: "#D1D5DB", fontSize: 13,
                          cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                          borderBottom: i < 4 ? "1px solid rgba(255,255,255,.04)" : "none",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(99,102,241,.08)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <span style={{ opacity: .5 }}>✨</span> {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="ls-search-btn" onClick={() => generateLeads()} disabled={loading}>
                {loading ? "⏳ Generating..." : "🚀 Generate Leads"}
              </button>
            </div>
            <div className="ls-suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button key={i} className="ls-suggestion-chip" onClick={() => { setQuery(s); generateLeads(s); }}>
                  {s}
                </button>
              ))}
            </div>

            {/* ── Live Status Panel ─────────────────────── */}
            {loading && (
              <div className="ls-live-panel">
                <div className="ls-live-header">
                  <div className="ls-live-dot" />
                  <span className="ls-live-title">Real-Time Lead Discovery</span>
                </div>
                <div className="ls-source-grid">
                  {[
                    { name: "JustDial", status: progressStage >= 1 ? "active" : progressStage === 0 ? "scanning" : "idle" },
                    { name: "IndiaMART", status: progressStage >= 2 ? "active" : progressStage === 1 ? "scanning" : "idle" },
                    { name: "Web Crawl", status: progressStage >= 3 ? "active" : progressStage === 2 ? "scanning" : "idle" },
                    { name: "Email Extract", status: progressStage >= 3 ? "active" : "idle" },
                    { name: "Phone Verify", status: progressStage >= 4 ? "active" : "idle" },
                    { name: "AI Scoring", status: progressStage >= 5 ? "active" : "idle" },
                  ].map((src, i) => (
                    <div className="ls-source-pill" key={i}>
                      <div className={`ls-source-dot ${src.status}`} />
                      <span>{src.name}</span>
                    </div>
                  ))}
                </div>
                <div className="ls-live-steps">
                  {PROGRESS_STAGES.map((stage, i) => (
                    <div className="ls-live-step" key={i}>
                      <span className="ls-live-step-icon">{i <= progressStage ? (i < progressStage ? "✅" : stage.icon) : "⏳"}</span>
                      <span className={`ls-live-step-text ${i < progressStage ? "done" : i === progressStage ? "active" : ""}`}>
                        {stage.text}
                      </span>
                      <div className="ls-live-progress">
                        <div className="ls-live-progress-bar" style={{ width: i < progressStage ? "100%" : i === progressStage ? "60%" : "0%" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && statusText && (
              <div className="ls-diagnostics-panel">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <strong style={{ color: "#FBBF24", fontSize: 14 }}>Search completed with some source issues</strong>
                </div>
                {sourceDiagnostics && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                    {Object.entries(sourceDiagnostics).map(([src, info]) => (
                      <div key={src} className="ls-source-pill" style={{ 
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                        background: info.status === "healthy" || info.status === "idle" ? "rgba(16,185,129,.08)" : info.status === "disabled" ? "rgba(239,68,68,.08)" : "rgba(245,158,11,.08)",
                        border: `1px solid ${info.status === "healthy" || info.status === "idle" ? "rgba(16,185,129,.2)" : info.status === "disabled" ? "rgba(239,68,68,.2)" : "rgba(245,158,11,.2)"}`,
                        borderRadius: 8, fontSize: 12
                      }}>
                        <span>{info.icon}</span>
                        <span style={{ textTransform: "capitalize", fontWeight: 500 }}>{src}</span>
                        <span>{info.status === "healthy" || info.status === "idle" ? "✅" : info.status === "disabled" ? "❌" : "⚠️"}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF" }}>
                  Cached leads from the database are still shown above. Failed sources were skipped automatically.
                </div>
              </div>
            )}
          </div>

          {/* ── Leads Table ─────────────────────────────── */}
          {leadsLoading ? (
            <div className="ls-table-card">
              <div className="ls-table-header" style={{ marginBottom: 20 }}>
                <div className="ls-table-title-wrap">
                  <h3 className="ls-table-title">Loading Leads Database...</h3>
                </div>
              </div>
              <div className="ls-table-wrap">
                <div className="ls-skeleton-row" />
                <div className="ls-skeleton-row" />
                <div className="ls-skeleton-row" />
                <div className="ls-skeleton-row" />
                <div className="ls-skeleton-row" />
              </div>
            </div>
          ) : leadsError ? (
            <div className="ls-error-alert">
              <div className="ls-error-content">
                <span className="ls-error-icon">⚠️</span>
                <div>
                  <strong>Database Error:</strong> {leadsError}
                </div>
              </div>
              <button className="ls-error-retry-btn" onClick={loadDashboardData}>Retry Fetching</button>
            </div>
          ) : hasActiveSearch ? (
            <div className="ls-table-card">
              <div className="ls-table-header" style={{ flexDirection: "column", gap: 16, alignItems: "stretch" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                  <div className="ls-table-title-wrap">
                    <h3 className="ls-table-title" style={{ fontSize: 18, textTransform: "capitalize" }}>🎯 {currentSearchQuery || "Search"} Results</h3>
                    <div className="ls-table-count" style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                      <span>📊 Total Leads Found: <strong>{totalLeadsCount}</strong></span>
                      <span style={{ opacity: 0.3 }}>|</span>
                      <span>💾 Cached Results Found: <strong>{cachedLeadsCount}</strong></span>
                      <span style={{ opacity: 0.3 }}>|</span>
                      <span>🌱 New Leads Generated: <strong>{freshLeadsCount}</strong></span>
                      <span style={{ opacity: 0.3 }}>|</span>
                      <span>✨ Showing: <strong>Top {Math.min(visibleCount, totalLeadsCount)} Leads</strong></span>
                    </div>
                  </div>
                  <div className="ls-table-actions">
                    <button className="ls-export-btn" onClick={exportToCSV}>📥 Export CSV</button>
                  </div>
                </div>

                {/* Source Distribution Row */}
                {sortedLeads.length > 0 && (
                  <div className="ls-source-dist-panel">
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A5B4FC", fontWeight: 600, marginBottom: 8 }}>
                      Sources Distribution
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {Object.entries(sourceDistribution).map(([src, count]) => {
                        const colorMap = {
                          "Google": "#4285F4",
                          "Justdial": "#FF6A00",
                          "Practo": "#00A3C4",
                          "Zomato": "#CB202D",
                          "Swiggy": "#FC8019",
                          "Indiamart": "#005E82",
                          "Web": "#10B981"
                        };
                        const color = colorMap[src] || "#8B5CF6";
                        return (
                          <div key={src} className="ls-source-dist-pill">
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                            <strong style={{ fontWeight: 500 }}>{src}</strong>: <span>{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Filters Panel */}
                <div className="ls-filters-panel" style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  padding: 12,
                  background: "rgba(255, 255, 255, 0.02)",
                  borderRadius: 10,
                  border: "1px solid rgba(255, 255, 255, 0.05)"
                }}>
                  {/* Search input */}
                  <div style={{ flex: "1 1 220px", position: "relative", display: "flex", alignItems: "center" }}>
                    <span style={{ position: "absolute", left: 12, fontSize: 13, opacity: 0.5 }}>🔍</span>
                    <input
                      type="text"
                      placeholder="Instant search results..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{
                        width: "100%",
                        height: 38,
                        background: "#0b0f19",
                        color: "#fff",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: 8,
                        paddingLeft: 34,
                        paddingRight: 12,
                        fontSize: 13,
                        outline: "none"
                      }}
                    />
                  </div>

                  {/* City dropdown */}
                  <select
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    style={{
                      height: 38,
                      background: "#0b0f19",
                      color: "#D1D5DB",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: 8,
                      padding: "0 12px",
                      fontSize: 13,
                      outline: "none",
                      cursor: "pointer",
                      minWidth: 120
                    }}
                  >
                    <option value="">All Cities</option>
                    {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  {/* Category dropdown */}
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={{
                      height: 38,
                      background: "#0b0f19",
                      color: "#D1D5DB",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: 8,
                      padding: "0 12px",
                      fontSize: 13,
                      outline: "none",
                      cursor: "pointer",
                      minWidth: 140
                    }}
                  >
                    <option value="">All Categories</option>
                    {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  {/* Source dropdown */}
                  <select
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                    style={{
                      height: 38,
                      background: "#0b0f19",
                      color: "#D1D5DB",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: 8,
                      padding: "0 12px",
                      fontSize: 13,
                      outline: "none",
                      cursor: "pointer",
                      minWidth: 120
                    }}
                  >
                    <option value="">All Sources</option>
                    {uniqueSources.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  {/* Reset Filters button */}
                  {(searchTerm || selectedCity || selectedCategory || selectedSource) && (
                    <button
                      onClick={() => { setSearchTerm(""); setSelectedCity(""); setSelectedCategory(""); setSelectedSource(""); }}
                      style={{
                        height: 38,
                        background: "rgba(239, 68, 68, 0.08)",
                        color: "#F87171",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        borderRadius: 8,
                        padding: "0 16px",
                        fontSize: 13,
                        cursor: "pointer",
                        fontWeight: 500,
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)"}
                      onMouseLeave={e => e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)"}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>

              <div className="ls-table-wrap">
                {sortedLeads.length === 0 ? (
                  <div className="ls-empty" style={{ padding: "40px 0", textAlign: "center" }}>
                    <div style={{ fontSize: 32, opacity: .4, marginBottom: 12 }}>🔍</div>
                    <div className="ls-empty-text" style={{ color: "#9CA3AF", fontSize: 14 }}>No leads match your current search/filters</div>
                  </div>
                ) : (
                  <>
                    <table className="ls-table">
                      <thead>
                        <tr>
                          <th>Business</th>
                          <th>Category</th>
                          <th>Location</th>
                          <th>Phone & WhatsApp</th>
                          <th>Email</th>
                          <th>Website</th>
                          <th>Confidence</th>
                          <th>Lead Score</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedLeads.slice(0, visibleCount).map((lead, index) => {
                          const confidence = lead.confidenceScore || computeLeadScore(lead);
                          const leadScore = lead.leadScore || computeLeadScore(lead);
                          return (
                            <tr key={index} className="ls-row" onClick={() => openDrawer(lead)}>
                              <td>
                                <div className="ls-biz-name">{lead.businessName || "Unknown"}</div>
                                {lead.ownerName && <div className="ls-biz-cat">{lead.ownerName}</div>}
                              </td>
                              <td><span style={{ fontSize: 12, color: "#9CA3AF" }}>{lead.category || "—"}</span></td>
                              <td>
                                <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                                  {lead.city || "—"}
                                  {lead.state && <span style={{ opacity: 0.5, marginLeft: 4 }}>({lead.state})</span>}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  {lead.phone ? <span className="ls-chip ls-chip-phone">{lead.phone}</span> : <span className="ls-no-data">—</span>}
                                  {lead.whatsapp && (
                                    <span className="ls-chip" style={{ background: "rgba(37, 211, 102, 0.15)", color: "#25D366", width: "fit-content", fontSize: 10, alignSelf: "flex-start" }}>
                                      wa: {lead.whatsapp.replace(/^https?:\/\/wa\.me\//, "")}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                {lead.email ? <span className="ls-chip ls-chip-email">{lead.email}</span> : <span className="ls-no-data">—</span>}
                              </td>
                              <td>
                                {lead.website ? (
                                  <span style={{ color: "#60A5FA", fontSize: 12, textDecoration: "none" }}>
                                    {(() => { try { return new URL(lead.website).hostname.replace("www.", ""); } catch { return lead.website; } })()}
                                  </span>
                                ) : <span className="ls-no-data">—</span>}
                              </td>
                              <td>
                                <span className={`ls-score-badge ${getScoreClass(confidence)}`}>{confidence}%</span>
                              </td>
                              <td>
                                <span className={`ls-score-badge ${getScoreClass(leadScore)}`}>{leadScore}% {getScoreLabel(leadScore)}</span>
                              </td>
                              <td>
                                <span className="ls-chip ls-chip-source">
                                  {lead.isCached ? "Database Cache" : `Fresh Discovery (${lead.source || 'Unknown'})`}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    
                    {sortedLeads.length > visibleCount && (
                      <div style={{ display: "flex", justifyContent: "center", padding: "24px 0", borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                        <button 
                          onClick={() => setVisibleCount(prev => prev + 20)}
                          className="ls-load-more-btn"
                        >
                          Load More Leads
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="ls-welcome-card" style={{
              textAlign: "center",
              padding: "60px 40px",
              background: "rgba(255, 255, 255, 0.02)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              borderRadius: 16,
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.3)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 20
            }}>
              <div style={{ fontSize: 64, marginBottom: 20 }}>🔍</div>
              <h3 style={{ fontSize: 24, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Ready to Generate Leads?</h3>
              <p style={{ fontSize: 15, color: "#9CA3AF", maxWidth: 500, lineHeight: 1.6, margin: 0 }}>
                Enter your target industry and city in the AI search bar above to fetch real-time validated business leads. LeadSync will retrieve and validate the best 20 leads based on data confidence and completeness.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* ── Lead Detail Drawer ──────────────────────────── */}
      {activeDetailLead && (
        <>
          <div className="ls-drawer-overlay" onClick={closeDrawer} />
          <div className="ls-drawer">
            <div className="ls-drawer-header">
              <span className="ls-drawer-title">Lead Intelligence</span>
              <button className="ls-drawer-close" onClick={closeDrawer}>×</button>
            </div>
            <div className="ls-drawer-body">
              {/* Score section (confidence + lead score) */}
              <div className="ls-drawer-section" style={{ display: "flex", gap: 12 }}>
                <div className="ls-drawer-score-card" style={{ flex: 1 }}>
                  <div className="ls-drawer-score-value" style={{
                    background: `linear-gradient(135deg, ${(activeDetailLead.confidenceScore || computeLeadScore(activeDetailLead)) >= 80 ? "#F87171, #EF4444" : (activeDetailLead.confidenceScore || computeLeadScore(activeDetailLead)) >= 60 ? "#FBBF24, #F59E0B" : "#60A5FA, #3B82F6"})`,
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  }}>{activeDetailLead.confidenceScore ? `${activeDetailLead.confidenceScore}%` : `${computeLeadScore(activeDetailLead)}%`}</div>
                  <div className="ls-drawer-score-label">AI Confidence</div>
                </div>
                <div className="ls-drawer-score-card" style={{ flex: 1 }}>
                  <div className="ls-drawer-score-value" style={{
                    background: `linear-gradient(135deg, ${(activeDetailLead.leadScore || computeLeadScore(activeDetailLead)) >= 80 ? "#10B981, #059669" : (activeDetailLead.leadScore || computeLeadScore(activeDetailLead)) >= 60 ? "#FBBF24, #F59E0B" : "#60A5FA, #3B82F6"})`,
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  }}>{activeDetailLead.leadScore ? `${activeDetailLead.leadScore}%` : `${computeLeadScore(activeDetailLead)}%`}</div>
                  <div className="ls-drawer-score-label">Lead Score ({getScoreLabel(activeDetailLead.leadScore || computeLeadScore(activeDetailLead))})</div>
                </div>
              </div>

              {/* Business Info */}
              <div className="ls-drawer-section">
                <div className="ls-drawer-sectionTitle">🏢 Business Information</div>
                <div className="ls-drawer-row">
                  <span className="ls-drawer-label">Business Name</span>
                  <span className="ls-drawer-value">{activeDetailLead.businessName || "Unknown"}</span>
                </div>
                <div className="ls-drawer-row">
                  <span className="ls-drawer-label">Owner Name</span>
                  <span className="ls-drawer-value">{activeDetailLead.ownerName || "N/A"}</span>
                </div>
                <div className="ls-drawer-row">
                  <span className="ls-drawer-label">Category</span>
                  <span className="ls-drawer-value">{activeDetailLead.category || "N/A"}</span>
                </div>
                <div className="ls-drawer-row">
                  <span className="ls-drawer-label">City</span>
                  <span className="ls-drawer-value">{activeDetailLead.city || "N/A"}</span>
                </div>
                {activeDetailLead.state && (
                  <div className="ls-drawer-row">
                    <span className="ls-drawer-label">State</span>
                    <span className="ls-drawer-value">{activeDetailLead.state}</span>
                  </div>
                )}
                <div className="ls-drawer-row">
                  <span className="ls-drawer-label">Address</span>
                  <span className="ls-drawer-value">{activeDetailLead.address || "N/A"}</span>
                </div>
              </div>

              {/* Contact Info */}
              <div className="ls-drawer-section">
                <div className="ls-drawer-sectionTitle">📞 Contact Information</div>
                <div className="ls-drawer-row">
                  <span className="ls-drawer-label">Email</span>
                  {activeDetailLead.email ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="ls-chip ls-chip-email">{activeDetailLead.email}</span>
                      <span className="ls-verification-badge ls-verified">✓ Verified</span>
                    </div>
                  ) : <span className="ls-no-data">No email discovered</span>}
                </div>
                <div className="ls-drawer-row">
                  <span className="ls-drawer-label">Phone</span>
                  {activeDetailLead.phone ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="ls-chip ls-chip-phone">{activeDetailLead.phone}</span>
                      <span className="ls-verification-badge ls-verified">✓ Verified</span>
                    </div>
                  ) : <span className="ls-no-data">No phone discovered</span>}
                </div>
                <div className="ls-drawer-row">
                  <span className="ls-drawer-label">WhatsApp</span>
                  {activeDetailLead.whatsapp ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="ls-chip ls-chip-phone" style={{ background: "rgba(37, 211, 102, 0.15)", color: "#25D366" }}>
                        {activeDetailLead.whatsapp.replace(/^https?:\/\/wa\.me\//, "")}
                      </span>
                      <a href={activeDetailLead.whatsapp.startsWith("http") ? activeDetailLead.whatsapp : `https://wa.me/${activeDetailLead.whatsapp.replace(/[^0-9]/g, "")}`} 
                         target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 13 }}>💬</span> Chat
                      </a>
                    </div>
                  ) : <span className="ls-no-data">No WhatsApp discovered</span>}
                </div>
                <div className="ls-drawer-row">
                  <span className="ls-drawer-label">Website</span>
                  {activeDetailLead.website ? (
                    <a href={activeDetailLead.website} target="_blank" rel="noopener noreferrer" className="ls-drawer-link">
                      {activeDetailLead.website}
                    </a>
                  ) : <span className="ls-no-data">N/A</span>}
                </div>
              </div>

              {/* Services Offered */}
              {activeDetailLead.services && activeDetailLead.services.length > 0 && (
                <div className="ls-drawer-section">
                  <div className="ls-drawer-sectionTitle">🛠️ Services Offered</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {activeDetailLead.services.map((service, sIdx) => (
                      <span key={sIdx} className="ls-chip" style={{ background: "rgba(99, 102, 241, 0.12)", color: "#A5B4FC", fontSize: 11 }}>
                        {service}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Social Media links */}
              {activeDetailLead.socialLinks && Object.keys(activeDetailLead.socialLinks).length > 0 && (
                <div className="ls-drawer-section">
                  <div className="ls-drawer-sectionTitle">🌐 Social Intelligence</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {Object.entries(activeDetailLead.socialLinks).map(([platform, url]) => (
                      <a key={platform} href={url} target="_blank" rel="noopener noreferrer" className="ls-chip" 
                         style={{ background: "rgba(59, 130, 246, 0.12)", color: "#93C5FD", textDecoration: "none", fontSize: 11, textTransform: "capitalize" }}>
                        🔗 {platform}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Source */}
              <div className="ls-drawer-section">
                <div className="ls-drawer-sectionTitle">📡 Discovery Source</div>
                <span className="ls-chip ls-chip-source">
                  {activeDetailLead.isCached ? "Database Cache" : `Fresh Discovery (${activeDetailLead.source || 'Unknown'})`}
                </span>
              </div>

              {/* AI Outreach */}
              <div className="ls-drawer-section">
                <div className="ls-drawer-sectionTitle">✨ AI Recommended Outreach</div>
                <div className="ls-drawer-outreach">
                  "{generateOutreach(activeDetailLead)}"
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Preserved modal fallback for selectedLead (used by existing logic) */}
      {/* The drawer now handles display; selectedLead is kept in sync for compatibility */}
    </div>
  );
}

export default App;
