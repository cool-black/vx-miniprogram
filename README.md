# IELTS Speaking v0

This repository contains the current scaffold for the IELTS speaking WeChat mini program and its local backend.

## What lives here

- `backend/`: local backend used for questions, recording upload, transcription, and feedback
- `miniprogram/`: WeChat mini program client
- `PRD.md`: product scope and validation goal
- `TECH_SPEC.md`: technical design
- `BUILD_CHECKLIST.md`: next-cycle execution checklist
- `SMOKE_CHECKLIST.md`: practical smoke test checklist for validation runs

## Quick Start

### 1. Install dependencies

Run this from the repository root:

```bash
npm install
```

### 2. Prepare backend env

Copy the example file and fill in the values you need:

```text
backend/.env.example -> backend/.env
```

Minimum useful setup for local validation:

- `NODE_ENV=development`
- `STT_PROVIDER=frontend`
- `FEEDBACK_PROVIDER=minimax`
- `MINIMAX_API_KEY=...` if you want real feedback generation
- `TENCENT_ASR_APP_ID`, `TENCENT_ASR_SECRET_ID`, `TENCENT_ASR_SECRET_KEY` if you want Tencent ASR

### 3. Start the backend

```bash
npm run dev:backend
```

The backend runs from the workspace script in the repo root.

Useful routes:

- `GET /health`
- `GET /questions/today`
- `GET /asr/tencent/session`
- `POST /practice-attempts`

### 4. Open the mini program in WeChat DevTools

Open the `miniprogram/` directory in WeChat DevTools.

The environment config is in:

```text
miniprogram/config/env.js
```

Recommended values for local work:

- `devtoolsApiBaseUrl`: your local backend, usually `http://127.0.0.1:8787`
- `deviceApiBaseUrl`: your LAN IP, for example `http://192.168.1.23:8787`
- `speechMode`: `manual` for a safer first smoke, or `tencent` when ASR credentials are ready

For Windows + DevTools, `127.0.0.1` is usually more reliable than `localhost`.

### 5. Real-device debugging

If you want to test on a phone:

- keep the phone and computer on the same LAN
- point `deviceApiBaseUrl` at the computer's LAN IP
- switch `speechMode` to `tencent` only after Tencent credentials are configured

## Practical notes

- The current flow is intentionally lightweight so we can validate the end-to-end loop quickly.
- Audio upload currently uses a base64 JSON path instead of multipart upload.
- If feedback generation is unavailable, the backend falls back to mock feedback so the loop can still be exercised.
- Attempt audio and metadata are written under `backend/.runtime/`.

## Suggested first validation path

1. Start backend.
2. Open the mini program in DevTools.
3. Run one happy-path submission.
4. Run one retry via `再答一次`.
5. Re-run on a real device only after the DevTools flow is stable.

For the exact smoke sequence, use `SMOKE_CHECKLIST.md`.
