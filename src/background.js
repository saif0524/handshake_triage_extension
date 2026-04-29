import { classifyMessage } from "./classifier.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    htaInstalledAt: new Date().toISOString(),
    htaMode: "local-mock",
    htaAudienceMode: "student"
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return false;

  try {
    if (message.type === "HTA_ANALYZE_MESSAGE") {
      const result = classifyMessage(message.payload?.text || "", {
        sender: message.payload?.sender || null,
        mode: message.payload?.mode || "student"
      });
      sendResponse({ ok: true, result });
      return true;
    }

    if (message.type === "HTA_ANALYZE_MESSAGES") {
      const messages = Array.isArray(message.payload?.messages) ? message.payload.messages : [];
      const mode = message.payload?.mode || "student";
      const results = messages.map((item) => ({
        message: item,
        classification: classifyMessage(item?.raw_text || "", {
          sender: item?.sender || null,
          mode
        })
      }));
      sendResponse({ ok: true, results });
      return true;
    }

    if (message.type === "HTA_GET_MODE") {
      chrome.storage.local.get(["htaAudienceMode"], (store) => {
        sendResponse({
          ok: true,
          mode: store?.htaAudienceMode === "recruiter" ? "recruiter" : "student"
        });
      });
      return true;
    }

    if (message.type === "HTA_SET_MODE") {
      const mode = message.payload?.mode === "recruiter" ? "recruiter" : "student";
      chrome.storage.local.set({ htaAudienceMode: mode }, () => {
        sendResponse({ ok: true, mode });
      });
      return true;
    }

    return false;
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown analysis error"
    });
    return true;
  }
});
