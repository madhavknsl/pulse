/* Pulse healthcare. Providers, appointments, reports, sharing and the summary all come from, and save to, the local server. */
(function () {
  'use strict';
  var P = window.Pulse;

  /* ---------- helpers ---------- */
  var DAY = 864e5;
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  var esc = P.esc, pad = P.pad, key = P.keyOf, parseKey = P.parseKey, addDays = P.addDays;
  var today = P.todayDate();
  function parseTs(s) { return s ? new Date(String(s).replace(' ', 'T')) : null; }
  function fmtDate(d) { return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '–'; }
  function fmtLong(d) { return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function fmtWdDate(d) { return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); }
  var fmtMin = P.fmtMin;
  function rel(d) {
    if (!d) return '–';
    var dd = new Date(d); dd.setHours(0, 0, 0, 0);
    var n = Math.round((today - dd) / DAY);
    if (n <= 0) return 'today'; if (n === 1) return 'yesterday'; if (n < 30) return n + ' days ago';
    return fmtDate(dd);
  }
  function setMsg(id, text, isErr) { var el = $(id); if (!el) return; el.textContent = text; el.className = 'msg-line' + (isErr ? ' err' : ''); }

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

  /* ---------- data from the server ---------- */
  var DOCS = [];
  function doc(id) { return DOCS.filter(function (d) { return d.id === id; })[0]; }
  var SPECS = ['All', 'Gynaecologist', 'Endocrinologist', 'Psychiatrist', 'Psychologist', 'Dietitian'];
  var REASONS = ['First consultation', 'PCOS follow-up', 'Mood & stress', 'Lab review', 'Other'];
  var TESTS = {};

  var SHARE = [
    { k: 'profile', label: 'Basic details & health background', sub: 'Name, age, sex, height, conditions, allergies, family history, diet and work. Never your phone or email.' },
    { k: 'mood', label: 'Mood, stress & questionnaires', sub: 'Daily mood, stress rating, PHQ-9 and GAD-7' },
    { k: 'sleep', label: 'Sleep', sub: '' },
    { k: 'activity', label: 'Steps & workouts', sub: '' },
    { k: 'cycle', label: 'Cycle & symptoms', sub: 'Periods, symptoms and day tags' },
    { k: 'weight', label: 'Weight & waist', sub: '' },
    { k: 'meals', label: 'Meals', sub: 'Type, time and where from' },
    { k: 'meds', label: 'Medication log', sub: 'Taken or missed' },
    { k: 'labs', label: 'Lab reports', sub: 'Values and files you add' }
  ];
  var EXPIRY = ['Until I stop it', '30 days', '90 days'];
  function countOn(sh) { return SHARE.filter(function (s) { return sh[s.k]; }).length; }

  var state = {
    filters: { spec: 'All', lang: '', mode: '', gender: '', today: false },
    open: null, book: {}, consent: null, resched: null, cancelAsk: null, revokeAsk: null, deleteAsk: false,
    appts: [], linked: {}, log: [], questions: [], tests: [], results: [], summaryDoc: null, summaryShared: {},
    diet: {}, plans: {}, week: {}, emergency: null
  };

  function ingest(b) {
    TESTS = b.test_defs; REASONS = b.reasons;
    state.linked = {};
    b.links.forEach(function (l) { state.linked[l.provider_id] = { share: l.share, expires: l.expires, since: parseTs(l.since) }; });
    state.appts = b.appointments.map(function (a) { return { id: a.id, doc: a.provider_id, date: parseKey(a.date), min: a.minute, mode: a.mode, reason: a.reason, status: a.status }; });
    state.tests = b.tests.map(function (t) { return { id: t.key, by: t.provider_id, status: t.status, ordered: parseKey(t.ordered_on), due: t.due_on ? parseKey(t.due_on) : null, when: t.status_on ? parseKey(t.status_on) : null }; });
    state.results = b.results.map(function (r) { return { test: r.test_key, date: parseKey(r.date), values: r.values, ranges: r.ranges, file: r.file }; });
    state.questions = b.questions;
    state.log = b.log.map(function (x) { return { t: parseTs(x.at), text: x.text }; });
    state.summaryShared = {}; Object.keys(b.summary_shared).forEach(function (k) { state.summaryShared[k] = parseTs(b.summary_shared[k]); });
    state.diet = {}; b.diet_today.forEach(function (i) { state.diet[i] = true; });
    state.plans = b.plans; state.week = b.week; state.emergency = b.emergency;
  }
  function loadProviders() { return P.get('/api/providers').then(function (r) { DOCS = r.providers; }); }
  function reload() {
    return Promise.all([P.get('/api/healthcare'), loadProviders()]).then(function (r) { ingest(r[0]); AV = {}; RENDER[current](); });
  }
  function linkedDocs() { return Object.keys(state.linked).map(doc).filter(Boolean); }

  /* ---------- appointment slots (the server decides what is free) ---------- */
  var AV = {};   // provider id -> { 'YYYY-MM-DD': [minutes] }
  function loadAvail(id) { return AV[id] ? Promise.resolve() : P.get('/api/providers/' + id + '/availability').then(function (r) { AV[id] = r.availability; }); }
  function slotsFor(d, date) { return (AV[d.id] && AV[d.id][key(date)]) || []; }
  function nextSlot(d) {
    var s = d.next_slot; if (!s) return 'No slots soon';
    var dt = parseKey(s.date), i = Math.round((dt - today) / DAY);
    return (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : fmtWdDate(dt)) + ', ' + fmtMin(s.minute);
  }
  function hasSlotToday(d) { return !!d.next_slot && d.next_slot.date === key(today); }

  /* ---------- calendar file (.ics) ---------- */
  function downloadIcs(a) {
    var d = doc(a.doc), st = new Date(a.date); st.setHours(Math.floor(a.min / 60), a.min % 60, 0, 0);
    var en = new Date(st.getTime() + 30 * 60000);
    function f(x) { return x.getFullYear() + pad(x.getMonth() + 1) + pad(x.getDate()) + 'T' + pad(x.getHours()) + pad(x.getMinutes()) + '00'; }
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pulse//Prototype//EN', 'BEGIN:VEVENT', 'UID:pulse-' + a.id + '@demo.invalid',
      'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(st), 'DTEND:' + f(en), 'SUMMARY:Appointment',
      'LOCATION:' + (a.mode === 'Video' ? 'Video call' : d.area + ', Bengaluru'), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    saveBlob(new Blob([ics], { type: 'text/calendar' }), 'appointment.ics');
  }
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var RENDER = {};

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
    if (!b.date && AV[d.id]) {
      for (var i = 0; i < 14; i++) { var dt = addDays(today, i); if (slotsFor(d, dt).length) { b.date = key(dt); break; } }
    }
    return b;
  }
  function dateStrip(d, selKey, attr) {
    var h = '<div class="date-strip" role="group" aria-label="Choose a day">';
    for (var i = 0; i < 7; i++) {
      var dt = addDays(today, i), n = slotsFor(d, dt).length;
      h += '<button type="button" class="date-btn" ' + attr + '="' + key(dt) + '" data-fk="' + d.id + '|date-' + key(dt) + '" aria-pressed="' + (key(dt) === selKey) + '"' + (n ? '' : ' disabled') + '><span>' + (i === 0 ? 'Today' : dt.toLocaleDateString('en-IN', { weekday: 'short' })) + '</span><b>' + dt.getDate() + '</b></button>';
    }
    return h + '</div>';
  }
  function slotGrid(d, selKey, selMin, attr) {
    var s = slotsFor(d, parseKey(selKey));
    if (!s.length) return '<p class="empty">No slots this day. Try another.</p>';
    return '<div class="slots" role="group" aria-label="Choose a time">' + s.map(function (m) {
      return '<button type="button" class="slot" ' + attr + '="' + m + '" data-fk="' + d.id + '|slot-' + m + '" aria-pressed="' + (m === selMin) + '">' + fmtMin(m) + '</button>';
    }).join('') + '</div>';
  }

  function consentPanel(d) {
    var c = state.consent;
    return '<div class="consent-box"><h3>Link ' + esc(d.name) + ' as your doctor</h3>' +
      '<p class="fine" style="margin:4px 0 8px">Choose what this provider can see. Everything is off until you turn it on. You can change it any time. Pulsie chats are never shared.</p>' +
      SHARE.map(function (s) {
        return '<label class="perm" style="cursor:pointer"><span class="grow"><strong>' + esc(s.label) + '</strong>' + (s.sub ? '<span class="meta">' + esc(s.sub) + '</span>' : '') + '</span>' +
          '<span class="switch"><input type="checkbox" data-cshare="' + s.k + '" data-fk="' + d.id + '|cs-' + s.k + '"' + (c.share[s.k] ? ' checked' : '') + '><span></span></span></label>';
      }).join('') +
      '<div class="field" style="margin-top:12px"><label for="c-exp-' + d.id + '">Access lasts</label><select class="input" id="c-exp-' + d.id + '" data-cexp>' + EXPIRY.map(function (e) { return '<option' + (c.expires === e ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select></div>' +
      '<p class="fine" style="margin-top:10px">You can change or stop this any time in Sharing &amp; privacy.</p>' +
      '<p class="msg-line" id="link-msg" role="status"></p>' +
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
    if (!AV[d.id]) return '<div class="book"><h3>Book an appointment</h3><p class="muted">Loading available times…</p></div>';
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
        h += '<div class="confirm-box"><strong>Pick a new time</strong>' + (AV[a.doc] ? dateStrip(d, r.date, 'data-rdate') + slotGrid(d, r.date, r.min, 'data-rtime') : '<p class="muted">Loading times…</p>') +
          '<p class="msg-line err" id="resched-msg" role="status"></p>' +
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
    $('#q-list').innerHTML = state.questions.length ? state.questions.map(function (q) {
      return '<div class="row-item"><div class="grow">' + esc(q.text) + '</div><button class="x-btn" type="button" data-qdel="' + q.id + '" aria-label="Remove question">×</button></div>';
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
    $('#tests').innerHTML = state.tests.length ? state.tests.map(function (t) {
      var def = TESTS[t.id], by = doc(t.by) || { name: 'your doctor' };
      var meta = t.status === 'ordered' ? 'Ordered ' + rel(t.ordered) + ' by ' + esc(by.name) + (t.due ? ' · due by ' + fmtDate(t.due) : '')
        : t.status === 'uploaded' ? 'You added this ' + rel(t.when) + ' · waiting for ' + esc(by.name) + ' to review'
        : 'Reviewed by ' + esc(by.name) + ' ' + rel(t.when);
      return '<div class="item-card"><div class="item-top"><div class="grow"><strong>' + esc(def.name) + '</strong><span class="meta">' + meta + '</span></div><span class="st ' + t.status + '">' + { ordered: 'Ordered', uploaded: 'Uploaded', reviewed: 'Reviewed' }[t.status] + '</span></div>' +
        (t.status === 'ordered' ? '<div><button class="btn-outline-sm" type="button" data-addrep="' + t.id + '">Add report</button></div>' : '') + '</div>';
    }).join('') : '<p class="empty">Your doctor hasn\'t ordered any tests yet. You can still add a report you already have, below.</p>';
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
    var files = state.results.filter(function (r) { return r.file; }).sort(function (a, b) { return b.date - a.date; });
    $('#labs').innerHTML = (cards || '<p class="empty">No results yet.</p>') +
      (files.length ? '<div style="grid-column:1/-1"><h3 style="margin:8px 0 4px">Files you added</h3>' + files.map(function (r) { return '<div class="row-item"><div class="grow">' + esc(r.file.name) + '<span class="meta" style="display:block">' + esc(TESTS[r.test] ? TESTS[r.test].name : 'Report') + ' · ' + fmtDate(r.date) + '</span></div><a class="btn-outline-sm" style="display:inline-flex;align-items:center;text-decoration:none" href="' + esc(r.file.url) + '" target="_blank" rel="noopener">Open</a></div>'; }).join('') + '</div>' : '');
  };
  function drawFields() {
    var t = $('#up-test').value, def = TESTS[t] || TESTS.other || { analytes: [] }, box = $('#up-fields');
    if (!def.analytes.length) { box.innerHTML = '<p class="fine" style="margin-top:12px">Add the file above. There are no numbers to type for this one.</p>'; return; }
    box.innerHTML = '<p class="fine" style="margin:14px 0 0">Numbers from the report, with the range printed next to each (optional).</p>' + def.analytes.map(function (an, i) {
      return '<div class="an-row"><div class="field"><label for="an-v-' + i + '">' + esc(an.k) + ' (' + esc(an.unit) + ')</label><input class="input" id="an-v-' + i + '" type="number" inputmode="decimal" step="any" min="0"></div>' +
        '<div class="field"><label for="an-lo-' + i + '">Range from</label><input class="input" id="an-lo-' + i + '" type="number" inputmode="decimal" step="any"></div>' +
        '<div class="field"><label for="an-hi-' + i + '">Range to</label><input class="input" id="an-hi-' + i + '" type="number" inputmode="decimal" step="any"></div></div>';
    }).join('');
  }

  /* ---------- doctor's plan ---------- */
  RENDER.plan = function () {
    var pid = Object.keys(state.linked).filter(function (id) { return state.plans[id]; })[0];
    if (!pid) { $('#plan-sub').textContent = ''; $('#plan-body').innerHTML = '<div class="card"><p class="empty">No plan yet. A plan appears here once a doctor you have linked shares one. <a href="#providers">Find a doctor</a>.</p></div>'; return; }
    var d = doc(pid), l = state.linked[pid], plan = state.plans[pid], DIET = plan.diet;
    $('#plan-sub').textContent = 'From ' + d.name + ' · updated ' + rel(parseKey(plan.updated)) + ' · demo content';
    var next = state.appts.filter(function (a) { return a.status === 'upcoming' && a.doc === pid; }).sort(function (a, b) { return a.date - b.date; })[0];
    var done = DIET.filter(function (m, i) { return state.diet[i]; }).length;
    var sleepH = state.week.sleep_h, steps = state.week.steps, gs = plan.goals.sleep_h, gt = plan.goals.steps;
    function goalRow(name, goalText, avgText, pct) {
      return '<div><div class="row-line" style="display:flex;justify-content:space-between;gap:12px"><b>' + name + '</b><span class="muted">' + goalText + ' · ' + avgText + '</span></div><div class="bar"><i style="width:' + pct + '%"></i></div></div>';
    }
    $('#plan-body').innerHTML = '<div class="stack-grid">' +
      '<div class="card"><h2>Goals from your doctor</h2><div style="margin-top:14px;display:grid;gap:16px">' +
        goalRow('Sleep', gs + ' hours a night', sleepH == null ? 'no sleep logged this week' : 'you averaged ' + sleepH + ' h this week', sleepH == null ? 0 : Math.min(100, Math.round(sleepH / gs * 100))) +
        goalRow('Steps', gt.toLocaleString('en-IN') + ' a day', steps == null ? 'no steps logged this week' : 'you averaged ' + steps.toLocaleString('en-IN') + ' this week', steps == null ? 0 : Math.min(100, Math.round(steps / gt * 100))) + '</div>' +
        '<p class="fine" style="margin-top:14px">' + (next ? 'Next review: ' + fmtLong(next.date) + '.' : 'No review booked.') + ' <a href="tracker.html">Open tracker</a></p></div>' +
      '<div class="card"><div class="card-head"><div><h2>Diet plan</h2><p class="sub">A sample day. Tick what you followed today.</p></div><span class="pill">' + done + ' of ' + DIET.length + ' today</span></div>' +
        '<div class="meal-plan" style="margin-top:14px">' + DIET.map(function (m, i) {
          return '<label class="meal-row"><input type="checkbox" data-diet="' + i + '"' + (state.diet[i] ? ' checked' : '') + '><span><strong>' + esc(m[0]) + '</strong>' + esc(m[1]) + '</span></label>';
        }).join('') + '</div>' +
        '<p class="fine" style="margin-top:12px">' + (l.share.meals ? esc(d.name) + ' can see this because you share Meals.' : 'Only you can see this. Turn on Meals in Sharing &amp; privacy if you want ' + esc(d.name) + ' to see it.') + '</p></div>' +
      '<div><h2 class="sec-h" style="margin-top:0">Shared by your doctor</h2><p class="fine" style="margin:2px 0 0">Trusted videos on PCOS, food and mental health (demo selection).</p>' +
        '<ul class="videos" style="margin-top:12px">' + plan.videos.map(function (v) {
          return '<li><a class="video" href="https://www.youtube.com/watch?v=' + esc(v[0]) + '" target="_blank" rel="noopener noreferrer"><span class="thumb"><img src="https://i.ytimg.com/vi/' + esc(v[0]) + '/mqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">' +
            '<span class="play"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span></span><span class="dur">' + esc(v[1]) + '</span></span>' +
            '<span class="video-body"><span class="tag">' + esc(v[2]) + '</span><span class="video-title">' + esc(v[3]) + '</span><span class="video-meta">' + esc(v[4]) + '<span class="visually-hidden"> · opens YouTube</span></span></span></a></li>';
        }).join('') + '</ul></div></div>';
  };

  /* ---------- pre-visit summary (built by the server from your own data and your sharing choices) ---------- */
  function minToDur(m) { return m == null ? '–' : Math.floor(m / 60) + ' h ' + pad(Math.round(m % 60)) + ' m'; }
  RENDER.summary = function () {
    var ld = linkedDocs(), ctl = $('#sum-controls'), out = $('#sum-doc');
    if (!ld.length) { ctl.innerHTML = '<p class="empty">No doctor linked yet. <a href="#providers">Find a doctor</a> and link them to share a summary.</p>'; out.hidden = true; return; }
    out.hidden = false;
    if (!state.linked[state.summaryDoc]) state.summaryDoc = ld[0].id;
    var d = doc(state.summaryDoc), shared = state.summaryShared[d.id];
    ctl.innerHTML = '<div class="form-row" style="margin-top:0"><div class="field"><label for="sum-doc-sel">Prepared for</label><select class="input" id="sum-doc-sel">' +
      ld.map(function (x) { return '<option value="' + x.id + '"' + (x.id === d.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="btn-row" style="margin-top:0"><button class="btn btn-inline" type="button" id="sum-share"' + (shared ? ' disabled' : '') + '>' + (shared ? 'Shared ' + rel(shared) : 'Share with ' + esc(d.name)) + '</button>' +
      '<button class="btn-outline-sm" type="button" id="sum-print">Print or save as PDF</button></div></div>' +
      '<p class="fine" style="margin-top:10px">This summary follows your sharing choices for ' + esc(d.name) + '. <a href="#sharing">Change them</a></p><p class="msg-line" id="sum-msg" role="status"></p>';
    out.innerHTML = '<p class="muted">Preparing your summary…</p>';
    var wanted = d.id;
    P.get('/api/summary/' + d.id).then(function (sm) { if (wanted === state.summaryDoc) drawSummary(sm, d, out); }, function (e) { out.innerHTML = '<p class="sum-off">' + esc(e.message) + '</p>'; });
  };
  function drawSummary(sm, d, out) {
    var S = sm.sections, name = esc(d.name);
    function sec(title, data, body) { return '<div class="sum-sec"><h3>' + title + '</h3>' + (data ? body(data) : '<p class="sum-off">Not shared with ' + name + '</p>') + '</div>'; }
    function num(v, k) { return '<div class="sum-num"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>'; }
    function pair(a, b) { return (a == null ? '–' : a) + ' → ' + (b == null ? '–' : b); }
    var h = '<h2>Pre-visit summary</h2><p class="muted" style="margin-top:4px">' + esc(sm.patient.name) + ', ' + sm.patient.age + ' · ' + esc(sm.patient.city) + '<br>Prepared for ' + name + ' · last 90 days to ' + fmtDate(parseKey(sm.period_to)) + ' · self-tracked data</p>';
    h += sec('Overall', S.overall, function (o) { return '<div class="sum-grid">' + num(pair(o.first, o.now), 'Health Factor, first day to now') + '</div>'; });
    h += sec('Mind', S.mind, function (m) { return '<div class="sum-grid">' + num(pair(m.phq9.first, m.phq9.now), 'PHQ-9 score') + num(pair(m.gad7.first, m.gad7.now), 'GAD-7 score') + num(m.mood7 == null ? '–' : m.mood7.toFixed(1) + ' / 5', 'Average mood, last 7 days') + '</div>'; });
    h += sec('Sleep and activity', S.sleep_activity, function (s) { return '<div class="sum-grid">' + num(minToDur(s.sleep_min), 'Average sleep') + num(s.steps == null ? '–' : s.steps.toLocaleString('en-IN'), 'Average steps a day') + num(s.workouts_per_week + ' / week', 'Workouts') + '</div>'; });
    h += sec('Cycle and symptoms', S.cycle, function (c) {
      return '<div class="sum-grid">' + num(c.cycle_lengths.length ? c.cycle_lengths.join(', ') + ' days' : '–', 'Last two cycles') + c.symptoms.map(function (s) { return num(esc(s.name) + ' ' + s.days, 'Days with it, of last 30'); }).join('') + '</div>' + (c.symptoms.length ? '' : '<p class="sum-off">No symptoms logged in the last 30 days.</p>');
    });
    h += sec('Weight', S.weight, function (w) { return '<div class="sum-grid">' + num(w.first == null ? '–' : pair(w.first, w.now) + ' kg', 'Over 90 days') + num(w.waist == null ? '–' : w.waist + ' cm', w.waist_date ? 'Waist, ' + rel(parseKey(w.waist_date)) : 'Waist') + '</div>'; });
    h += sec('Medication', S.meds, function (m) { return '<div class="sum-grid">' + num(m.adherence_pct == null ? '–' : m.adherence_pct + '%', 'Doses marked taken, last 30 days') + '</div>'; });
    h += sec('Meals', S.meals, function (m) { return '<div class="sum-grid">' + num(m.ordered + ' of ' + m.total, 'Meals ordered in, last 7 days') + num(m.late_dinners, 'Dinners after 10 pm, last 7 days') + '</div>'; });
    h += sec('Lab reports', S.labs, function (labs) { return labs.length ? '<ul class="sum-list">' + labs.map(function (l) { return '<li>' + esc(l.name) + ': <strong>' + l.value + ' ' + esc(l.unit) + '</strong> (' + fmtDate(parseKey(l.date)) + (l.range && rangeText(l.range) ? ', range on report ' + rangeText(l.range) : '') + ')</li>'; }).join('') + '</ul>' : '<p class="sum-off">No lab results yet.</p>'; });
    h += sec('Patterns in the data', S.patterns, function (ps) { return ps.length ? '<ul class="sum-list">' + ps.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul><p class="fine" style="margin-top:8px">Patterns in self-tracked data, not causes.</p>' : '<p class="sum-off">Not enough data yet to show a pattern.</p>'; });
    h += '<div class="sum-sec"><h3>Questions from the patient</h3>' + (sm.questions.length ? '<ul class="sum-list">' + sm.questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>' : '<p class="sum-off">None added</p>') + '</div>';
    h += '<p class="sum-foot">Generated by Pulse from data the patient tracked and chose to share. It is not a diagnosis.</p>';
    out.innerHTML = h;
  }

  /* ---------- sharing & privacy ---------- */
  function logHtml() { return state.log.length ? state.log.map(function (x) { return '<div class="row-item"><div class="grow">' + esc(x.text) + '</div><span class="meta fine">' + rel(x.t) + '</span></div>'; }).join('') : '<p class="empty">Nothing yet.</p>'; }
  RENDER.sharing = function () {
    var ld = linkedDocs();
    $('#share-docs').innerHTML = ld.length ? ld.map(function (d) {
      var l = state.linked[d.id];
      return '<div class="card" data-sdoc="' + d.id + '" style="margin-bottom:16px"><div class="item-top"><span class="avatar-lg avatar-md" aria-hidden="true">' + d.ini + '</span><div class="grow"><strong>' + esc(d.name) + '</strong><span class="meta">' + esc(d.spec) + ' · linked ' + rel(l.since) + '</span></div></div>' +
        '<div style="margin-top:8px">' + SHARE.map(function (s) {
          return '<label class="perm" style="cursor:pointer"><span class="grow"><strong>' + esc(s.label) + '</strong>' + (s.sub ? '<span class="meta">' + esc(s.sub) + '</span>' : '') + '</span><span class="switch"><input type="checkbox" data-sh="' + d.id + '|' + s.k + '"' + (l.share[s.k] ? ' checked' : '') + ' aria-label="Share ' + esc(s.label) + ' with ' + esc(d.name) + '"><span></span></span></label>';
        }).join('') +
        '<div class="perm locked"><span class="grow"><strong>Pulsie chats</strong><span class="meta">Never shared. Not saved, and never visible to any doctor.</span></span><span class="st reviewed">Always off</span></div></div>' +
        '<div class="form-row"><div class="field"><label for="exp-' + d.id + '">Access lasts</label><select class="input" id="exp-' + d.id + '" data-exp="' + d.id + '">' + EXPIRY.map(function (e) { return '<option' + (l.expires === e ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="btn-row">' + (state.revokeAsk === d.id ? '<span class="fine" style="align-self:center">Stop sharing with ' + esc(d.name) + '?</span><button class="btn-danger-sm" type="button" data-revoke-yes="' + d.id + '">Yes, stop sharing</button><button class="btn-outline-sm" type="button" data-revoke-no>Keep sharing</button>'
          : '<button class="btn-danger-sm" type="button" data-revoke="' + d.id + '">Stop sharing and unlink</button>') + '</div></div>';
    }).join('') : '<div class="card"><p class="empty">No doctor has access to your data. <a href="#providers">Find a doctor</a> to link one.</p></div>';
    var e = state.emergency || { name: '', relation: '', phone: '', consent: false, alert_doctor: false };
    $('#em-name').value = e.name; $('#em-rel').value = e.relation; $('#em-phone').value = e.phone; $('#em-consent').checked = e.consent; $('#em-doc').checked = e.alert_doctor; $('#em-auto').checked = !!e.auto_alert;
    $('#log-list').innerHTML = logHtml();
    drawDeleteBox();
  };
  function drawDeleteBox() {
    var box = $('#data-confirm'); if (!box) return;
    box.innerHTML = state.deleteAsk ? '<div class="confirm-box" style="margin-top:12px"><strong>Delete everything?</strong><p class="fine" style="margin-top:4px">This permanently removes your account and all your data from this computer. It can\'t be undone. Enter your password to confirm.</p>' +
      '<div class="field" style="margin-top:10px"><label for="del-pass">Password</label><input class="input" id="del-pass" type="password" autocomplete="current-password"></div><p class="msg-line err" id="del-msg" role="alert"></p>' +
      '<div class="btn-row"><button class="btn-danger-sm" type="button" id="del-yes">Yes, delete everything</button><button class="btn-outline-sm" type="button" id="del-no">Cancel</button></div></div>' : '';
  }

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
    if ((x = t.closest('[data-toggle]'))) {
      state.open = state.open === d.id ? null : d.id; if (state.consent && state.consent.doc !== state.open) state.consent = null;
      keepFocus(); RENDER.providers();
      if (state.open) { var c = $('[data-doc="' + d.id + '"]'); if (c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); loadAvail(d.id).then(refreshProviders); }
      return;
    }
    if ((x = t.closest('[data-bmode]'))) { b.mode = x.dataset.bmode; }
    else if ((x = t.closest('[data-bdate]'))) { b.date = x.dataset.bdate; b.time = null; b.err = ''; }
    else if ((x = t.closest('[data-btime]'))) { b.time = +x.dataset.btime; b.err = ''; }
    else if (t.closest('[data-bconfirm]')) {
      if (!b.date || !b.time) b.err = 'Pick a day and a time.'; else if (!b.reason) b.err = 'Choose a reason for the visit.';
      else {
        var want = { date: b.date, min: b.time, mode: b.mode, reason: b.reason };
        P.post('/api/appointments', { provider_id: d.id, date: b.date, minute: b.time, mode: b.mode, reason: b.reason, share_summary: !!(b.share && state.linked[d.id]) }).then(function (r) {
          b.done = { id: r.id, date: parseKey(want.date), min: want.min, mode: want.mode, reason: want.reason, shared: r.shared }; b.err = '';
          return reload();
        }, function (er) { b.err = er.message; b.time = null; AV = {}; loadAvail(d.id).then(refreshProviders); });
        return;
      }
    }
    else if ((x = t.closest('[data-ics]'))) { var ap = state.appts.filter(function (q) { return q.id === +x.dataset.ics; })[0] || b.done; if (ap) downloadIcs(ap); return; }
    else if (t.closest('[data-book-again]')) { state.book[d.id] = null; loadAvail(d.id).then(refreshProviders); }
    else if (t.closest('[data-link-open]')) { state.consent = { doc: d.id, share: SHARE.reduce(function (o, s) { o[s.k] = false; return o; }, {}), expires: '90 days' }; }
    else if (t.closest('[data-link-cancel]')) { state.consent = null; }
    else if (t.closest('[data-link-ok]')) {
      P.post('/api/links', { provider_id: d.id, share: state.consent.share, expires: state.consent.expires }).then(function () { state.consent = null; return reload(); },
        function (er) { setMsg('#link-msg', er.message, true); });
      return;
    } else return;
    refreshProviders();
  });

  /* ---------- interactions: appointments ---------- */
  function findAppt(id) { return state.appts.filter(function (q) { return q.id === +id; })[0]; }
  $('#view-appointments').addEventListener('click', function (e) {
    var t = e.target, x;
    if ((x = t.closest('[data-ics]'))) { var a0 = findAppt(x.dataset.ics); if (a0) downloadIcs(a0); return; }
    if ((x = t.closest('[data-cancel]'))) state.cancelAsk = +x.dataset.cancel;
    else if (t.closest('[data-cancel-no]')) state.cancelAsk = null;
    else if ((x = t.closest('[data-cancel-yes]'))) { P.patch('/api/appointments/' + x.dataset.cancelYes, { action: 'cancel' }).then(function () { state.cancelAsk = null; return reload(); }); return; }
    else if ((x = t.closest('[data-resched]'))) { var ap = findAppt(x.dataset.resched); state.resched = { id: ap.id, date: key(ap.date), min: null }; state.cancelAsk = null; loadAvail(ap.doc).then(refreshAppts); }
    else if (t.closest('[data-resched-no]')) state.resched = null;
    else if ((x = t.closest('[data-rdate]'))) { state.resched.date = x.dataset.rdate; state.resched.min = null; }
    else if ((x = t.closest('[data-rtime]'))) state.resched.min = +x.dataset.rtime;
    else if ((x = t.closest('[data-resched-ok]'))) {
      var r = state.resched;
      P.patch('/api/appointments/' + r.id, { action: 'reschedule', date: r.date, minute: r.min }).then(function () { state.resched = null; return reload(); },
        function (er) { setMsg('#resched-msg', er.message, true); r.min = null; AV = {}; });
      return;
    }
    else if ((x = t.closest('[data-share-sum]'))) { P.post('/api/summary/' + x.dataset.shareSum + '/share').then(reload); return; }
    else if ((x = t.closest('[data-qdel]'))) { P.del('/api/questions/' + x.dataset.qdel).then(reload); return; }
    else return;
    refreshAppts();
  });
  $('#q-form').addEventListener('submit', function (e) {
    e.preventDefault(); var v = $('#q-in').value.trim(); if (!v) return;
    P.post('/api/questions', { text: v }).then(function () { $('#q-in').value = ''; return reload(); });
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
    var values = {}, ranges = {}, any = false;
    def.analytes.forEach(function (an, i) {
      var v = $('#an-v-' + i).value, lo = $('#an-lo-' + i).value, hi = $('#an-hi-' + i).value;
      if (v === '') return;
      values[an.k] = +v; any = true;
      if (lo !== '' || hi !== '') ranges[an.k] = [lo === '' ? null : +lo, hi === '' ? null : +hi];
    });
    if (!file && !any) return setMsg('#up-msg', 'Add the report file or type in at least one number.', true);
    var btn = $('#up-form button[type=submit]'); btn.disabled = true; setMsg('#up-msg', 'Saving…');
    var upload = file ? P.upload('report', file) : Promise.resolve(null);
    upload.then(function (f) { return P.post('/api/reports', { test_key: tid, date: date, values: values, ranges: ranges, file_id: f ? f.id : undefined }); })
      .then(function (r) {
        btn.disabled = false; $('#up-form').reset(); $('#up-date').value = key(today);
        return reload().then(function () { setMsg('#up-msg', 'Saved.' + (r.visible_to.length ? ' ' + r.visible_to.join(', ') + ' can see it.' : '')); });
      }, function (er) { btn.disabled = false; setMsg('#up-msg', er.message, true); });
  });

  /* ---------- interactions: plan, summary, sharing ---------- */
  $('#plan-body').addEventListener('change', function (e) {
    var c = e.target.closest('[data-diet]'); if (!c) return;
    P.put('/api/diet', { idx: +c.dataset.diet, done: c.checked }).then(reload);
  });
  $('#view-summary').addEventListener('change', function (e) { if (e.target.id === 'sum-doc-sel') { state.summaryDoc = e.target.value; RENDER.summary(); } });
  $('#view-summary').addEventListener('click', function (e) {
    if (e.target.closest('#sum-print')) { window.print(); return; }
    if (e.target.closest('#sum-share')) P.post('/api/summary/' + state.summaryDoc + '/share').then(reload);
  });

  $('#share-docs').addEventListener('change', function (e) {
    var t = e.target, x;
    if (t.hasAttribute('data-sh')) {
      var p = t.dataset.sh.split('|'), body = {}; body[p[1]] = t.checked;
      P.put('/api/links/' + p[0], { share: body }).then(reload, function (er) { t.checked = !t.checked; alert(er.message); });
    } else if ((x = t.getAttribute('data-exp'))) P.put('/api/links/' + x, { expires: t.value }).then(reload);
  });
  $('#share-docs').addEventListener('click', function (e) {
    var t = e.target, x;
    if ((x = t.closest('[data-revoke]'))) state.revokeAsk = x.dataset.revoke;
    else if (t.closest('[data-revoke-no]')) state.revokeAsk = null;
    else if ((x = t.closest('[data-revoke-yes]'))) { P.del('/api/links/' + x.dataset.revokeYes).then(function () { state.revokeAsk = null; return reload(); }); return; }
    else return;
    RENDER.sharing();
  });
  $('#em-form').addEventListener('submit', function (e) {
    e.preventDefault();
    P.put('/api/emergency', { name: $('#em-name').value.trim(), relation: $('#em-rel').value.trim(), phone: $('#em-phone').value.replace(/\s/g, ''), consent: $('#em-consent').checked, alert_doctor: $('#em-doc').checked, auto_alert: $('#em-auto').checked })
      .then(function () { return reload().then(function () { setMsg('#em-msg', 'Saved. Only used if you ask for urgent help.'); }); }, function (er) { setMsg('#em-msg', er.message, true); });
  });
  $('#data-export').addEventListener('click', function () {
    fetch('/api/data/export', { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('Could not prepare your data.'); return r.blob(); })
      .then(function (b) { saveBlob(b, 'my-pulse-data.json'); setMsg('#data-msg', 'Downloaded a copy of your data.'); }, function (er) { setMsg('#data-msg', er.message, true); });
  });
  $('#data-delete').addEventListener('click', function () { state.deleteAsk = true; setMsg('#data-msg', ''); drawDeleteBox(); var f = $('#del-pass'); if (f) f.focus(); });
  $('#data-confirm').addEventListener('click', function (e) {
    if (e.target.closest('#del-no')) { state.deleteAsk = false; return drawDeleteBox(); }
    if (e.target.closest('#del-yes')) {
      P.post('/api/data/delete', { password: $('#del-pass').value }).then(function () { window.location.href = '/index.html'; }, function (er) { setMsg('#del-msg', er.message, true); });
    }
  });

  /* ---------- start ---------- */
  Promise.all([P.get('/api/healthcare'), loadProviders(), P.get('/api/me')]).then(function (r) {
    ingest(r[0]); P.applyUser(r[2].user);
    show(location.hash.slice(1));
  }, function (e) { $('#main').innerHTML = '<div class="card"><p class="empty">' + esc(e.message) + '</p></div>'; });
})();
