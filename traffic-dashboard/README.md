# Signal Lab dashboard

A React dashboard for your SUMO traffic-signal experiments. It plays the three recordings
(fixed timing, Q-learning, DQN) side by side with live charts, has an Analytics page with
insights, a landing page, light and dark mode, and a sign-in. The first person to sign up
becomes the administrator.

You do **not** need Node.js or pip packages to run it. Python 3.8 or newer is enough.

## 1. Where to put it

Copy this whole `traffic-dashboard` folder into your `Test` folder, next to `recordings`:

```
Test/
  recordings/            <- made by traci9_record.py
  RL.rou.xml             <- optional, used for the demand charts
  traffic-dashboard/     <- this folder
    server.py
    start_dashboard.bat
    web/                 <- the built React app
    frontend/            <- the React source code (only needed if you want to change the design)
```

## 2. Make the recordings (once)

```
python traci9_record.py fixed
python traci9_record.py ql
python traci9_record.py dqn
python build_dashboard.py        # turns the pictures into recordings/<name>/video.mp4
```

(`build_dashboard.py` also writes the old single-file `dashboard.html`. You can ignore it.)

## 3. Start the dashboard

Double-click `start_dashboard.bat`, or run:

```
cd traffic-dashboard
python server.py
```

Your browser opens at http://localhost:8000. The first time, you create the administrator
account. After that, you sign in.

Useful options:

```
python server.py --port 8001                                  # if port 8000 is busy
python server.py --recordings C:\path\to\Test\recordings      # if it does not find your recordings
python server.py --routes C:\path\to\Test\RL.rou.xml          # for the demand charts
```

After you record again, press the reload button (top right) to load the new numbers.

## Using the dashboard

* **Space** plays and pauses, **left / right arrow** jumps 5 seconds.
* The first video is the clock. The other two follow it, and all numbers and charts follow the clock.
* The leaderboard ranks the controllers by their average queue up to the current moment.
* **Analytics** has headline numbers, written insights, comparison charts and a table.
  "Download results (CSV)" saves the table.

## Accounts and safety

* Passwords are stored as salted scrypt hashes in `data/users.json`. Sessions use an HttpOnly cookie and last 7 days.
* After 5 wrong passwords from one address, sign-in is blocked for 5 minutes.
* The server only listens on your own computer (127.0.0.1). Use `--host 0.0.0.0` only if you really
  want other computers on your network to reach it. It is a small local tool, not a public web server.
* **Forgot the password?** Stop the server, delete `data/users.json` (and `data/sessions.json`), start it
  again and sign up again. Your recordings are not touched.

## Changing the design (optional, needs Node.js 18 or newer)

```
cd frontend
npm install
npm run dev        # live preview on http://localhost:5173 (start server.py in another window)
npm run build      # writes the finished app into ../web
```

The pages are in `frontend/src/pages`, the colors and layout in `frontend/src/styles.css`.
