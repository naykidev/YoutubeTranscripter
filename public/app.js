const form = document.querySelector("#form");
const urlInput = document.querySelector("#url");
const submitButton = document.querySelector("#submit");
const errorBox = document.querySelector("#error");
const result = document.querySelector("#result");
const thumb = document.querySelector("#thumb");
const title = document.querySelector("#title");
const meta = document.querySelector("#meta");
const watch = document.querySelector("#watch");
const langs = document.querySelector("#langs");
const stats = document.querySelector("#stats");
const transcript = document.querySelector("#transcript");
const timestamps = document.querySelector("#timestamps");
const copyButton = document.querySelector("#copy");
const copyTextButton = document.querySelector("#copy-text");
const copyNotesButton = document.querySelector("#copy-notes");
const copyLabels = new Map([
  [copyButton, "Copy for AI"],
  [copyTextButton, "Copy transcript"],
  [copyNotesButton, "Copy study notes"],
]);
const status = document.querySelector("#status");

let view = null;
let requestSeq = 0;
let copyTimer = 0;

urlInput.focus();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const url = urlInput.value.trim();
  if (!url) {
    showError("Paste a YouTube link first.");
    urlInput.focus();
    return;
  }
  load(url, null, true);
});

timestamps.addEventListener("change", () => {
  if (!view) return;
  renderTranscript();
});

copyButton.addEventListener("click", () => {
  if (!view) return;
  copyToClipboard(aiPrompt(), copyButton, "Copy for AI", "Prompt copied. Paste it into ChatGPT or another AI.");
});

copyTextButton.addEventListener("click", () => {
  if (!view?.renderedText) return;
  copyToClipboard(view.renderedText, copyTextButton, "Copy transcript", "Transcript copied.");
});

copyNotesButton.addEventListener("click", () => {
  if (!view) return;
  copyToClipboard(
    studyNotesPrompt(),
    copyNotesButton,
    "Copy study notes",
    "Study notes prompt copied. Paste it into an AI, then save the markdown on GitHub.",
  );
});

async function copyToClipboard(text, button, restoreLabel, statusMessage) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) {
      showError("Couldn’t copy automatically. Select the transcript and copy it.");
      return;
    }
  }
  clearError();
  for (const [other, label] of copyLabels) {
    other.textContent = label;
    other.classList.remove("copied");
  }
  button.textContent = "Copied";
  button.classList.add("copied");
  status.textContent = statusMessage;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    button.textContent = restoreLabel;
    button.classList.remove("copied");
  }, 1800);
}

function aiPrompt() {
  const details = [`Video: ${view.title}`];
  if (view.author) details.push(`Channel: ${view.author}`);
  details.push(`Link: ${view.watchUrl}`);

  return [
    "Use only the transcript below. If something is not in it, say so.",
    "",
    ...details,
    "",
    "From this transcript, write:",
    "",
    "Main ideas",
    "The few big ideas, each in a sentence or two.",
    "",
    "Key points",
    "The specific claims, steps, examples, and facts worth keeping. Short bullets.",
    "",
    "Questions mentioned",
    "Questions the speaker asks, poses to the audience, or leaves open. Keep the wording close to the video. If none are asked, say so.",
    "",
    "Also worth noting",
    "Names, books, tools, or terms that matter, and anything surprising or easy to miss.",
    "",
    "Transcript:",
    groupParagraphs(view.segments).join("\n\n"),
  ].join("\n");
}

function studyNotesPrompt() {
  const details = [`Video: ${view.title}`];
  if (view.author) details.push(`Channel: ${view.author}`);
  details.push(`Link: ${view.watchUrl}`);

  return [
    "Write study notes from the transcript as GitHub-flavored markdown.",
    "Reply with the markdown file only, so I can paste it into a .md file and commit it to GitHub.",
    "Write the ideas in original wording that shows understanding. Use only the transcript. If a term, number, or diagram is not supported by the video, say what is missing instead of inventing it.",
    "",
    ...details,
    "",
    "Use these sections:",
    "",
    "## 1. Key Concepts",
    "Identify the major ideas and write each one in your own words. These should reflect an understanding of the video, not a line-by-line recap.",
    "",
    "## 2. Definitions",
    "Identify the important technical terms and define each one in your own words.",
    "",
    "## 3. Diagrams",
    "Include relevant visuals that GitHub can render. Put each diagram in its own mermaid code block, then add a one-line caption naming the type.",
    "Use the kinds that fit this video:",
    "- Block diagrams",
    "- Circuit diagrams",
    "- Flowcharts",
    "- Conceptual drawings",
    "- Plots",
    "They do not need to be artistic. They need to be clear and meaningful.",
    "Use a mermaid flowchart for block diagrams, flowcharts, and conceptual drawings.",
    "For a circuit, show each component as a node and each wire as an arrow, and label the nodes with the part name.",
    "For a plot, add a markdown table of the values from the transcript and describe the axes. Include a mermaid xychart only when the transcript gives numeric points.",
    "Skip a diagram type when it does not belong in this video.",
    "",
    "## 4. Lingering Questions",
    "Include at least one question that is still open after watching.",
    "",
    "Transcript:",
    groupParagraphs(view.segments).join("\n\n"),
  ].join("\n");
}

async function load(url, track, replace) {
  const seq = ++requestSeq;
  clearError();
  setBusy(true, replace);
  if (replace) result.hidden = true;

  try {
    const data = await requestTranscript(url, track);
    if (seq !== requestSeq) return;
    view = data;
    renderResult();
    if (replace) result.scrollIntoView({ block: "nearest" });
  } catch (error) {
    if (seq !== requestSeq) return;
    const message =
      error.message === "Failed to fetch"
        ? "Couldn’t reach the app. Reload the page and try again."
        : error.message;
    showError(message || "Couldn’t get that transcript.");
    if (replace) result.hidden = true;
  } finally {
    if (seq === requestSeq) setBusy(false, replace);
  }
}

function renderResult() {
  result.hidden = false;
  title.textContent = view.title;
  thumb.alt = "";
  thumb.onerror = () => {
    thumb.onerror = null;
    thumb.src = `https://i.ytimg.com/vi/${view.videoId}/mqdefault.jpg`;
  };
  thumb.src = view.thumbnail;
  watch.href = view.watchUrl;

  const bits = [view.author, formatDuration(view.lengthSeconds), view.track.name].filter(Boolean);
  meta.textContent = bits.join(" · ");

  const words = countWords(view.segments);
  stats.textContent = `${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;

  langs.replaceChildren();
  for (const track of view.tracks) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lang";
    button.textContent = track.name;
    button.setAttribute("aria-pressed", String(track.id === view.track.id));
    button.addEventListener("click", () => {
      if (track.id === view.track.id) return;
      load(view.watchUrl, track.id, false);
    });
    langs.appendChild(button);
  }

  renderTranscript();
  status.textContent = `Transcript ready. ${stats.textContent}.`;
}

function renderTranscript() {
  const useTimes = timestamps.checked;
  transcript.replaceChildren();

  if (useTimes) {
    const lines = view.segments.map((segment) => `${formatTime(segment.start)}  ${segment.text}`);
    view.renderedText = lines.join("\n");
    for (const segment of view.segments) {
      const row = document.createElement("div");
      row.className = "cue";
      const time = document.createElement("time");
      time.dateTime = `PT${Math.floor(segment.start)}S`;
      time.textContent = formatTime(segment.start);
      const line = document.createElement("p");
      line.textContent = segment.text;
      row.append(time, line);
      transcript.append(row);
    }
    return;
  }

  const paragraphs = groupParagraphs(view.segments);
  view.renderedText = paragraphs.join("\n\n");
  for (const paragraph of paragraphs) {
    const p = document.createElement("p");
    p.textContent = paragraph;
    transcript.append(p);
  }
}

function groupParagraphs(segments) {
  const paragraphs = [];
  let buffer = [];
  let chars = 0;
  for (const segment of segments) {
    buffer.push(segment.text);
    chars += segment.text.length + 1;
    const boundary = /[.!?…]["'”’)]*$/.test(segment.text);
    if ((boundary && chars > 90) || chars > 500) {
      paragraphs.push(buffer.join(" "));
      buffer = [];
      chars = 0;
    }
  }
  if (buffer.length) paragraphs.push(buffer.join(" "));
  return paragraphs;
}

function countWords(segments) {
  return segments.reduce(
    (total, segment) => total + segment.text.split(/\s+/).filter(Boolean).length,
    0,
  );
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${secs}`;
  return `${minutes}:${secs}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function setBusy(busy, replace) {
  submitButton.disabled = busy;
  copyButton.disabled = busy;
  copyTextButton.disabled = busy;
  copyNotesButton.disabled = busy;
  submitButton.textContent = busy && replace ? "Fetching…" : "Get transcript";
  urlInput.disabled = busy && replace;
  for (const button of langs.querySelectorAll("button")) button.disabled = busy;
}

function usesLocalApi() {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

async function requestTranscript(url, track) {
  if (!usesLocalApi()) return fetchTranscriptInBrowser(url, track);

  const response = await fetch("/api/transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, track }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Couldn’t get that transcript.");
  return data;
}

function showError(message) {
  errorBox.hidden = false;
  errorBox.textContent = message;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}
