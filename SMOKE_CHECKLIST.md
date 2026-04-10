# Smoke Checklist

Use this checklist for the next validation cycle. It is intentionally short and practical.

## 1. Before you start

- [ ] Backend is running
- [ ] Mini program is opened in WeChat DevTools
- [ ] `devtoolsApiBaseUrl` points to the local backend
- [ ] `deviceApiBaseUrl` points to the computer's LAN IP if testing on phone
- [ ] The chosen `speechMode` matches the run you want to verify

## 2. DevTools happy path

- [ ] Home page loads a question
- [ ] Tap `开始录音`
- [ ] Grant microphone permission if prompted
- [ ] Speak for a few seconds
- [ ] Tap `结束录音`
- [ ] Confirm transcript appears
- [ ] Edit the transcript if needed
- [ ] Tap `提交反馈`
- [ ] Confirm the feedback page loads
- [ ] Confirm `overall`, `relevance`, `length`, and `naturalness` are visible

## 3. Retry path

- [ ] On the feedback page, tap `再答一次`
- [ ] Confirm the same question context is preserved
- [ ] Record a second answer
- [ ] Submit again
- [ ] Confirm the second feedback page loads

## 4. Real-device smoke

- [ ] Phone and computer are on the same LAN
- [ ] `deviceApiBaseUrl` works from the phone
- [ ] The home page loads on the phone
- [ ] Recording starts and stops correctly on the phone
- [ ] Transcript and feedback load correctly on the phone

## 5. Failure checks

- [ ] Deny microphone permission once and recover
- [ ] Simulate backend unavailability and confirm the message is readable
- [ ] Trigger transcription failure and confirm manual recovery still works
- [ ] Trigger feedback failure and confirm the app does not crash

## 6. Stop conditions

- [ ] White screen
- [ ] Broken navigation loop
- [ ] Silent failure with no user message
- [ ] Retry path loses the question context
- [ ] Phone flow diverges from DevTools flow without explanation
