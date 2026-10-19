// Draws the page from the datasets and calcs. Runs on every data or width change.
(() => {
  const SR = window.SR;
  const {fmt, name} = SR;
  const $ = (id) => document.getElementById(id);
  // One chart failing shouldn't blank the rest; the error is still reported.
  const guard = (fn) => {
    try { fn(); } catch (err) { setTimeout(() => { throw err; }); }
  };
  let clipQuestion = 'state';
  let week = null;  // the week shown in single-week charts; the latest until someone picks another
  const km = {basis: 'Group call', endpoint: 'First movement', scope: 'All tanks'};
  const sorts = {
    'table-timing': {field: 'answered', dir: -1},
    'table-clips': {field: 'clip', dir: 1},
  };

  document.querySelectorAll('#clip-question button').forEach((b) => b.addEventListener('click', () => {
    clipQuestion = b.dataset.q;
    render();
  }));
  document.querySelectorAll('.sr-week-select').forEach((sel) => sel.addEventListener('change', () => {
    week = Number(sel.value);
    render();
  }));
  document.querySelectorAll('#km-endpoint button').forEach((b) => b.addEventListener('click', () => {
    km.endpoint = b.dataset.v;
    render();
  }));
  for (const [id, key] of [['km-basis', 'basis'], ['km-scope', 'scope']]) {
    $(id).addEventListener('change', () => {
      km[key] = $(id).value;
      render();
    });
  }

  // Fill every week picker from the data; keep the chosen week while it exists, else show the latest.
  function syncWeeks() {
    const d = dash.data('star_days');
    if (d.status !== 'ok') return;
    const weeks = [...new Set(d.data.map((r) => r.week))].sort((a, b) => a - b);
    const day = Object.fromEntries(d.data.map((r) => [r.week, r.round]));
    if (!weeks.includes(week)) week = weeks[weeks.length - 1] ?? null;
    document.querySelectorAll('.sr-week-select').forEach((sel) => {
      if (sel.options.length !== weeks.length) sel.replaceChildren(...weeks.map((w) => new Option(`Week ${w} · ${fmt.date(day[w])}`, String(w))));
      sel.value = String(week);
    });
  }
  const inWeek = (rows) => rows.filter((r) => Number(r.week) === week);
  function setOptions(sel, values, current) {
    if ([...sel.options].map((o) => o.value).join('|') !== values.join('|')) sel.replaceChildren(...values.map((v) => new Option(v, v)));
    sel.value = values.includes(current) ? current : values[0];
    return sel.value;
  }
  for (const id of Object.keys(sorts)) {
    $(id).querySelectorAll('th button').forEach((btn) => btn.addEventListener('click', () => {
      const th = btn.parentElement;
      const now = sorts[id];
      sorts[id] = {field: th.dataset.field, dir: now.field === th.dataset.field ? -now.dir : th.classList.contains('num') ? -1 : 1};
      render();
    }));
  }

  // Annotators in one order everywhere: most answers first.
  const order = () => {
    const p = dash.data('progress');
    return p.status === 'ok'
      ? p.data.slice().sort((a, b) => b.answered - a.answered || a.annotator.localeCompare(b.annotator)).map((r) => r.annotator)
      : [];
  };

  // Single figures marked in the text: data-source, data-field, data-where, and data-fmt for how to show them.
  function fillFigures() {
    document.querySelectorAll('.sr [data-fmt]').forEach((el) => {
      const d = dash.data(el.dataset.source);
      if (d.status !== 'ok') {
        el.textContent = '—';
        el.classList.toggle('dash-skeleton', d.status === 'loading');
        return;
      }
      el.classList.remove('dash-skeleton');
      const where = [...new URLSearchParams(el.dataset.where || '')];
      const row = d.data.find((r) => where.every(([k, v]) => String(r[k]) === v));
      el.textContent = row ? fmt[el.dataset.fmt](row[el.dataset.field]) : '—';
    });
    const a = dash.data('alpha');
    for (const q of ['state', 'eating']) {
      const row = a.status === 'ok' ? a.data.find((r) => r.question === q) : null;
      $(`band-${q}`).textContent = row ? SR.band(row.alpha) : '—';
      $(`noun-${q}`).textContent = row ? SR.bandNoun(row.alpha) : '—';
    }
  }

  function tableData(id, source, cols, sort) {
    const el = $(id);
    const d = dash.data(source);
    if (d.status !== 'ok') {
      el.tBodies[0].replaceChildren();
      return;
    }
    SR.table(el, d.data, cols, sort);
  }

  const n0 = (v) => (v == null ? '—' : d3.format('.0f')(v));
  const n1 = (v) => (v == null ? '—' : d3.format('.1f')(v));

  const charts = {
    schematic() {
      const box = $('chart-schematic');
      const data = SR.ready(box, ['trial_steps']);
      if (data) SR.schematic(box, data[0]);
    },
    trials() {
      const box = $('chart-trials');
      const data = SR.ready(box, ['trials', 'clips']);
      if (!data) return;
      SR.trialLines(box, inWeek(data[0]), Object.fromEntries(data[1].map((c) => [c.clip, c.state_call])));
    },
    overlay() {
      const box = $('chart-overlay');
      const data = SR.ready(box, ['star_days', 'day_cycles']);
      if (data) SR.dayOverlay(box, inWeek(data[0]), inWeek(data[1]));
    },
    stars() {
      const box = $('chart-stars');
      const data = SR.ready(box, ['star_days']);
      if (data) SR.starDays(box, inWeek(data[0]));
    },
    groups() {
      tableData('table-groups', 'trial_groups', [
        {field: 'group'}, {field: 'by'}, {field: 'trials', num: true}, {field: 'moved', num: true},
        {field: 'moved_away', num: true}, {field: 'share_moved_away', num: true, format: fmt.pct},
        {field: 'median_to_move_away_s', num: true, format: n0},
      ], null);
    },
    progress() {
      const box = $('chart-progress');
      const data = SR.ready(box, ['progress']);
      if (!data) return;
      SR.stacked(box, order().map((p) => {
        const r = data[0].find((x) => x.annotator === p);
        return {label: p, right: `${r.answered} of ${r.total}`,
          parts: [{key: 'answered', value: r.answered}, {key: 'remaining', value: r.remaining}]};
      }), ['answered', 'remaining']);
    },
    pace() {
      const box = $('chart-pace');
      const data = SR.ready(box, ['pace', 'progress']);
      if (!data) return;
      const rows = inWeek(data[0]);
      SR.pace(box, rows, order(), d3.max(rows, (r) => r.answered) || 1);
    },
    timing() {
      tableData('table-timing', 'timing', [
        {field: 'annotator'}, {field: 'answered', num: true}, {field: 'median_seconds', num: true, format: n0},
        {field: 'loops_per_clip', num: true, format: n1}, {field: 'revised', num: true},
        {field: 'went_back', num: true}, {field: 'left_tab', num: true},
      ], sorts['table-timing']);
    },
    pairs() {
      for (const q of ['state', 'eating']) {
        const box = $(`chart-pairs-${q}`);
        const data = SR.ready(box, ['agreement']);
        if (!data) continue;
        const people = order();
        const cells = [];
        for (const a of people) {
          for (const b of people) {
            const r = data[0].find((x) => x.question === q && (a === b
              ? x.kind === 'repeat' && x.a === a : x.kind === 'pair' && x.a === a && x.b === b));
            if (!r) continue;
            cells.push({row: a, col: b, strength: r.kappa, text: fmt.stat(r.kappa), self: a === b,
              head: a === b ? `${a}, first vs second viewing` : `${a} vs ${b}`,
              lines: [{text: `κ ${fmt.stat(r.kappa)}`},
                {text: r.n ? `Same answer on ${fmt.pct(r.agreement)} of ${r.n} ${a === b ? 'repeated clips' : 'clips'}` : 'No clips in common yet'}]});
          }
        }
        SR.matrix(box, people, people, cells, {rowLabel: (k) => k, colLabel: (k) => k});
      }
    },
    levels() {
      tableData('table-levels', 'levels', [{field: 'level'}, {field: 'state', num: true}, {field: 'eating', num: true}], null);
    },
    clips() {
      document.querySelectorAll('#clip-question button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === clipQuestion)));
      const box = $('chart-clips');
      const data = SR.ready(box, ['clips', 'progress', 'clip_notes']);
      if (!data) return;
      SR.barcode(box, inWeek(data[0]), clipQuestion, data[1].length, Object.fromEntries(data[2].map((n) => [n.clip, n])));
    },
    clipTable() {
      tableData('table-clips', 'clip_table', [
        {field: 'clip'}, {field: 'week', num: true}, {field: 'tank', wide: true}, {field: 'camera', wide: true},
        {field: 'quiescent', num: true}, {field: 'alert', num: true}, {field: 'moving', num: true},
        {field: 'group_call'}, {field: 'agreement'}, {field: 'live_call'}, {field: 'eating_call'}, {field: 'outcome'},
        {field: 'seconds_to_move_away', num: true, format: n0},
      ], sorts['table-clips']);
    },
    mix() {
      const sets = {state: ['quiescent', 'alert', 'moving', 'cant_tell'], eating: ['eating', 'not_eating', 'cant_tell', 'not_asked']};
      for (const q of ['state', 'eating']) {
        const box = $(`chart-mix-${q}`);
        const data = SR.ready(box, ['mix']);
        if (!data) continue;
        const rows = data[0].filter((r) => r.question === q);
        const keys = sets[q].filter((k) => rows.some((r) => r.answer === k));
        SR.stacked(box, order().filter((p) => rows.some((r) => r.annotator === p)).map((p) => {
          const mine = rows.filter((r) => r.annotator === p);
          return {label: p, right: `n = ${d3.sum(mine, (r) => r.count)}`,
            parts: keys.map((k) => ({key: k, value: mine.find((r) => r.answer === k)?.count ?? 0}))};
        }), keys);
      }
    },
    drift() {
      const sets = {state: ['quiescent', 'alert', 'moving', 'cant_tell'], eating: ['eating', 'not_eating', 'cant_tell', 'not_asked']};
      const stages = ['First third', 'Middle third', 'Last third'];
      for (const q of ['state', 'eating']) {
        const box = $(`chart-drift-${q}`);
        const data = SR.ready(box, ['drift']);
        if (!data) continue;
        const rows = data[0].filter((r) => r.question === q);
        const keys = sets[q].filter((k) => rows.some((r) => r.answer === k));
        const list = [];
        for (const p of order()) {
          const mine = rows.filter((r) => r.annotator === p);
          if (!mine.length) continue;
          list.push({label: p, heading: true});
          for (const s of stages) {
            const part = mine.filter((r) => r.stage === s);
            if (!part.length) continue;
            list.push({label: s, head: `${p}, ${s.toLowerCase()}`, right: `n = ${d3.sum(part, (r) => r.count)}`,
              parts: keys.map((k) => ({key: k, value: part.find((r) => r.answer === k)?.count ?? 0}))});
          }
        }
        SR.stacked(box, list, keys);
      }
    },
    consistency() {
      const box = $('chart-consistency');
      const data = SR.ready(box, ['agreement']);
      if (!data) return;
      const rows = data[0];
      const get = (kind, q, a) => rows.find((r) => r.kind === kind && r.question === q && r.a === a);
      const bar = (key, r, what) => ({key, value: r?.kappa ?? null, tip: [
        {text: `${name(key)}: κ ${fmt.stat(r?.kappa)}`},
        {text: r?.n ? `Same answer on ${fmt.pct(r.agreement)} of ${r.n} ${what}` : 'Not enough answers yet'}]});
      const list = order().map((p) => ({label: p, bars: [
        bar('repeat_state', get('repeat', 'state', p), 'repeated clips'),
        bar('repeat_eating', get('repeat', 'eating', p), 'repeated clips'),
        bar('live_state', get('live', 'state', p), 'clips with a live call'),
      ]}));
      list.push({label: 'Group call', bars: [bar('live_state', get('live', 'state', 'Group call'), 'clips with a live call')]});
      const low = d3.min(rows.filter((r) => r.kind !== 'pair'), (r) => r.kappa) ?? 0;
      SR.grouped(box, list, ['repeat_state', 'repeat_eating', 'live_state'], {domain: [Math.min(0, Math.floor(low * 10) / 10), 1]});
    },
    own() {
      const box = $('chart-own');
      const data = SR.ready(box, ['own']);
      if (!data) return;
      const rows = data[0];
      const list = [];
      for (const p of [...new Set(rows.map((r) => r.annotator))]) {
        list.push({label: p, heading: true});
        for (const [field, label] of [['live', 'Matches the live call'], ['peer', 'Matches the other annotators']]) {
          list.push({label, head: `${p}: ${label.toLowerCase()}`, bars: ['Own trials', "Others' trials"].map((t) => {
            const r = rows.find((x) => x.annotator === p && x.trials === t);
            const n = r?.[`${field}_clips`];
            return {key: t, value: n ? r[`${field}_match`] : null,
              tip: [{text: n ? `${t}: ${r[`${field}_matched`]} of ${n} clips (${fmt.pct(r[`${field}_match`])})` : `${t}: no clips yet`}]};
          })});
        }
      }
      SR.grouped(box, list, ['Own trials', "Others' trials"], {format: fmt.pct, tickFormat: fmt.pct});
    },
    outcome() {
      const box = $('chart-outcome');
      const data = SR.ready(box, ['outcome']);
      if (!data) return;
      const outs = ['Moved away', "Moved, didn't leave", 'No movement'];
      const list = [];
      for (const [basis, title] of [['Group call', 'Group call from video'], ['Live call', 'Live call by the poker']]) {
        list.push({label: title, heading: true});
        for (const s of ['quiescent', 'alert', 'moving', 'tie']) {
          const mine = data[0].filter((r) => r.basis === basis && r.state === s);
          if (!mine.length || !mine[0].of) continue;
          list.push({label: name(s), head: `${title}: ${name(s)}`, right: `n = ${mine[0].of}`,
            parts: outs.map((o) => ({key: o, value: mine.find((r) => r.outcome === o)?.clips ?? 0}))});
        }
      }
      SR.stacked(box, list, outs);
    },
    split() {
      const box = $('chart-split');
      const data = SR.ready(box, ['annotator_split']);
      if (!data) return;
      const rows = data[0];
      const states = ['quiescent', 'alert', 'moving'];
      const pts = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)} pts`);
      const line = (r) => ({label: r.who, divider: r.who === 'Group call', muted: r.kind !== 'Annotator', right: pts(r.gap),
        values: states.map((k) => ({key: k, value: r[`${k}_clips`] ? r[k] : null, n: r[`${k}_clips`],
          tip: [{text: `Called ${name(k).toLowerCase()}: ${r[`${k}_away`]} of ${r[`${k}_clips`]} clips moved away (${fmt.pct(r[k])})`, color: SR.color(k)}]}))});
      const people = order().map((p) => rows.find((r) => r.who === p)).filter(Boolean);
      SR.dumbbell(box, [...people, ...rows.filter((r) => r.kind !== 'Annotator')].map(line), states, {rightTitle: 'Alert − quiescent'});
    },
    byAnnotator() {
      const box = $('chart-by-annotator');
      const data = SR.ready(box, ['annotator_outcome']);
      if (!data) return;
      const outs = ['Moved away', "Moved, didn't leave", 'No movement'];
      const callers = [...order(), 'Group call', 'Live call'];
      const list = [];
      for (const who of callers) {
        const mine = data[0].filter((r) => r.who === who);
        if (!mine.length) continue;
        list.push({label: who, heading: true});
        for (const s of ['quiescent', 'alert', 'moving']) {
          const part = mine.filter((r) => r.state === s);
          if (!part[0]?.of) continue;
          list.push({label: name(s), head: `${who} called it ${name(s).toLowerCase()}`, right: `n = ${part[0].of}`,
            parts: outs.map((o) => ({key: o, value: part.find((r) => r.outcome === o)?.clips ?? 0}))});
        }
      }
      SR.stacked(box, list, outs);
    },
    tankTable() {
      const el = $('table-tanks');
      const d = dash.data('tank_tests');
      if (d.status === 'ok' && d.data.length) {
        el.querySelector('th[data-field="a_text"]').textContent = d.data[0].tank_a;
        el.querySelector('th[data-field="b_text"]').textContent = d.data[0].tank_b;
      }
      tableData('table-tanks', 'tank_tests', [
        {field: 'topic', wide: true}, {field: 'measure'}, {field: 'a_text', num: true}, {field: 'b_text', num: true},
        {field: 'difference_text', num: true}, {field: 'interval', num: true}, {field: 'p_text', num: true}, {field: 'reading'},
      ], null, 'id');
    },
    tankMix() {
      const box = $('chart-tank-mix');
      const data = SR.ready(box, ['tank_mix']);
      if (!data) return;
      const keys = ['quiescent', 'alert', 'moving'];
      const list = [];
      for (const source of [...new Set(data[0].map((r) => r.source))]) {
        list.push({label: source, heading: true});
        for (const tank of [...new Set(data[0].map((r) => r.tank))]) {
          const mine = data[0].filter((r) => r.source === source && r.tank === tank);
          if (!mine[0]?.of) continue;
          list.push({label: tank, head: `${source}, ${tank}`, right: `n = ${mine[0].of}`,
            parts: keys.map((k) => ({key: k, value: mine.find((r) => r.state === k)?.count ?? 0}))});
        }
      }
      SR.stacked(box, list, keys);
    },
    tankOutcome() {
      const box = $('chart-tank-outcome');
      const data = SR.ready(box, ['tank_outcome']);
      if (!data) return;
      const outs = ['Moved away', "Moved, didn't leave", 'No movement'];
      const list = [];
      for (const tank of [...new Set(data[0].map((r) => r.tank))]) {
        for (const basis of ['Group call from video', 'Live call']) {
          const mine = data[0].filter((r) => r.tank === tank && r.basis === basis);
          if (!mine.some((r) => r.of)) continue;
          list.push({label: `${tank} · ${basis.toLowerCase()}`, heading: true});
          for (const st of ['quiescent', 'alert', 'moving']) {
            const part = mine.filter((r) => r.state === st);
            if (!part[0]?.of) continue;
            list.push({label: name(st), head: `${tank}, ${basis.toLowerCase()} ${name(st).toLowerCase()}`, right: `n = ${part[0].of}`,
              parts: outs.map((o) => ({key: o, value: part.find((r) => r.outcome === o)?.clips ?? 0}))});
          }
        }
      }
      SR.stacked(box, list, outs);
    },
    tankTimes() {
      const box = $('chart-tank-times');
      const data = SR.ready(box, ['trials']);
      if (!data) return;
      const tanks = [...new Set(data[0].map((t) => t.tank))].sort();
      const list = [];
      for (const [field, title] of [['poke_to_first_movement_s', 'First poke to first movement'], ['poke_to_move_away_s', 'First poke to moving away']]) {
        list.push({label: title, heading: true});
        for (const tank of tanks) {
          const mine = data[0].filter((t) => t.tank === tank && t[field] !== '');
          list.push({label: tank, head: `${title}, ${tank}`, right: `n = ${mine.length}`, values: mine.map((t) => ({
            x: Number(t[field]), key: t.outcome,
            tip: [{text: `${t.tank} camera ${t.camera} · ${fmt.time(new Date(t.entry_time))}`}, {text: `${fmt.secs(Number(t[field]))}`}, {text: `Outcome: ${t.outcome}`}],
          }))});
        }
      }
      const max = Math.max(300, ...data[0].map((t) => Number(t.poke_to_move_away_s) || 0));
      SR.strips(box, list, ['Moved away', "Moved, didn't leave"], {domain: [0, max], ticks: d3.range(0, max + 1, 60),
        tickFormat: (t) => (t ? `${t / 60} min` : '0')});
    },
    tankScores() {
      const box = $('chart-tank-scores');
      const data = SR.ready(box, ['star_days']);
      if (!data) return;
      const outs = ['Moved away', "Moved, didn't leave", 'No movement'];
      const list = [];
      for (const tank of [...new Set(data[0].map((r) => r.tank))].sort()) {
        list.push({label: tank, heading: true});
        for (const o of outs) {
          const mine = data[0].filter((r) => r.tank === tank && r.outcome === o && r.mean_score != null);
          if (!mine.length) continue;
          list.push({label: o, head: `${tank}, ${o.toLowerCase()}`, right: `n = ${mine.length}`, values: mine.map((r) => ({
            x: r.mean_score, key: o,
            tip: [{text: `${r.tank} camera ${r.camera} · ${fmt.time(new Date(r.entry_time))}`},
              {text: `Mean score ${fmt.stat(r.mean_score)} ± ${fmt.stat(r.sd)} SD, ${r.answers} answers`}, {text: `Live call: ${name(r.live_state)}`}],
          }))});
        }
      }
      SR.strips(box, list, outs, {domain: [0, 2], ticks: [0, 0.5, 1, 1.5, 2],
        tickFormat: (t) => ({0: 'Quiescent', 1: 'Alert', 2: 'Moving'}[t] ?? '')});
    },
    km() {
      document.querySelectorAll('#km-endpoint button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === km.endpoint)));
      const box = $('chart-km');
      const data = SR.ready(box, ['km']);
      if (!data) return;
      const rows = data[0];
      const bases = [...new Set(rows.map((r) => r.basis))];
      const ordered = ['Group call', 'Live call', ...order().filter((p) => bases.includes(p))].filter((b) => bases.includes(b));
      km.basis = setOptions($('km-basis'), ordered, km.basis);
      km.scope = setOptions($('km-scope'), [...new Set(rows.map((r) => r.scope))], km.scope);
      SR.kmChart(box, rows.filter((r) => r.basis === km.basis && r.endpoint === km.endpoint && r.scope === km.scope));
    },
    kmTable() {
      tableData('table-km', 'km_tests', [
        {field: 'endpoint'}, {field: 'basis'}, {field: 'medians', num: true}, {field: 'stars', num: true, wide: true},
        {field: 'p_text', num: true}, {field: 'p_within_tank_text', num: true}, {field: 'p_alert_vs_quiescent_text', num: true, wide: true},
        {field: 'reading'},
      ], null, 'id');
    },
    weekLines() {
      const box = $('chart-week-lines');
      const data = SR.ready(box, ['week_summary']);
      if (!data) return;
      const stat = (v) => (v == null ? '—' : d3.format('.2f')(v));
      const lo = Math.min(0, d3.min(data[0], (r) => Math.min(r.alpha_state ?? 0, r.alpha_eating ?? 0, r.kappa_group_live ?? 0)) ?? 0);
      SR.weekLines(box, data[0], [
        {title: 'Stars that moved away', series: ['moved_away'], domain: [0, 1], format: fmt.pct},
        {title: 'Quiescent calls, video vs live', series: ['quiescent_video', 'quiescent_live'], domain: [0, 1], format: fmt.pct},
        {title: 'Agreement', series: ['alpha_state', 'alpha_eating', 'kappa_group_live'], domain: [Math.floor(lo * 10) / 10, 1], format: stat},
        {title: 'Mean score predicts moving away (AUC)', series: ['auc_score'], domain: [0, 1], format: stat, ref: 0.5},
      ]);
    },
    weekTable() {
      const stat = (v) => (v == null ? '—' : d3.format('.2f')(v));
      tableData('table-weeks', 'week_summary', [
        {field: 'week', num: true}, {field: 'round', format: fmt.date}, {field: 'stars', num: true}, {field: 'trials', num: true},
        {field: 'clips', num: true}, {field: 'moved_away', num: true, format: fmt.pct}, {field: 'quiescent_video', num: true, format: fmt.pct},
        {field: 'quiescent_live', num: true, format: fmt.pct}, {field: 'mean_score', num: true, format: stat},
        {field: 'alpha_state', num: true, format: stat}, {field: 'alpha_eating', num: true, format: stat},
        {field: 'kappa_group_live', num: true, format: stat}, {field: 'auc_score', num: true, format: stat},
      ], null);
    },
    stats() {
      tableData('table-stats', 'stat_summary', [
        {field: 'topic', wide: true}, {field: 'question'}, {field: 'measure', wide: true}, {field: 'estimate_text', num: true},
        {field: 'interval', num: true}, {field: 'p_text', num: true}, {field: 'n', num: true}, {field: 'reading'},
      ], null, 'id');
      const box = $('chart-forest');
      const data = SR.ready(box, ['stat_summary']);
      if (!data) return;
      SR.forest(box, data[0].filter((r) => r.measure === 'AUC').map((r) => ({
        label: r.label, estimate: r.estimate, low: r.ci_low, high: r.ci_high, strong: r.p != null && r.p < 0.05,
        right: r.p == null ? `n = ${r.n}` : `p ${r.p_text}`,
        tip: [{text: r.question}, {text: `AUC ${r.estimate_text}, 95% interval ${r.interval}`}, {text: `p ${r.p_text}, ${r.n} clips`}, {text: r.reading}],
      })), {centreLabel: 'No link'});
    },
    moveTimes() {
      const box = $('chart-movetimes');
      const data = SR.ready(box, ['clips']);
      if (data) SR.moveTimes(box, data[0]);
    },
    confusion() {
      const box = $('chart-confusion');
      const data = SR.ready(box, ['confusion']);
      if (!data) return;
      const rows = ['quiescent', 'alert', 'moving', 'tie'];
      const cols = ['quiescent', 'alert', 'moving', 'not recorded'];
      const max = d3.max(data[0], (r) => r.clips) || 1;
      SR.matrix(box, rows, cols, data[0].map((r) => ({
        row: r.group_call, col: r.live_call, strength: r.clips / max, text: String(r.clips), self: r.group_call === r.live_call,
        head: `Group call ${name(r.group_call).toLowerCase()}, live call ${name(r.live_call).toLowerCase()}`,
        lines: [{text: `${r.clips} clip${r.clips === 1 ? '' : 's'}`}],
      })));
    },
  };

  function render() {
    guard(syncWeeks);
    guard(fillFigures);
    for (const draw of Object.values(charts)) guard(draw);
  }
  dash.onData(render);
})();
