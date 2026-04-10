# True Device Checklist

## Before Testing

- Start backend with `npm run dev:backend`
- Confirm `backend/.env` has valid `MINIMAX_API_KEY`
- Confirm `backend/.env` has valid Tencent ASR credentials
- Confirm [miniprogram/config/env.js](d:/chi/ai/test-gstack/miniprogram/config/env.js) uses the correct `deviceApiBaseUrl`
- Confirm phone and computer are on the same LAN

## Critical Flow

1. Open the mini program on the phone
2. Verify the home page loads today's question
3. Tap `开始录音`
4. Allow microphone permission if prompted
5. Speak for 5 to 10 seconds
6. Tap `结束录音`
7. Verify transcript auto-fills in the textarea
8. Verify the transcript is editable
9. Tap `提交反馈`
10. Verify feedback page loads successfully

## What To Check

- Transcript is close to what was spoken
- Feedback page shows `overall`, `relevance`, `length`, and `naturalness`
- Feedback is in Chinese
- `再答一次` keeps the same question context
- Returning home still works

## Failure Checks

- Deny microphone permission and confirm recovery via settings
- Disconnect backend and confirm there is a readable error
- Trigger Tencent ASR failure and confirm manual transcript editing is still possible
- Trigger MiniMax failure and confirm the app does not crash
