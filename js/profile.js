/* Pulse profile. Everything is read from, and saved to, the local server. */
(function () {
  'use strict';
  var Pu = window.Pulse;

  /* ---------- helpers ---------- */
  function $(s) { return document.querySelector(s); }
  var esc = Pu.esc, pad = Pu.pad, key = Pu.keyOf, parseKey = Pu.parseKey, addDays = Pu.addDays;
  var today = Pu.todayDate();
  function fmtDate(d) { return d ? Pu.fmtDateY(d) : '–'; }
  function fmtShort(d) { return d ? Pu.fmtDate(d) : '–'; }
  function ageOf(dobKey) { var d = parseKey(dobKey), a = today.getFullYear() - d.getFullYear(), m = today.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--; return a; }
  function fmtTime(t) { var h = +t.slice(0, 2), m = t.slice(3); return ((h % 12) || 12) + ':' + m + ' ' + (h >= 12 ? 'pm' : 'am'); }
  function phoneFmt(d) { return '+91 ' + d.slice(0, 5) + ' ' + d.slice(5); }
  function setMsg(sel, text, isErr) { var el = $(sel); if (!el) return; el.textContent = text; el.className = 'msg-line' + (isErr ? ' err' : ''); }
  var LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l4.5 4.5L19 7"/></svg>';
  function parseTs(s) { return s ? new Date(String(s).replace(' ', 'T')) : null; }

  /* ---------- state (filled from the server) ---------- */
  var P = {}, N = null, PL = null, BASE = null, LINKS = [], EM = null, CONS = {};
  var S = { editing: null, hide: false, bmi: false, tmp: null, msg: '' };

  var SEX = ['Female', 'Male', 'Intersex', 'Prefer not to say'];
  var LANGS = ['English', 'हिन्दी (Hindi)', 'ಕನ್ನಡ (Kannada)'];
  var CITIES = ['Bengaluru', 'Elsewhere in India'];
  var DIETS = ['Vegetarian', 'Eggetarian', 'Non-vegetarian', 'Vegan', 'Jain', 'Other'];
  var WORKS = ['Desk job', 'Hybrid', 'Shift work', 'Night shifts', 'Student', 'Homemaker', 'Other'];
  var FAMILY = ['Type 2 diabetes', 'Thyroid condition', 'High blood pressure', 'Heart disease', 'PCOS', 'Depression or anxiety', 'Cancer (any type)'];

  function apply(d) {
    var u = d.user;
    Pu.user = u;
    P.first = u.first_name; P.last = u.last_name; P.pref = u.preferred_name; P.dob = u.dob; P.sex = u.sex || '';
    P.email = u.email; P.emailOk = u.email_verified; P.phone = u.phone; P.phoneOk = u.phone_verified;
    P.city = u.city; P.lang = u.language; P.photo = u.photo; P.initials = u.initials;
    P.since = parseTs(u.created_at); P.since.setHours(0, 0, 0, 0);
    P.height = d.body.height_cm; P.daysTracked = d.days_tracked;
    P.weight = d.body.weight ? d.body.weight.value : null; P.weightDate = d.body.weight ? parseKey(d.body.weight.date) : null;
    P.waist = d.body.waist ? d.body.waist.value : null; P.waistDate = d.body.waist ? parseKey(d.body.waist.date) : null;
    var h = d.health;
    P.conditions = h.conditions; P.allergies = h.allergies; P.noAllergies = h.no_allergies; P.family = h.family; P.familyNone = h.family_none;
    P.diet = h.diet; P.work = h.work; P.workNote = h.work_note || '';
    N = d.notifications;
    PL = { price: d.plan.price, status: d.plan.status, renews: d.plan.renews ? parseKey(d.plan.renews) : null, method: d.plan.method, cancelAsk: false };
    S.hide = d.ui.hide_numbers; S.bmi = d.ui.show_bmi;
    BASE = d.baseline; LINKS = d.links; EM = d.emergency; CONS = d.consents;
  }
  function load() {
    return Pu.get('/api/profile').then(function (d) { apply(d); renderAll(); }, function (e) { setMsg('#photo-msg', e.message, true); });
  }

  function mask(v, unit) { return S.hide ? '•••' : (v == null ? '–' : v + (unit ? ' <span class="u">' + unit + '</span>' : '')); }
  function bmiOf() { if (!P.height || P.weight == null) return null; var h = P.height / 100; return Math.round(P.weight / (h * h) * 10) / 10; }
  function row(k, v) { return '<div class="dl-row"><dt>' + k + '</dt><dd>' + v + '</dd></div>'; }
  function opts(list, cur, blank) { return (blank ? '<option value="">' + blank + '</option>' : '') + list.map(function (o) { return '<option' + (o === cur ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join(''); }

  /* ---------- hero ---------- */
  function renderHero() {
    var big = $('#av-big');
    if (P.photo) big.innerHTML = '<img src="' + esc(P.photo) + '" alt="">'; else big.textContent = P.initials;
    Pu.applyUser(Pu.user);
    $('#photo-remove').hidden = !P.photo;
    $('.hero-actions').hidden = !P.photo;
    $('#hero-name').textContent = P.first + ' ' + P.last;
    $('#hero-sub').textContent = P.city + ' · ' + ageOf(P.dob) + ' years old';
    $('#hero-chips').innerHTML =
      (P.phoneOk ? '<span class="chip-ok">' + CHECK + 'Mobile verified</span>' : '<span class="chip-warn">Mobile not verified</span>') +
      (P.emailOk ? '<span class="chip-ok">' + CHECK + 'Email verified</span>' : '<span class="chip-warn">Email not verified</span>') +
      '<span class="chip-warn">Member since ' + fmtShort(P.since) + '</span>';
    $('#hero-stats').innerHTML =
      '<div class="hstat"><div class="v">' + ageOf(P.dob) + '</div><div class="k">Age</div></div>' +
      '<div class="hstat"><div class="v">' + (P.height || '–') + ' <span class="u">cm</span></div><div class="k">Height</div></div>' +
      '<div class="hstat"><div class="v">' + mask(P.weight == null ? null : P.weight.toFixed(1), 'kg') + '</div><div class="k">Weight</div></div>' +
      '<div class="hstat"><div class="v">' + mask(P.waist, 'cm') + '</div><div class="k">Waist</div></div>' +
      '<div class="hstat"><div class="v">' + P.daysTracked + ' <span class="u">days</span></div><div class="k">Tracked</div></div>';
  }

  /* ---------- personal ---------- */
  function renderPersonal() {
    var el = $('#personal-body'), btn = $('[data-edit="personal"]');
    btn.hidden = S.editing === 'personal';
    if (S.editing !== 'personal') {
      var ok = CHECK.replace('<svg', '<svg width="12" height="12"');
      el.innerHTML = '<dl class="dl">' +
        row('Full name', esc(P.first + ' ' + P.last)) +
        row('Preferred name', esc(P.pref) + ' <span class="muted">· used in greetings</span>') +
        row('Date of birth', fmtDate(parseKey(P.dob)) + ' <span class="muted">· ' + ageOf(P.dob) + ' years</span>') +
        row('Sex at birth', esc(P.sex || 'Not set')) +
        row('Email', esc(P.email) + (P.emailOk ? '<span class="mini-ok">' + ok + 'verified</span>' : '<span class="mini-no">not verified</span>')) +
        row('Mobile', phoneFmt(P.phone) + (P.phoneOk ? '<span class="mini-ok">' + ok + 'verified</span>' : '<span class="mini-no">not verified</span>')) +
        row('City', esc(P.city)) +
        row('Language', esc(P.lang)) + '</dl>' + (S.msg === 'personal' ? '<p class="msg-line" role="status">Saved.</p>' : '');
      return;
    }
    el.innerHTML = '<form id="personal-form" novalidate><div class="form-grid">' +
      '<div class="field"><label for="p-first">First name</label><input class="input" id="p-first" value="' + esc(P.first) + '" maxlength="40" autocomplete="given-name"></div>' +
      '<div class="field"><label for="p-last">Last name</label><input class="input" id="p-last" value="' + esc(P.last) + '" maxlength="40" autocomplete="family-name"></div>' +
      '<div class="field"><label for="p-pref">Preferred name</label><input class="input" id="p-pref" value="' + esc(P.pref) + '" maxlength="30"></div>' +
      '<div class="field"><label for="p-dob">Date of birth</label><input class="input" id="p-dob" type="date" value="' + P.dob + '" max="' + key(today) + '"></div>' +
      '<div class="field"><label for="p-sex">Sex at birth</label><select class="input" id="p-sex">' + opts(SEX, P.sex) + '</select></div>' +
      '<div class="field"><label for="p-city">City</label><select class="input" id="p-city">' + opts(CITIES, P.city) + '</select></div>' +
      '<div class="field wide"><label for="p-email">Email</label><input class="input" id="p-email" type="email" value="' + esc(P.email) + '" autocomplete="email"></div>' +
      '<div class="field"><label for="p-phone">Mobile (10 digits)</label><input class="input" id="p-phone" type="tel" inputmode="numeric" maxlength="10" value="' + esc(P.phone) + '" autocomplete="tel-national"></div>' +
      '<div class="field"><label for="p-lang">Language</label><select class="input" id="p-lang">' + opts(LANGS, P.lang) + '</select></div></div>' +
      '<p class="fine" style="margin-top:10px">Changing your email or mobile means we ask you to verify it again. Provider search covers Bengaluru only for now.</p>' +
      '<p class="msg-line" id="personal-msg" role="status"></p>' +
      '<div class="btn-row tight"><button class="btn btn-inline btn-sm" type="submit">Save</button><button class="btn-outline-sm" type="button" data-cancel="personal">Cancel</button></div></form>';
  }
  function savePersonal() {
    var first = $('#p-first').value.trim(), last = $('#p-last').value.trim(), dob = $('#p-dob').value;
    if (!first || !last) return setMsg('#personal-msg', 'Add your first and last name.', true);
    if (!dob) return setMsg('#personal-msg', 'Enter a valid date of birth.', true);
    Pu.put('/api/profile/personal', {
      first_name: first, last_name: last, preferred_name: $('#p-pref').value.trim(), dob: dob, sex: $('#p-sex').value, city: $('#p-city').value,
      language: $('#p-lang').value, email: $('#p-email').value.trim(), phone: $('#p-phone').value.replace(/\s/g, '')
    }).then(function () { S.editing = null; S.msg = 'personal'; return load(); }, function (e) { setMsg('#personal-msg', e.message, true); });
  }

  /* ---------- body ---------- */
  function renderBody() {
    var el = $('#body-body'), btn = $('[data-edit="body"]');
    btn.hidden = S.editing === 'body';
    var bmi = bmiOf();
    var h = '<div class="stats" style="margin-top:14px">' +
      '<div class="stat"><div class="k">Height</div><div class="v">' + (P.height || '–') + ' <span class="u">cm</span></div><div class="s">Edited here</div></div>' +
      '<div class="stat"><div class="k">Weight</div><div class="v">' + mask(P.weight == null ? null : P.weight.toFixed(1), 'kg') + '</div><div class="s">' + (P.weightDate ? 'Logged ' + fmtShort(P.weightDate) : 'Not logged yet') + '</div></div>' +
      '<div class="stat"><div class="k">Waist</div><div class="v">' + mask(P.waist, 'cm') + '</div><div class="s">' + (P.waistDate ? 'Logged ' + fmtShort(P.waistDate) : 'Not logged yet') + '</div></div>' +
      (S.bmi ? '<div class="stat"><div class="k">BMI</div><div class="v">' + (S.hide ? '•••' : (bmi == null ? '–' : bmi)) + '</div><div class="s">A rough guide only</div></div>' : '') + '</div>';
    if (S.bmi && !S.hide) h += '<p class="fine" style="margin-top:10px">BMI cut-offs differ for South Asians and it is less reliable with PCOS. Talk to your doctor before reading anything into it.</p>';
    h += '<p class="fine" style="margin-top:10px">Weight and waist are logged in <a href="tracker.html#weight">Tracker</a>, so there is one place to update them.</p>';
    if (S.editing === 'body') {
      h += '<form id="body-form" novalidate style="margin-top:12px"><div class="form-grid"><div class="field"><label for="b-height">Height (cm)</label><input class="input" id="b-height" type="number" inputmode="decimal" min="100" max="230" step="1" value="' + (P.height || '') + '"></div></div>' +
        '<p class="msg-line" id="body-msg" role="status"></p><div class="btn-row tight"><button class="btn btn-inline btn-sm" type="submit">Save</button><button class="btn-outline-sm" type="button" data-cancel="body">Cancel</button></div></form>';
    }
    h += '<div style="margin-top:14px"><label class="perm" style="cursor:pointer"><span class="grow"><strong>Hide numbers</strong><span class="meta">Blurs weight, waist and BMI on this page</span></span><span class="switch"><input type="checkbox" id="sw-hide"' + (S.hide ? ' checked' : '') + '><span></span></span></label>' +
      '<label class="perm" style="cursor:pointer"><span class="grow"><strong>Show BMI</strong><span class="meta">Off by default</span></span><span class="switch"><input type="checkbox" id="sw-bmi"' + (S.bmi ? ' checked' : '') + '><span></span></span></label></div>';
    el.innerHTML = h;
  }
  function saveBody() {
    var h = parseFloat($('#b-height').value);
    if (isNaN(h) || h < 100 || h > 230) return setMsg('#body-msg', 'Enter a height between 100 and 230 cm.', true);
    Pu.put('/api/profile/body', { height_cm: h }).then(function () { S.editing = null; return load(); }, function (e) { setMsg('#body-msg', e.message, true); });
  }
  function saveUi() { return Pu.put('/api/settings/ui', { hide_numbers: S.hide, show_bmi: S.bmi }); }

  /* ---------- health background ---------- */
  function renderHealth() {
    var el = $('#health-body'), btn = $('[data-edit="health"]'), t = S.tmp;
    btn.hidden = S.editing === 'health';
    if (S.editing !== 'health') {
      el.innerHTML = '<dl class="dl">' +
        row('Conditions', P.conditions.length ? '<div class="tag-list" style="margin-top:0">' + P.conditions.map(function (c) { return '<span class="tag-plain">' + esc(c.name) + (c.year ? ' · ' + c.year : '') + '</span>'; }).join('') + '</div>' : '<span class="muted">None added</span>') +
        row('Allergies', P.noAllergies ? '<span class="muted">None known</span>' : '<div class="tag-list" style="margin-top:0">' + P.allergies.map(function (a) { return '<span class="tag-plain">' + esc(a) + '</span>'; }).join('') + '</div>') +
        row('Family history', P.familyNone ? '<span class="muted">None that I know of</span>' : (P.family.length ? '<div class="tag-list" style="margin-top:0">' + P.family.map(function (f) { return '<span class="tag-plain">' + esc(f) + '</span>'; }).join('') + '</div>' : '<span class="muted">Not added</span>')) +
        row('Diet', P.diet ? esc(P.diet) : '<span class="muted">Not set</span>') +
        row('Work', (P.work ? esc(P.work) : '<span class="muted">Not set</span>') + (P.workNote ? '<br><span class="muted">' + esc(P.workNote) + '</span>' : '')) + '</dl>' +
        '<p class="fine" style="margin-top:14px">Self-reported. A doctor has not verified this.</p>' + (S.msg === 'health' ? '<p class="msg-line" role="status">Saved.</p>' : '');
      return;
    }
    el.innerHTML = '<form id="health-form" novalidate>' +
      '<p class="fine" style="margin-top:14px;font-weight:700;color:var(--navy)">Diagnosed conditions</p>' +
      '<div class="tag-list">' + (t.conditions.map(function (c, i) { return '<span class="tag-x">' + esc(c.name) + (c.year ? ' · ' + c.year : '') + '<button type="button" data-del-cond="' + i + '" aria-label="Remove ' + esc(c.name) + '">×</button></span>'; }).join('') || '<span class="muted">None added</span>') + '</div>' +
      '<div class="form-grid"><div class="field"><label for="h-cond">Condition</label><input class="input" id="h-cond" maxlength="60" placeholder="e.g. Hypothyroidism"></div>' +
      '<div class="field"><label for="h-year">Year diagnosed</label><input class="input" id="h-year" type="number" inputmode="numeric" min="1950" max="' + today.getFullYear() + '" placeholder="optional"></div></div>' +
      '<div class="btn-row tight" style="margin-top:10px"><button class="btn-outline-sm" type="button" id="h-add-cond">Add condition</button></div>' +
      '<p class="fine" style="margin-top:18px;font-weight:700;color:var(--navy)">Allergies</p>' +
      '<label class="check-row" style="margin-top:6px"><input type="checkbox" id="h-noall"' + (t.noAllergies ? ' checked' : '') + '> None known</label>' +
      (t.noAllergies ? '' : '<div class="tag-list">' + (t.allergies.map(function (a, i) { return '<span class="tag-x">' + esc(a) + '<button type="button" data-del-all="' + i + '" aria-label="Remove ' + esc(a) + '">×</button></span>'; }).join('') || '<span class="muted">None added</span>') + '</div>' +
        '<div class="form-grid"><div class="field"><label for="h-all">Allergy</label><input class="input" id="h-all" maxlength="60" placeholder="e.g. Penicillin"></div></div><div class="btn-row tight" style="margin-top:10px"><button class="btn-outline-sm" type="button" id="h-add-all">Add allergy</button></div>') +
      '<p class="fine" style="margin-top:18px;font-weight:700;color:var(--navy)">Family history</p>' +
      '<div class="chips" role="group" aria-label="Family history">' + FAMILY.map(function (f) { return '<button type="button" class="chip-btn" data-fam="' + esc(f) + '" aria-pressed="' + (t.family.indexOf(f) >= 0 && !t.familyNone) + '">' + esc(f) + '</button>'; }).join('') + '</div>' +
      '<label class="check-row"><input type="checkbox" id="h-famnone"' + (t.familyNone ? ' checked' : '') + '> None that I know of</label>' +
      '<div class="form-grid"><div class="field"><label for="h-diet">Diet</label><select class="input" id="h-diet">' + opts(DIETS, t.diet, 'Not set') + '</select></div>' +
      '<div class="field"><label for="h-work">Work pattern</label><select class="input" id="h-work">' + opts(WORKS, t.work, 'Not set') + '</select></div>' +
      '<div class="field wide"><label for="h-note">Anything about your work hours your doctor should know</label><input class="input" id="h-note" maxlength="120" value="' + esc(t.workNote) + '" placeholder="e.g. Night shifts three days a week"></div></div>' +
      '<p class="msg-line" id="health-msg" role="status"></p><div class="btn-row tight"><button class="btn btn-inline btn-sm" type="submit">Save</button><button class="btn-outline-sm" type="button" data-cancel="health">Cancel</button></div></form>';
  }
  function startHealth() {
    S.tmp = { conditions: P.conditions.map(function (c) { return { name: c.name, year: c.year }; }), allergies: P.allergies.slice(), noAllergies: P.noAllergies, family: P.family.slice(), familyNone: P.familyNone, diet: P.diet, work: P.work, workNote: P.workNote };
  }
  function syncHealthFields() { if (!$('#h-diet')) return; S.tmp.diet = $('#h-diet').value || null; S.tmp.work = $('#h-work').value || null; S.tmp.workNote = $('#h-note').value; }

  /* ---------- baseline ---------- */
  function pair(a, b) { return (a == null ? '–' : a) + ' <i>→</i> ' + (b == null ? '–' : b); }
  function renderBaseline() {
    var first = BASE.phq9.first_date ? parseKey(BASE.phq9.first_date) : P.since;
    $('#baseline-body').innerHTML = '<p class="fine" style="margin-top:14px">Your starting point on ' + fmtDate(first) + ', and where you are now.</p><div class="delta-grid">' +
      '<div class="bcell"><div class="k">Health Factor</div><div class="v">' + pair(BASE.hf.first, BASE.hf.now) + '</div><div class="s">Day 1 to today</div></div>' +
      '<div class="bcell"><div class="k">PHQ-9</div><div class="v">' + pair(BASE.phq9.first, BASE.phq9.now) + '</div><div class="s">Out of 27</div></div>' +
      '<div class="bcell"><div class="k">GAD-7</div><div class="v">' + pair(BASE.gad7.first, BASE.gad7.now) + '</div><div class="s">Out of 21</div></div>' +
      '<div class="bcell"><div class="k">Weight</div><div class="v">' + (S.hide ? '•••' : pair(BASE.weight.first, BASE.weight.now)) + '</div><div class="s">' + (S.hide ? 'Hidden' : 'kg') + '</div></div></div>' +
      '<p class="fine" style="margin-top:14px">PHQ-9 and GAD-7 are self-reported screening scores, not a diagnosis. Lower means fewer symptoms reported.' + (BASE.phq9.first == null ? ' Take them from the Tracker, under Stress &amp; anxiety, to set your starting point.' : '') + '</p>';
  }

  /* ---------- notifications ---------- */
  function inQuiet(t) { var q = N.quiet; if (!q.on) return false; return q.from > q.to ? (t >= q.from || t < q.to) : (t >= q.from && t < q.to); }
  function sw(id, on, title, sub, extra) {
    return '<label class="perm" style="cursor:pointer"><span class="grow"><strong>' + title + '</strong>' + (sub ? '<span class="meta">' + sub + '</span>' : '') + '</span>' + (extra || '') +
      '<span class="switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span></span></span></label>';
  }
  function timeIn(id, val, label) { return '<input class="input time-in" id="' + id + '" type="time" value="' + val + '" aria-label="' + label + '">'; }
  function renderNotif() {
    var h = sw('n-on', N.on, 'Allow notifications', 'Appointment reminders always come through');
    if (N.on) {
      h += '<div style="margin:14px 0 6px"><p style="font-weight:700;color:var(--navy);font-size:.9375rem">Nudges per day</p><div class="seg" id="n-limit" role="group" aria-label="Nudges per day" style="margin-top:8px">' +
        [0, 1, 2, 3].map(function (n) { return '<button type="button" data-lim="' + n + '" aria-pressed="' + (N.limit === n) + '">' + (n === 0 ? 'Off' : n) + '</button>'; }).join('') + '</div></div>';
      h += sw('n-quiet', N.quiet.on, 'Quiet hours', 'Nothing is sent in this window', timeIn('n-qfrom', N.quiet.from, 'Quiet hours start') + '<span class="muted" style="margin:0 6px">to</span>' + timeIn('n-qto', N.quiet.to, 'Quiet hours end').replace('time-in"', 'time-in" style="margin-left:0"'));
      h += sw('n-checkin', N.checkin.on, 'Daily check-in reminder', 'A gentle prompt to log how you feel', timeIn('n-checkin-t', N.checkin.time, 'Check-in reminder time'));
      if (N.checkin.on && inQuiet(N.checkin.time)) h += '<p class="warn-line">This falls in quiet hours, so it will arrive at ' + fmtTime(N.quiet.to) + '.</p>';
      h += sw('n-meds', N.meds.on, 'Medication reminder', 'Only for medicines you added', timeIn('n-meds-t', N.meds.time, 'Medication reminder time'));
      if (N.meds.on && inQuiet(N.meds.time)) h += '<p class="warn-line">This falls in quiet hours, so it will arrive at ' + fmtTime(N.quiet.to) + '.</p>';
      h += sw('n-data', N.data, 'When your data changes noticeably', 'A nudge tied to what you tracked, not to whether you opened the app');
      h += sw('n-weekly', N.weekly, 'Weekly summary', 'A short recap each Sunday');
      h += '<div class="perm locked"><span class="grow"><strong>Appointment reminders</strong><span class="meta">Always on while you have a booking</span></span><span class="st reviewed">Always on</span></div>';
      h += sw('n-neutral', N.neutral, 'Keep wording neutral', 'Notifications never name a condition or a doctor\'s specialty');
      h += '<div class="sum-box" id="n-sum">' + (N.limit === 0 ? 'Nudges are off. You will still get appointment reminders.' : 'At most ' + N.limit + ' nudge' + (N.limit > 1 ? 's' : '') + ' a day' + (N.quiet.on ? ', never between ' + fmtTime(N.quiet.from) + ' and ' + fmtTime(N.quiet.to) : '') + '.') + '</div>';
    }
    h += '<p class="msg-line" id="notif-msg" role="status"></p>';
    $('#notif-body').innerHTML = h;
  }
  function saveNotif() {
    Pu.put('/api/settings/notifications', N).then(function () { setMsg('#notif-msg', 'Saved.'); }, function (e) { load().then(function () { setMsg('#notif-msg', e.message, true); }); });
  }

  /* ---------- consents (the right to withdraw) ---------- */
  function renderConsents() {
    $('#consents-body').innerHTML = '<p class="fine" style="margin-top:14px">Turning one off stops Pulse collecting that kind of data from now on. What you already logged stays until you delete it, from Healthcare, under Sharing &amp; privacy.</p><div>' +
      Object.keys(Pu.CONSENT_TEXT).map(function (k) {
        var t = Pu.CONSENT_TEXT[k], locked = t[2];
        return '<label class="perm"' + (locked ? '' : ' style="cursor:pointer"') + '><span class="grow"><strong>' + esc(t[0]) + '</strong><span class="meta">' + esc(t[1]) + '</span></span>' +
          (locked ? '<span class="st reviewed">Needed</span>' : '<span class="switch"><input type="checkbox" data-consent="' + k + '"' + (CONS[k] ? ' checked' : '') + ' aria-label="' + esc(t[0]) + '"><span></span></span>') + '</label>';
      }).join('') + '</div><p class="msg-line" id="cons-msg" role="status"></p>';
  }

  /* ---------- plan ---------- */
  function renderPlan() {
    var cancelled = PL.status === 'cancelled';
    var h = '<div class="plan-price"><b>₹' + PL.price + '</b><span class="muted">per month</span> <span class="st ' + (cancelled ? 'cancelled' : 'uploaded') + '" style="margin-left:6px">' + (cancelled ? 'Ending' : 'Active') + '</span></div>' +
      '<p class="muted" style="margin-top:6px">' + (cancelled ? 'Your plan ends on ' + fmtDate(PL.renews) + '. You keep full access until then.' : 'Renews on ' + fmtDate(PL.renews) + '.') + '</p>' +
      '<p class="fine" style="margin-top:8px">Your doctors use Pulse for free. Cancel any time. Payments aren\'t connected in this prototype.</p>' +
      '<div class="bill-row" style="margin-top:12px"><span class="muted">Payment method</span><strong>' + esc(PL.method) + '</strong></div>';
    if (PL.cancelAsk) h += '<div class="confirm-box" style="margin-top:12px"><strong>Cancel your plan?</strong><p class="fine" style="margin-top:4px">You keep access until ' + fmtDate(PL.renews) + '. Your data stays yours either way.</p><div class="btn-row"><button class="btn-danger-sm" type="button" id="pl-yes">Yes, cancel</button><button class="btn-outline-sm" type="button" id="pl-no">Keep my plan</button></div></div>';
    else h += '<div class="btn-row">' + (cancelled ? '<button class="btn btn-inline btn-sm" type="button" id="pl-resume">Resume plan</button>' : '<button class="btn-outline-sm" type="button" id="pl-ask">Cancel plan</button>') + '</div>';
    $('#plan-body').innerHTML = h;
  }

  /* ---------- care team ---------- */
  function renderCare() {
    var link = 'display:inline-flex;align-items:center;text-decoration:none';
    var h = LINKS.length ? LINKS.map(function (l) {
      return '<div class="item-top" style="margin-top:14px"><span class="avatar-lg avatar-md" aria-hidden="true">' + esc(l.ini) + '</span><div class="grow"><strong>' + esc(l.name) + '</strong><span class="meta">' + esc(l.spec) + ' · linked</span></div><span class="st uploaded">Linked</span></div>';
    }).join('') : '<p class="muted" style="margin-top:14px">No doctor linked yet.</p>';
    h += '<div class="btn-row" style="margin-top:12px"><a class="btn-outline-sm" href="healthcare.html#sharing" style="' + link + '">Manage sharing</a><a class="btn-outline-sm" href="healthcare.html#providers" style="' + link + '">Find a doctor</a></div>' +
      '<h3 style="margin-top:18px;font-size:.8125rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Emergency contact</h3>';
    h += EM ? '<p style="margin-top:6px"><strong>' + esc(EM.name) + '</strong>' + (EM.relation ? ' · ' + esc(EM.relation) : '') + ' · ' + esc(EM.phone.slice(0, 2)) + '••••••' + esc(EM.phone.slice(-2)) + '</p><p class="fine">Told if you ask for urgent help' + (EM.auto_alert ? ' or if a Journal check-in is very low' : '') + (EM.alert_doctor ? ', and your linked doctor is told too' : '') + '.</p>'
      : '<p class="muted" style="margin-top:6px">Not set up yet. Someone you trust, contacted only if you ask for urgent help.</p>';
    h += '<div class="btn-row" style="margin-top:10px"><a class="btn-outline-sm" href="healthcare.html#sharing" style="' + link + '">' + (EM ? 'Change emergency contact' : 'Set up emergency contact') + '</a></div>';
    $('#care-body').innerHTML = h;
  }

  /* ---------- render ---------- */
  function renderAll() {
    renderHero(); renderPersonal(); renderBody(); renderHealth(); renderBaseline(); renderNotif(); renderConsents(); renderPlan(); renderCare();
    S.msg = '';
  }
  [['personal', 'Linked doctors see your name, age and sex. Your phone and email are never shared.'],
   ['body', 'Linked doctors see your height. Weight and waist follow your "Weight & waist" sharing choice.'],
   ['health', 'Shared with doctors you link, if you allow "Basic details & health background" in Healthcare.'],
   ['baseline', 'Follows your sharing choices for each type of data.'],
   ['notif', 'Only you.'], ['cons', 'Only you.'], ['plan', 'Only you.'], ['care', 'Managed in Healthcare.']
  ].forEach(function (v) { var el = $('#vis-' + v[0]); if (el) el.innerHTML = LOCK + '<span>' + v[1] + '</span>'; });

  /* ---------- interactions ---------- */
  var profile = $('#profile');
  document.addEventListener('click', function (e) { if (!profile.contains(e.target)) profile.open = false; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') profile.open = false; });

  $('#cam-btn').addEventListener('click', function () { $('#photo-in').click(); });
  $('#photo-in').addEventListener('change', function () {
    var f = this.files[0], input = this; if (!f) return;
    if (!/^image\//.test(f.type)) return setMsg('#photo-msg', 'Choose an image file.', true);
    if (f.size > 5 * 1024 * 1024) return setMsg('#photo-msg', 'That photo is over 5 MB. Choose a smaller one.', true);
    setMsg('#photo-msg', 'Uploading…');
    Pu.upload('photo', f).then(function () { setMsg('#photo-msg', 'Photo updated. It is stored only on this computer and is never shared with doctors.'); input.value = ''; return load(); },
      function (e) { setMsg('#photo-msg', e.message, true); input.value = ''; });
  });
  $('#photo-remove').addEventListener('click', function () { Pu.del('/api/profile/photo').then(function () { setMsg('#photo-msg', 'Photo removed.'); return load(); }, function (e) { setMsg('#photo-msg', e.message, true); }); });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-edit]');
    if (b) { S.editing = b.dataset.edit; if (S.editing === 'health') startHealth(); renderAll(); var f = $('#' + { personal: 'p-first', body: 'b-height', health: 'h-cond' }[S.editing]); if (f) f.focus(); return; }
    b = e.target.closest('[data-cancel]'); if (b) { S.editing = null; S.tmp = null; renderAll(); }
  });

  $('#personal-body').addEventListener('submit', function (e) { e.preventDefault(); savePersonal(); });
  $('#body-body').addEventListener('submit', function (e) { e.preventDefault(); saveBody(); });
  $('#body-body').addEventListener('change', function (e) {
    if (e.target.id === 'sw-hide') S.hide = e.target.checked; else if (e.target.id === 'sw-bmi') S.bmi = e.target.checked; else return;
    renderAll(); saveUi().catch(function () {});
  });

  var H = $('#health-body');
  H.addEventListener('submit', function (e) {
    e.preventDefault(); syncHealthFields(); var t = S.tmp;
    if (!t.noAllergies && !t.allergies.length) return setMsg('#health-msg', 'Add an allergy, or tick "None known".', true);
    Pu.put('/api/profile/health', {
      conditions: t.conditions, allergies: t.noAllergies ? [] : t.allergies, no_allergies: t.noAllergies, family: t.familyNone ? [] : t.family, family_none: t.familyNone,
      diet: t.diet || '', work: t.work || '', work_note: (t.workNote || '').trim()
    }).then(function () { S.editing = null; S.tmp = null; S.msg = 'health'; return load(); }, function (er) { setMsg('#health-msg', er.message, true); });
  });
  H.addEventListener('click', function (e) {
    var t = S.tmp, x; if (!t) return;
    if (e.target.closest('#h-add-cond')) {
      var name = $('#h-cond').value.trim(), yr = parseInt($('#h-year').value, 10);
      if (!name) return setMsg('#health-msg', 'Type the condition first.', true);
      if ($('#h-year').value && (isNaN(yr) || yr < 1950 || yr > today.getFullYear())) return setMsg('#health-msg', 'Check the year.', true);
      syncHealthFields(); t.conditions.push({ name: name, year: isNaN(yr) ? null : yr }); renderHealth();
    } else if ((x = e.target.closest('[data-del-cond]'))) { syncHealthFields(); t.conditions.splice(+x.dataset.delCond, 1); renderHealth(); }
    else if (e.target.closest('#h-add-all')) { var a = $('#h-all').value.trim(); if (!a) return setMsg('#health-msg', 'Type the allergy first.', true); syncHealthFields(); t.allergies.push(a); renderHealth(); }
    else if ((x = e.target.closest('[data-del-all]'))) { syncHealthFields(); t.allergies.splice(+x.dataset.delAll, 1); renderHealth(); }
    else if ((x = e.target.closest('[data-fam]'))) { syncHealthFields(); t.familyNone = false; var i = t.family.indexOf(x.dataset.fam); if (i >= 0) t.family.splice(i, 1); else t.family.push(x.dataset.fam); renderHealth(); }
  });
  H.addEventListener('change', function (e) {
    var t = S.tmp; if (!t) return;
    if (e.target.id === 'h-noall') { syncHealthFields(); t.noAllergies = e.target.checked; renderHealth(); }
    else if (e.target.id === 'h-famnone') { syncHealthFields(); t.familyNone = e.target.checked; if (t.familyNone) t.family = []; renderHealth(); }
  });

  $('#notif-body').addEventListener('change', function (e) {
    var id = e.target.id, v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (id === 'n-on') N.on = v; else if (id === 'n-quiet') N.quiet.on = v;
    else if (id === 'n-qfrom') { if (v === N.quiet.to) { e.target.value = N.quiet.from; return; } N.quiet.from = v; }
    else if (id === 'n-qto') { if (v === N.quiet.from) { e.target.value = N.quiet.to; return; } N.quiet.to = v; }
    else if (id === 'n-checkin') N.checkin.on = v; else if (id === 'n-checkin-t') { if (!v) return; N.checkin.time = v; }
    else if (id === 'n-meds') N.meds.on = v; else if (id === 'n-meds-t') { if (!v) return; N.meds.time = v; }
    else if (id === 'n-data') N.data = v; else if (id === 'n-weekly') N.weekly = v; else if (id === 'n-neutral') N.neutral = v;
    else return;
    renderNotif(); saveNotif();
  });
  $('#notif-body').addEventListener('click', function (e) { var b = e.target.closest('[data-lim]'); if (!b) return; N.limit = +b.dataset.lim; renderNotif(); saveNotif(); });

  $('#consents-body').addEventListener('change', function (e) {
    var k = e.target.dataset.consent; if (!k) return;
    var body = {}; body[k] = e.target.checked;
    Pu.put('/api/consents', { consents: body }).then(function (r) { CONS = r.consents; setMsg('#cons-msg', e.target.checked ? 'Turned on.' : 'Turned off. Pulse will stop collecting this from now on.'); },
      function (er) { e.target.checked = !e.target.checked; setMsg('#cons-msg', er.message, true); });
  });

  $('#plan-body').addEventListener('click', function (e) {
    if (e.target.closest('#pl-ask')) { PL.cancelAsk = true; return renderPlan(); }
    if (e.target.closest('#pl-no')) { PL.cancelAsk = false; return renderPlan(); }
    var path = e.target.closest('#pl-yes') ? '/api/plan/cancel' : e.target.closest('#pl-resume') ? '/api/plan/resume' : null;
    if (path) Pu.post(path).then(load);
  });

  load();
})();
