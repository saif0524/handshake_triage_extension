const CATEGORY_KEYWORDS = {
  recruiter_job: [
    "recruiter",
    "talent acquisition",
    "hiring",
    "job opportunity",
    "full-time role",
    "position",
    "offer",
    "application"
  ],
  internship: ["internship", "intern role", "summer analyst", "co-op", "intern candidate"],
  interview_scheduling: [
    "interview",
    "phone screen",
    "onsite",
    "schedule",
    "availability",
    "timezone",
    "calendar",
    "reschedule"
  ],
  networking: ["networking", "connect", "coffee chat", "informational interview", "mentor"],
  alumni: ["alumni", "fellow alumni", "alum", "graduates of"],
  career_services: ["career services", "career center", "career advisor", "advisor office"],
  event_invitation: ["invite", "invitation", "event", "webinar", "session", "workshop", "job fair", "career fair", "rsvp"],
  follow_up: ["follow up", "follow-up", "just checking in", "bump", "circling back", "please respond", "next steps", "let me know"],
  project_collaboration: ["project", "collaboration", "collaborate", "build", "prototype", "research", "hackathon", "ai project"],
  low_priority: ["newsletter", "promotion", "promotional", "sales pitch", "mass email", "blast", "unsubscribe", "sponsored"]
};

const RISK_INDICATORS = [
  "ssn",
  "social security",
  "bank info",
  "routing number",
  "payment",
  "check deposit",
  "wire transfer",
  "too good to be true",
  "personal information",
  "gift card",
  "crypto",
  "bitcoin"
];

const ACTION_INDICATORS = [
  "please",
  "can you",
  "could you",
  "confirm",
  "reply",
  "send",
  "let me know"
];

const SOFT_ACK = ["thanks for the update", "thank you for the update", "no action needed", "fyi", "for your information"];
const UI_NOISE_PATTERNS = [/^messages$/i, /^inbox$/i, /^search$/i, /^send$/i, /^reply$/i, /^archive$/i, /^settings$/i];

const SENSITIVE_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{16}\b/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g
];

export function redactSensitiveText(input = "") {
  return SENSITIVE_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[redacted]"), String(input));
}

export function classifyMessage(input = "", context = {}) {
  const originalText = String(input).trim();
  const safeText = redactSensitiveText(originalText);
  const text = safeText.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const senderName = sanitizeSender(context?.sender);
  const senderText = String(context?.sender || "").toLowerCase();
  const mode = context?.mode === "recruiter" ? "recruiter" : "student";
  const personalization = extractPersonalizationHints(safeText);
  const combinedText = `${text} ${senderText}`.trim();
  const isEmpty = !safeText.trim();
  const isUiNoise = UI_NOISE_PATTERNS.some((pattern) => pattern.test(safeText.trim()));

  const recruiterHits = countHits(combinedText, CATEGORY_KEYWORDS.recruiter_job);
  const internshipHits = countHits(combinedText, CATEGORY_KEYWORDS.internship);
  const interviewHits = countHits(combinedText, CATEGORY_KEYWORDS.interview_scheduling);
  const networkingHits = countHits(combinedText, CATEGORY_KEYWORDS.networking);
  const alumniHits = countHits(combinedText, CATEGORY_KEYWORDS.alumni);
  const careerServicesHits = countHits(combinedText, CATEGORY_KEYWORDS.career_services);
  const eventHits = countHits(combinedText, CATEGORY_KEYWORDS.event_invitation);
  const followUpHits = countHits(combinedText, CATEGORY_KEYWORDS.follow_up);
  const projectHits = countHits(combinedText, CATEGORY_KEYWORDS.project_collaboration);
  const lowPriorityHits = countHits(combinedText, CATEGORY_KEYWORDS.low_priority);
  const riskHits = countHits(combinedText, RISK_INDICATORS);
  const actionHits = countHits(combinedText, ACTION_INDICATORS);
  const ackHits = countHits(combinedText, SOFT_ACK);
  const questionCount = (text.match(/\?/g) || []).length;
  const hasCompanyOrRole =
    /\b(role|position|internship|job opportunity)\b/.test(text) ||
    /\b(?:at|with)\s+[A-Z][A-Za-z0-9&.\- ]{2,}/.test(safeText);
  const hasThanksOnly =
    (/\b(thanks|thank you|sounds good|great|received)\b/.test(text) && words.length < 18) || ackHits > 0;
  const hasHardDeadline =
    /\b(by|before)\s+\d{1,2}(:\d{2})?\s?(am|pm)?\b/.test(text) || /\b(deadline|today|tomorrow|asap|urgent)\b/.test(text);
  const hasInterview = /\b(interview|screen|phone screen|onsite)\b/.test(text);
  const hasSuspiciousLink = /\bhttp[s]?:\/\/(bit\.ly|tinyurl|t\.co|rb\.gy)\b/.test(text);
  const isRisky = riskHits > 0 || hasSuspiciousLink;
  const deadlineBoost = hasHardDeadline ? 2 : 0;

  const category = inferCategory({
    mode,
    isRisky,
    isUiNoise,
    isEmpty,
    recruiterHits,
    internshipHits,
    interviewHits,
    networkingHits,
    alumniHits,
    careerServicesHits,
    eventHits,
    followUpHits,
    projectHits,
    lowPriorityHits,
    hasCompanyOrRole,
    hasInterview,
    questionCount,
    actionHits
  });

  const rawStrength = computeCategoryStrength({
    category,
    recruiterHits,
    internshipHits,
    interviewHits,
    networkingHits,
    alumniHits,
    careerServicesHits,
    eventHits,
    followUpHits,
    projectHits,
    lowPriorityHits,
    hasCompanyOrRole,
    actionHits,
    questionCount,
    deadlineBoost
  });
  let priority_score = scoreForCategory({
    category,
    rawStrength,
    isRisky,
    isEmpty,
    isUiNoise
  });

  if (!isEmpty && !isUiNoise && priority_score === 0) priority_score = 20;

  let priority = "Low";
  if (priority_score >= 75) priority = "High";
  else if (priority_score >= 41) priority = "Medium";

  if (hasThanksOnly && category !== "Follow-up needed") priority = "Low";

  const urgency =
    category === "Interview / Scheduling" || hasHardDeadline || hasInterview
      ? "High"
      : priority === "High"
        ? "High"
        : priority === "Medium"
          ? "Medium"
          : "Low";
  const needsReply = decideNeedsReply({ category, isRisky, hasThanksOnly, questionCount, actionHits, priority });
  const riskFlags = [];
  if (safeText !== originalText) riskFlags.push("Sensitive contact or identity data redacted before analysis");
  if (/\b(password|ssn|social security|bank|routing|credit card)\b/.test(text)) {
    riskFlags.push("Potentially sensitive personal or financial information");
  }
  if (/\bpay|payment|gift card|wire transfer|crypto|bitcoin\b/.test(text)) {
    riskFlags.push("Payment-related request needs verification");
  }
  if (/\b(immediately|right now)\b/.test(text) && isRisky) {
    riskFlags.push("Urgent pressure language often appears in scams");
  }
  if (hasSuspiciousLink) riskFlags.push("Suspicious shortened external link");

  const why_this_matters = buildWhyThisMatters({
    category,
    urgency,
    isRisky,
    hasHardDeadline,
    hasInterview,
    highHits: recruiterHits + internshipHits,
    mediumHits: networkingHits + alumniHits + careerServicesHits + eventHits,
    lowHits: lowPriorityHits,
    mode
  });
  const recommended_action = buildRecommendedAction({ category, isRisky, needsReply, urgency, priority, mode });

  return {
    priority,
    intent: category,
    category,
    urgency,
    priority_score,
    needsReply,
    confidence: confidenceFor({ score: priority_score, words: words.length, scamHits: riskHits, hasHardDeadline, hasInterview }),
    summary: summarize(safeText),
    suggestedReply: buildReply({ category, priority, needsReply, text, isRisky, senderName, personalization, mode }),
    nextSteps: buildNextSteps({ category, priority, needsReply, riskFlags, mode }),
    recommended_action,
    why_this_matters,
    tags: buildTags({
      highHits: recruiterHits + internshipHits,
      mediumHits: networkingHits + alumniHits + careerServicesHits + eventHits + projectHits,
      schedulingHits: interviewHits,
      actionHits,
      needsReply,
      riskHits,
      lowHits: lowPriorityHits
    }),
    signals: buildSignals({
      highHits: recruiterHits + internshipHits,
      mediumHits: networkingHits + alumniHits + careerServicesHits + eventHits + projectHits,
      schedulingHits: interviewHits,
      actionHits,
      questionCount,
      hasHardDeadline,
      hasInterview,
      riskHits
    }),
    is_risky: isRisky,
    mode,
    riskFlags,
    analyzedAt: new Date().toISOString()
  };
}

function countHits(text, terms) {
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}

function confidenceFor({ score, words, scamHits, hasHardDeadline, hasInterview }) {
  if (words < 4) return 0.56;
  if (scamHits > 0 || hasHardDeadline || hasInterview) return 0.9;
  if (score >= 75) return 0.87;
  if (score >= 41) return 0.79;
  return 0.67;
}

function summarize(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "No message text was detected.";
  if (cleaned.length <= 150) return cleaned;
  return `${cleaned.slice(0, 147).trim()}...`;
}

function buildTags({ highHits, mediumHits, schedulingHits, actionHits, needsReply, riskHits, lowHits }) {
  const tags = [];
  if (highHits) tags.push("high-priority-signal");
  if (mediumHits) tags.push("networking-signal");
  if (schedulingHits) tags.push("scheduling");
  if (riskHits) tags.push("verify-sender");
  if (lowHits) tags.push("low-priority-signal");
  if (actionHits || needsReply) tags.push("reply-needed");
  return tags.length ? tags : ["monitor"];
}

function buildSignals({
  highHits,
  mediumHits,
  schedulingHits,
  actionHits,
  questionCount,
  hasHardDeadline,
  hasInterview,
  riskHits
}) {
  const reasons = [];
  if (hasHardDeadline) reasons.push("Explicit deadline in message");
  if (hasInterview) reasons.push("Interview-related language detected");
  if (riskHits) reasons.push("Sensitive or suspicious request language");
  if (highHits) reasons.push("Recruiting or hiring keywords present");
  if (mediumHits) reasons.push("Networking or alumni context detected");
  if (schedulingHits) reasons.push("Scheduling coordination cues found");
  if (actionHits || questionCount) reasons.push("Direct response requested");
  return reasons.slice(0, 3);
}

function buildNextSteps({ category, priority, needsReply, riskFlags, mode }) {
  if (mode === "recruiter") {
    if (riskFlags.length) {
      return [
        "Move communication to verified Handshake channels before requesting documents.",
        "Avoid handling personal or payment data in chat."
      ];
    }
    if (!needsReply) return ["No immediate recruiter response required."];
    if (category === "Interview scheduling required") return ["Offer interview slots and request timezone confirmation."];
    if (category === "High-intent candidate") return ["Reply with next steps and expected timeline."];
    if (category === "Candidate follow-up needed") return ["Send a concise follow-up so the candidate is not blocked."];
    return ["Acknowledge the message and provide a clear process update."];
  }

  if (riskFlags.length) {
    return [
      "Verify sender identity through official Handshake/company profile.",
      "Do not share sensitive information or payment details."
    ];
  }
  if (!needsReply) return ["Archive or leave unread until a batch review."];
  if (priority === "High") return ["Reply today.", "Confirm the requested action or ask for missing details."];
  if (category === "Interview / Scheduling") return ["Ask to confirm time, timezone, format, and required materials."];
  if (category === "Recruiter / Job opportunity") return ["Express interest and ask for clear next steps and timeline."];
  if (category === "Internship opportunity") return ["Confirm interest and ask about timeline and required materials."];
  if (category === "Networking" || category === "Alumni outreach") {
    return ["Acknowledge the outreach.", "Suggest a brief chat without inventing specific times."];
  }
  if (category === "Career services" || category === "Event invitation") {
    return ["Thank them for the invite/update.", "Ask for key details and preparation steps."];
  }
  if (category === "Project / collaboration") {
    return ["Acknowledge the project context.", "Ask for scope, expectations, and next step."];
  }
  if (category === "Follow-up needed") return ["Send a concise response so the thread does not stall."];
  return ["Send a concise acknowledgement.", "Capture any follow-up task."];
}

function buildReply({ category, priority, needsReply, text, isRisky, senderName, personalization, mode }) {
  const greeting = senderName ? `Hi ${senderName},` : "Hi,";
  const detailLine = buildDetailLine(personalization);

  if (!text.trim()) {
    return "Hi, thanks for reaching out. Could you resend the key details so I can follow up?";
  }
  if (!needsReply) {
    return `${greeting} thanks for sharing this update. I appreciate it.`;
  }
  if (isRisky) {
    return `${greeting} thanks for the message. For security, I only continue through verified Handshake channels and cannot share sensitive information here.`;
  }
  if (mode === "recruiter") {
    if (category === "High-intent candidate") {
      return `${greeting} thank you for your message.${detailLine} I appreciate your interest and can share next steps here. Could you confirm if you are ready to proceed with the next stage this week?`;
    }
    if (category === "Interview scheduling required") {
      return `${greeting} thank you for the update.${detailLine} Could you share your preferred interview windows and timezone, and I will confirm format and final schedule details?`;
    }
    if (category === "Candidate follow-up needed") {
      return `${greeting} thanks for following up.${detailLine} I can help with this and will share a clear status update plus next actions shortly.`;
    }
    if (category === "Low-priority candidate message") {
      return `${greeting} thank you for reaching out. I have noted your message and will follow up if additional details are needed.`;
    }
    return `${greeting} thank you for reaching out.${detailLine} Could you confirm the key point you need help with so I can route this quickly?`;
  }

  if (category === "Recruiter / Job opportunity") {
    return `${greeting} thank you for reaching out.${detailLine} I am interested in learning more. Could you share the next steps and timeline?`;
  }
  if (category === "Internship opportunity") {
    return `${greeting} thank you for reaching out about this internship.${detailLine} I am interested. Could you share the next steps, timeline, and any materials you would like me to prepare?`;
  }
  if (category === "Interview / Scheduling") {
    return `${greeting} thank you for the update.${detailLine} Could you confirm the interview time, timezone, format, and any materials you want me to prepare?`;
  }
  if (category === "Networking") {
    return `${greeting} thank you for reaching out.${detailLine} I would be glad to connect for a brief chat. Could you share your preferred next step on timing and format?`;
  }
  if (category === "Alumni outreach") {
    return `${greeting} thank you for reaching out as an alum.${detailLine} I appreciate it and would be glad to connect briefly. What format do you prefer?`;
  }
  if (category === "Career services") {
    return `${greeting} thank you for the career services update.${detailLine} Could you share the recommended next steps for me?`;
  }
  if (category === "Event invitation") {
    return `${greeting} thank you for the invitation.${detailLine} I am interested and would appreciate confirmation of event details and any preparation needed.`;
  }
  if (category === "Project / collaboration") {
    return `${greeting} thanks for reaching out about this project.${detailLine} I would like to learn more. Could you share scope, timeline, and what contribution you are looking for?`;
  }
  if (category === "Follow-up needed") {
    return `${greeting} thanks for following up.${detailLine} I appreciate the reminder and will prioritize this. Could you confirm the key next step?`;
  }
  if (priority === "Low") {
    return `${greeting} thank you for sharing this. I will review and follow up if needed.`;
  }
  return `${greeting} thank you for reaching out.${detailLine} Could you share the most important next step you would like me to prioritize?`;
}

function inferCategory({
  mode,
  isRisky,
  isUiNoise,
  isEmpty,
  recruiterHits,
  internshipHits,
  interviewHits,
  networkingHits,
  alumniHits,
  careerServicesHits,
  eventHits,
  followUpHits,
  projectHits,
  lowPriorityHits,
  hasCompanyOrRole,
  hasInterview,
  questionCount,
  actionHits
}) {
  if (mode === "recruiter") {
    if (isRisky) return "Risk or compliance review";
    if (hasInterview || interviewHits > 0) return "Interview scheduling required";
    if (recruiterHits + internshipHits > 0) return "High-intent candidate";
    if (followUpHits + questionCount + actionHits > 0) return "Candidate follow-up needed";
    if (lowPriorityHits > 0) return "Low-priority candidate message";
    return "General candidate update";
  }

  if (isEmpty || isUiNoise) return "Low priority";
  if (isRisky) return "Risky / suspicious";
  if (hasInterview || interviewHits > 0) return "Interview / Scheduling";
  if (internshipHits > 0) return "Internship opportunity";
  if (recruiterHits > 0 || hasCompanyOrRole) return "Recruiter / Job opportunity";
  if (alumniHits > 0) return "Alumni outreach";
  if (networkingHits > 0) return "Networking";
  if (careerServicesHits > 0) return "Career services";
  if (eventHits > 0) return "Event invitation";
  if (projectHits > 0) return "Project / collaboration";
  if (followUpHits > 0 || questionCount > 0 || actionHits > 1) return "Follow-up needed";
  if (lowPriorityHits > 0) return "Low priority";
  return "General update";
}

function buildWhyThisMatters({ category, urgency, isRisky, hasHardDeadline, hasInterview, highHits, mediumHits, lowHits, mode }) {
  if (mode === "recruiter") {
    if (isRisky) return "This matters because the message may create compliance or data-handling risk.";
    if (category === "Interview scheduling required") {
      return "This matters because scheduling speed affects candidate experience and conversion.";
    }
    if (category === "High-intent candidate") {
      return "This matters because the candidate appears engaged and likely to progress.";
    }
    if (category === "Candidate follow-up needed") {
      return "This matters because delayed follow-up can lead to candidate drop-off.";
    }
    if (category === "Low-priority candidate message") {
      return "This matters less immediately, but a short response can keep communication healthy.";
    }
    return "This matters because clear recruiter communication keeps the process moving.";
  }

  if (isRisky || category === "Risky / suspicious") {
    return "This may be risky because it asks for sensitive information or external payment-like action.";
  }
  if (category === "Interview / Scheduling" || hasInterview || hasHardDeadline || urgency === "High") {
    return "This appears time-sensitive because it references interview or deadline language.";
  }
  if (category === "Recruiter / Job opportunity") {
    return "This is likely valuable because it may relate to a real career opportunity.";
  }
  if (category === "Internship opportunity") {
    return "This matters because internship opportunities often have short timelines and competitive slots.";
  }
  if (category === "Networking" || category === "Alumni outreach") {
    return "This can be useful for relationship-building and future opportunities.";
  }
  if (category === "Career services") {
    return "This matters because career services messages often contain actionable guidance or deadlines.";
  }
  if (category === "Event invitation") {
    return "This may be useful for recruiting visibility, learning, or networking.";
  }
  if (category === "Follow-up needed") {
    return "This matters because a response is likely expected and delay can close opportunities.";
  }
  if (category === "Project / collaboration") {
    return "This matters because collaboration requests can build portfolio and domain experience.";
  }
  if (category === "Low priority" || lowHits > 0) {
    return "This may be lower priority because it looks like broad promotional outreach.";
  }
  return "This message may still need a quick review to avoid missing actionable details.";
}

function buildRecommendedAction({ category, isRisky, needsReply, urgency, priority, mode }) {
  if (mode === "recruiter") {
    if (isRisky) return "Pause and move to verified channel before sharing or requesting sensitive data.";
    if (!needsReply) return "No immediate recruiter action required.";
    if (category === "Interview scheduling required") return "Send interview windows and confirm candidate timezone.";
    if (category === "High-intent candidate") return "Respond quickly with process steps and timing.";
    if (category === "Candidate follow-up needed") return "Send a concise follow-up to unblock the candidate.";
    if (urgency === "High" || priority === "High") return "Reply now to prevent candidate drop-off.";
    return "Acknowledge and route to the correct hiring stage.";
  }

  if (isRisky || category === "Risky / suspicious") {
    return "Do not share sensitive data; verify sender through official Handshake profile first.";
  }
  if (!needsReply) return "No immediate response needed.";
  if (category === "Interview / Scheduling") return "Reply to confirm time, timezone, format, and required materials.";
  if (category === "Recruiter / Job opportunity" || category === "Internship opportunity") {
    return "Reply with interest and request next steps and timeline.";
  }
  if (category === "Networking" || category === "Alumni outreach") {
    return "Send a short acknowledgement and ask for a brief chat path.";
  }
  if (category === "Career services" || category === "Event invitation") {
    return "Acknowledge and confirm key details, deadlines, or registration steps.";
  }
  if (category === "Project / collaboration") {
    return "Reply with interest and ask for scope, timeline, and expected contribution.";
  }
  if (category === "Follow-up needed") return "Respond promptly so the thread stays active.";
  if (urgency === "High" || priority === "High") return "Reply today and confirm the requested action.";
  return "Send a concise acknowledgement and track follow-up.";
}

function computeCategoryStrength({
  category,
  recruiterHits,
  internshipHits,
  interviewHits,
  networkingHits,
  alumniHits,
  careerServicesHits,
  eventHits,
  followUpHits,
  projectHits,
  lowPriorityHits,
  hasCompanyOrRole,
  actionHits,
  questionCount,
  deadlineBoost
}) {
  if (category === "Interview / Scheduling") return interviewHits * 2 + actionHits + questionCount + deadlineBoost;
  if (category === "Recruiter / Job opportunity") return recruiterHits * 2 + (hasCompanyOrRole ? 2 : 0) + actionHits;
  if (category === "Internship opportunity") return internshipHits * 2 + actionHits + (hasCompanyOrRole ? 1 : 0);
  if (category === "Follow-up needed") return followUpHits * 2 + actionHits + questionCount;
  if (category === "Networking") return networkingHits * 2 + questionCount;
  if (category === "Alumni outreach") return alumniHits * 2 + networkingHits + questionCount;
  if (category === "Project / collaboration") return projectHits * 2 + questionCount + actionHits;
  if (category === "Career services") return careerServicesHits * 2 + eventHits + questionCount;
  if (category === "Event invitation") return eventHits * 2 + questionCount;
  if (category === "Low priority") return lowPriorityHits * 2;
  if (category === "Risky / suspicious") return 4 + questionCount + actionHits;
  if (category === "Interview scheduling required") return interviewHits * 2 + actionHits + questionCount + deadlineBoost;
  if (category === "High-intent candidate") {
    return (recruiterHits + internshipHits) * 2 + actionHits + (hasCompanyOrRole ? 1 : 0);
  }
  if (category === "Candidate follow-up needed") return followUpHits * 2 + actionHits + questionCount;
  if (category === "Low-priority candidate message") return lowPriorityHits * 2;
  if (category === "Risk or compliance review") return 4 + questionCount + actionHits;
  return 1 + questionCount + actionHits;
}

function scoreForCategory({ category, rawStrength, isRisky, isEmpty, isUiNoise }) {
  if (isEmpty || isUiNoise) return 0;
  if (isRisky || category === "Risky / suspicious") return clamp(8 + rawStrength * 4, 0, 30);
  if (category === "Interview / Scheduling") return clamp(80 + rawStrength * 2, 80, 100);
  if (category === "Recruiter / Job opportunity") return clamp(75 + rawStrength * 2, 75, 95);
  if (category === "Internship opportunity") return clamp(75 + rawStrength * 2, 75, 95);
  if (category === "Follow-up needed") return clamp(65 + rawStrength * 2, 65, 85);
  if (category === "Networking") return clamp(55 + rawStrength * 2, 55, 80);
  if (category === "Alumni outreach") return clamp(55 + rawStrength * 2, 55, 80);
  if (category === "Project / collaboration") return clamp(50 + rawStrength * 2, 50, 75);
  if (category === "Career services") return clamp(40 + rawStrength * 2, 40, 70);
  if (category === "Event invitation") return clamp(40 + rawStrength * 2, 40, 70);
  if (category === "Low priority") return clamp(1 + rawStrength * 2, 1, 30);
  if (category === "Interview scheduling required") return clamp(80 + rawStrength * 2, 80, 100);
  if (category === "High-intent candidate") return clamp(75 + rawStrength * 2, 75, 95);
  if (category === "Candidate follow-up needed") return clamp(65 + rawStrength * 2, 65, 85);
  if (category === "Low-priority candidate message") return clamp(1 + rawStrength * 2, 1, 30);
  if (category === "Risk or compliance review") return clamp(8 + rawStrength * 4, 0, 30);
  if (category === "General candidate update") return clamp(20 + rawStrength * 3, 20, 50);
  return clamp(20 + rawStrength * 3, 20, 50);
}

function decideNeedsReply({ category, isRisky, hasThanksOnly, questionCount, actionHits, priority }) {
  if (isRisky || category === "Risky / suspicious") return false;
  if (hasThanksOnly && category !== "Follow-up needed") return false;
  if (["Low priority", "General update"].includes(category) && questionCount === 0 && actionHits === 0 && priority === "Low") {
    return false;
  }
  return true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeSender(sender) {
  const clean = String(sender || "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 2 || clean.length > 40) return null;
  if (/[^a-zA-Z .'-]/.test(clean)) return null;
  return clean;
}

function extractPersonalizationHints(text) {
  return {
    role: extractRole(text),
    company: extractCompany(text),
    deadline: extractDeadline(text)
  };
}

function extractRole(text) {
  const match =
    text.match(/\b([A-Z][A-Za-z0-9/&+\- ]{2,60}(?:Internship|Engineer|Developer|Analyst|Manager|Role|Position))\b/) ||
    text.match(/\b(software engineering internship|product analyst role|data analyst role|internship role)\b/i);
  return match ? match[1].trim() : null;
}

function extractCompany(text) {
  const match = text.match(/\b(?:at|with)\s+([A-Z][A-Za-z0-9&.\- ]{1,40})\b/);
  return match ? match[1].trim() : null;
}

function extractDeadline(text) {
  const match =
    text.match(/\b(?:by|before)\s+([A-Za-z0-9: ]{2,20}(?:am|pm)?(?:\s+today|\s+tomorrow)?)/i) ||
    text.match(/\bdeadline(?:\s+is|\s+by)?\s+([A-Za-z0-9: ]{2,20}(?:am|pm)?)/i);
  return match ? match[1].trim() : null;
}

function buildDetailLine(hints) {
  if (hints?.role) return ` I saw your note about the ${hints.role}.`;
  if (hints?.company) return ` I saw this opportunity is with ${hints.company}.`;
  if (hints?.deadline) return ` I saw the timing note for ${hints.deadline}.`;
  return "";
}
