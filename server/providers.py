"""A fictional provider catalogue (demo data) and slot availability.

Availability is deterministic: the same provider and day always give the same slots.
The server is the source of truth; the page asks for it and the booking endpoint re-checks it.
"""
from datetime import date, datetime, timedelta

FIRST_SLOT, LAST_SLOT, SLOT_STEP = 600, 1050, 30   # 10:00 to 17:30, every 30 minutes

PROVIDERS = [
    {"id": "iyer", "name": "Dr. Meera Iyer", "ini": "MI", "g": "F", "spec": "Gynaecologist",
     "degrees": "MBBS, MS (Obstetrics & Gynaecology)",
     "focus": ["PCOS & hormonal health", "Irregular periods", "Preconception counselling"],
     "clinic": "Lotus Women's Clinic", "area": "Indiranagar", "address": "12, 100 Feet Road, Indiranagar, Bengaluru 560038",
     "exp": 14, "langs": ["English", "Hindi", "Kannada"], "fee": 800, "modes": ["In-person", "Video"], "off": [0],
     "hours": "Mon–Sat, 10 am – 6 pm",
     "about": "Works with young women on irregular cycles, PCOS and the link between hormones, sleep and mood. "
              "Keeps visits unhurried and welcomes questions written down beforehand."},
    {"id": "rao", "name": "Dr. Arvind Rao", "ini": "AR", "g": "M", "spec": "Endocrinologist",
     "degrees": "MBBS, MD (General Medicine), DM (Endocrinology)",
     "focus": ["PCOS and insulin resistance", "Thyroid conditions", "Diabetes and pre-diabetes"],
     "clinic": "Sunrise Hormone & Diabetes Centre", "area": "Koramangala", "address": "45, 5th Block, Koramangala, Bengaluru 560095",
     "exp": 11, "langs": ["English", "Kannada", "Telugu"], "fee": 1000, "modes": ["In-person", "Video"], "off": [0, 6],
     "hours": "Mon–Fri, 10 am – 6 pm",
     "about": "Endocrinologist who looks at the metabolic side of PCOS: blood sugar, insulin, thyroid and weight. "
              "Reviews lab trends with patients at every visit."},
    {"id": "menon", "name": "Dr. Nisha Menon", "ini": "NM", "g": "F", "spec": "Psychiatrist",
     "degrees": "MBBS, MD (Psychiatry)",
     "focus": ["Anxiety and stress", "Low mood and depression", "Sleep problems"],
     "clinic": "Calm Minds Clinic", "area": "HSR Layout", "address": "27th Main, Sector 1, HSR Layout, Bengaluru 560102",
     "exp": 9, "langs": ["English", "Malayalam", "Hindi"], "fee": 1200, "modes": ["In-person", "Video"], "off": [0],
     "hours": "Mon–Sat, 11 am – 6 pm",
     "about": "Psychiatrist who treats anxiety and low mood in young professionals. Visits are private, "
              "and appointment reminders carry no clinic name."},
    {"id": "subra", "name": "Karthik Subramanian", "ini": "KS", "g": "M", "spec": "Psychologist",
     "degrees": "M.Phil. (Clinical Psychology)",
     "focus": ["Talk therapy for stress and anxiety", "Burnout and work pressure", "Body image"],
     "clinic": "Mindful Space", "area": "Jayanagar", "address": "4th Block, Jayanagar, Bengaluru 560011",
     "exp": 8, "langs": ["English", "Tamil", "Kannada"], "fee": 900, "modes": ["Video"], "off": [0],
     "hours": "Mon–Sat, 10 am – 6 pm",
     "about": "Clinical psychologist offering video therapy sessions. Works with stress, anxiety and burnout, "
              "and does not prescribe medicines."},
    {"id": "nair", "name": "Priya Nair", "ini": "PN", "g": "F", "spec": "Dietitian",
     "degrees": "M.Sc. (Food & Nutrition), Registered Dietitian",
     "focus": ["PCOS and lifestyle", "Indian meal planning", "Eating habits and shift work"],
     "clinic": "Nourish Nutrition Studio", "area": "Whitefield", "address": "ITPL Main Road, Whitefield, Bengaluru 560066",
     "exp": 7, "langs": ["English", "Hindi"], "fee": 600, "modes": ["In-person", "Video"], "off": [0],
     "hours": "Mon–Sat, 10 am – 5 pm",
     "about": "Builds meal plans around home cooking, delivery orders and irregular work hours, using the foods you already eat."},
    {"id": "khan", "name": "Dr. Farah Khan", "ini": "FK", "g": "F", "spec": "Gynaecologist",
     "degrees": "MBBS, DGO, DNB (Obstetrics & Gynaecology)",
     "focus": ["Menstrual health", "PCOS and acne", "Women's health check-ups"],
     "clinic": "Aarogya Women's Care", "area": "HSR Layout", "address": "14th Main, HSR Layout, Bengaluru 560102",
     "exp": 20, "langs": ["English", "Hindi", "Urdu"], "fee": 700, "modes": ["In-person"], "off": [0, 3],
     "hours": "Mon, Tue, Thu–Sat, 9 am – 4 pm",
     "about": "Experienced gynaecologist for routine and ongoing menstrual and hormonal care, with a calm, no-judgement approach."},
]
BY_ID = {p["id"]: p for p in PROVIDERS}
AREAS = sorted({p["area"] for p in PROVIDERS})

# Dr. Iyer shares a plan with patients who link her (demo content).
PLANS = {
    "iyer": {
        "goals": {"sleep_h": 7, "steps": 7000},
        "diet": [
            ["Breakfast", "Besan chilla with mint chutney, or poha with peanuts and a bowl of curd"],
            ["Lunch", "Roti or a small bowl of rice with dal, a vegetable sabzi and salad"],
            ["Snack", "Roasted chana, a fruit, or a handful of nuts"],
            ["Dinner", "Khichdi or roti with a vegetable curry, eaten before 9 pm where you can"],
        ],
        "videos": [
            ["vBJrfakbMHg", "3:30", "PCOS", "Shocking PCOS Myths You Still Believe!", "Yashoda Hospitals"],
            ["EhgdXrb5YTw", "2:11", "PCOS and food", "Do Foods Affect PCOS? | Dr. MV Jyothsna", "Yashoda Hospitals"],
            ["TjQvhkmpDaQ", "5:40", "Nutrition", "New nutrition guidelines released by ICMR-NIN", "Down To Earth"],
            ["IerdK6L5sv8", "1:42", "Mental health", "Myths and Facts about Mental Health", "American Psychiatric Association"],
        ],
        "updated_days_ago": 21,
    }
}


def _fnv(s):
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def js_weekday(d):
    """Sunday = 0 ... Saturday = 6 (what the page uses)."""
    return (d.weekday() + 1) % 7


def slots_for(provider, d, now=None):
    if js_weekday(d) in provider["off"]:
        return []
    now = now or datetime.now()
    out = []
    for m in range(FIRST_SLOT, LAST_SLOT + 1, SLOT_STEP):
        if _fnv(f"{provider['id']}{d.isoformat()}{m}") % 3 == 0:
            continue
        if d == now.date() and m <= now.hour * 60 + now.minute + 60:
            continue
        out.append(m)
    return out


def availability(provider, taken, days=14, now=None):
    """{date: [minutes...]} for the next `days` days, minus slots already booked (taken = set of (date, minute))."""
    now = now or datetime.now()
    out = {}
    for i in range(days):
        d = now.date() + timedelta(days=i)
        out[d.isoformat()] = [m for m in slots_for(provider, d, now) if (d.isoformat(), m) not in taken]
    return out
