/* Pulse registration: eight short screens. Each screen saves to the local server as you go,
   so you can close the tab and pick up where you left off. */
(function () {
  'use strict';
  var P = window.Pulse; P.publicPage = true;
  var esc = P.esc;
  var $ = function (s) { return document.querySelector(s); };
  var TOTAL = 8;

  var CONSENT_TEXT = P.CONSENT_TEXT;
  var LIFESTYLE = {
    irregular_sleep: ['My sleep times are irregular', 'I go to bed and wake up at different times'],
    work_stress: ['My work is high-pressure', 'Deadlines, long hours or constant pings'],
    desk_job: ['I mostly sit at a desk', 'Most of my day is spent sitting'],
    orders_food: ['I order food in 4 to 5 times a week', 'Delivery or eating out is a regular part of my week'],
    prefers_privacy: ['I prefer to keep my condition private', 'Notifications and screens stay discreet']
  };
  var SOON_LIFESTYLE = ['Night shifts', 'Caring for children or elders', 'Studying full-time', 'Smoking or alcohol', 'Travelling often', 'Fasting for religious reasons'];
  var SOON_CONDITIONS = ['Type 2 diabetes', 'Thyroid condition', 'High blood pressure', 'Anxiety or depression (diagnosed)'];
  var SOON_SOURCES = ['Studies', 'Relationships', 'Money', 'Family'];

  var S = {
    meta: null, user: null, step: 1, verify: false, form: {}, consents: {}, body: {}, health: {}, q: {}, links: [], invites: [],
    goals: { sleep_h: 7, steps: 7000, weight_kg: null }, notif: null, emergency: null,
    doc: { tab: 'search', area: '', spec: '', providers: null, areas: [], draft: null, msg: '' },
    run: null, busy: false, scores: {}
  };

  /* ---------- tiny view helpers ---------- */
  function select(id, options, cur, any) {
    return '<select class="input" id="' + id + '">' + (any ? '<option value="">' + esc(any) + '</option>' : '') +
      options.map(function (o) { return '<option' + (o === cur ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
  }
  function field(label, id, control, why) {
    return '<div class="field"><label for="' + id + '">' + label + '</label>' + control + (why ? '<p class="why">' + why + '</p>' : '') + '<div class="field-err" id="e-' + id + '"></div></div>';
  }
  function input(id, type, val, extra) {
    return '<input class="input" id="' + id + '" type="' + type + '" value="' + esc(val == null ? '' : val) + '" ' + (extra || '') + '>';
  }
  function errBox() { return '<div class="err-box" id="err" role="alert" hidden></div>'; }
  function showErr(msg, fieldId) {
    var box = $('#err'); if (box) { box.textContent = msg; box.hidden = false; box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    if (fieldId) { var f = $('#' + fieldId); if (f) { f.classList.add('invalid'); f.focus(); } }
  }
  function clearErr() { var b = $('#err'); if (b) b.hidden = true; $('#step').querySelectorAll('.invalid').forEach(function (e) { e.classList.remove('invalid'); }); }
  var FIELD_ID = { first_name: 'a-first', last_name: 'a-last', email: 'a-email', phone: 'a-phone', password: 'a-pass', dob: 'a-dob', city: 'a-city',
                   height_cm: 'b-height', weight_kg: 'b-weight', waist_cm: 'b-waist', sex: 'b-sex' };
  function fail(e) { S.busy = false; var b = $('#step').querySelector('button[type=submit][disabled]'); if (b) b.disabled = false; showErr(e.message, FIELD_ID[e.field]); }
  function busy(on) { S.busy = on; $('#step').querySelectorAll('button[data-primary]').forEach(function (b) { b.disabled = on; }); }
  function navRow(opts) {
    opts = opts || {};
    return '<div class="nav-row">' + (S.step > 1 && !opts.noBack ? '<button class="btn btn-secondary" type="button" data-act="back">Back</button>' : '') +
      '<button class="btn" type="' + (opts.type || 'submit') + '" data-primary ' + (opts.act ? 'data-act="' + opts.act + '"' : '') + (opts.disabled ? ' disabled' : '') + '>' + (opts.label || 'Continue') + '</button></div>';
  }
  function view(html) { $('#step').innerHTML = html; var h = $('#step h1'); if (h) h.focus({ preventScroll: true }); window.scrollTo(0, 0); }

  function renderChrome() {
    var pct = Math.min(100, Math.round((S.step - 1) / TOTAL * 100));
    $('#onb-top').innerHTML = S.step <= TOTAL
      ? '<div class="onb-progress"><span>Step ' + S.step + ' of ' + TOTAL + '</span><span>' + (S.step > 1 ? 'Saved as you go' : 'About 6 minutes') + '</span></div><div class="onb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + TOTAL + '" aria-valuenow="' + S.step + '"><i style="width:' + Math.max(6, pct) + '%"></i></div>'
      : '';
    $('#hdr-right').innerHTML = S.user && S.step <= TOTAL ? '<button class="pill-link" type="button" data-act="later">Finish later</button>' : (S.user ? '' : '<a class="pill-link" href="index.html">Sign in</a>');
  }

  function go(n) {
    S.step = n; S.verify = false;
    if (S.user && n <= TOTAL) P.put('/api/onboarding/step', { step: n }).catch(function () {});
    render();
  }

  /* ---------- 1. account ---------- */
  function stepAccount() {
    if (S.verify) return stepVerify();
    var f = S.form, soon = f.city && f.city !== S.meta.launch_city;
    view('<h1 tabindex="-1">Create your account</h1><p class="lead">Pulse helps you track your body and mind between doctor visits. You choose what to share, and with whom.</p>' +
      '<form class="onb-form" data-act="account" novalidate>' + errBox() +
      '<div class="two">' + field('First name', 'a-first', input('a-first', 'text', f.first_name, 'autocomplete="given-name" maxlength="40"')) +
      field('Last name', 'a-last', input('a-last', 'text', f.last_name, 'autocomplete="family-name" maxlength="40"')) + '</div>' +
      field('Email', 'a-email', input('a-email', 'email', f.email, 'autocomplete="email" inputmode="email" autocapitalize="none"')) +
      field('Mobile number', 'a-phone', input('a-phone', 'tel', f.phone, 'autocomplete="tel-national" inputmode="numeric" maxlength="10" placeholder="10 digits"'), 'Indian mobile numbers only.') +
      field('Password', 'a-pass', '<div class="input-wrap"><input class="input" id="a-pass" type="password" autocomplete="new-password" maxlength="128" value="' + esc(f.password || '') + '"><button class="toggle-pass" type="button" data-act="showpass">Show</button></div>', 'At least 8 characters.') +
      '<div class="two">' + field('Date of birth', 'a-dob', input('a-dob', 'date', f.dob, 'autocomplete="bday" max="' + P.keyOf(new Date()) + '"'), 'Pulse is for adults aged 18 and over.') +
      field('City', 'a-city', select('a-city', S.meta.cities, f.city || S.meta.launch_city), 'Pulse is starting in Bengaluru.') + '</div>' +
      (soon ? '<div class="sub-block"><strong>Pulse is not in your city yet.</strong><p class="why" style="margin:0">Leave your email and we will tell you when we arrive. No account is created.</p>' +
        '<button class="btn" type="button" data-act="waitlist">Join the waitlist</button><div id="wl-msg" role="status"></div></div>' : '') +
      (soon ? '' : '<button class="btn" type="submit" data-primary>Create account</button>') +
      '<p class="why" style="text-align:center">Already have an account? <a href="index.html">Sign in</a></p></form>');
  }
  function readAccount() {
    ['first', 'last', 'email', 'phone', 'dob', 'city'].forEach(function (k) {
      var key = { first: 'first_name', last: 'last_name' }[k] || k; var el = $('#a-' + k); if (el) S.form[key] = el.value.trim();
    });
    var pw = $('#a-pass'); if (pw) S.form.password = pw.value;
  }
  function submitAccount() {
    readAccount(); clearErr();
    var f = S.form, need = [['first_name', 'Add your first name.'], ['last_name', 'Add your last name.'], ['email', 'Add your email.'], ['phone', 'Add your mobile number.'],
                            ['password', 'Choose a password.'], ['dob', 'Add your date of birth.']];
    for (var i = 0; i < need.length; i++) if (!f[need[i][0]]) return showErr(need[i][1], FIELD_ID[need[i][0]]);
    busy(true);
    P.post('/api/auth/register', f).then(function (r) { S.user = r.user; S.form.password = ''; busy(false); S.verify = true; render(); }, function (e) {
      busy(false);
      if (e.code === 'city_unavailable') { render(); return; }
      showErr(e.message, FIELD_ID[e.field]);
    });
  }
  function stepVerify() {
    view('<h1 tabindex="-1">Verify your contact details</h1><p class="lead">We have sent a 6-digit code to your email and to your mobile. <strong>This is a demo: nothing is actually sent, so any 6 digits will work.</strong></p>' +
      '<form class="onb-form" data-act="verify" novalidate>' + errBox() +
      field('Code from your email', 'v-email', input('v-email', 'text', '', 'inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 digits"')) +
      field('Code from your mobile', 'v-phone', input('v-phone', 'text', '', 'inputmode="numeric" maxlength="6" placeholder="6 digits"')) +
      '<button class="btn" type="submit" data-primary>Verify and continue</button><button class="btn btn-secondary" type="button" data-act="skipverify">Skip for now</button></form>');
  }
  function submitVerify() {
    clearErr();
    var codes = [['email', $('#v-email').value.trim(), 'v-email'], ['phone', $('#v-phone').value.trim(), 'v-phone']].filter(function (c) { return c[1]; });
    if (!codes.length) return showErr('Enter a code, or choose Skip for now.');
    busy(true);
    codes.reduce(function (p, c) { return p.then(function () { return P.post('/api/auth/verify', { kind: c[0], code: c[1] }); }); }, Promise.resolve())
      .then(function () { busy(false); go(2); }, function (e) { busy(false); showErr(e.message); });
  }

  /* ---------- 2. consent ---------- */
  function stepConsent() {
    var rows = Object.keys(CONSENT_TEXT).map(function (k) {
      var t = CONSENT_TEXT[k];
      return '<label class="consent-row"><input type="checkbox" data-consent="' + k + '"' + (S.consents[k] ? ' checked' : '') + '><span><strong>' + esc(t[0]) + (t[2] ? '<span class="req-tag">Needed</span>' : '') + '</strong><span class="d">' + esc(t[1]) + '</span></span></label>';
    }).join('');
    var ok = S.consents.terms && S.consents.health_basics;
    view('<h1 tabindex="-1">Your privacy, your choice</h1><p class="lead">Before we ask about your health, here is what Pulse would collect and why. Agree only to what you are comfortable with.</p>' +
      '<form class="onb-form" data-act="consent" novalidate style="margin-top:12px">' + errBox() + '<div>' + rows + '</div>' +
      '<div class="sub-block"><strong>Your rights</strong><p class="why" style="margin:0">Nothing is shared with anyone unless you choose it. You can withdraw any of these later, ask for a copy of your data, or delete everything, at any time.</p></div>' +
      '<button class="btn-outline-sm" type="button" data-act="consent-all" style="justify-self:start">Select all</button>' +
      navRow({ disabled: !ok, label: 'Agree and continue' }) + '</form>');
  }
  function submitConsent() {
    clearErr(); busy(true);
    var payload = {}; Object.keys(CONSENT_TEXT).forEach(function (k) { payload[k] = !!S.consents[k]; });
    P.put('/api/consents', { consents: payload }).then(function () { busy(false); go(3); }, function (e) { busy(false); showErr(e.message); });
  }

  /* ---------- 3. about you ---------- */
  function stepAbout() {
    var b = S.body;
    view('<h1 tabindex="-1">About you</h1><p class="lead">A few measurements to start your tracking. You can change any of these later.</p>' +
      '<form class="onb-form" data-act="about" novalidate>' + errBox() +
      field('Sex at birth', 'b-sex', select('b-sex', S.meta.sex, b.sex || S.user.sex || '', 'Choose'), 'Some health patterns, such as cycles, depend on this.') +
      '<div class="two">' + field('Height (cm)', 'b-height', input('b-height', 'number', b.height_cm, 'inputmode="decimal" min="100" max="230" step="1"'), 'For your doctor, and for context on weight.') +
      field('Weight (kg)', 'b-weight', input('b-weight', 'number', b.weight_kg, 'inputmode="decimal" min="25" max="250" step="0.1"'), 'This becomes your starting point.') + '</div>' +
      field('Waist (cm), optional', 'b-waist', input('b-waist', 'number', b.waist_cm, 'inputmode="decimal" min="40" max="200" step="0.5"'), 'Often more useful than weight alone with PCOS.') +
      navRow() + '</form>');
  }
  function submitAbout() {
    clearErr();
    var sex = $('#b-sex').value, h = $('#b-height').value, w = $('#b-weight').value, wa = $('#b-waist').value;
    if (!sex) return showErr('Choose an option for sex at birth.', 'b-sex');
    if (!h) return showErr('Add your height.', 'b-height');
    if (!w) return showErr('Add your weight.', 'b-weight');
    var body = { sex: sex, height_cm: +h, weight_kg: +w }; if (wa) body.waist_cm = +wa;
    busy(true);
    P.put('/api/profile/body', body).then(function () {
      S.body = { sex: sex, height_cm: +h, weight_kg: +w, waist_cm: wa ? +wa : null }; busy(false); go(4);
    }, function (e) { busy(false); showErr(e.message, FIELD_ID[e.field]); });
  }

  /* ---------- 4. health background ---------- */
  function hasCond(name) { return S.health.conditions.some(function (c) { return c.name === name; }); }
  function stepHealth() {
    var h = S.health, pcos = hasCond('PCOS'), stress = hasCond('Stress'), yr = (h.conditions.filter(function (c) { return c.name === 'PCOS'; })[0] || {}).year || '';
    var src = h.stress_sources || [];
    view('<h1 tabindex="-1">Your health background</h1><p class="lead">Tell us about the conditions Pulse supports today. Others are on the way.</p>' +
      '<form class="onb-form" data-act="health" novalidate>' + errBox() + '<div class="opt-cards">' +
      '<label class="opt-card"><input type="checkbox" id="c-pcos"' + (pcos ? ' checked' : '') + '><span><strong>PCOS</strong><span class="d">Polycystic ovary syndrome</span></span></label>' +
      (pcos ? '<div class="sub-block">' + field('Is it diagnosed?', 'pcos-status', select('pcos-status', S.meta.pcos_status, h.pcos_status || '', 'Choose')) +
        field('Year diagnosed, optional', 'pcos-year', input('pcos-year', 'number', yr, 'inputmode="numeric" min="1950" max="' + new Date().getFullYear() + '"')) + '</div>' : '') +
      '<label class="opt-card"><input type="checkbox" id="c-stress"' + (stress ? ' checked' : '') + '><span><strong>Stress</strong><span class="d">Ongoing stress that affects your days</span></span></label>' +
      (stress ? '<div class="sub-block">' + field('How long has it been going on?', 'stress-dur', select('stress-dur', S.meta.stress_durations, h.stress_duration || '', 'Choose')) +
        '<div><div class="group-label" style="margin-top:0">Main sources</div><div class="chips" id="stress-src" role="group" aria-label="Main sources of stress">' +
        S.meta.stress_sources_available.map(function (s) { return '<button type="button" class="chip-btn" data-src="' + esc(s) + '" aria-pressed="' + (src.indexOf(s) >= 0) + '">' + esc(s) + '</button>'; }).join('') +
        SOON_SOURCES.map(function (s) { return '<span class="chip-btn" style="opacity:.6;cursor:default">' + esc(s) + '<span class="soon">Coming soon</span></span>'; }).join('') + '</div></div></div>' : '') +
      '</div><div class="group-label">More conditions</div><div class="opt-cards">' +
      SOON_CONDITIONS.map(function (c) { return '<div class="opt-card is-disabled"><input type="checkbox" disabled><span><strong>' + esc(c) + '<span class="soon">Coming soon</span></strong></span></div>'; }).join('') + '</div>' +
      '<p class="why">Neither applies to you? That is fine. Leave both unticked and continue.</p>' + navRow() + '</form>');
  }
  function syncHealth() {
    var h = S.health;
    var c1 = $('#c-pcos'), c2 = $('#c-stress'); if (!c1) return;
    var old = {}; h.conditions.forEach(function (c) { old[c.name] = c; });
    h.conditions = [];
    if (c1.checked) h.conditions.push({ name: 'PCOS', year: ($('#pcos-year') && $('#pcos-year').value) ? +$('#pcos-year').value : (old.PCOS ? old.PCOS.year : null) });
    if (c2.checked) h.conditions.push({ name: 'Stress', year: null });
    h.conditions = h.conditions.concat((S._others || []).filter(function (c) { return c.name !== 'PCOS' && c.name !== 'Stress'; }));
    if ($('#pcos-status')) h.pcos_status = $('#pcos-status').value || null;
    if ($('#stress-dur')) h.stress_duration = $('#stress-dur').value || null;
    if (!c1.checked) h.pcos_status = null;
    if (!c2.checked) { h.stress_duration = null; h.stress_sources = []; }
  }
  function submitHealth() {
    clearErr(); syncHealth(); var h = S.health;
    if (hasCond('PCOS') && !h.pcos_status) return showErr('Say whether your PCOS is diagnosed.', 'pcos-status');
    if (hasCond('Stress') && !h.stress_duration) return showErr('Say how long the stress has been going on.', 'stress-dur');
    busy(true);
    P.put('/api/profile/health', { conditions: h.conditions, pcos_status: h.pcos_status, stress_duration: h.stress_duration, stress_sources: h.stress_sources || [] })
      .then(function () { busy(false); go(5); }, function (e) { busy(false); showErr(e.message); });
  }

  /* ---------- 5. lifestyle ---------- */
  function stepLifestyle() {
    var sel = S.health.lifestyle || [];
    view('<h1 tabindex="-1">Your lifestyle</h1><p class="lead">Tick what sounds like your life. This helps Pulse look for the right patterns.</p>' +
      '<form class="onb-form" data-act="lifestyle" novalidate>' + errBox() + '<div class="opt-cards">' +
      S.meta.lifestyle_available.map(function (k) { var t = LIFESTYLE[k]; return '<label class="opt-card"><input type="checkbox" data-life="' + k + '"' + (sel.indexOf(k) >= 0 ? ' checked' : '') + '><span><strong>' + esc(t[0]) + '</strong><span class="d">' + esc(t[1]) + '</span></span></label>'; }).join('') +
      '</div><div class="group-label">More ways of living</div><div class="opt-cards">' +
      SOON_LIFESTYLE.map(function (t) { return '<div class="opt-card is-disabled"><input type="checkbox" disabled><span><strong>' + esc(t) + '<span class="soon">Coming soon</span></strong></span></div>'; }).join('') +
      '</div>' + navRow() + '</form>');
  }
  function submitLifestyle() {
    clearErr(); busy(true);
    var life = Array.prototype.map.call(document.querySelectorAll('[data-life]:checked'), function (e) { return e.dataset.life; });
    P.put('/api/profile/health', { lifestyle: life }).then(function () { S.health.lifestyle = life; busy(false); go(6); }, function (e) { busy(false); showErr(e.message); });
  }

  /* ---------- 6. your doctor ---------- */
  function loadProviders() {
    if (S.doc.providers) return Promise.resolve();
    return P.get('/api/providers').then(function (r) { S.doc.providers = r.providers; S.doc.areas = r.areas; });
  }
  function stepDoctor() {
    loadProviders().then(drawDoctor, function (e) { view('<h1 tabindex="-1">Your doctor</h1><div class="err-box">' + esc(e.message) + '</div>' + navRow()); });
  }
  function drawDoctor() {
    var d = S.doc, linked = S.links.map(function (id) { return d.providers.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
    var tabs = [['search', 'Search'], ['invite', 'Invite by email'], ['skip', 'Skip for now']];
    var body = '';
    if (d.tab === 'search') {
      var specs = []; d.providers.forEach(function (p) { if (specs.indexOf(p.spec) < 0) specs.push(p.spec); });
      var list = d.providers.filter(function (p) { return (!d.area || p.area === d.area) && (!d.spec || p.spec === d.spec); });
      body = '<div class="two">' + field('Area', 'd-area', select('d-area', d.areas, d.area, 'All areas in Bengaluru')) + field('Specialty', 'd-spec', select('d-spec', specs, d.spec, 'Any specialty')) + '</div>' +
        '<div class="opt-cards">' + (list.length ? list.map(function (p) {
          var isL = S.links.indexOf(p.id) >= 0;
          return '<div class="pick' + (isL ? ' chosen' : '') + '"><span class="avatar-lg avatar-md" aria-hidden="true">' + esc(p.ini) + '</span><span class="grow"><strong>' + esc(p.name) + '</strong><span class="meta">' + esc(p.spec) + ' · ' + esc(p.clinic) + ', ' + esc(p.area) + ' · ₹' + p.fee + '</span></span>' +
            (isL ? '<span class="st uploaded">Linked</span>' : '<button class="btn-outline-sm" type="button" data-choose="' + p.id + '">Choose</button>') + '</div>';
        }).join('') : '<p class="empty">No one matches. Try another area or specialty.</p>') + '</div><p class="why">These are demo providers for the prototype.</p>';
      if (d.draft) {
        var dr = d.draft;
        body += '<div class="sub-block"><strong>Link ' + esc(dr.p.name) + '</strong><p class="why" style="margin:0">Everything is off until you turn it on. You can change this any time, and Pulsie chats are never shared.</p>' +
          S.meta.share_keys.map(function (k) { return '<label class="consent-row" style="padding:8px 0"><input type="checkbox" data-dshare="' + k + '"' + (dr.share[k] ? ' checked' : '') + '><span><strong style="font-size:.9375rem">' + esc(S.meta.share_labels[k]) + '</strong></span></label>'; }).join('') +
          field('Access lasts', 'd-exp', select('d-exp', S.meta.expiry, dr.expires)) +
          '<div class="nav-row" style="margin-top:4px"><button class="btn" type="button" data-act="dlink">Link and share</button><button class="btn btn-secondary" type="button" data-act="dcancel">Cancel</button></div></div>';
      }
    } else if (d.tab === 'invite') {
      body = '<p class="why">Enter your doctor\'s email and we will invite them to Pulse.</p>' + field('Doctor\'s email', 'd-email', input('d-email', 'email', '', 'inputmode="email" autocapitalize="none" placeholder="doctor@clinic.com"')) +
        '<button class="btn-outline-sm" type="button" data-act="dinvite" style="justify-self:start">Send invitation</button>' +
        (S.invites.length ? '<div class="ok-box">Invitation noted for ' + esc(S.invites.join(', ')) + '. Email isn\'t connected in this prototype, so nothing was sent.</div>' : '');
    } else {
      body = '<p class="lead" style="margin:0">No problem. You can link a doctor any time from Healthcare.</p>';
    }
    view('<h1 tabindex="-1">Your doctor</h1><p class="lead">Add the doctor who looks after you. They see only what you choose to share.</p>' +
      '<form class="onb-form" data-act="doctor" novalidate>' + errBox() +
      (linked.length ? '<div class="ok-box">Linked: ' + esc(linked.map(function (p) { return p.name; }).join(', ')) + '</div>' : '') +
      '<div class="seg" role="group" aria-label="How to add a doctor" style="justify-self:start">' + tabs.map(function (t) { return '<button type="button" data-tab="' + t[0] + '" aria-pressed="' + (d.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      body + navRow() + '</form>');
  }

  /* ---------- 7. starting check-in (PHQ-9, then GAD-7) ---------- */
  function stepCheckin() {
    if (!S.consents.mental_health) {
      return view('<h1 tabindex="-1">Your starting check-in</h1><p class="lead">You chose not to share mood and mental-health data, so we will skip these questions. You can add them later from your profile.</p><form class="onb-form" data-act="skipq" novalidate>' + navRow() + '</form>');
    }
    if (S.q.phq9 && S.q.gad7) return checkinResult();
    var kind = S.q.phq9 ? 'gad7' : 'phq9';
    if (!S.run) {
      return view('<h1 tabindex="-1">Your starting check-in</h1><p class="lead">Two short questionnaires doctors use, about how the last two weeks have been. They take about two minutes and give you a starting point to measure change against.</p>' +
        '<div class="sub-block"><strong>This is not a diagnosis.</strong><p class="why" style="margin:0">Your answers are private. You can skip this and do it later.</p></div>' +
        '<form class="onb-form" data-act="startq" novalidate>' + errBox() + '<button class="btn" type="submit" data-primary>Start (' + P.QUESTIONNAIRES[kind].name + ')</button><button class="btn btn-secondary" type="button" data-act="skipq">Skip for now</button></form>');
    }
    drawQuestion();
  }
  function drawQuestion() {
    var r = S.run, q = P.QUESTIONNAIRES[r.kind], n = q.items.length;
    if (r.safety) {
      return view('<h1 tabindex="-1">You do not have to deal with this alone</h1><p class="lead">You said you have had thoughts of harming yourself. Thank you for being honest. A trained counsellor can talk with you right now, free, any time.</p>' +
        '<div class="support-box"><strong>Tele-MANAS: <a href="tel:14416">14416</a></strong> (free, 24×7)<br>In an emergency, call <a href="tel:112"><strong>112</strong></a>.</div>' +
        '<div class="nav-row"><a class="btn" href="tel:14416">Call 14416</a><button class="btn btn-secondary" type="button" data-act="safe-continue">Continue</button></div>');
    }
    view('<h1 tabindex="-1" style="font-size:1.125rem">' + q.name + ' · Question ' + (r.i + 1) + ' of ' + n + '</h1>' +
      '<div class="onb-bar" style="margin-top:12px"><i style="width:' + Math.round(r.i / n * 100) + '%"></i></div>' +
      '<p class="q-prompt"><span class="muted" style="font-weight:600;font-size:.9375rem;display:block;margin-bottom:4px">Over the last 2 weeks, how often have you been bothered by:</span>' + esc(q.items[r.i]) + '</p>' +
      '<div class="opt-list">' + P.FREQ.map(function (f, k) { return '<button type="button" class="opt" data-ans="' + k + '" aria-pressed="' + (r.answers[r.i] === k) + '">' + f + '</button>'; }).join('') + '</div>' +
      '<div class="nav-row">' + (r.i > 0 ? '<button class="btn btn-secondary" type="button" data-act="qback">Back</button>' : '') + '<button class="btn btn-secondary" type="button" data-act="skipq" style="margin-left:auto">Skip for now</button></div>' + errBox());
  }
  function answer(k) {
    if (S.busy) return;
    var r = S.run, q = P.QUESTIONNAIRES[r.kind]; r.answers[r.i] = k;
    if (r.i < q.items.length - 1) { r.i++; return drawQuestion(); }
    S.busy = true;
    P.post('/api/questionnaires', { kind: r.kind, answers: r.answers }).then(function (res) {
      S.busy = false;
      S.q[r.kind] = { score: res.score }; S.scores[r.kind] = res.score;
      S.run = null;
      if (res.safety) { S.run = { kind: r.kind, safety: true }; return drawQuestion(); }
      stepCheckin();
    }, function (e) { S.busy = false; showErr(e.message); });
  }
  function checkinResult() {
    var p = S.q.phq9.score, g = S.q.gad7.score, high = p >= 10 || g >= 10;
    view('<h1 tabindex="-1">Your starting point</h1><p class="lead">These are screening scores, not a diagnosis. Pulse will measure change from here.</p>' +
      '<div class="delta-grid"><div class="bcell"><div class="k">PHQ-9</div><div class="v">' + p + ' <i>/ 27</i></div></div><div class="bcell"><div class="k">GAD-7</div><div class="v">' + g + ' <i>/ 21</i></div></div></div>' +
      (high ? '<div class="support-box">Scores in this range are worth talking through with a doctor. You can find one in the Healthcare section once you finish.</div>' : '') +
      '<form class="onb-form" data-act="skipq" novalidate>' + navRow() + '</form>');
  }

  /* ---------- 8. goals, reminders, emergency contact ---------- */
  function stepFinish() {
    var g = S.goals, n = S.notif, e = S.emergency || {}, linkedAny = S.links.length > 0;
    view('<h1 tabindex="-1">Goals and reminders</h1><p class="lead">Last step. Set where you would like to get to, and how often Pulse should nudge you.</p>' +
      '<form class="onb-form" data-act="finish" novalidate>' + errBox() +
      '<div class="two">' + field('Sleep goal', 'g-sleep', select('g-sleep', ['6', '6.5', '7', '7.5', '8', '8.5'], String(g.sleep_h)), 'Hours a night.') + field('Daily steps goal', 'g-steps', select('g-steps', ['4000', '5000', '6000', '7000', '8000', '10000'], String(g.steps))) + '</div>' +
      field('Target weight (kg), optional', 'g-weight', input('g-weight', 'number', g.weight_kg, 'inputmode="decimal" min="25" max="250" step="0.1"'), 'Only if you and your doctor have one in mind.') +
      '<div class="group-label">Reminders</div>' +
      '<div class="two">' + field('Daily check-in at', 'n-time', input('n-time', 'time', n.checkin.time)) + field('Nudges per day, at most', 'n-limit', select('n-limit', ['0', '1', '2', '3'], String(n.limit)), 'Nudges follow your data, not whether you opened the app.') + '</div>' +
      '<div class="group-label">Emergency contact, optional</div><p class="why" style="margin:0">Someone you trust. They are told only if you ask for urgent help, or if you choose automatic alerts below.</p>' +
      '<div class="two">' + field('Name', 'em-name', input('em-name', 'text', e.name, 'maxlength="60"')) + field('Relationship', 'em-rel', input('em-rel', 'text', e.relation, 'maxlength="40" placeholder="e.g. Friend"')) + '</div>' +
      field('Mobile number', 'em-phone', input('em-phone', 'tel', e.phone, 'inputmode="numeric" maxlength="10" placeholder="10 digits"')) +
      '<label class="consent-row" style="padding:0"><input type="checkbox" id="em-consent"' + (e.consent ? ' checked' : '') + '><span class="d">I agree this person can be contacted if I ask for urgent help.</span></label>' +
      (linkedAny ? '<label class="consent-row" style="padding:0"><input type="checkbox" id="em-doc"' + (e.alert_doctor ? ' checked' : '') + '><span class="d">Also let my linked doctor know if I ask for urgent help.</span></label>' : '') +
      '<label class="consent-row" style="padding:0"><input type="checkbox" id="em-auto"' + (e.auto_alert ? ' checked' : '') + '><span class="d">Tell them automatically if my Pulsie check-in score is very low, or I mention hurting myself. They never see the chat.</span></label>' +
      navRow({ label: 'Finish' }) + '</form>');
  }
  function submitFinish() {
    clearErr();
    var name = $('#em-name').value.trim(), phone = $('#em-phone').value.trim(), consent = $('#em-consent').checked;
    var any = name || phone || $('#em-rel').value.trim();
    if (any && !name) return showErr('Add the contact\'s name, or clear the emergency contact.', 'em-name');
    if (any && !phone) return showErr('Add the contact\'s mobile number.', 'em-phone');
    if (any && !consent) return showErr('Please confirm this person can be contacted if you ask for urgent help.');
    var wt = $('#g-weight').value;
    var goals = { sleep_h: +$('#g-sleep').value, steps: +$('#g-steps').value, weight_kg: wt ? +wt : null };
    var notif = JSON.parse(JSON.stringify(S.notif)); notif.checkin.time = $('#n-time').value || notif.checkin.time; notif.limit = +$('#n-limit').value;
    busy(true);
    P.put('/api/settings/goals', goals)
      .then(function () { return P.put('/api/settings/notifications', notif); })
      .then(function () { return any ? P.put('/api/emergency', { name: name, relation: $('#em-rel').value.trim(), phone: phone, consent: true, alert_doctor: !!($('#em-doc') && $('#em-doc').checked), auto_alert: $('#em-auto').checked }) : null; })
      .then(function () { return P.post('/api/onboarding/complete'); })
      .then(function () { busy(false); S.step = 9; S.goals = goals; render(); }, function (e) { busy(false); showErr(e.message, FIELD_ID[e.field]); });
  }
  function stepDone() {
    var p = S.q.phq9, g = S.q.gad7;
    view('<h1 tabindex="-1">You are all set, ' + esc(S.user.preferred_name) + '</h1><p class="lead">Your account is ready. Here is where you start.</p>' +
      '<div class="delta-grid">' +
      '<div class="bcell"><div class="k">Weight</div><div class="v">' + esc(S.body.weight_kg || '–') + ' <i>kg</i></div></div>' +
      '<div class="bcell"><div class="k">Height</div><div class="v">' + esc(S.body.height_cm || '–') + ' <i>cm</i></div></div>' +
      '<div class="bcell"><div class="k">PHQ-9</div><div class="v">' + (p ? p.score + ' <i>/ 27</i>' : '<i>skipped</i>') + '</div></div>' +
      '<div class="bcell"><div class="k">GAD-7</div><div class="v">' + (g ? g.score + ' <i>/ 21</i>' : '<i>skipped</i>') + '</div></div></div>' +
      '<div class="sub-block"><strong>What happens next</strong><p class="why" style="margin:0">Tell Pulse how you feel each day. After a few days it starts showing patterns, and your Health Factor builds from what you log, like your mood, sleep and steps.</p></div>' +
      '<div class="nav-row"><a class="btn" href="/user.html">Go to my dashboard</a></div>');
  }

  /* ---------- router ---------- */
  function render() {
    renderChrome();
    ({ 1: stepAccount, 2: stepConsent, 3: stepAbout, 4: stepHealth, 5: stepLifestyle, 6: stepDoctor, 7: stepCheckin, 8: stepFinish, 9: stepDone })[S.step]();
  }

  /* ---------- events ---------- */
  var root = $('#step');
  root.addEventListener('submit', function (e) {
    e.preventDefault();
    var act = e.target.dataset.act;
    if (S.busy) return;
    if (act === 'account') submitAccount();
    else if (act === 'verify') submitVerify();
    else if (act === 'consent') submitConsent();
    else if (act === 'about') submitAbout();
    else if (act === 'health') submitHealth();
    else if (act === 'lifestyle') submitLifestyle();
    else if (act === 'doctor') go(7);
    else if (act === 'startq') { S.run = { kind: S.q.phq9 ? 'gad7' : 'phq9', i: 0, answers: [] }; drawQuestion(); }
    else if (act === 'skipq') go(8);
    else if (act === 'finish') submitFinish();
  });
  root.addEventListener('click', function (e) {
    var t = e.target, x;
    if ((x = t.closest('[data-act]')) && x.tagName === 'BUTTON' || (x = t.closest('a[data-act]'))) {
      var act = x.dataset.act;
      if (act === 'back') { if (S.step === 7) S.run = null; return go(S.step - 1); }
      if (act === 'showpass') { var pw = $('#a-pass'); pw.type = pw.type === 'password' ? 'text' : 'password'; x.textContent = pw.type === 'password' ? 'Show' : 'Hide'; return; }
      if (act === 'skipverify') return go(2);
      if (act === 'consent-all') { Object.keys(CONSENT_TEXT).forEach(function (k) { S.consents[k] = true; }); return stepConsent(); }
      if (act === 'waitlist') { readAccount(); return P.post('/api/waitlist', { email: S.form.email, city: S.form.city }).then(function (r) { $('#wl-msg').innerHTML = '<div class="ok-box">' + esc(r.message) + '</div>'; }, function (er) { $('#wl-msg').innerHTML = '<div class="err-box">' + esc(er.message) + '</div>'; }); }
      if (act === 'dlink') {
        var dr = S.doc.draft; busy(true);
        return P.post('/api/links', { provider_id: dr.p.id, share: dr.share, expires: dr.expires }).then(function () { S.links.push(dr.p.id); S.doc.draft = null; busy(false); drawDoctor(); }, function (er) { busy(false); showErr(er.message); });
      }
      if (act === 'dcancel') { S.doc.draft = null; return drawDoctor(); }
      if (act === 'dinvite') {
        var em = $('#d-email').value.trim(); if (!em) return showErr('Enter your doctor\'s email.', 'd-email');
        return P.post('/api/invites', { email: em }).then(function () { S.invites.push(em); drawDoctor(); }, function (er) { showErr(er.message, 'd-email'); });
      }
      if (act === 'safe-continue') { S.run = null; return stepCheckin(); }
      if (act === 'qback') { if (S.run.i > 0) S.run.i--; return drawQuestion(); }
      if (act === 'skipq') return go(8);
      if (act === 'later') return P.api('POST', '/api/auth/logout', {}, { noRedirect: true }).then(function () { window.location.href = '/index.html'; }, function () { window.location.href = '/index.html'; });
    }
    if ((x = t.closest('[data-src]'))) { var s = S.health.stress_sources || (S.health.stress_sources = []), i = s.indexOf(x.dataset.src); if (i >= 0) s.splice(i, 1); else s.push(x.dataset.src); x.setAttribute('aria-pressed', String(i < 0)); return; }
    if ((x = t.closest('[data-tab]'))) { S.doc.tab = x.dataset.tab; S.doc.draft = null; return drawDoctor(); }
    if ((x = t.closest('[data-choose]'))) { var p = S.doc.providers.filter(function (q) { return q.id === x.dataset.choose; })[0]; var sh = {}; S.meta.share_keys.forEach(function (k) { sh[k] = false; }); S.doc.draft = { p: p, share: sh, expires: '90 days' }; return drawDoctor(); }
    if ((x = t.closest('[data-ans]'))) return answer(+x.dataset.ans);
  });
  root.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.consent) {
      S.consents[t.dataset.consent] = t.checked;
      var next = $('#step button[data-primary]'); if (next) next.disabled = !(S.consents.terms && S.consents.health_basics);
    } else if (t.id === 'c-pcos' || t.id === 'c-stress') { syncHealth(); stepHealth(); }
    else if (t.id === 'a-city') { readAccount(); stepAccount(); }
    else if (t.id === 'd-area') { S.doc.area = t.value; S.doc.draft = null; drawDoctor(); }
    else if (t.id === 'd-spec') { S.doc.spec = t.value; S.doc.draft = null; drawDoctor(); }
    else if (t.dataset.dshare) S.doc.draft.share[t.dataset.dshare] = t.checked;
    else if (t.id === 'd-exp') S.doc.draft.expires = t.value;
  });

  /* ---------- start ---------- */
  Promise.all([P.get('/api/meta'), P.api('GET', '/api/onboarding', undefined, { noRedirect: true }).catch(function (e) { if (e.status === 401) return null; throw e; })])
    .then(function (r) {
      var m = S.meta = r[0], o = r[1];
      S.meta.launch = m.launch_city;
      S.form = { city: m.launch_city };
      if (o) {
        S.user = o.user; S.step = Math.max(2, Math.min(o.step, 8)); S.body = o.body || {}; S.health = o.health; S.q = {};
        Object.keys(o.questionnaires || {}).forEach(function (k) { if (o.questionnaires[k]) S.q[k] = o.questionnaires[k]; });
        S.links = o.links; S.invites = o.invites; S.goals = o.goals || S.goals; S.notif = o.notifications; S.emergency = o.emergency;
        Object.keys(o.consents).forEach(function (k) { S.consents[k] = !!o.consents[k]; });
        if (o.user.onboarded) { window.location.href = '/user.html'; return; }
      } else {
        S.health = { conditions: [], lifestyle: [], stress_sources: [] };
        S.notif = { on: true, limit: 1, quiet: { on: true, from: '22:00', to: '08:00' }, checkin: { on: true, time: '21:00' }, meds: { on: true, time: '21:30' }, data: true, weekly: true, neutral: true };
      }
      S.health.conditions = S.health.conditions || [];
      render();
    }, function (e) { view('<h1>Pulse is not available</h1><div class="err-box">' + esc(e.message) + '</div>'); });
})();
