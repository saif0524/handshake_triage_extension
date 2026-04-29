export function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function isNoiseText(text) {
  const clean = normalizeText(text).toLowerCase();
  if (!clean) return true;
  const exact = new Set(["messages", "search", "inbox", "archive", "unread", "settings", "send", "reply", "attach", "handshake"]);
  if (exact.has(clean)) return true;
  if (/^\d{1,2}:\d{2}\s?(am|pm)?$/.test(clean)) return true;
  if (/^(today|yesterday|just now)$/.test(clean)) return true;
  return false;
}

export function shouldKeepText(text) {
  const clean = normalizeText(text);
  if (clean.length < 20) return false;
  if (isNoiseText(clean)) return false;
  if (!/[a-z]{3,}/i.test(clean)) return false;
  if (/\b(messages|search|settings|archive|inbox)\b/i.test(clean) && clean.length < 35) return false;
  return clean.length >= 30 || /\b(interview|job|internship|application|schedule|recruiter|event|career)\b/i.test(clean);
}

export function dedupeMessages(messages) {
  const seen = new Set();
  const out = [];
  for (const message of messages) {
    const raw = normalizeText(message?.raw_text || "").toLowerCase();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    out.push(message);
  }
  return out;
}

export function selectedTextFallback(selectedText, url) {
  const clean = normalizeText(selectedText);
  if (clean.length < 20) return null;
  return {
    ok: true,
    source: "handshake_live_dom",
    extracted_at: new Date().toISOString(),
    url,
    messages: [
      {
        id: hashString(clean.toLowerCase()).slice(0, 12),
        source: "handshake_live_dom",
        sender: null,
        timestamp: null,
        raw_text: clean,
        detected_platform: "Handshake",
        extraction_confidence: 0.95
      }
    ],
    debug: {
      strategy_used: "selection_fallback",
      candidate_count: 1,
      deduped_count: 1
    }
  };
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0).toString(16);
}
