# 🥁 Le Juge: a French speaking game

A small, phone-first web app inspired by the Roblox game **AI Judge**. The judge asks a question out loud. You and 3 bot players answer in French, and Claude scores everyone on **idea (0–5) + French (0–5)**. After each round you get your answer corrected, a native-style version, a "repeat after me" speaking drill and new words. Between rounds you can chat in French with the bots.

## Install on iPhone

1. Turn on GitHub Pages: repo **Settings → Pages → Build and deployment → Deploy from a branch**, then pick the branch and the **`/docs`** folder.
2. On the iPhone, open `https://shushana.github.io/learning-java/` in **Safari**.
3. Tap **Share → Add to Home Screen**. It opens full screen like an app.
4. Tap ⚙️ and paste an Anthropic API key (console.anthropic.com → API Keys). The key is stored only on your phone.
5. Allow the microphone when Safari asks.

## How a round works

- Rounds alternate between 🐉 absurd scenarios (Roblox style) and ☕ real-life situations in France.
- 🔊 Répéter / 🐢 Lentement replays the question. 🇬🇧 shows the English.
- Tap 🎤 Parler and speak. Your words appear in the box, and you can fix them before you send. If the mic button doesn't work, tap the text box and use the 🎤 on the iPhone keyboard.
- The bots' answers are revealed with the verdict. Léa is a learner too, so her mistakes get corrected as well.
- 🎤 Répète après moi: say the native version and get a match score.

## Settings

| Setting | Default | Notes |
|---|---|---|
| Model | Claude Opus 5.5 | Best judge. Haiku 5.5 is faster and much cheaper. |
| Level | A2 | A1 = very simple sentences. |
| Timer | 60 s | 30 / 60 / 90 / off. |
| Voice speed | Normal (0.85) | |

Cost: each round is 2 API calls (question, verdict), plus 1 per chat message.

## Files

- `index.html`, `style.css`: UI
- `app.js`: game flow, chat, timer, scores
- `ai.js`: Claude prompts and JSON schemas (judge, bots, chat)
- `speech.js`: French text-to-speech and speech recognition
- `vendor/anthropic-sdk.js`: bundled `@anthropic-ai/sdk` 0.130.0. To rebuild:
  `echo 'export { default as Anthropic } from "@anthropic-ai/sdk";' > entry.js && npx esbuild entry.js --bundle --format=esm --minify --target=safari15 --outfile=docs/vendor/anthropic-sdk.js`

## Claude subscription version (no API key)

`le-juge-artifact.html` is the same game, built as a claude.ai Artifact. Claude runs on the player's own claude.ai plan through the artifact `sample` capability, so you don't need an API key. Artifacts can't use the microphone, so you speak through the iPhone keyboard's dictation key. The published copy is at https://claude.ai/artifact/6ttgpDJ6t4PbnsvcLFL71c
