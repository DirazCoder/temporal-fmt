(function () {
  var root = document.documentElement;
  var themeBtn = document.getElementById('theme');
  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function paintToggle() {
    var dark = root.dataset.theme !== 'light';
    themeBtn.innerHTML = dark ? SUN : MOON;
    themeBtn.dataset.tip = dark ? 'If you like being flashbanged, turn this on.' : 'If you don’t like being flashbanged, turn me back to dark.';
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
  themeBtn.addEventListener('click', function () {
    var next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('tfmt-theme', next); } catch (e) { /* private mode, the choice just won't stick */ }
    paintToggle();
  });
  paintToggle();

  var readmeDialog = document.getElementById('readme-dialog');
  var readmeContent = readmeDialog.querySelector('.readme-content');
  document.getElementById('readme-open').addEventListener('click', function () {
    readmeDialog.showModal();
    scheduleCopyButtonPosition();
  });
  document.getElementById('readme-close').addEventListener('click', function () {
    readmeDialog.close();
  });
  readmeDialog.addEventListener('click', function (e) {
    if (e.target === readmeDialog) readmeDialog.close();
  });

  var whatsNewDialog = document.getElementById('whats-new-dialog');
  document.getElementById('whats-new').addEventListener('click', function () {
    whatsNewDialog.showModal();
  });
  document.getElementById('whats-new-close').addEventListener('click', function () {
    whatsNewDialog.close();
  });
  whatsNewDialog.addEventListener('click', function (e) {
    if (e.target === whatsNewDialog) whatsNewDialog.close();
  });

  var secs = Array.prototype.slice.call(document.querySelectorAll('main > section'));
  var nav = document.getElementById('nav');
  var q = document.getElementById('q');
  var empty = document.getElementById('empty');
  var links = [];
  var group = '';

  secs.forEach(function (s) {
    if (s.dataset.group !== group) {
      group = s.dataset.group;
      var h = document.createElement('h3');
      h.textContent = group;
      nav.appendChild(h);
    }
    var a = document.createElement('a');
    a.href = '#' + s.id;
    a.textContent = s.dataset.title;
    nav.appendChild(a);
    links.push(a);
    s.text = s.textContent.toLowerCase();
  });

  var copyButtons = [];
  document.querySelectorAll('pre').forEach(function (pre) {
    var b = document.createElement('button');
    b.className = 'copy';
    b.type = 'button';
    b.setAttribute('aria-label', 'Copy code');
    b.title = 'Copy code';
    var icon = document.createElement('img');
    icon.src = 'copyablething.svg';
    icon.alt = '';
    b.appendChild(icon);
    b.onclick = function () {
      var done = function () {
        icon.src = 'tickthing.svg';
        b.setAttribute('aria-label', 'Copied');
        b.title = 'Copied';
        setTimeout(function () {
          icon.src = 'copyablething.svg';
          b.setAttribute('aria-label', 'Copy code');
          b.title = 'Copy code';
        }, 1200);
      };
      var failed = function () {
        icon.src = 'copyablething.svg';
        b.setAttribute('aria-label', 'Copy failed; press Ctrl+C');
        b.title = 'Copy failed; press Ctrl+C';
      };
      try {
        navigator.clipboard.writeText(pre.querySelector('code').textContent).then(done, failed);
      } catch (e) { failed(); }
    };
    pre.appendChild(b);
    copyButtons.push({
      pre: pre,
      button: b,
      scrollContainer: readmeContent.contains(pre) ? readmeContent : null
    });
  });

  function positionCopyButtons() {
    copyButtons.forEach(function (item) {
      var box = item.pre.getBoundingClientRect();
      var viewport = item.scrollContainer
        ? item.scrollContainer.getBoundingClientRect()
        : { top: 0, right: window.innerWidth, bottom: window.innerHeight, left: 0 };
      var button = item.button;
      var width = button.offsetWidth;
      var height = button.offsetHeight;
      var visible = box.bottom > viewport.top && box.top < viewport.bottom &&
        box.right > viewport.left && box.left < viewport.right;
      var top = Math.min(Math.max(box.top + 8, viewport.top + 8), box.bottom - height - 8);
      var left = Math.max(viewport.left + 8, Math.min(box.right - width - 8, viewport.right - width - 8));
      button.style.top = top + 'px';
      button.style.left = left + 'px';
      button.style.visibility = visible ? '' : 'hidden';
    });
  }

  var copyPositionFrame = 0;
  function scheduleCopyButtonPosition() {
    if (copyPositionFrame) return;
    copyPositionFrame = window.requestAnimationFrame(function () {
      copyPositionFrame = 0;
      positionCopyButtons();
    });
  }
  window.addEventListener('scroll', scheduleCopyButtonPosition, { passive: true });
  window.addEventListener('resize', scheduleCopyButtonPosition);
  readmeContent.addEventListener('scroll', scheduleCopyButtonPosition, { passive: true });
  positionCopyButtons();

  function filter() {
    var words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    var shown = 0;
    secs.forEach(function (s, i) {
      var hit = words.every(function (w) { return s.text.indexOf(w) > -1; });
      s.hidden = !hit;
      links[i].hidden = !hit;
      if (hit) shown++;
    });
    nav.querySelectorAll('h3').forEach(function (h) {
      var n = h.nextElementSibling, any = false;
      while (n && n.tagName === 'A') { if (!n.hidden) any = true; n = n.nextElementSibling; }
      h.hidden = !any;
    });
    empty.style.display = shown ? 'none' : 'block';
  }
  q.addEventListener('input', filter);

  document.addEventListener('keydown', function (e) {
    var typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); q.focus(); }
    if (e.key === 'Escape' && document.activeElement === q) { q.value = ''; filter(); q.blur(); }
  });

  var PKG = 'temporal-fmt';
  var live = document.getElementById('live');
  var relBody = document.getElementById('rel');

  var CDN = 'https://cdn.jsdelivr.net/npm/';
  var POLYFILL = 'temporal-polyfill@1.0.8';
  var libVersion = '';
  var libStarted = false;
  var libDone, libFailed;
  var libReady = new Promise(function (ok, no) { libDone = ok; libFailed = no; });

  function startLib(version) {
    if (libStarted) return;
    libStarted = true;

    if (version && !/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(String(version))) {
      console.warn('[temporal-fmt site] ignoring non-semver version from registry:', version);
      version = '';
    }
    libVersion = typeof version === 'string' ? version.slice(0, 64) : '';
    var needPolyfill = !window.Temporal;
    Promise.all([
      import(CDN + 'temporal-fmt' + (libVersion ? '@' + libVersion : '') + '/+esm'),
      needPolyfill ? import(CDN + POLYFILL + '/+esm') : null
    ]).then(function (mods) {
      var T = needPolyfill ? mods[1].Temporal : window.Temporal;
      mods[0].setTemporal(T);
      libDone({ lib: mods[0], T: T });
    }, libFailed);
  }

  function useLibForDates(api) {
    document.querySelectorAll('[data-iso]').forEach(function (el) {
      var when = api.T.Instant.from(el.dataset.iso).toZonedDateTimeISO(api.T.Now.timeZoneId());
      el.textContent = api.lib.formatDistanceToNow(when, { numeric: 'always' });
      el.title = api.lib.format(when, "MMM d, yyyy 'at' h:mm a z");
    });
    if (live.classList.contains('on')) stat('Dates by', 'temporal-fmt itself');
  }

  function setupPlayground(api) {
    var input = document.getElementById('play-command-input');
    var loc = document.getElementById('play-loc');
    var form = document.getElementById('play-form');
    var runButton = document.getElementById('play-run');
    var output = document.getElementById('play-output');
    var status = document.getElementById('play-status');
    var chips = document.querySelectorAll('.chips button');
    var history = [];
    var historyIndex = 0;

    function why(err) { return err.name + ': ' + String(err.message).replace(/^temporal-fmt: /, ''); }

    function print(text, className) {
      var line = document.createElement('div');
      line.className = className;
      line.textContent = text;
      output.appendChild(line);
      output.scrollTop = output.scrollHeight;
    }

    function stringifyResult(value) {
      if (value === undefined) return 'undefined';
      if (typeof value === 'string') return value;
      if (typeof value === 'function') return '[Function ' + (value.name || 'anonymous') + ']';
      if (api.lib.isTemporal(value)) return value.toString();
      var result = JSON.stringify(value, function (key, item) {
        return typeof item === 'bigint' ? String(item) + 'n' : item;
      }, 2);
      return result === undefined ? String(value) : result;
    }

    function run(expression) {
      expression = (expression || input.value).trim();
      if (!expression) return;
      history.push(expression);
      historyIndex = history.length;
      print(expression, 'play-entry-command');
      input.value = '';
      if (expression === 'clear') {
        output.textContent = '';
        return;
      }
      if (expression === 'help') {
        print([
          'Use any exported temporal-fmt function or the Temporal API.',
          'Available values: now, today, yesterday, tomorrow, locale, Temporal, lib.',
          '',
          "format(now, 'EEEE, MMMM d, yyyy', { locale })",
          "parse('yyyy-MM-dd', '2026-08-04')",
          "formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale })",
          'formatDistance(yesterday, today, { locale })',
          "add(now, 3, 'days')",
          "formatRange(interval(Temporal.PlainDate.from('2026-08-04'), Temporal.PlainDate.from('2026-08-06')), 'MMM d')",
          "analyzeFormat('yyyy-MM-dd')",
          '',
          'Expressions only: no statements, browser globals, or page access.'
        ].join('\n'), 'play-entry-result');
        return;
      }
      try {
        var now = api.T.Now.zonedDateTimeISO();
        var today = now.toPlainDate();
        var result = globalThis.TemporalFmtTerminal.evaluateLibraryExpression(expression, api.lib, api.T, {
          now: now,
          today: today,
          yesterday: today.subtract({ days: 1 }),
          tomorrow: today.add({ days: 1 }),
          locale: loc.value
        });
        print(stringifyResult(result), 'play-entry-result');
      } catch (err) {
        print(why(err), 'play-entry-result play-entry-error');
      }
    }

    input.disabled = loc.disabled = runButton.disabled = false;
    chips.forEach(function (chip) {
      chip.disabled = false;
      chip.addEventListener('click', function () {
        input.value = chip.dataset.expression;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' && history.length) {
        e.preventDefault();
        historyIndex = Math.max(0, historyIndex - 1);
        input.value = history[historyIndex];
      } else if (e.key === 'ArrowDown' && history.length) {
        e.preventDefault();
        historyIndex = Math.min(history.length, historyIndex + 1);
        input.value = historyIndex === history.length ? '' : history[historyIndex];
      }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      run();
    });
    output.textContent = '';
    print('connected to temporal-fmt. type help or try an example below.', 'play-entry-message');
    status.textContent = 'Running temporal-fmt' + (libVersion ? ' v' + libVersion : '') + ' from jsDelivr' + (window.Temporal ? ', native Temporal.' : ', with a Temporal polyfill.');
    status.textContent += ' The runner exposes library expressions only, not the page or browser globals.';
  }

  libReady.then(useLibForDates, function () {});
  libReady.then(setupPlayground, function () {
    document.getElementById('play-output').textContent = 'Couldn’t load temporal-fmt from jsDelivr. Everything else on the page still works.';
  });

  function ago(iso) {
    var secs = (Date.parse(iso) - Date.now()) / 1000;
    var fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    var steps = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (var i = 0; i < steps.length; i++) {
      if (Math.abs(secs) >= steps[i][1]) return fmt.format(Math.round(secs / steps[i][1]), steps[i][0]);
    }
    return 'just now';
  }

  function size(bytes) {
    return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
  }

  function stat(label, value) {
    var box = document.createElement('div');
    var dt = document.createElement('dt');
    var dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    box.appendChild(dt);
    box.appendChild(dd);
    live.appendChild(box);
    return dd;
  }

  function fromCache(key) {
    try { return JSON.parse(sessionStorage.getItem(key)); } catch (e) { return null; }
  }

  function toCache(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage can be blocked, fine */ }
  }

  function getJSON(url, key) {
    var hit = fromCache(key);
    if (hit) return Promise.resolve(hit);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (data) { toCache(key, data); return data; });
  }

  getJSON('https://registry.npmjs.org/' + PKG, 'tfmt:packument').then(function (doc) {
    var latest = doc && doc['dist-tags'] && doc['dist-tags'].latest;

    if (typeof latest !== 'string' || !/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(latest)) {
      latest = '';
    }
    startLib(latest);
    var info = (doc && doc.versions && doc.versions[latest]) || {};
    var tagOf = {};
    if (doc && doc['dist-tags']) {
      Object.keys(doc['dist-tags']).forEach(function (t) { tagOf[doc['dist-tags'][t]] = t; });
    }

    live.classList.add('on');
    stat('Latest', latest ? 'v' + latest : 'n/a');
    stat('Published', (doc && doc.time && doc.time[latest]) ? ago(doc.time[latest]) : 'n/a').dataset.iso = (doc && doc.time && doc.time[latest]) || '';
    stat('Unpacked', info.dist && info.dist.unpackedSize ? size(info.dist.unpackedSize) : 'n/a');
    stat('Versions', doc && doc.versions ? String(Object.keys(doc.versions).length) : 'n/a');
    var weekly = stat('Downloads / week', '…');

    getJSON('https://api.npmjs.org/downloads/point/last-week/' + PKG, 'tfmt:weekly').then(function (d) {
      weekly.textContent = d.downloads.toLocaleString('en-US');
    }).catch(function () { weekly.textContent = 'n/a'; });

    var recent = Object.keys(doc.versions).filter(function (v) { return doc.time[v]; })
      .sort(function (a, b) { return Date.parse(doc.time[b]) - Date.parse(doc.time[a]); })
      .slice(0, 10);
    relBody.textContent = '';
    recent.forEach(function (v) {
      var tr = document.createElement('tr');
      var name = document.createElement('td');
      var code = document.createElement('code');
      var when = document.createElement('td');
      code.textContent = v;
      name.appendChild(code);
      if (tagOf[v]) {
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = tagOf[v];
        name.appendChild(tag);
      }
      when.textContent = ago(doc.time[v]);
      when.dataset.iso = doc.time[v];
      tr.appendChild(name);
      tr.appendChild(when);
      relBody.appendChild(tr);
    });
  }).catch(function () {
    startLib(null);
    relBody.innerHTML = '<tr><td colspan="2">Couldn’t reach the npm registry. Check <a href="https://www.npmjs.com/package/temporal-fmt">npmjs.com</a> instead.</td></tr>';
  });

  document.getElementById('menu').onclick = function () { nav.classList.toggle('open'); };
  nav.addEventListener('click', function () { nav.classList.remove('open'); });

  function activateSection(index) {
    links.forEach(function (l, j) { l.classList.toggle('on', index === j); });
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var i = secs.indexOf(en.target);
        activateSection(i);
      });
    }, { rootMargin: '-10% 0px -80% 0px' });
    secs.forEach(function (s) { io.observe(s); });
  }

  function activateLastSectionAtBottom() {
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1) {
      activateSection(secs.length - 1);
    }
  }
  window.addEventListener('scroll', activateLastSectionAtBottom, { passive: true });
  activateLastSectionAtBottom();
})();