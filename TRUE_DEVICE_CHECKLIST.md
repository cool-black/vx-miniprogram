# True Device Checklist

Use this checklist before any real-phone demo, seed test, or device stability run.
The goal is to prove three things:

- the phone can reach the backend on the LAN
- Tencent ASR works on a physical device
- the full flow survives permission and network failures

## 1. One-time setup

- Start the backend with `npm run dev:backend`
- Confirm `backend/.env` has valid `MINIMAX_API_KEY`
- Confirm `backend/.env` has valid Tencent ASR credentials
- Find the computer's LAN IP address
  - On Windows, run `ipconfig` and use the IPv4 address on the same Wi-Fi/LAN as the phone
- Confirm [miniprogram/config/env.js](d:/chi/ai/test-gstack-device/miniprogram/config/env.js) points `deviceApiBaseUrl` to `http://<LAN-IP>:8787`
- Keep `devtoolsApiBaseUrl` set to `http://127.0.0.1:8787`
- Confirm the phone and computer are on the same network
- Avoid guest Wi-Fi, VPN, or isolated hotspot mode
- Reopen WeChat DevTools after changing `env.js`
- On the phone, make sure WeChat is allowed to use the local network and microphone

## 2. DevTools smoke test

Run a quick desktop check first so device issues do not hide code issues.

- Open the mini program in WeChat DevTools
- Confirm the home page loads today's question
- Confirm the backend is reachable from DevTools
- Confirm `apiBaseUrl` resolves to `127.0.0.1`
- Run one normal submit flow before switching to the phone

## 3. Real-device validation flow

1. Open the mini program on the phone
2. Verify the home page loads within a reasonable time
3. Tap `开始录音`
4. Allow microphone permission if prompted
5. Speak for 5 to 10 seconds
6. Tap `结束录音`
7. Verify the transcript auto-fills in the textarea
8. Verify the transcript is editable
9. Tap `提交反馈`
10. Verify the feedback page loads successfully
11. Tap `再答一次`
12. Confirm the same question context is preserved
13. Return home and verify the app still navigates normally

## 4. Pass criteria

- The home page loads a question on the phone
- The phone can reach the backend without using `localhost`
- Transcript arrives automatically or can be edited manually
- Feedback page renders `overall`, `relevance`, `length`, and `naturalness`
- Feedback is readable and fully Chinese
- `再答一次` keeps the same question context
- Returning home still works after a full round trip

## 5. Failure checks

- Deny microphone permission and confirm the app shows a recovery path
- Temporarily stop the backend and confirm the app shows a readable network error
- Trigger Tencent ASR failure and confirm manual transcript editing is still possible
- Trigger MiniMax failure and confirm the app does not crash
- Change `deviceApiBaseUrl` to an invalid LAN IP and confirm the failure is obvious

## 6. Troubleshooting order

If real-device setup fails, check in this order:

1. Phone and computer are on the same network
2. `deviceApiBaseUrl` uses the computer's current LAN IP
3. Backend is listening on port `8787`
4. WeChat has microphone and local network permission
5. DevTools smoke test still passes on desktop

## 7. Exit rule

Do not call the device setup stable until one full phone run succeeds without manual intervention.
