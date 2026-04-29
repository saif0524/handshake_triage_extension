import assert from "node:assert/strict";
import { classifyMessage, redactSensitiveText } from "../src/classifier.js";

const interview = classifyMessage(
  "Hi Saif, we would like to schedule your interview for the Data Analyst role. Are you available tomorrow by 3 PM CT?"
);
assert.equal(interview.category, "Interview / Scheduling");
assert.ok(interview.priority_score >= 80 && interview.priority_score <= 100);

const recruiterJob = classifyMessage(
  "I am a recruiter at Acme and wanted to share a job opportunity for our Associate Product Analyst position."
);
assert.equal(recruiterJob.category, "Recruiter / Job opportunity");
assert.ok(recruiterJob.priority_score >= 75 && recruiterJob.priority_score <= 95);

const internship = classifyMessage(
  "Thanks for applying. We are moving forward with candidates for our Software Engineering Internship."
);
assert.equal(internship.category, "Internship opportunity");
assert.ok(internship.priority_score >= 75 && internship.priority_score <= 95);

const followup = classifyMessage(
  "Just following up on my previous note. Please let me know if you can send your updated resume today."
);
assert.equal(followup.category, "Follow-up needed");
assert.ok(followup.priority_score >= 65 && followup.priority_score <= 85);

const networking = classifyMessage(
  "I am in your alumni network and would love to connect for a quick coffee chat about career paths."
);
assert.equal(networking.category, "Alumni outreach");
assert.ok(networking.priority_score >= 55 && networking.priority_score <= 80);

const project = classifyMessage(
  "Would you be interested in collaborating on an AI project this semester? We can discuss scope and next steps."
);
assert.equal(project.category, "Project / collaboration");
assert.ok(project.priority_score >= 50 && project.priority_score <= 75);

const eventInvite = classifyMessage(
  "You are invited to our career services employer panel event next Thursday. Please RSVP by Tuesday."
);
assert.equal(eventInvite.category, "Career services");
assert.ok(eventInvite.priority_score >= 40 && eventInvite.priority_score <= 70);

const low = classifyMessage("This is a promotional newsletter blast with general updates and sponsored content.");
assert.equal(low.category, "Low priority");
assert.ok(low.priority_score >= 1 && low.priority_score <= 30);

const general = classifyMessage("Thanks for sharing the document. I reviewed it and noted your comments.");
assert.equal(general.category, "General update");
assert.ok(general.priority_score >= 20 && general.priority_score <= 50);

const risky = classifyMessage("Please share your SSN and bank routing number to complete payment setup.");
assert.equal(risky.category, "Risky / suspicious");
assert.ok(risky.priority_score >= 0 && risky.priority_score <= 30);
assert.equal(risky.needsReply, false);

const uiNoise = classifyMessage("Inbox");
assert.equal(uiNoise.category, "Low priority");
assert.equal(uiNoise.priority_score, 0);

const redacted = redactSensitiveText("Email me at student@example.com or 312-555-0199.");
assert.equal(redacted, "Email me at [redacted] or [redacted].");

const personalized = classifyMessage(
  "Hi Saif, we are hiring for a Software Engineering Internship and would like to share next steps.",
  { sender: "Priya" }
);
assert.ok(personalized.suggestedReply.startsWith("Hi Priya,"));
assert.ok(personalized.suggestedReply.includes("Software Engineering Internship"));
assert.ok(personalized.why_this_matters.length > 10);
assert.ok(personalized.recommended_action.length > 10);

const recruiterView = classifyMessage(
  "Can you share the next interview times this week? I am very interested in moving forward.",
  { sender: "Alex", mode: "recruiter" }
);
assert.equal(recruiterView.mode, "recruiter");
assert.equal(recruiterView.category, "Interview scheduling required");
assert.ok(recruiterView.suggestedReply.startsWith("Hi Alex,"));

console.log("classifier tests passed");
