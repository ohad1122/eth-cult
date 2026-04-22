require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3001;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "CHY4ZYN8ZXJSJEP53AGJXJHY8V2A8UHNKN";
const DB_FILE = path.join(__dirname, "members.json");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Simple JSON database ──────────────────────────
function readDB() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ── Etherscan helpers ────────────────────────────
async function etherscanGet(module, action, params = {}) {
  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("chainid", "1");
  url.searchParams.set("module", module);
  url.searchParams.set("action", action);
  url.searchParams.set("apikey", ETHERSCAN_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  return res.json();
}

function safeWeiToEth(raw) {
  if (!raw || typeof raw !== "string" || !/^\d+$/.test(raw.trim())) return "0";
  return (Number(BigInt(raw.trim())) / 1e18).toFixed(4);
}

async function getWalletStats(address) {
  try {
    const [balRes, txRes] = await Promise.all([
      etherscanGet("account", "balance", { address, tag: "latest" }),
      etherscanGet("account", "txlist", { address, startblock: 0, endblock: 99999999, page: 1, offset: 50, sort: "desc" }),
    ]);
    const eth = parseFloat(safeWeiToEth(balRes.result));
    const txCount = txRes.status === "1" && Array.isArray(txRes.result) ? txRes.result.length : 0;

    // Cult rank based on ETH + activity
    let rank, rankColor;
    if (eth >= 100) { rank = "🔱 ARCH ELDER"; rankColor = "#f59e0b"; }
    else if (eth >= 10) { rank = "⛧ HIGH PRIEST"; rankColor = "#a855f7"; }
    else if (eth >= 1) { rank = "🜂 CULTIST"; rankColor = "#6366f1"; }
    else if (eth >= 0.1) { rank = "🕯 INITIATE"; rankColor = "#14b8a6"; }
    else { rank = "👁 SEEKER"; rankColor = "#64748b"; }

    return { eth, txCount, rank, rankColor };
  } catch {
    return { eth: 0, txCount: 0, rank: "👁 SEEKER", rankColor: "#64748b" };
  }
}

// ── API Routes ────────────────────────────────────

// Register
app.post("/api/register", async (req, res) => {
  try {
    const { wallet, name } = req.body;
    if (!wallet || !name) return res.status(400).json({ error: "Wallet and name required" });
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return res.status(400).json({ error: "Invalid ETH address" });
    if (name.length > 32) return res.status(400).json({ error: "Name too long (max 32 chars)" });

    const members = readDB();
    const existing = members.find(m => m.wallet.toLowerCase() === wallet.toLowerCase());
    if (existing) return res.status(400).json({ error: "Wallet already in the cult!" });

    const stats = await getWalletStats(wallet);
    const member = {
      id: Date.now(),
      wallet,
      name: name.trim(),
      joinedAt: new Date().toISOString(),
      eth: stats.eth,
      txCount: stats.txCount,
      rank: stats.rank,
      rankColor: stats.rankColor,
    };

    members.unshift(member);
    writeDB(members);
    res.json({ success: true, member });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all members
app.get("/api/members", (req, res) => {
  const members = readDB();
  // Sort by ETH desc
  const sorted = [...members].sort((a, b) => b.eth - a.eth);
  res.json({ members: sorted, total: members.length, totalEth: members.reduce((s, m) => s + m.eth, 0).toFixed(2) });
});

// Check wallet
app.get("/api/check/:wallet", async (req, res) => {
  try {
    const stats = await getWalletStats(req.params.wallet);
    const members = readDB();
    const isMember = members.some(m => m.wallet.toLowerCase() === req.params.wallet.toLowerCase());
    res.json({ ...stats, isMember });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`\n🔥 ETH CULT running at http://localhost:${PORT}\n`));
