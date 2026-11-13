// ===== Settings =====
const QUESTIONS_PER_ROUND = 10;      // solo questions per game
const DUEL_QUESTIONS_EACH = 5;       // 1 vs 1: questions per player (10 total)
const SCORE_TO_WIN = 7;            // solo: right answers needed for a sticker
const SECONDS_PER_QUESTION = 15;
const PAUSE_AFTER_ANSWER = 1600;   // ms before the next question

const GAME_NAMES = {
  flag: "Guess the Flag",
  fact: "Fun Fact Match",
  map: "Find It on the Map",
  capital: "Capital Cities",
  dish: "Guess the Dish",
  lang: "Language Match",
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

function buildFlagQuestions(n = QUESTIONS_PER_ROUND) {
  return pickFresh("flag", COUNTRIES, c => c.code, n).map(c => {
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

function buildFactQuestions(n = QUESTIONS_PER_ROUND) {
  return pickFresh("fact", FUN_FACTS, f => f.fact, n).map(f => {
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

function buildCapitalQuestions(n = QUESTIONS_PER_ROUND) {
  return pickFresh("capital", COUNTRIES, c => c.code, n).map(c => {
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

function buildMapQuestions(n = QUESTIONS_PER_ROUND) {
  const usable = COUNTRIES.filter(c => mapCentroids[c.num]);
  return pickFresh("map", usable, c => c.code, n).map(c => {
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

function buildDishQuestions(n = QUESTIONS_PER_ROUND) {
  return pickFresh("dish", DISHES, d => d.name, n).map(d => {
    const c = byCode[d.code];
    // Wrong answers never include countries that share the dish.
    const blocked = new Set([d.code, ...d.avoid]);
    const wrong = shuffle(COUNTRIES.filter(o => !blocked.has(o.code))).slice(0, 3);
    return {
      render(area) {
        area.innerHTML = `<p class="prompt">Which country is this dish from?</p>
          <figure class="dish-card">
            <img src="${d.img}" alt="${d.name}">
            <figcaption><b>${d.name}</b><span>${d.about}</span></figcaption>
            <small class="credit">${d.credit}</small>
          </figure>`;
      },
      options: shuffle([{ label: c.name, correct: true }, ...wrong.map(w => ({ label: w.name, correct: false }))]),
      answerText: c.name,
    };
  });
}

// Answer button text: country in front, then the language.
const langLabel = l => `<span class="lang-country">${LANG_COUNTRY[l]}</span>${l}`;

function buildLangQuestions(n = QUESTIONS_PER_ROUND) {
  const allLangs = Object.keys(LANGUAGES);
  return pickFresh("lang", PHRASES, p => p.phrase, n).map(p => {
    const wrong = shuffle(allLangs.filter(l => l !== p.lang)).slice(0, 3);
    return {
      render(area) {
        area.innerHTML = `<p class="prompt">Which language is this?</p>
          <div class="phrase-card">
            <span class="bubble">${p.phrase}</span>
            <span class="meaning">means “${p.meaning}”</span>
          </div>`;
      },
      options: shuffle([{ label: langLabel(p.lang), correct: true }, ...wrong.map(l => ({ label: langLabel(l), correct: false }))]),
      answerText: p.lang,
      note: `${p.lang} is spoken in ${LANGUAGES[p.lang]}.`,
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
let mode = "solo"; // "solo" or "duel"

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
  const builders = {
    flag: buildFlagQuestions, fact: buildFactQuestions, map: buildMapQuestions,
    capital: buildCapitalQuestions, dish: buildDishQuestions, lang: buildLangQuestions,
  };
  // 1 vs 1: players take turns, so each gets DUEL_QUESTIONS_EACH questions,
  // plus one extra each saved for a tie-breaker.
  const duel = mode === "duel";
  const questions = builders[game](duel ? DUEL_QUESTIONS_EACH * 2 + 2 : QUESTIONS_PER_ROUND);
  state = {
    game, mode, questions, total: duel ? DUEL_QUESTIONS_EACH * 2 : QUESTIONS_PER_ROUND, index: 0,
    score: 0, p1: 0, p2: 0, player: 1,
    locked: false, timer: null, tick: null, bonus: false,
  };
  $("#game-name").textContent = GAME_NAMES[game];
  $("#score").textContent = "0";
  $("#p1-score").textContent = "0";
  $("#p2-score").textContent = "0";
  document.body.classList.toggle("duel", mode === "duel");
  showScreen("game");
  showQuestion();
}

function showQuestion() {
  const q = state.questions[state.index];
  const duel = state.mode === "duel";
  state.locked = false;
  state.player = duel ? (state.index % 2) + 1 : 1;
  const p = state.player;

  if (duel) {
    const round = Math.floor(state.index / 2) + 1;
    $("#q-count").innerHTML = state.bonus
      ? `⚡ Tie-breaker! · <span class="p${p}-text">Player ${p}'s turn</span>`
      : `Round ${round} of ${DUEL_QUESTIONS_EACH} · <span class="p${p}-text">Player ${p}'s turn</span>`;
    document.body.dataset.turn = p;
    document.querySelectorAll(".p-pill").forEach(el => el.classList.toggle("turn", el.classList.contains("p" + p)));
  } else {
    $("#q-count").textContent = `Question ${state.index + 1} of ${state.total}`;
  }
  $("#progress-fill").style.width = (Math.min(state.index, state.total) / state.total * 100) + "%";
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

  if (duel) {
    // Big "Player X's turn!" banner, then the clock starts.
    state.locked = true;
    const banner = $("#turn-banner");
    banner.className = "turn-banner p" + p;
    banner.textContent = `Player ${p}'s turn!`;
    void banner.offsetWidth;
    banner.classList.add("show");
    state.timer = setTimeout(() => {
      banner.classList.remove("show");
      if (!state) return;
      state.locked = false;
      startTimer();
    }, 1300);
  } else {
    startTimer();
  }
}

// ----- Countdown timer -----
function startTimer() {
  stopTimer();
  const end = Date.now() + SECONDS_PER_QUESTION * 1000;
  const fill = $("#timer-fill"), num = $("#timer-num"), wrap = $("#timer");
  wrap.classList.remove("hurry");
  const update = () => {
    const left = Math.max(0, end - Date.now());
    const secs = Math.ceil(left / 1000);
    fill.style.width = (left / (SECONDS_PER_QUESTION * 1000) * 100) + "%";
    if (num.textContent !== String(secs)) num.textContent = secs;
    wrap.classList.toggle("hurry", secs <= 5);
    if (left <= 0) { stopTimer(); timeUp(); }
  };
  update();
  state.tick = setInterval(update, 100);
}
function stopTimer() {
  if (state && state.tick) { clearInterval(state.tick); state.tick = null; }
}

function timeUp() {
  if (!state || state.locked) return;
  const q = state.questions[state.index];
  revealCorrect(q);
  setFeedback(`⏰ Time's up! It was ${q.answerText}.`, "bad");
  endQuestion();
}

// ----- Answering -----
const optionButtons = () => [...document.querySelectorAll(".option")];

function setFeedback(text, kind) {
  const fb = $("#feedback");
  fb.textContent = text;
  fb.className = "feedback " + kind;
}

function revealCorrect(q) {
  optionButtons()[q.options.findIndex(o => o.correct)].classList.add("correct");
}

function bumpPill(el) {
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
}

function endQuestion() {
  stopTimer();
  state.locked = true;
  // Extra info after answering (e.g. where a language is spoken).
  const note = state.questions[state.index].note;
  if (note) $("#feedback").innerHTML += `<span class="note">${note}</span>`;
  optionButtons().forEach(b => {
    b.disabled = true;
    if (!b.classList.contains("correct") && !b.classList.contains("wrong")) b.classList.add("dim");
  });
  state.timer = setTimeout(nextQuestion, PAUSE_AFTER_ANSWER);
}

function nextQuestion() {
  state.index++;
  if (state.index < state.total) return showQuestion();
  // 1 vs 1 tie after all rounds: one more question each decides it.
  if (state.mode === "duel" && state.p1 === state.p2 && !state.bonus) {
    state.bonus = true;
    state.total += 2;
    return showQuestion();
  }
  finishGame();
}

// Answer by click or keys 1–4. In 1 vs 1 it counts for whoever's turn it is.
function answer(i) {
  if (!state || state.locked) return;
  const q = state.questions[state.index];
  const buttons = optionButtons();
  const duel = state.mode === "duel";
  const p = state.player;
  if (q.options[i].correct) {
    buttons[i].classList.add("correct");
    if (duel) {
      state["p" + p]++;
      $(`#p${p}-score`).textContent = state["p" + p];
      bumpPill($(`.p-pill.p${p}`));
      setFeedback(`Player ${p} got it! 🎉`, "good p" + p);
    } else {
      state.score++;
      $("#score").textContent = state.score;
      bumpPill($("#solo-score"));
      setFeedback(pick(["Correct! 🎉", "Nice one! ✨", "You got it! 🙌", "Yes! 🔥", "Exactly! 👏"]), "good");
    }
    miniBurst(buttons[i]);
  } else {
    buttons[i].classList.add("wrong");
    revealCorrect(q);
    setFeedback(duel ? `Oops, Player ${p}! It was ${q.answerText}.` : `Oops! It was ${q.answerText}.`, "bad");
  }
  endQuestion();
}

function finishGame() {
  stopTimer();
  $("#progress-fill").style.width = "100%";
  const score = $("#result-score");

  if (state.mode === "duel") {
    const { p1, p2 } = state;
    const winner = p1 > p2 ? 1 : p2 > p1 ? 2 : 0;
    $("#result-emoji").textContent = winner ? "🏆" : "🤝";
    $("#result-title").textContent = winner ? `Player ${winner} wins!` : "It's a tie!";
    score.innerHTML = `<span class="p1-text">Player 1: <b>${p1}</b></span> &nbsp;·&nbsp; <span class="p2-text">Player 2: <b>${p2}</b></span>`;
    $("#result-sub").textContent = winner
      ? `Player ${winner}, show this screen to an ASA member to grab your sticker!`
      : "What a match! Ask an ASA member about stickers.";
    showScreen("result");
    confetti(winner ? 4200 : 1500, winner ? 140 : 60);
  } else {
    const won = state.score >= SCORE_TO_WIN;
    $("#result-emoji").textContent = won ? "🎉" : "💪";
    $("#result-title").textContent = won ? "You won a sticker!" : "So close!";
    score.innerHTML = `You got <b id="result-num">0</b> out of ${state.total}`;
    $("#result-sub").textContent = won
      ? "Show this screen to an ASA member to grab your sticker."
      : `You needed ${SCORE_TO_WIN} to win. Thanks for playing!`;
    showScreen("result");
    countUp($("#result-num"), state.score);
    if (won) confetti(4200); else confetti(1200, 60);
  }
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
  stopTimer();
  state = null;
  $("#turn-banner").classList.remove("show");
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

// Solo / 1 vs 1 switch on the home page
function setMode(m) {
  mode = m;
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === m));
  document.body.classList.toggle("duel", m === "duel");
  $("#tagline").innerHTML = m === "duel"
    ? `Two players take turns · ${DUEL_QUESTIONS_EACH} questions each · <b>most right answers</b> wins!`
    : `Pick a game · ${QUESTIONS_PER_ROUND} questions · get <b>${SCORE_TO_WIN} right</b> to win a sticker!`;
}
document.querySelectorAll(".mode-btn").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
setMode("solo");

// Keys 1–4 also answer (both modes).
addEventListener("keydown", e => {
  if (!state || !$("#screen-game").classList.contains("active") || e.repeat) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 4) answer(n - 1);
});
