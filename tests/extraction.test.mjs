import assert from "node:assert/strict";
import { dedupeMessages, isNoiseText, normalizeText, selectedTextFallback, shouldKeepText } from "../src/extraction-utils.js";
import { buildExportSummary, buildSummaryCounts } from "../src/summary-utils.js";
import { classifyMessage } from "../src/classifier.js";

assert.equal(normalizeText(" hello   world "), "hello world");
assert.equal(isNoiseText("Inbox"), true);
assert.equal(isNoiseText("10:30 AM"), true);
assert.equal(shouldKeepText("Messages"), false);
assert.equal(shouldKeepText("Could you confirm your interview schedule for next week?"), true);

const deduped = dedupeMessages([
  { raw_text: "Hello there" },
  { raw_text: "  hello   there " },
  { raw_text: "Different message text" }
]);
assert.equal(deduped.length, 2);

const selection = selectedTextFallback("Can we schedule a recruiting call for this internship role?", "https://app.joinhandshake.com/messages");
assert.equal(selection?.ok, true);
assert.equal(selection?.source, "handshake_live_dom");
assert.equal(Array.isArray(selection?.messages), true);
assert.equal(selection?.messages?.[0]?.detected_platform, "Handshake");

const risky = classifyMessage("Please send your SSN and bank info with a wire transfer payment.");
assert.equal(risky.is_risky, true);
assert.ok(risky.why_this_matters.length > 10);

const high = classifyMessage("A recruiter would like to schedule your interview and discuss next steps.");
assert.equal(high.priority, "High");

const medium = classifyMessage("Alumni networking coffee chat invite from career services.");
assert.equal(medium.priority, "Medium");

const low = classifyMessage("Generic promotion newsletter blast for all students.");
assert.equal(low.priority, "Low");

const sampleResults = [
  { message: { id: "a1", sender: "Recruiter" }, classification: high },
  { message: { id: "a2", sender: "Alumni" }, classification: medium },
  { message: { id: "a3", sender: null }, classification: risky }
];

const summary = buildSummaryCounts(sampleResults);
assert.equal(summary.total, 3);
assert.equal(summary.high, 1);
assert.equal(summary.medium, 1);
assert.equal(summary.risky, 1);

const exported = buildExportSummary({ source: "Live Handshake page", results: sampleResults, timestamp: "2026-04-27T12:00:00.000Z" });
assert.equal(exported.timestamp, "2026-04-27T12:00:00.000Z");
assert.equal(exported.total_messages_analyzed, 3);
assert.equal(Array.isArray(exported.messages), true);
assert.equal(exported.messages[0].raw_text, undefined);
assert.ok(typeof exported.messages[0].why_this_matters === "string");

console.log("extraction tests passed");
