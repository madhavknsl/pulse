/* Pulse tracker. Everything is read from, and saved to, the local server. */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  var DAY = 864e5;
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sum(a) { return a.reduce(function (s, x) { return s + x; }, 0); }
  function avg(a) { return a.length ? sum(a) / a.length : 0; }
  function num(n) { return Number(n).toLocaleString('en-IN'); }
  var today = new Date(); today.setHours(0, 0, 0, 0);
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(d) { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
  function fmtWd(d) { return d.toLocaleDateString('en-IN', { weekday: 'short' }); }
  function fmtLong(d) { return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function fmtDur(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return h + 'h ' + pad(m) + 'm'; }
  function fmtClock(min) {
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'PM' : 'AM';
    return (h % 12 || 12) + ':' + pad(m) + ' ' + ap;
  }
  function daysBetween(a, b) { return Math.round((b - a) / DAY); }
  function nowHHMM() { var n = new Date(); return pad(n.getHours()) + ':' + pad(n.getMinutes()); }

  /* ---------- icons ---------- */
  var ICON = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="M9 21l2.5-6 3 2v4M11.5 15l1-5.5M7 12l3-3 3.5 1.5 2.5 3"/>',
    heart: '<path d="M12 20s-7.5-4.6-9.5-9.2C1.2 7.6 3.3 4.5 6.5 4.5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3 3.2 0 5.3 3.1 4 6.3C19.5 15.4 12 20 12 20z"/>',
    drop: '<path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11z"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    scale: '<rect x="3" y="4" width="18" height="16" rx="4"/><path d="M8.5 9.5a5 5 0 0 1 7 0M12 13l2-2.5"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    utensils: '<path d="M6 3v8M3.5 3v5a2.5 2.5 0 0 0 5 0V3M6 11v10M17 3c-2 2-3 4.5-3 7 0 1.7 1 2.5 3 2.5V21M17 3v9.5"/>',
    pill: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.2 9.2l5.6 5.6"/>',
    gauge: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    back: '<path d="M15 6l-6 6 6 6"/>'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>'; }
  var PULSE_MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 17h5l3-7 5 13 3-6h6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- navigation ---------- */
  var NAV = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { group: 'Body' },
    { id: 'steps', label: 'Steps', icon: 'walk' },
    { id: 'heart', label: 'Heart rate', icon: 'heart' },
    { id: 'spo2', label: 'SpO₂', icon: 'drop' },
    { id: 'sleep', label: 'Sleep', icon: 'moon' },
    { id: 'weight', label: 'Weight', icon: 'scale' },
    { id: 'workouts', label: 'Workouts', icon: 'dumbbell' },
    { group: 'Cycle & symptoms' },
    { id: 'cycle', label: 'Menstrual cycle', icon: 'calendar' },
    { id: 'symptoms', label: 'Symptoms & tags', icon: 'tag' },
    { group: 'Food & medicines' },
    { id: 'meals', label: 'Meals', icon: 'utensils' },
    { id: 'meds', label: 'Medication', icon: 'pill' },
    { group: 'Mind' },
    { id: 'stress', label: 'Stress & anxiety', icon: 'gauge' },
    { id: 'journal', label: 'Journal', icon: 'chat' }
  ];
  var LABEL = {}; NAV.forEach(function (n) { if (n.id) LABEL[n.id] = n.label; });

  (function buildNav() {
    var h = '<a class="side-link side-home" href="user.html" title="Home"><span class="side-ico">' + svg('back') + '</span><span class="side-label">Home</span></a>';
    NAV.forEach(function (n) {
      if (n.group) h += '<div class="side-group">' + esc(n.group) + '</div>';
      else h += '<a class="side-link" href="#' + n.id + '" data-id="' + n.id + '" title="' + esc(n.label) + '"><span class="side-ico">' + svg(n.icon) + '</span><span class="side-label">' + esc(n.label) + '</span></a>';
    });
    $('#sidebar').innerHTML = h;
  })();

  /* ---------- data from the server (30 days, oldest first; the last item is today) ---------- */
  var P = window.Pulse;
  var N = 30, STEP_GOAL = 7000, SLEEP_GOAL = 7;
  var dates = [], steps = [], rhr = [], hrv = [], spo2 = [], spo2min = [], bedtime = [], sleepMin = [];

  var state = {
    ranges: { steps: 7, heart: 7, spo2: 7, sleep: 7 },
    weights: [], waist: null, goalWeight: null, hideWeight: false, ui: { hide_numbers: false, show_bmi: false },
    workouts: [], woType: null,
    period: {}, calMonth: new Date(today.getFullYear(), today.getMonth(), 1), selDate: null,
    symSel: {}, tagSel: {}, symDirty: false, symLog: [],
    weekMeals: [], meals: [], mealSrc: null,
    meds: [], stress: null, qHistory: { phq9: [], gad7: [] },
    device: { connected: false }, consents: {}, name: 'there'
  };

  function ingest(d) {
    var days = d.daily;
    N = days.length;
    dates = days.map(function (r) { return parseKey(r.date); });
    steps = days.map(function (r) { return r.steps; });
    rhr = days.map(function (r) { return r.rhr; });
    hrv = days.map(function (r) { return r.hrv; });
    spo2 = days.map(function (r) { return r.spo2_avg; });
    spo2min = days.map(function (r) { return r.spo2_min; });
    bedtime = days.map(function (r) { return r.bed_min; });
    sleepMin = days.map(function (r) { return r.sleep_min; });
    STEP_GOAL = d.goals.steps || 7000; SLEEP_GOAL = d.goals.sleep_h || 7; state.goalWeight = d.goals.weight_kg;
    state.weights = d.weights.map(function (w) { return { date: parseKey(w.date), kg: w.kg }; });
    state.waist = d.waist ? { cm: d.waist.cm, date: parseKey(d.waist.date) } : null;
    state.ui = d.ui; state.hideWeight = d.ui.hide_numbers;
    state.workouts = d.workouts.map(function (w) { return { id: w.id, date: parseKey(w.date), type: w.type, min: w.min }; });
    state.period = d.period;
    state.symLog = d.symptom_logs.map(function (s) { return { date: parseKey(s.date), syms: s.syms, tags: s.tags }; });
    var td = key(today), todayLog = d.symptom_logs.filter(function (s) { return s.date === td; })[0];
    if (!state.symDirty) {   // don't wipe chips the person has ticked but not saved yet
      state.symSel = {}; state.tagSel = {};
      if (todayLog) { todayLog.syms.forEach(function (s) { state.symSel[s] = 1; }); todayLog.tags.forEach(function (s) { state.tagSel[s] = 1; }); }
    }
    state.weekMeals = d.meals;
    state.meals = d.meals.filter(function (m) { return m.date === td; });
    state.meds = d.meds;
    state.stress = days[N - 1].stress || null;
    state.qHistory = d.questionnaires;
    state.device = d.device; state.consents = d.consents; state.name = d.user.preferred_name;
  }
  function refresh() {
    return P.get('/api/tracker').then(function (d) { ingest(d); if (typeof current !== 'undefined' && RENDER[current]) RENDER[current](); });
  }

  /* ---------- cycle maths ---------- */
  function periodStarts() {
    var starts = [], prev = null;
    Object.keys(state.period).sort().forEach(function (k) {
      var d = parseKey(k);
      if (!prev || daysBetween(prev, d) > 1) starts.push(d);
      prev = d;
    });
    return starts;
  }
  function cycleLengths() { var s = periodStarts(), out = []; for (var k = 1; k < s.length; k++) out.push(daysBetween(s[k - 1], s[k])); return out; }
  function cycleDayOn(date) {
    var last = null; periodStarts().forEach(function (s) { if (s <= date) last = s; });
    return last ? daysBetween(last, date) + 1 : null;
  }

  /* ---------- charts ---------- */
  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function tickLabel(t, step) { return step >= 1000 ? (t / 1000) + 'k' : String(Number(t.toFixed(1))); }

  function draw(svgEl, spec) {
    var W = Math.max(280, Math.round(svgEl.getBoundingClientRect().width) || 600);
    var H = Math.max(190, Math.min(250, Math.round(W * 0.42)));
    var PL = 40, PR = 12, PT = 14, PB = 28, vals = spec.values, n = vals.length, bars = spec.type === 'bars';
    var have = vals.filter(function (v) { return v != null; });
    var all = have.concat(spec.goal != null ? [spec.goal] : []);
    var lo = spec.min != null ? spec.min : Math.min.apply(null, all);
    var hi = spec.max != null ? spec.max : Math.max.apply(null, all);
    if (spec.min == null || spec.max == null) {
      var padv = (hi - lo) * 0.15 || 1;
      if (spec.min == null) lo -= padv;
      if (spec.max == null) hi += padv;
    }
    var step = spec.step || niceStep((hi - lo) / 4);
    if (spec.min == null) lo = Math.floor(lo / step) * step;
    if (spec.max == null) hi = Math.ceil(hi / step) * step;
    if (hi <= lo) hi = lo + step;
    function x(k) { return bars ? PL + (k + 0.5) * (W - PL - PR) / n : PL + k * (W - PL - PR) / (n - 1 || 1); }
    function y(v) { return PT + (hi - v) * (H - PT - PB) / (hi - lo); }
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    if (spec.aria) svgEl.setAttribute('aria-label', spec.aria);

    var lastK = vals.length - 1; while (lastK > 0 && vals[lastK] == null) lastK--;
    var out = '<defs><linearGradient id="fill-' + svgEl.id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2563eb" stop-opacity=".22"/><stop offset="1" stop-color="#2563eb" stop-opacity="0"/></linearGradient></defs>';
    var count = Math.round((hi - lo) / step), t, k;
    for (k = 0; k <= count; k++) {
      t = lo + k * step;
      out += '<line class="grid" x1="' + PL + '" x2="' + (W - PR) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/>' +
             '<text x="' + (PL - 8) + '" y="' + (y(t) + 4).toFixed(1) + '" text-anchor="end">' + tickLabel(t, step) + '</text>';
    }
    if (bars) {
      var bw = Math.min(40, (W - PL - PR) / n * 0.62);
      vals.forEach(function (v, j) {
        if (v == null) return;
        var top = y(v);
        out += '<rect class="bar-r' + (j === n - 1 ? ' last' : '') + '" x="' + (x(j) - bw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, y(lo) - top).toFixed(1) + '" rx="4"/>';
      });
    } else {
      // each unbroken run of days is its own line, so a missing day stays a gap
      var runs = [], cur = [];
      vals.forEach(function (v, j) { if (v == null) { if (cur.length) runs.push(cur); cur = []; } else cur.push(j); });
      if (cur.length) runs.push(cur);
      runs.forEach(function (run) {
        var line = run.map(function (j, q) { return (q ? 'L' : 'M') + x(j).toFixed(1) + ' ' + y(vals[j]).toFixed(1); }).join(' ');
        if (run.length > 1) out += '<path d="' + line + ' L' + x(run[run.length - 1]).toFixed(1) + ' ' + (H - PB) + ' L' + x(run[0]).toFixed(1) + ' ' + (H - PB) + ' Z" fill="url(#fill-' + svgEl.id + ')"/>';
        out += '<path class="line" d="' + line + '"/>';
      });
      out += '<circle class="dot" cx="' + x(lastK).toFixed(1) + '" cy="' + y(vals[lastK]).toFixed(1) + '" r="5"/>';
    }
    if (spec.goal != null) {
      out += '<line class="goal" x1="' + PL + '" x2="' + (W - PR) + '" y1="' + y(spec.goal).toFixed(1) + '" y2="' + y(spec.goal).toFixed(1) + '"/>' +
             '<text x="' + (W - PR) + '" y="' + (y(spec.goal) - 5).toFixed(1) + '" text-anchor="end">' + esc(spec.goalLabel || 'Goal') + '</text>';
    }
    var maxLabels = Math.max(2, Math.floor((W - PL - PR) / 64)), every = Math.ceil(n / maxLabels);
    spec.labels.forEach(function (lab, j) { if ((n - 1 - j) % every === 0) out += '<text x="' + x(j).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lab) + '</text>'; });
    out += '<g class="hov" hidden><line class="hover-line" y1="' + PT + '" y2="' + (H - PB) + '"/><circle class="dot" r="5"/>' +
           '<g class="tip"><rect class="tip-bg" rx="7" height="26"/><text class="tip-text" text-anchor="middle"></text></g></g>' +
           '<rect class="hit" x="' + PL + '" y="0" width="' + (W - PL - PR) + '" height="' + H + '" fill="transparent"/>';
    svgEl.innerHTML = out;

    var hit = svgEl.querySelector('.hit'), hov = svgEl.querySelector('.hov');
    var hl = hov.querySelector('line'), dot = hov.querySelector('circle'), bg = hov.querySelector('rect'), tx = hov.querySelector('text');
    function show(e) {
      var r = svgEl.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
      var j = bars ? Math.floor((px - PL) / ((W - PL - PR) / n)) : Math.round((px - PL) / ((W - PL - PR) / (n - 1 || 1)));
      j = Math.max(0, Math.min(n - 1, j));
      if (vals[j] == null) { hov.setAttribute('hidden', ''); return; }
      var cx = x(j), cy = y(vals[j]);
      hov.removeAttribute('hidden');
      hl.setAttribute('x1', cx); hl.setAttribute('x2', cx); dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
      tx.textContent = spec.tip(j);
      var w = tx.getComputedTextLength() + 20, left = Math.max(2, Math.min(W - w - 2, cx - w / 2)), top = Math.max(2, cy - 40);
      bg.setAttribute('x', left); bg.setAttribute('y', top); bg.setAttribute('width', w);
      tx.setAttribute('x', left + w / 2); tx.setAttribute('y', top + 17);
    }
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', function () { hov.setAttribute('hidden', ''); });
  }

  /* days with no reading are null: say so instead of drawing an empty chart */
  function nums(a) { return a.filter(function (v) { return v != null; }); }
  function avgN(a) { var x = nums(a); return x.length ? sum(x) / x.length : null; }
  function chartOrEmpty(svgEl, ok, msg) {
    var note = svgEl.nextElementSibling;
    if (!note || !note.classList.contains('chart-empty')) { note = document.createElement('p'); note.className = 'empty chart-empty'; svgEl.parentNode.insertBefore(note, svgEl.nextSibling); }
    if (ok) { svgEl.removeAttribute('hidden'); note.hidden = true; }
    else { svgEl.setAttribute('hidden', ''); note.hidden = false; note.innerHTML = msg; }
    return ok;
  }
  var NEED_WATCH = 'No readings yet. <a href="profile.html#devices">Connect the demo watch</a> in your profile to see this.';

  function labelsFor(n) {
    var out = [];
    for (var j = n - 1; j >= 0; j--) { var d = addDays(today, -j); out.push(j === 0 ? 'Today' : (n <= 7 ? fmtWd(d) : fmtDate(d))); }
    return out;
  }
  function dayText(j, n) { return fmtDate(addDays(today, -(n - 1 - j))) + (j === n - 1 ? ' (today)' : ''); }
  function stat(k, v, u, s) {
    return '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v">' + v + (u ? ' <span class="u">' + esc(u) + '</span>' : '') + '</div>' + (s ? '<div class="s">' + esc(s) + '</div>' : '') + '</div>';
  }
  function setMsg(id, text, isErr) { var el = $(id); el.textContent = text; el.className = 'msg-line' + (isErr ? ' err' : ''); }

  /* ---------- views ---------- */
  var RENDER = {};

  RENDER.overview = function () {
    var taken = state.meds.filter(function (m) { return m.today === 'taken'; }).length;
    var wk = state.workouts.filter(function (w) { return daysBetween(w.date, today) <= 6; });
    var starts = periodStarts(), cd = cycleDayOn(today), lastW = state.weights.length ? state.weights[state.weights.length - 1].kg : null;
    var nSym = Object.keys(state.symSel).length, last = N - 1;
    var T = [
      { id: 'steps', icon: 'walk', label: 'Steps', val: steps[last] == null ? '–' : num(steps[last]), sub: 'of ' + num(STEP_GOAL) + ' goal' },
      { id: 'heart', icon: 'heart', label: 'Resting heart rate', val: rhr[last] == null ? '–' : rhr[last] + ' bpm', sub: hrv[last] == null ? 'No reading yet' : 'HRV ' + hrv[last] + ' ms' },
      { id: 'spo2', icon: 'drop', label: 'SpO₂ last night', val: spo2[last] == null ? '–' : spo2[last].toFixed(1) + '%', sub: spo2min[last] == null ? 'No reading yet' : 'Lowest ' + spo2min[last] + '%' },
      { id: 'sleep', icon: 'moon', label: 'Sleep', val: sleepMin[last] == null ? '–' : fmtDur(sleepMin[last]), sub: bedtime[last] == null ? 'Not logged yet' : 'Bed ' + fmtClock(bedtime[last]) },
      { id: 'weight', icon: 'scale', label: 'Weight', val: lastW == null ? '–' : (state.hideWeight ? '•••' : lastW.toFixed(1) + ' kg'), sub: 'Weekly check-in' },
      { id: 'workouts', icon: 'dumbbell', label: 'Workouts', val: wk.length + ' this week', sub: sum(wk.map(function (w) { return w.min; })) + ' minutes' },
      { id: 'cycle', icon: 'calendar', label: 'Cycle', val: cd ? 'Day ' + cd : '–', sub: starts.length ? 'Last period ' + fmtDate(starts[starts.length - 1]) : 'No period logged' },
      { id: 'symptoms', icon: 'tag', label: 'Symptoms', val: nSym ? nSym + ' selected' : 'None today', sub: 'Tap to log' },
      { id: 'meals', icon: 'utensils', label: 'Meals today', val: state.meals.length + ' logged', sub: 'No calorie counting' },
      { id: 'meds', icon: 'pill', label: 'Medication', val: taken + ' of ' + state.meds.length + ' taken', sub: 'Today' },
      { id: 'stress', icon: 'gauge', label: 'Stress today', val: state.stress ? STRESS[state.stress - 1] : 'Not logged', sub: 'Plus check-ins' },
      { id: 'journal', icon: 'chat', label: 'Journal', val: 'Talk it out', sub: 'Questions only' }
    ];
    $('#tiles').innerHTML = T.map(function (t) {
      return '<a class="tile" href="#' + t.id + '"><span class="t-head">' + svg(t.icon) + esc(t.label) + '</span><span class="t-val">' + esc(t.val) + '</span><span class="t-sub">' + esc(t.sub) + '</span></a>';
    }).join('');
    var chip = document.querySelector('#view-overview .sync-chip');
    if (chip) chip.innerHTML = state.device.connected ? '<i></i>Demo watch connected · readings are simulated' : '<i style="background:#9fb0cc"></i>No watch connected';
  };

  RENDER.steps = function () {
    var n = state.ranges.steps, v = steps[N - 1], last = steps.slice(-n), got = nums(last);
    $('#steps-big').textContent = v == null ? '–' : num(v);
    $('#steps-goal').textContent = 'of ' + num(STEP_GOAL) + ' goal so far today';
    $('#steps-bar').style.width = v == null ? '0%' : Math.min(100, v / STEP_GOAL * 100) + '%';
    $('#steps-stats').innerHTML = got.length ?
      stat('Average', num(Math.round(avgN(last))), 'a day', 'Last ' + n + ' days') +
      stat('Best day', num(Math.max.apply(null, got)), '', 'Last ' + n + ' days') +
      stat('Days at goal', got.filter(function (s) { return s >= STEP_GOAL; }).length + ' of ' + got.length, '', num(STEP_GOAL) + '+ steps') : '';
    if (chartOrEmpty($('#chart-steps'), got.length > 0, NEED_WATCH)) {
      draw($('#chart-steps'), { type: 'bars', values: last, labels: labelsFor(n), goal: STEP_GOAL, goalLabel: 'Goal ' + num(STEP_GOAL), min: 0,
        aria: 'Daily steps for the last ' + n + ' days', tip: function (j) { return dayText(j, n) + ' · ' + num(last[j]) + ' steps'; } });
    }
  };

  RENDER.heart = function () {
    var n = state.ranges.heart, last = rhr.slice(-n), got = nums(last);
    $('#hr-big').textContent = rhr[N - 1] == null ? '–' : rhr[N - 1];
    $('#hr-stats').innerHTML = got.length ?
      stat('Average', Math.round(avgN(last)), 'bpm', 'Last ' + n + ' days') +
      stat('Lowest', Math.min.apply(null, got), 'bpm', 'Last ' + n + ' days') +
      stat('HRV last night', hrv[N - 1] == null ? '–' : hrv[N - 1], hrv[N - 1] == null ? '' : 'ms', 'Beat-to-beat variation') : '';
    if (chartOrEmpty($('#chart-hr'), got.length > 0, NEED_WATCH)) {
      draw($('#chart-hr'), { type: 'line', values: last, labels: labelsFor(n), aria: 'Resting heart rate for the last ' + n + ' days',
        tip: function (j) { return dayText(j, n) + ' · ' + last[j] + ' bpm'; } });
    }
  };

  RENDER.spo2 = function () {
    var n = state.ranges.spo2, last = spo2.slice(-n), got = nums(last), lows = nums(spo2min.slice(-n));
    $('#spo-big').textContent = spo2[N - 1] == null ? '–' : spo2[N - 1].toFixed(1);
    $('#spo-stats').innerHTML = got.length ?
      stat('Average', avgN(last).toFixed(1), '%', 'Last ' + n + ' nights') +
      stat('Lowest reading', lows.length ? Math.min.apply(null, lows) : '–', lows.length ? '%' : '', 'Last ' + n + ' nights') +
      stat('Last night low', spo2min[N - 1] == null ? '–' : spo2min[N - 1], spo2min[N - 1] == null ? '' : '%', 'Overnight minimum') : '';
    if (chartOrEmpty($('#chart-spo'), got.length > 0, NEED_WATCH)) {
      draw($('#chart-spo'), { type: 'line', values: last, labels: labelsFor(n), min: 90, max: 100, step: 2, aria: 'Nightly average SpO2 for the last ' + n + ' nights',
        tip: function (j) { return dayText(j, n) + ' · ' + last[j].toFixed(1) + '%'; } });
    }
  };

  RENDER.sleep = function () {
    var n = state.ranges.sleep, mins = sleepMin.slice(-n), got = nums(mins), hours = mins.map(function (m) { return m == null ? null : Math.round(m / 6) / 10; });
    var weekBeds = nums(bedtime.slice(-7)), spread = weekBeds.length > 1 ? Math.max.apply(null, weekBeds) - Math.min.apply(null, weekBeds) : null;
    var last = N - 1;
    $('#sleep-big').textContent = sleepMin[last] == null ? '–' : fmtDur(sleepMin[last]);
    $('#sleep-stats').innerHTML = got.length ?
      stat('Went to bed', bedtime[last] == null ? '–' : fmtClock(bedtime[last])) +
      stat('Woke up', sleepMin[last] == null || bedtime[last] == null ? '–' : fmtClock(bedtime[last] + sleepMin[last])) +
      stat('Average', fmtDur(avgN(mins)), '', 'Last ' + n + ' nights') +
      stat('Bedtime varied by', spread == null ? '–' : fmtDur(spread), '', 'Last 7 nights') : '';
    if (chartOrEmpty($('#chart-sleep'), got.length > 0, 'No sleep logged yet. Add last night below, or <a href="profile.html#devices">connect the demo watch</a>.')) {
      draw($('#chart-sleep'), { type: 'bars', values: hours, labels: labelsFor(n), goal: SLEEP_GOAL, goalLabel: SLEEP_GOAL + ' h goal', min: 0, max: 10, step: 2,
        aria: 'Hours slept for the last ' + n + ' nights', tip: function (j) { return dayText(j, n) + ' · ' + hours[j] + ' h'; } });
    }
  };

  RENDER.weight = function () {
    var w = state.weights, hide = state.hideWeight;
    $('#hide-weight').checked = hide;
    if (!w.length) {
      $('#weight-card').innerHTML = '<p class="muted">No weight logged yet. Add it below.</p>';
      $('#weight-chart-card').hidden = true;
      return;
    }
    var cur = w[w.length - 1], first = w[0], diff = Math.round((cur.kg - first.kg) * 10) / 10;
    $('#weight-card').innerHTML =
      '<div class="big-line"><span class="big">' + (hide ? '•••' : cur.kg.toFixed(1)) + '</span><span class="muted">' + (hide ? 'numbers hidden' : 'kg · logged ' + fmtDate(cur.date)) + '</span></div>' +
      '<div class="stats" style="margin-top:14px">' +
      stat('Goal', hide ? '•••' : (state.goalWeight == null ? '–' : state.goalWeight), hide || state.goalWeight == null ? '' : 'kg') +
      stat('Since ' + fmtDate(first.date), hide ? '•••' : (diff > 0 ? '+' : '') + diff, hide ? '' : 'kg') +
      stat('Waist', hide ? '•••' : (state.waist ? state.waist.cm : '–'), hide || !state.waist ? '' : 'cm', state.waist ? 'Logged ' + fmtDate(state.waist.date) : 'Not logged yet') + '</div>';
    $('#weight-chart-card').hidden = hide;
    if (!hide) {
      if (chartOrEmpty($('#chart-weight'), w.length > 1, 'Log your weight again to see a trend.')) {
        draw($('#chart-weight'), { type: 'line', values: w.map(function (p) { return p.kg; }), labels: w.map(function (p) { return fmtDate(p.date); }),
          aria: 'Weekly weight over the last ' + w.length + ' weigh-ins', tip: function (j) { return fmtDate(w[j].date) + ' · ' + w[j].kg.toFixed(1) + ' kg'; } });
      }
    }
  };

  var WO_TYPES = ['Walk', 'Run', 'Strength', 'Yoga', 'Cycling', 'Dance', 'Other'];
  RENDER.workouts = function () {
    var wk = state.workouts.filter(function (w) { return daysBetween(w.date, today) <= 6; }).sort(function (a, b) { return b.date - a.date; });
    var perDay = []; for (var j = 6; j >= 0; j--) { var dd = key(addDays(today, -j)); perDay.push(sum(wk.filter(function (w) { return key(w.date) === dd; }).map(function (w) { return w.min; }))); }
    $('#wo-stats').innerHTML =
      stat('Sessions', wk.length, '', 'Last 7 days') +
      stat('Total', sum(wk.map(function (w) { return w.min; })), 'min', 'Last 7 days') +
      stat('Types', Object.keys(wk.reduce(function (o, w) { o[w.type] = 1; return o; }, {})).length, '', 'Variety this week');
    $('#wo-types').innerHTML = WO_TYPES.map(function (t) { return '<button type="button" class="chip-btn" data-t="' + t + '" aria-pressed="' + (state.woType === t) + '">' + t + '</button>'; }).join('');
    $('#wo-list').innerHTML = wk.length ? wk.map(function (w) {
      return '<div class="row-item"><div class="grow"><strong>' + esc(w.type) + '</strong><span class="meta">' + fmtLong(w.date) + '</span></div><span class="pill">' + w.min + ' min</span>' +
             '<button class="x-btn" type="button" data-del="' + w.id + '" aria-label="Remove ' + esc(w.type) + ' workout">×</button></div>';
    }).join('') : '<p class="muted">Nothing logged this week yet.</p>';
    draw($('#chart-wo'), { type: 'bars', values: perDay, labels: labelsFor(7), min: 0, aria: 'Workout minutes per day this week',
      tip: function (k) { return dayText(k, 7) + ' · ' + perDay[k] + ' min'; } });
  };

  /* cycle */
  var FLOWS = [['none', 'No bleeding'], ['spotting', 'Spotting'], ['light', 'Light'], ['medium', 'Medium'], ['heavy', 'Heavy']];
  RENDER.cycle = function () {
    var starts = periodStarts(), lens = cycleLengths(), cd = cycleDayOn(today);
    $('#cycle-stats').innerHTML =
      stat('Today', cd ? 'Day ' + cd : '–', '', cd ? 'of this cycle' : 'No period logged') +
      stat('Last cycle', lens.length ? lens[lens.length - 1] : '–', lens.length ? 'days' : '') +
      stat('Average', lens.length ? Math.round(avg(lens.slice(-3))) : '–', lens.length ? 'days' : '', 'Last ' + Math.min(3, lens.length) + ' cycles') +
      stat('Typical range', '21–35', 'days', 'For adults');
    var m = state.calMonth, first = new Date(m.getFullYear(), m.getMonth(), 1), days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    $('#cal-title').textContent = m.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    $('#cal-next').disabled = m.getFullYear() === today.getFullYear() && m.getMonth() === today.getMonth();
    var h = 'SMTWTFS'.split('').map(function (c) { return '<span class="dow" aria-hidden="true">' + c + '</span>'; }).join(''), b;
    for (b = 0; b < first.getDay(); b++) h += '<span class="day blank" aria-hidden="true"></span>';
    for (var k = 1; k <= days; k++) {
      var date = new Date(m.getFullYear(), m.getMonth(), k), kk = key(date), fl = state.period[kk], future = date > today;
      h += '<button type="button" class="day' + (kk === key(today) ? ' today' : '') + (kk === state.selDate ? ' sel' : '') + '"' + (fl ? ' data-flow="' + fl + '"' : '') +
           ' data-k="' + kk + '"' + (future ? ' disabled' : '') + ' aria-label="' + fmtLong(date) + ': ' + (fl || 'no bleeding logged') + '">' + k + '</button>';
    }
    $('#cal').innerHTML = h;
    var sheet = $('#day-sheet');
    if (state.selDate) {
      var cur = state.period[state.selDate] || 'none';
      sheet.hidden = false;
      $('#ds-title').textContent = fmtLong(parseKey(state.selDate));
      $('#ds-chips').innerHTML = FLOWS.map(function (f) { return '<button type="button" class="chip-btn" data-flow="' + f[0] + '" aria-pressed="' + (cur === f[0]) + '">' + f[1] + '</button>'; }).join('');
    } else sheet.hidden = true;
  };

  /* symptoms & tags */
  var SYMS = ['Acne', 'Unwanted hair growth', 'Hair thinning', 'Fatigue', 'Bloating', 'Pelvic pain', 'Headache', 'Cravings', 'Low energy', 'Breast tenderness'];
  var TAGS = ['Late meal', 'Ordered in', 'Skipped workout', 'Deadline day', 'Caffeine', 'Alcohol', 'Travel', 'Poor sleep', 'Period day', 'Spoke to someone I trust'];
  RENDER.symptoms = function () {
    var cd = cycleDayOn(today);
    $('#sym-sub').textContent = 'Tap what applies today.' + (cd ? ' Today is day ' + cd + ' of your cycle.' : '');
    $('#sym-chips').innerHTML = SYMS.map(function (s) { return '<button type="button" class="chip-btn" data-s="' + esc(s) + '" aria-pressed="' + !!state.symSel[s] + '">' + esc(s) + '</button>'; }).join('');
    $('#tag-chips').innerHTML = TAGS.map(function (s) { return '<button type="button" class="chip-btn" data-t="' + esc(s) + '" aria-pressed="' + !!state.tagSel[s] + '">' + esc(s) + '</button>'; }).join('');
    $('#sym-list').innerHTML = state.symLog.map(function (e) {
      var c = cycleDayOn(e.date);
      return '<div class="row-item"><div class="grow"><strong>' + fmtLong(e.date) + (c ? ' · cycle day ' + c : '') + '</strong>' +
        '<span class="meta">' + (e.syms.length ? esc(e.syms.join(', ')) : 'No symptoms') + (e.tags.length ? ' · ' + esc(e.tags.join(', ')) : '') + '</span></div></div>';
    }).join('') || '<p class="muted">Nothing logged yet.</p>';
  };

  /* meals */
  var SRC = ['Home-cooked', 'Ordered in', 'Eaten out', 'Skipped'];
  var QUICK = ['Poha', 'Idli-sambar', 'Dal-chawal', 'Roti-sabzi', 'Paratha', 'Dosa', 'Biryani', 'Khichdi', 'Fruit', 'Salad', 'Sandwich'];
  RENDER.meals = function () {
    var wm = state.weekMeals;
    var ordered = wm.filter(function (m) { return m.src === 'Ordered in'; }).length;
    var late = wm.filter(function (m) { return m.type === 'Dinner' && m.time >= '22:00'; }).length;
    var skipped = wm.filter(function (m) { return m.src === 'Skipped'; }).length;
    $('#meal-stats').innerHTML = stat('Ordered in', ordered + ' of ' + wm.length, '', 'Meals, last 7 days') + stat('Dinners after 10 pm', late, '', 'Last 7 days') + stat('Skipped', skipped, 'meals', 'Last 7 days');
    $('#meal-src').innerHTML = SRC.map(function (s) { return '<button type="button" class="chip-btn" data-src="' + s + '" aria-pressed="' + (state.mealSrc === s) + '">' + s + '</button>'; }).join('');
    $('#meal-quick').innerHTML = QUICK.map(function (q) { return '<button type="button" class="chip-btn" data-q="' + esc(q) + '">+ ' + esc(q) + '</button>'; }).join('');
    if (!$('#meal-time').value) $('#meal-time').value = nowHHMM();
    var meals = state.meals.slice().sort(function (a, b) { return a.time < b.time ? -1 : 1; });
    $('#meal-list').innerHTML = meals.length ? meals.map(function (m) {
      return '<div class="row-item"><div class="grow"><strong>' + esc(m.type) + ' · ' + fmtClock(+m.time.slice(0, 2) * 60 + +m.time.slice(3)) + '</strong><span class="meta">' + esc(m.src) + (m.text ? ' · ' + esc(m.text) : '') + '</span></div>' +
             '<button class="x-btn" type="button" data-del="' + m.id + '" aria-label="Remove ' + esc(m.type) + '">×</button></div>';
    }).join('') : '<p class="muted">Nothing logged yet today.</p>';
  };

  /* medication */
  RENDER.meds = function () {
    $('#med-list').innerHTML = state.meds.length ? state.meds.map(function (m, k) {
      var dots = m.week.map(function (s) { return '<i class="' + (s === 'taken' ? 'on' : 'miss') + '"></i>'; }).join('') + '<i class="' + (m.today === 'taken' ? 'on' : m.today === 'missed' ? 'miss' : '') + '"></i>';
      return '<div class="row-item" style="flex-wrap:wrap"><div class="grow"><strong>' + esc(m.name) + '</strong><span class="meta">' + esc(m.dose || 'No dose added') + '</span>' +
        '<div class="dots" style="margin-top:8px" role="img" aria-label="Last 7 days">' + dots + '</div></div>' +
        '<div class="seg" role="group" aria-label="Today for ' + esc(m.name) + '"><button type="button" data-med="' + k + '" data-v="taken" aria-pressed="' + (m.today === 'taken') + '">Taken</button>' +
        '<button type="button" data-med="' + k + '" data-v="missed" aria-pressed="' + (m.today === 'missed') + '">Missed</button></div>' +
        '<button class="x-btn" type="button" data-del="' + m.id + '" aria-label="Remove ' + esc(m.name) + '">×</button></div>';
    }).join('') : '<p class="muted">Nothing added yet.</p>';
  };

  /* stress & anxiety */
  var STRESS = ['Calm', 'Mild', 'Moderate', 'High', 'Overwhelmed'];
  var FREQ = P.FREQ, QS = P.QUESTIONNAIRES;
  var run = null;

  RENDER.stress = function () {
    if (run) return renderRun();
    $('#stress-home').hidden = false; $('#q-run').hidden = true;
    $('#stress-chips').innerHTML = STRESS.map(function (s, k) { return '<button type="button" class="chip-btn" data-s="' + (k + 1) + '" aria-pressed="' + (state.stress === k + 1) + '">' + s + '</button>'; }).join('');
    $('#q-list').innerHTML = Object.keys(QS).map(function (qk) {
      var h = state.qHistory[qk], lastR = h.length ? h[h.length - 1] : null, due = !lastR || lastR.ago >= 14;
      return '<div class="row-item"><div class="grow"><strong>' + QS[qk].name + '</strong><span class="meta">' +
        (!lastR ? 'Not taken yet' : lastR.ago === 0 ? 'Done today: ' + lastR.score + ' of ' + QS[qk].max : 'Last: ' + lastR.score + ' of ' + QS[qk].max + ', ' + lastR.ago + ' days ago') + ' · ' + QS[qk].items.length + ' questions</span></div>' +
        (due ? '<span class="pill">Due</span>' : '') + '<button class="btn btn-inline" type="button" data-q="' + qk + '" style="min-height:42px">Start</button></div>';
    }).join('');
  };

  function renderRun() {
    $('#stress-home').hidden = true;
    var box = $('#q-run'); box.hidden = false;
    var q = QS[run.key], n = q.items.length;
    if (run.i < n) {
      box.innerHTML =
        '<div class="q-top"><strong>' + q.name + ' · Question ' + (run.i + 1) + ' of ' + n + '</strong><button class="btn-ghost" type="button" id="q-cancel">Cancel</button></div>' +
        '<div class="bar" style="margin-top:12px"><i style="width:' + (run.i / n * 100) + '%"></i></div>' +
        '<p class="q-prompt"><span class="muted" style="font-weight:600;font-size:.9375rem;display:block;margin-bottom:4px">Over the last 2 weeks, how often have you been bothered by:</span>' + esc(q.items[run.i]) + '</p>' +
        '<div class="opt-list">' + FREQ.map(function (f, k) { return '<button type="button" class="opt" data-a="' + k + '" aria-pressed="' + (run.answers[run.i] === k) + '">' + f + '</button>'; }).join('') + '</div>' +
        (run.i > 0 ? '<div style="margin-top:14px"><button class="btn-ghost" type="button" id="q-back">Back</button></div>' : '') +
        '<p class="msg-line" id="q-msg" role="status"></p>';
    } else {
      var score = run.score, flagged = !!run.safety;
      box.innerHTML =
        '<h2>' + q.name + ' done</h2><div class="score-box"><div class="big">' + score + ' <span class="muted" style="font-size:1rem;font-weight:600">of ' + q.max + '</span></div>' +
        '<p class="fine" style="margin-top:6px">This is a screening score, not a diagnosis. Share it with your doctor.</p></div>' +
        (flagged ? '<div class="support-box"><strong>You mentioned thoughts of harming yourself.</strong> You do not have to deal with that alone. A trained counsellor is available any time on <a href="tel:14416"><strong>Tele-MANAS 14416</strong></a> (free, 24×7). In an emergency, call <a href="tel:112"><strong>112</strong></a>.</div>' : '') +
        '<div style="margin-top:16px"><button class="btn btn-inline" type="button" id="q-done">Done</button></div>';
    }
  }

  /* ---------- journal (chat) ---------- */
  // Scripted for the static phase. Rule-based and deterministic: every reply is a question, and a crisis phrase
  // always gets the support card instead. A live AI later must keep the same two guarantees.
  var CRISIS = /suicid|kill myself|end my life|end it all|self[- ]?harm|hurt myself|want to die|wanna die|don'?t want to (live|be here)|better off dead|no reason to live|marna chahta|mar jana chahta|jeena nahi|khud ko (khatam|maar)/i;
  var CATS = [
    { id: 'low', re: /\b(sad|low|down|empty|numb|hopeless|worthless|cry|crying|depress\w*|heavy|tired of everything)\b/gi, q: [
      'How long has it felt this way?', 'When was the last moment today that felt even a little lighter?', 'What does a low day look like for you, hour by hour?',
      'What did you used to enjoy that feels far away now?'] },
    { id: 'anxious', re: /\b(anxi\w*|worr\w*|panic\w*|nervous|scared|afraid|overthink\w*|stress\w*|tense|on edge)\b/gi, q: [
      'What is the thought that keeps coming back?', 'What are you most afraid might happen?', 'Where do you feel it in your body?', 'When does the worry tend to get louder?'] },
    { id: 'sleep', re: /\b(sleep\w*|insomnia|awake|nightmare\w*|exhaust\w*|tired|neend)\b/gi, q: [
      'What does your mind do once you are in bed?', 'How did last night shape your day?', 'When did your sleep last feel okay, and what was different then?',
      'What time does your mind start to wind down in the evening?'] },
    { id: 'work', re: /\b(work\w*|job|boss|deadline\w*|meeting\w*|manager|office|client\w*|sprint\w*|laptop|burn\w*|release|oncall)\b/gi, q: [
      'What part of work feels heaviest right now?', 'When did you last take a proper break during the day?', 'What would "enough" look like for today?',
      'Who at work knows how stretched you are?'] },
    { id: 'family', re: /\b(mom|mum|mummy|dad|papa|parents?|family|in-?laws?|brother|sister|ghar)\b/gi, q: [
      'How do things feel between you and them at the moment?', 'What do you wish they understood about your days?', 'What have you been holding back from saying to them?'] },
    { id: 'body', re: /\b(pcos|pcod|periods?|cycle|weight|skin|acne|hair|body|cramps?|bloat\w*|hormon\w*)\b/gi, q: [
      'How has your body been feeling to you lately?', 'What has been the hardest part of dealing with this?', 'Who, if anyone, have you been able to talk to about it?'] },
    { id: 'angry', re: /\b(angry|anger|irritat\w*|frustrat\w*|annoy\w*|rage|snapp\w*)\b/gi, q: [
      'What happened just before you felt this?', 'What did you need in that moment that you did not get?'] },
    { id: 'lonely', re: /\b(alone|lonely|nobody|no one|flatmates?|isolated|miss(ing)? (home|family))\b/gi, q: [
      'Who do you feel closest to right now?', 'What is it like coming home to a quiet space after a long day?'] },
    { id: 'food', re: /\b(eat\w*|food|meals?|hungry|binge\w*|crav\w*|swiggy|zomato|ordered|skipp\w*)\b/gi, q: [
      'What was going on around the time you reached for food?', 'How were you feeling before that meal?'] },
    { id: 'good', re: /\b(good|great|happy|better|proud|excited|fun|relaxed|calm|grateful)\b/gi, q: [
      'What made that feel good?', 'What do you want to remember about today?'] }
  ];
  var DEFAULT_Q = ['Can you tell me a little more about that?', 'What has been on your mind the most today?', 'How did that feel in the moment?', 'What happened next?'];
  var STARTERS = ['Work has been a lot', 'I could not sleep', 'I am feeling low', 'I just need to vent'];
  var chat = { used: {}, busy: false };

  function pickQuestion(text) {
    var best = null, bestScore = 0;
    CATS.forEach(function (c) { var m = text.match(c.re); if (m && m.length > bestScore) { best = c; bestScore = m.length; } });
    var bank = best ? best.q : DEFAULT_Q, id = best ? best.id : 'default';
    var used = chat.used[id] || (chat.used[id] = []);
    var pool = bank.filter(function (q) { return used.indexOf(q) < 0; });
    if (!pool.length) { used.length = 0; pool = bank; }
    var q = pool[Math.floor(Math.random() * pool.length)];
    used.push(q);
    return /\?\s*$/.test(q) ? q : DEFAULT_Q[0]; // guardrail: only ever ask
  }

  function msgsEl() { return $('#msgs'); }
  function scrollDown() { var m = msgsEl(); m.scrollTop = m.scrollHeight; }
  function addMsg(role, text) {
    var row = document.createElement('div'); row.className = 'msg ' + role;
    if (role === 'bot') { var av = document.createElement('span'); av.className = 'av'; av.innerHTML = PULSE_MARK; row.appendChild(av); }
    var t = document.createElement('div'); t.className = 'txt'; t.textContent = text; row.appendChild(t);
    msgsEl().appendChild(row); scrollDown(); return row;
  }
  function addCrisis() {
    var row = document.createElement('div'); row.className = 'msg bot';
    row.innerHTML = '<span class="av">' + PULSE_MARK + '</span><div class="txt"><div class="crisis">' +
      '<p><strong>I am really glad you said that out loud.</strong></p>' +
      '<p>I am an AI, so I cannot help in a crisis, but a trained person can, right now. Tele-MANAS is free and open 24×7. In an emergency, call 112.</p>' +
      '<div class="acts"><a class="btn btn-sm" href="tel:14416">Call 14416</a><a class="btn btn-sm btn-outline" href="tel:112">Call 112</a></div></div></div>';
    msgsEl().appendChild(row); scrollDown();
  }
  function startChat() {
    chat.used = {}; chat.busy = false;
    msgsEl().innerHTML = '';
    addMsg('bot', 'Hi ' + state.name + '. This is a quiet space to think out loud. I will only ask questions, and I cannot give advice. What is on your mind?');
    var s = document.createElement('div'); s.className = 'starters'; s.id = 'starters';
    s.innerHTML = STARTERS.map(function (t) { return '<button type="button" class="chip-btn" data-start="' + esc(t) + '">' + esc(t) + '</button>'; }).join('');
    msgsEl().appendChild(s);
    $('#chat-send').disabled = false;
  }
  function send(text) {
    text = text.trim(); if (!text || chat.busy) return;
    var st = $('#starters'); if (st) st.remove();
    addMsg('user', text);
    chat.busy = true; $('#chat-send').disabled = true;
    var typing = document.createElement('div'); typing.className = 'msg bot';
    typing.innerHTML = '<span class="av">' + PULSE_MARK + '</span><div class="txt"><span class="typing" aria-label="Typing"><i></i><i></i><i></i></span></div>';
    msgsEl().appendChild(typing); scrollDown();
    setTimeout(function () {
      typing.remove();
      if (CRISIS.test(text)) addCrisis(); else addMsg('bot', pickQuestion(text));
      chat.busy = false; $('#chat-send').disabled = false; $('#chat-in').focus();
    }, 700 + Math.random() * 600);
  }
  RENDER.journal = function () { if (!msgsEl().children.length) startChat(); };

  /* ---------- routing ---------- */
  var current = 'overview';
  function closeDrawer() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; $('#menu-btn').setAttribute('aria-expanded', 'false'); }
  function show(id) {
    if (!LABEL[id]) id = 'overview';
    current = id;
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + id; });
    $$('.side-link[data-id]').forEach(function (a) { if (a.dataset.id === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.title = 'Pulse – ' + LABEL[id];
    closeDrawer();
    RENDER[id]();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', function () { show(location.hash.slice(1)); });

  $('#menu-btn').addEventListener('click', function () {
    var open = !$('#sidebar').classList.contains('open');
    $('#sidebar').classList.toggle('open', open); $('#scrim').hidden = !open; this.setAttribute('aria-expanded', String(open));
  });
  $('#scrim').addEventListener('click', closeDrawer);
  var profile = $('#profile');
  document.addEventListener('click', function (e) { if (!profile.contains(e.target)) profile.open = false; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { profile.open = false; closeDrawer(); } });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (!(current === 'journal')) RENDER[current](); }, 150); });

  /* ---------- interactions: each change is saved to the server, then the page reloads its data ---------- */
  function saved(sel, text) { return function () { return refresh().then(function () { if (sel) setMsg(sel, text); }); }; }
  function failed(sel) { return function (e) { setMsg(sel, e.message, true); }; }

  $$('.seg[data-for]').forEach(function (seg) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      state.ranges[seg.dataset.for] = Number(b.dataset.days);
      Array.prototype.forEach.call(seg.querySelectorAll('button'), function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      RENDER[current]();
    });
  });

  $('#sleep-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var bed = $('#bed').value, wake = $('#wake').value;
    if (!bed || !wake) return setMsg('#sleep-msg', 'Add both times.', true);
    P.post('/api/tracker/sleep', { bed: bed, wake: wake }).then(function (r) {
      return refresh().then(function () { setMsg('#sleep-msg', 'Saved: ' + fmtDur(r.sleep_min) + ' of sleep.'); });
    }, failed('#sleep-msg'));
  });

  $('#hide-weight').addEventListener('change', function () {
    state.hideWeight = this.checked; state.ui.hide_numbers = this.checked; RENDER.weight();
    P.put('/api/settings/ui', { hide_numbers: state.ui.hide_numbers, show_bmi: state.ui.show_bmi }).catch(function () {});
  });
  $('#weight-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var kg = parseFloat($('#w-kg').value), cm = parseFloat($('#w-waist').value), body = {}, did = [];
    if (isNaN(kg) && isNaN(cm)) return setMsg('#weight-msg', 'Enter a weight or a waist measurement.', true);
    if (!isNaN(kg)) { body.kg = kg; did.push('weight'); }
    if (!isNaN(cm)) { body.waist = cm; did.push('waist'); }
    P.post('/api/tracker/weight', body).then(function () { $('#w-kg').value = ''; $('#w-waist').value = ''; return saved('#weight-msg', 'Saved ' + did.join(' and ') + '.')(); }, failed('#weight-msg'));
  });

  $('#wo-types').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.woType = b.dataset.t;
    Array.prototype.forEach.call(this.querySelectorAll('button'), function (o) { o.setAttribute('aria-pressed', String(o === b)); });
  });
  $('#wo-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var min = parseInt($('#wo-min').value, 10);
    if (!state.woType) return setMsg('#wo-msg', 'Pick a workout type.', true);
    if (!(min >= 1 && min <= 600)) return setMsg('#wo-msg', 'Enter minutes between 1 and 600.', true);
    P.post('/api/tracker/workouts', { type: state.woType, minutes: min }).then(function () { $('#wo-min').value = ''; state.woType = null; return saved('#wo-msg', 'Workout added.')(); }, failed('#wo-msg'));
  });
  $('#wo-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]'); if (!b) return;
    P.del('/api/tracker/workouts/' + b.dataset.del).then(saved(), failed('#wo-msg'));
  });

  $('#cal-prev').addEventListener('click', function () { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1); RENDER.cycle(); });
  $('#cal-next').addEventListener('click', function () { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1); RENDER.cycle(); });
  $('#cal').addEventListener('click', function (e) {
    var b = e.target.closest('.day[data-k]'); if (!b || b.disabled) return;
    state.selDate = state.selDate === b.dataset.k ? null : b.dataset.k; RENDER.cycle();
  });
  $('#ds-chips').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !state.selDate) return;
    P.put('/api/tracker/period', { date: state.selDate, flow: b.dataset.flow }).then(saved(), function (er) { setMsg('#cycle-msg', er.message, true); });
  });
  $('#log-today').addEventListener('click', function () {
    state.calMonth = new Date(today.getFullYear(), today.getMonth(), 1); state.selDate = key(today); RENDER.cycle();
    $('#day-sheet').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  $('#sym-chips').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var s = b.dataset.s; state.symDirty = true; if (state.symSel[s]) delete state.symSel[s]; else state.symSel[s] = 1; b.setAttribute('aria-pressed', String(!!state.symSel[s])); });
  $('#tag-chips').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var s = b.dataset.t; state.symDirty = true; if (state.tagSel[s]) delete state.tagSel[s]; else state.tagSel[s] = 1; b.setAttribute('aria-pressed', String(!!state.tagSel[s])); });
  $('#sym-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var syms = Object.keys(state.symSel), tags = Object.keys(state.tagSel);
    if (!syms.length && !tags.length) return setMsg('#sym-msg', 'Pick at least one symptom or tag.', true);
    P.put('/api/tracker/symptoms', { symptoms: syms, tags: tags }).then(function () { state.symDirty = false; return saved('#sym-msg', 'Saved for today.')(); }, failed('#sym-msg'));
  });

  $('#meal-src').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return; state.mealSrc = b.dataset.src;
    Array.prototype.forEach.call(this.querySelectorAll('button'), function (o) { o.setAttribute('aria-pressed', String(o === b)); });
  });
  $('#meal-quick').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return; var inp = $('#meal-text');
    inp.value = inp.value ? inp.value.replace(/[,\s]+$/, '') + ', ' + b.dataset.q.toLowerCase() : b.dataset.q; inp.focus();
  });
  $('#meal-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var time = $('#meal-time').value, text = $('#meal-text').value.trim();
    if (!time) return setMsg('#meal-msg', 'Add the time.', true);
    if (!state.mealSrc) return setMsg('#meal-msg', 'Pick where it came from.', true);
    if (!text && state.mealSrc !== 'Skipped') return setMsg('#meal-msg', 'Add what you ate, or pick Skipped.', true);
    P.post('/api/tracker/meals', { type: $('#meal-type').value, time: time, source: state.mealSrc, text: text })
      .then(function () { $('#meal-text').value = ''; state.mealSrc = null; return saved('#meal-msg', 'Meal added.')(); }, failed('#meal-msg'));
  });
  $('#meal-list').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (!b) return; P.del('/api/tracker/meals/' + b.dataset.del).then(saved(), failed('#meal-msg')); });

  $('#med-list').addEventListener('click', function (e) {
    var d = e.target.closest('[data-del]'); if (d) return P.del('/api/tracker/meds/' + d.dataset.del).then(saved(), failed('#med-msg'));
    var b = e.target.closest('[data-med]'); if (!b) return;
    var m = state.meds[+b.dataset.med];
    P.put('/api/tracker/meds/' + m.id + '/log', { status: m.today === b.dataset.v ? null : b.dataset.v }).then(saved(), failed('#med-msg'));
  });
  $('#med-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#med-name').value.trim(), dose = $('#med-dose').value.trim();
    if (!name) return setMsg('#med-msg', 'Add the name as it is written on your prescription.', true);
    P.post('/api/tracker/meds', { name: name, dose: dose }).then(function () { $('#med-name').value = ''; $('#med-dose').value = ''; return saved('#med-msg', 'Added.')(); }, failed('#med-msg'));
  });

  $('#stress-chips').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return; var v = +b.dataset.s;
    P.put('/api/tracker/stress', { value: v }).then(function () {
      state.stress = v;
      Array.prototype.forEach.call($('#stress-chips').querySelectorAll('button'), function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      var msg = $('#stress-msg'); msg.className = 'msg-line';
      msg.innerHTML = v >= 4
        ? 'Logged: ' + STRESS[v - 1] + '. That sounds like a lot. If you would like to talk to someone, <a href="tel:14416"><strong>Tele-MANAS 14416</strong></a> is free and open 24×7.'
        : 'Logged: ' + STRESS[v - 1] + '. Thanks for telling us.';
    }, failed('#stress-msg'));
  });
  $('#q-list').addEventListener('click', function (e) { var b = e.target.closest('[data-q]'); if (!b) return; run = { key: b.dataset.q, i: 0, answers: [] }; RENDER.stress(); window.scrollTo(0, 0); });
  $('#q-run').addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('#q-cancel')) { run = null; return RENDER.stress(); }
    if (t.closest('#q-done')) { run = null; return refresh(); }
    if (t.closest('#q-back')) { run.i--; return renderRun(); }
    var o = t.closest('.opt'); if (!o || run.saving) return;
    var n = QS[run.key].items.length;
    run.answers[run.i] = +o.dataset.a;
    if (run.i < n - 1) { run.i++; renderRun(); window.scrollTo(0, 0); return; }
    run.saving = true;   // last answer: save it, then show the score the server worked out
    P.post('/api/questionnaires', { kind: run.key, answers: run.answers }).then(function (r) {
      run.saving = false; run.i = n; run.score = r.score; run.safety = r.safety; renderRun(); window.scrollTo(0, 0);
    }, function (er) { run.saving = false; setMsg('#q-msg', er.message, true); });
  });

  $('#chat-form').addEventListener('submit', function (e) {
    e.preventDefault(); var ta = $('#chat-in'), v = ta.value; if (!v.trim() || chat.busy) return;
    ta.value = ''; ta.style.height = 'auto'; send(v);
  });
  $('#chat-in').addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 150) + 'px'; });
  $('#chat-in').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); $('#chat-form').requestSubmit(); }
  });
  $('#msgs').addEventListener('click', function (e) { var b = e.target.closest('[data-start]'); if (b) send(b.dataset.start); });
  $('#new-chat').addEventListener('click', startChat);

  Promise.all([P.get('/api/tracker'), P.get('/api/me')]).then(function (r) {
    ingest(r[0]); P.applyUser(r[1].user);
    show(location.hash.slice(1));
  }, function (e) { $('#main').innerHTML = '<div class="card"><p class="empty">' + esc(e.message) + '</p></div>'; });
})();
