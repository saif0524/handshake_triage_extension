const samples = {
  urgent: "Hi Saif, we reviewed your profile for our Software Engineering Internship. Could you confirm your availability for a 30-minute interview tomorrow afternoon? Please reply by 5 PM today so we can hold the slot.",
  logistics: "Thanks again for your application. Could you share two time windows for a Zoom call next week and confirm your time zone so we can schedule with the hiring manager?",
  risk: "We can fast-track you, but first buy a gift card and send the code immediately with your SSN so payroll can verify your account.",
  safe: "Thank you for attending the employer session yesterday. Slides will be posted in Handshake later this week."
};

const status = document.querySelector("#popup-status");
let currentMode = "student";

initMode();

document.addEventListener("click", async (event) => {
  const modeButton = event.target?.closest?.("button[data-mode]");
  if (modeButton?.dataset?.mode) {
    const mode = modeButton.dataset.mode === "recruiter" ? "recruiter" : "student";
    await setMode(mode);
    return;
  }

  const sampleButton = event.target?.closest?.("button[data-sample]");
  const key = sampleButton?.dataset?.sample;
  if (!key) return;

  setActiveSample(sampleButton);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("No active tab found.");
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "HTA_OPEN_WITH_SAMPLE",
      payload: { text: samples[key], key, mode: currentMode }
    });
    setStatus("Sample sent to sidebar.");
  } catch (_error) {
    setStatus("Open a Handshake page first, then click a sample.");
  }
});

function setStatus(message) {
  if (!status) return;
  status.textContent = message;
}

function setActiveSample(activeButton) {
  const allButtons = document.querySelectorAll("button[data-sample]");
  for (const button of allButtons) {
    const isActive = button === activeButton;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function setActiveMode(mode) {
  currentMode = mode;
  const buttons = document.querySelectorAll("button[data-mode]");
  for (const button of buttons) {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

async function setMode(mode) {
  setActiveMode(mode);
  await chrome.runtime.sendMessage({
    type: "HTA_SET_MODE",
    payload: { mode }
  }).catch(() => undefined);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, {
      type: "HTA_SET_MODE",
      payload: { mode }
    }).catch(() => undefined);
  }
  setStatus(`Mode set to ${mode}.`);
}

async function initMode() {
  const response = await chrome.runtime.sendMessage({ type: "HTA_GET_MODE" }).catch(() => null);
  const mode = response?.mode === "recruiter" ? "recruiter" : "student";
  setActiveMode(mode);
}
