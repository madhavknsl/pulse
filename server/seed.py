"""Demo account: 'Ananya', 24, Bengaluru, with 90 days of SIMULATED history.

Everything here is made-up demo data so the product can be shown end to end. It is created on first run only.
Sign in with the demo credentials below to see a fully populated account; new registrations start empty.
"""
import json
import random
from datetime import date, datetime, timedelta

from server import db, defs, security, store

DEMO_EMAIL = "ananya.raman@example.com"
DEMO_PHONE = "9876543210"
DEMO_PASSWORD = "pulse-demo-2026"     # demo account only; change it if this is ever shown to anyone


def _d(n):
    return (date.today() - timedelta(days=n)).isoformat()


def _stamp(n, hour=10):
    return (datetime.now() - timedelta(days=n)).replace(hour=hour, minute=0, second=0, microsecond=0).isoformat(sep=" ")


def _answers(total, n, last_zero=False):
    """Spread a questionnaire total across n answers of 0-3 (PHQ-9's last item stays 0)."""
    slots = n - 1 if last_zero else n
    base, rem = divmod(total, slots)
    out = [min(3, base + (1 if i < rem else 0)) for i in range(slots)]
    return out + ([0] if last_zero else [])


def ensure_demo():
    conn = db.connect()
    try:
        if conn.execute("SELECT 1 FROM users WHERE is_demo = 1").fetchone():
            return
        conn.execute("BEGIN IMMEDIATE")
        _create(conn)
        conn.execute("COMMIT")
        print("Created the demo account (sample data). See server/seed.py for its sign-in details.")
    except Exception:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


def _create(conn):
    r = random.Random(24)
    gauss = lambda mu, sd: r.gauss(mu, sd)
    created = _stamp(89)   # the first day of data
    uid = conn.execute(
        "INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, first_name, last_name, preferred_name, dob, sex, "
        "city, language, height_cm, created_at, onboarding_step, onboarded_at, is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
        (DEMO_EMAIL, DEMO_PHONE, 1, 1, security.hash_password(DEMO_PASSWORD), "Ananya", "Raman", "Ananya", "2002-03-14", "Female",
         "Bengaluru", "English", 162, created, 9, created)).lastrowid

    for kind in defs.CONSENT_KINDS:
        conn.execute("INSERT INTO consents (user_id, kind, granted, version, at) VALUES (?,?,?,?,?)", (uid, kind, 1, defs.CONSENT_VERSION, created))

    store.set_setting(conn, uid, "health_background", {
        "conditions": [{"name": "PCOS", "year": 2025}, {"name": "Stress", "year": None}], "allergies": [], "no_allergies": True,
        "family": ["Type 2 diabetes", "Thyroid condition"], "family_none": False, "diet": "Non-vegetarian", "work": "Desk job",
        "work_note": "Often works late, with meetings after 8 pm", "lifestyle": list(defs.LIFESTYLE_AVAILABLE),
        "pcos_status": "Diagnosed by a doctor", "stress_duration": "More than 6 months", "stress_sources": ["Work pressure"]})
    store.set_setting(conn, uid, "goals", {"sleep_h": 7, "steps": 7000, "weight_kg": 72})
    store.set_setting(conn, uid, "notifications", defs.DEFAULT_NOTIFICATIONS)
    store.set_setting(conn, uid, "plan", {"price": 399, "status": "active", "renews": (date.today() + timedelta(days=18)).isoformat(), "method": "UPI"})
    store.set_setting(conn, uid, "ui", defs.DEFAULT_UI)
    store.set_setting(conn, uid, "emergency", {"name": "Rohan Raman", "relation": "Brother", "phone": "9876501234", "consent": True,
                                              "alert_doctor": True, "auto_alert": True})   # sample contact, so the Pulsie alert can be demonstrated

    # --- 90 days of steps, sleep and check-ins: sleep nudges mood, so the patterns are real (in the sample) ---
    prev_steps = 4700
    for i in range(90):
        age = 89 - i
        day = _d(age)
        t = i / 89
        ease = t * t * (3 - 2 * t)
        weekend = (date.today() - timedelta(days=age)).weekday() >= 5
        sleep = max(3.5, min(9.5, 5.8 + 0.6 * ease + gauss(0, 0.55)))
        steps = max(800, min(16000, 4700 + 1100 * ease + gauss(0, 750) - (600 if weekend else 0)))
        latent = 2.8 + 0.25 * ease + 0.55 * (sleep - 6.3) + 0.00011 * (prev_steps - 5000) + gauss(0, 0.3)
        logged = age != 0 and r.random() < 0.85
        mood = max(1, min(5, round(latent))) if logged else None
        stress = max(1, min(5, round(gauss(3.2 - 0.6 * ease, 0.7)))) if age < 14 and logged else None
        if age == 0:
            steps = 5320
        for _ in range(3 if age == 0 else 4):
            gauss(0, 1)   # unused draws: they keep the random sequence, so the sample data stays exactly as it was tuned
        conn.execute(
            "INSERT INTO daily (user_id, date, steps, sleep_min, bed_min, mood, mood_at, stress) VALUES (?,?,?,?,?,?,?,?)",
            (uid, day, int(round(steps / 10) * 10), int(round(sleep * 60)), int(round(gauss(40, 45))),
             mood, _stamp(age, 21) if logged else None, stress))
        prev_steps = steps

    # weekly weigh-ins and waist
    for k in range(13):
        conn.execute("INSERT INTO measurements (user_id, date, kind, value) VALUES (?,?,?,?)",
                     (uid, _d(86 - 7 * k), "weight", round(74.6 - 0.125 * k + (0.1 if k % 3 == 0 else -0.05), 1)))
    conn.execute("UPDATE measurements SET value = 73.1 WHERE user_id = ? AND date = ? AND kind = 'weight'", (uid, _d(2)))
    conn.execute("INSERT INTO measurements (user_id, date, kind, value) VALUES (?,?,'waist',88)", (uid, _d(86)))
    conn.execute("INSERT INTO measurements (user_id, date, kind, value) VALUES (?,?,'waist',86)", (uid, _d(21)))

    # periods: cycles of 41, 41 and 36 days, flow by day
    for start, flows in ((130, ["light", "medium", "heavy", "medium", "light"]),   # logged before signing up
                         (89, ["medium", "heavy", "heavy", "medium", "light"]),
                         (48, ["light", "medium", "heavy", "heavy", "medium", "spotting"]),
                         (12, ["medium", "heavy", "medium", "light", "spotting"])):
        for j, f in enumerate(flows):
            conn.execute("INSERT INTO period_days (user_id, date, flow) VALUES (?,?,?)", (uid, _d(start - j), f))

    # workouts
    wk = [(5, "Walk", 30), (3, "Strength", 45), (1, "Yoga", 30)]
    for age in range(8, 90):
        if r.random() < 0.3:
            wk.append((age, r.choice(["Walk", "Walk", "Strength", "Yoga", "Cycling"]), r.choice([20, 30, 45])))
    for age, typ, mins in wk:
        conn.execute("INSERT INTO workouts (user_id, date, type, minutes) VALUES (?,?,?,?)", (uid, _d(age), typ, mins))

    # symptoms and day tags (last 30 days)
    weights = {"Fatigue": 0.37, "Bloating": 0.23, "Acne": 0.2, "Headache": 0.12, "Pelvic pain": 0.07, "Hair thinning": 0.1}
    tags = ["Late meal", "Ordered in", "Deadline day", "Poor sleep", "Caffeine", "Skipped workout"]
    for age in range(1, 30):
        syms = [s for s, p in weights.items() if r.random() < p]
        day_tags = [t for t in tags if r.random() < 0.15]
        if syms or day_tags:
            conn.execute("INSERT INTO symptom_logs (user_id, date, symptoms, tags) VALUES (?,?,?,?)", (uid, _d(age), json.dumps(syms), json.dumps(day_tags)))

    # meals: the last 7 days
    for age in range(0, 7):
        plan = [("Breakfast", "09:10", "Poha with peanuts"), ("Lunch", "14:15", "Veg thali"), ("Dinner", "21:00" if age % 3 else "22:30", "Dal and roti")]
        if age == 0:
            plan = plan[:2]
        for typ, tm, txt in plan:
            src = "Ordered in" if r.random() < 0.33 else "Home-cooked"
            if typ == "Breakfast" and age and r.random() < 0.15:
                src, txt = "Skipped", ""
            if age == 0:
                src = "Home-cooked" if typ == "Breakfast" else "Ordered in"
            conn.execute("INSERT INTO meals (user_id, date, time, meal_type, source, text) VALUES (?,?,?,?,?,?)", (uid, _d(age), tm, typ, src, txt))

    # medicines
    for name, dose in (("Metformin", "500 mg, after dinner"), ("Inositol", "2 g, morning")):
        mid = conn.execute("INSERT INTO medications (user_id, name, dose, created_at) VALUES (?,?,?,?)", (uid, name, dose, _stamp(80))).lastrowid
        for age in range(1, 30):
            conn.execute("INSERT INTO med_log (med_id, date, status) VALUES (?,?,?)", (mid, _d(age), "taken" if r.random() < 0.86 else "missed"))
        if name == "Inositol":
            conn.execute("INSERT INTO med_log (med_id, date, status) VALUES (?,?,'taken')", (mid, _d(0)))

    # questionnaires: baseline on day 1, then every three weeks
    for age, phq, gad in ((89, 14, 11), (68, 13, 11), (42, 13, 10), (21, 12, 10)):
        for kind, score, last_zero in (("phq9", phq, True), ("gad7", gad, False)):
            n = defs.QUESTIONNAIRES[kind]["items"]
            conn.execute("INSERT INTO questionnaires (user_id, kind, date, answers, score, is_baseline, created_at) VALUES (?,?,?,?,?,?,?)",
                         (uid, kind, _d(age), json.dumps(_answers(score, n, last_zero)), score, 1 if age == 89 else 0, _stamp(age, 20)))

    # care: a linked doctor, appointments, labs and a short activity log
    share = {k: True for k in defs.SHARE_KEYS}
    share["meals"] = False
    conn.execute("INSERT INTO links (user_id, provider_id, share, expires, since) VALUES (?,?,?,?,?)", (uid, "iyer", json.dumps(share), "Until I stop it", _stamp(60)))
    for age, text_ in ((3, "Dr. Meera Iyer viewed your pre-visit summary"), (20, "Dr. Meera Iyer viewed your lab reports"),
                       (60, "You linked Dr. Meera Iyer and chose what to share")):
        conn.execute("INSERT INTO access_log (user_id, at, text) VALUES (?,?,?)", (uid, _stamp(age, 11), text_))
    for pid, offset, minute, mode, reason, status in (("iyer", -7, 17 * 60, "In-person", "PCOS follow-up", "upcoming"),
                                                      ("iyer", 21, 17 * 60 + 30, "In-person", "PCOS follow-up", "done"),
                                                      ("rao", 68, 11 * 60, "Video", "Lab review", "done")):
        conn.execute("INSERT INTO appointments (user_id, provider_id, date, minute, mode, reason, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
                     (uid, pid, _d(offset), minute, mode, reason, status, _stamp(max(offset, 1) + 5)))
    for key, status, ordered, due, on in (("hba1c", "ordered", 12, -5, None), ("insulin", "ordered", 12, -5, None),
                                          ("lipid", "uploaded", 12, None, 5), ("tsh", "reviewed", 70, None, 58), ("vitd", "reviewed", 70, None, 58)):
        conn.execute("INSERT INTO tests (user_id, test_key, provider_id, ordered_on, due_on, status, status_on) VALUES (?,?,?,?,?,?,?)",
                     (uid, key, "iyer", _d(ordered), _d(due) if due is not None else None, status, _d(on) if on is not None else None))
    lipid_ranges = {"Total cholesterol": [None, 200], "LDL": [None, 100], "HDL": [40, None], "Triglycerides": [None, 150]}
    for key, ago, vals, ranges in (
            ("hba1c", 190, {"HbA1c": 5.5}, {"HbA1c": [4.0, 5.6]}),
            ("tsh", 190, {"TSH": 2.9}, {"TSH": [0.4, 4.0]}), ("tsh", 60, {"TSH": 3.1}, {"TSH": [0.4, 4.0]}),
            ("vitd", 190, {"Vitamin D": 18}, {"Vitamin D": [30, 100]}), ("vitd", 60, {"Vitamin D": 24}, {"Vitamin D": [30, 100]}),
            ("lipid", 190, {"Total cholesterol": 190, "LDL": 124, "HDL": 44, "Triglycerides": 150}, lipid_ranges),
            ("lipid", 5, {"Total cholesterol": 182, "LDL": 118, "HDL": 46, "Triglycerides": 142}, lipid_ranges)):
        conn.execute("INSERT INTO results (user_id, test_key, date, vals, ranges) VALUES (?,?,?,?,?)", (uid, key, _d(ago), json.dumps(vals), json.dumps(ranges)))
    for q in ("Could my short nights be linked to my low-mood days?", "Does the change in my cycle length matter for my care plan?"):
        conn.execute("INSERT INTO questions (user_id, text, created_at) VALUES (?,?,?)", (uid, q, _stamp(2)))
