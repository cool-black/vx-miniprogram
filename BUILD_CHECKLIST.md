# Next Validation Cycle Build Checklist

## Goal

Prepare the project for the next validation round with a stable runbook, a clear smoke path, and enough instrumentation to understand where users drop off.

This cycle is about validation readiness, not feature expansion.

## 1. Pre-flight

- [ ] Confirm the backend starts with `npm run dev:backend`
- [ ] Confirm `backend/.env` exists and has the needed API keys or test fallbacks
- [ ] Confirm `miniprogram/config/env.js` points DevTools to `devtoolsApiBaseUrl`
- [ ] Confirm `deviceApiBaseUrl` is a LAN address for real-device testing
- [ ] Decide whether the first smoke run uses `speechMode=manual` or `speechMode=tencent`
- [ ] Make sure the smoke checklist is available to the person running validation

## 2. P0 build work

- [ ] Add funnel-level event capture for the validation cycle
- [ ] Record the key steps: home exposure, start recording, first submit, feedback exposure, retry click, second submit
- [ ] Normalize backend error codes and frontend user-facing messages
- [ ] Make retry and recovery states explicit in the UI flow
- [ ] Keep feedback fallback behavior working when a real provider is unavailable
- [ ] Keep the README run instructions aligned with the actual boot flow

## 3. Integration gates

- [ ] DevTools happy path works from home to feedback
- [ ] DevTools retry path works from feedback back to recording
- [ ] Real-device happy path works on the same LAN
- [ ] Real-device transcription path is stable with the selected speech mode
- [ ] Network failure, permission denial, and backend failure all show readable recovery states

## 4. Validation-ready exit criteria

- [ ] A collaborator can boot backend and mini program without asking for extra setup
- [ ] A collaborator can run the smoke checklist without guessing the order
- [ ] The normal flow completes end to end in DevTools
- [ ] The same flow completes on a phone
- [ ] The retry flow completes end to end
- [ ] Failure cases do not white-screen or block recovery

## 5. Do not expand scope until these pass

- [ ] Historical records
- [ ] Login and user identity
- [ ] Long-term persistence layer
- [ ] Share cards
- [ ] Rich analytics dashboards
- [ ] Broader product expansion beyond the validation loop

## 6. Working order

- [ ] Finish instrumentation and error normalization first
- [ ] Stabilize failure and retry behavior next
- [ ] Run DevTools smoke immediately after that
- [ ] Move to real-device smoke once DevTools is clean
- [ ] Update the README and smoke notes only after the flow is stable
