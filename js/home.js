/* Pulse home: Health Factor charts, the 30-day check-in calendar and today's check-in, all from the local server. */
(function () {
  'use strict';
  var P = window.Pulse, esc = P.esc;
  var $ = function (s) { return document.querySelector(s); };

  var profile = $('#profile');
  document.addEventListener('click', function (e) { if (!profile.contains(e.target)) profile.open = false; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') profile.open = false; });

  var state = { hf: null, checkins: [], mood: 0, today: { mood: null, note: null } };

  /* ---------- Health Factor charts ---------- */
  function ago(idx, n) { var d = n - 1 - idx; return d === 0 ? 'Today' : d + (d === 1 ? ' day ago' : ' days ago'); }
  var CHARTS = [
    { id: '21', n: 21, span: '3 weeks', ticks: [[0, '3 weeks ago'], [10, '10 days ago'], [20, 'Today']] },
    { id: '90', n: 90, span: '90 days', ticks: [[0, '90 days ago'], [45, '45 days ago'], [89, 'Today']] }
  ];

  function drawChart(c) {
    var svg = $('#chart-' + c.id), chg = $('#chg-' + c.id), empty = $('#empty-' + c.id), n = c.n;
    var vals = state.hf['series' + c.id], have = vals.filter(function (v) { return v != null; });
    if (have.length < 2) {
      svg.setAttribute('hidden', ''); empty.hidden = false; chg.textContent = '';
      return;
    }
    svg.removeAttribute('hidden'); empty.hidden = true;
    var PL = 34, PR = 14, PT = 14, PB = 30;
    var W = Math.max(260, Math.round(svg.getBoundingClientRect().width) || 640);
    var H = Math.max(170, Math.min(220, Math.round(W * 0.45)));
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var min = Math.min.apply(null, have), max = Math.max.apply(null, have);
    var step = (max - min) > 18 ? 10 : 5;
    var lo = Math.floor((min - 2) / step) * step, hi = Math.ceil((max + 2) / step) * step;
    var px = function (k) { return PL + k * (W - PL - PR) / (n - 1); };
    var py = function (v) { return PT + (hi - v) * (H - PT - PB) / (hi - lo); };

    var out = '<defs><linearGradient id="hfFill-' + n + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2563eb" stop-opacity=".22"/><stop offset="1" stop-color="#2563eb" stop-opacity="0"/></linearGradient></defs>';
    for (var v = lo; v <= hi; v += step) {
      out += '<line class="grid" x1="' + PL + '" x2="' + (W - PR) + '" y1="' + py(v) + '" y2="' + py(v) + '"/><text x="' + (PL - 8) + '" y="' + (py(v) + 4) + '" text-anchor="end">' + v + '</text>';
    }
    // draw each unbroken run of days separately so gaps stay gaps
    var runs = [], cur = [];
    vals.forEach(function (val, k) { if (val == null) { if (cur.length) runs.push(cur); cur = []; } else cur.push(k); });
    if (cur.length) runs.push(cur);
    runs.forEach(function (run) {
      var line = run.map(function (k, j) { return (j ? 'L' : 'M') + px(k).toFixed(1) + ' ' + py(vals[k]).toFixed(1); }).join(' ');
      if (run.length > 1) out += '<path d="' + line + ' L' + px(run[run.length - 1]).toFixed(1) + ' ' + (H - PB) + ' L' + px(run[0]).toFixed(1) + ' ' + (H - PB) + ' Z" fill="url(#hfFill-' + n + ')"/>';
      out += '<path class="line" d="' + line + '"/>';
    });
    c.ticks.forEach(function (tk, k) {
      out += '<text x="' + px(tk[0]).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + (k === 0 ? 'start' : k === c.ticks.length - 1 ? 'end' : 'middle') + '">' + tk[1] + '</text>';
    });
    var lastK = vals.length - 1; while (vals[lastK] == null) lastK--;
    out += '<circle class="dot" cx="' + px(lastK).toFixed(1) + '" cy="' + py(vals[lastK]).toFixed(1) + '" r="5"/>';
    out += '<g class="hov" hidden><line class="hover-line" y1="' + PT + '" y2="' + (H - PB) + '"/><circle class="dot" r="5"/><g class="tip"><rect class="tip-bg" rx="7" height="26"/><text class="tip-text" y="17" text-anchor="middle"></text></g></g>';
    out += '<rect class="hit" x="' + PL + '" y="0" width="' + (W - PL - PR) + '" height="' + H + '" fill="transparent"/>';
    svg.innerHTML = out;

    var firstV = have[0], lastV = have[have.length - 1], diff = lastV - firstV;
    chg.textContent = diff === 0 ? 'No change over the last ' + c.span : (diff > 0 ? '+' : '') + diff + ' over the last ' + c.span;
    chg.classList.toggle('down', diff < 0);
    svg.setAttribute('aria-label', 'Health Factor over the last ' + c.span + ': from ' + firstV + ' to ' + lastV + ' out of 100.');

    var hit = svg.querySelector('.hit'), g = svg.querySelector('.hov'), hl = g.querySelector('.hover-line'), dot = g.querySelector('circle');
    var bg = g.querySelector('.tip rect'), tx = g.querySelector('.tip text');
    function show(e) {
      var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
      var k = Math.max(0, Math.min(n - 1, Math.round((x - PL) / (W - PL - PR) * (n - 1))));
      var best = null; for (var d = 0; d < n; d++) { var a = k - d, b = k + d; if (a >= 0 && vals[a] != null) { best = a; break; } if (b < n && vals[b] != null) { best = b; break; } }
      if (best == null) return;
      g.removeAttribute('hidden');
      hl.setAttribute('x1', px(best)); hl.setAttribute('x2', px(best)); dot.setAttribute('cx', px(best)); dot.setAttribute('cy', py(vals[best]));
      tx.textContent = vals[best] + ' · ' + ago(best, n);
      var w = tx.getComputedTextLength() + 20, left = Math.max(PL, Math.min(W - PR - w, px(best) - w / 2)), top = Math.max(2, py(vals[best]) - 40);
      bg.setAttribute('x', left); bg.setAttribute('y', top); bg.setAttribute('width', w); tx.setAttribute('x', left + w / 2); tx.setAttribute('y', top + 17);
    }
    hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', function () { g.setAttribute('hidden', ''); });
  }
  function renderCharts() { if (state.hf) CHARTS.forEach(drawChart); }
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(renderCharts, 150); });

  /* ---------- 30-day check-in calendar ---------- */
  function renderLog() {
    var t = P.todayDate(), start = P.addDays(t, -29);
    var out = 'SMTWTFS'.split('').map(function (d) { return '<span class="dow" aria-hidden="true">' + d + '</span>'; }).join('');
    for (var b = 0; b < start.getDay(); b++) out += '<span class="log-cell blank" aria-hidden="true"></span>';
    var n = 0;
    for (var k = 0; k < 30; k++) {
      var d = P.addDays(start, k), on = !!state.checkins[k]; if (on) n++;
      out += '<span class="log-cell' + (on ? ' on' : '') + (k === 29 ? ' today' : '') + '" title="' + P.fmtDate(d) + (k === 29 ? ' (today)' : '') + ': ' + (on ? 'checked in' : 'no check-in') + '">' + d.getDate() + '</span>';
    }
    $('#log-grid').innerHTML = out;
    $('#log-count').textContent = n + ' of 30 days';
  }

  /* ---------- today's check-in ---------- */
  var moods = document.querySelectorAll('.mood'), form = $('#say'), ta = $('#day-text'), note = $('#note'), recap = $('#recap'), support = $('#support');
  function selectMood(v) { state.mood = v; moods.forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.dataset.value) === v)); }); }
  moods.forEach(function (btn) { btn.addEventListener('click', function () { selectMood(Number(btn.dataset.value)); }); });
  function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; }
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); } });

  function say(text, isErr) { note.hidden = false; note.className = 'note' + (isErr ? ' err' : ''); note.textContent = text; }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = ta.value.trim();
    if (!state.mood && !text) return say('Pick how you feel or write a few words.', true);
    var send = $('#say .send'); send.disabled = true;
    P.post('/api/checkins', { mood: state.mood || undefined, note: text || undefined }).then(function (r) {
      send.disabled = false;
      say('Logged for today. Thanks for checking in.');
      state.checkins = r.checkins; renderLog();
      recap.hidden = !text; recap.textContent = text ? 'You wrote: ' + text : '';
      support.hidden = !r.support;
      ta.value = ''; grow();
      P.get('/api/home').then(function (h) { state.hf = h.hf; $('#hf-big').textContent = h.hf.now == null ? '–' : h.hf.now; renderCharts(); });
    }, function (err) {
      send.disabled = false;
      say(err.code === 'consent_required' ? 'You haven\'t agreed to share mood data. You can turn that on in your profile, under Consents.' : err.message, true);
    });
  });

  /* ---------- load ---------- */
  P.get('/api/home').then(function (h) {
    P.applyUser(h.user);
    state.hf = h.hf; state.checkins = h.checkins; state.today = h.today;
    $('#hf-big').textContent = h.hf.now == null ? '–' : h.hf.now;
    renderCharts(); renderLog();
    if (h.today.mood) selectMood(h.today.mood);
    if (h.today.note) { recap.hidden = false; recap.textContent = 'Today\'s note: ' + h.today.note; }
  }, function (e) { $('#hf-big').textContent = '–'; say(e.message, true); });
})();
