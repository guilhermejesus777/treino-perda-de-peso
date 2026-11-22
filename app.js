/* ==========================================================
   Projeto Perda de Peso — app
   ========================================================== */
(() => {
  "use strict";

  // ---------- Constantes ----------
  const STORAGE_KEY = "ppp.state.v1";
  const DAY_MS = 86400000;
  const MODEL_CHAIN = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"];

  const WORKOUTS = [
    {
      id: "A",
      weekday: 1,
      short: "SEG",
      day: "Segunda-feira",
      title: "Treino A",
      groups: "Peito • Ombro • Tríceps",
      icon: "i-dumbbell",
      accent: "#ff3b30",
      exercises: [
        { name: "Supino no banco", reps: "4x12" },
        { name: "Flexão inclinada no banco", reps: "3x até falhar" },
        { name: "Desenvolvimento ombro sentado", reps: "4x12" },
        { name: "Elevação lateral", reps: "3x15" },
        { name: "Tríceps mergulho no banco", reps: "3x12" },
      ],
      cardio: "15min esteira inclinada",
    },
    {
      id: "B",
      weekday: 3,
      short: "QUA",
      day: "Quarta-feira",
      title: "Treino B",
      groups: "Pernas • Panturrilha • Glúteo",
      icon: "i-bolt",
      accent: "#ff7a18",
      exercises: [
        { name: "Agachamento com halter", reps: "4x12" },
        { name: "Cadeira extensora", reps: "4x15" },
        { name: "Afundo búlgaro", reps: "3x10 cada perna" },
        { name: "Panturrilha em pé com halter", reps: "4x20" },
        { name: "Elevação de quadril com anilha", reps: "3x15" },
      ],
      cardio: "15min corre 1min / caminha 1min",
    },
    {
      id: "C",
      weekday: 5,
      short: "SEX",
      day: "Sexta-feira",
      title: "Treino C",
      groups: "Costas • Bíceps • Abdômen",
      icon: "i-dumbbell",
      accent: "#ffb347",
      exercises: [
        { name: "Remada curvada", reps: "4x12" },
        { name: "Remada unilateral no banco", reps: "3x12 cada lado" },
        { name: "Rosca bíceps", reps: "3x12" },
        { name: "Rosca martelo", reps: "3x12" },
        { name: "Prancha 3x45seg + abdominal no banco", reps: "3x20" },
      ],
      cardio: "15min esteira",
    },
  ];

  // ---------- Estado ----------
  const defaultState = () => ({
    settings: {
      apiKey: "",
      model: "",
      kcalGoal: 1800,
      proteinGoal: 130,
      carbsGoal: 180,
      fatGoal: 60,
      weightGoal: null,
    },
    logs: {},
    meals: {},
    weights: [],
    lastView: "treino",
  });

  let state = loadState();
  let currentPhoto = null;
  let currentAnalysis = null;
  let deferredPrompt = null;
  let analyzing = false;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        ...defaultState(),
        ...parsed,
        settings: { ...defaultState().settings, ...(parsed.settings || {}) },
        logs: parsed.logs || {},
        meals: parsed.meals || {},
        weights: Array.isArray(parsed.weights) ? parsed.weights : [],
      };
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      toast("Não foi possível salvar os dados neste navegador.", true);
    }
  }

  // ---------- Utilidades ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function ymd(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseYmd(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function startOfWeek(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function todayKey() {
    return ymd(new Date());
  }

  function fmtNum(n) {
    return Math.round(Number(n) || 0).toLocaleString("pt-BR");
  }

  function fmtGrams(n) {
    return Math.round(Number(n) || 0).toLocaleString("pt-BR");
  }

  function weekdayName(d = new Date()) {
    return new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(d);
  }

  function longDate(d = new Date()) {
    return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(d);
  }

  function shortDate(d) {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);
  }

  function icon(id, cls = "ic") {
    return `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  }

  let toastTimer = null;
  function toast(message, isError = false) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.toggle("is-error", isError);
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-show"), 3200);
  }

  // ---------- Navegação ----------
  const views = ["treino", "comida", "progresso"];
  function showView(name, persist = true) {
    if (!views.includes(name)) name = "treino";
    $$(".tab[data-view]").forEach((btn) => {
      const active = btn.dataset.view === name;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    views.forEach((v) => {
      $(`#view-${v}`).hidden = v !== name;
    });
    if (persist) {
      state.lastView = name;
      saveState();
    }
    if (name === "progresso") renderProgress();
    if (name === "comida") renderFood();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  // ---------- Treinos ----------
  function getLog(dateKey) {
    return state.logs[dateKey] || {};
  }

  function isCardDone(dateKey, wid) {
    const workout = WORKOUTS.find((w) => w.id === wid);
    if (!workout) return false;
    const done = getLog(dateKey)[wid] || [];
    return done.length >= workout.exercises.length + 1;
  }

  function completedOn(dateKey) {
    return WORKOUTS.some((w) => isCardDone(dateKey, w.id));
  }

  function todayWorkout() {
    const wd = new Date().getDay();
    return WORKOUTS.find((w) => w.weekday === wd) || null;
  }

  function renderTodayBanner() {
    const el = $("#todayBanner");
    const t = todayWorkout();
    if (t) {
      el.classList.remove("is-rest");
      el.innerHTML = `${icon("i-flame")}<span>Hoje é <strong>${esc(t.day.toLowerCase())}</strong> — ${esc(t.title)} · ${esc(t.groups)}</span>`;
    } else {
      el.classList.add("is-rest");
      el.innerHTML = `${icon("i-scale")}<span>Hoje é <strong>descanso</strong>. Caminhe, alongue e prepare o próximo treino.</span>`;
    }
  }

  function renderWeek() {
    const strip = $("#weekStrip");
    const monday = startOfWeek();
    const today = ymd();
    const labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    strip.innerHTML = labels
      .map((label, i) => {
        const d = addDays(monday, i);
        const key = ymd(d);
        const isToday = key === today;
        const done = completedOn(key);
        return `<div class="week-day${isToday ? " is-today" : ""}">
          <span>${label}</span>
          <strong>${String(d.getDate()).padStart(2, "0")}</strong>
          <span class="dot${done ? "" : " off"}" title="${done ? "Treino concluído" : "Sem treino concluído"}"></span>
        </div>`;
      })
      .join("");

    let count = 0;
    WORKOUTS.forEach((w) => {
      const doneThisWeek = [0, 1, 2, 3, 4, 5, 6].some((i) =>
        isCardDone(ymd(addDays(monday, i)), w.id)
      );
      if (doneThisWeek) count++;
    });
    $("#weekProgress").innerHTML = `<strong>${count}<em>/3</em></strong>treinos nesta semana`;
  }

  function renderWorkouts() {
    const list = $("#workoutList");
    const dateKey = todayKey();
    const log = getLog(dateKey);

    list.innerHTML = WORKOUTS.map((w) => {
      const done = log[w.id] || [];
      const total = w.exercises.length + 1;
      const doneCount = Math.min(done.length, total);
      const cardDone = isCardDone(dateKey, w.id);
      const exercisesHtml = w.exercises
        .map((ex, i) => {
          const checked = done.includes(i);
          return `<button type="button" class="exercise${checked ? " is-done" : ""}" data-workout="${w.id}" data-index="${i}">
            <span class="check">${icon("i-check")}</span>
            <span class="exercise-text">${esc(ex.name)} <span class="reps">${esc(ex.reps)}</span></span>
          </button>`;
        })
        .join("");
      const cardioChecked = done.includes(w.exercises.length);
      return `<article class="workout${cardDone ? " is-done" : ""}" style="--accent:${w.accent}">
        <div class="workout-head">
          <span class="workout-day">${esc(w.day)}</span>
          <h3 class="workout-title">${icon(w.icon)} ${esc(w.title)}</h3>
          <p class="workout-groups">${esc(w.groups)}</p>
        </div>
        <div class="workout-body">${exercisesHtml}</div>
        <button type="button" class="cardio-final${cardioChecked ? " is-done" : ""}" data-workout="${w.id}" data-index="${w.exercises.length}">
          ${icon("i-flame")}
          <span><strong>Cardio final</strong><span>${esc(w.cardio)}</span></span>
          <span class="check" style="margin-left:auto">${icon("i-check")}</span>
        </button>
        <div class="card-progress">
          <div class="bar"><i style="width:${Math.round((doneCount / total) * 100)}%"></i></div>
          <small>${doneCount}/${total} feitos</small>
        </div>
        <div class="card-done-badge">${icon("i-check")} Treino concluído</div>
      </article>`;
    }).join("");
  }

  function toggleExercise(wid, index) {
    const dateKey = todayKey();
    const workout = WORKOUTS.find((w) => w.id === wid);
    const total = workout.exercises.length + 1;
    const log = { ...(state.logs[dateKey] || {}) };
    const before = new Set(log[wid] || []);
    const wasAllDone = before.size >= total;

    const arr = new Set(before);
    if (arr.has(index)) arr.delete(index);
    else arr.add(index);
    log[wid] = [...arr].sort((a, b) => a - b);
    state.logs[dateKey] = log;
    saveState();

    const nowAllDone = arr.size >= total;
    renderWorkouts();
    renderWeek();
    renderTodayBanner();
    if (nowAllDone && !wasAllDone) toast(`${workout.title} concluído. Boa! 🔥`);
  }

  // ---------- Cronômetro ----------
  const timer = {
    mode: "rest",
    preset: 90,
    duration: 90,
    remaining: 90,
    running: false,
    endAt: 0,
    elapsed: 0,
    startedAt: 0,
    tickId: null,
    audio: null,
    wake: null,
  };

  const timerNow = () => performance.now();

  function timerValue() {
    if (timer.mode === "rest") {
      return timer.running ? Math.max(0, (timer.endAt - timerNow()) / 1000) : timer.remaining;
    }
    return timer.running ? timer.elapsed + (timerNow() - timer.startedAt) / 1000 : timer.elapsed;
  }

  function fmtTimer(seconds) {
    const total = Math.max(0, timer.mode === "rest" ? Math.ceil(seconds) : Math.floor(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function fmtPreset(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}min${s ? String(s).padStart(2, "0") : ""}`;
  }

  function renderTimer() {
    const value = timerValue();
    const card = $("#timerCard");
    const finished = timer.mode === "rest" && !timer.running && timer.remaining <= 0.001;
    const canContinue = timer.mode === "rest" ? timer.remaining > 0 && timer.remaining < timer.duration : timer.elapsed > 0;

    $("#timerDisplay").textContent = fmtTimer(value);
    card.classList.toggle("is-running", timer.running);
    card.classList.toggle("is-stop", timer.mode === "stop");
    card.classList.toggle("is-finished", finished);

    if (timer.mode === "rest") {
      const pct = timer.duration > 0 ? Math.max(0, Math.min(100, (value / timer.duration) * 100)) : 0;
      $("#timerBar").style.width = `${pct}%`;
    } else {
      $("#timerBar").style.width = "100%";
    }

    const label = timer.running ? "Pausar" : canContinue ? "Continuar" : "Iniciar";
    const startBtn = $("#timerStart");
    if (startBtn.dataset.label !== label) {
      startBtn.dataset.label = label;
      startBtn.innerHTML = `${icon(timer.running ? "i-pause" : "i-play")} ${label}`;
    }

    const hint = finished
      ? "Descanso concluído. Hora da próxima série! 🔥"
      : timer.mode === "rest"
        ? timer.running
          ? `Descanso de ${fmtPreset(timer.preset)} em andamento…`
          : "Descanse 60–90s entre as séries. Escolha um tempo e toque em iniciar."
        : timer.running
          ? "Cronômetro livre contando o tempo do treino."
          : timer.elapsed > 0
            ? "Cronômetro pausado. Toque em continuar."
            : "Conta o tempo total do treino, sem limite. Útil para acompanhar a sessão.";
    const hintEl = $("#timerHint");
    if (hintEl.textContent !== hint) hintEl.textContent = hint;

    $("#timerPresets").hidden = timer.mode !== "rest";
    $("#timerSound").style.visibility = timer.mode === "rest" ? "visible" : "hidden";
    $$("#timerPresets [data-preset]").forEach((b) => {
      b.classList.toggle("is-active", Number(b.dataset.preset) === timer.preset);
      b.setAttribute("aria-pressed", String(Number(b.dataset.preset) === timer.preset));
    });
  }

  function ensureAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!timer.audio) timer.audio = new Ctx();
      if (timer.audio.state === "suspended") timer.audio.resume().catch(() => {});
    } catch { /* áudio indisponível */ }
  }

  function playAlarm() {
    try {
      const ctx = timer.audio;
      if (ctx) {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const now = ctx.currentTime;
        [0, 0.24, 0.48].forEach((offset, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = i === 2 ? 1046.5 : 880;
          gain.gain.setValueAtTime(0.0001, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.24);
        });
      }
    } catch { /* sem som */ }
    if (navigator.vibrate) navigator.vibrate([180, 90, 180, 90, 320]);
  }

  async function requestWakeLock() {
    try {
      if (!("wakeLock" in navigator)) return;
      timer.wake = await navigator.wakeLock.request("screen");
    } catch { /* sem wake lock */ }
  }

  function releaseWakeLock() {
    try { timer.wake?.release(); } catch { /* ignore */ }
    timer.wake = null;
  }

  function stopTicking() {
    if (timer.tickId) clearInterval(timer.tickId);
    timer.tickId = null;
    timer.running = false;
    releaseWakeLock();
  }

  function tickTimer() {
    if (!timer.running) return;
    if (timer.mode === "rest" && timerNow() >= timer.endAt) {
      timer.remaining = 0;
      stopTicking();
      renderTimer();
      playAlarm();
      toast("Descanso concluído. Próxima série! 🔥");
      return;
    }
    renderTimer();
  }

  function toggleTimer() {
    if (timer.running) {
      if (timer.mode === "rest") timer.remaining = Math.max(0, (timer.endAt - timerNow()) / 1000);
      else timer.elapsed += (timerNow() - timer.startedAt) / 1000;
      stopTicking();
      renderTimer();
      return;
    }

    ensureAudio();
    requestWakeLock();
    if (timer.mode === "rest") {
      if (timer.remaining <= 0) timer.remaining = timer.duration;
      timer.endAt = timerNow() + timer.remaining * 1000;
    } else {
      timer.startedAt = timerNow();
    }
    timer.running = true;
    timer.tickId = setInterval(tickTimer, 100);
    renderTimer();
  }

  function resetTimer() {
    stopTicking();
    if (timer.mode === "rest") timer.remaining = timer.duration;
    else timer.elapsed = 0;
    renderTimer();
  }

  function setTimerMode(mode) {
    if (!["rest", "stop"].includes(mode)) return;
    stopTicking();
    timer.mode = mode;
    timer.remaining = timer.duration;
    timer.elapsed = 0;
    $$(".seg[data-timer-mode]").forEach((b) => {
      const active = b.dataset.timerMode === mode;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    renderTimer();
  }

  function setTimerPreset(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    stopTicking();
    timer.preset = seconds;
    timer.duration = seconds;
    timer.remaining = seconds;
    renderTimer();
  }

  function bindTimer() {
    $("#timerStart").addEventListener("click", toggleTimer);
    $("#timerReset").addEventListener("click", resetTimer);
    $$(".seg[data-timer-mode]").forEach((b) =>
      b.addEventListener("click", () => setTimerMode(b.dataset.timerMode))
    );
    $("#timerPresets").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-preset]");
      if (btn) setTimerPreset(Number(btn.dataset.preset));
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && timer.running) requestWakeLock();
    });
  }

  // ---------- Comida: resumo e diário ----------
  function dayMeals(key = todayKey()) {
    return state.meals[key] || [];
  }

  function totalsFor(key = todayKey()) {
    return dayMeals(key).reduce(
      (acc, m) => {
        acc.kcal += Number(m.kcal) || 0;
        acc.protein += Number(m.protein) || 0;
        acc.carbs += Number(m.carbs) || 0;
        acc.fat += Number(m.fat) || 0;
        acc.grams += Number(m.grams) || 0;
        return acc;
      },
      { kcal: 0, protein: 0, carbs: 0, fat: 0, grams: 0 }
    );
  }

  function renderDaySummary() {
    const t = totalsFor();
    const s = state.settings;
    const goal = Number(s.kcalGoal) || 1800;
    const pct = Math.min((t.kcal / goal) * 100, 100);
    const over = t.kcal > goal;
    const ring = $("#daySummary");
    ring.innerHTML = `
      <div class="kcal-ring${over ? " is-over" : ""}" style="--p:${pct.toFixed(1)}">
        <div class="kcal-ring-inner"><strong>${fmtNum(t.kcal)}</strong><span>kcal hoje</span></div>
      </div>
      <div class="day-info">
        <h3>${over ? "Meta passou" : "Meta do dia"}</h3>
        <p><strong>${fmtNum(over ? t.kcal - goal : goal - t.kcal)} kcal</strong> ${over ? "acima da meta" : "restantes"} · meta ${fmtNum(goal)} kcal</p>
        <div class="macro-bars">
          ${macroBar("Proteína", t.protein, s.proteinGoal, "p")}
          ${macroBar("Carbo", t.carbs, s.carbsGoal, "c")}
          ${macroBar("Gordura", t.fat, s.fatGoal, "f")}
        </div>
        <p class="muted small" style="margin-top:10px">${fmtNum(t.grams)} g de comida registradas em ${dayMeals().length} refeição(ões).</p>
      </div>`;
  }

  function macroBar(label, value, goal, cls) {
    const g = Number(goal) || 1;
    const pct = Math.min((value / g) * 100, 100);
    return `<div>
      <div class="macro-bar-top"><span>${label}</span><b>${fmtNum(value)}/${fmtNum(g)}g</b></div>
      <div class="macro-bar ${cls}"><i style="width:${pct}%"></i></div>
    </div>`;
  }

  function renderMeals() {
    const list = $("#mealList");
    const meals = dayMeals();
    $("#mealCount").textContent = String(meals.length);
    $("#mealEmpty").hidden = meals.length > 0;
    list.innerHTML = meals
      .map(
        (m) => `<li class="meal-item" data-id="${esc(m.id)}">
          <span class="meal-time">${esc(m.time || "--:--")}</span>
          <div class="meal-info">
            <strong>${esc(m.name)}${m.source === "ia" ? '<span class="badge-ia">IA</span>' : ""}</strong>
            <span>${m.grams ? `≈ ${fmtGrams(m.grams)} g · ` : ""}P ${fmtNum(m.protein)}g · C ${fmtNum(m.carbs)}g · G ${fmtNum(m.fat)}g</span>
          </div>
          <span class="meal-kcal">${fmtNum(m.kcal)}<small>kcal</small></span>
          <button class="icon-btn" data-delete-meal="${esc(m.id)}" aria-label="Remover ${esc(m.name)}">${icon("i-trash")}</button>
        </li>`
      )
      .join("");
  }

  function renderFood() {
    $("#todayLabel").textContent = `Hoje, ${longDate()}`;
    renderDaySummary();
    renderMeals();
  }

  function addMeal(meal) {
    const key = todayKey();
    state.meals[key] = state.meals[key] || [];
    state.meals[key].push(meal);
    saveState();
    renderFood();
  }

  // ---------- Análise por IA ----------
  function showAnalysisError(message, withSettings = false) {
    const box = $("#analysisError");
    box.hidden = false;
    box.innerHTML = `${esc(message)}${withSettings ? ' <button class="btn btn-sm btn-ghost" data-open-settings style="margin-top:8px">Abrir ajustes</button>' : ""}`;
  }

  function clearAnalysisError() {
    const box = $("#analysisError");
    box.hidden = true;
    box.innerHTML = "";
  }

  function setAnalyzing(on, label = "Analisando o prato…") {
    analyzing = on;
    const overlay = $("#previewOverlay");
    overlay.classList.toggle("is-active", on);
    overlay.innerHTML = on
      ? `<div class="spinner"></div><strong>${esc(label)}</strong><span>Estimando porções e calorias</span>`
      : "";
    const btn = $("#analyzeBtn");
    btn.classList.toggle("is-loading", on);
    btn.disabled = on;
    $("#retryBtn") && ($("#retryBtn").disabled = on);
  }

  function resetAnalyzer(keepPhoto = false) {
    clearAnalysisError();
    if (!keepPhoto) {
      currentPhoto = null;
      currentAnalysis = null;
      $("#previewImg").removeAttribute("src");
      $("#captureEmpty").hidden = false;
      $("#capturePreview").hidden = true;
      $("#analyzeActions").hidden = true;
      $("#resultCard").hidden = true;
      $("#cameraInput").value = "";
      $("#galleryInput").value = "";
    }
  }

  async function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)) {
      toast("Escolha um arquivo de imagem (JPG, PNG…).", true);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast("Imagem muito grande. Use uma foto menor que 25 MB.", true);
      return;
    }
    try {
      const dataUrl = await compressImage(file, 1100, 0.86);
      currentPhoto = { dataUrl };
      currentAnalysis = null;
      $("#previewImg").src = dataUrl;
      $("#captureEmpty").hidden = true;
      $("#capturePreview").hidden = false;
      $("#resultCard").hidden = true;
      $("#analyzeActions").hidden = false;
      clearAnalysisError();
      if (state.settings.apiKey) {
        analyzePhoto();
      }
    } catch (err) {
      console.error(err);
      toast("Não consegui abrir essa imagem. Tente uma foto JPG ou PNG.", true);
    }
  }

  function compressImage(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          const scale = Math.min(1, maxSide / Math.max(width, height));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#0b0606";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) {
          reject(e);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("image decode"));
      };
      img.src = url;
    });
  }

  async function callGemini(model, apiKey, dataUrl) {
    const base64 = dataUrl.split(",")[1];
    const prompt = `Você é um nutricionista brasileiro especialista em estimar porções por foto.

Analise a imagem de uma refeição e estime a quantidade de comida que está no prato.

Regras:
- Considere pratos, talheres, copos, mãos e embalagens como referência de escala.
- Liste cada alimento separadamente (ex.: arroz, feijão, frango grelhado, salada).
- Informe o peso estimado em gramas do alimento pronto para consumo (sem casca, osso ou caroço).
- Some os itens para obter o total em gramas do prato.
- Calcule calorias e macronutrientes (proteína, carboidrato e gordura) usando valores típicos de tabelas brasileiras (TACO/USDA).
- Considere porções típicas do Brasil e seja realista, nem pessimista nem otimista.
- Arredonde gramas para múltiplos de 5 e calorias para números inteiros.
- Se houver bebida, inclua como item.
- Se a imagem não mostrar comida, retorne total_grams 0, calories 0, itens vazios e explique em notes.
- Responda APENAS com JSON válido, sem markdown.`;

    const schema = {
      type: "OBJECT",
      properties: {
        dish: { type: "STRING", description: "Descrição curta da refeição em português" },
        total_grams: { type: "NUMBER" },
        calories: { type: "NUMBER" },
        protein_g: { type: "NUMBER" },
        carbs_g: { type: "NUMBER" },
        fat_g: { type: "NUMBER" },
        confidence: { type: "NUMBER", description: "Confiança da estimativa de 0 a 1" },
        items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              grams: { type: "NUMBER" },
              calories: { type: "NUMBER" },
            },
            required: ["name", "grams", "calories"],
          },
        },
        notes: { type: "STRING" },
      },
      required: ["dish", "total_grams", "calories", "protein_g", "carbs_g", "fat_g", "items", "notes"],
    };

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    let res;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }
      );
    } catch (err) {
      if (err.name === "AbortError") {
        const e = new Error("A análise demorou demais. Verifique a conexão e tente novamente.");
        e.status = 0;
        throw e;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let detail = "";
      try {
        const err = await res.json();
        detail = err?.error?.message || "";
      } catch { /* ignore */ }
      const e = new Error(detail || `HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.filter((p) => !p.thought).map((p) => p.text || "").join("").trim();
    if (!text) {
      const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || "vazio";
      throw new Error(`A IA não retornou resultado (${reason}). Tente outra foto.`);
    }
    const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      const first = clean.indexOf("{");
      const last = clean.lastIndexOf("}");
      if (first >= 0 && last > first) parsed = JSON.parse(clean.slice(first, last + 1));
      else throw new Error("Resposta da IA em formato inesperado. Tente novamente.");
    }
    parsed.total_grams = Number(parsed.total_grams) || 0;
    parsed.calories = Number(parsed.calories) || 0;
    parsed.protein_g = Number(parsed.protein_g) || 0;
    parsed.carbs_g = Number(parsed.carbs_g) || 0;
    parsed.fat_g = Number(parsed.fat_g) || 0;
    parsed.items = Array.isArray(parsed.items) ? parsed.items : [];
    return parsed;
  }

  async function analyzePhoto() {
    if (analyzing || !currentPhoto) return;
    const apiKey = (state.settings.apiKey || "").trim();
    if (!apiKey) {
      showAnalysisError("Cole sua chave do Google Gemini nos ajustes para analisar a foto. É gratuita e leva 1 minuto.", true);
      toast("Falta configurar a chave da IA.", true);
      return;
    }

    clearAnalysisError();
    setAnalyzing(true);
    $("#resultCard").hidden = true;

    const custom = (state.settings.model || "").trim();
    const models = custom ? [custom] : MODEL_CHAIN;
    let lastError = null;

    for (const model of models) {
      try {
        const result = await callGemini(model, apiKey, currentPhoto.dataUrl);
        currentAnalysis = result;
        setAnalyzing(false);
        renderAnalysis(result);
        toast("Prato analisado!");
        return;
      } catch (err) {
        lastError = err;
        console.warn("Falha no modelo", model, err.message);
        const retryable = err.status === 404 || /not found|not supported|does not exist|unknown model/i.test(err.message);
        if (!retryable) break;
      }
    }

    setAnalyzing(false);
    let msg = lastError?.message || "Não foi possível analisar agora.";
    let withSettings = false;
    if (lastError?.status === 400 && /api key|API_KEY_INVALID/i.test(msg)) {
      msg = "Chave da API inválida. Confira a chave nos ajustes.";
      withSettings = true;
    } else if (lastError?.status === 403) {
      msg = "A chave não tem permissão para usar este modelo. Gere outra chave no Google AI Studio.";
      withSettings = true;
    } else if (lastError?.status === 429) {
      msg = "Limite gratuito da IA atingido por agora. Aguarde um pouco e tente de novo (a cota diária renovada ou use outra chave).";
    } else if (lastError?.status === 404) {
      msg = "Nenhum modelo de visão disponível com essa chave. Defina um modelo nos ajustes, por exemplo gemini-2.5-flash.";
      withSettings = true;
    } else if (/Failed to fetch|NetworkError|fetch/i.test(msg)) {
      msg = "Sem conexão com o Google Gemini. Verifique sua internet e tente novamente.";
    }
    showAnalysisError(msg, withSettings);
  }

  function renderAnalysis(a) {
    $("#resultCard").hidden = false;
    $("#resDish").textContent = a.dish || "Refeição";
    $("#resNotes").textContent = a.notes || "Estimativa aproximada baseada na foto. Ajuste as gramas se necessário.";
    $("#resNotes").hidden = !a.notes;

    const itemHtml = a.items
      .map(
        (it) => `<li><span>${esc(it.name)}</span><b>≈ ${fmtGrams(it.grams)} g · ${fmtNum(it.calories)} kcal</b></li>`
      )
      .join("");
    $("#resItems").innerHTML = itemHtml || "<li><span>Nenhum item identificado.</span></li>";

    const grams = Math.max(0, Math.round(a.total_grams));
    $("#resGrams").value = grams;
    paintAnalysisValues(grams);

    $("#resultCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function paintAnalysisValues(grams) {
    if (!currentAnalysis) return;
    const baseGrams = currentAnalysis.total_grams || 0;
    const factor = baseGrams > 0 ? Number(grams) / baseGrams : 0;
    $("#resKcal").textContent = fmtNum((currentAnalysis.calories || 0) * factor);
    $("#resMacros").innerHTML = [
      ["Proteína", (currentAnalysis.protein_g || 0) * factor, "g", "#ff4d1f"],
      ["Carboidrato", (currentAnalysis.carbs_g || 0) * factor, "g", "#e0a316"],
      ["Gordura", (currentAnalysis.fat_g || 0) * factor, "g", "#b03a2e"],
    ]
      .map(
        ([label, value, unit]) => `<div class="macro-box">
          <span>${label}</span>
          <strong>${fmtNum(value)}<small>${unit}</small></strong>
        </div>`
      )
      .join("");
  }

  function addAnalysisToDiary() {
    if (!currentAnalysis) return;
    const grams = Math.max(0, Number($("#resGrams").value) || 0);
    const base = currentAnalysis.total_grams || 0;
    const factor = base > 0 ? grams / base : 0;
    if (grams <= 0) {
      toast("Informe as gramas antes de adicionar.", true);
      return;
    }
    const now = new Date();
    addMeal({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name: currentAnalysis.dish || "Refeição",
      grams,
      kcal: Math.round((currentAnalysis.calories || 0) * factor),
      protein: Math.round((currentAnalysis.protein_g || 0) * factor),
      carbs: Math.round((currentAnalysis.carbs_g || 0) * factor),
      fat: Math.round((currentAnalysis.fat_g || 0) * factor),
      items: currentAnalysis.items,
      time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      source: "ia",
    });
    resetAnalyzer();
    toast("Refeição adicionada ao diário.");
    renderFood();
  }

  // ---------- Progresso ----------
  function weekCompletion(mondayDate) {
    let n = 0;
    WORKOUTS.forEach((w) => {
      const doneThisWeek = [0, 1, 2, 3, 4, 5, 6].some((i) =>
        isCardDone(ymd(addDays(mondayDate, i)), w.id)
      );
      if (doneThisWeek) n++;
    });
    return n;
  }

  function currentStreak() {
    let cursor = startOfWeek();
    if (weekCompletion(cursor) < 3) cursor = addDays(cursor, -7);
    let streak = 0;
    while (streak < 104 && weekCompletion(cursor) === 3) {
      streak++;
      cursor = addDays(cursor, -7);
    }
    return streak;
  }

  function avgKcal7days() {
    let sum = 0;
    let days = 0;
    for (let i = 0; i < 7; i++) {
      const key = ymd(addDays(new Date(), -i));
      const meals = state.meals[key] || [];
      if (meals.length) {
        sum += meals.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
        days++;
      }
    }
    return days ? Math.round(sum / days) : null;
  }

  function sortedWeights() {
    return [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderProgress() {
    const week = weekCompletion(startOfWeek());
    const streak = currentStreak();
    const avg = avgKcal7days();
    const weights = sortedWeights();
    const last = weights[weights.length - 1];
    const goal = state.settings.weightGoal;

    $("#progressStats").innerHTML = `
      <div class="stat"><span>Treinos na semana</span><strong>${week}<em>/3</em></strong><small>${week === 3 ? "semana fechada 🔥" : "faltam " + (3 - week)}</small></div>
      <div class="stat"><span>Sequência</span><strong class="accent">${streak}</strong><small>semana(s) completas</small></div>
      <div class="stat"><span>Média kcal (7d)</span><strong>${avg === null ? "—" : fmtNum(avg)}</strong><small>${avg === null ? "registre refeições" : "média por dia registrado"}</small></div>
      <div class="stat"><span>Peso atual</span><strong>${last ? last.kg.toLocaleString("pt-BR") : "—"}${last ? "<em> kg</em>" : ""}</strong><small>${goal ? "meta " + Number(goal).toLocaleString("pt-BR") + " kg" : "defina uma meta"}</small></div>`;

    const weightList = $("#weightList");
    const recent = [...weights].reverse().slice(0, 8);
    $("#weightEmpty").hidden = weights.length > 0;
    weightList.innerHTML = recent
      .map(
        (w) => `<li>
          <span class="w-date">${esc(shortDate(parseYmd(w.date)))}${w.date === ymd() ? " · hoje" : ""}</span>
          <span class="w-kg">${Number(w.kg).toLocaleString("pt-BR")} kg</span>
          <button class="icon-btn" data-del-weight="${esc(w.date)}" aria-label="Remover peso de ${esc(w.date)}">${icon("i-trash")}</button>
        </li>`
      )
      .join("");

    const s = state.settings;
    $("#goalList").innerHTML = `
      <div class="goal-item"><span>Calorias</span><strong>${fmtNum(s.kcalGoal)} kcal</strong></div>
      <div class="goal-item"><span>Proteína</span><strong>${fmtNum(s.proteinGoal)} g</strong></div>
      <div class="goal-item"><span>Carboidrato</span><strong>${fmtNum(s.carbsGoal)} g</strong></div>
      <div class="goal-item"><span>Gordura</span><strong>${fmtNum(s.fatGoal)} g</strong></div>`;

    renderWeightChart(weights);
    updateInstallUI();
  }

  function renderWeightChart(weights) {
    const wrap = $("#weightChart");
    const cutoff = addDays(new Date(), -30).getTime();
    const data = weights.filter((w) => parseYmd(w.date).getTime() >= cutoff);
    if (data.length === 0) {
      wrap.innerHTML = `<div class="chart-empty">Registre seu peso para ver a evolução.</div>`;
      return;
    }
    const W = 600;
    const H = 190;
    const padX = 38;
    const padTop = 24;
    const padBottom = 34;
    const values = data.map((d) => Number(d.kg));
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const times = data.map((d) => parseYmd(d.date).getTime());
    let t0 = times[0];
    let t1 = times[times.length - 1];
    if (t0 === t1) { t0 -= DAY_MS; t1 += DAY_MS; }

    const x = (t) => padX + ((t - t0) / (t1 - t0)) * (W - padX * 2);
    const y = (v) => padTop + (1 - (v - min) / span) * (H - padTop - padBottom);
    const pts = data.map((d, i) => ({ x: x(times[i]), y: y(values[i]), v: values[i], date: d.date }));

    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${H - padBottom} L${pts[0].x.toFixed(1)},${H - padBottom} Z`;
    const last = pts[pts.length - 1];

    const grid = [min, (min + max) / 2, max]
      .map((v) => `<line x1="${padX}" x2="${W - padX}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.07)" stroke-dasharray="3 5"/>
        <text x="0" y="${y(v) + 4}" fill="#8f7773" font-size="11" font-family="Inter, sans-serif">${v.toFixed(1).replace(".", ",")}</text>`)
      .join("");

    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de evolução do peso">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ff7a18" stop-opacity=".32"/>
          <stop offset="100%" stop-color="#ff7a18" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ff3b30"/>
          <stop offset="100%" stop-color="#ffb347"/>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${area}" fill="url(#areaGrad)"/>
      <path d="${line}" fill="none" stroke="url(#lineGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last.x}" cy="${last.y}" r="6" fill="#ffb347" stroke="#150a0c" stroke-width="3"/>
      <text x="${last.x - 8}" y="${last.y - 12}" fill="#f8eeec" font-size="12" font-weight="700" text-anchor="end" font-family="Inter, sans-serif">${last.v.toLocaleString("pt-BR")} kg</text>
      <text x="${padX}" y="${H - 8}" fill="#8f7773" font-size="11" font-family="Inter, sans-serif">${esc(shortDate(parseYmd(data[0].date)))}</text>
      <text x="${W - padX}" y="${H - 8}" fill="#8f7773" font-size="11" text-anchor="end" font-family="Inter, sans-serif">${esc(shortDate(parseYmd(data[data.length - 1].date)))}</text>
    </svg>`;
  }

  function openWeightDialog() {
    const current = sortedWeights().find((w) => w.date === ymd());
    $("#weightInput").value = current ? current.kg : "";
    $("#weightDialog").showModal();
  }

  function saveWeight(kg) {
    const date = ymd();
    state.weights = state.weights.filter((w) => w.date !== date);
    state.weights.push({ date, kg });
    saveState();
    renderProgress();
    toast("Peso registrado.");
  }

  // ---------- Ajustes ----------
  function populateSettings() {
    const s = state.settings;
    $("#apiKey").value = s.apiKey || "";
    $("#modelName").value = s.model || "";
    $("#kcalGoal").value = s.kcalGoal;
    $("#proteinGoal").value = s.proteinGoal;
    $("#carbsGoal").value = s.carbsGoal;
    $("#fatGoal").value = s.fatGoal;
    $("#weightGoal").value = s.weightGoal || "";
  }

  function saveSettings() {
    state.settings = {
      ...state.settings,
      apiKey: $("#apiKey").value.trim(),
      model: $("#modelName").value.trim(),
      kcalGoal: clampNum($("#kcalGoal").value, 800, 6000, 1800),
      proteinGoal: clampNum($("#proteinGoal").value, 20, 400, 130),
      carbsGoal: clampNum($("#carbsGoal").value, 20, 900, 180),
      fatGoal: clampNum($("#fatGoal").value, 10, 300, 60),
      weightGoal: $("#weightGoal").value ? clampNum($("#weightGoal").value, 30, 300, null) : null,
    };
    saveState();
    renderDaySummary();
    renderProgress();
    toast("Ajustes salvos.");
  }

  function clampNum(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  // ---------- PWA ----------
  function updateInstallUI() {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const btn = $("#installBtn");
    const hint = $("#installHint");
    if (!btn) return;
    if (standalone) {
      btn.disabled = true;
      btn.innerHTML = `${icon("i-check")} App instalado`;
      hint.textContent = "Você já está usando o app instalado. 🔥";
    } else if (deferredPrompt) {
      btn.disabled = false;
      btn.innerHTML = `${icon("i-download")} Instalar aplicativo`;
      hint.textContent = "Um toque para adicionar à tela inicial.";
    } else {
      btn.disabled = false;
      btn.innerHTML = `${icon("i-download")} Como instalar`;
      hint.textContent = "No iPhone, use Compartilhar → Adicionar à Tela de Início.";
    }
  }

  function openInstallDialog() {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const box = $("#installInstructions");
    if (standalone) {
      box.innerHTML = `<p>O app já está instalado neste aparelho. Abra pelo ícone na tela inicial.</p>`;
    } else if (isIOS) {
      box.innerHTML = `<p>No iPhone ou iPad, pelo Safari:</p>
        <ol>
          <li>Toque no botão <strong>Compartilhar</strong> (quadrado com seta).</li>
          <li>Deslize e toque em <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Confirme em <strong>Adicionar</strong>.</li>
        </ol>
        <p style="margin-top:12px">Depois abra pelo ícone <strong>Perda de Peso</strong>.</p>`;
    } else {
      box.innerHTML = `<p>No Android (Chrome) ou no computador:</p>
        <ol>
          <li>Abra o menu do navegador (três pontos ou ícone de instalar).</li>
          <li>Toque em <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
          <li>Confirme.</li>
        </ol>
        <p style="margin-top:12px">Se o navegador oferecer a instalação automaticamente, use o botão na barra de endereço.</p>`;
    }
    $("#installDialog").showModal();
  }

  // ---------- Ligações de eventos ----------
  function bind() {
    $$(".tab[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => showView(btn.dataset.view));
    });

    $("#workoutList").addEventListener("click", (e) => {
      const el = e.target.closest("[data-workout][data-index]");
      if (!el) return;
      toggleExercise(el.dataset.workout, Number(el.dataset.index));
    });

    // Arquivos
    $("#cameraInput").addEventListener("change", (e) => handleFile(e.target.files[0]));
    $("#galleryInput").addEventListener("change", (e) => handleFile(e.target.files[0]));
    $("#clearPhoto").addEventListener("click", () => resetAnalyzer());
    $("#analyzeBtn").addEventListener("click", analyzePhoto);
    $("#retryBtn").addEventListener("click", analyzePhoto);
    $("#addMealBtn").addEventListener("click", addAnalysisToDiary);
    $("#discardResult").addEventListener("click", () => {
      $("#resultCard").hidden = true;
      currentAnalysis = null;
    });
    $("#resGrams").addEventListener("input", (e) => paintAnalysisValues(e.target.value));

    // Diário
    $("#mealList").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-delete-meal]");
      if (!btn) return;
      const key = todayKey();
      state.meals[key] = (state.meals[key] || []).filter((m) => m.id !== btn.dataset.deleteMeal);
      saveState();
      renderFood();
      toast("Refeição removida.");
    });

    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-open-settings]")) {
        populateSettings();
        $("#settingsDialog").showModal();
      }
    });

    $("#openManual").addEventListener("click", () => {
      $("#manualForm").reset();
      $("#manualDialog").showModal();
    });

    $("#manualForm").addEventListener("submit", (e) => {
      e.preventDefault();
      if (e.submitter && e.submitter.value === "cancel") {
        $("#manualDialog").close();
        return;
      }
      const name = $("#mName").value.trim();
      const kcal = Number($("#mKcal").value);
      if (!name || !Number.isFinite(kcal)) {
        toast("Informe o nome e as calorias.", true);
        return;
      }
      const now = new Date();
      addMeal({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        name,
        grams: Math.max(0, Number($("#mGrams").value) || 0),
        kcal: Math.round(kcal),
        protein: Math.max(0, Number($("#mProtein").value) || 0),
        carbs: Math.max(0, Number($("#mCarbs").value) || 0),
        fat: Math.max(0, Number($("#mFat").value) || 0),
        time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        source: "manual",
      });
      $("#manualDialog").close();
      toast("Refeição adicionada.");
    });

    // Peso
    $("#openWeight").addEventListener("click", openWeightDialog);
    $("#weightForm").addEventListener("submit", (e) => {
      e.preventDefault();
      if (e.submitter && e.submitter.value === "cancel") {
        $("#weightDialog").close();
        return;
      }
      const kg = Number($("#weightInput").value);
      if (!Number.isFinite(kg) || kg < 30 || kg > 300) {
        toast("Informe um peso válido.", true);
        return;
      }
      saveWeight(kg);
      $("#weightDialog").close();
    });
    $("#weightList").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-del-weight]");
      if (!btn) return;
      state.weights = state.weights.filter((w) => w.date !== btn.dataset.delWeight);
      saveState();
      renderProgress();
      toast("Registro removido.");
    });

    // Ajustes
    $("#openSettings").addEventListener("click", () => {
      populateSettings();
      $("#settingsDialog").showModal();
    });
    $("#openGoals").addEventListener("click", () => {
      populateSettings();
      $("#settingsDialog").showModal();
    });
    $("#settingsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      if (e.submitter && e.submitter.value === "cancel") {
        $("#settingsDialog").close();
        return;
      }
      saveSettings();
      $("#settingsDialog").close();
    });
    $("#clearData").addEventListener("click", () => {
      if (!confirm("Apagar todos os treinos, refeições, pesos e a chave da IA? Isso não pode ser desfeito.")) return;
      localStorage.removeItem(STORAGE_KEY);
      state = defaultState();
      location.reload();
    });

    // Instalação
    $("#installBtn").addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null;
        updateInstallUI();
        if (choice.outcome === "accepted") toast("App instalado!");
      } else {
        openInstallDialog();
      }
    });
    $("#closeInstall").addEventListener("click", () => $("#installDialog").close());

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      updateInstallUI();
    });
    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      updateInstallUI();
      toast("App instalado com sucesso!");
    });

    // Fechar diálogos ao clicar fora
    $$("dialog.dlg").forEach((dlg) => {
      dlg.addEventListener("click", (e) => {
        if (e.target === dlg) dlg.close();
      });
    });
  }

  // ---------- Boot ----------
  function init() {
    renderTodayBanner();
    renderWeek();
    renderWorkouts();
    renderTimer();
    renderFood();
    renderProgress();
    updateInstallUI();
    bind();
    bindTimer();
    const requestedView = new URLSearchParams(window.location.search).get("view");
    showView(requestedView || state.lastView || "treino", false);

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("./sw.js", { updateViaCache: "none" })
          .catch((err) => console.warn("SW:", err));
      });
    }
    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }
  }

  init();
})();
