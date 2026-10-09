# Pulse: continuous care for body and mind

**CaseBlitz 2026 · Case Sprint: Project Pulse**  ·  **Team ID:** _(add your Team ID here)_

> **Note for judges: Pulsie, the AI chat companion, will not work on your computer unless you add your own Anthropic API key.**
> The key is not included in this repository, on purpose. Without it, **everything else works**; only Pulsie and the
> check-in score it produces are switched off. See [Pulsie and the API key](#pulsie-and-the-api-key) (a 1-minute fix).

## What Pulse is

Pulse is a phone-first web app for one beachhead: **young working women in Bengaluru living with PCOS and chronic stress**,
for example "Ananya", 24, a software engineer, private about her condition, comfortable with apps.

It tries to replace "sick care" (a 15-minute visit every three months) with a **continuous-care companion** that:

- helps her **track** what actually drives PCOS and stress: sleep, steps, cycle and symptoms, meals, medicines, weight, workouts, mood and the standard PHQ-9 and GAD-7 questionnaires;
- turns it into one number, the **Health Factor** (0–100, body and mind), and a clear trend over 3 weeks and 90 days;
- lets her **talk it out** with **Pulsie**, an AI that only asks questions, never gives advice or diagnoses, and shows a happy or sad face to match the mood of the chat;
- gives her doctor a **one-page pre-visit summary** of only what she chose to share, so the 15 minutes go to understanding her, not to basic questions.

## Try it in five minutes

1. Start the app (see [Run it](#run-it)) and open http://127.0.0.1:8000.
2. **Sign in with the sample account** (Ananya, with 90 days of made-up history). Its email and password are the `DEMO_EMAIL` and `DEMO_PASSWORD` lines at the top of [`server/seed.py`](server/seed.py). Or click **Create an account** to try the 8-screen onboarding (consent, health background, PHQ-9 and GAD-7 with a safety stop, doctor link, goals). The verification code step accepts any 6 digits.
3. **Home:** Health Factor charts (3 weeks and 90 days) and the 30-day check-in calendar.
4. **Tracker** (open the menu): steps and sleep (typed in), cycle calendar, symptoms and tags, meals, medicines, weight, workouts, stress, PHQ-9 and GAD-7.
5. **Healthcare:** find Bengaluru doctors, book a slot, choose exactly what a doctor can see (and for how long), add lab reports, see the doctor's plan, and open the **pre-visit summary**. Also set an emergency contact and download or delete your data.
6. **Profile:** per-data-type consents you can withdraw at any time.
7. **Pulsie** (Tracker menu): needs an API key, see below.

## Run it

You only need **Python 3.9 or newer** (developed and tested on 3.14). There is **nothing to install**: the server uses only the Python standard library and a local SQLite file.

```bash
python3 server/app.py
```

Then open **http://127.0.0.1:8000**. The first run creates a `data/` folder (database and uploaded files) and the sample account. Everything stays on your computer.

| Setting | How |
|---|---|
| Different port | `PULSE_PORT=8001 python3 server/app.py` |
| Start without the sample account | `python3 server/app.py --no-demo` |
| Reset everything | Stop the server and delete the `data/` folder |
| Other options | `PULSE_HOST`, `PULSE_DATA` (data folder), `PULSE_AI_MODEL` |

## Pulsie and the API key

**Pulsie uses the Claude API, and no key is included.** Without a key you will see "Pulsie is not available. It is not set up on this computer yet." on the Pulsie page. Nothing else is affected.

What is switched off without a key:

- the Pulsie chat itself;
- the **check-in score** that Pulsie works out from a chat, and therefore the **automatic alert** to a user's emergency contact and doctor when that score is very low (shown on screen as a "Demo only" notice, nothing is actually sent).

To switch it on:

1. Get an API key from the [Anthropic Console](https://console.anthropic.com/).
2. Copy `.env.example` to `.env` and paste the key after `ANTHROPIC_API_KEY=` (or set `ANTHROPIC_API_KEY` in your terminal). `.env` is git-ignored.
3. Open **Tracker > Pulsie**. The key is read on each request, so no restart is needed. The first time, you will see a consent screen explaining what is sent.

Good to know:

- The default model is `claude-haiku-5-5`. What a user types to Pulsie is sent to Anthropic to write the next question. **Pulse does not save the chat**; it keeps only a 0–100 check-in score.
- Pulsie's rules are plain-language files you can read and edit: [`server/prompts/pulsie_guide.md`](server/prompts/pulsie_guide.md) (how it asks questions and picks its mood) and [`server/prompts/pulsie_score.md`](server/prompts/pulsie_score.md) (how it scores a check-in). Changes apply on the next message.
- Each person is limited to 40 AI calls per 10 minutes.

## The Health Factor (v0)

A summary for the user and their doctor, **not a diagnosis**. It is recalculated each day from the last 7 days of data and written down in [`server/compute.py`](server/compute.py) so it can be defended and changed in one place.

```
Health Factor = 0.5 × Mind + 0.5 × Body
Mind = 0.60 × PHQ-9 + 0.40 × GAD-7        # validated questionnaires only; the daily mood tap is not in the score
Body = 0.35 × Sleep + 0.35 × Steps + 0.30 × Cycle
```

The weights are our assumptions and are not clinically validated. If a part has no data, it is left out and the others are rescaled.

## How it follows the case rules

- **No diagnosis or prescription by software.** Pulsie only asks questions. Pulse shows patterns, never causes or advice.
- **Explicit consent for every kind of data**, with withdraw, download-my-data and delete-my-data.
- **Safety net.** Self-harm phrases show Tele-MANAS (14416) and 112 immediately. A very low Pulsie check-in score (below 35) or any safety phrase alerts the emergency contact and linked doctor the user chose, if the user opted in. Here that alert is a demo notice only.
- **One launch city:** Bengaluru. Sign-ups from elsewhere go to a waitlist.
- **India-first:** Indian meals and family context, ₹ pricing, Tele-MANAS, Hindi and Hinglish understood by Pulsie.

## What is simulated or left out (on purpose)

- **Doctors are fictional.** The six Bengaluru providers, their clinics and availability are made up for the demo.
- **No real payments, SMS, email or alerts.** The plan page is illustrative, and "alerts" are recorded locally and shown on screen.
- **No wearables.** Steps and sleep are typed in by the user.
- **No provider-side login or dashboard** in this MVP: it demonstrates the patient experience.
- **Sample data is made up.** The sample account's 90-day history is generated for the demo. It is not evidence of any health outcome.
- **Medical wording** (cycle explainers, the sample diet plan, video links) has not been clinician-reviewed.
- Local-only: the server listens on 127.0.0.1 and the session cookie has no `Secure` flag. It is not hardened for the public internet.

## Project layout

```
index.html  register.html  user.html  tracker.html  healthcare.html  profile.html   the pages
css/style.css                                                                       one stylesheet
js/                                                                                 page scripts (vanilla JS, no libraries)
assets/                                                                             logo and Pulsie's two faces
server/app.py                                                                       entry point: pages + JSON API
server/api/                                                                         account, onboarding, home, tracker, healthcare, profile, pulsie (journal.py)
server/compute.py   server/ai.py   server/db.py   server/seed.py                    Health Factor, Claude calls, SQLite, sample data
server/prompts/                                                                     Pulsie's instructions in plain language
data/  (created on first run, git-ignored)                                          database and uploads
```

## Declarations

- **Python packages:** none beyond the standard library.
- **External services at run time:** the Claude API from Anthropic (optional, only for Pulsie), and YouTube links and thumbnails on the home and plan pages (the thumbnails need internet; everything else works offline).
- **Standard scales used:** PHQ-9 and GAD-7 (public-domain wording). Case data comes from the problem statement.
- **Tooling:** AI coding assistance was used to build this prototype.
