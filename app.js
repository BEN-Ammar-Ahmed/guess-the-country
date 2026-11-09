// ===== Settings =====
const QUESTIONS_PER_ROUND = 10;
const SCORE_TO_WIN = 7;
const PAUSE_AFTER_ANSWER = 1400; // ms before the next question

const GAME_NAMES = {
  flag: "Guess the Flag",
  fact: "Fun Fact Match",
  map: "Find It on the Map",
  capital: "Capital Cities",
};

const byCode = Object.fromEntries(COUNTRIES.map(c => [c.code, c]));
const flagUrl = (code, w = 640) => `https://flagcdn.com/w${w}/${code}.png`;

// ===== Small helpers =====
const $ = sel => document.querySelector(sel);
const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function nameOf(code) {
  return byCode[code] ? byCode[code].name : WORLD_TRICKS[code];
}

// Fill a list of wrong answers up to `count`, using random African countries.
function fillWrong(correctCode, wrong, count) {
  const used = new Set([correctCode, ...wrong]);
  for (const c of shuffle(COUNTRIES)) {
    if (wrong.length >= count) break;
    if (!used.has(c.code)) { wrong.push(c.code); used.add(c.code); }
  }
  return wrong;
}

// ===== "Don't repeat" memory =====
// Remembers which questions were used recently so every new game feels new.
function recentKey(game) { return "asa-recent-" + game; }
function loadRecent(game) {
  try { return JSON.parse(localStorage.getItem(recentKey(game))) || []; } catch { return []; }
}
function saveRecent(game, list) {
  try { localStorage.setItem(recentKey(game), JSON.stringify(list)); } catch { /* ignore */ }
}
const memory = {}; // fallback when localStorage is unavailable

// Pick `n` items from the pool, preferring ones not seen recently.
function pickFresh(game, pool, idOf, n) {
  const recent = loadRecent(game).length ? loadRecent(game) : (memory[game] || []);
  const recentSet = new Set(recent);
  const fresh = shuffle(pool.filter(x => !recentSet.has(idOf(x))));
  const old = shuffle(pool.filter(x => recentSet.has(idOf(x))));
  const chosen = [...fresh, ...old].slice(0, n);
  // Keep a memory big enough that the next few rounds stay different.
  const keep = Math.max(0, pool.length - n);
  const updated = [...recent.filter(id => !chosen.some(c => idOf(c) === id)), ...chosen.map(idOf)].slice(-keep);
  memory[game] = updated;
  saveRecent(game, updated);
  return chosen;
}

// ===== Map data (loaded from the internet) =====
let mapFeatures = null;     // all countries in the world
let africaFeatures = null;  // only the 54
let mapCentroids = {};      // for picking nearby countries as wrong answers
const mapReady = (async () => {
  try {
    const res = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json");
    const topo = await res.json();
    mapFeatures = topojson.feature(topo, topo.objects.countries).features;
    const nums = new Set(COUNTRIES.map(c => c.num));
    africaFeatures = mapFeatures.filter(f => nums.has(f.id));
    for (const f of africaFeatures) mapCentroids[f.id] = d3.geoCentroid(f);
    return true;
  } catch (e) {
    console.warn("Map could not load", e);
    return false;
  }
})();

// ===== Question builders =====
// Each returns: { render(area), options: [{label, correct}], answerText }

function buildFlagQuestions() {
  return pickFresh("flag", COUNTRIES, c => c.code, QUESTIONS_PER_ROUND).map(c => {
    const tricks = shuffle(FLAG_LOOKALIKES[c.code] || []).slice(0, 2);
    const wrong = fillWrong(c.code, tricks, 3);
    return {
      prompt: "Which country does this flag belong to?",
      render(area) {
        area.innerHTML = `<p class="prompt">${this.prompt}</p>
          <img class="flag-big" src="${flagUrl(c.code)}" alt="A flag">`;
      },
      options: shuffle([{ label: c.name, correct: true }, ...wrong.map(w => ({ label: nameOf(w), correct: false }))]),
      answerText: c.name,
    };
  });
}

function buildFactQuestions() {
  return pickFresh("fact", FUN_FACTS, f => f.fact, QUESTIONS_PER_ROUND).map(f => {
    const c = byCode[f.code];
    const wrong = fillWrong(c.code, [], 3);
    return {
      render(area) {
        area.innerHTML = `<p class="prompt">Which country is this about?</p>
          <div class="fact-card">${f.fact}</div>`;
      },
      options: shuffle([{ label: c.name, correct: true }, ...wrong.map(w => ({ label: nameOf(w), correct: false }))]),
      answerText: c.name,
    };
  });
}

function buildCapitalQuestions() {
  return pickFresh("capital", COUNTRIES, c => c.code, QUESTIONS_PER_ROUND).map(c => {
    const askCapital = Math.random() < 0.6; // mix of both question types
    if (askCapital) {
      const trick = shuffle(CAPITAL_TRICKS[c.code] || []).slice(0, 1);
      const others = shuffle(COUNTRIES.filter(o => o.code !== c.code).map(o => o.capital));
      const wrong = [...trick];
      for (const cap of others) { if (wrong.length >= 3) break; if (!wrong.includes(cap)) wrong.push(cap); }
      return {
        render(area) {
          area.innerHTML = `<p class="prompt">What is the capital of…</p>
            <div class="capital-card"><img src="${flagUrl(c.code, 320)}" alt=""><span class="big">${c.name}</span></div>`;
        },
        options: shuffle([{ label: c.capital, correct: true }, ...wrong.map(w => ({ label: w, correct: false }))]),
        answerText: c.capital,
      };
    }
    const wrong = fillWrong(c.code, [], 3);
    return {
      render(area) {
        area.innerHTML = `<p class="prompt">This city is the capital of which country?</p>
          <div class="capital-card"><span class="big">🏛️ ${c.capital}</span></div>`;
      },
      options: shuffle([{ label: c.name, correct: true }, ...wrong.map(w => ({ label: nameOf(w), correct: false }))]),
      answerText: c.name,
    };
  });
}

function buildMapQuestions() {
  const usable = COUNTRIES.filter(c => mapCentroids[c.num]);
  return pickFresh("map", usable, c => c.code, QUESTIONS_PER_ROUND).map(c => {
    // Wrong answers: mostly nearby countries, so it's a real test.
    const here = mapCentroids[c.num];
    const near = usable
      .filter(o => o.code !== c.code)
      .sort((a, b) => d3.geoDistance(here, mapCentroids[a.num]) - d3.geoDistance(here, mapCentroids[b.num]))
      .slice(0, 6);
    const wrong = shuffle(near).slice(0, 2).map(o => o.code);
    fillWrong(c.code, wrong, 3);
    return {
      render(area) {
        area.innerHTML = `<p class="prompt">Which country is lit up?</p><div class="map-wrap"></div>`;
        drawMap(area.querySelector(".map-wrap"), c.num);
      },
      options: shuffle([{ label: c.name, correct: true }, ...wrong.map(w => ({ label: nameOf(w), correct: false }))]),
      answerText: c.name,
    };
  });
}

function drawMap(container, targetNum) {
  const width = 520, height = 480;
  const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
  // Fit to a box around Africa and its islands (not every far-off rock).
  const africaBox = {
    type: "Feature",
    geometry: { type: "MultiPoint", coordinates: [[-26, 37.5], [60, 37.5], [-26, -35.5], [60, -35.5]] },
  };
  const projection = d3.geoMercator().fitExtent([[6, 6], [width - 6, height - 6]], africaBox);
  const path = d3.geoPath(projection);
  const africaIds = new Set(africaFeatures.map(f => f.id));

  svg.selectAll("path").data(mapFeatures).join("path")
    .attr("d", path)
    .attr("class", f => f.id === targetNum ? "target" : (africaIds.has(f.id) ? "land" : "other"));

  // Tiny countries (islands etc.) get a pulsing ring so they can be seen.
  const target = mapFeatures.find(f => f.id === targetNum);
  const [[x0, y0], [x1, y1]] = path.bounds(target);
  if ((x1 - x0) * (y1 - y0) < 400) {
    const [cx, cy] = path.centroid(target);
    for (const delay of [0, 0.7]) {
      svg.append("circle").attr("class", "ring").attr("cx", cx).attr("cy", cy).attr("r", 22)
        .style("animation-delay", delay + "s");
    }
    svg.append("circle").attr("class", "dot").attr("cx", cx).attr("cy", cy).attr("r", 5);
  }
  svg.select(".target").raise();
}

// ===== Game flow =====
let state = null;

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = $("#screen-" + name);
  // restart entry animations
  void el.offsetWidth;
  el.classList.add("active");
  window.scrollTo(0, 0);
}

async function startGame(game) {
  if (game === "map") {
    const ok = await mapReady;
    if (!ok) { alert("The map needs internet to load. Please check the connection and try again."); return; }
  }
  const builders = { flag: buildFlagQuestions, fact: buildFactQuestions, map: buildMapQuestions, capital: buildCapitalQuestions };
  state = { game, questions: builders[game](), index: 0, score: 0, locked: false, timer: null };
  $("#game-name").textContent = GAME_NAMES[game];
  $("#score").textContent = "0";
  showScreen("game");
  showQuestion();
}

function showQuestion() {
  const q = state.questions[state.index];
  state.locked = false;
  $("#q-count").textContent = `Question ${state.index + 1} of ${state.questions.length}`;
  $("#progress-fill").style.width = (state.index / state.questions.length * 100) + "%";
  const fb = $("#feedback");
  fb.textContent = ""; fb.className = "feedback";

  q.render($("#question-area"));

  const box = $("#options");
  box.innerHTML = "";
  q.options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "option";
    b.style.setProperty("--i", i);
    b.innerHTML = `<span class="key">${i + 1}</span>${opt.label}`;
    b.addEventListener("click", () => answer(i));
    box.appendChild(b);
  });
}

function answer(i) {
  if (!state || state.locked) return;
  state.locked = true;
  const q = state.questions[state.index];
  const buttons = [...document.querySelectorAll(".option")];
  buttons.forEach(b => (b.disabled = true));
  const fb = $("#feedback");

  if (q.options[i].correct) {
    state.score++;
    buttons[i].classList.add("correct");
    fb.textContent = pick(["Correct! 🎉", "Nice one! ✨", "You got it! 🙌", "Yes! 🔥", "Exactly! 👏"]);
    fb.className = "feedback good";
    const pill = $(".score-pill");
    $("#score").textContent = state.score;
    pill.classList.remove("pop"); void pill.offsetWidth; pill.classList.add("pop");
    miniBurst(buttons[i]);
  } else {
    buttons[i].classList.add("wrong");
    const right = q.options.findIndex(o => o.correct);
    buttons[right].classList.add("correct");
    fb.textContent = `Oops! It was ${q.answerText}.`;
    fb.className = "feedback bad";
  }
  buttons.forEach((b, j) => { if (!b.classList.contains("correct") && !b.classList.contains("wrong")) b.classList.add("dim"); });

  state.timer = setTimeout(() => {
    state.index++;
    if (state.index < state.questions.length) showQuestion();
    else finishGame();
  }, PAUSE_AFTER_ANSWER);
}

function finishGame() {
  $("#progress-fill").style.width = "100%";
  const won = state.score >= SCORE_TO_WIN;
  $("#result-emoji").textContent = won ? "🎉" : "💪";
  $("#result-title").textContent = won ? "You won a sticker!" : "So close!";
  $("#result-sub").textContent = won
    ? "Show this screen to an ASA member to grab your sticker."
    : `You needed ${SCORE_TO_WIN} to win. Thanks for playing!`;
  showScreen("result");
  countUp($("#result-num"), state.score);
  if (won) confetti(4200); else confetti(1200, 60);
  state = null;
  // After a few seconds, move on to the Join ASA page by itself.
  clearTimeout(joinTimer);
  joinTimer = setTimeout(() => {
    if ($("#screen-result").classList.contains("active")) showScreen("join");
  }, 8000);
}
let joinTimer = null;

function countUp(el, target) {
  let n = 0;
  el.textContent = "0";
  const step = () => {
    if (n >= target) return;
    n++; el.textContent = n;
    setTimeout(step, 110);
  };
  setTimeout(step, 400);
}

function goHome() {
  if (state && state.timer) clearTimeout(state.timer);
  state = null;
  showScreen("home");
}

// ===== Confetti =====
const canvas = $("#confetti");
const ctx = canvas.getContext("2d");
let pieces = [];
let confettiRunning = false;
const CONFETTI_COLORS = ["#a5401a", "#f0952a", "#4d5b2c", "#fcd116", "#009739", "#ce1126", "#000000", "#ffffff"];

function resizeCanvas() { canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener("resize", resizeCanvas);
resizeCanvas();

function addPieces(count, x, y, spread) {
  for (let i = 0; i < count; i++) {
    pieces.push({
      x: x ?? Math.random() * canvas.width,
      y: y ?? -20 - Math.random() * canvas.height * 0.5,
      vx: (Math.random() - 0.5) * (spread || 4),
      vy: y != null ? -Math.random() * 9 - 3 : Math.random() * 3 + 2,
      size: Math.random() * 8 + 6,
      color: pick(CONFETTI_COLORS),
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1,
    });
  }
  if (!confettiRunning) { confettiRunning = true; requestAnimationFrame(tick); }
}

function tick() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  pieces.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.rot += p.vr;
    if (p.y > canvas.height + 40) p.life = 0;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  });
  pieces = pieces.filter(p => p.life > 0);
  if (pieces.length) requestAnimationFrame(tick);
  else { confettiRunning = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
}

function confetti(duration = 3000, perWave = 140) {
  const end = Date.now() + duration;
  (function wave() {
    addPieces(perWave);
    if (Date.now() < end) setTimeout(wave, 700);
  })();
}

function miniBurst(el) {
  const r = el.getBoundingClientRect();
  addPieces(28, r.left + r.width / 2, r.top + r.height / 2, 12);
}

// ===== Wire up buttons =====
document.querySelectorAll(".game-card").forEach(card =>
  card.addEventListener("click", () => startGame(card.dataset.game)));
document.querySelectorAll("[data-home]").forEach(b => b.addEventListener("click", goHome));
$("#to-join").addEventListener("click", () => showScreen("join"));

$("#fullscreen-btn").addEventListener("click", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

// Keys 1–4 answer questions.
addEventListener("keydown", e => {
  if (state && $("#screen-game").classList.contains("active")) {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4) answer(n - 1);
  }
});
