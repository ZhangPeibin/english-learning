# Voice Web

Local browser client for the voice tutor backend. It accepts typed messages or
one recorded/uploaded utterance per turn, displays the learner text and tutor
reply, and speaks English and Chinese reply segments with matching browser
voices. Typed turns stay silent unless the learner presses the reply's play
button.

The Vite proxy reads `VOICE_ACCESS_TOKEN` from `../voice-backend/.env` and injects it server-side. The token is not included in the browser bundle.

Start the backend first, then run:

```sh
npm ci
npm start
```

Open `http://127.0.0.1:5173`. Use `npm run build` for a production bundle and `npm run preview` to inspect it locally while proxying to the backend.
