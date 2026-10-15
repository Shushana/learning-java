import { BOTS, configure, newRound, judge, chat } from "./ai.js";
import { speak, stopSpeaking, unlockAudio, canListen, listen, similarity } from "./speech.js";

const $ = (id) => document.getElementById(id);
const PLAYERS = ["Toi", ...BOTS.map((b) => b.name)];
const botOf = (name) => BOTS.find((b) => b.name === name);

// ---------- settings ----------
const DEFAULTS = { apiKey: "", model: "claude-opus-5-5", level: "A2", timer: 60, rate: 0.85, botVoice: true, autoEn: false };
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("juge.settings") || "{}") }; }
  catch { return { ...DEFAULTS }; }
}
let settings = loadSettings();
function saveSettings() {
  try { localStorage.setItem("juge.settings", JSON.stringify(settings)); } catch {}
  configure(settings);
}
configure(settings);

function openSettings() {
  $("set-key").value = settings.apiKey;
  $("set-model").value = settings.model;
  $("set-level").value = settings.level;
  $("set-timer").value = String(settings.timer);
  $("set-rate").value = String(settings.rate);
  $("set-botvoice").checked = settings.botVoice;
  $("set-autoen").checked = settings.autoEn;
  $("settings").showModal();
}
$("settings").addEventListener("close", () => {
  settings = {
    apiKey: $("set-key").value.trim(),
    model: $("set-model").value,
    level: $("set-level").value,
    timer: Number($("set-timer").value),
    rate: Number($("set-rate").value),
    botVoice: $("set-botvoice").checked,
    autoEn: $("set-autoen").checked,
  };
  saveSettings();
});
$("btn-settings").onclick = openSettings;

// ---------- helpers ----------
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 5000);
}
function show(screen) {
  for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== `screen-${screen}`;
  $("chat").hidden = screen === "round";
  window.scrollTo(0, 0);
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function wordsInto(container, words) {
  container.replaceChildren(
    ...(words || []).map((w) => {
      const s = el("span");
      s.append(el("b", null, w.fr), ` ${w.en}`);
      return s;
    })
  );
}
async function judgeSays(text, rate = settings.rate) {
  document.querySelectorAll(".drum").forEach((d) => d.classList.add("talking"));
  await speak(text, { rate, voiceIndex: 0 });
  document.querySelectorAll(".drum").forEach((d) => d.classList.remove("talking"));
}
function botSays(name, text) {
  if (!settings.botVoice) return Promise.resolve();
  const i = BOTS.findIndex((b) => b.name === name);
  return speak(text, { rate: settings.rate + 0.05, pitch: botOf(name)?.pitch ?? 1, voiceIndex: i + 1 });
}

// ---------- chat ----------
const chatHistory = [];
function addMsg(from, text, cls = "") {
  const log = $("chat-log");
  const m = el("div", `msg ${cls || (from === "Toi" ? "me" : "")}`);
  if (from !== "Toi" && cls !== "sys") {
    const b = botOf(from);
    m.append(el("span", "from", `${b ? b.emoji + " " : ""}${from}`));
  }
  m.append(text);
  log.append(m);
  log.scrollTop = log.scrollHeight;
  if (cls !== "sys" && cls !== "typing") chatHistory.push({ from, text });
  return m;
}
let chatBusy = false;
async function sendChat() {
  const input = $("chat-input");
  const text = input.value.trim();
  if (!text || chatBusy) return;
  unlockAudio();
  input.value = "";
  addMsg("Toi", text);
  chatBusy = true;
  const typing = addMsg("", "Les bots écrivent…", "typing sys");
  try {
    const res = await chat(chatHistory);
    typing.remove();
    for (const r of res.replies) {
      addMsg(r.bot, r.text);
      await botSays(r.bot, r.text);
    }
    if (res.hint_en) addMsg("", `💡 ${res.hint_en}`, "sys");
  } catch (e) {
    typing.remove();
    toast(e.message);
  } finally {
    chatBusy = false;
  }
}
$("btn-chat-send").onclick = sendChat;
$("chat-input").addEventListener("keydown", (e) => e.key === "Enter" && sendChat());

// ---------- microphone ----------
function micButton(button, getBase, setText, note) {
  let stop = null;
  button.onclick = () => {
    if (!canListen) {
      if (note) { note.hidden = false; note.textContent = "Voice input isn't available here. Tap the text box and use the 🎤 on the iPhone keyboard instead."; }
      else toast("Use the 🎤 on the iPhone keyboard.");
      return;
    }
    if (stop) { stop(); return; }
    stopSpeaking();
    const base = getBase();
    button.classList.add("on");
    try {
      stop = listen(
        (t) => setText((base ? base + " " : "") + t),
        (err) => {
          button.classList.remove("on");
          stop = null;
          if (err && err !== "no-speech" && err !== "aborted") toast(`Micro : ${err}. Autorise le micro pour Safari.`);
        }
      );
    } catch (e) {
      button.classList.remove("on");
      stop = null;
      toast(e.message);
    }
  };
  return () => stop && stop();
}
let usedMic = false;
const stopAnswerMic = micButton(
  $("btn-mic"),
  () => $("answer").value.trim(),
  (t) => { $("answer").value = t; usedMic = true; },
  $("mic-note")
);
micButton($("btn-chat-mic"), () => $("chat-input").value.trim(), (t) => ($("chat-input").value = t));

// ---------- game ----------
let game = null;
let round = null;
let timer = null;

function recentScenarios() {
  try { return JSON.parse(localStorage.getItem("juge.recent") || "[]"); } catch { return []; }
}
function rememberScenario(s) {
  const r = [s, ...recentScenarios()].slice(0, 15);
  try { localStorage.setItem("juge.recent", JSON.stringify(r)); } catch {}
}

function renderScorebar() {
  const bar = $("scorebar");
  if (!game) return bar.replaceChildren();
  bar.replaceChildren(...PLAYERS.map((p) => el("span", null, `${p === "Toi" ? "🙂" : botOf(p).emoji} ${game.scores[p]}`)));
}

$("btn-play").onclick = () => {
  if (!settings.apiKey) return openSettings();
  unlockAudio();
  game = {
    n: 0,
    total: Number($("rounds-count").value),
    scores: Object.fromEntries(PLAYERS.map((p) => [p, 0])),
    firstKind: Math.random() < 0.5 ? "absurd" : "real",
  };
  renderScorebar();
  startRound();
};
$("btn-next").onclick = () => {
  unlockAudio();
  if (game.n >= game.total) finishGame();
  else startRound();
};
$("btn-again").onclick = () => $("btn-play").onclick();

async function startRound() {
  stopSpeaking();
  game.n++;
  const kind = (game.n % 2 === 1) === (game.firstKind === "absurd") ? "absurd" : "real";
  show("round");
  $("round-label").textContent = `Manche ${game.n}/${game.total}`;
  $("round-kind").textContent = kind === "absurd" ? "🐉 Absurde" : "☕ Vie réelle";
  $("scenario").replaceChildren(el("span", "spinner", "Le Juge réfléchit"));
  $("scenario-en").hidden = true;
  $("useful-words").replaceChildren();
  $("answer").value = "";
  $("answer").disabled = true;
  $("btn-submit").disabled = true;
  $("mic-note").hidden = true;
  usedMic = false;
  setTimer(1);
  renderPlayers({});

  try {
    const r = await newRound(kind, recentScenarios());
    round = { ...r, kind };
  } catch (e) {
    toast(e.message);
    game.n--;
    show("lobby");
    return;
  }
  rememberScenario(round.scenario_fr);
  $("scenario").textContent = round.scenario_fr;
  $("scenario-en").textContent = round.scenario_en;
  $("scenario-en").hidden = !settings.autoEn;
  wordsInto($("useful-words"), round.useful_words);
  $("answer").disabled = false;
  $("btn-submit").disabled = false;

  await judgeSays(round.scenario_fr);
  if (round !== null && !round.submitted) startTimer();
}

function renderPlayers(done) {
  $("players").replaceChildren(
    ...PLAYERS.map((p) => el("span", null, `${p === "Toi" ? "🙂" : botOf(p).emoji} ${p} ${done[p] ? "✅" : "✍️"}`))
  );
}

function setTimer(frac) {
  const bar = $("timer-bar");
  bar.style.width = `${Math.max(0, frac) * 100}%`;
  bar.classList.toggle("low", frac < 0.25);
}
function startTimer() {
  clearInterval(timer);
  const total = settings.timer;
  // Bots "finish" at random moments so it feels like a live game.
  const done = {};
  const botTimes = BOTS.map((b) => [b.name, 5 + Math.random() * ((total || 40) * 0.7)]);
  const start = Date.now();
  timer = setInterval(() => {
    const t = (Date.now() - start) / 1000;
    for (const [name, at] of botTimes) if (t >= at) done[name] = true;
    renderPlayers(done);
    if (total) {
      setTimer(1 - t / total);
      if (t >= total) submit(true);
    }
  }, 500);
}

$("btn-repeat").onclick = () => round && judgeSays(round.scenario_fr);
$("btn-slow").onclick = () => round && judgeSays(round.scenario_fr, 0.6);
$("btn-en").onclick = () => ($("scenario-en").hidden = !$("scenario-en").hidden);
$("btn-submit").onclick = () => submit(false);

async function submit(timeUp) {
  if (!round || round.submitted) return;
  round.submitted = true;
  clearInterval(timer);
  stopAnswerMic();
  stopSpeaking();
  const answer = $("answer").value.trim();
  $("answer").disabled = true;
  $("btn-submit").disabled = true;
  renderPlayers(Object.fromEntries(PLAYERS.map((p) => [p, true])));
  $("btn-submit").replaceChildren(el("span", "spinner", timeUp ? "Temps écoulé ! Le Juge juge" : "Le Juge juge"));

  let res;
  try {
    res = await judge(round.scenario_fr, answer || "(pas de réponse)", round.bot_answers, usedMic);
  } catch (e) {
    toast(e.message);
    round.submitted = false;
    $("answer").disabled = false;
    $("btn-submit").disabled = false;
    $("btn-submit").textContent = "Envoyer ✓";
    return;
  }
  $("btn-submit").textContent = "Envoyer ✓";
  showResults(answer, res);
}

function showResults(answer, res) {
  show("results");
  const answers = { Toi: answer || "—", ...Object.fromEntries(round.bot_answers.map((b) => [b.bot, b.answer])) };

  for (const r of res.results) if (r.player in game.scores) game.scores[r.player] += r.idea + r.french;
  renderScorebar();

  $("verdict").textContent = res.verdict_fr;
  $("results-table").replaceChildren(
    ...res.results.map((r) => {
      const d = el("div", `result ${r.player === res.winner ? "win" : ""}`);
      const who = el("div", "who");
      const icon = r.player === "Toi" ? "🙂" : botOf(r.player)?.emoji ?? "";
      who.append(el("span", null, `${r.player === res.winner ? "🏆 " : ""}${icon} ${r.player}`));
      who.append(el("span", "score", `${r.idea + r.french}/10`));
      d.append(who, el("p", "ans", answers[r.player] ?? ""), el("p", "com", `💡 ${r.idea}/5 · 🇫🇷 ${r.french}/5 — ${r.comment_fr}`));
      return d;
    })
  );

  const f = res.feedback;
  $("your-answer").textContent = answer || "(pas de réponse)";
  $("corrected").textContent = f.corrected;
  $("mistakes").replaceChildren(
    ...f.mistakes.map((m) => {
      const li = el("li");
      li.append(el("s", null, m.wrong), " → ", el("b", null, m.right), ` — ${m.why_en}`);
      return li;
    })
  );
  if (!f.mistakes.length) $("mistakes").append(el("li", null, "Aucune faute ! 🎉"));
  $("better").textContent = f.better_version;
  $("tip").textContent = `💡 ${f.tip_en}`;
  $("drill-result").textContent = "";
  wordsInto($("new-words"), f.new_words);
  $("btn-next").textContent = game.n >= game.total ? "Résultats finaux 🏆" : "Manche suivante ▶";

  addMsg("", `— Manche ${game.n} : ${res.winner} gagne —`, "sys");
  (async () => {
    await judgeSays(res.verdict_fr);
    for (const r of res.reactions) {
      addMsg(r.bot, r.text);
      await botSays(r.bot, r.text);
    }
  })();
}

$("btn-hear-better").onclick = () => judgeSays($("better").textContent);

// "Repeat after me": say the native version, compare with what was heard.
micButton(
  $("btn-drill"),
  () => "",
  (t) => {
    const score = similarity($("better").textContent, t);
    $("drill-result").textContent = `J'ai entendu : « ${t} » — ${score}% ${score >= 85 ? "🎉 Parfait !" : score >= 60 ? "👍 Presque !" : "🔁 Encore une fois ?"}`;
  },
  $("drill-result")
);

function finishGame() {
  show("final");
  const ranking = PLAYERS.map((p) => [p, game.scores[p]]).sort((a, b) => b[1] - a[1]);
  const [winner] = ranking[0];
  const line = winner === "Toi" ? "Incroyable ! Tu es le grand gagnant ! Bravo !" : `Le grand gagnant est ${winner} ! Tu feras mieux la prochaine fois !`;
  $("final-verdict").textContent = line;
  $("final-table").replaceChildren(
    ...ranking.map(([p, s], i) => {
      const d = el("div", `result ${i === 0 ? "win" : ""}`);
      const who = el("div", "who");
      who.append(el("span", null, `${["🥇", "🥈", "🥉", "4️⃣"][i]} ${p === "Toi" ? "🙂" : botOf(p).emoji} ${p}`), el("span", "score", `${s} pts`));
      d.append(who);
      return d;
    })
  );
  judgeSays(line);
  addMsg("", "— Fin de la partie. Discute avec les bots ! —", "sys");
}

// ---------- start ----------
show("lobby");
addMsg("Camille", "Bonjour ! Tu es prêt·e pour le Juge ? Moi, je vais gagner, évidemment. 💅");
addMsg("Léa", "Salut ! Moi aussi j'apprends le français. Tu viens d'où ?");
if (!settings.apiKey) setTimeout(openSettings, 300);
