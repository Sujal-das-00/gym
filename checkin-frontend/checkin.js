const form = document.querySelector("#checkinForm");
const input = document.querySelector("#identifier");
const result = document.querySelector("#result");
const forget = document.querySelector("#forgetMe");
const button = document.querySelector("#checkinButton");
const brandMark = document.querySelector("#brandMark");
const gymName = document.querySelector("#gymName");
const gymIntro = document.querySelector("#gymIntro");
const todayLabel = document.querySelector("#todayLabel");
const memberStatus = document.querySelector("#memberStatus");
const memberPanel = document.querySelector("#memberPanel");
const memberPhoto = document.querySelector("#memberPhoto");
const memberGymId = document.querySelector("#memberGymId");
const memberName = document.querySelector("#memberName");
const memberPhone = document.querySelector("#memberPhone");
const historyCount = document.querySelector("#historyCount");
const historyList = document.querySelector("#historyList");

const saved = localStorage.getItem("gym-checkin-id") || "";
input.value = saved;

todayLabel.textContent = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
}).format(new Date());

function initials(name) {
  return String(name || "Gym Admin")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function mixHex(hex, mix = "#ffffff", amount = 0.88) {
  const base = hexToRgb(hex);
  const target = hexToRgb(mix);
  const channel = (key) => Math.round(base[key] * (1 - amount) + target[key] * amount);
  return `rgb(${channel("r")}, ${channel("g")}, ${channel("b")})`;
}

function applyTheme(theme = {}) {
  const root = document.documentElement;
  const primary = isHexColor(theme.primary) ? theme.primary : "#11784a";
  const primaryDark = isHexColor(theme.primaryDark) ? theme.primaryDark : "#073f2d";
  const accent = isHexColor(theme.accent) ? theme.accent : "#4f46e5";
  const danger = isHexColor(theme.danger) ? theme.danger : "#c43d32";
  const background = isHexColor(theme.background) ? theme.background : "#f6f8f5";
  const panel = isHexColor(theme.panel) ? theme.panel : "#ffffff";
  const text = isHexColor(theme.text) ? theme.text : "#17201b";
  root.style.setProperty("--bg", background);
  root.style.setProperty("--panel", panel);
  root.style.setProperty("--ink", text);
  root.style.setProperty("--green", primary);
  root.style.setProperty("--green-dark", primaryDark);
  root.style.setProperty("--green-soft", mixHex(primary));
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-soft", mixHex(accent));
  root.style.setProperty("--red", danger);
  root.style.setProperty("--red-soft", mixHex(danger));
}

function show(type, text) {
  result.className = `result-box ${type}`;
  result.textContent = text;
}

function displayDate(value) {
  if (!value) return "Not recorded";
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function displayTime(value) {
  if (!value) return "Manual entry";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Manual entry";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function renderMember(member, history = []) {
  memberPanel.hidden = false;
  memberStatus.textContent = "Checked in";
  memberGymId.textContent = member.gymId || member.id || "Member";
  memberName.textContent = member.name || "Member";
  memberPhone.textContent = member.phone || "";
  if (member.photo) {
    memberPhoto.src = member.photo;
    memberPhoto.alt = `${member.name} photo`;
    memberPhoto.style.display = "block";
  } else {
    memberPhoto.removeAttribute("src");
    memberPhoto.alt = "";
    memberPhoto.style.display = "none";
  }
  historyCount.textContent = `${history.length} visit${history.length === 1 ? "" : "s"}`;
  historyList.innerHTML = history.length
    ? history
        .map(
          (row) => `
            <article class="history-row">
              <div>
                <strong>${displayDate(row.date)}</strong>
                <span>${displayTime(row.time)}</span>
              </div>
              <em>${row.source === "qr" ? "Self check-in" : "Manual"}</em>
            </article>
          `,
        )
        .join("")
    : `<p class="empty-history">No earlier attendance found.</p>`;
}

async function loadBranding() {
  try {
    const res = await fetch("/api/settings");
    const settings = await res.json();
    applyTheme(settings.theme || {});
    gymName.textContent = settings.gymName || "Gym Check-in";
    gymIntro.textContent = `Welcome to ${settings.gymName || "the gym"}. Check in and review your recent visits.`;
    if (settings.logo) {
      brandMark.innerHTML = `<img src="${settings.logo}" alt="${settings.gymName || "Gym"} logo">`;
    } else {
      brandMark.textContent = initials(settings.gymName);
    }
  } catch {
    applyTheme();
  }
}

async function loadHistory(identifier) {
  if (!identifier) return;
  try {
    const res = await fetch(`/api/checkin/history?identifier=${encodeURIComponent(identifier)}`);
    const data = await res.json();
    if (!res.ok) return;
    renderMember(data.member, data.history || []);
  } catch {
    // Keep the check-in screen usable when history cannot load.
  }
}

async function checkIn(identifier) {
  button.disabled = true;
  button.textContent = "Checking in...";
  try {
    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Check-in failed");
    localStorage.setItem("gym-checkin-id", identifier);
    show("ok", data.duplicate ? `Already checked in today, ${data.member.name}.` : `Welcome, ${data.member.name}. Check-in recorded.`);
    renderMember(data.member, data.history || []);
  } finally {
    button.disabled = false;
    button.textContent = "Check in";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const identifier = input.value.trim();
  if (!identifier) return;
  try {
    await checkIn(identifier);
  } catch (error) {
    memberStatus.textContent = "Not checked in";
    show("err", error.message);
  }
});

forget.addEventListener("click", () => {
  localStorage.removeItem("gym-checkin-id");
  input.value = "";
  memberPanel.hidden = true;
  memberStatus.textContent = "Ready";
  show("ok", "Saved ID removed from this phone.");
});

loadBranding();
if (saved) loadHistory(saved);
