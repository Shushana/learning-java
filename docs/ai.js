// All Claude calls for the game. Each call returns JSON matching a schema.
import { Anthropic } from "./vendor/anthropic-sdk.js";

export const BOTS = [
  {
    name: "Camille",
    emoji: "💅",
    pitch: 1.25,
    persona:
      "Camille, a confident, slightly snobbish Parisian who loves showing off elegant French. Answers are stylish and dramatic, always correct French.",
  },
  {
    name: "Théo",
    emoji: "🎮",
    pitch: 0.9,
    persona:
      "Théo, a funny gamer from Lyon who loves absurd, chaotic solutions and jokes. Uses casual spoken French (ouais, trop, grave) but stays understandable.",
  },
  {
    name: "Léa",
    emoji: "📚",
    pitch: 1.1,
    persona:
      "Léa, a shy, kind student who is ALSO learning French (around A2). Her answers are simple and contain 1-2 typical learner mistakes (gender, agreement, verb tense) so the player sees mistakes corrected too.",
  },
];

const LEVEL_GUIDE = {
  A1: "CEFR A1: very short sentences, present tense, the 1000 most common words, no idioms.",
  A2: "CEFR A2: short sentences, present / passé composé / futur proche, common everyday words, at most one simple idiom.",
};

let client = null;
let settings = null;

export function configure(s) {
  settings = s;
  client = s.apiKey
    ? new Anthropic({ apiKey: s.apiKey, dangerouslyAllowBrowser: true })
    : null;
}

async function ask(system, user, schema, maxTokens = 4000) {
  if (!client) throw new Error("Ajoute ta clé API dans les réglages ⚙️");
  const params = {
    model: settings.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema },
    },
  };
  // Opus 5.5 supports server-side refusal fallbacks; Haiku does not.
  if (settings.model === "claude-opus-5-5") {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  const res = await client.beta.messages.create(params);
  if (res.stop_reason === "refusal") throw new Error("Le juge a refusé de répondre. Réessaie.");
  if (res.stop_reason === "max_tokens") throw new Error("Réponse coupée. Réessaie.");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text);
}

const obj = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str = { type: "string" };
const int = { type: "integer" };
const arr = (items) => ({ type: "array", items });

function levelLine() {
  return LEVEL_GUIDE[settings.level] || LEVEL_GUIDE.A2;
}

function botsLine() {
  return BOTS.map((b) => `- ${b.name}: ${b.persona}`).join("\n");
}

// One call: new scenario + the bots' secret answers.
export function newRound(kind, recentScenarios) {
  const kindLine =
    kind === "absurd"
      ? "an absurd, funny survival scenario in the style of the Roblox game 'AI Judge' (e.g. a dragon attacks your bakery, you shrink to the size of an ant before an exam). Ask: what do you do?"
      : "a realistic everyday situation in France (café, pharmacy, train station, neighbour, job, doctor, lost luggage...) with a small problem to solve. Ask: what do you do / what do you say?";
  return ask(
    `You are the game master of a French speaking game for a learner. Write everything for this level: ${levelLine()}`,
    `Create ${kindLine}
Keep the scenario to 1-2 short sentences in French, addressed with "tu", ending with a question.
Avoid repeating these recent scenarios: ${recentScenarios.join(" | ") || "none"}.
Also write each bot player's answer (1-2 sentences, in French, at the same level, in character):
${botsLine()}`,
    obj({
      scenario_fr: str,
      scenario_en: str,
      useful_words: arr(obj({ fr: str, en: str })),
      bot_answers: arr(obj({ bot: str, answer: str })),
    })
  );
}

export function judge(scenario, playerAnswer, botAnswers, spoken) {
  const all = [{ player: "Toi", answer: playerAnswer }, ...botAnswers.map((b) => ({ player: b.bot, answer: b.answer }))];
  return ask(
    `You are "Le Juge", a dramatic, funny but kind game-show judge (a sentient drum 🥁, like the Roblox game AI Judge). You judge answers in French for a learner game. Speak in French at this level: ${levelLine()}
Scoring for each player: idea (0-5: creative, smart, funny, actually solves the problem) + french (0-5: grammar, vocabulary, natural phrasing; 5 = correct and natural for the level). Total out of 10.
Judge the human player ("Toi") fairly: a short correct answer can beat a long wrong one. Don't make the human always win or always lose.`,
    `Scenario: ${scenario}
The human ${spoken ? "SPOKE their answer (speech-to-text, so ignore missing punctuation/capitals and obvious transcription glitches)" : "typed their answer"}.
Answers (JSON): ${JSON.stringify(all)}

Return:
- results: one entry per player in the same order, with a short funny comment in French (max 15 words).
- winner: the player name with the best total.
- verdict_fr: what the judge announces out loud (2 short sentences, dramatic).
- feedback: for the human only. corrected = their answer rewritten in correct, natural French (keep their idea). If it was already perfect, repeat it. mistakes = each error with a short explanation in English (empty array if none). better_version = how a native would say it, at the same level. tip_en = one short actionable tip in English. new_words = 2-3 useful words from this round.
- reactions: 1-2 bots react to the human's answer in French (short, in character, friendly teasing or compliments).
If the human answer is empty or not French, give french 0 and say so kindly.`,
    obj({
      results: arr(obj({ player: str, idea: int, french: int, comment_fr: str })),
      winner: str,
      verdict_fr: str,
      feedback: obj({
        corrected: str,
        mistakes: arr(obj({ wrong: str, right: str, why_en: str })),
        better_version: str,
        tip_en: str,
        new_words: arr(obj({ fr: str, en: str })),
      }),
      reactions: arr(obj({ bot: str, text: str })),
    })
  );
}

// Lobby / post-round chat with the bots.
export function chat(history) {
  return ask(
    `You play the bot players in a French speaking game lobby. The human is a French learner. Level: ${levelLine()}
Bots:
${botsLine()}
Rules: reply in French only, 1-2 bots reply per turn, each message max 20 words, stay in character, keep the conversation going with a question to the human. Never correct the human directly here; instead, naturally reuse the correct form in your reply (recast). If the human writes in English, reply in simple French and add a hint in the field hint_en.`,
    `Chat so far (JSON, oldest first): ${JSON.stringify(history.slice(-20))}
Write the next bot replies.`,
    obj({ replies: arr(obj({ bot: str, text: str })), hint_en: str }),
    1500
  );
}
