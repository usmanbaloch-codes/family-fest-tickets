// Ticket sales API for Vercel.
// Storage: Upstash Redis (add it in Vercel → Storage → Upstash Redis → Connect).
// Every sale is kept in the Redis hash "sales". Removing a sale only marks it
// as removed, so nothing is ever truly deleted.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PIN = (process.env.DESK_PIN || "").trim();
const KEY = "ffe:sales";

async function redis(command) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `Database error ${r.status}`);
  return j.result;
}

function clean(s, n) { return String(s ?? "").trim().slice(0, n); }

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!URL_ || !TOKEN) {
    return res.status(500).json({ error: "Database not connected. In Vercel, open Storage, add Upstash Redis, connect it to this project, then redeploy." });
  }
  if (PIN && String(req.headers["x-desk-pin"] || "").trim() !== PIN) {
    return res.status(401).json({ error: "Wrong PIN" });
  }

  try {
    if (req.method === "GET") {
      const flat = (await redis(["HGETALL", KEY])) || [];
      const sales = [];
      for (let i = 0; i < flat.length; i += 2) {
        try { sales.push(JSON.parse(flat[i + 1])); } catch {}
      }
      sales.sort((a, b) => (a.at || 0) - (b.at || 0));
      return res.status(200).json({ sales });
    }

    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const id = clean(b.id, 64);
      const name = clean(b.name, 120);
      const qty = Math.floor(Number(b.qty));
      const price = Number(b.price);
      if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return res.status(400).json({ error: "Bad id" });
      if (!name) return res.status(400).json({ error: "Name is required" });
      if (!(qty >= 1 && qty <= 1000)) return res.status(400).json({ error: "Tickets must be 1 or more" });
      if (!(price >= 0 && price <= 1000000)) return res.status(400).json({ error: "Bad price" });
      const rec = {
        id, name, qty, price, amount: qty * price,
        counter: clean(b.counter, 30),
        at: Number(b.at) || Date.now(),
        savedAt: Date.now(),
        removed: false,
      };
      // HSET with the same id twice just overwrites, so a retried upload never makes a duplicate.
      await redis(["HSET", KEY, id, JSON.stringify(rec)]);
      return res.status(200).json({ ok: true, sale: rec });
    }

    if (req.method === "DELETE") {
      const id = clean(req.query.id, 64);
      const raw = await redis(["HGET", KEY, id]);
      if (!raw) return res.status(404).json({ error: "Not found" });
      const rec = JSON.parse(raw);
      rec.removed = true;
      rec.removedAt = Date.now();
      await redis(["HSET", KEY, id, JSON.stringify(rec)]);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
