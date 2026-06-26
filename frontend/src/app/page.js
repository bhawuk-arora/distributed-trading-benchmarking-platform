"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  Terminal, 
  Search, 
  Cpu, 
  Zap, 
  Clock, 
  Upload, 
  GitBranch, 
  Play, 
  TrendingUp, 
  Award,
  BookOpen
} from "lucide-react";

export default function Dashboard() {
  // State variables
  const [leaderboard, setLeaderboard] = useState([]);
  const [connected, setConnected] = useState(false);
  const [activityFeed, setActivityFeed] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("standings"); // "standings" | "submit" | "debug"
  
  // Submission Form State
  const [contestantId, setContestantId] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [submissionStatus, setSubmissionStatus] = useState(null); // null | "uploading" | "success" | "failed"
  const [submissionLogs, setSubmissionLogs] = useState("");

  // Debug run form state
  const [debugContestant, setDebugContestant] = useState("team-lambda");
  const [debugTps, setDebugTps] = useState(24500);
  const [debugLatency, setDebugLatency] = useState(0.42);
  const [debugSuccessRate, setDebugSuccessRate] = useState(100.0);
  const [debugStatus, setDebugStatus] = useState("");

  // Helper to determine endpoints based on port
  const getApiBase = () => {
    if (typeof window === "undefined") return "";
    return window.location.port === "3000" ? "http://localhost:8282" : "";
  };

  const getWsUrl = () => {
    if (typeof window === "undefined") return "";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    if (window.location.port === "3000") {
      return "ws://localhost:8282/ws/leaderboard/live";
    }
    return `${protocol}//${window.location.host}/ws/leaderboard/live`;
  };

  // Log activity
  const addLog = useCallback((sender, msg, type = "info") => {
    setActivityFeed((prev) => [
      {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        sender,
        msg,
        type
      },
      ...prev.slice(0, 29) // Keep max 30 logs
    ]);
  }, []);

  // Fetch Leaderboard data
  const fetchLeaderboard = useCallback(async () => {
    try {
      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/api/v1/leaderboard`);
      if (!response.ok) throw new Error("Failed to fetch standings");
      const data = await response.json();
      setLeaderboard(data || []);
    } catch (err) {
      console.error(err);
      addLog("System", "Failed to retrieve leaderboard from server.", "error");
    }
  }, [addLog]);

  // WebSocket Connection
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    const connect = () => {
      const wsUrl = getWsUrl();
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnected(true);
        addLog("System", "WebSocket connection active. Listening for live updates.", "success");
        fetchLeaderboard();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_run" || data.contestant_id) {
            // Some WS triggers might emit raw telemetry structures
            const contestant = data.contestant_id || "Contestant";
            const score = Math.round(data.score || 0);
            addLog(contestant, `Completed a new benchmark run! Final Score: ${score}`, "success");
            fetchLeaderboard();
          }
        } catch (e) {
          console.error("WS parse error", e);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        addLog("System", "WebSocket connection lost. Retrying in 4 seconds...", "warning");
        reconnectTimeout = setTimeout(connect, 4000);
      };

      ws.onerror = (err) => {
        console.error("WS error:", err);
      };
    };

    connect();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [fetchLeaderboard, addLog]);

  // Initial load
  useEffect(() => {
    fetchLeaderboard();
    setActivityFeed([
      { 
        id: 1, 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), 
        sender: "System", 
        msg: "Subscribing to active benchmark events...", 
        type: "system" 
      }
    ]);
  }, [fetchLeaderboard]);

  // Filter leaderboard
  const filteredLeaderboard = leaderboard.filter((item) =>
    item.contestant_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Submit git repository
  const handleGitSubmit = async (e) => {
    e.preventDefault();
    if (!contestantId || !gitUrl) return;

    setSubmissionStatus("uploading");
    setSubmissionLogs("Sending repository details to EKS builder namespace...\n");

    try {
      const apiBase = getApiBase();
      // Use the submission port which runs on 9090 or 9091 (or mapped via ingress)
      // For local testing in dev, it falls back to port 9090
      const port = window.location.port === "3000" ? "http://localhost:9090" : "";
      const response = await fetch(`${port}/api/v1/submissions/git`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contestant_id: contestantId, git_url: gitUrl })
      });

      if (!response.ok) {
        throw new Error(await response.text() || "Failed to submit repository");
      }

      const resData = await response.json();
      setSubmissionStatus("success");
      setSubmissionLogs((prev) => 
        prev + `SUCCESS: Submission ${resData.id} created.\nStatus: PENDING / CLONING\n`
      );
      addLog("Submission", `New Git repository submitted for team: ${contestantId}`, "success");
      setGitUrl("");
    } catch (err) {
      setSubmissionStatus("failed");
      setSubmissionLogs((prev) => prev + `ERROR: ${err.message}\n`);
    }
  };

  // Submit file upload
  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!contestantId || !uploadFile) return;

    setSubmissionStatus("uploading");
    setSubmissionLogs("Uploading archive to submission service...\n");

    const formData = new FormData();
    formData.append("source", uploadFile);

    try {
      const apiBase = getApiBase();
      const port = window.location.port === "3000" ? "http://localhost:9090" : "";
      const response = await fetch(`${port}/api/v1/submissions`, {
        method: "POST",
        headers: {
          "X-Contestant-ID": contestantId
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(await response.text() || "Failed to upload file");
      }

      const resData = await response.json();
      setSubmissionStatus("success");
      setSubmissionLogs((prev) => 
        prev + `SUCCESS: Upload completed successfully.\nSubmission ID: ${resData.id}\nStatus: PENDING\n`
      );
      addLog("Submission", `New file archive uploaded for team: ${contestantId}`, "success");
      setUploadFile(null);
    } catch (err) {
      setSubmissionStatus("failed");
      setSubmissionLogs((prev) => prev + `ERROR: ${err.message}\n`);
    }
  };

  // Trigger Mock run
  const triggerMockRun = async (e) => {
    e.preventDefault();
    setDebugStatus("Triggering benchmark run...");

    try {
      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/api/v1/debug/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contestant_id: debugContestant,
          submission_id: `mock-${Date.now().toString().slice(-4)}`,
          tps: Number(debugTps),
          p99_latency_ms: Number(debugLatency),
          success_rate: Number(debugSuccessRate)
        })
      });

      if (!response.ok) throw new Error("Failed to trigger mock run");
      
      setDebugStatus("Mock run processed successfully!");
      setTimeout(() => setDebugStatus(""), 3000);
    } catch (err) {
      setDebugStatus(`Error: ${err.message}`);
    }
  };

  // Best statistics
  const topTPS = leaderboard.length > 0 ? Math.max(...leaderboard.map(item => item.tps)) : 0;
  const bestLatency = leaderboard.length > 0 ? Math.min(...leaderboard.map(item => item.p99_latency_ms)) : 0;
  const totalSubmissions = leaderboard.length;

  // Custom Chart Data calculation for top 5 entries
  const topFive = leaderboard.slice(0, 5);
  const maxChartTps = topFive.length > 0 ? Math.max(...topFive.map(t => t.tps)) * 1.15 : 1000;
  const maxChartLatency = topFive.length > 0 ? Math.max(...topFive.map(t => t.p99_latency_ms)) * 1.15 : 1.0;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-950 via-zinc-950 to-black text-zinc-100 font-sans antialiased">
      {/* Background neon glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-20 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        
        {/* Header Bar */}
        <header className="flex flex-col md:flex-row justify-between items-center pb-6 border-b border-zinc-800/80 mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-cyan-500 to-purple-600 rounded-xl shadow-lg shadow-cyan-500/10 border border-cyan-400/20">
              <Cpu className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                HFT.BENCHMARK
              </h1>
              <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                Distributed Execution Arena
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold backdrop-blur-md ${
              connected 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                : "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse"
            }`}>
              <span className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-emerald-400 shadow-lg shadow-emerald-500/50" : "bg-amber-400"}`}></span>
              {connected ? "LIVE CONNECTED" : "CONNECTING..."}
            </div>
          </div>
        </header>

        {/* Dashboard Stat Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Stat 1 */}
          <div className="relative group overflow-hidden backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 hover:border-zinc-700/60 transition-all duration-300">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-cyan-500/5 rounded-full blur-xl group-hover:bg-cyan-500/10 transition-all duration-300"></div>
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Peak Throughput</span>
              <div className="p-1.5 bg-cyan-500/10 rounded-lg"><Zap className="w-5 h-5 text-cyan-400" /></div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-cyan-400">
              {topTPS > 0 ? topTPS.toLocaleString() : "0"} <span className="text-sm font-normal text-zinc-500">TPS</span>
            </div>
            <p className="text-xs text-zinc-500 mt-2">Maximum orders matched per second</p>
          </div>

          {/* Stat 2 */}
          <div className="relative group overflow-hidden backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 hover:border-zinc-700/60 transition-all duration-300">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-purple-500/5 rounded-full blur-xl group-hover:bg-purple-500/10 transition-all duration-300"></div>
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Min p99 Latency</span>
              <div className="p-1.5 bg-purple-500/10 rounded-lg"><Clock className="w-5 h-5 text-purple-400" /></div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-purple-400">
              {bestLatency > 0 ? bestLatency.toFixed(2) : "0.00"} <span className="text-sm font-normal text-zinc-500">MS</span>
            </div>
            <p className="text-xs text-zinc-500 mt-2">Optimal 99th percentile RTT matching delay</p>
          </div>

          {/* Stat 3 */}
          <div className="relative group overflow-hidden backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 hover:border-zinc-700/60 transition-all duration-300">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all duration-300"></div>
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Submissions</span>
              <div className="p-1.5 bg-emerald-500/10 rounded-lg"><CheckCircle className="w-5 h-5 text-emerald-400" /></div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-emerald-400">
              {totalSubmissions} <span className="text-sm font-normal text-zinc-500">Engines</span>
            </div>
            <p className="text-xs text-zinc-500 mt-2">Validated engines actively ranked</p>
          </div>
        </section>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800/80 mb-6 gap-2">
          <button 
            onClick={() => setActiveTab("standings")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
              activeTab === "standings" 
                ? "border-cyan-400 text-cyan-400" 
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4" /> Standings & Leaderboard
            </div>
          </button>
          <button 
            onClick={() => setActiveTab("submit")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
              activeTab === "submit" 
                ? "border-cyan-400 text-cyan-400" 
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4" /> Submit Engine
            </div>
          </button>
          <button 
            onClick={() => setActiveTab("debug")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
              activeTab === "debug" 
                ? "border-cyan-400 text-cyan-400" 
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4" /> Mock Run Portal
            </div>
          </button>
        </div>

        {/* Tab 1: Leaderboard & Charts */}
        {activeTab === "standings" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Col - 2/3 width - Leaderboard */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Leaderboard Table Container */}
              <div className="backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-5 border-b border-zinc-800/80 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div>
                    <h3 className="text-lg font-bold tracking-tight">Active Leaderboard</h3>
                    <p className="text-xs text-zinc-500">Real-time standings based on TPS and Latency</p>
                  </div>

                  {/* Search Bar */}
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input 
                      type="text"
                      placeholder="Search contestant..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-zinc-700 text-zinc-200 placeholder-zinc-500"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800/50 bg-zinc-950/30 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        <th className="py-3.5 px-5 text-center w-16">Rank</th>
                        <th className="py-3.5 px-4">Contestant / Team</th>
                        <th className="py-3.5 px-4 text-right">Throughput (TPS)</th>
                        <th className="py-3.5 px-4 text-right">p99 Latency</th>
                        <th className="py-3.5 px-4 text-right">Success Rate</th>
                        <th className="py-3.5 px-5 text-right w-24 text-cyan-400">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 text-sm">
                      {filteredLeaderboard.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="py-12 text-center text-zinc-500">
                            No active submissions found. Use the "Submit Engine" tab to deploy one.
                          </td>
                        </tr>
                      ) : (
                        filteredLeaderboard.map((item, index) => {
                          const rank = index + 1;
                          return (
                            <tr 
                              key={item.submission_id || index}
                              className="hover:bg-zinc-800/10 transition-colors group"
                            >
                              <td className="py-3.5 px-5 text-center">
                                {rank === 1 && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-400 font-bold border border-yellow-500/30">1</span>}
                                {rank === 2 && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-400/20 text-zinc-300 font-bold border border-zinc-400/30">2</span>}
                                {rank === 3 && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-600/20 text-amber-500 font-bold border border-amber-500/30">3</span>}
                                {rank > 3 && <span className="text-zinc-500 font-medium">{rank}</span>}
                              </td>
                              <td className="py-3.5 px-4 font-semibold text-zinc-200">
                                {item.contestant_id}
                              </td>
                              <td className="py-3.5 px-4 text-right text-zinc-300 font-mono">
                                {item.tps.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-xs text-zinc-500">tx/s</span>
                              </td>
                              <td className="py-3.5 px-4 text-right text-zinc-300 font-mono">
                                {item.p99_latency_ms.toFixed(2)} <span className="text-xs text-zinc-500">ms</span>
                              </td>
                              <td className="py-3.5 px-4 text-right text-zinc-300 font-mono">
                                {item.success_rate.toFixed(2)}%
                              </td>
                              <td className="py-3.5 px-5 text-right font-bold text-cyan-400 font-mono">
                                {Math.round(item.score).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Col - 1/3 width - Charts and Activity logs */}
            <div className="space-y-6">
              
              {/* Custom SVG Performance Curve Chart */}
              <div className="backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 shadow-xl">
                <div className="flex justify-between items-center mb-5 pb-3 border-b border-zinc-800/80">
                  <div>
                    <h3 className="text-base font-bold">Top Performance Curve</h3>
                    <p className="text-xs text-zinc-500">Throughput vs Latency of Top 5 Teams</p>
                  </div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-400/20">
                    Live
                  </div>
                </div>

                <div className="relative h-60 w-full bg-zinc-950/40 rounded-xl p-3 border border-zinc-900/50">
                  {topFive.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-zinc-500">
                      No data to chart.
                    </div>
                  ) : (
                    <svg className="w-full h-full" viewBox="0 0 300 160">
                      {/* Grid lines */}
                      <line x1="40" y1="20" x2="280" y2="20" stroke="#1f2937" strokeWidth="0.5" />
                      <line x1="40" y1="60" x2="280" y2="60" stroke="#1f2937" strokeWidth="0.5" />
                      <line x1="40" y1="100" x2="280" y2="100" stroke="#1f2937" strokeWidth="0.5" />
                      <line x1="40" y1="130" x2="280" y2="130" stroke="#374151" strokeWidth="0.8" />

                      {/* Render Bars (TPS) */}
                      {topFive.map((team, idx) => {
                        const x = 55 + idx * 45;
                        const barHeight = (team.tps / maxChartTps) * 110;
                        const y = 130 - barHeight;
                        return (
                          <g key={idx} className="group">
                            <rect 
                              x={x} 
                              y={y} 
                              width="16" 
                              height={barHeight} 
                              fill="url(#barGradient)" 
                              rx="3" 
                              className="transition-all duration-300 hover:opacity-80"
                            />
                            {/* Bar Label */}
                            <text x={x + 8} y={y - 4} fill="#06b6d4" fontSize="6.5" textAnchor="middle" fontWeight="bold">
                              {Math.round(team.tps)}
                            </text>
                            {/* X-axis labels */}
                            <text x={x + 8} y="145" fill="#6b7280" fontSize="6.5" textAnchor="middle">
                              {team.contestant_id.slice(0, 7)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Render Line (Latency) */}
                      <path 
                        d={topFive.map((team, idx) => {
                          const x = 55 + idx * 45 + 8;
                          const y = 130 - (team.p99_latency_ms / maxChartLatency) * 110;
                          return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
                        }).join(" ")}
                        fill="none" 
                        stroke="#a855f7" 
                        strokeWidth="1.8" 
                      />

                      {/* Line Points */}
                      {topFive.map((team, idx) => {
                        const x = 55 + idx * 45 + 8;
                        const y = 130 - (team.p99_latency_ms / maxChartLatency) * 110;
                        return (
                          <g key={idx}>
                            <circle cx={x} cy={y} r="3" fill="#a855f7" stroke="#000" strokeWidth="0.8" />
                            <text x={x} y={y - 6} fill="#c084fc" fontSize="6" textAnchor="middle" fontWeight="bold">
                              {team.p99_latency_ms.toFixed(2)}m
                            </text>
                          </g>
                        );
                      })}

                      {/* Chart Gradients */}
                      <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8"/>
                          <stop offset="100%" stopColor="#0891b2" stopOpacity="0.2"/>
                        </linearGradient>
                      </defs>
                    </svg>
                  )}
                </div>
                
                {/* Legend */}
                <div className="flex justify-center gap-6 mt-4 text-[10px] font-semibold text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1.5 bg-cyan-400 rounded-sm"></span>
                    <span>TPS (Bar)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-purple-500 block"></span>
                    <span>Latency ms (Line)</span>
                  </div>
                </div>
              </div>

              {/* System Feed Logs */}
              <div className="backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 shadow-xl flex flex-col h-[320px]">
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-zinc-800/80">
                  <div>
                    <h3 className="text-base font-bold">Activity Feed</h3>
                    <p className="text-xs text-zinc-500">Live system and run notifications</p>
                  </div>
                  <Terminal className="w-4 h-4 text-cyan-400 animate-pulse" />
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs font-mono scrollbar-thin">
                  {activityFeed.map((log) => (
                    <div key={log.id} className={`p-2.5 rounded-lg border leading-relaxed ${
                      log.type === "success" 
                        ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400/90" 
                        : log.type === "error" 
                          ? "bg-rose-500/5 border-rose-500/10 text-rose-400/90"
                          : log.type === "warning"
                            ? "bg-amber-500/5 border-amber-500/10 text-amber-400/90"
                            : "bg-zinc-950/40 border-zinc-900 text-zinc-400"
                    }`}>
                      <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                        <span>[{log.time}]</span>
                        <span className="font-bold">{log.sender}</span>
                      </div>
                      <p>{log.msg}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Tab 2: Submission Portal */}
        {activeTab === "submit" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left side: Upload code form */}
            <div className="backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 shadow-xl space-y-6">
              <div>
                <h3 className="text-lg font-bold">Engine Code Submission</h3>
                <p className="text-xs text-zinc-500">Upload your compiled Go engine or submit a git repository URL for sandboxing.</p>
              </div>

              {/* Mode switch */}
              <form onSubmit={handleGitSubmit} className="space-y-4">
                <h4 className="text-sm font-bold flex items-center gap-2 text-cyan-400"><GitBranch className="w-4 h-4" /> Option A: Public Git Repository</h4>
                
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Contestant/Team ID</label>
                  <input 
                    type="text"
                    required
                    placeholder="Enter your registered team name (e.g. team-alpha)"
                    value={contestantId}
                    onChange={(e) => setContestantId(e.target.value)}
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-700 text-zinc-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Git Repository URL</label>
                  <input 
                    type="url"
                    required
                    placeholder="https://github.com/username/trading-engine"
                    value={gitUrl}
                    onChange={(e) => setGitUrl(e.target.value)}
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-700 text-zinc-200"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={submissionStatus === "uploading"}
                  className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-black font-bold py-2.5 px-4 rounded-xl text-sm transition-all shadow-md shadow-cyan-500/10 disabled:opacity-50"
                >
                  Clone & Compile
                </button>
              </form>

              <div className="h-px bg-zinc-800/50 my-6"></div>

              {/* Archive upload */}
              <form onSubmit={handleFileUpload} className="space-y-4">
                <h4 className="text-sm font-bold flex items-center gap-2 text-purple-400"><Upload className="w-4 h-4" /> Option B: Source Archive (.zip)</h4>
                
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">File Archive</label>
                  <input 
                    type="file"
                    required
                    accept=".zip,.tar,.gz"
                    onChange={(e) => setUploadFile(e.target.files[0])}
                    className="w-full bg-zinc-950/40 border border-zinc-800 border-dashed rounded-xl px-4 py-6 text-sm text-zinc-400 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={submissionStatus === "uploading"}
                  className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all shadow-md shadow-purple-500/10 disabled:opacity-50"
                >
                  Upload & Deploy
                </button>
              </form>
            </div>

            {/* Right side: Log window */}
            <div className="backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 shadow-xl flex flex-col h-[530px]">
              <div>
                <h3 className="text-lg font-bold">Build Logs & Sandbox Status</h3>
                <p className="text-xs text-zinc-500">Monitor compilation progress and container sandboxing logs.</p>
              </div>

              {/* Status Panel */}
              <div className="mt-4 p-4 rounded-xl border border-zinc-800 bg-zinc-950/40 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  submissionStatus === "success" 
                    ? "bg-emerald-500/10 text-emerald-400" 
                    : submissionStatus === "failed" 
                      ? "bg-rose-500/10 text-rose-400"
                      : submissionStatus === "uploading"
                        ? "bg-cyan-500/10 text-cyan-400 animate-pulse"
                        : "bg-zinc-800 text-zinc-500"
                }`}>
                  {submissionStatus === "success" && <CheckCircle className="w-5 h-5" />}
                  {submissionStatus === "failed" && <AlertTriangle className="w-5 h-5" />}
                  {submissionStatus === "uploading" && <Activity className="w-5 h-5" />}
                  {submissionStatus === null && <Terminal className="w-5 h-5" />}
                </div>

                <div>
                  <span className="text-xs text-zinc-500 uppercase font-semibold">Builder Status</span>
                  <p className="text-sm font-bold text-zinc-200 uppercase tracking-wide">
                    {submissionStatus === "success" && "SUCCESS / CLONING"}
                    {submissionStatus === "failed" && "BUILD FAILED"}
                    {submissionStatus === "uploading" && "PROCESSING..."}
                    {submissionStatus === null && "IDLE / WAITING"}
                  </p>
                </div>
              </div>

              {/* Logs terminal */}
              <div className="flex-1 mt-4 bg-black border border-zinc-850 rounded-xl p-4 font-mono text-xs text-zinc-400 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                {submissionLogs || "Build logs will be output here once a submission is uploaded..."}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Debug Mock Run Tool */}
        {activeTab === "debug" && (
          <div className="max-w-xl mx-auto backdrop-blur-md bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 shadow-xl">
            <div className="mb-6 pb-3 border-b border-zinc-800/80 flex items-center gap-3">
              <Play className="w-6 h-6 text-purple-400" />
              <div>
                <h3 className="text-lg font-bold">Mock Run Console</h3>
                <p className="text-xs text-zinc-500">Inject custom execution reports directly into Redis to test stand updates.</p>
              </div>
            </div>

            <form onSubmit={triggerMockRun} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Contestant/Team ID</label>
                <input 
                  type="text"
                  required
                  value={debugContestant}
                  onChange={(e) => setDebugContestant(e.target.value)}
                  className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-700 text-zinc-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Throughput (TPS)</label>
                  <input 
                    type="number"
                    required
                    value={debugTps}
                    onChange={(e) => setDebugTps(e.target.value)}
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-700 text-zinc-200 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">p99 Latency (ms)</label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    value={debugLatency}
                    onChange={(e) => setDebugLatency(e.target.value)}
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-700 text-zinc-200 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Success Rate (%)</label>
                <input 
                  type="number"
                  step="0.1"
                  required
                  value={debugSuccessRate}
                  onChange={(e) => setDebugSuccessRate(e.target.value)}
                  className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-700 text-zinc-200 font-mono"
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all shadow-md shadow-purple-500/10"
              >
                Simulate Run Completion
              </button>

              {debugStatus && (
                <div className={`p-3 rounded-xl border text-xs font-semibold font-mono text-center ${
                  debugStatus.includes("Error") 
                    ? "bg-rose-500/5 border-rose-500/10 text-rose-400" 
                    : "bg-emerald-500/5 border-emerald-500/10 text-emerald-400"
                }`}>
                  {debugStatus}
                </div>
              )}
            </form>
          </div>
        )}

        {/* Footer info */}
        <footer className="mt-12 pt-6 border-t border-zinc-900 text-center text-xs text-zinc-600 flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-zinc-500" />
            <span>Phases 1-8 Complete</span>
          </div>
          <span>Distributed Trading Platform Benchmarking Suite</span>
        </footer>

      </div>
    </div>
  );
}
