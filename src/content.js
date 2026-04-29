(function initHandshakeTriageAssistant() {
  if (window.__handshakeTriageAssistantLoaded) return;
  window.__handshakeTriageAssistantLoaded = true;

  const NOISE_EXACT = new Set([
    "messages",
    "search",
    "inbox",
    "archive",
    "unread",
    "settings",
    "send",
    "reply",
    "attach",
    "handshake"
  ]);

  const state = {
    open: false,
    busy: false,
    mode: "student",
    selectedControlAction: "scan",
    lastSourceLabel: "Live Handshake page",
    lastExtraction: null,
    lastAnalysisResults: []
  };

  const root = document.createElement("div");
  root.id = "hta-root";
  root.innerHTML = `
    <button class="hta-launcher" type="button" aria-label="Open Handshake triage">HT</button>
    <aside class="hta-panel" aria-label="Handshake Message Triage Assistant">
      <header class="hta-header">
        <div>
          <p class="hta-kicker">Handshake Triage</p>
          <h2>Message Assistant</h2>
        </div>
        <button class="hta-icon-button" type="button" data-action="close" aria-label="Close">x</button>
      </header>
      <section class="hta-controls">
        <button class="hta-primary" type="button" data-action="scan">Analyze Visible Messages</button>
        <button class="hta-secondary" type="button" data-action="sample-urgent">Sample: urgent</button>
        <button class="hta-secondary" type="button" data-action="sample-logistics">Sample: logistics</button>
        <button class="hta-secondary" type="button" data-action="sample-risk">Sample: risky</button>
      </section>
      <label class="hta-label" for="hta-message-input">Manual paste</label>
      <textarea id="hta-message-input" class="hta-textarea" rows="8" placeholder="Paste message text for manual mode."></textarea>
      <div class="hta-status" role="status">Ready.</div>
      <div class="hta-source-label">Source: Live Handshake page</div>
      <section class="hta-result" hidden></section>
    </aside>
  `;

  document.documentElement.appendChild(root);

  const panel = root.querySelector(".hta-panel");
  const launcher = root.querySelector(".hta-launcher");
  const textarea = root.querySelector(".hta-textarea");
  const status = root.querySelector(".hta-status");
  const sourceLabel = root.querySelector(".hta-source-label");
  const resultBox = root.querySelector(".hta-result");

  root.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const actionElement = target?.closest?.("[data-action]");
    const action = actionElement?.dataset?.action;

    if (target?.closest?.(".hta-launcher") === launcher) togglePanel(true);

    switch (action) {
      case "close":
        togglePanel(false);
        break;
      case "scan":
        setSelectedControlAction("scan");
        await analyzeVisibleMessages();
        break;
      case "sample-urgent":
        setSelectedControlAction("sample-urgent");
        await analyzeSample("urgent");
        break;
      case "sample-logistics":
        setSelectedControlAction("sample-logistics");
        await analyzeSample("logistics");
        break;
      case "sample-risk":
        setSelectedControlAction("sample-risk");
        await analyzeSample("risk");
        break;
      case "analyze-manual":
        setSelectedControlAction("analyze-manual");
        await analyzeManualText();
        break;
      case "insert":
        insertSuggestedReply(actionElement?.dataset?.reply || "");
        break;
      case "copy":
        copyReply(actionElement?.dataset?.reply || "");
        break;
      case "export-summary":
        exportSummary();
        break;
      default:
        break;
    }
  });

  textarea.addEventListener("input", () => ensureManualAnalyzeButton());

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "HTA_OPEN_WITH_SAMPLE") {
      togglePanel(true);
      const sampleKey = message.payload?.key || "urgent";
      if (message.payload?.mode) setMode(message.payload.mode);
      setSelectedControlAction(sampleActionForKey(sampleKey));
      analyzeSample(sampleKey);
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "HTA_SET_MODE") {
      setMode(message.payload?.mode || "student");
      sendResponse({ ok: true, mode: state.mode });
      return false;
    }
    return false;
  });

  function togglePanel(force) {
    state.open = typeof force === "boolean" ? force : !state.open;
    panel.classList.toggle("hta-open", state.open);
    launcher.classList.toggle("hta-hidden", state.open);
  }

  function ensureManualAnalyzeButton() {
    if (root.querySelector('[data-action="analyze-manual"]')) return;
    const button = document.createElement("button");
    button.className = "hta-secondary hta-analyze";
    button.type = "button";
    button.dataset.action = "analyze-manual";
    button.textContent = "Analyze pasted text";
    root.querySelector(".hta-controls").appendChild(button);
  }

  function setSelectedControlAction(action) {
    state.selectedControlAction = action;
    const buttons = root.querySelectorAll(".hta-controls button[data-action]");
    for (const button of buttons) {
      const selected = button.dataset.action === action;
      button.classList.toggle("hta-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
  }

  async function analyzeVisibleMessages() {
    if (state.busy) return;
    state.busy = true;
    resultBox.hidden = true;
    status.textContent = "Scanning current Handshake page...";
    setSourceLabel("Live Handshake page");

    try {
      const extraction = extractHandshakeLiveMessages();
      state.lastExtraction = extraction;
      if (!extraction.ok) {
        status.textContent = extraction.error;
        renderErrorResult(extraction.error, extraction.debug);
        return;
      }

      status.textContent = `Live scan: ${extraction.messages.length} messages found`;
      const response = await chrome.runtime.sendMessage({
        type: "HTA_ANALYZE_MESSAGES",
        payload: { messages: extraction.messages, mode: state.mode }
      });
      if (!response?.ok) throw new Error(response?.error || "Analysis failed");
      state.lastAnalysisResults = response.results;
      renderAnalyzedMessages({
        source: "handshake_live_dom",
        extracted_at: extraction.extracted_at,
        url: extraction.url,
        debug: extraction.debug,
        results: response.results
      });
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Unable to analyze this page.";
      renderErrorResult("Unable to analyze this page right now.", null);
    } finally {
      state.busy = false;
    }
  }

  async function analyzeManualText() {
    const text = normalizeText(textarea.value);
    if (!text) {
      status.textContent = "Paste a message first, then analyze manual mode.";
      return;
    }
    setSourceLabel("Manual paste");
    const message = buildMessageObject({
      sender: null,
      timestamp: null,
      raw_text: text,
      confidence: 0.92,
      source: "manual_paste"
    });
    await analyzeCustomMessages([message], "Manual paste");
  }

  async function analyzeSample(sampleKey) {
    const sampleText = getSample(sampleKey);
    textarea.value = sampleText;
    ensureManualAnalyzeButton();
    setSourceLabel("Demo sample");
    const message = buildMessageObject({
      sender: "Demo recruiter",
      timestamp: null,
      raw_text: sampleText,
      confidence: 1,
      source: "demo_sample"
    });
    await analyzeCustomMessages([message], "Demo sample");
  }

  async function analyzeCustomMessages(messages, statusSource) {
    if (state.busy) return;
    state.busy = true;
    resultBox.hidden = true;
    status.textContent = `Analyzing ${messages.length} ${statusSource.toLowerCase()} message${messages.length === 1 ? "" : "s"}...`;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "HTA_ANALYZE_MESSAGES",
        payload: { messages, mode: state.mode }
      });
      if (!response?.ok) throw new Error(response?.error || "Analysis failed");
      state.lastAnalysisResults = response.results;
      renderAnalyzedMessages({
        source: statusSource === "Demo sample" ? "demo_sample" : "manual_paste",
        extracted_at: new Date().toISOString(),
        url: window.location.href,
        debug: { strategy_used: statusSource.toLowerCase(), candidate_count: messages.length, deduped_count: messages.length },
        results: response.results
      });
      status.textContent = "Analysis complete.";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Analysis failed.";
      renderErrorResult("Analysis failed.", null);
    } finally {
      state.busy = false;
    }
  }

  function renderAnalyzedMessages(payload) {
    const summary = buildSummary(payload.results);
    const sourceText =
      payload.source === "handshake_live_dom"
        ? "Live Handshake page"
        : payload.source === "demo_sample"
          ? "Demo sample"
          : "Manual paste";
    setSourceLabel(sourceText);

    const dashboard = `
      <div class="hta-dashboard">
        <div class="hta-dashboard-grid">
          <span>Total: ${summary.total}</span>
          <span>High: ${summary.high}</span>
          <span>Medium: ${summary.medium}</span>
          <span>Low: ${summary.low}</span>
          <span>Risky: ${summary.risky}</span>
          <span>Follow-up: ${summary.followUp}</span>
        </div>
        <p>${escapeHtml(summary.recommended)}</p>
        <div class="hta-dashboard-meta">Extracted: ${escapeHtml(formatTime(payload.extracted_at))}${payload.debug ? ` • Strategy: ${escapeHtml(payload.debug.strategy_used)}` : ""}</div>
        <button class="hta-secondary" type="button" data-action="export-summary">Export Summary</button>
      </div>
    `;

    const cards = payload.results
      .map(({ message, classification }) => {
        const risk = classification.riskFlags?.length
          ? `<div class="hta-warning">${escapeHtml(classification.riskFlags.join(" "))}</div>`
          : "";
        const replyEncoded = escapeAttr(classification.suggestedReply || "");
        const score = clampScore(classification.priority_score);
        const scoreClass = scoreClassFor(score);
        return `
          <div class="hta-card hta-priority-${String(classification.priority || "low").toLowerCase()}">
            <div class="hta-card-row">
              <span class="hta-pill">${escapeHtml(classification.category || "General")}</span>
              <span class="hta-confidence ${scoreClass}">Score ${score} • ${escapeHtml(classification.urgency || "Low")} urgency</span>
            </div>
            <h3>${escapeHtml(classification.summary || "")}</h3>
            <p><strong>Sender:</strong> ${escapeHtml(message.sender || "Unknown")}</p>
            <p><strong>Why this matters:</strong> ${escapeHtml(classification.why_this_matters || "")}</p>
            <p><strong>Recommended action:</strong> ${escapeHtml(classification.recommended_action || "")}</p>
            ${risk}
            <div class="hta-signals">${(classification.signals || []).map((signal) => `<span>${escapeHtml(signal)}</span>`).join("")}</div>
            <p class="hta-reply">${escapeHtml(classification.suggestedReply || "")}</p>
            <div class="hta-actions">
              <button class="hta-primary" type="button" data-action="insert" data-reply="${replyEncoded}">Insert reply</button>
              <button class="hta-secondary" type="button" data-action="copy" data-reply="${replyEncoded}">Copy reply</button>
            </div>
          </div>
        `;
      })
      .join("");

    resultBox.innerHTML = `${dashboard}${cards}`;
    resultBox.hidden = false;

  }

  function renderErrorResult(message, debug) {
    resultBox.innerHTML = `
      <div class="hta-card">
        <h3>Scan result</h3>
        <p>${escapeHtml(message)}</p>
        ${debug ? `<p class="hta-debug">Strategy: ${escapeHtml(debug.strategy_used || "none")} • Candidates: ${Number(debug.candidate_count || 0)} • Deduped: ${Number(debug.deduped_count || 0)}</p>` : ""}
      </div>
    `;
    resultBox.hidden = false;
  }

  function extractHandshakeLiveMessages() {
    const url = window.location.href;
    const extracted_at = new Date().toISOString();
    const unsupported = !isHandshakePage();

    const selectedText = normalizeText(window.getSelection?.().toString?.() || "");
    if (selectedText.length >= 20) {
      const message = buildMessageObject({
        sender: null,
        timestamp: null,
        raw_text: selectedText,
        confidence: 0.95,
        source: "handshake_live_dom"
      });
      return {
        ok: true,
        source: "handshake_live_dom",
        extracted_at,
        url,
        messages: [message],
        debug: { strategy_used: "selection_fallback", candidate_count: 1, deduped_count: 1 }
      };
    }

    const strategyHook = collectDataHookMessages();
    if (strategyHook.messages.length > 0) {
      return {
        ok: true,
        source: "handshake_live_dom",
        extracted_at,
        url,
        messages: strategyHook.messages,
        debug: strategyHook.debug
      };
    }

    const strategy1 = collectConversationMessages();
    if (strategy1.messages.length > 0) {
      return {
        ok: true,
        source: "handshake_live_dom",
        extracted_at,
        url,
        messages: strategy1.messages,
        debug: strategy1.debug
      };
    }

    const strategy2 = collectMainAreaMessages();
    if (strategy2.messages.length > 0) {
      return {
        ok: true,
        source: "handshake_live_dom",
        extracted_at,
        url,
        messages: strategy2.messages,
        debug: strategy2.debug
      };
    }

    return {
      ok: false,
      error: unsupported
        ? "This page does not look like a Handshake message page."
        : "No visible Handshake messages found. Open a specific conversation, scroll messages into view, or use manual paste mode.",
      url,
      debug: {
        strategy_used: unsupported ? "unsupported_page" : "manual_fallback",
        candidate_count: strategyHook.debug.candidate_count + strategy1.debug.candidate_count + strategy2.debug.candidate_count,
        deduped_count: 0
      }
    };
  }

  function collectDataHookMessages() {
    const hookSelectors = [
      '[data-hook="last-message-text"]',
      '[data-hook*="message-text" i]',
      '[data-hook*="thread-message" i]',
      '[data-hook*="conversation-message" i]',
      '[data-hook*="message-body" i]',
      '[data-hook*="message" i]'
    ];
    const nodes = hookSelectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((node, idx, arr) => arr.indexOf(node) === idx)
      .filter(isVisibleElement)
      .filter((node) => isMessageCandidateNode(node));

    const candidates = [];
    for (const node of nodes) {
      const text = normalizeText(node.innerText || node.textContent || "");
      if (!shouldKeepMessageText(text)) continue;
      candidates.push({
        sender: detectSender(node),
        timestamp: detectTimestamp(node),
        raw_text: text,
        confidence: 0.9
      });
    }

    const messages = dedupeAndBuildMessages(candidates, "handshake_live_dom");
    return {
      messages,
      debug: { strategy_used: "data_hook_messages", candidate_count: candidates.length, deduped_count: messages.length }
    };
  }

  function collectConversationMessages() {
    const containers = [
      '[role="log"]',
      '[data-testid*="message" i]',
      '[data-test*="message" i]',
      '[aria-label*="message" i]',
      '[class*="conversation" i]',
      '[class*="message-list" i]',
      '[role="main"]'
    ];
    const elements = containers
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((node, idx, arr) => arr.indexOf(node) === idx)
      .filter(isVisibleElement)
      .filter((node) => !isUiContainer(node));

    const candidates = [];
    for (const container of elements) {
      const nodes = Array.from(
        container.querySelectorAll(
          '[role="listitem"], article, li, [data-testid*="message" i], [data-test*="message" i], [class*="message-item" i], [class*="messageRow" i], [class*="thread-message" i], [class*="message" i]'
        )
      );
      for (const node of nodes) {
        if (!isVisibleElement(node) || !isMessageCandidateNode(node)) continue;
        const text = normalizeText(node.innerText || node.textContent || "");
        if (!shouldKeepMessageText(text)) continue;
        candidates.push({
          sender: detectSender(node),
          timestamp: detectTimestamp(node),
          raw_text: text,
          confidence: 0.92
        });
      }
    }

    const messages = dedupeAndBuildMessages(candidates, "handshake_live_dom");
    return {
      messages,
      debug: { strategy_used: "conversation_containers", candidate_count: candidates.length, deduped_count: messages.length }
    };
  }

  function collectMainAreaMessages() {
    const main = document.querySelector('[role="main"], main, #main-content') || document.body;
    const nodes = Array.from(main.querySelectorAll("article, li, p, [role='listitem'], [class*='message' i]"));
    const candidates = [];
    for (const node of nodes) {
      if (!isVisibleElement(node) || isUiContainer(node) || !isMessageCandidateNode(node)) continue;
      const text = normalizeText(node.innerText || node.textContent || "");
      if (!shouldKeepMessageText(text)) continue;
      candidates.push({
        sender: detectSender(node),
        timestamp: detectTimestamp(node),
        raw_text: text,
        confidence: 0.75
      });
    }

    const messages = dedupeAndBuildMessages(candidates, "handshake_live_dom");
    return {
      messages,
      debug: { strategy_used: "main_area_blocks", candidate_count: candidates.length, deduped_count: messages.length }
    };
  }

  function dedupeAndBuildMessages(candidates, source) {
    const seen = new Set();
    const result = [];
    for (const item of candidates) {
      const normalized = normalizeText(item.raw_text).toLowerCase();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(buildMessageObject({ ...item, source }));
    }
    return result;
  }

  function buildMessageObject({ sender, timestamp, raw_text, confidence, source }) {
    const normalized = normalizeText(raw_text).toLowerCase();
    return {
      id: hashString(normalized).slice(0, 12),
      source,
      sender: sender || null,
      timestamp: timestamp || null,
      raw_text: normalizeText(raw_text),
      detected_platform: "Handshake",
      extraction_confidence: Number(confidence.toFixed(2))
    };
  }

  function shouldKeepMessageText(text) {
    const clean = normalizeText(text);
    if (!clean || clean.length < 12) return false;
    if (NOISE_EXACT.has(clean.toLowerCase())) return false;
    if (/^\d{1,2}:\d{2}\s?(am|pm)?$/i.test(clean)) return false;
    if (/^(today|yesterday|just now)$/i.test(clean)) return false;
    if (!/[a-z]{3,}/i.test(clean)) return false;
    if (/\b(messages|search|settings|archive|inbox|notifications|filters)\b/i.test(clean) && clean.length < 40) return false;
    if (/^(view profile|mark as unread|show more|load more)$/i.test(clean)) return false;
    if (clean.split(" ").length <= 2 && !containsLikelyMessageKeyword(clean)) return false;
    return clean.length >= 18 || containsLikelyMessageKeyword(clean);
  }

  function isMessageCandidateNode(node) {
    if (!(node instanceof Element)) return false;
    if (node.closest("button, nav, header, footer, menu, [role='navigation'], [role='tablist']")) return false;
    const tag = node.tagName.toLowerCase();
    if (["script", "style", "noscript", "svg"].includes(tag)) return false;
    return true;
  }

  function isUiContainer(node) {
    return Boolean(node.closest("nav, header, footer, aside, [role='navigation'], [aria-label*='navigation' i], [class*='sidebar' i]"));
  }

  function detectSender(node) {
    const senderNode =
      node.querySelector?.('[data-testid*="sender" i], [data-hook*="counterpart" i], [class*="sender" i], [class*="counterpart-title" i], strong, b') ||
      node.previousElementSibling?.querySelector?.('[data-hook*="counterpart" i], [class*="counterpart-title" i], strong, b') ||
      node.closest?.('[data-hook*="conversations-list-card" i], [data-hook*="conversation" i]')?.querySelector?.('[data-hook*="counterpart" i], [class*="counterpart-title" i], strong, b');
    if (!senderNode) return null;
    const sender = normalizeText(senderNode.textContent || "");
    if (!sender || sender.length > 60 || sender.length < 2) return null;
    return sender;
  }

  function detectTimestamp(node) {
    const text = normalizeText(node.textContent || "");
    const explicitTimestamp =
      node.querySelector?.('[data-hook*="timestamp" i], time')?.textContent ||
      node.closest?.('[data-hook*="message" i]')?.querySelector?.('[data-hook*="timestamp" i], time')?.textContent ||
      "";
    const timestampText = normalizeText(explicitTimestamp) || text;
    const match = timestampText.match(/\b(\d{1,2}:\d{2}\s?(?:am|pm)|today|yesterday)\b/i);
    return match ? match[0] : null;
  }

  function isVisibleElement(node) {
    if (!(node instanceof Element)) return false;
    const tag = node.tagName.toLowerCase();
    if (["script", "style", "noscript", "svg"].includes(tag)) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(node);
    if (!style || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (rect.bottom < -200 || rect.top > viewportHeight + 600) return false;
    return true;
  }

  function buildSummary(results) {
    const summary = {
      total: results.length,
      high: 0,
      medium: 0,
      low: 0,
      risky: 0,
      followUp: 0
    };

    for (const item of results) {
      const c = item.classification || {};
      if (c.priority === "High") summary.high += 1;
      else if (c.priority === "Medium") summary.medium += 1;
      else summary.low += 1;
      if (c.is_risky) summary.risky += 1;
      if (c.needsReply) summary.followUp += 1;
    }

    summary.recommended =
      summary.high > 0
        ? `Recommended next step: Reply to ${summary.high} high-priority message${summary.high === 1 ? "" : "s"} first.`
        : summary.followUp > 0
          ? `Recommended next step: Handle ${summary.followUp} follow-up message${summary.followUp === 1 ? "" : "s"} next.`
          : "Recommended next step: No urgent replies right now.";
    return summary;
  }

  function exportSummary() {
    if (!state.lastAnalysisResults.length) {
      status.textContent = "Run an analysis first, then export summary.";
      return;
    }
    const summary = buildSummary(state.lastAnalysisResults);
    const payload = {
      timestamp: new Date().toISOString(),
      total_messages_analyzed: summary.total,
      source: state.lastSourceLabel,
      summary_counts: {
        high: summary.high,
        medium: summary.medium,
        low: summary.low,
        risky: summary.risky,
        follow_up_needed: summary.followUp
      },
      messages: state.lastAnalysisResults.map(({ message, classification }) => ({
        id: message?.id || null,
        category: classification?.category || null,
        priority_score: classification?.priority_score || 0,
        urgency: classification?.urgency || "Low",
        sender: message?.sender || null,
        recommended_action: classification?.recommended_action || null,
        why_this_matters: classification?.why_this_matters || null,
        risk_flags: classification?.riskFlags || []
      }))
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `handshake-triage-summary-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    status.textContent = "Summary exported.";
  }

  function insertSuggestedReply(replyText) {
    if (!replyText) return;
    const target = findReplyTarget();
    if (!target) {
      status.textContent = "No reply box found. Copy the suggestion instead.";
      return;
    }
    if (target.isContentEditable) {
      target.focus();
      if (typeof document.execCommand === "function") {
        document.execCommand("selectAll", false);
        document.execCommand("insertText", false, replyText);
      } else {
        target.textContent = replyText;
      }
      target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: replyText }));
    } else {
      target.focus();
      target.value = replyText;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    }
    status.textContent = "Reply inserted into the active composer.";
  }

  async function copyReply(replyText) {
    if (!replyText) return;
    try {
      await navigator.clipboard.writeText(replyText);
      status.textContent = "Reply copied to clipboard.";
    } catch (_error) {
      status.textContent = "Unable to copy in this page context.";
    }
  }

  function findReplyTarget() {
    const active = document.activeElement;
    if (isLikelyExternalComposer(active)) return active;
    return (
      Array.from(document.querySelectorAll("textarea, [contenteditable='true'], [contenteditable=''], [role='textbox'], input[type='text']"))
        .filter((node) => isLikelyExternalComposer(node))
        .find(isVisibleElement) || null
    );
  }

  function isLikelyExternalComposer(node) {
    if (!(node instanceof Element)) return false;
    if (root.contains(node)) return false;
    if (!(node.matches?.("textarea, [contenteditable='true'], [contenteditable=''], [role='textbox'], input[type='text']") || node.isContentEditable)) return false;
    const aria = normalizeText(node.getAttribute("aria-label") || "").toLowerCase();
    const placeholder = normalizeText(node.getAttribute("placeholder") || "").toLowerCase();
    return !(aria.includes("search") || placeholder.includes("search"));
  }

  function setSourceLabel(label) {
    state.lastSourceLabel = label;
    const modeLabel = state.mode === "recruiter" ? "Recruiter mode" : "Student mode";
    sourceLabel.textContent = `Source: ${label} • ${modeLabel}`;
  }

  function setMode(mode) {
    state.mode = mode === "recruiter" ? "recruiter" : "student";
    const currentSource = state.lastSourceLabel || "Live Handshake page";
    setSourceLabel(currentSource);
  }

  function isHandshakePage() {
    const host = window.location.hostname.toLowerCase();
    return host === "joinhandshake.com" || host.endsWith(".joinhandshake.com") || host.includes("handshake");
  }

  function containsLikelyMessageKeyword(text) {
    return /\b(interview|schedule|availability|job|internship|role|application|recruiter|hiring|career|event|coffee chat|alumni|next steps|deadline)\b/i.test(text);
  }

  function clampScore(value) {
    const score = Number(value || 0);
    if (!Number.isFinite(score)) return 0;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function scoreClassFor(score) {
    if (score >= 75) return "hta-score-high";
    if (score >= 41) return "hta-score-medium";
    return "hta-score-low";
  }

  function getSample(type) {
    if (type === "urgent") {
      return "Hi Saif, we reviewed your profile for our Software Engineering Internship. Could you confirm your availability for a 30-minute interview tomorrow afternoon? Please reply by 5 PM today so we can hold the slot.";
    }
    if (type === "logistics") {
      return "Thanks again for your application. Could you share two time windows for a Zoom call next week and confirm your time zone so we can schedule with the hiring manager?";
    }
    return "We can fast-track you, but first buy a gift card and send the code immediately with your SSN so payroll can verify your account.";
  }

  function sampleActionForKey(sampleKey) {
    if (sampleKey === "logistics") return "sample-logistics";
    if (sampleKey === "risk") return "sample-risk";
    return "sample-urgent";
  }

  function hashString(input) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash >>> 0).toString(16);
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function formatTime(iso) {
    if (!iso) return "unknown";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  setSelectedControlAction("scan");
  chrome.runtime.sendMessage({ type: "HTA_GET_MODE" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.ok) setMode(response.mode);
  });
})();
