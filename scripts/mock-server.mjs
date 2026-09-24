// Local dev/test server: serves public/ like Vercel does and mocks /api/grade.
// Usage: node scripts/mock-server.mjs [port] [mode]   mode = ok | garbage | error
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "public");
const PORT = Number(process.argv[2] || 4173);
const MODE = process.argv[3] || "ok";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/manifest+json", ".png": "image/png", ".ico": "image/x-icon" };

export const SAMPLE = {
  item_name: "Goldfish Cheddar Crackers",
  item_type: "Food",
  confidence: "high",
  overall_grade: "B-",
  headline: "Fine snack, not a food group.",
  summary: "Goldfish Cheddar Crackers are a staple for a reason, they are baked, made with real cheese, and the small size works well for little hands. The downside? About 230 mg sodium per serving and refined white flour means they are more of a treat than a power snack. They will not hurt, but pair them with fruit or veggies to round things out.",
  categories: [
    { name: "Nutrition", grade: "C+", note: "250mg sodium per serving, 1g fiber, 0g added sugar." },
    { name: "Health & Safety", grade: "B", note: "Small and crumbly, so fine for ages 2 and up with supervision." },
    { name: "Age Appropriateness", grade: "A-", note: "Easy to chew and portion for toddlers." },
    { name: "Fun Factor", grade: "A", note: "Kids love the fish shape and the mild cheddar flavor makes them a universal hit." },
  ],
  quick_tip: "Serve a small handful next to fruit or cheese so the snack has some staying power.",
  alternatives: [
    { name: "Annie's Cheddar Bunnies", grade: "B", why: "Same idea, organic flour, slightly less sodium." },
    { name: "Simple Mills Almond Flour Crackers", grade: "B+", why: "More protein and fiber, no refined flour." },
    { name: "Cheese cubes with whole grain crackers", grade: "A", why: "Real protein plus fiber, and toddlers can self-feed." },
  ],
  sources_note: "USDA Dietary Guidelines for ages 2 to 5 and AAP snack guidance.",
};

function send(res, code, body, type) {
  res.writeHead(code, { "Content-Type": type || "application/json" });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/grade") {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (MODE === "garbage") return send(res, 502, JSON.stringify({ error: "We could not read that grade. Try a clearer photo?" }));
      if (MODE === "error") return send(res, 500, JSON.stringify({ error: "Something went sideways on our end. Try again?" }));
      let body = {};
      try { body = JSON.parse(data); } catch {}
      if (!body.image_base64) return send(res, 400, JSON.stringify({ error: "Missing image data" }));
      setTimeout(() => send(res, 200, JSON.stringify(SAMPLE)), 300);
    });
    return;
  }
  let p = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "not found", "text/plain");
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || "application/octet-stream");
});

server.listen(PORT, () => console.log(`mock server on http://localhost:${PORT} (mode=${MODE})`));
