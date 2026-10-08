/* Pulse profile — static prototype.
   All details below are SIMULATED sample data held in memory. Nothing is stored or sent anywhere. */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var today = new Date(); today.setHours(0, 0, 0, 0);
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(d) { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function fmtShort(d) { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
  function ageOf(dobKey) { var d = parseKey(dobKey), a = today.getFullYear() - d.getFullYear(), m = today.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--; return a; }
  function fmtTime(t) { var h = +t.slice(0, 2), m = t.slice(3); return ((h % 12) || 12) + ':' + m + ' ' + (h >= 12 ? 'pm' : 'am'); }
  function phoneFmt(d) { return '+91 ' + d.slice(0, 5) + ' ' + d.slice(5); }
  function setMsg(sel, text, isErr) { var el = $(sel); if (!el) return; el.textContent = text; el.className = 'msg-line' + (isErr ? ' err' : ''); }
  var LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l4.5 4.5L19 7"/></svg>';

  /* ---------- sample data ---------- */
  var P = {
    first: 'Ananya', last: 'Raman', pref: 'Ananya', dob: '2002-03-14', sex: 'Female',
    email: 'ananya.raman@example.com', emailOk: true, phone: '9876543210', phoneOk: true,
    city: 'Bengaluru', lang: 'English', height: 162,
    weight: 73.1, weightDate: addDays(today, -2), waist: 86, waistDate: addDays(today, -21),
    conditions: [{ name: 'PCOS', year: 2025 }], allergies: [], noAllergies: true,
    family: ['Type 2 diabetes', 'Thyroid condition'], familyNone: false,
    diet: 'Non-vegetarian', work: 'Desk job', workNote: 'Often works late, with meetings after 8 pm',
    since: addDays(today, -90), photo: null
  };
  var N = { on: true, limit: 1, quiet: { on: true, from: '22:00', to: '08:00' }, checkin: { on: true, time: '21:00' }, meds: { on: true, time: '21:30' }, data: true, weekly: true, neutral: true };
  var D = { connected: true, lastSync: Date.now() - 4 * 60000, perms: { steps: true, hr: true, spo2: true, sleep: true } };
  var PL = { price: 399, status: 'active', renews: addDays(today, 18), method: 'UPI · an•••@upi', cancelAsk: false };
  var S = { editing: null, hide: false, bmi: false, tmp: null, msg: '' };

  var SEX = ['Female', 'Male', 'Intersex', 'Prefer not to say'];
  var LANGS = ['English', 'हिन्दी (Hindi)', 'ಕನ್ನಡ (Kannada)'];
  var CITIES = ['Bengaluru', 'Elsewhere in India'];
  var DIETS = ['Vegetarian', 'Eggetarian', 'Non-vegetarian', 'Vegan', 'Jain', 'Other'];
  var WORKS = ['Desk job', 'Hybrid', 'Shift work', 'Night shifts', 'Student', 'Homemaker', 'Other'];
  var FAMILY = ['Type 2 diabetes', 'Thyroid condition', 'High blood pressure', 'Heart disease', 'PCOS', 'Depression or anxiety', 'Cancer (any type)'];

  function initials() { return (P.first[0] || '') + (P.last[0] || ''); }
  function mask(v, unit) { return S.hide ? '•••' : v + (unit ? ' <span class="u">' + unit + '</span>' : ''); }
  function bmiOf() { var h = P.height / 100; return Math.round(P.weight / (h * h) * 10) / 10; }
  function row(k, v) { return '<div class="dl-row"><dt>' + k + '</dt><dd>' + v + '</dd></div>'; }
  function opts(list, cur) { return list.map(function (o) { return '<option' + (o === cur ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join(''); }

  /* ---------- hero ---------- */
  function renderHero() {
    var big = $('#av-big'), hdr = $('#hdr-avatar');
    if (P.photo) { big.innerHTML = '<img src="' + P.photo + '" alt="">'; hdr.innerHTML = '<img src="' + P.photo + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'; }
    else { big.textContent = initials(); hdr.textContent = initials(); }
    $('#photo-remove').hidden = !P.photo;
    $('.hero-actions').hidden = !P.photo;
    $('#hero-name').textContent = P.first + ' ' + P.last;
    $('#hero-sub').textContent = P.city + ' · ' + ageOf(P.dob) + ' years old';
    $('#hdr-name').textContent = P.pref || P.first;
    $('#menu-name').textContent = P.first + ' ' + P.last[0] + '.';
    $('#hero-chips').innerHTML =
      (P.phoneOk ? '<span class="chip-ok">' + CHECK + 'Mobile verified</span>' : '<span class="chip-warn">Mobile not verified</span>') +
      (P.emailOk ? '<span class="chip-ok">' + CHECK + 'Email verified</span>' : '<span class="chip-warn">Email not verified</span>') +
      '<span class="chip-warn">Member since ' + fmtShort(P.since) + '</span>';
    $('#hero-stats').innerHTML =
      '<div class="hstat"><div class="v">' + ageOf(P.dob) + '</div><div class="k">Age</div></div>' +
      '<div class="hstat"><div class="v">' + P.height + ' <span class="u">cm</span></div><div class="k">Height</div></div>' +
      '<div class="hstat"><div class="v">' + mask(P.weight.toFixed(1), 'kg') + '</div><div class="k">Weight</div></div>' +
      '<div class="hstat"><div class="v">' + mask(P.waist, 'cm') + '</div><div class="k">Waist</div></div>' +
      '<div class="hstat"><div class="v">90 <span class="u">days</span></div><div class="k">Tracked</div></div>';
  }

  /* ---------- personal ---------- */
  function renderPersonal() {
    var el = $('#personal-body'), btn = $('[data-edit="personal"]');
    btn.hidden = S.editing === 'personal';
    if (S.editing !== 'personal') {
      el.innerHTML = '<dl class="dl">' +
        row('Full name', esc(P.first + ' ' + P.last)) +
        row('Preferred name', esc(P.pref) + ' <span class="muted">· used in greetings</span>') +
        row('Date of birth', fmtDate(parseKey(P.dob)) + ' <span class="muted">· ' + ageOf(P.dob) + ' years</span>') +
        row('Sex at birth', esc(P.sex)) +
        row('Email', esc(P.email) + (P.emailOk ? '<span class="mini-ok">' + CHECK.replace('<svg', '<svg width="12" height="12"') + 'verified</span>' : '<span class="mini-no">not verified</span>')) +
        row('Mobile', phoneFmt(P.phone) + (P.phoneOk ? '<span class="mini-ok">' + CHECK.replace('<svg', '<svg width="12" height="12"') + 'verified</span>' : '<span class="mini-no">not verified</span>')) +
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
      '<div class="field"><label for="p-phone">Mobile (10 digits)</label><input class="input" id="p-phone" type="tel" inputmode="numeric" maxlength="10" value="' + P.phone + '" autocomplete="tel-national"></div>' +
      '<div class="field"><label for="p-lang">Language</label><select class="input" id="p-lang">' + opts(LANGS, P.lang) + '</select></div></div>' +
      '<p class="fine" style="margin-top:10px">Changing your email or mobile means we ask you to verify it again. Provider search covers Bengaluru only for now.</p>' +
      '<p class="msg-line" id="personal-msg" role="status"></p>' +
      '<div class="btn-row tight"><button class="btn btn-inline btn-sm" type="submit">Save</button><button class="btn-outline-sm" type="button" data-cancel="personal">Cancel</button></div></form>';
  }
  function savePersonal() {
    var first = $('#p-first').value.trim(), last = $('#p-last').value.trim(), pref = $('#p-pref').value.trim(), dob = $('#p-dob').value;
    var email = $('#p-email').value.trim(), phone = $('#p-phone').value.replace(/\s/g, '');
    if (!first || !last) return setMsg('#personal-msg', 'Add your first and last name.', true);
    if (!dob || parseKey(dob) > today) return setMsg('#personal-msg', 'Enter a valid date of birth.', true);
    if (ageOf(dob) < 18) return setMsg('#personal-msg', 'Pulse is for adults aged 18 and over.', true);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg('#personal-msg', 'That email address does not look right.', true);
    if (!/^[6-9]\d{9}$/.test(phone)) return setMsg('#personal-msg', 'Enter a 10-digit Indian mobile number.', true);
    if (email !== P.email) P.emailOk = false;
    if (phone !== P.phone) P.phoneOk = false;
    P.first = first; P.last = last; P.pref = pref || first; P.dob = dob; P.sex = $('#p-sex').value; P.city = $('#p-city').value; P.lang = $('#p-lang').value; P.email = email; P.phone = phone;
    S.editing = null; S.msg = 'personal'; renderAll();
  }

  /* ---------- body ---------- */
  function renderBody() {
    var el = $('#body-body'), btn = $('[data-edit="body"]');
    btn.hidden = S.editing === 'body';
    var edit = S.editing === 'body';
    var h = '<div class="stats" style="margin-top:14px">' +
      '<div class="stat"><div class="k">Height</div><div class="v">' + P.height + ' <span class="u">cm</span></div><div class="s">Edited here</div></div>' +
      '<div class="stat"><div class="k">Weight</div><div class="v">' + mask(P.weight.toFixed(1), 'kg') + '</div><div class="s">Logged ' + fmtShort(P.weightDate) + '</div></div>' +
      '<div class="stat"><div class="k">Waist</div><div class="v">' + mask(P.waist, 'cm') + '</div><div class="s">Logged ' + fmtShort(P.waistDate) + '</div></div>' +
      (S.bmi ? '<div class="stat"><div class="k">BMI</div><div class="v">' + (S.hide ? '•••' : bmiOf()) + '</div><div class="s">A rough guide only</div></div>' : '') + '</div>';
    if (S.bmi && !S.hide) h += '<p class="fine" style="margin-top:10px">BMI cut-offs differ for South Asians and it is less reliable with PCOS. Talk to your doctor before reading anything into it.</p>';
    h += '<p class="fine" style="margin-top:10px">Weight and waist are logged in <a href="tracker.html#weight">Tracker</a>, so there is one place to update them.</p>';
    if (edit) {
      h += '<form id="body-form" novalidate style="margin-top:12px"><div class="form-grid"><div class="field"><label for="b-height">Height (cm)</label><input class="input" id="b-height" type="number" inputmode="decimal" min="100" max="230" step="1" value="' + P.height + '"></div></div>' +
        '<p class="msg-line" id="body-msg" role="status"></p><div class="btn-row tight"><button class="btn btn-inline btn-sm" type="submit">Save</button><button class="btn-outline-sm" type="button" data-cancel="body">Cancel</button></div></form>';
    }
    h += '<div style="margin-top:14px"><label class="perm" style="cursor:pointer"><span class="grow"><strong>Hide numbers</strong><span class="meta">Blurs weight, waist and BMI on this page</span></span><span class="switch"><input type="checkbox" id="sw-hide"' + (S.hide ? ' checked' : '') + '><span></span></span></label>' +
      '<label class="perm" style="cursor:pointer"><span class="grow"><strong>Show BMI</strong><span class="meta">Off by default</span></span><span class="switch"><input type="checkbox" id="sw-bmi"' + (S.bmi ? ' checked' : '') + '><span></span></span></label></div>';
    el.innerHTML = h;
  }
  function saveBody() {
    var h = parseFloat($('#b-height').value);
    if (isNaN(h) || h < 100 || h > 230) return setMsg('#body-msg', 'Enter a height between 100 and 230 cm.', true);
    P.height = Math.round(h); S.editing = null; renderAll();
  }

  /* ---------- health background ---------- */
  function renderHealth() {
    var el = $('#health-body'), btn = $('[data-edit="health"]'), t = S.tmp;
    btn.hidden = S.editing === 'health';
    if (S.editing !== 'health') {
      el.innerHTML = '<dl class="dl">' +
        row('Conditions', P.conditions.length ? '<div class="tag-list" style="margin-top:0">' + P.conditions.map(function (c) { return '<span class="tag-plain">' + esc(c.name) + (c.year ? ' · ' + c.year : '') + '</span>'; }).join('') + '</div>' : '<span class="muted">None added</span>') +
        row('Allergies', P.noAllergies ? '<span class="muted">None known</span>' : '<div class="tag-list" style="margin-top:0">' + P.allergies.map(function (a) { return '<span class="tag-plain">' + esc(a) + '</span>'; }).join('') + '</div>') +
        row('Family history', P.familyNone ? '<span class="muted">None that I know of</span>' : (P.family.length ? '<div class="tag-list" style="margin-top:0">' + P.family.map(function (f) { return '<span class="tag-plain">' + esc(f) + '</span>'; }).join('') + '</div>' : '<span class="muted">Not added</span>')) +
        row('Diet', esc(P.diet)) +
        row('Work', esc(P.work) + (P.workNote ? '<br><span class="muted">' + esc(P.workNote) + '</span>' : '')) + '</dl>' +
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
      '<div class="form-grid"><div class="field"><label for="h-diet">Diet</label><select class="input" id="h-diet">' + opts(DIETS, t.diet) + '</select></div>' +
      '<div class="field"><label for="h-work">Work pattern</label><select class="input" id="h-work">' + opts(WORKS, t.work) + '</select></div>' +
      '<div class="field wide"><label for="h-note">Anything about your work hours your doctor should know</label><input class="input" id="h-note" maxlength="120" value="' + esc(t.workNote) + '" placeholder="e.g. Night shifts three days a week"></div></div>' +
      '<p class="msg-line" id="health-msg" role="status"></p><div class="btn-row tight"><button class="btn btn-inline btn-sm" type="submit">Save</button><button class="btn-outline-sm" type="button" data-cancel="health">Cancel</button></div></form>';
  }
  function startHealth() {
    S.tmp = { conditions: P.conditions.map(function (c) { return { name: c.name, year: c.year }; }), allergies: P.allergies.slice(), noAllergies: P.noAllergies, family: P.family.slice(), familyNone: P.familyNone, diet: P.diet, work: P.work, workNote: P.workNote };
  }
  function syncHealthFields() { // keep typed text when the form re-renders
    if (!$('#h-diet')) return; S.tmp.diet = $('#h-diet').value; S.tmp.work = $('#h-work').value; S.tmp.workNote = $('#h-note').value;
  }

  /* ---------- baseline ---------- */
  function renderBaseline() {
    $('#baseline-body').innerHTML = '<p class="fine" style="margin-top:14px">Your starting point on ' + fmtDate(P.since) + ', and where you are now.</p><div class="delta-grid">' +
      '<div class="bcell"><div class="k">Health Factor</div><div class="v">54 <i>→</i> 67</div><div class="s">Day 1 to today</div></div>' +
      '<div class="bcell"><div class="k">PHQ-9</div><div class="v">14 <i>→</i> 12</div><div class="s">Out of 27</div></div>' +
      '<div class="bcell"><div class="k">GAD-7</div><div class="v">11 <i>→</i> 10</div><div class="s">Out of 21</div></div>' +
      '<div class="bcell"><div class="k">Weight</div><div class="v">' + (S.hide ? '•••' : '74.2 <i>→</i> ' + P.weight.toFixed(1)) + '</div><div class="s">' + (S.hide ? 'Hidden' : 'kg') + '</div></div></div>' +
      '<p class="fine" style="margin-top:14px">PHQ-9 and GAD-7 are self-reported screening scores, not a diagnosis. Lower means fewer symptoms reported.</p>';
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
    $('#notif-body').innerHTML = h;
  }

  /* ---------- devices ---------- */
  function ago(ms) { var m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 1 ? 'just now' : m === 1 ? '1 minute ago' : m < 60 ? m + ' minutes ago' : Math.round(m / 60) + ' hours ago'; }
  function renderDevices() {
    var h = '<div class="item-top" style="margin-top:14px"><span class="avatar-lg avatar-md" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l.6-3h4.8L15 6M9 18l.6 3h4.8l.6-3M12 10v2.5l1.5 1"/></svg></span>' +
      '<div class="grow"><strong>Smartwatch (demo)</strong><span class="meta">' + (D.connected ? 'Connected · last sync ' + ago(D.lastSync) : 'Not connected') + '</span></div>' +
      '<span class="st ' + (D.connected ? 'uploaded' : 'reviewed') + '">' + (D.connected ? 'Connected' : 'Off') + '</span></div>';
    h += '<div class="btn-row">' + (D.connected ? '<button class="btn-outline-sm" type="button" id="d-sync">Sync now</button><button class="btn-danger-sm" type="button" id="d-off">Disconnect</button>' : '<button class="btn btn-inline btn-sm" type="button" id="d-on">Connect watch</button>') + '</div>';
    h += '<p class="msg-line" id="d-msg" role="status">' + (S.msg === 'sync' ? 'Synced just now.' : '') + '</p>';
    h += '<p class="fine" style="margin-top:6px">Pulse only reads what you allow:</p><div>' +
      [['steps', 'Steps'], ['hr', 'Heart rate'], ['spo2', 'SpO₂'], ['sleep', 'Sleep']].map(function (p) {
        return '<label class="perm" style="cursor:pointer"><span class="grow"><strong>' + p[1] + '</strong></span><span class="switch"><input type="checkbox" data-perm="' + p[0] + '"' + (D.perms[p[0]] ? ' checked' : '') + (D.connected ? '' : ' disabled') + ' aria-label="Allow reading ' + p[1] + '"><span></span></span></label>';
      }).join('') + '</div>';
    $('#dev-body').innerHTML = h;
  }

  /* ---------- plan ---------- */
  function renderPlan() {
    var cancelled = PL.status === 'cancelled';
    var h = '<div class="plan-price"><b>₹' + PL.price + '</b><span class="muted">per month</span> <span class="st ' + (cancelled ? 'cancelled' : 'uploaded') + '" style="margin-left:6px">' + (cancelled ? 'Ending' : 'Active') + '</span></div>' +
      '<p class="muted" style="margin-top:6px">' + (cancelled ? 'Your plan ends on ' + fmtDate(PL.renews) + '. You keep full access until then.' : 'Renews on ' + fmtDate(PL.renews) + '.') + '</p>' +
      '<p class="fine" style="margin-top:8px">Your doctors use Pulse for free. Cancel any time.</p>' +
      '<div class="bill-row" style="margin-top:12px"><span class="muted">Payment method</span><strong>' + esc(PL.method) + '</strong></div>';
    if (PL.cancelAsk) h += '<div class="confirm-box" style="margin-top:12px"><strong>Cancel your plan?</strong><p class="fine" style="margin-top:4px">You keep access until ' + fmtDate(PL.renews) + '. Your data stays yours either way.</p><div class="btn-row"><button class="btn-danger-sm" type="button" id="pl-yes">Yes, cancel</button><button class="btn-outline-sm" type="button" id="pl-no">Keep my plan</button></div></div>';
    else h += '<div class="btn-row">' + (cancelled ? '<button class="btn btn-inline btn-sm" type="button" id="pl-resume">Resume plan</button>' : '<button class="btn-outline-sm" type="button" id="pl-ask">Cancel plan</button>') + '</div>';
    h += '<h3 style="margin-top:18px;font-size:.8125rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Billing history</h3><div>' +
      [0, 1, 2].map(function (i) { return '<div class="bill-row"><span>' + fmtDate(addDays(PL.renews, -30 * (i + 1))) + '</span><span>₹' + PL.price + '</span></div>'; }).join('') + '</div>';
    $('#plan-body').innerHTML = h;
  }

  /* ---------- care team ---------- */
  function renderCare() {
    $('#care-body').innerHTML = '<div class="item-top" style="margin-top:14px"><span class="avatar-lg avatar-md" aria-hidden="true">MI</span><div class="grow"><strong>Dr. Meera Iyer</strong><span class="meta">Gynaecologist · linked</span></div><span class="st uploaded">Linked</span></div>' +
      '<div class="btn-row" style="margin-top:12px"><a class="btn-outline-sm" href="healthcare.html#sharing" style="display:inline-flex;align-items:center;text-decoration:none">Manage sharing</a><a class="btn-outline-sm" href="healthcare.html#providers" style="display:inline-flex;align-items:center;text-decoration:none">Find a doctor</a></div>' +
      '<h3 style="margin-top:18px;font-size:.8125rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Emergency contact</h3>' +
      '<p class="muted" style="margin-top:6px">Not set up yet. Someone you trust, contacted only if you ask for urgent help.</p>' +
      '<div class="btn-row" style="margin-top:10px"><a class="btn-outline-sm" href="healthcare.html#sharing" style="display:inline-flex;align-items:center;text-decoration:none">Set up emergency contact</a></div>';
  }

  /* ---------- render ---------- */
  function renderAll() {
    renderHero(); renderPersonal(); renderBody(); renderHealth(); renderBaseline(); renderNotif(); renderDevices(); renderPlan(); renderCare();
    S.msg = '';
  }
  [['personal', 'Linked doctors see your name, age and sex. Your phone and email are never shared.'],
   ['body', 'Dr. Meera Iyer sees your height. Weight and waist follow your "Weight & waist" sharing choice.'],
   ['health', 'Shared with Dr. Meera Iyer. You can turn this off in Healthcare, under Sharing & privacy.'],
   ['baseline', 'Follows your sharing choices for each type of data.'],
   ['notif', 'Only you.'], ['dev', 'Only you. Pulse reads only what you allow.'], ['plan', 'Only you.'], ['care', 'Managed in Healthcare.']
  ].forEach(function (v) { $('#vis-' + v[0]).innerHTML = LOCK + '<span>' + v[1] + '</span>'; });

  /* ---------- interactions ---------- */
  var profile = $('#profile');
  document.addEventListener('click', function (e) { if (!profile.contains(e.target)) profile.open = false; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') profile.open = false; });

  $('#cam-btn').addEventListener('click', function () { $('#photo-in').click(); });
  $('#photo-in').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) return setMsg('#photo-msg', 'Choose an image file.', true);
    if (f.size > 5 * 1024 * 1024) return setMsg('#photo-msg', 'That photo is over 5 MB. Choose a smaller one.', true);
    if (P.photo) URL.revokeObjectURL(P.photo);
    P.photo = URL.createObjectURL(f); setMsg('#photo-msg', 'Photo updated. It stays on this device in the prototype and is never shared with doctors.'); renderHero(); this.value = '';
  });
  $('#photo-remove').addEventListener('click', function () { if (P.photo) URL.revokeObjectURL(P.photo); P.photo = null; setMsg('#photo-msg', 'Photo removed.'); renderHero(); });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-edit]');
    if (b) { S.editing = b.dataset.edit; if (S.editing === 'health') startHealth(); renderAll(); var f = $('#' + { personal: 'p-first', body: 'b-height', health: 'h-cond' }[S.editing]); if (f) f.focus(); return; }
    b = e.target.closest('[data-cancel]'); if (b) { S.editing = null; S.tmp = null; renderAll(); }
  });

  $('#personal-body').addEventListener('submit', function (e) { e.preventDefault(); savePersonal(); });
  $('#body-body').addEventListener('submit', function (e) { e.preventDefault(); saveBody(); });
  $('#body-body').addEventListener('change', function (e) {
    if (e.target.id === 'sw-hide') { S.hide = e.target.checked; renderAll(); }
    else if (e.target.id === 'sw-bmi') { S.bmi = e.target.checked; renderAll(); }
  });

  /* health form */
  var H = $('#health-body');
  H.addEventListener('submit', function (e) {
    e.preventDefault(); syncHealthFields(); var t = S.tmp;
    if (!t.noAllergies && !t.allergies.length) return setMsg('#health-msg', 'Add an allergy, or tick "None known".', true);
    P.conditions = t.conditions; P.allergies = t.noAllergies ? [] : t.allergies; P.noAllergies = t.noAllergies;
    P.family = t.familyNone ? [] : t.family; P.familyNone = t.familyNone; P.diet = t.diet; P.work = t.work; P.workNote = t.workNote.trim();
    S.editing = null; S.tmp = null; S.msg = 'health'; renderAll();
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

  /* notifications */
  $('#notif-body').addEventListener('change', function (e) {
    var id = e.target.id, v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (id === 'n-on') N.on = v; else if (id === 'n-quiet') N.quiet.on = v;
    else if (id === 'n-qfrom') { if (v === N.quiet.to) { e.target.value = N.quiet.from; return; } N.quiet.from = v; }
    else if (id === 'n-qto') { if (v === N.quiet.from) { e.target.value = N.quiet.to; return; } N.quiet.to = v; }
    else if (id === 'n-checkin') N.checkin.on = v; else if (id === 'n-checkin-t') { if (!v) return; N.checkin.time = v; }
    else if (id === 'n-meds') N.meds.on = v; else if (id === 'n-meds-t') { if (!v) return; N.meds.time = v; }
    else if (id === 'n-data') N.data = v; else if (id === 'n-weekly') N.weekly = v; else if (id === 'n-neutral') N.neutral = v;
    else return;
    renderNotif();
  });
  $('#notif-body').addEventListener('click', function (e) { var b = e.target.closest('[data-lim]'); if (!b) return; N.limit = +b.dataset.lim; renderNotif(); });

  /* devices */
  $('#dev-body').addEventListener('click', function (e) {
    if (e.target.closest('#d-sync')) { D.lastSync = Date.now(); S.msg = 'sync'; renderDevices(); S.msg = ''; }
    else if (e.target.closest('#d-off')) { D.connected = false; renderDevices(); }
    else if (e.target.closest('#d-on')) { D.connected = true; D.lastSync = Date.now(); renderDevices(); }
  });
  $('#dev-body').addEventListener('change', function (e) { var p = e.target.dataset.perm; if (p) D.perms[p] = e.target.checked; });

  /* plan */
  $('#plan-body').addEventListener('click', function (e) {
    if (e.target.closest('#pl-ask')) PL.cancelAsk = true;
    else if (e.target.closest('#pl-no')) PL.cancelAsk = false;
    else if (e.target.closest('#pl-yes')) { PL.cancelAsk = false; PL.status = 'cancelled'; }
    else if (e.target.closest('#pl-resume')) PL.status = 'active';
    else return;
    renderPlan();
  });

  renderAll();
})();
