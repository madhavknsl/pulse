/* Pulse healthcare — static prototype.
   Doctors, appointments, reports and numbers below are SIMULATED demo data held in memory.
   Nothing is stored or sent anywhere. */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  var DAY = 864e5;
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var today = new Date(); today.setHours(0, 0, 0, 0);
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function sameDay(a, b) { return key(a) === key(b); }
  function fmtDate(d) { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
  function fmtLong(d) { return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function fmtWdDate(d) { return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function fmtMin(m) { var h = Math.floor(m / 60), mm = m % 60; return ((h % 12) || 12) + ':' + pad(mm) + ' ' + (h >= 12 ? 'PM' : 'AM'); }
  function nowMin() { var n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rel(d) {
    var n = Math.round((today - d) / DAY);
    if (n <= 0) return 'today'; if (n === 1) return 'yesterday'; if (n < 30) return n + ' days ago';
    return fmtDate(d);
  }
  function setMsg(id, text, isErr) { var el = $(id); el.textContent = text; el.className = 'msg-line' + (isErr ? ' err' : ''); }

  /* ---------- icons + navigation ---------- */
  var ICON = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.2c2.6.3 4.5 2.5 4.5 5.3"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 19a1.6 1.6 0 0 0 1.4 2.4h12.2a1.6 1.6 0 0 0 1.4-2.4L14 9V3"/><path d="M7.5 15h9"/>',
    clip: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    back: '<path d="M15 6l-6 6 6 6"/>'
  };
  function svg(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + '</svg>'; }
  var NAV = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { group: 'Find care' },
    { id: 'providers', label: 'Providers', icon: 'users' },
    { id: 'appointments', label: 'Appointments', icon: 'calendar' },
    { group: 'Records' },
    { id: 'reports', label: 'Reports', icon: 'flask' },
    { id: 'plan', label: "Doctor's plan", icon: 'clip' },
    { id: 'summary', label: 'Pre-visit summary', icon: 'file' },
    { group: 'Privacy' },
    { id: 'sharing', label: 'Sharing & privacy', icon: 'shield' }
  ];
  var LABEL = {}; NAV.forEach(function (n) { if (n.id) LABEL[n.id] = n.label; });
  (function () {
    var h = '<a class="side-link side-home" href="user.html" title="Home"><span class="side-ico">' + svg('back') + '</span><span class="side-label">Home</span></a>';
    NAV.forEach(function (n) {
      if (n.group) h += '<div class="side-group">' + esc(n.group) + '</div>';
      else h += '<a class="side-link" href="#' + n.id + '" data-id="' + n.id + '" title="' + esc(n.label) + '"><span class="side-ico">' + svg(n.icon) + '</span><span class="side-label">' + esc(n.label) + '</span></a>';
    });
    $('#sidebar').innerHTML = h;
  })();

  /* ---------- simulated providers (fictional) ---------- */
  var DOCS = [
    { id: 'iyer', name: 'Dr. Meera Iyer', ini: 'MI', g: 'F', spec: 'Gynaecologist', degrees: 'MBBS, MS (Obstetrics & Gynaecology)',
      focus: ['PCOS & hormonal health', 'Irregular periods', 'Preconception counselling'], clinic: "Lotus Women's Clinic", area: 'Indiranagar',
      address: '12, 100 Feet Road, Indiranagar, Bengaluru 560038', exp: 14, langs: ['English', 'Hindi', 'Kannada'], fee: 800, modes: ['In-person', 'Video'], off: [0], hours: 'Mon–Sat, 10 am – 6 pm',
      about: 'Works with young women on irregular cycles, PCOS and the link between hormones, sleep and mood. Keeps visits unhurried and welcomes questions written down beforehand.' },
    { id: 'rao', name: 'Dr. Arvind Rao', ini: 'AR', g: 'M', spec: 'Endocrinologist', degrees: 'MBBS, MD (General Medicine), DM (Endocrinology)',
      focus: ['PCOS and insulin resistance', 'Thyroid conditions', 'Diabetes and pre-diabetes'], clinic: 'Sunrise Hormone & Diabetes Centre', area: 'Koramangala',
      address: '45, 5th Block, Koramangala, Bengaluru 560095', exp: 11, langs: ['English', 'Kannada', 'Telugu'], fee: 1000, modes: ['In-person', 'Video'], off: [0, 6], hours: 'Mon–Fri, 10 am – 6 pm',
      about: 'Endocrinologist who looks at the metabolic side of PCOS: blood sugar, insulin, thyroid and weight. Reviews lab trends with patients at every visit.' },
    { id: 'menon', name: 'Dr. Nisha Menon', ini: 'NM', g: 'F', spec: 'Psychiatrist', degrees: 'MBBS, MD (Psychiatry)',
      focus: ['Anxiety and stress', 'Low mood and depression', 'Sleep problems'], clinic: 'Calm Minds Clinic', area: 'HSR Layout',
      address: '27th Main, Sector 1, HSR Layout, Bengaluru 560102', exp: 9, langs: ['English', 'Malayalam', 'Hindi'], fee: 1200, modes: ['In-person', 'Video'], off: [0], hours: 'Mon–Sat, 11 am – 6 pm',
      about: 'Psychiatrist who treats anxiety and low mood in young professionals. Visits are private, and appointment reminders carry no clinic name.' },
    { id: 'subra', name: 'Karthik Subramanian', ini: 'KS', g: 'M', spec: 'Psychologist', degrees: 'M.Phil. (Clinical Psychology)',
      focus: ['Talk therapy for stress and anxiety', 'Burnout and work pressure', 'Body image'], clinic: 'Mindful Space', area: 'Jayanagar',
      address: '4th Block, Jayanagar, Bengaluru 560011', exp: 8, langs: ['English', 'Tamil', 'Kannada'], fee: 900, modes: ['Video'], off: [0], hours: 'Mon–Sat, 10 am – 6 pm',
      about: 'Clinical psychologist offering video therapy sessions. Works with stress, anxiety and burnout, and does not prescribe medicines.' },
    { id: 'nair', name: 'Priya Nair', ini: 'PN', g: 'F', spec: 'Dietitian', degrees: 'M.Sc. (Food & Nutrition), Registered Dietitian',
      focus: ['PCOS and lifestyle', 'Indian meal planning', 'Eating habits and shift work'], clinic: 'Nourish Nutrition Studio', area: 'Whitefield',
      address: 'ITPL Main Road, Whitefield, Bengaluru 560066', exp: 7, langs: ['English', 'Hindi'], fee: 600, modes: ['In-person', 'Video'], off: [0], hours: 'Mon–Sat, 10 am – 5 pm',
      about: 'Builds meal plans around home cooking, delivery orders and irregular work hours, using the foods you already eat.' },
    { id: 'khan', name: 'Dr. Farah Khan', ini: 'FK', g: 'F', spec: 'Gynaecologist', degrees: 'MBBS, DGO, DNB (Obstetrics & Gynaecology)',
      focus: ['Menstrual health', 'PCOS and acne', 'Women\'s health check-ups'], clinic: 'Aarogya Women\'s Care', area: 'HSR Layout',
      address: '14th Main, HSR Layout, Bengaluru 560102', exp: 20, langs: ['English', 'Hindi', 'Urdu'], fee: 700, modes: ['In-person'], off: [0, 3], hours: 'Mon, Tue, Thu–Sat, 9 am – 4 pm',
      about: 'Experienced gynaecologist for routine and ongoing menstrual and hormonal care, with a calm, no-judgement approach.' }
  ];
  function doc(id) { return DOCS.filter(function (d) { return d.id === id; })[0]; }
  var SPECS = ['All', 'Gynaecologist', 'Endocrinologist', 'Psychiatrist', 'Psychologist', 'Dietitian'];
  var REASONS = ['First consultation', 'PCOS follow-up', 'Mood & stress', 'Lab review', 'Other'];

  /* ---------- sharing model ---------- */
  var SHARE = [
    { k: 'mood', label: 'Mood, stress & questionnaires', sub: 'Daily mood, stress rating, PHQ-9 and GAD-7' },
    { k: 'sleep', label: 'Sleep, heart rate & SpO₂', sub: 'From your watch' },
    { k: 'activity', label: 'Steps & workouts', sub: '' },
    { k: 'cycle', label: 'Cycle & symptoms', sub: 'Periods, symptoms and day tags' },
    { k: 'weight', label: 'Weight & waist', sub: '' },
    { k: 'meals', label: 'Meals', sub: 'Type, time and where from' },
    { k: 'meds', label: 'Medication log', sub: 'Taken or missed' },
    { k: 'labs', label: 'Lab reports', sub: 'Values and files you add' }
  ];
  var EXPIRY = ['Until I stop it', '30 days', '90 days'];
  function countOn(sh) { return SHARE.filter(function (s) { return sh[s.k]; }).length; }

  /* ---------- state ---------- */
  var apptId = 0;
  function appt(docId, dayOffset, min, mode, reason, status) { return { id: ++apptId, doc: docId, date: addDays(today, dayOffset), min: min, mode: mode, reason: reason, status: status || 'upcoming' }; }
  var state = {
    filters: { spec: 'All', lang: '', mode: '', gender: '', today: false },
    open: null, book: {}, consent: null,
    appts: [appt('iyer', 7, 17 * 60, 'In-person', 'PCOS follow-up'), appt('iyer', -21, 17 * 60 + 30, 'In-person', 'PCOS follow-up', 'done'), appt('rao', -68, 11 * 60, 'Video', 'Lab review', 'done')],
    resched: null, cancelAsk: null,
    linked: { iyer: { share: { mood: true, sleep: true, activity: true, cycle: true, weight: true, meals: false, meds: true, labs: true }, expires: 'Until I stop it', since: addDays(today, -60) } },
    log: [
      { t: addDays(today, -3), text: 'Dr. Meera Iyer viewed your pre-visit summary' },
      { t: addDays(today, -20), text: 'Dr. Meera Iyer viewed your lab reports' },
      { t: addDays(today, -60), text: 'You linked Dr. Meera Iyer and chose what to share' }
    ],
    questions: ['Could my short nights be linked to my low-mood days?', 'Does the change in my cycle length matter for my care plan?'],
    summaryDoc: 'iyer', summaryShared: {},
    diet: {}, upFields: null,
    emergency: { name: '', rel: '', phone: '', consent: false, doc: false }
  };

  /* labs */
  var TESTS = {
    hba1c: { name: 'HbA1c', analytes: [{ k: 'HbA1c', unit: '%' }] },
    insulin: { name: 'Fasting insulin', analytes: [{ k: 'Fasting insulin', unit: 'µIU/mL' }] },
    lipid: { name: 'Lipid profile', analytes: [{ k: 'Total cholesterol', unit: 'mg/dL' }, { k: 'LDL', unit: 'mg/dL' }, { k: 'HDL', unit: 'mg/dL' }, { k: 'Triglycerides', unit: 'mg/dL' }] },
    tsh: { name: 'TSH', analytes: [{ k: 'TSH', unit: 'mIU/L' }] },
    vitd: { name: 'Vitamin D (25-OH)', analytes: [{ k: 'Vitamin D', unit: 'ng/mL' }] },
    other: { name: 'Other report', analytes: [] }
  };
  state.tests = [
    { id: 'hba1c', status: 'ordered', ordered: addDays(today, -12), due: addDays(today, 5) },
    { id: 'insulin', status: 'ordered', ordered: addDays(today, -12), due: addDays(today, 5) },
    { id: 'lipid', status: 'uploaded', ordered: addDays(today, -12), when: addDays(today, -5) },
    { id: 'tsh', status: 'reviewed', ordered: addDays(today, -70), when: addDays(today, -58) },
    { id: 'vitd', status: 'reviewed', ordered: addDays(today, -70), when: addDays(today, -58) }
  ];
  function R(test, ago, vals, ranges) { return { test: test, date: addDays(today, -ago), values: vals, ranges: ranges }; }
  state.results = [
    R('hba1c', 190, { 'HbA1c': 5.5 }, { 'HbA1c': [4.0, 5.6] }),
    R('tsh', 190, { 'TSH': 2.9 }, { 'TSH': [0.4, 4.0] }), R('tsh', 60, { 'TSH': 3.1 }, { 'TSH': [0.4, 4.0] }),
    R('vitd', 190, { 'Vitamin D': 18 }, { 'Vitamin D': [30, 100] }), R('vitd', 60, { 'Vitamin D': 24 }, { 'Vitamin D': [30, 100] }),
    R('lipid', 190, { 'Total cholesterol': 190, 'LDL': 124, 'HDL': 44, 'Triglycerides': 150 }, { 'Total cholesterol': [null, 200], 'LDL': [null, 100], 'HDL': [40, null], 'Triglycerides': [null, 150] }),
    R('lipid', 5, { 'Total cholesterol': 182, 'LDL': 118, 'HDL': 46, 'Triglycerides': 142 }, { 'Total cholesterol': [null, 200], 'LDL': [null, 100], 'HDL': [40, null], 'Triglycerides': [null, 150] })
  ];

  /* ---------- appointment slots (deterministic demo availability) ---------- */
  function slotsFor(d, date) {
    if (d.off.indexOf(date.getDay()) >= 0) return [];
    var out = [];
    for (var m = 600; m <= 1050; m += 30) {
      if (hash(d.id + key(date) + m) % 3 === 0) continue;
      if (sameDay(date, today) && m <= nowMin() + 60) continue;
      out.push(m);
    }
    return out;
  }
  function taken(d, date, m, exceptId) {
    return state.appts.some(function (a) { return a.status === 'upcoming' && a.id !== exceptId && a.doc === d.id && sameDay(a.date, date) && a.min === m; });
  }
  function nextSlot(d) {
    for (var i = 0; i < 14; i++) {
      var dt = addDays(today, i), s = slotsFor(d, dt).filter(function (m) { return !taken(d, dt, m); });
      if (s.length) return (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : fmtWdDate(dt)) + ', ' + fmtMin(s[0]);
    }
    return 'No slots soon';
  }
  function hasSlotToday(d) { return slotsFor(d, today).some(function (m) { return !taken(d, today, m); }); }

  /* ---------- calendar file (.ics) ---------- */
  function downloadIcs(a) {
    var d = doc(a.doc), st = new Date(a.date); st.setHours(Math.floor(a.min / 60), a.min % 60, 0, 0);
    var en = new Date(st.getTime() + 30 * 60000);
    function f(x) { return x.getFullYear() + pad(x.getMonth() + 1) + pad(x.getDate()) + 'T' + pad(x.getHours()) + pad(x.getMinutes()) + '00'; }
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pulse//Prototype//EN', 'BEGIN:VEVENT', 'UID:pulse-' + a.id + '@demo.invalid',
      'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(st), 'DTEND:' + f(en), 'SUMMARY:Appointment',
      'LOCATION:' + (a.mode === 'Video' ? 'Video call' : d.area + ', Bengaluru'), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), link = document.createElement('a');
    link.href = url; link.download = 'appointment.ics'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var RENDER = {};
  function logAdd(text) { state.log.unshift({ t: new Date(), text: text }); }
  function linkedDocs() { return Object.keys(state.linked).map(doc); }

  /* ---------- overview ---------- */
  RENDER.overview = function () {
    var ld = linkedDocs();
    $('#ov-team').innerHTML = '<h2>Your care team</h2>' + (ld.length ? ld.map(function (d) {
      var l = state.linked[d.id];
      return '<div class="item-top" style="margin-top:14px"><span class="avatar-lg avatar-md" aria-hidden="true">' + d.ini + '</span><div class="grow"><strong>' + esc(d.name) + '</strong><span class="meta">' + esc(d.spec) + ' · sharing ' + countOn(l.share) + ' of ' + SHARE.length + ' data types</span></div></div>';
    }).join('') + '<a class="card-link" href="#sharing">Manage sharing</a>' : '<p class="empty">No doctor linked yet.</p><a class="card-link" href="#providers">Find a doctor</a>');

    var next = state.appts.filter(function (a) { return a.status === 'upcoming'; }).sort(function (a, b) { return a.date - b.date || a.min - b.min; })[0];
    $('#ov-next').innerHTML = '<h2>Next appointment</h2>' + (next ? (function () {
      var d = doc(next.doc), shared = state.summaryShared[next.doc];
      return '<div class="item-top" style="margin-top:14px"><span class="avatar-lg avatar-md" aria-hidden="true">' + d.ini + '</span><div class="grow"><strong>' + esc(d.name) + '</strong><span class="meta">' + fmtLong(next.date) + ' · ' + fmtMin(next.min) + '</span><span class="meta">' + esc(next.mode) + ' · ' + esc(next.reason) + '</span></div></div>' +
        '<p class="fine" style="margin-top:10px">' + state.questions.length + ' question' + (state.questions.length === 1 ? '' : 's') + ' ready · summary ' + (shared ? 'shared ' + rel(shared) : 'not shared yet') + '</p><a class="card-link" href="#appointments">View appointments</a>';
    })() : '<p class="empty">Nothing booked.</p><a class="card-link" href="#providers">Book a visit</a>');

    var wait = state.tests.filter(function (t) { return t.status === 'ordered'; });
    $('#ov-labs').innerHTML = '<h2>Reports</h2>' + (wait.length ? '<p class="muted" style="margin-top:6px">' + wait.length + ' test' + (wait.length === 1 ? '' : 's') + ' waiting for your results:</p><p style="margin-top:6px;font-weight:700;color:var(--navy)">' + wait.map(function (t) { return esc(TESTS[t.id].name); }).join(', ') + '</p>' : '<p class="empty">Nothing waiting. You are up to date.</p>') + '<a class="card-link" href="#reports">Go to reports</a>';

    var sd = state.linked[state.summaryDoc] ? doc(state.summaryDoc) : (ld[0] || null);
    $('#ov-sum').innerHTML = '<h2>Pre-visit summary</h2>' + (sd ? '<p class="muted" style="margin-top:6px">A one-page summary for ' + esc(sd.name) + ', built from what you share.</p><p class="fine" style="margin-top:6px">' + (state.summaryShared[sd.id] ? 'Shared ' + rel(state.summaryShared[sd.id]) + '.' : 'Not shared yet.') + '</p>' : '<p class="empty">Link a doctor to prepare a summary.</p>') + '<a class="card-link" href="#summary">Open summary</a>';
  };

  /* ---------- providers ---------- */
  function matches(d) {
    var f = state.filters;
    if (f.spec !== 'All' && d.spec !== f.spec) return false;
    if (f.lang && d.langs.indexOf(f.lang) < 0) return false;
    if (f.mode && d.modes.indexOf(f.mode) < 0) return false;
    if (f.gender && d.g !== f.gender) return false;
    if (f.today && !hasSlotToday(d)) return false;
    return true;
  }
  function bookState(d) {
    var b = state.book[d.id];
    if (!b) b = state.book[d.id] = { mode: d.modes[0], date: null, time: null, reason: '', share: false, done: null, err: '' };
    if (!b.date) {
      for (var i = 0; i < 14; i++) { var dt = addDays(today, i); if (slotsFor(d, dt).length) { b.date = key(dt); break; } }
    }
    return b;
  }
  function dateStrip(d, selKey, attr, exceptId) {
    var h = '<div class="date-strip" role="group" aria-label="Choose a day">';
    for (var i = 0; i < 7; i++) {
      var dt = addDays(today, i), n = slotsFor(d, dt).filter(function (m) { return !taken(d, dt, m, exceptId); }).length;
      h += '<button type="button" class="date-btn" ' + attr + '="' + key(dt) + '" data-fk="' + d.id + '|date-' + key(dt) + '" aria-pressed="' + (key(dt) === selKey) + '"' + (n ? '' : ' disabled') + '><span>' + (i === 0 ? 'Today' : dt.toLocaleDateString('en-IN', { weekday: 'short' })) + '</span><b>' + dt.getDate() + '</b></button>';
    }
    return h + '</div>';
  }
  function slotGrid(d, selKey, selMin, attr, exceptId) {
    var date = parseKey(selKey), s = slotsFor(d, date);
    if (!s.length) return '<p class="empty">No slots this day. Try another.</p>';
    return '<div class="slots" role="group" aria-label="Choose a time">' + s.map(function (m) {
      var t = taken(d, date, m, exceptId);
      return '<button type="button" class="slot" ' + attr + '="' + m + '" data-fk="' + d.id + '|slot-' + m + '" aria-pressed="' + (m === selMin) + '"' + (t ? ' disabled' : '') + '>' + fmtMin(m) + '</button>';
    }).join('') + '</div>';
  }

  function consentPanel(d) {
    var c = state.consent;
    return '<div class="consent-box"><h3>Link ' + esc(d.name) + ' as your doctor</h3>' +
      '<p class="fine" style="margin:4px 0 8px">Choose what this provider can see. You can change it any time. Journal chats are never shared.</p>' +
      SHARE.map(function (s) {
        return '<label class="perm" style="cursor:pointer"><span class="grow"><strong>' + esc(s.label) + '</strong>' + (s.sub ? '<span class="meta">' + esc(s.sub) + '</span>' : '') + '</span>' +
          '<span class="switch"><input type="checkbox" data-cshare="' + s.k + '" data-fk="' + d.id + '|cs-' + s.k + '"' + (c.share[s.k] ? ' checked' : '') + '><span></span></span></label>';
      }).join('') +
      '<div class="field" style="margin-top:12px"><label for="c-exp-' + d.id + '">Access lasts</label><select class="input" id="c-exp-' + d.id + '" data-cexp>' + EXPIRY.map(function (e) { return '<option' + (c.expires === e ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select></div>' +
      '<p class="fine" style="margin-top:10px">You can change or stop this any time in Sharing &amp; privacy.</p>' +
      '<div class="btn-row"><button class="btn btn-inline btn-sm" type="button" data-link-ok="' + d.id + '">Link and share</button><button class="btn-outline-sm" type="button" data-link-cancel="' + d.id + '">Cancel</button></div></div>';
  }

  function bookPanel(d) {
    var b = bookState(d), linked = !!state.linked[d.id];
    if (b.done) {
      var a = b.done;
      return '<div class="book"><div class="confirm-box"><strong>Booked.</strong><p style="margin-top:6px">' + fmtLong(a.date) + ' at ' + fmtMin(a.min) + '<br>' + esc(a.mode) + ' · ' + esc(a.reason) + '</p>' +
        (a.shared ? '<p class="fine" style="margin-top:6px">Your pre-visit summary was shared with ' + esc(d.name) + '.</p>' : '') +
        '<div class="btn-row"><button class="btn-outline-sm" type="button" data-ics="' + a.id + '">Add to calendar</button><a class="btn-outline-sm" href="#appointments" style="display:inline-flex;align-items:center;text-decoration:none">View appointments</a><button class="btn-outline-sm" type="button" data-book-again="' + d.id + '">Book another</button></div></div></div>';
    }
    var h = '<div class="book"><h3>Book an appointment</h3>';
    if (d.modes.length > 1) h += '<div class="chips" role="group" aria-label="Visit type">' + d.modes.map(function (m) { return '<button type="button" class="chip-btn" data-bmode="' + m + '" data-fk="' + d.id + '|mode-' + m + '" aria-pressed="' + (b.mode === m) + '">' + m + '</button>'; }).join('') + '</div>';
    else h += '<p class="fine">' + d.modes[0] + ' visits only</p>';
    h += b.date ? dateStrip(d, b.date, 'data-bdate') + slotGrid(d, b.date, b.time, 'data-btime') : '<p class="empty">No slots in the next two weeks.</p>';
    h += '<div class="field" style="margin-top:14px"><label for="reason-' + d.id + '">Reason for visit</label><select class="input" id="reason-' + d.id + '" data-breason data-fk="' + d.id + '|reason"><option value="">Choose one</option>' + REASONS.map(function (r) { return '<option' + (b.reason === r ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></div>';
    h += '<label class="check-row"><input type="checkbox" data-bshare data-fk="' + d.id + '|share"' + (b.share && linked ? ' checked' : '') + (linked ? '' : ' disabled') + '> <span>Share my pre-visit summary with this doctor' + (linked ? '' : '<br><span class="fine">Link this doctor first to share your data.</span>') + '</span></label>';
    h += '<p class="msg-line' + (b.err ? ' err' : '') + '" role="status">' + esc(b.err) + '</p>';
    h += '<button class="btn btn-inline" type="button" data-bconfirm="' + d.id + '" data-fk="' + d.id + '|confirm">Confirm booking · ₹' + d.fee + '</button><p class="fine" style="margin-top:8px">Pay at the clinic. Online payment isn\'t part of this prototype.</p></div>';
    return h;
  }

  function docBody(d) {
    var linked = !!state.linked[d.id];
    var info = '<dl class="kv">' +
      '<div><dt>About</dt><dd>' + esc(d.about) + '</dd></div>' +
      '<div><dt>Qualifications</dt><dd>' + esc(d.degrees) + ' · ' + d.exp + ' years of experience</dd></div>' +
      '<div><dt>Focus areas</dt><dd><span class="chips" style="margin:4px 0 0">' + d.focus.map(function (f) { return '<span class="pill">' + esc(f) + '</span>'; }).join('') + '</span></dd></div>' +
      '<div><dt>Clinic</dt><dd><strong>' + esc(d.clinic) + '</strong><br>' + esc(d.address) + '<br><span class="muted">' + esc(d.hours) + '</span></dd></div>' +
      '<div><dt>Languages</dt><dd>' + esc(d.langs.join(', ')) + '</dd></div>' +
      '<div><dt>Consultation fee</dt><dd>₹' + d.fee + ' · ' + esc(d.modes.join(' or ')) + '</dd></div>' +
      '<div><dt>Registration</dt><dd class="muted">Medical registration is verified before a provider is listed (demo)</dd></div></dl>' +
      '<div class="btn-row" style="margin-top:16px">' + (linked ? '<span class="st uploaded">Linked as your doctor</span><a class="btn-outline-sm" href="#sharing" style="display:inline-flex;align-items:center;text-decoration:none">Manage sharing</a>'
        : '<button class="btn-outline-sm" type="button" data-link-open="' + d.id + '" data-fk="' + d.id + '|link">Link as my doctor</button>') + '</div>' +
      (state.consent && state.consent.doc === d.id ? consentPanel(d) : '');
    return '<div class="doc-body" id="body-' + d.id + '"><div>' + info + '</div>' + bookPanel(d) + '</div>';
  }

  function docCard(d) {
    var open = state.open === d.id, linked = !!state.linked[d.id];
    return '<article class="doc' + (open ? ' open' : '') + '" data-doc="' + d.id + '">' +
      '<button type="button" class="doc-head" aria-expanded="' + open + '" aria-controls="body-' + d.id + '" data-toggle="' + d.id + '" data-fk="' + d.id + '|head">' +
      '<span class="avatar-lg" aria-hidden="true">' + d.ini + '</span><span class="doc-main">' +
      '<span class="doc-name" style="display:block">' + esc(d.name) + '</span><span class="doc-deg" style="display:block">' + esc(d.degrees) + '</span>' +
      '<span class="doc-spec"><span class="pill">' + esc(d.spec) + '</span>' + (linked ? '<span class="st uploaded">Linked</span>' : '') + '</span>' +
      '<span class="doc-meta"><span>' + esc(d.clinic) + ', ' + esc(d.area) + '</span><span>' + d.exp + ' yrs</span><span>₹' + d.fee + '</span><span>' + esc(d.modes.join(' · ')) + '</span><span>Next: ' + esc(nextSlot(d)) + '</span></span></span>' +
      '<svg class="doc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>' +
      (open ? docBody(d) : '') + '</article>';
  }

  var focusKey = null;
  function keepFocus() { var a = document.activeElement; focusKey = a && a.getAttribute ? a.getAttribute('data-fk') : null; }
  function restoreFocus() { if (!focusKey) return; var el = document.querySelector('[data-fk="' + focusKey + '"]'); if (el && !el.disabled) el.focus(); focusKey = null; }

  RENDER.providers = function () {
    $('#f-spec').innerHTML = SPECS.map(function (s) { return '<button type="button" class="chip-btn" data-spec="' + s + '" aria-pressed="' + (state.filters.spec === s) + '">' + s + '</button>'; }).join('');
    var list = DOCS.filter(matches);
    $('#doc-count').textContent = list.length + ' provider' + (list.length === 1 ? '' : 's') + ' in Bengaluru';
    $('#doc-list').innerHTML = list.length ? list.map(docCard).join('') : '<div class="card"><p class="empty">No providers match these filters. Try removing one.</p></div>';
    restoreFocus();
  };
  function refreshProviders() { keepFocus(); RENDER.providers(); }

  /* ---------- appointments ---------- */
  function apptCard(a) {
    var d = doc(a.doc), up = a.status === 'upcoming', shared = state.summaryShared[a.doc], linked = !!state.linked[a.doc];
    var h = '<div class="item-card" data-appt="' + a.id + '"><div class="item-top"><span class="avatar-lg avatar-md" aria-hidden="true">' + d.ini + '</span><div class="grow"><strong>' + esc(d.name) + ' · ' + esc(d.spec) + '</strong>' +
      '<span class="meta">' + fmtLong(a.date) + ' · ' + fmtMin(a.min) + '</span><span class="meta">' + esc(a.mode) + ' · ' + esc(a.reason) + (a.mode === 'In-person' ? ' · ' + esc(d.clinic) + ', ' + esc(d.area) : '') + '</span></div>' +
      '<span class="st ' + (a.status === 'cancelled' ? 'cancelled' : up ? 'ordered' : 'reviewed') + '">' + (a.status === 'cancelled' ? 'Cancelled' : up ? 'Upcoming' : 'Completed') + '</span></div>';
    if (up) {
      h += '<p class="fine">' + state.questions.length + ' question' + (state.questions.length === 1 ? '' : 's') + ' ready · summary ' + (shared ? 'shared ' + rel(shared) : 'not shared yet') + '</p>';
      if (state.cancelAsk === a.id) {
        h += '<div class="confirm-box"><strong>Cancel this appointment?</strong><div class="btn-row"><button class="btn-danger-sm" type="button" data-cancel-yes="' + a.id + '">Yes, cancel it</button><button class="btn-outline-sm" type="button" data-cancel-no>Keep it</button></div></div>';
      } else if (state.resched && state.resched.id === a.id) {
        var r = state.resched;
        h += '<div class="confirm-box"><strong>Pick a new time</strong>' + dateStrip(d, r.date, 'data-rdate', a.id) + slotGrid(d, r.date, r.min, 'data-rtime', a.id) +
          '<div class="btn-row"><button class="btn btn-inline btn-sm" type="button" data-resched-ok="' + a.id + '"' + (r.min ? '' : ' disabled') + '>Confirm new time</button><button class="btn-outline-sm" type="button" data-resched-no>Never mind</button></div></div>';
      } else {
        h += '<div class="btn-row" style="margin-top:0"><button class="btn-outline-sm" type="button" data-ics="' + a.id + '">Add to calendar</button><button class="btn-outline-sm" type="button" data-resched="' + a.id + '">Reschedule</button><button class="btn-danger-sm" type="button" data-cancel="' + a.id + '">Cancel</button>' +
          (linked && !shared ? '<button class="btn-outline-sm" type="button" data-share-sum="' + a.doc + '">Share pre-visit summary</button>' : '') + '</div>';
      }
    }
    return h + '</div>';
  }
  RENDER.appointments = function () {
    var up = state.appts.filter(function (a) { return a.status === 'upcoming'; }).sort(function (a, b) { return a.date - b.date || a.min - b.min; });
    var past = state.appts.filter(function (a) { return a.status !== 'upcoming'; }).sort(function (a, b) { return b.date - a.date; });
    $('#appt-up').innerHTML = up.length ? up.map(apptCard).join('') : '<p class="empty">Nothing booked. <a href="#providers">Find a doctor</a>.</p>';
    $('#appt-past').innerHTML = past.length ? past.map(apptCard).join('') : '<p class="empty">No past visits yet.</p>';
    $('#q-list').innerHTML = state.questions.length ? state.questions.map(function (q, i) {
      return '<div class="row-item"><div class="grow">' + esc(q) + '</div><button class="x-btn" type="button" data-qdel="' + i + '" aria-label="Remove question">×</button></div>';
    }).join('') : '<p class="empty">No questions yet.</p>';
    restoreFocus();
  };
  function refreshAppts() { keepFocus(); RENDER.appointments(); }

  /* ---------- reports ---------- */
  function rangeText(r) { if (!r) return ''; if (r[0] != null && r[1] != null) return r[0] + '–' + r[1]; if (r[1] != null) return 'up to ' + r[1]; if (r[0] != null) return 'at least ' + r[0]; return ''; }
  function outside(v, r) { return !!r && ((r[0] != null && v < r[0]) || (r[1] != null && v > r[1])); }
  function spark(vals) {
    if (vals.length < 2) return '';
    var W = 160, H = 52, mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), pd = (mx - mn) * 0.25 || 1;
    var pts = vals.map(function (v, i) { return [8 + i * (W - 16) / (vals.length - 1), 6 + (mx + pd - v) * (H - 12) / (mx - mn + 2 * pd)]; });
    var last = pts[pts.length - 1];
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Trend over ' + vals.length + ' results"><path d="' + pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') + '"/><circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="4"/></svg>';
  }
  RENDER.reports = function () {
    var by = doc('iyer');
    $('#tests').innerHTML = state.tests.map(function (t) {
      var def = TESTS[t.id];
      var meta = t.status === 'ordered' ? 'Ordered ' + rel(t.ordered) + ' by ' + esc(by.name) + ' · due by ' + fmtDate(t.due)
        : t.status === 'uploaded' ? 'You added this ' + rel(t.when) + ' · waiting for ' + esc(by.name) + ' to review'
        : 'Reviewed by ' + esc(by.name) + ' ' + rel(t.when);
      return '<div class="item-card"><div class="item-top"><div class="grow"><strong>' + esc(def.name) + '</strong><span class="meta">' + meta + '</span></div><span class="st ' + t.status + '">' + { ordered: 'Ordered', uploaded: 'Uploaded', reviewed: 'Reviewed' }[t.status] + '</span></div>' +
        (t.status === 'ordered' ? '<div><button class="btn-outline-sm" type="button" data-addrep="' + t.id + '">Add report</button></div>' : '') + '</div>';
    }).join('');
    var sel = $('#up-test'), prev = sel.value;
    sel.innerHTML = state.tests.filter(function (t) { return t.status === 'ordered'; }).map(function (t) { return '<option value="' + t.id + '">' + esc(TESTS[t.id].name) + ' (ordered)</option>'; }).join('') + '<option value="other">Other report</option>';
    if (prev && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
    if (!$('#up-date').value) $('#up-date').value = key(today);
    $('#up-date').max = key(today);
    drawFields();
    var cards = '';
    Object.keys(TESTS).forEach(function (tid) {
      TESTS[tid].analytes.forEach(function (an) {
        var rows = state.results.filter(function (r) { return r.test === tid && r.values[an.k] != null; }).sort(function (a, b) { return a.date - b.date; });
        if (!rows.length) return;
        var last = rows[rows.length - 1], v = last.values[an.k], rg = last.ranges && last.ranges[an.k];
        cards += '<div class="lab-card"><div class="k">' + esc(an.k) + '</div><div class="v">' + v + ' <span class="u">' + esc(an.unit) + '</span></div><div class="s">' + fmtDate(last.date) + (rg && rangeText(rg) ? ' · range on report: ' + rangeText(rg) : '') + '</div>' +
          (outside(v, rg) ? '<div class="out">Outside the range on your report. Worth discussing with your doctor.</div>' : '') +
          (rows.length > 1 ? spark(rows.map(function (r) { return r.values[an.k]; })) + '<div class="s">' + rows.length + ' results over time</div>' : '<div class="s">1 result so far</div>') + '</div>';
      });
    });
    $('#labs').innerHTML = cards || '<p class="empty">No results yet.</p>';
  };
  function drawFields() {
    var t = $('#up-test').value, def = TESTS[t] || TESTS.other, box = $('#up-fields');
    if (!def.analytes.length) { box.innerHTML = '<p class="fine" style="margin-top:12px">Add the file above. There are no numbers to type for this one.</p>'; return; }
    box.innerHTML = '<p class="fine" style="margin:14px 0 0">Numbers from the report, with the range printed next to each (optional).</p>' + def.analytes.map(function (an, i) {
      return '<div class="an-row"><div class="field"><label for="an-v-' + i + '">' + esc(an.k) + ' (' + esc(an.unit) + ')</label><input class="input" id="an-v-' + i + '" type="number" inputmode="decimal" step="any" min="0"></div>' +
        '<div class="field"><label for="an-lo-' + i + '">Range from</label><input class="input" id="an-lo-' + i + '" type="number" inputmode="decimal" step="any"></div>' +
        '<div class="field"><label for="an-hi-' + i + '">Range to</label><input class="input" id="an-hi-' + i + '" type="number" inputmode="decimal" step="any"></div></div>';
    }).join('');
  }

  /* ---------- doctor's plan ---------- */
  var DIET = [
    ['Breakfast', 'Besan chilla with mint chutney, or poha with peanuts and a bowl of curd'],
    ['Lunch', 'Roti or a small bowl of rice with dal, a vegetable sabzi and salad'],
    ['Snack', 'Roasted chana, a fruit, or a handful of nuts'],
    ['Dinner', 'Khichdi or roti with a vegetable curry, eaten before 9 pm where you can']
  ];
  var VIDEOS = [
    ['vBJrfakbMHg', '3:30', 'PCOS', 'Shocking PCOS Myths You Still Believe!', 'Yashoda Hospitals'],
    ['EhgdXrb5YTw', '2:11', 'PCOS and food', 'Do Foods Affect PCOS? | Dr. MV Jyothsna', 'Yashoda Hospitals'],
    ['TjQvhkmpDaQ', '5:40', 'Nutrition', 'New nutrition guidelines released by ICMR-NIN', 'Down To Earth'],
    ['IerdK6L5sv8', '1:42', 'Mental health', 'Myths and Facts about Mental Health', 'American Psychiatric Association']
  ];
  RENDER.plan = function () {
    var d = doc('iyer'), l = state.linked.iyer;
    if (!l) { $('#plan-sub').textContent = ''; $('#plan-body').innerHTML = '<div class="card"><p class="empty">No plan yet. A plan appears here once a doctor you have linked shares one. <a href="#providers">Find a doctor</a>.</p></div>'; return; }
    $('#plan-sub').textContent = 'From ' + d.name + ' · updated ' + rel(addDays(today, -21)) + ' · demo content';
    var next = state.appts.filter(function (a) { return a.status === 'upcoming' && a.doc === 'iyer'; }).sort(function (a, b) { return a.date - b.date; })[0];
    var done = DIET.filter(function (m, i) { return state.diet[i]; }).length;
    $('#plan-body').innerHTML = '<div class="stack-grid">' +
      '<div class="card"><h2>Goals from your doctor</h2><div style="margin-top:14px;display:grid;gap:16px">' +
        '<div><div class="row-line" style="display:flex;justify-content:space-between;gap:12px"><b>Sleep</b><span class="muted">7 hours a night · you averaged 6.3 h this week</span></div><div class="bar"><i style="width:90%"></i></div></div>' +
        '<div><div class="row-line" style="display:flex;justify-content:space-between;gap:12px"><b>Steps</b><span class="muted">7,000 a day · you averaged 6,100 this week</span></div><div class="bar"><i style="width:87%"></i></div></div></div>' +
        '<p class="fine" style="margin-top:14px">' + (next ? 'Next review: ' + fmtLong(next.date) + '.' : 'No review booked.') + ' <a href="tracker.html">Open tracker</a></p></div>' +
      '<div class="card"><div class="card-head"><div><h2>Diet plan</h2><p class="sub">A sample day. Tick what you followed today.</p></div><span class="pill">' + done + ' of ' + DIET.length + ' today</span></div>' +
        '<div class="meal-plan" style="margin-top:14px">' + DIET.map(function (m, i) {
          return '<label class="meal-row"><input type="checkbox" data-diet="' + i + '"' + (state.diet[i] ? ' checked' : '') + '><span><strong>' + m[0] + '</strong>' + esc(m[1]) + '</span></label>';
        }).join('') + '</div>' +
        '<p class="fine" style="margin-top:12px">' + (l.share.meals ? esc(d.name) + ' can see this because you share Meals.' : 'Only you can see this. Turn on Meals in Sharing &amp; privacy if you want ' + esc(d.name) + ' to see it.') + '</p></div>' +
      '<div><h2 class="sec-h" style="margin-top:0">Shared by your doctor</h2><p class="fine" style="margin:2px 0 0">Trusted videos on PCOS, food and mental health (demo selection).</p>' +
        '<ul class="videos" style="margin-top:12px">' + VIDEOS.map(function (v) {
          return '<li><a class="video" href="https://www.youtube.com/watch?v=' + v[0] + '" target="_blank" rel="noopener noreferrer"><span class="thumb"><img src="https://i.ytimg.com/vi/' + v[0] + '/mqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">' +
            '<span class="play"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span></span><span class="dur">' + v[1] + '</span></span>' +
            '<span class="video-body"><span class="tag">' + esc(v[2]) + '</span><span class="video-title">' + esc(v[3]) + '</span><span class="video-meta">' + esc(v[4]) + '<span class="visually-hidden"> · opens YouTube</span></span></span></a></li>';
        }).join('') + '</ul></div></div>';
  };

  /* ---------- pre-visit summary ---------- */
  RENDER.summary = function () {
    var ld = linkedDocs(), ctl = $('#sum-controls'), out = $('#sum-doc');
    if (!ld.length) { ctl.innerHTML = '<p class="empty">No doctor linked yet. <a href="#providers">Find a doctor</a> and link them to share a summary.</p>'; out.hidden = true; return; }
    out.hidden = false;
    if (!state.linked[state.summaryDoc]) state.summaryDoc = ld[0].id;
    var d = doc(state.summaryDoc), sh = state.linked[d.id].share, shared = state.summaryShared[d.id];
    ctl.innerHTML = '<div class="form-row" style="margin-top:0"><div class="field"><label for="sum-doc-sel">Prepared for</label><select class="input" id="sum-doc-sel">' +
      ld.map(function (x) { return '<option value="' + x.id + '"' + (x.id === d.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="btn-row" style="margin-top:0"><button class="btn btn-inline" type="button" id="sum-share"' + (shared ? ' disabled' : '') + '>' + (shared ? 'Shared ' + rel(shared) : 'Share with ' + esc(d.name)) + '</button>' +
      '<button class="btn-outline-sm" type="button" id="sum-print">Print or save as PDF</button></div></div>' +
      '<p class="fine" style="margin-top:10px">This summary follows your sharing choices for ' + esc(d.name) + '. <a href="#sharing">Change them</a></p>';
    function sec(title, on, body) { return '<div class="sum-sec"><h3>' + title + '</h3>' + (on ? body : '<p class="sum-off">Not shared with ' + esc(d.name) + '</p>') + '</div>'; }
    function num(v, k) { return '<div class="sum-num"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>'; }
    var body = '<h2>Pre-visit summary</h2><p class="muted" style="margin-top:4px">Ananya R., 24 · Bengaluru<br>Prepared for ' + esc(d.name) + ' · last 90 days to ' + fmtDate(today) + ' · self-tracked data (demo)</p>';
    body += sec('Overall', sh.mood && sh.sleep && sh.activity && sh.cycle, '<div class="sum-grid">' + num('54 → 67', 'Health Factor, 90 days ago to now') + '</div>');
    body += sec('Mind', sh.mood, '<div class="sum-grid">' + num('14 → 12', 'PHQ-9 score') + num('11 → 10', 'GAD-7 score') + num('3.4 / 5', 'Average mood, last 7 days') + '</div>');
    body += sec('Sleep and activity', sh.sleep && sh.activity, '<div class="sum-grid">' + num('6 h 18 m', 'Average sleep') + num('74 bpm', 'Resting heart rate') + num('6,100', 'Average steps a day') + num('3 / week', 'Workouts') + '</div>');
    body += sec('Cycle and symptoms', sh.cycle, '<div class="sum-grid">' + num('41, 36 days', 'Last two cycles') + num('Fatigue 11', 'Days with it, of last 30') + num('Bloating 7', 'Days with it, of last 30') + num('Acne 6', 'Days with it, of last 30') + '</div>');
    body += sec('Weight', sh.weight, '<div class="sum-grid">' + num('74.2 → 73.1 kg', 'Over 8 weeks') + num('86 cm', 'Waist, 3 weeks ago') + '</div>');
    body += sec('Medication', sh.meds, '<div class="sum-grid">' + num('86%', 'Doses marked taken, last 30 days') + '</div>');
    body += sec('Meals', sh.meals, '<div class="sum-grid">' + num('5 of 18', 'Meals ordered in, last 7 days') + num('3', 'Dinners after 10 pm, last 7 days') + '</div>');
    var labRows = [];
    Object.keys(TESTS).forEach(function (tid) { TESTS[tid].analytes.forEach(function (an) {
      var rows = state.results.filter(function (r) { return r.test === tid && r.values[an.k] != null; }).sort(function (a, b) { return a.date - b.date; });
      if (rows.length) { var l = rows[rows.length - 1], rg = l.ranges && l.ranges[an.k]; labRows.push('<li>' + esc(an.k) + ': <strong>' + l.values[an.k] + ' ' + esc(an.unit) + '</strong> (' + fmtDate(l.date) + (rg && rangeText(rg) ? ', range on report ' + rangeText(rg) : '') + ')</li>'); }
    }); });
    body += sec('Lab reports', sh.labs, '<ul class="sum-list">' + labRows.join('') + '</ul>');
    body += sec('Patterns in the data', sh.mood && sh.sleep, '<ul class="sum-list"><li>After nights under 6.5 hours of sleep, mood averaged 2.4 out of 5 (9 days). After 7 hours or more it averaged 3.6 (8 days).</li><li>Resting heart rate drifted from 77 to 74 bpm over 30 days.</li></ul><p class="fine" style="margin-top:8px">Patterns in self-tracked data, not causes.</p>');
    body += '<div class="sum-sec"><h3>Questions from the patient</h3>' + (state.questions.length ? '<ul class="sum-list">' + state.questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>' : '<p class="sum-off">None added</p>') + '</div>';
    body += '<p class="sum-foot">Generated by Pulse from data the patient tracked and chose to share. It is not a diagnosis.</p>';
    out.innerHTML = body;
  };

  /* ---------- sharing & privacy ---------- */
  RENDER.sharing = function () {
    var ld = linkedDocs();
    $('#share-docs').innerHTML = ld.length ? ld.map(function (d) {
      var l = state.linked[d.id];
      return '<div class="card" data-sdoc="' + d.id + '" style="margin-bottom:16px"><div class="item-top"><span class="avatar-lg avatar-md" aria-hidden="true">' + d.ini + '</span><div class="grow"><strong>' + esc(d.name) + '</strong><span class="meta">' + esc(d.spec) + ' · linked ' + rel(l.since) + '</span></div></div>' +
        '<div style="margin-top:8px">' + SHARE.map(function (s) {
          return '<label class="perm" style="cursor:pointer"><span class="grow"><strong>' + esc(s.label) + '</strong>' + (s.sub ? '<span class="meta">' + esc(s.sub) + '</span>' : '') + '</span><span class="switch"><input type="checkbox" data-sh="' + d.id + '|' + s.k + '"' + (l.share[s.k] ? ' checked' : '') + ' aria-label="Share ' + esc(s.label) + ' with ' + esc(d.name) + '"><span></span></span></label>';
        }).join('') +
        '<div class="perm locked"><span class="grow"><strong>Journal chats</strong><span class="meta">Never shared. Not saved, and never visible to any doctor.</span></span><span class="st reviewed">Always off</span></div></div>' +
        '<div class="form-row"><div class="field"><label for="exp-' + d.id + '">Access lasts</label><select class="input" id="exp-' + d.id + '" data-exp="' + d.id + '">' + EXPIRY.map(function (e) { return '<option' + (l.expires === e ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="btn-row">' + (state.revokeAsk === d.id ? '<span class="fine" style="align-self:center">Stop sharing with ' + esc(d.name) + '?</span><button class="btn-danger-sm" type="button" data-revoke-yes="' + d.id + '">Yes, stop sharing</button><button class="btn-outline-sm" type="button" data-revoke-no>Keep sharing</button>'
          : '<button class="btn-danger-sm" type="button" data-revoke="' + d.id + '">Stop sharing and unlink</button>') + '</div></div>';
    }).join('') : '<div class="card"><p class="empty">No doctor has access to your data. <a href="#providers">Find a doctor</a> to link one.</p></div>';
    var e = state.emergency;
    $('#em-name').value = e.name; $('#em-rel').value = e.rel; $('#em-phone').value = e.phone; $('#em-consent').checked = e.consent; $('#em-doc').checked = e.doc;
    $('#log-list').innerHTML = state.log.map(function (x) { return '<div class="row-item"><div class="grow">' + esc(x.text) + '</div><span class="meta fine">' + rel(x.t) + '</span></div>'; }).join('');
  };

  /* ---------- routing ---------- */
  var current = 'overview';
  function closeDrawer() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; $('#menu-btn').setAttribute('aria-expanded', 'false'); }
  function show(id) {
    if (!LABEL[id]) id = 'overview';
    current = id;
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + id; });
    $$('.side-link[data-id]').forEach(function (a) { if (a.dataset.id === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.title = 'Pulse – ' + LABEL[id];
    closeDrawer(); RENDER[id](); window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', function () { show(location.hash.slice(1)); });
  $('#menu-btn').addEventListener('click', function () { var o = !$('#sidebar').classList.contains('open'); $('#sidebar').classList.toggle('open', o); $('#scrim').hidden = !o; this.setAttribute('aria-expanded', String(o)); });
  $('#scrim').addEventListener('click', closeDrawer);
  var profile = $('#profile');
  document.addEventListener('click', function (e) { if (!profile.contains(e.target)) profile.open = false; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { profile.open = false; closeDrawer(); } });

  /* ---------- interactions: providers ---------- */
  $('#f-spec').addEventListener('click', function (e) { var b = e.target.closest('[data-spec]'); if (!b) return; state.filters.spec = b.dataset.spec; state.open = null; RENDER.providers(); });
  ['lang', 'mode', 'gender'].forEach(function (k) { $('#f-' + k).addEventListener('change', function () { state.filters[k] = this.value; state.open = null; RENDER.providers(); }); });
  $('#f-today').addEventListener('change', function () { state.filters.today = this.checked; state.open = null; RENDER.providers(); });

  $('#doc-list').addEventListener('change', function (e) {
    var t = e.target, card = t.closest('[data-doc]'); if (!card) return; var d = doc(card.dataset.doc), b = bookState(d);
    if (t.hasAttribute('data-breason')) { b.reason = t.value; b.err = ''; }
    else if (t.hasAttribute('data-bshare')) b.share = t.checked;
    else if (t.hasAttribute('data-cshare')) state.consent.share[t.dataset.cshare] = t.checked;
    else if (t.hasAttribute('data-cexp')) state.consent.expires = t.value;
  });
  $('#doc-list').addEventListener('click', function (e) {
    var t = e.target, card = t.closest('[data-doc]'); if (!card) return; var d = doc(card.dataset.doc), b = bookState(d), x;
    if ((x = t.closest('[data-toggle]'))) { state.open = state.open === d.id ? null : d.id; if (state.consent && state.consent.doc !== state.open) state.consent = null; keepFocus(); RENDER.providers(); var c = $('[data-doc="' + d.id + '"]'); if (state.open && c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    if ((x = t.closest('[data-bmode]'))) { b.mode = x.dataset.bmode; }
    else if ((x = t.closest('[data-bdate]'))) { b.date = x.dataset.bdate; b.time = null; b.err = ''; }
    else if ((x = t.closest('[data-btime]'))) { b.time = +x.dataset.btime; b.err = ''; }
    else if (t.closest('[data-bconfirm]')) {
      if (!b.date || !b.time) b.err = 'Pick a day and a time.'; else if (!b.reason) b.err = 'Choose a reason for the visit.';
      else {
        var a = appt(d.id, Math.round((parseKey(b.date) - today) / DAY), b.time, b.mode, b.reason);
        state.appts.push(a); a.shared = false;
        if (b.share && state.linked[d.id]) { state.summaryShared[d.id] = new Date(); a.shared = true; logAdd('You shared your pre-visit summary with ' + d.name); }
        b.done = a; b.err = '';
      }
    }
    else if ((x = t.closest('[data-ics]'))) { downloadIcs(state.appts.filter(function (q) { return q.id === +x.dataset.ics; })[0]); return; }
    else if (t.closest('[data-book-again]')) { state.book[d.id] = null; }
    else if (t.closest('[data-link-open]')) { state.consent = { doc: d.id, share: { mood: true, sleep: true, activity: true, cycle: true, weight: false, meals: false, meds: false, labs: false }, expires: '90 days' }; }
    else if (t.closest('[data-link-cancel]')) { state.consent = null; }
    else if (t.closest('[data-link-ok]')) {
      state.linked[d.id] = { share: state.consent.share, expires: state.consent.expires, since: new Date() };
      logAdd('You linked ' + d.name + ' and shared ' + countOn(state.consent.share) + ' of ' + SHARE.length + ' data types'); state.consent = null;
    } else return;
    refreshProviders();
  });

  /* ---------- interactions: appointments ---------- */
  $('#view-appointments').addEventListener('click', function (e) {
    var t = e.target, x;
    if ((x = t.closest('[data-ics]'))) { downloadIcs(state.appts.filter(function (q) { return q.id === +x.dataset.ics; })[0]); return; }
    if ((x = t.closest('[data-cancel]'))) state.cancelAsk = +x.dataset.cancel;
    else if (t.closest('[data-cancel-no]')) state.cancelAsk = null;
    else if ((x = t.closest('[data-cancel-yes]'))) { var a = state.appts.filter(function (q) { return q.id === +x.dataset.cancelYes; })[0]; a.status = 'cancelled'; state.cancelAsk = null; }
    else if ((x = t.closest('[data-resched]'))) { var ap = state.appts.filter(function (q) { return q.id === +x.dataset.resched; })[0]; state.resched = { id: ap.id, date: key(ap.date), min: null }; state.cancelAsk = null; }
    else if (t.closest('[data-resched-no]')) state.resched = null;
    else if ((x = t.closest('[data-rdate]'))) { state.resched.date = x.dataset.rdate; state.resched.min = null; }
    else if ((x = t.closest('[data-rtime]'))) state.resched.min = +x.dataset.rtime;
    else if ((x = t.closest('[data-resched-ok]'))) {
      var ra = state.appts.filter(function (q) { return q.id === +x.dataset.reschedOk; })[0];
      ra.date = parseKey(state.resched.date); ra.min = state.resched.min; state.resched = null;
    }
    else if ((x = t.closest('[data-share-sum]'))) { state.summaryShared[x.dataset.shareSum] = new Date(); logAdd('You shared your pre-visit summary with ' + doc(x.dataset.shareSum).name); }
    else if ((x = t.closest('[data-qdel]'))) { state.questions.splice(+x.dataset.qdel, 1); }
    else return;
    refreshAppts();
  });
  $('#q-form').addEventListener('submit', function (e) {
    e.preventDefault(); var v = $('#q-in').value.trim(); if (!v) return;
    state.questions.push(v); $('#q-in').value = ''; RENDER.appointments();
  });

  /* ---------- interactions: reports ---------- */
  $('#tests').addEventListener('click', function (e) {
    var b = e.target.closest('[data-addrep]'); if (!b) return;
    $('#up-test').value = b.dataset.addrep; drawFields(); $('#up-form').scrollIntoView({ block: 'start', behavior: 'smooth' });
    setTimeout(function () { var f = $('#an-v-0') || $('#up-file'); f.focus({ preventScroll: true }); }, 350);
  });
  $('#up-test').addEventListener('change', drawFields);
  $('#up-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var tid = $('#up-test').value, def = TESTS[tid], date = $('#up-date').value, file = $('#up-file').files[0];
    if (!date) return setMsg('#up-msg', 'Add the date of the test.', true);
    var values = {}, ranges = {}, any = false, bad = false;
    def.analytes.forEach(function (an, i) {
      var v = $('#an-v-' + i).value, lo = $('#an-lo-' + i).value, hi = $('#an-hi-' + i).value;
      if (v === '') return;
      if (isNaN(+v) || +v < 0) { bad = true; return; }
      values[an.k] = +v; any = true;
      if (lo !== '' || hi !== '') ranges[an.k] = [lo === '' ? null : +lo, hi === '' ? null : +hi];
    });
    if (bad) return setMsg('#up-msg', 'Check the numbers. They should be positive values.', true);
    if (!file && !any) return setMsg('#up-msg', 'Add the report file or type in at least one number.', true);
    state.results.push({ test: tid, date: parseKey(date), values: values, ranges: ranges, file: file ? file.name : null });
    var t = state.tests.filter(function (x) { return x.id === tid && x.status === 'ordered'; })[0];
    if (t) { t.status = 'uploaded'; t.when = today; }
    var l = state.linked.iyer;
    logAdd('You added a ' + def.name + ' report' + (l && l.share.labs ? ' and it is visible to Dr. Meera Iyer' : ''));
    $('#up-file').value = ''; $('#up-form').reset(); $('#up-date').value = key(today);
    RENDER.reports(); setMsg('#up-msg', 'Saved' + (file ? ' (' + file.name + ' was not stored)' : '') + '.' + (l && l.share.labs ? ' Dr. Iyer can see it.' : ''));
  });

  /* ---------- interactions: plan, summary, sharing ---------- */
  $('#plan-body').addEventListener('change', function (e) { var c = e.target.closest('[data-diet]'); if (!c) return; state.diet[c.dataset.diet] = c.checked; RENDER.plan(); });
  $('#view-summary').addEventListener('change', function (e) { if (e.target.id === 'sum-doc-sel') { state.summaryDoc = e.target.value; RENDER.summary(); } });
  $('#view-summary').addEventListener('click', function (e) {
    if (e.target.closest('#sum-print')) { window.print(); return; }
    if (e.target.closest('#sum-share')) { state.summaryShared[state.summaryDoc] = new Date(); logAdd('You shared your pre-visit summary with ' + doc(state.summaryDoc).name); RENDER.summary(); }
  });

  $('#share-docs').addEventListener('change', function (e) {
    var t = e.target, x;
    if (t.hasAttribute('data-sh')) {
      var p = t.dataset.sh.split('|'), d = doc(p[0]), lab = SHARE.filter(function (s) { return s.k === p[1]; })[0].label;
      state.linked[p[0]].share[p[1]] = t.checked; logAdd('You turned ' + (t.checked ? 'on' : 'off') + ' sharing "' + lab + '" with ' + d.name);
      $('#log-list').innerHTML = state.log.map(function (q) { return '<div class="row-item"><div class="grow">' + esc(q.text) + '</div><span class="meta fine">' + rel(q.t) + '</span></div>'; }).join('');
    } else if ((x = t.getAttribute('data-exp'))) { state.linked[x].expires = t.value; logAdd('You set access for ' + doc(x).name + ' to: ' + t.value); }
  });
  $('#share-docs').addEventListener('click', function (e) {
    var t = e.target, x;
    if ((x = t.closest('[data-revoke]'))) state.revokeAsk = x.dataset.revoke;
    else if (t.closest('[data-revoke-no]')) state.revokeAsk = null;
    else if ((x = t.closest('[data-revoke-yes]'))) { var id = x.dataset.revokeYes; delete state.linked[id]; delete state.summaryShared[id]; state.revokeAsk = null; logAdd('You stopped sharing with ' + doc(id).name + ' and unlinked them'); }
    else return;
    RENDER.sharing();
  });
  $('#em-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#em-name').value.trim(), phone = $('#em-phone').value.replace(/\s/g, ''), consent = $('#em-consent').checked;
    if (!name) return setMsg('#em-msg', 'Add their name.', true);
    if (!/^[6-9]\d{9}$/.test(phone)) return setMsg('#em-msg', 'Enter a 10-digit Indian mobile number.', true);
    if (!consent) return setMsg('#em-msg', 'Please confirm they can be contacted if you ask for urgent help.', true);
    state.emergency = { name: name, rel: $('#em-rel').value.trim(), phone: phone, consent: true, doc: $('#em-doc').checked };
    logAdd('You saved an emergency contact'); RENDER.sharing(); setMsg('#em-msg', 'Saved. Only used if you ask for urgent help.');
  });
  $('#data-export').addEventListener('click', function () { setMsg('#data-msg', 'Demo only: in the live app this starts a request for a copy of your data.'); });
  $('#data-delete').addEventListener('click', function () { setMsg('#data-msg', 'Demo only: in the live app this starts a request to delete your data, which you can withdraw before it completes.'); });

  show(location.hash.slice(1));
})();
