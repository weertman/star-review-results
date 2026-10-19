// Drawing helpers shared by the page's charts, as window.SR.
window.SR = (() => {
  const NAMES = {
    quiescent: 'Quiescent', alert: 'Alert', moving: 'Moving', cant_tell: "Can't tell", tie: 'Split',
    eating: 'Eating', not_eating: 'Not eating', not_asked: 'Not asked yet', '': 'Not recorded', 'not recorded': 'Not recorded',
    answered: 'Answered', remaining: 'Not answered yet', 'All stars': 'All stars, mean ± 1 SD', 'Live call': 'Live call, mean', 'No clip': 'No clip reviewed',
    moved_away: 'Moved away', quiescent_video: 'Quiescent, video answers', quiescent_live: 'Quiescent, live call',
    alpha_state: 'α, state', alpha_eating: 'α, eating', kappa_group_live: 'κ, group vs live', auc_score: 'AUC, mean score',
    repeat_state: 'Same state on both viewings', repeat_eating: 'Same eating answer on both viewings', live_state: 'State matches the live call',
  };
  const LIGHT = new Set(['remaining', 'not_asked', 'No movement', 'not recorded', '', 'No clip']);
  const name = (k) => NAMES[k] ?? k;
  const color = (k) => {
    const c = dash.colors;
    const fixed = {
      quiescent: c[0], alert: c[1], moving: c[2], eating: c[3], not_eating: c[4],
      'Moved away': c[5], "Moved, didn't leave": c[6], answered: c[0],
      'Own trials': c[1], repeat_state: c[0], repeat_eating: c[3], live_state: c[6],
      moved_away: c[5], quiescent_video: c[0], quiescent_live: c[7], alpha_state: c[1], alpha_eating: c[3],
      kappa_group_live: c[6], auc_score: c[2],
    };
    return fixed[k] ?? (LIGHT.has(k) ? 'var(--color-border-line)' : 'var(--cds-chart-muted)');
  };

  const fmt = {
    pct: (v) => (v == null || Number.isNaN(v) ? '—' : d3.format('.0%')(v)),
    stat: (v) => (v == null || Number.isNaN(v) ? '—' : d3.format('.2f')(v)),
    count: (v) => (v == null ? '—' : d3.format(',')(v)),
    secs: (v) => (v == null ? '—' : `${d3.format('.0f')(v)} s`),
    time: (t) => d3.timeFormat('%-I:%M %p')(new Date(t)),
    date: (d) => (d ? d3.timeFormat('%b %-d, %Y')(new Date(`${d}T12:00:00`)) : '—'),
    datetime: (t) => (t ? d3.timeFormat('%b %-d, %-I:%M %p')(new Date(t)) : '—'),
  };
  // Landis and Koch's rough reading of kappa-like values
  const band = (v) => (v == null ? 'not yet measurably' : v < 0 ? 'no better than chance' : v <= 0.2 ? 'only slightly'
    : v <= 0.4 ? 'fairly' : v <= 0.6 ? 'moderately' : v <= 0.8 ? 'substantially' : 'almost perfectly');
  const bandNoun = (v) => (v == null ? 'Not enough answers' : v < 0 ? 'Below chance' : v <= 0.2 ? 'Slight agreement'
    : v <= 0.4 ? 'Fair agreement' : v <= 0.6 ? 'Moderate agreement' : v <= 0.8 ? 'Substantial agreement' : 'Almost perfect agreement');

  // The data for a chart, or null after showing its loading or failed state.
  function ready(box, ids) {
    const all = ids.map((id) => dash.data(id));
    box.querySelectorAll(':scope > .sr-failed').forEach((n) => n.remove());
    if (all.every((d) => d.status === 'ok')) {
      box.classList.remove('dash-skeleton');
      return all.map((d) => d.data);
    }
    box.querySelectorAll(':scope > svg, :scope > .sr-legend').forEach((n) => n.remove());
    if (all.some((d) => ['error', 'connect', 'declined', 'missing'].includes(d.status))) {
      box.classList.remove('dash-skeleton');
      const line = document.createElement('div');
      line.className = 'sr-failed';
      const dot = document.createElement('span');
      dot.className = 'sr-dot';
      line.append(dot, 'Failed to load');
      box.append(line);
    } else {
      box.classList.add('dash-skeleton');
    }
    return null;
  }

  function tooltip(box) {
    let el = box.querySelector(':scope > .sr-tip');
    if (!el) {
      el = document.createElement('div');
      el.className = 'sr-tip';
      el.hidden = true;
      box.append(el);
    }
    return {
      show(event, head, lines) {
        const h = document.createElement('div');
        h.className = 'sr-tip-head';
        h.textContent = head;
        el.replaceChildren(h, ...lines.map(({text, color: c}) => {
          const row = document.createElement('div');
          row.className = 'sr-tip-row';
          if (c) {
            const sw = document.createElement('span');
            sw.className = 'sr-swatch';
            sw.style.background = c;
            row.append(sw);
          }
          row.append(text);
          return row;
        }));
        el.hidden = false;
        const r = box.getBoundingClientRect();
        let x = event.clientX - r.left + 14;
        let y = event.clientY - r.top + 14;
        if (x + el.offsetWidth > box.clientWidth) x = Math.max(0, event.clientX - r.left - el.offsetWidth - 14);
        if (y + el.offsetHeight > box.clientHeight) y = Math.max(0, event.clientY - r.top - el.offsetHeight - 14);
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      },
      hide() { el.hidden = true; },
    };
  }

  // Clears the box and sets up its legend, svg and tooltip.
  function frame(box, keys = [], colorOf = color) {
    let legendEl = box.querySelector(':scope > .sr-legend');
    if (!legendEl) {
      legendEl = document.createElement('div');
      legendEl.className = 'sr-legend';
      box.prepend(legendEl);
    }
    legendEl.replaceChildren(...keys.map((k) => {
      const item = document.createElement('span');
      item.className = 'sr-key';
      const sw = document.createElement('span');
      sw.className = 'sr-swatch';
      sw.style.background = colorOf(k);
      if (LIGHT.has(k)) sw.style.outline = '1px solid var(--cds-chart-muted)';
      item.dataset.key = k;
      item.append(sw, name(k));
      return item;
    }));
    legendEl.hidden = !keys.length;
    box.querySelectorAll(':scope > svg').forEach((n) => n.remove());
    const tip = tooltip(box);
    tip.hide();
    const width = Math.max(260, box.clientWidth);
    const svg = d3.select(box).append('svg').attr('width', '100%');
    return {svg, width, tip, size: (h) => svg.attr('viewBox', `0 0 ${width} ${h}`).attr('height', h)};
  }

  function textWidth(svg, texts, cls = '') {
    const g = svg.append('g').attr('class', cls);
    const w = d3.max(texts, (t) => g.append('text').text(t).node().getComputedTextLength()) || 0;
    g.remove();
    return Math.ceil(w);
  }

  const clip = (text, n = 70) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

  const label = (svg, x, y, text, {anchor = 'start', cls = ''} = {}) =>
    svg.append('text').attr('class', cls).attr('x', x).attr('y', y).attr('dy', '0.35em').attr('text-anchor', anchor).text(text);

  // Horizontal 100% bars. rows: {label, heading?, parts: [{key, value}], right?, head?}
  function stacked(box, rows, keys) {
    const {svg, width, tip, size} = frame(box, keys);
    const bars = rows.filter((r) => !r.heading);
    const left = textWidth(svg, bars.map((r) => r.label)) + 10;
    const right = textWidth(svg, bars.map((r) => r.right ?? '')) + 10;
    const barH = 20, step = 26, headH = 26;
    let y = 0;
    const laid = rows.map((r) => { const top = y; y += r.heading ? headH : step; return {r, top}; });
    size(Math.max(10, y - (step - barH)));
    const x = d3.scaleLinear([0, 1], [left, width - right]);
    for (const {r, top} of laid) {
      if (r.heading) {
        label(svg, 0, top + 13, r.label, {cls: 'sr-strong'});
        continue;
      }
      label(svg, left - 10, top + barH / 2, r.label, {anchor: 'end'});
      if (r.right) label(svg, width - right + 10, top + barH / 2, r.right);
      const total = d3.sum(r.parts, (p) => p.value);
      let acc = 0;
      for (const p of r.parts) {
        if (!p.value) continue;
        const x0 = x(acc / total), x1 = x((acc + p.value) / total);
        acc += p.value;
        const w = Math.max(1, x1 - x0 - 1.5);
        const share = p.value / total;
        const g = svg.append('g');
        g.append('rect').attr('x', x0).attr('y', top).attr('width', w).attr('height', barH).attr('rx', 3).style('fill', color(p.key));
        if (w >= 34) label(g, x0 + w / 2, top + barH / 2, fmt.pct(share), {anchor: 'middle', cls: LIGHT.has(p.key) ? 'sr-strong' : 'sr-in'});
        g.on('mousemove', (event) => tip.show(event, r.head ?? r.label,
          [{text: `${name(p.key)}: ${p.value} of ${total} (${fmt.pct(share)})`, color: color(p.key)}]))
          .on('mouseleave', () => tip.hide());
      }
    }
  }

  // Horizontal grouped bars on one scale. rows: {label, heading?, head?, bars: [{key, value, tip}]}
  function grouped(box, rows, keys, {domain = [0, 1], format = fmt.stat, tickFormat = d3.format('.1~f')} = {}) {
    const {svg, width, tip, size} = frame(box, keys);
    const bars = rows.filter((r) => !r.heading);
    const left = textWidth(svg, bars.map((r) => r.label)) + 10;
    const right = textWidth(svg, bars.flatMap((r) => r.bars.map((b) => format(b.value)))) + 10;
    const bh = 12, bgap = 4, headH = 26, rowGap = 12, axisH = 22;
    const rowH = (r) => r.bars.length * (bh + bgap) - bgap;
    let y = 0;
    const laid = rows.map((r) => { const top = y; y += r.heading ? headH : rowH(r) + rowGap; return {r, top}; });
    const plotH = y - rowGap;
    size(plotH + axisH);
    const x = d3.scaleLinear(domain, [left, width - right]);
    for (const t of x.ticks(Math.max(2, Math.min(5, Math.floor((width - left - right) / 60))))) {
      svg.append('line').attr('class', t === 0 ? 'sr-axisline' : 'sr-gridline').attr('x1', x(t)).attr('x2', x(t)).attr('y1', 0).attr('y2', plotH);
      svg.append('text').attr('x', x(t)).attr('y', plotH + 16).attr('text-anchor', 'middle').text(tickFormat(t));
    }
    for (const {r, top} of laid) {
      if (r.heading) {
        label(svg, 0, top + 13, r.label, {cls: 'sr-strong'});
        continue;
      }
      label(svg, left - 10, top + rowH(r) / 2, r.label, {anchor: 'end'});
      r.bars.forEach((b, i) => {
        const by = top + i * (bh + bgap);
        if (b.value == null) {
          label(svg, x(0) + 4, by + bh / 2, '—');
          return;
        }
        const x0 = x(Math.min(0, b.value)), x1 = x(Math.max(0, b.value));
        const g = svg.append('g');
        g.append('rect').attr('x', x0).attr('y', by).attr('width', Math.max(1, x1 - x0)).attr('height', bh).attr('rx', 3).style('fill', color(b.key));
        label(g, x1 + 4, by + bh / 2, format(b.value));
        g.on('mousemove', (event) => tip.show(event, r.head ?? r.label, b.tip)).on('mouseleave', () => tip.hide());
      });
    }
  }

  // A grid of shaded cells. cells: {row, col, strength (0-1 or null), text, head, lines, self?}
  function matrix(box, rowKeys, colKeys, cells, {rowLabel = name, colLabel = name} = {}) {
    const {svg, width, tip, size} = frame(box);
    const left = textWidth(svg, rowKeys.map(rowLabel)) + 10;
    const cw = Math.min(92, (width - left) / colKeys.length);
    const ch = Math.min(50, Math.max(34, cw * 0.6));
    const colLines = colKeys.map((k) => {
      const t = colLabel(k);
      const cut = t.indexOf(' ');
      return textWidth(svg, [t]) <= cw - 6 || cut < 0 ? [t] : [t.slice(0, cut), t.slice(cut + 1)];
    });
    const top = colLines.some((l) => l.length > 1) ? 36 : 22;
    size(top + rowKeys.length * ch);
    colKeys.forEach((k, j) => {
      const cx = left + j * cw + cw / 2;
      const t = svg.append('text').attr('text-anchor', 'middle').attr('y', top - 8 - (colLines[j].length - 1) * 14);
      colLines[j].forEach((line, i) => t.append('tspan').attr('x', cx).attr('dy', i ? 14 : 0).text(line));
    });
    rowKeys.forEach((k, i) => label(svg, left - 10, top + i * ch + ch / 2, rowLabel(k), {anchor: 'end'}));
    for (const c of cells) {
      const i = rowKeys.indexOf(c.row), j = colKeys.indexOf(c.col);
      if (i < 0 || j < 0) continue;
      const g = svg.append('g');
      const rect = g.append('rect').attr('x', left + j * cw + 2).attr('y', top + i * ch + 2)
        .attr('width', cw - 4).attr('height', ch - 4).attr('rx', 4);
      if (c.strength == null) rect.style('fill', 'none').style('stroke', 'var(--color-border-line)');
      else rect.style('fill', dash.colors[0]).style('fill-opacity', 0.08 + 0.87 * Math.max(0, Math.min(1, c.strength)));
      if (c.self) rect.style('stroke', 'var(--color-fg-muted)').style('stroke-dasharray', '3 3');
      label(g, left + j * cw + cw / 2, top + i * ch + ch / 2, c.text,
        {anchor: 'middle', cls: c.strength != null && c.strength > 0.55 ? 'sr-in' : 'sr-strong'});
      g.on('mousemove', (event) => tip.show(event, c.head, c.lines)).on('mouseleave', () => tip.hide());
    }
  }

  // Running count of answers over clock time, one line per annotator.
  function pace(box, rows, people, total) {
    const {svg, width, tip, size} = frame(box);
    const h = 230, top = 10, bottom = 26;
    const parsed = rows.map((r) => ({annotator: r.annotator, t: new Date(r.time), answered: Number(r.answered)}));
    const ends = people.map((p, i) => ({p, i, last: parsed.filter((r) => r.annotator === p).pop()})).filter((e) => e.last);
    const right = textWidth(svg, ends.map((e) => `${e.p} ${e.last.answered}`)) + 14;
    const left = textWidth(svg, [String(total)]) + 8;
    const x = d3.scaleTime(d3.extent(parsed, (r) => r.t), [left, width - right]);
    const y = d3.scaleLinear([0, total], [h - bottom, top]);
    size(h);
    for (const t of y.ticks(4)) {
      svg.append('line').attr('class', t === 0 ? 'sr-axisline' : 'sr-gridline').attr('x1', left).attr('x2', width - right).attr('y1', y(t)).attr('y2', y(t));
      label(svg, left - 6, y(t), String(t), {anchor: 'end'});
    }
    for (const t of x.ticks(Math.max(2, Math.floor((width - left - right) / 90)))) {
      const text = fmt.time(t);
      const half = textWidth(svg, [text]) / 2;
      if (x(t) - half < 0 || x(t) + half > width) continue;
      svg.append('text').attr('x', x(t)).attr('y', h - 6).attr('text-anchor', 'middle').text(text);
    }
    const line = d3.line().x((r) => x(r.t)).y((r) => y(r.answered)).curve(d3.curveStepAfter);
    for (const e of ends) {
      const mine = parsed.filter((r) => r.annotator === e.p);
      svg.append('path').attr('d', line([{t: mine[0].t, answered: 0}, ...mine]))
        .style('fill', 'none').style('stroke', dash.colors[e.i]).style('stroke-width', 2)
        .style('stroke-linejoin', 'round').style('stroke-linecap', 'round');
    }
    const placed = ends.map((e) => ({...e, y: y(e.last.answered)})).sort((a, b) => a.y - b.y);
    for (let k = 1; k < placed.length; k++) placed[k].y = Math.max(placed[k].y, placed[k - 1].y + 15);
    const overflow = placed.length ? placed[placed.length - 1].y - (h - bottom) : 0;
    for (const e of placed) {
      label(svg, x(e.last.t) + 6, e.y - Math.max(0, overflow), `${e.p} ${e.last.answered}`, {cls: 'sr-strong'});
    }
    const rule = svg.append('line').attr('class', 'sr-rule').attr('y1', top).attr('y2', h - bottom).style('opacity', 0);
    svg.append('rect').attr('x', left).attr('y', top).attr('width', Math.max(0, width - right - left)).attr('height', h - bottom - top)
      .style('fill', 'transparent')
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event);
        const t = x.invert(mx);
        rule.attr('x1', mx).attr('x2', mx).style('opacity', 1);
        tip.show(event, fmt.time(t), ends.map((e) => {
          const done = parsed.filter((r) => r.annotator === e.p && r.t <= t).pop();
          return {text: `${e.p}: ${done ? done.answered : 0}`, color: dash.colors[e.i]};
        }));
      })
      .on('mouseleave', () => { rule.style('opacity', 0); tip.hide(); });
  }

  // One column per clip: stacked first-viewing answers, then the live call and the outcome.
  // notes: {clip: {notes, notes_say_eating}}; the eating view adds a row for notes that mention eating.
  function barcode(box, clips, question, voters, notes = {}) {
    const answers = question === 'state' ? ['quiescent', 'alert', 'moving'] : ['eating', 'not_eating', 'cant_tell'];
    const calls = question === 'state' ? ['quiescent', 'alert', 'moving', 'tie', ''] : ['eating', 'not_eating', 'tie', ''];
    const levels = ['All agree', 'Most agree', 'Split', 'One answer', 'No answers'];
    const outcomes = ['Moved away', "Moved, didn't leave", 'No movement'];
    const level = (c) => c[`${question}_level`];
    const call = (c) => c[`${question}_call`];
    const votes = (c, a) => (a === 'cant_tell' ? c.eating_cant_tell : c[a]);
    const sorted = clips.slice().sort((a, b) => levels.indexOf(level(a)) - levels.indexOf(level(b))
      || calls.indexOf(call(a)) - calls.indexOf(call(b)) || a.clip.localeCompare(b.clip));
    const {svg, width, tip, size} = frame(box, [...answers, ...outcomes]);
    const second = question === 'state' ? 'Live call' : "Notes say eating";
    const left = textWidth(svg, ['Answers', second, 'Outcome']) + 10;
    const groups = d3.groups(sorted, level);
    const gap = 8, block = 12, top = 22;
    const cw = (width - left - gap * (groups.length - 1)) / Math.max(1, sorted.length);
    const stackH = Math.max(1, voters) * block;
    const liveY = top + stackH + 8;
    const outcomeY = liveY + block + 6;
    const h = outcomeY + block + 2;
    size(h);
    label(svg, left - 10, top + stackH / 2, 'Answers', {anchor: 'end'});
    label(svg, left - 10, liveY + block / 2, second, {anchor: 'end'});
    label(svg, left - 10, outcomeY + block / 2, 'Outcome', {anchor: 'end'});
    let gx = left;
    for (const [lvl, list] of groups) {
      const gw = list.length * cw;
      const fits = [`${lvl} (${list.length})`, String(list.length)].find((t) => textWidth(svg, [t]) <= gw - 2);
      if (fits) svg.append('text').attr('x', gx).attr('y', 12).text(fits);
      list.forEach((c, k) => {
        const cx = gx + k * cw, w = Math.max(1, cw - 1.5);
        const g = svg.append('g');
        let y = top + stackH;
        for (const a of answers) {
          for (let v = 0; v < votes(c, a); v++) {
            y -= block;
            g.append('rect').attr('x', cx).attr('y', y + 1).attr('width', w).attr('height', block - 2).attr('rx', 2).style('fill', color(a));
          }
        }
        const mark = question === 'state' ? c.live_state : notes[c.clip]?.notes_say_eating ? 'eating' : '';
        const second = g.append('rect').attr('x', cx).attr('y', liveY).attr('width', w).attr('height', block).attr('rx', 2);
        if (mark) second.style('fill', color(mark));
        else second.style('fill', 'none').style('stroke', 'var(--color-border-line)');
        g.append('rect').attr('x', cx).attr('y', outcomeY).attr('width', w).attr('height', block).attr('rx', 2).style('fill', color(c.outcome));
        g.append('rect').attr('x', cx).attr('y', top).attr('width', cw).attr('height', h - top).style('fill', 'transparent');
        g.on('mousemove', (event) => tip.show(event, `${c.clip} · ${c.tank} camera ${c.camera}`, [
          ...answers.filter((a) => votes(c, a)).map((a) => ({text: `${name(a)}: ${votes(c, a)}`, color: color(a)})),
          {text: `Group call: ${call(c) ? name(call(c)) : 'none yet'}`},
          ...(question === 'state' ? [{text: `Live call: ${name(c.live_state)}`}] : []),
          {text: `Outcome: ${c.outcome}${c.seconds_to_move_away != null ? `, after ${fmt.secs(c.seconds_to_move_away)}` : ''}`},
          ...(notes[c.clip]?.notes ? [{text: `Note: ${clip(notes[c.clip].notes)}`}] : []),
        ])).on('mouseleave', () => tip.hide());
      });
      gx += gw + gap;
    }
  }

  // Seconds from first poke to moving away, one dot per clip, by group call.
  function moveTimes(box, clips) {
    const rows = ['quiescent', 'alert', 'moving', 'tie']
      .map((s) => ({s, all: clips.filter((c) => c.state_call === s)})).filter((r) => r.all.length);
    const {svg, width, tip, size} = frame(box);
    const notes = rows.map((r) => `${r.all.filter((c) => c.seconds_to_move_away != null).length} of ${r.all.length} moved away`);
    const left = textWidth(svg, rows.map((r) => name(r.s))) + 10;
    const right = textWidth(svg, notes) + 16;
    const band = 38, axisH = 24;
    const plotH = rows.length * band;
    size(plotH + axisH);
    const max = Math.max(300, d3.max(clips, (c) => c.seconds_to_move_away) || 0);
    const x = d3.scaleLinear([0, max], [left, width - right]);
    const step = (width - left - right) / (max / 60) < 40 ? 120 : 60;
    for (const t of d3.range(0, max + 1, step)) {
      svg.append('line').attr('class', t === 0 ? 'sr-axisline' : 'sr-gridline').attr('x1', x(t)).attr('x2', x(t)).attr('y1', 0).attr('y2', plotH);
      svg.append('text').attr('x', x(t)).attr('y', plotH + 16).attr('text-anchor', 'middle').text(t ? `${t / 60} min` : '0');
    }
    rows.forEach((r, i) => {
      const cy = i * band + band / 2;
      label(svg, left - 10, cy, name(r.s), {anchor: 'end'});
      label(svg, width - right + 16, cy, notes[i]);
      const moved = r.all.filter((c) => c.seconds_to_move_away != null).sort((a, b) => a.seconds_to_move_away - b.seconds_to_move_away);
      if (moved.length > 1) {
        const med = d3.median(moved, (c) => c.seconds_to_move_away);
        svg.append('line').attr('class', 'sr-ref').attr('x1', x(med)).attr('x2', x(med)).attr('y1', cy - 14).attr('y2', cy + 14);
      }
      moved.forEach((c, k) => {
        const g = svg.append('g');
        g.append('circle').attr('cx', x(c.seconds_to_move_away)).attr('cy', cy + ((k % 3) - 1) * 7).attr('r', 4.5)
          .style('fill', color(r.s === 'tie' ? 'cant_tell' : r.s)).style('fill-opacity', 0.85);
        g.on('mousemove', (event) => tip.show(event, c.clip, [
          {text: `Moved away after ${fmt.secs(c.seconds_to_move_away)}`},
          {text: `Group call ${name(c.state_call)}, live call ${name(c.live_state)}`},
        ])).on('mouseleave', () => tip.hide());
      });
    });
  }

  // To-scale outline of a trial, from the start of the clip window to the median exit, in seconds from entry.
  function schematic(box, steps) {
    const {svg, width, size} = frame(box);
    const at = (k) => steps.find((s) => s.step === k)?.seconds;
    const poke = at('entry_to_poke') ?? 0;
    const marks = [
      {x: 0, text: 'Entry: poker makes the live call'},
      {x: poke, text: 'First poke'},
      {x: poke + (at('poke_to_first_movement') ?? NaN), text: 'First movement (median)'},
      {x: poke + (at('poke_to_move_away') ?? NaN), text: 'Moves away (median)'},
      {x: poke + (at('poke_to_exit') ?? NaN), text: 'Exit (median)'},
    ].filter((m) => Number.isFinite(m.x));
    const end = Math.max(poke + 300, ...marks.map((m) => m.x)) + 20;
    const x = d3.scaleLinear([-300, end], [8, width - 8]);
    const trackH = 18, lane = 16;
    // Labels go in lanes above and below the track: the nearest lane where the label touches no other
    // label, crosses no leader line from a lane further out, and its own leader line crosses no label.
    const placed = [];
    for (const m of marks) {
      const w = textWidth(svg, [m.text]);
      const lx = Math.min(Math.max(x(m.x) - w / 2, 0), width - w);
      const side = (k) => Math.sign(k);
      const ok = (k) => placed.every((p) => {
        if (side(p.k) !== side(k)) return true;
        if (p.k === k) return lx > p.lx + p.w + 8 || lx + w < p.lx - 8;
        const inner = Math.abs(p.k) < Math.abs(k) ? p : {lx, w, x: m.x};
        const outer = inner === p ? {x: m.x} : p;
        return x(outer.x) < inner.lx - 4 || x(outer.x) > inner.lx + inner.w + 4;
      });
      placed.push({...m, lx, w, k: [-1, 1, -2, 2, -3, 3].find(ok)});
    }
    // Too crowded (a narrow screen): a staircase below the track instead, rightmost step on top,
    // so each leader line passes left of the labels above it.
    if (placed.some((p) => p.k == null)) {
      placed.sort((a, b) => b.x - a.x).forEach((p, i) => {
        p.k = i + 1;
        p.lx = Math.min(x(p.x) - 4, width - p.w);
      });
    }
    const lowest = Math.max(1, ...placed.map((p) => p.k));
    const trackY = 20 + Math.max(0, ...placed.map((p) => -p.k)) * lane;
    size(trackY + trackH + 14 + lowest * lane + 26);
    const clipEnd = x(0);
    svg.append('rect').attr('x', x(-300)).attr('y', trackY).attr('width', clipEnd - x(-300)).attr('height', trackH).attr('rx', 4)
      .style('fill', dash.colors[0]).style('fill-opacity', 0.22);
    const clipText = 'Clip annotators see: 5 min, played in 15 s';
    if (textWidth(svg, [clipText]) < clipEnd - x(-300) - 12) label(svg, x(-150), trackY + trackH / 2, clipText, {anchor: 'middle', cls: 'sr-strong'});
    const pokeEnd = Math.min(x(poke + 300), width - 8);
    svg.append('rect').attr('x', x(poke)).attr('y', trackY).attr('width', Math.max(1, pokeEnd - x(poke))).attr('height', trackH).attr('rx', 4)
      .style('fill', dash.colors[1]).style('fill-opacity', 0.22);
    // the poking band's caption sits at its far end, unless a step falls under it
    const pokeText = 'Poking, up to about 5 min';
    const pokeW = textWidth(svg, [pokeText]);
    if (!placed.some((p) => x(p.x) > pokeEnd - pokeW - 16 && x(p.x) < pokeEnd) && pokeW < pokeEnd - x(poke) - 12) {
      label(svg, pokeEnd - 8, trackY + trackH / 2, pokeText, {anchor: 'end', cls: 'sr-strong'});
    }
    for (const p of placed) {
      const ly = p.k < 0 ? trackY - 10 + (p.k + 1) * lane : trackY + trackH + 14 + (p.k - 1) * lane;
      svg.append('line').attr('class', 'sr-ref').attr('x1', x(p.x)).attr('x2', x(p.x))
        .attr('y1', p.k < 0 ? ly + 6 : trackY).attr('y2', p.k < 0 ? trackY + trackH : ly - 6);
      svg.append('circle').attr('cx', x(p.x)).attr('cy', trackY + trackH / 2).attr('r', 3.5).style('fill', 'var(--color-fg)');
      svg.append('text').attr('class', 'sr-strong').attr('x', p.lx).attr('y', ly).attr('dy', '0.35em').text(p.text);
    }
    const axisY = trackY + trackH + 14 + lowest * lane + 8;
    let lastRight = -Infinity;
    const minuteW = x(60) - x(0);
    for (const t of d3.range(-300, end, minuteW < 46 ? 120 : 60)) {
      const text = t ? `${t > 0 ? '+' : '−'}${Math.abs(t) / 60} min` : 'Entry';
      const half = textWidth(svg, [text]) / 2;
      if (x(t) - half < Math.max(0, lastRight + 6) || x(t) + half > width) continue;
      lastRight = x(t) + half;
      svg.append('text').attr('x', x(t)).attr('y', axisY + 6).attr('text-anchor', 'middle').text(text);
    }
  }

  // Every trial on one clock: seconds from first poke, entry to exit, with first movement and moving away marked.
  function trialLines(box, trials, calls) {
    const outcomes = ['Moved away', "Moved, didn't leave", 'No movement'];
    const num = (v) => (v === '' || v == null ? null : Number(v));
    const rows = trials.map((t) => ({...t, entry: -num(t.entry_to_poke_s), move: num(t.poke_to_first_movement_s),
      away: num(t.poke_to_move_away_s), exit: num(t.poke_to_exit_s), call: t.clip ? calls[t.clip] ?? '' : null}));
    const keys = ['quiescent', 'alert', 'moving', 'tie'].filter((k) => rows.some((r) => r.call === k));
    const {svg, width, tip, size} = frame(box, rows.some((r) => r.call == null) ? [...keys, 'No clip'] : keys);
    const lo = Math.min(-30, d3.min(rows, (r) => r.entry) ?? 0);
    const hi = Math.max(330, d3.max(rows, (r) => r.exit) ?? 0);
    const rowH = 9, headH = 22, top = 18, axisH = 22;
    const groups = outcomes.map((o) => ({o, list: rows.filter((r) => r.outcome === o)
      .sort((a, b) => (a.away ?? a.move ?? a.exit ?? 0) - (b.away ?? b.move ?? b.exit ?? 0))})).filter((g) => g.list.length);
    const plotH = d3.sum(groups, (g) => headH + g.list.length * rowH);
    size(top + plotH + axisH);
    const x = d3.scaleLinear([lo, hi], [6, width - 6]);
    for (const [t, text] of [[0, 'First poke'], [300, '5 min']]) {
      svg.append('line').attr('class', 'sr-ref').attr('x1', x(t)).attr('x2', x(t)).attr('y1', top - 4).attr('y2', top + plotH);
      label(svg, x(t), 6, text, {anchor: 'middle'});
    }
    let lastRight = -Infinity;
    for (const t of d3.range(Math.ceil(lo / 60) * 60, hi + 1, x(60) - x(0) < 46 ? 120 : 60)) {
      if (!t) continue;
      const text = `${t > 0 ? '+' : '−'}${Math.abs(t) / 60} min`;
      const half = textWidth(svg, [text]) / 2;
      if (x(t) - half < Math.max(0, lastRight + 6) || x(t) + half > width || Math.abs(x(t) - x(0)) < half + 34 || Math.abs(x(t) - x(300)) < 1) continue;
      lastRight = x(t) + half;
      svg.append('text').attr('x', x(t)).attr('y', top + plotH + 16).attr('text-anchor', 'middle').text(text);
    }
    const lineColor = (r) => (r.call == null ? 'var(--color-border-line)' : r.call === 'tie' || !r.call ? 'var(--cds-chart-muted)' : color(r.call));
    let y = top;
    for (const g of groups) {
      label(svg, 0, y + headH / 2 + 1, `${g.o} (${g.list.length})`, {cls: 'sr-strong'});
      y += headH;
      for (const r of g.list) {
        const cy = y + rowH / 2;
        const row = svg.append('g');
        if (r.exit != null) {
          row.append('line').attr('x1', x(r.entry || 0)).attr('x2', x(r.exit)).attr('y1', cy).attr('y2', cy)
            .style('stroke', lineColor(r)).style('stroke-width', 3).style('stroke-linecap', 'round');
        }
        if (r.move != null) row.append('circle').attr('cx', x(r.move)).attr('cy', cy).attr('r', 3).attr('class', 'sr-hollow');
        if (r.away != null) row.append('circle').attr('cx', x(r.away)).attr('cy', cy).attr('r', 3.5).style('fill', 'var(--color-fg)');
        row.append('rect').attr('x', 0).attr('y', y).attr('width', width).attr('height', rowH).style('fill', 'transparent');
        row.on('mousemove', (event) => tip.show(event, `Trial ${r.trial_number} · ${r.tank} camera ${r.camera} · ${r.poker}`, [
          {text: `Live call: ${name(r.live_state)}`},
          {text: r.clip ? `Group call from video: ${r.call ? name(r.call) : 'none yet'} (${r.clip})` : r.review},
          {text: `Entry ${fmt.secs(-r.entry)} before first poke`},
          ...(r.move != null ? [{text: `First movement at ${fmt.secs(r.move)}`}] : []),
          ...(r.away != null ? [{text: `Moved away at ${fmt.secs(r.away)}`}] : []),
          ...(r.exit != null ? [{text: `Exit at ${fmt.secs(r.exit)}`}] : []),
          ...(r.notes ? [{text: `Note: ${clip(r.notes)}`}] : []),
        ])).on('mouseleave', () => tip.hide());
        y += rowH;
      }
    }
  }

  // One small panel per star (tank camera): the mean answer for each poke with a ±1 SD bar, the live call
  // as a diamond, and the outcome as the dot's colour, across the day on one clock.
  function starDays(box, rows) {
    const outcomes = ['Moved away', "Moved, didn't leave", 'No movement'];
    const {svg, width, tip, size} = frame(box, outcomes);
    const when = (r) => new Date(r.entry_time);
    const tanks = [...new Set(rows.map((r) => r.tank))].sort();
    const stars = tanks.map((tank) => [...new Set(rows.filter((r) => r.tank === tank).map((r) => r.camera))].sort()
      .map((camera) => ({tank, camera, list: rows.filter((r) => r.tank === tank && r.camera === camera).sort((a, b) => when(a) - when(b))})));
    // a column per tank when there's room, else one column
    const columns = width >= 760 && tanks.length === 2 ? stars : [stars.flat()];
    const gap = 32, titleH = 22, panelH = 92, panelGap = 16, axisH = 22;
    const step = titleH + panelH + panelGap;
    const colW = (width - gap * (columns.length - 1)) / columns.length;
    const left = textWidth(svg, ['Quiescent', 'Alert', 'Moving']) + 10;
    size(d3.max(columns, (c) => c.length) * step - panelGap + axisH);
    const [t0, t1] = d3.extent(rows, when);
    const domain = [d3.timeMinute.offset(t0, -15), d3.timeMinute.offset(t1, 15)];
    const names = ['Quiescent', 'Alert', 'Moving'];
    columns.forEach((col, ci) => {
      const ox = ci * (colW + gap);
      const x = d3.scaleTime(domain, [ox + left, ox + colW - 10]);
      const hours = x.ticks(d3.timeHour.every(1));
      col.forEach((s, ri) => {
        const oy = ri * step;
        const y = d3.scaleLinear([0, 2], [oy + titleH + panelH - 10, oy + titleH + 10]);
        label(svg, ox, oy + 9, s.list[0]?.star ?? `${s.tank} ${s.camera}`, {cls: 'sr-strong'});
        for (const v of [0, 1, 2]) {
          svg.append('line').attr('class', 'sr-gridline').attr('x1', ox + left).attr('x2', ox + colW - 10).attr('y1', y(v)).attr('y2', y(v));
          label(svg, ox + left - 8, y(v), names[v], {anchor: 'end'});
        }
        for (const t of hours) {
          svg.append('line').attr('class', 'sr-gridline').attr('x1', x(t)).attr('x2', x(t)).attr('y1', y(2) - 6).attr('y2', y(0) + 6);
        }
        const seen = s.list.filter((r) => r.mean_score != null);
        svg.append('path').attr('class', 'sr-trend').attr('d', d3.line().x((r) => x(when(r))).y((r) => y(r.mean_score))(seen));
        for (const r of s.list) {
          const cx = x(when(r));
          const g = svg.append('g');
          if (r.mean_score == null) {
            g.append('line').attr('class', 'sr-ref').attr('x1', cx).attr('x2', cx).attr('y1', y(2) - 6).attr('y2', y(0) + 6);
          } else {
            if (r.sd) {
              const lo = y(Math.max(0, r.mean_score - r.sd)), hi = y(Math.min(2, r.mean_score + r.sd));
              g.append('line').attr('class', 'sr-sd').attr('x1', cx).attr('x2', cx).attr('y1', lo).attr('y2', hi);
              for (const yy of [lo, hi]) g.append('line').attr('class', 'sr-sd').attr('x1', cx - 4).attr('x2', cx + 4).attr('y1', yy).attr('y2', yy);
            }
            const dot = g.append('circle').attr('cx', cx).attr('cy', y(r.mean_score)).attr('r', 5).style('fill', color(r.outcome));
            if (LIGHT.has(r.outcome)) dot.style('stroke', 'var(--cds-chart-muted)').style('stroke-width', 1.5);
          }
          if (r.live_score != null) {
            g.append('path').attr('class', 'sr-live').attr('transform', `translate(${cx},${y(r.live_score)})`)
              .attr('d', d3.symbol(d3.symbolDiamond, 90)());
          }
          g.append('rect').attr('x', cx - 10).attr('y', oy + titleH).attr('width', 20).attr('height', panelH).style('fill', 'transparent');
          g.on('mousemove', (event) => tip.show(event, `${s.tank} camera ${s.camera} · ${fmt.time(when(r))}`, r.mean_score == null
            ? [{text: r.review}, {text: `Live call: ${name(r.live_state)}`}, {text: `Outcome: ${r.outcome}`}]
            : [
              {text: `Mean ${fmt.stat(r.mean_score)} ± ${fmt.stat(r.sd)} SD (variance ${fmt.stat(r.variance)}), ${r.answers} answers`},
              ...['quiescent', 'alert', 'moving'].filter((k) => r[k]).map((k) => ({text: `${name(k)}: ${r[k]}`, color: color(k)})),
              {text: `Live call: ${name(r.live_state)}`},
              {text: `Outcome: ${r.outcome}`, color: color(r.outcome)},
            ])).on('mouseleave', () => tip.hide());
        }
      });
      const axisY = col.length * step - panelGap + 14;
      let lastRight = -Infinity;
      for (const t of hours) {
        const text = fmt.time(t);
        const half = textWidth(svg, [text]) / 2;
        if (x(t) - half < Math.max(ox, lastRight + 6) || x(t) + half > ox + colW) continue;
        lastRight = x(t) + half;
        svg.append('text').attr('x', x(t)).attr('y', axisY).attr('text-anchor', 'middle').text(text);
      }
    });
  }

  // Dots on one 0–100% scale per row, joined by a line; dot area shows how many clips each value rests on.
  // rows: {label, divider?, values: [{key, value, n, tip}], right}
  function dumbbell(box, rows, keys, {rightTitle = ''} = {}) {
    const {svg, width, tip, size} = frame(box, keys);
    const left = textWidth(svg, rows.map((r) => r.label)) + 12;
    const right = Math.max(textWidth(svg, rows.map((r) => r.right ?? '')), textWidth(svg, [rightTitle])) + 16;
    const rowH = 30, top = 20, axisH = 22;
    const dividers = rows.filter((r) => r.divider).length;
    const plotH = rows.length * rowH + dividers * 10;
    size(top + plotH + axisH);
    const x = d3.scaleLinear([0, 1], [left, width - right]);
    const r = d3.scaleSqrt([0, d3.max(rows.flatMap((row) => row.values.map((v) => v.n))) || 1], [0, 8]);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      svg.append('line').attr('class', t ? 'sr-gridline' : 'sr-axisline').attr('x1', x(t)).attr('x2', x(t)).attr('y1', top - 4).attr('y2', top + plotH);
      svg.append('text').attr('x', x(t)).attr('y', top + plotH + 16).attr('text-anchor', 'middle').text(fmt.pct(t));
    }
    if (rightTitle) svg.append('text').attr('x', width).attr('y', 8).attr('text-anchor', 'end').text(rightTitle);
    let y = top;
    for (const row of rows) {
      if (row.divider) {
        svg.append('line').attr('class', 'sr-axisline').attr('x1', 0).attr('x2', width).attr('y1', y + 5).attr('y2', y + 5);
        y += 10;
      }
      const cy = y + rowH / 2;
      label(svg, left - 12, cy, row.label, {anchor: 'end', cls: row.divider || row.muted ? '' : 'sr-strong'});
      if (row.right) label(svg, width, cy, row.right, {anchor: 'end', cls: 'sr-strong'});
      const shown = row.values.filter((v) => v.value != null);
      if (shown.length > 1) {
        svg.append('line').attr('class', 'sr-axisline').attr('x1', x(d3.min(shown, (v) => v.value))).attr('x2', x(d3.max(shown, (v) => v.value)))
          .attr('y1', cy).attr('y2', cy).style('stroke-width', 2);
      }
      for (const v of shown) {
        const g = svg.append('g');
        g.append('circle').attr('cx', x(v.value)).attr('cy', cy).attr('r', Math.max(3, r(v.n)))
          .style('fill', color(v.key)).style('fill-opacity', 0.9).style('stroke', 'var(--color-panel)').style('stroke-width', 1.5);
        g.on('mousemove', (event) => tip.show(event, row.label, v.tip)).on('mouseleave', () => tip.hide());
      }
      y += rowH;
    }
  }

  // Every star's mean answer on one clock, with the all-stars mean ± 1 SD for each round of pokes as a band
  // and the mean live call as a dashed line. Hovering a star (line or legend) brings out its own SD bars.
  function dayOverlay(box, rows, cycles) {
    const stars = [...new Set(rows.map((r) => r.star))].sort();
    const starColor = (k) => (stars.includes(k) ? dash.colors[stars.indexOf(k) % 8]
      : k === 'All stars' ? 'var(--color-fg)' : 'var(--cds-chart-reference)');
    const {svg, width, tip, size} = frame(box, ['All stars', 'Live call', ...stars], starColor);
    const when = (t) => new Date(t);
    const h = 300, top = 12, bottom = 26;
    const left = textWidth(svg, ['Quiescent', 'Alert', 'Moving']) + 10;
    size(h);
    const [t0, t1] = d3.extent(rows, (r) => when(r.entry_time));
    const x = d3.scaleTime([d3.timeMinute.offset(t0, -15), d3.timeMinute.offset(t1, 15)], [left, width - 10]);
    const y = d3.scaleLinear([0, 2], [h - bottom - 8, top + 8]);
    ['Quiescent', 'Alert', 'Moving'].forEach((n, v) => {
      svg.append('line').attr('class', 'sr-gridline').attr('x1', left).attr('x2', width - 10).attr('y1', y(v)).attr('y2', y(v));
      label(svg, left - 8, y(v), n, {anchor: 'end'});
    });
    let lastRight = -Infinity;
    for (const t of x.ticks(d3.timeHour.every(1))) {
      const text = fmt.time(t);
      const half = textWidth(svg, [text]) / 2;
      if (x(t) - half < Math.max(0, lastRight + 6) || x(t) + half > width) continue;
      lastRight = x(t) + half;
      svg.append('line').attr('class', 'sr-gridline').attr('x1', x(t)).attr('x2', x(t)).attr('y1', y(2) - 6).attr('y2', y(0) + 6);
      svg.append('text').attr('x', x(t)).attr('y', h - 6).attr('text-anchor', 'middle').text(text);
    }
    const seen = cycles.filter((c) => c.mean_score != null);
    const clampY = (v) => y(Math.max(0, Math.min(2, v)));
    svg.append('path').attr('d', d3.area().x((c) => x(when(c.time))).y0((c) => clampY(c.mean_score - (c.sd || 0)))
      .y1((c) => clampY(c.mean_score + (c.sd || 0)))(seen)).style('fill', 'var(--color-fg)').style('fill-opacity', 0.08);
    const layer = svg.append('g');
    const groups = stars.map((star) => {
      const list = rows.filter((r) => r.star === star && r.mean_score != null).sort((a, b) => a.entry_time.localeCompare(b.entry_time));
      const g = layer.append('g').attr('class', 'sr-star').style('opacity', 0.75);
      const c = starColor(star);
      g.append('path').attr('d', d3.line().x((r) => x(when(r.entry_time))).y((r) => y(r.mean_score))(list))
        .style('fill', 'none').style('stroke', c).style('stroke-width', 1.5).style('stroke-linejoin', 'round');
      for (const r of list) {
        const cx = x(when(r.entry_time));
        if (r.sd) {
          g.append('line').attr('class', 'sr-star-sd').attr('x1', cx).attr('x2', cx)
            .attr('y1', clampY(r.mean_score - r.sd)).attr('y2', clampY(r.mean_score + r.sd)).style('stroke', c).style('opacity', 0);
        }
        g.append('circle').attr('cx', cx).attr('cy', y(r.mean_score)).attr('r', 3.5).style('fill', c)
          .on('mousemove', (event) => tip.show(event, `${r.tank} camera ${r.camera} · ${fmt.time(when(r.entry_time))}`, [
            {text: `Mean ${fmt.stat(r.mean_score)} ± ${fmt.stat(r.sd)} SD, ${r.answers} answers`, color: c},
            {text: `Live call: ${name(r.live_state)}`}, {text: `Outcome: ${r.outcome}`},
          ])).on('mouseleave', () => tip.hide());
      }
      return {star, g};
    });
    const focus = (star) => groups.forEach(({star: s2, g}) => {
      g.style('opacity', !star ? 0.75 : s2 === star ? 1 : 0.12);
      g.selectAll('.sr-star-sd').style('opacity', s2 === star ? 1 : 0);
    });
    groups.forEach(({star, g}) => g.on('mouseenter', () => focus(star)).on('mouseleave', () => focus(null)));
    box.querySelectorAll(':scope > .sr-legend .sr-key').forEach((item) => {
      if (!stars.includes(item.dataset.key)) return;
      item.style.cursor = 'pointer';
      item.onmouseenter = () => focus(item.dataset.key);
      item.onmouseleave = () => focus(null);
    });
    const live = cycles.filter((c) => c.live_mean != null);
    svg.append('path').attr('d', d3.line().x((c) => x(when(c.time))).y((c) => y(c.live_mean))(live))
      .style('fill', 'none').style('stroke', 'var(--cds-chart-reference)').style('stroke-width', 2).style('stroke-dasharray', '5 4');
    svg.append('path').attr('d', d3.line().x((c) => x(when(c.time))).y((c) => y(c.mean_score))(seen))
      .style('fill', 'none').style('stroke', 'var(--color-fg)').style('stroke-width', 2.5).style('stroke-linejoin', 'round');
    for (const c of seen) {
      const g = svg.append('g');
      g.append('circle').attr('cx', x(when(c.time))).attr('cy', y(c.mean_score)).attr('r', 5)
        .style('fill', 'var(--color-fg)').style('stroke', 'var(--color-panel)').style('stroke-width', 2);
      if (c.live_mean != null) {
        g.append('path').attr('class', 'sr-live').attr('transform', `translate(${x(when(c.time))},${y(c.live_mean)})`)
          .attr('d', d3.symbol(d3.symbolDiamond, 70)()).style('stroke', 'var(--cds-chart-reference)');
      }
      g.on('mousemove', (event) => tip.show(event, `Poke ${c.poke} of the day · ${fmt.time(when(c.first_entry))}–${fmt.time(when(c.last_entry))}`, [
        {text: `All stars: ${fmt.stat(c.mean_score)} ± ${fmt.stat(c.sd)} SD, ${c.answers} answers on ${c.clips} clips`, color: 'var(--color-fg)'},
        {text: `Live call mean: ${fmt.stat(c.live_mean)} (${c.live_calls} calls)`, color: 'var(--cds-chart-reference)'},
        {text: `${c.moved_away} of ${c.stars} stars moved away`},
      ])).on('mouseleave', () => tip.hide());
    }
  }

  // Estimates with 95% intervals against a no-effect line. rows: {label, estimate, low, high, right, tip}
  function forest(box, rows, {domain = [0, 1], centre = 0.5, centreLabel = ''} = {}) {
    const {svg, width, tip, size} = frame(box);
    const left = textWidth(svg, rows.map((r) => r.label)) + 12;
    const right = textWidth(svg, rows.map((r) => r.right)) + 16;
    const rowH = 28, top = 20, axisH = 22;
    const plotH = rows.length * rowH;
    size(top + plotH + axisH);
    const x = d3.scaleLinear(domain, [left, width - right]);
    for (const t of x.ticks(5)) {
      svg.append('line').attr('class', 'sr-gridline').attr('x1', x(t)).attr('x2', x(t)).attr('y1', top - 4).attr('y2', top + plotH);
      svg.append('text').attr('x', x(t)).attr('y', top + plotH + 16).attr('text-anchor', 'middle').text(d3.format('.1f')(t));
    }
    svg.append('line').attr('class', 'sr-ref').attr('x1', x(centre)).attr('x2', x(centre)).attr('y1', top - 6).attr('y2', top + plotH);
    if (centreLabel) label(svg, x(centre), 6, centreLabel, {anchor: 'middle'});
    rows.forEach((r, i) => {
      const cy = top + i * rowH + rowH / 2;
      label(svg, left - 12, cy, r.label, {anchor: 'end', cls: 'sr-strong'});
      label(svg, width, cy, r.right, {anchor: 'end'});
      const g = svg.append('g');
      if (r.low != null) {
        g.append('line').attr('x1', x(r.low)).attr('x2', x(r.high)).attr('y1', cy).attr('y2', cy)
          .style('stroke', 'var(--color-fg-muted)').style('stroke-width', 2).style('stroke-linecap', 'round');
      }
      if (r.estimate != null) {
        g.append('circle').attr('cx', x(r.estimate)).attr('cy', cy).attr('r', 5)
          .style('fill', r.strong ? dash.colors[0] : 'var(--color-panel)').style('stroke', dash.colors[0]).style('stroke-width', 2);
      }
      g.append('rect').attr('x', 0).attr('y', cy - rowH / 2).attr('width', width).attr('height', rowH).style('fill', 'transparent');
      g.on('mousemove', (event) => tip.show(event, r.label, r.tip)).on('mouseleave', () => tip.hide());
    });
  }

  // Dot strips on one scale. rows: {label, heading?, values: [{x, key, tip}], right}; a dashed tick marks each row's median.
  function strips(box, rows, keys, {domain, tickFormat = String, ticks}) {
    const {svg, width, tip, size} = frame(box, keys);
    const bars = rows.filter((r) => !r.heading);
    const left = textWidth(svg, bars.map((r) => r.label)) + 12;
    const right = textWidth(svg, bars.map((r) => r.right ?? '')) + 14;
    const rowH = 30, headH = 24, axisH = 22;
    let y = 0;
    const laid = rows.map((r) => { const top = y; y += r.heading ? headH : rowH; return {r, top}; });
    const plotH = y;
    size(plotH + axisH);
    const x = d3.scaleLinear(domain, [left, width - right]);
    let lastRight = -Infinity;
    for (const t of ticks ?? x.ticks(5)) {
      const text = tickFormat(t);
      const half = textWidth(svg, [text]) / 2;
      svg.append('line').attr('class', 'sr-gridline').attr('x1', x(t)).attr('x2', x(t)).attr('y1', 0).attr('y2', plotH);
      if (x(t) - half < lastRight + 6) continue;
      lastRight = x(t) + half;
      svg.append('text').attr('x', x(t)).attr('y', plotH + 16).attr('text-anchor', 'middle').text(text);
    }
    for (const {r, top} of laid) {
      if (r.heading) {
        label(svg, 0, top + 13, r.label, {cls: 'sr-strong'});
        continue;
      }
      const cy = top + rowH / 2;
      label(svg, left - 12, cy, r.label, {anchor: 'end'});
      if (r.right) label(svg, width - right + 14, cy, r.right);
      const vals = r.values.filter((v) => v.x != null).sort((a, b) => a.x - b.x);
      if (vals.length > 1) {
        const med = d3.median(vals, (v) => v.x);
        svg.append('line').attr('class', 'sr-ref').attr('x1', x(med)).attr('x2', x(med)).attr('y1', cy - 12).attr('y2', cy + 12);
      }
      vals.forEach((v, k) => {
        const g = svg.append('g');
        const dot = g.append('circle').attr('cx', x(v.x)).attr('cy', cy + ((k % 3) - 1) * 6).attr('r', 4.5)
          .style('fill', color(v.key)).style('fill-opacity', 0.85);
        if (LIGHT.has(v.key)) dot.style('stroke', 'var(--cds-chart-muted)').style('stroke-width', 1.5);
        g.on('mousemove', (event) => tip.show(event, r.head ?? r.label, v.tip)).on('mouseleave', () => tip.hide());
      });
    }
  }

  // Kaplan–Meier curves as the share of stars that had responded, one per state. rows: km rows for one basis,
  // response and tank ({state, kind: step|censor, t, responded, at_risk, n}).
  function kmChart(box, rows) {
    const states = ['quiescent', 'alert', 'moving'].filter((k) => rows.some((r) => r.state === k));
    const {svg, width, tip, size} = frame(box, states);
    const h = 280, top = 12, bottom = 28;
    const left = textWidth(svg, ['100%']) + 10;
    const n = Object.fromEntries(states.map((k) => [k, rows.find((r) => r.state === k)?.n ?? 0]));
    const ends = Object.fromEntries(states.map((k) => [k, d3.max(rows.filter((r) => r.state === k), (r) => r.t) ?? 0]));
    const right = textWidth(svg, states.map((k) => `${name(k)} (${n[k]})`)) + 14;
    size(h);
    const max = Math.max(300, d3.max(rows, (r) => r.t) || 0);
    const x = d3.scaleLinear([0, max], [left, width - right]);
    const y = d3.scaleLinear([0, 1], [h - bottom, top]);
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      svg.append('line').attr('class', v ? 'sr-gridline' : 'sr-axisline').attr('x1', left).attr('x2', width - right).attr('y1', y(v)).attr('y2', y(v));
      label(svg, left - 6, y(v), fmt.pct(v), {anchor: 'end'});
    }
    svg.append('line').attr('class', 'sr-ref').attr('x1', left).attr('x2', width - right).attr('y1', y(0.5)).attr('y2', y(0.5));
    let lastRight = -Infinity;
    for (const t of d3.range(0, max + 1, (x(60) - x(0)) < 46 ? 120 : 60)) {
      const text = t ? `${t / 60} min` : '0';
      const half = textWidth(svg, [text]) / 2;
      if (x(t) - half < lastRight + 6) continue;
      lastRight = x(t) + half;
      svg.append('text').attr('x', x(t)).attr('y', h - 8).attr('text-anchor', 'middle').text(text);
    }
    const steps = (k) => rows.filter((r) => r.state === k && r.kind === 'step').sort((a, b) => a.t - b.t);
    const at = (k, t) => { const st = steps(k).filter((r) => r.t <= t); return st.length ? st[st.length - 1].responded : 0; };
    const ends2 = [];
    for (const k of states) {
      const pts = steps(k);
      const line = [...pts.map((r) => [r.t, r.responded]), [ends[k], pts[pts.length - 1].responded]];
      svg.append('path').attr('d', d3.line().x((d) => x(d[0])).y((d) => y(d[1])).curve(d3.curveStepAfter)(line))
        .style('fill', 'none').style('stroke', color(k)).style('stroke-width', 2.5).style('stroke-linejoin', 'round');
      for (const r of rows.filter((q) => q.state === k && q.kind === 'censor')) {
        svg.append('line').attr('x1', x(r.t)).attr('x2', x(r.t)).attr('y1', y(r.responded) - 5).attr('y2', y(r.responded) + 5)
          .style('stroke', color(k)).style('stroke-width', 1.5);
      }
      ends2.push({k, y: y(line[line.length - 1][1])});
    }
    ends2.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends2.length; i++) ends2[i].y = Math.max(ends2[i].y, ends2[i - 1].y + 14);
    for (const e of ends2) label(svg, width - right + 8, e.y, `${name(e.k)} (${n[e.k]})`, {cls: 'sr-strong'});
    const rule = svg.append('line').attr('class', 'sr-rule').attr('y1', top).attr('y2', h - bottom).style('opacity', 0);
    svg.append('rect').attr('x', left).attr('y', top).attr('width', Math.max(0, width - right - left)).attr('height', h - bottom - top)
      .style('fill', 'transparent')
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event);
        const t = Math.max(0, x.invert(mx));
        rule.attr('x1', mx).attr('x2', mx).style('opacity', 1);
        tip.show(event, `${Math.round(t)} s after the first poke`, states.map((k) => ({
          text: `${name(k)}: ${fmt.pct(at(k, t))} responded${t > ends[k] ? ' (no stars left to follow)' : ''}`, color: color(k)})));
      })
      .on('mouseleave', () => { rule.style('opacity', 0); tip.hide(); });
  }

  // Small line charts across weeks. panels: [{title, series: [field…], domain, format, ref}]
  function weekLines(box, rows, panels) {
    const keys = [...new Set(panels.flatMap((p) => p.series))];
    const {svg, width, tip, size} = frame(box, keys);
    const cols = width >= 700 ? 2 : 1, gap = 28, panelH = 150, titleH = 20, axisH = 20;
    const pw = (width - gap * (cols - 1)) / cols;
    const rowsN = Math.ceil(panels.length / cols);
    size(rowsN * (titleH + panelH + axisH + 16) - 16);
    const weeks = rows.map((r) => r.week);
    panels.forEach((pn, i) => {
      const ox = (i % cols) * (pw + gap), oy = Math.floor(i / cols) * (titleH + panelH + axisH + 16);
      label(svg, ox, oy + 8, pn.title, {cls: 'sr-strong'});
      const left = textWidth(svg, pn.domain.map(pn.format)) + 8;
      const x = d3.scalePoint(weeks, [ox + left + 12, ox + pw - 12]);
      const y = d3.scaleLinear(pn.domain, [oy + titleH + panelH, oy + titleH + 6]);
      for (const v of y.ticks(3)) {
        svg.append('line').attr('class', 'sr-gridline').attr('x1', ox + left).attr('x2', ox + pw).attr('y1', y(v)).attr('y2', y(v));
        label(svg, ox + left - 6, y(v), pn.format(v), {anchor: 'end'});
      }
      if (pn.ref != null) svg.append('line').attr('class', 'sr-ref').attr('x1', ox + left).attr('x2', ox + pw).attr('y1', y(pn.ref)).attr('y2', y(pn.ref));
      let lastRight = -Infinity;
      for (const w of weeks) {
        const text = `W${w}`;
        const half = textWidth(svg, [text]) / 2;
        if (x(w) - half < lastRight + 4) continue;
        lastRight = x(w) + half;
        svg.append('text').attr('x', x(w)).attr('y', oy + titleH + panelH + 15).attr('text-anchor', 'middle').text(text);
      }
      for (const key of pn.series) {
        const pts = rows.filter((r) => r[key] != null);
        svg.append('path').attr('d', d3.line().x((r) => x(r.week)).y((r) => y(r[key]))(pts))
          .style('fill', 'none').style('stroke', color(key)).style('stroke-width', 2).style('stroke-linejoin', 'round');
        for (const r of pts) {
          const g = svg.append('g');
          g.append('circle').attr('cx', x(r.week)).attr('cy', y(r[key])).attr('r', 4).style('fill', color(key));
          g.append('circle').attr('cx', x(r.week)).attr('cy', y(r[key])).attr('r', 10).style('fill', 'transparent');
          g.on('mousemove', (event) => tip.show(event, `Week ${r.week} · ${fmt.date(r.round)}`, [{text: `${name(key)}: ${pn.format(r[key])}`, color: color(key)}]))
            .on('mouseleave', () => tip.hide());
        }
      }
    });
  }

  // Fills a marked table's body; sort is {field, dir} or null to keep the data's order.
  function table(el, rows, cols, sort, key) {
    let list = rows;
    if (sort?.field) {
      list = rows.slice().sort((a, b) => {
        const x = a[sort.field], y = b[sort.field];
        const c = typeof x === 'number' || typeof y === 'number' ? (x ?? -Infinity) - (y ?? -Infinity)
          : String(x ?? '').localeCompare(String(y ?? ''), undefined, {numeric: true});
        return sort.dir * c;
      });
      el.querySelectorAll('th').forEach((th) => th.setAttribute('aria-sort',
        th.dataset.field === sort.field ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'));
    }
    el.tBodies[0].replaceChildren(...list.map((r) => {
      const tr = document.createElement('tr');
      if (key) tr.dataset.key = r[key];
      for (const c of cols) {
        const td = document.createElement('td');
        const v = r[c.field];
        td.textContent = c.format ? c.format(v) : v == null || v === '' ? '—' : String(v);
        if (c.num) td.classList.add('num');
        if (c.wide) td.classList.add('sr-wide');
        tr.append(td);
      }
      return tr;
    }));
  }

  return {NAMES, name, color, fmt, band, bandNoun, ready, stacked, grouped, matrix, pace, barcode, moveTimes, schematic, trialLines, starDays, dayOverlay, dumbbell, forest, strips, kmChart, weekLines, table};
})();
