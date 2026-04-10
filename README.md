# IELTS Speaking v0

This repository contains the first scaffold for the IELTS speaking WeChat mini program.

## Structure

- `PRD.md`: product scope and validation goal
- `TECH_SPEC.md`: technical design
- `BUILD_CHECKLIST.md`: execution checklist
- `backend/`: local mockable backend
- `miniprogram/`: WeChat mini program scaffold

## Backend

Run the backend locally:

```bash
npm run dev:backend
```

Local config file:

```bash
backend/.env
```

Example:

```bash
OPENAI_API_KEY=
MINIMAX_API_KEY=your_minimax_key
MINIMAX_BASE_URL=https://api.minimax.chat/v1
NODE_ENV=development
STT_PROVIDER=frontend
FEEDBACK_PROVIDER=minimax
FEEDBACK_MODEL=MiniMax-M2.7
TENCENT_ASR_APP_ID=your_tencent_asr_app_id
TENCENT_ASR_SECRET_ID=your_tencent_secret_id
TENCENT_ASR_SECRET_KEY=your_tencent_secret_key
TENCENT_ASR_ENGINE_MODEL=16k_zh
TENCENT_ASR_VOICE_FORMAT=8
```

You can also copy:

```bash
backend/.env.example
```

Available routes:

- `GET /health`
- `GET /questions/today`
- `GET /asr/tencent/session`
- `POST /practice-attempts`

The backend loads `backend/.env` automatically on startup.
The recommended MiniMax setup is:

- frontend or WeChat-side transcript
- MiniMax for feedback generation

Current behavior:

- if `transcript` is provided by the frontend, backend uses it directly
- if `FEEDBACK_PROVIDER=minimax` and `MINIMAX_API_KEY` is present, backend tries real MiniMax feedback
- if MiniMax request fails, backend falls back to mock feedback
- `GET /asr/tencent/session` returns a backend-signed Tencent ASR websocket URL

## Mini Program

Open the `miniprogram/` directory in WeChat DevTools.

The mini program environment config lives in:

```text
miniprogram/config/env.js
```

It now supports two base URLs:

- `devtoolsApiBaseUrl`: used automatically in WeChat DevTools
- `deviceApiBaseUrl`: used automatically on a real phone

Example:

```js
const ENV_CONFIG = {
  speechMode: "tencent",
  devtoolsApiBaseUrl: "http://127.0.0.1:8787",
  deviceApiBaseUrl: "http://192.168.1.100:8787"
};
```

For local development on Windows, DevTools still defaults to:

```text
http://127.0.0.1:8787
```

This is more reliable than `localhost` in WeChat DevTools on some machines.

For real-device debugging, replace `deviceApiBaseUrl` with your computer's LAN IP, for example:

```text
http://192.168.1.23:8787
```

Speech mode is controlled in:

```text
miniprogram/config/env.js
```

Available values:

- `manual`
- `tencent`

Example:

```js
speechMode: "tencent"
```

Current scaffold includes:

- home page
- recorder page
- feedback page
- basic request layer
- real local recording read on the mini program side
- backend attempt audio persistence
- mock happy path with retry

## Current shortcuts

- audio is currently posted as base64 JSON instead of multipart upload
- transcript now supports `manual` and `tencent` provider modes
- feedback generation can use real MiniMax when `MINIMAX_API_KEY` is configured, otherwise it falls back to mock output
- no database persistence yet, but attempt audio files are written under `backend/.runtime/attempts/`
- attempt metadata is appended to `backend/.runtime/attempts.jsonl`

Those are intentional v0 shortcuts so we can keep building the flow without blocking on external services.
