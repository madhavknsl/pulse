"""Fixed definitions shared by the API: what can be chosen, and what each thing means."""

CITY_LAUNCH = "Bengaluru"
CITIES = ["Bengaluru", "Elsewhere in India"]
SEX = ["Female", "Male", "Intersex", "Prefer not to say"]
LANGUAGES = ["English", "हिन्दी (Hindi)", "ಕನ್ನಡ (Kannada)"]

# What a doctor can be given access to. Journal chats are deliberately not on this list: never shareable.
SHARE_KEYS = ["profile", "mood", "sleep", "activity", "cycle", "weight", "meals", "meds", "labs"]
EXPIRY = ["Until I stop it", "30 days", "90 days"]
SHARE_LABELS = {
    "profile": "Basic details & health background", "mood": "Mood, stress & questionnaires", "sleep": "Sleep, heart rate & SpO₂",
    "activity": "Steps & workouts", "cycle": "Cycle & symptoms", "weight": "Weight & waist", "meals": "Meals",
    "meds": "Medication log", "labs": "Lab reports",
}

# Explicit consent, one per kind of data (DPDP-style: separate, specific, withdrawable).
CONSENT_KINDS = ["terms", "health_basics", "mental_health", "cycle_symptoms", "wearable", "meals_meds"]
CONSENT_REQUIRED = ["terms", "health_basics"]
CONSENT_VERSION = "v1"

# Questionnaires: item counts and score ceilings (PHQ-9, GAD-7). Each answer is 0-3.
QUESTIONNAIRES = {"phq9": {"items": 9, "max": 27}, "gad7": {"items": 7, "max": 21}}

# Onboarding offers only what fits the launch beachhead. Everything else is shown as "coming soon".
LIFESTYLE_AVAILABLE = ["irregular_sleep", "work_stress", "desk_job", "orders_food", "uses_wearable", "prefers_privacy"]
STRESS_SOURCES_AVAILABLE = ["Work pressure", "Health worries"]
STRESS_DURATIONS = ["Less than a month", "1 to 6 months", "More than 6 months"]
PCOS_STATUS = ["Diagnosed by a doctor", "I think I may have it"]

DIETS = ["Vegetarian", "Eggetarian", "Non-vegetarian", "Vegan", "Jain", "Other"]
WORKS = ["Desk job", "Hybrid", "Shift work", "Night shifts", "Student", "Homemaker", "Other"]
FAMILY = ["Type 2 diabetes", "Thyroid condition", "High blood pressure", "Heart disease", "PCOS",
          "Depression or anxiety", "Cancer (any type)"]

FLOWS = ["spotting", "light", "medium", "heavy"]
SYMPTOMS = ["Acne", "Unwanted hair growth", "Hair thinning", "Fatigue", "Bloating", "Pelvic pain", "Headache",
            "Cravings", "Low energy", "Breast tenderness"]
TAGS = ["Late meal", "Ordered in", "Skipped workout", "Deadline day", "Caffeine", "Alcohol", "Travel", "Poor sleep",
        "Period day", "Spoke to someone I trust"]
MEAL_TYPES = ["Breakfast", "Lunch", "Snack", "Dinner"]
MEAL_SOURCES = ["Home-cooked", "Ordered in", "Eaten out", "Skipped"]
WORKOUT_TYPES = ["Walk", "Run", "Strength", "Yoga", "Cycling", "Dance", "Other"]
REASONS = ["First consultation", "PCOS follow-up", "Mood & stress", "Lab review", "Other"]

# Lab tests the app understands: analyte names and units. (The doctor's reference range is typed from the report.)
TESTS = {
    "hba1c": {"name": "HbA1c", "analytes": [("HbA1c", "%")]},
    "insulin": {"name": "Fasting insulin", "analytes": [("Fasting insulin", "µIU/mL")]},
    "lipid": {"name": "Lipid profile", "analytes": [("Total cholesterol", "mg/dL"), ("LDL", "mg/dL"),
                                                      ("HDL", "mg/dL"), ("Triglycerides", "mg/dL")]},
    "tsh": {"name": "TSH", "analytes": [("TSH", "mIU/L")]},
    "vitd": {"name": "Vitamin D (25-OH)", "analytes": [("Vitamin D", "ng/mL")]},
    "other": {"name": "Other report", "analytes": []},
}

DEFAULT_NOTIFICATIONS = {
    "on": True, "limit": 1,
    "quiet": {"on": True, "from": "22:00", "to": "08:00"},
    "checkin": {"on": True, "time": "21:00"}, "meds": {"on": True, "time": "21:30"},
    "data": True, "weekly": True, "neutral": True,
}
DEFAULT_GOALS = {"sleep_h": 7, "steps": 7000, "weight_kg": None}
DEFAULT_DEVICE = {"connected": False, "last_sync": None, "perms": {"steps": True, "hr": True, "spo2": True, "sleep": True}}
DEFAULT_PLAN = {"price": 399, "status": "active", "renews": None, "method": "UPI"}
DEFAULT_UI = {"hide_numbers": False, "show_bmi": False}
