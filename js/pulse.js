/* Pulse: shared front-end helpers. Talks to the local server; holds no data of its own. */
(function () {
  'use strict';
  var P = window.Pulse = {};

  /* ---------- API ---------- */
  // Resolves with the JSON body (or null for 204). Rejects with an Error that has .status, .field and .code.
  P.api = function (method, path, body, extra) {
    var init = { method: method, credentials: 'same-origin', headers: { 'X-Requested-With': 'pulse' } };
    if (extra && extra.raw !== undefined) {
      init.body = extra.raw;
      Object.keys(extra.headers || {}).forEach(function (k) { init.headers[k] = extra.headers[k]; });
    } else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(path, init).then(function (res) {
      if (res.status === 204) return null;
      var json = (res.headers.get('Content-Type') || '').indexOf('application/json') >= 0;
      return (json ? res.json() : res.blob()).then(function (data) {
        if (res.ok) return data;
        var info = (data && data.error) || {};
        var err = new Error(info.message || 'Something went wrong. Please try again.');
        err.status = res.status; err.field = info.field || null; err.code = info.code || null;
        if (res.status === 401 && !(extra && extra.noRedirect) && !P.publicPage) window.location.href = '/index.html';
        throw err;
      });
    }, function () {
      var err = new Error('Could not reach the Pulse server. Is it still running?');
      err.status = 0;
      throw err;
    });
  };
  P.get = function (path) { return P.api('GET', path); };
  P.post = function (path, body) { return P.api('POST', path, body === undefined ? {} : body); };
  P.put = function (path, body) { return P.api('PUT', path, body === undefined ? {} : body); };
  P.patch = function (path, body) { return P.api('PATCH', path, body); };
  P.del = function (path) { return P.api('DELETE', path); };

  P.upload = function (kind, file) {
    return P.api('POST', '/api/files?kind=' + kind, undefined, {
      raw: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }
    });
  };

  /* ---------- small helpers ---------- */
  P.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  P.pad = function (n) { return (n < 10 ? '0' : '') + n; };
  P.keyOf = function (d) { return d.getFullYear() + '-' + P.pad(d.getMonth() + 1) + '-' + P.pad(d.getDate()); };
  P.parseKey = function (k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  P.todayDate = function () { var t = new Date(); t.setHours(0, 0, 0, 0); return t; };
  P.addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  P.daysBetween = function (a, b) { return Math.round((b - a) / 864e5); };
  P.fmtDate = function (d) { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
  P.fmtDateY = function (d) { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
  P.fmtLong = function (d) { return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }); };
  P.fmtMin = function (m) { var h = Math.floor(m / 60); return ((h % 12) || 12) + ':' + P.pad(m % 60) + ' ' + (h >= 12 ? 'PM' : 'AM'); };
  P.rel = function (iso) { // "today", "yesterday", "5 days ago" or a date
    var d = new Date(String(iso).replace(' ', 'T')); d.setHours(0, 0, 0, 0);
    var n = P.daysBetween(d, P.todayDate());
    return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 30 ? n + ' days ago' : P.fmtDate(d);
  };

  /* ---------- the signed-in person, shown in every page header ---------- */
  P.applyUser = function (u) {
    P.user = u;
    document.querySelectorAll('.profile .avatar').forEach(function (a) {
      if (u.photo) a.innerHTML = '<img src="' + P.esc(u.photo) + '" alt="">'; else a.textContent = u.initials;
    });
    var n = document.querySelector('.profile .pname'); if (n) n.textContent = u.preferred_name;
    var w = document.querySelector('.profile-menu .who strong'); if (w) w.textContent = u.first_name + ' ' + u.last_name.charAt(0) + '.';
  };

  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-signout]');
    if (!a) return;
    e.preventDefault();
    var go = function () { window.location.href = '/index.html'; };
    P.api('POST', '/api/auth/logout', {}, { noRedirect: true }).then(go, go);
  });

  P.CONSENT_TEXT = {
    terms: ['I understand Pulse does not diagnose or prescribe', 'Pulse can inform, track and help you prepare for a visit. It cannot replace a doctor, and it never changes your treatment.', true],
    health_basics: ['My body measurements and health background', 'Height, weight, conditions and similar details. Used to personalise your tracking and, only if you choose, shared with your doctor.', true],
    mental_health: ['My mood, stress and questionnaire answers', 'Mental-health data is among the most sensitive there is. Used for your daily check-ins, your starting scores and your Health Factor.', false],
    cycle_symptoms: ['My periods and symptoms', 'Used to show your cycle history and what moves with it.', false],
    wearable: ['My sleep, activity and heart data', 'From a watch or typed in by you. Used for your trends and patterns.', false],
    meals_meds: ['My meals and medicines', 'Used to show eating patterns and keep a record for your doctor. Pulse never suggests medicines.', false],
    ai_journal: ['Journal chat with AI', 'What you type in the Journal is sent to Claude, an AI model made by Anthropic, so it can ask you questions. Pulse does not save the chat. It keeps only a wellbeing score from it.', false]
  };

  /* ---------- PHQ-9 and GAD-7 (standard public-domain wording) ---------- */
  P.FREQ = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'];
  P.QUESTIONNAIRES = {
    phq9: { name: 'PHQ-9', max: 27, items: [
      'Little interest or pleasure in doing things', 'Feeling down, depressed, or hopeless', 'Trouble falling or staying asleep, or sleeping too much',
      'Feeling tired or having little energy', 'Poor appetite or overeating', 'Feeling bad about yourself, or that you are a failure or have let yourself or your family down',
      'Trouble concentrating on things, such as reading or watching TV', 'Moving or speaking so slowly that other people noticed, or being so restless that you move around a lot more than usual',
      'Thoughts that you would be better off dead, or of hurting yourself in some way'] },
    gad7: { name: 'GAD-7', max: 21, items: [
      'Feeling nervous, anxious, or on edge', 'Not being able to stop or control worrying', 'Worrying too much about different things', 'Trouble relaxing',
      'Being so restless that it is hard to sit still', 'Becoming easily annoyed or irritable', 'Feeling afraid, as if something awful might happen'] }
  };
})();
