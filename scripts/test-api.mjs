// Unit test for api/grade.js with a mocked Anthropic fetch. Run: node scripts/test-api.mjs
import handler from "../api/grade.js";
import { SAMPLE } from "./mock-server.mjs";

let failures = 0;
function assert(cond, msg) { if (cond) console.log("  PASS", msg); else { failures++; console.log("  FAIL", msg); } }

function makeRes() {
  const res = { headers: {}, statusCode: 0, body: undefined };
  res.setHeader = (k, v) => (res.headers[k] = v);
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

const goodFetch = async (url, opts) => {
  const req = JSON.parse(opts.body);
  return {
    ok: true, status: 200,
    json: async () => ({ content: [{ type: "tool_use", name: "submit_grade", input: { ...SAMPLE } }], model: req.model }),
    text: async () => "",
  };
};
const garbageFetch = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "Sure! Here is some prose with no JSON at all." }] }), text: async () => "" });
const apiErrorFetch = async () => ({ ok: false, status: 529, json: async () => ({}), text: async () => "overloaded" });
let calls = [];
const notFoundThenOk = async (url, opts) => { const req = JSON.parse(opts.body); calls.push(req.model); if (calls.length === 1) return { ok: false, status: 404, text: async () => "model not found", json: async () => ({}) }; return goodFetch(url, opts); };

const baseReq = { method: "POST", body: { image_base64: "aGVsbG8=", media_type: "image/jpeg" } };

console.log("1. happy path (tool_use response)");
let res = makeRes();
await handler(baseReq, res, { fetch: goodFetch, apiKey: "test" });
assert(res.statusCode === 200, "status 200");
assert(/^[A-F][+-]?$/.test(res.body.overall_grade), "overall_grade is a letter grade: " + res.body.overall_grade);
assert(Array.isArray(res.body.categories) && res.body.categories.length >= 3, "3+ categories");
assert(Array.isArray(res.body.alternatives) && res.body.alternatives.length >= 2, "2+ alternatives");
assert(typeof res.body.headline === "string" && res.body.headline.length > 0, "headline present");

console.log("2. garbage response (no JSON)");
res = makeRes();
await handler(baseReq, res, { fetch: garbageFetch, apiKey: "test" });
assert(res.statusCode === 502, "status 502");
assert(typeof res.body.error === "string", "error field present");

console.log("3. upstream API error");
res = makeRes();
await handler(baseReq, res, { fetch: apiErrorFetch, apiKey: "test" });
assert(res.statusCode === 502, "status 502");
assert(typeof res.body.error === "string" && !/overloaded/.test(res.body.error), "friendly error, no raw upstream text");

console.log("4. model fallback on 404");
res = makeRes(); calls = [];
await handler(baseReq, res, { fetch: notFoundThenOk, apiKey: "test" });
assert(res.statusCode === 200, "status 200 after fallback");
assert(calls.length === 2 && calls[1] === "claude-sonnet-4-20250514", "second call used fallback model: " + calls.join(" -> "));

console.log("5. input validation");
res = makeRes();
await handler({ method: "POST", body: {} }, res, { fetch: goodFetch, apiKey: "test" });
assert(res.statusCode === 400, "missing image -> 400");
res = makeRes();
await handler({ method: "POST", body: { image_base64: "x".repeat(6 * 1024 * 1024), media_type: "image/jpeg" } }, res, { fetch: goodFetch, apiKey: "test" });
assert(res.statusCode === 413, "oversized image -> 413");
res = makeRes();
await handler({ method: "GET", body: {} }, res, { fetch: goodFetch, apiKey: "test" });
assert(res.statusCode === 405, "GET -> 405");
res = makeRes();
await handler(baseReq, res, { fetch: goodFetch, apiKey: "" });
assert(res.statusCode === 500 && /API key/.test(res.body.error), "missing API key -> 500 with clear message");

console.log("6. em dash cleanup and alternative reason fallback");
const dashFetch = async () => ({ ok: true, status: 200, text: async () => "", json: async () => ({ content: [{ type: "tool_use", name: "submit_grade", input: { ...SAMPLE, summary: "Great snack \u2014 mostly. Fine \u2013 really.", alternatives: [{ name: "X", grade: "A", reason: "cheaper \u2014 and better" }, { name: "Y", grade: "B", why: "" }] } }] }) });
res = makeRes();
await handler(baseReq, res, { fetch: dashFetch, apiKey: "test" });
assert(!/[\u2014\u2013]/.test(JSON.stringify(res.body)), "no em or en dashes anywhere in response");
assert(res.body.summary === "Great snack, mostly. Fine, really.", "dashes replaced with commas: " + res.body.summary);
assert(res.body.alternatives[0].why === "cheaper, and better", "alternative 'reason' key mapped to why");

console.log("7. tool schema sanity");
const { GRADE_TOOL } = await import("../api/grade.js");
assert(GRADE_TOOL.input_schema.required.includes("alternatives"), "alternatives is required in schema");
assert(GRADE_TOOL.input_schema.properties.alternatives.minItems === 2, "alternatives minItems 2");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL API TESTS PASSED");
process.exit(failures ? 1 : 0);
