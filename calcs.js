// Worked-out values. Every figure on the page comes from these or from the three attached files.
// The files pool every week; a star is one week's animal in one container (the `star` column, e.g. "W2 starbot A").

dash.calc('overview', {
  title: 'Totals',
  description: 'Weeks covered, answers given so far out of every clip showing, and how many annotators have answered every clip of every week.',
  inputs: ['answers'],
  fn: (answers) => {
    const people = [...new Set(answers.map((r) => r.annotator))];
    const rounds = [...new Set(answers.map((r) => r.round))].sort();
    return [{
      weeks: rounds.length, first_round: rounds[0] ?? '', last_round: rounds[rounds.length - 1] ?? '',
      stars: new Set(answers.map((r) => r.star)).size,
      answered: answers.filter((r) => r.state).length,
      total: answers.length,
      clips: new Set(answers.map((r) => r.clip)).size,
      annotators: people.length,
      finished: people.filter((p) => answers.every((r) => r.annotator !== p || r.state)).length,
      last_answer: answers.map((r) => r.answered_at).filter(Boolean).sort().pop(),
    }];
  },
});

dash.calc('progress', {
  title: 'Progress by annotator',
  description: "Answers each annotator has given out of the clip showings in their order.",
  inputs: ['answers'],
  fn: (answers) => [...new Set(answers.map((r) => r.annotator))].sort().map((annotator) => {
    const mine = answers.filter((r) => r.annotator === annotator);
    const answered = mine.filter((r) => r.state).length;
    return {annotator, answered, remaining: mine.length - answered, total: mine.length, share: answered / mine.length};
  }),
});

dash.calc('pace', {
  title: 'Running count of answers',
  description: "Each first answer in time order, with how many the annotator had given by then in that week's round. Revisions are not counted.",
  inputs: ['activity'],
  fn: (activity) => {
    const count = {};
    return activity.filter((e) => e.event === 'label').sort((a, b) => a.time.localeCompare(b.time))
      .map((e) => ({week: e.week, annotator: e.annotator, time: e.time,
        answered: (count[`${e.week}|${e.annotator}`] = (count[`${e.week}|${e.annotator}`] || 0) + 1)}));
  },
});

dash.calc('timing', {
  title: 'How each annotator worked',
  description: 'Median seconds between answers (gaps over 10 minutes count as breaks and are left out), full loops played per answer, and revisions, steps back and times the tab was left.',
  inputs: ['activity'],
  fn: (activity) => [...new Set(activity.map((e) => e.annotator))].sort().map((annotator) => {
    const mine = activity.filter((e) => e.annotator === annotator);
    const times = mine.filter((e) => e.event === 'label').map((e) => Date.parse(e.time)).sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => (t - times[i]) / 1000).filter((s) => s < 600).sort((a, b) => a - b);
    const mid = gaps.length / 2;
    return {
      annotator,
      answered: times.length,
      median_seconds: !gaps.length ? null : gaps.length % 2 ? gaps[Math.floor(mid)] : (gaps[mid - 1] + gaps[mid]) / 2,
      loops_per_clip: times.length ? mine.filter((e) => e.event === 'loop_complete').length / times.length : null,
      revised: mine.filter((e) => e.event === 'revise').length,
      went_back: mine.filter((e) => e.event === 'back').length,
      left_tab: mine.filter((e) => e.event === 'hidden').length,
    };
  }),
});

dash.calc('mix', {
  title: 'Answer mix by annotator',
  description: "How often each annotator gave each answer, over both viewings. Eating is 'not_asked' for answers given before the eating question was added.",
  inputs: ['answers'],
  fn: (answers) => {
    const out = [];
    for (const annotator of [...new Set(answers.map((r) => r.annotator))]) {
      const mine = answers.filter((r) => r.annotator === annotator && r.state);
      const given = {
        state: mine.map((r) => r.state),
        eating: mine.filter((r) => r.state !== 'cant_tell').map((r) => r.eating || 'not_asked'),
      };
      for (const [question, list] of Object.entries(given)) {
        for (const answer of new Set(list)) {
          const count = list.filter((x) => x === answer).length;
          out.push({annotator, question, answer, count, share: count / list.length});
        }
      }
    }
    return out;
  },
});

dash.calc('drift', {
  title: 'Answer mix by part of the order',
  description: "Each annotator's answer mix in the first, middle and last third of their clip order, over every week.",
  inputs: ['answers'],
  fn: (answers) => {
    const last = {};  // each week's order length
    answers.forEach((r) => (last[r.week] = Math.max(last[r.week] || 0, Number(r.position))));
    const part = (r) => {
      const f = Number(r.position) / last[r.week];
      return f <= 1 / 3 ? 'First third' : f <= 2 / 3 ? 'Middle third' : 'Last third';
    };
    const groups = {};
    for (const r of answers.filter((x) => x.state)) {
      const key = `${r.annotator}|${part(r)}`;
      (groups[`${key}|state`] ??= []).push(r.state);
      if (r.state !== 'cant_tell') (groups[`${key}|eating`] ??= []).push(r.eating || 'not_asked');
    }
    const out = [];
    for (const [key, list] of Object.entries(groups)) {
      const [annotator, stage, question] = key.split('|');
      for (const answer of new Set(list)) {
        const count = list.filter((x) => x === answer).length;
        out.push({annotator, stage, question, answer, count, share: count / list.length});
      }
    }
    return out;
  },
});

dash.calc('clips', {
  title: 'Votes and outcome per clip',
  description: "First-viewing answers for each clip, the group call (the answer most annotators gave; 'tie' when the top answers are level), the poker's live call and the poke outcome. Can't tell is not a vote.",
  inputs: ['answers'],
  fn: (answers) => {
    const tally = (list) => {
      const votes = {};
      list.forEach((x) => (votes[x] = (votes[x] || 0) + 1));
      const top = Object.entries(votes).sort((a, b) => b[1] - a[1]);
      const call = !top.length ? '' : top.length === 1 || top[0][1] > top[1][1] ? top[0][0] : 'tie';
      const level = !list.length ? 'No answers' : list.length === 1 ? 'One answer'
        : top.length === 1 ? 'All agree' : call === 'tie' ? 'Split' : 'Most agree';
      return {votes, call, level, n: list.length};
    };
    const byClip = {};
    answers.forEach((r) => (byClip[r.clip] ??= []).push(r));
    return Object.entries(byClip).map(([clip, rows]) => {
      const first = rows.filter((r) => r.showing === '1');
      const s = tally(first.map((r) => r.state).filter((x) => ['quiescent', 'alert', 'moving'].includes(x)));
      const e = tally(first.map((r) => r.eating).filter((x) => ['eating', 'not_eating'].includes(x)));
      const r = rows[0];
      return {
        clip, week: r.week, round: r.round, star: r.star, tank: r.tank, camera: r.camera, poker: r.poker,
        live_state: r.live_state, outcome: r.outcome,
        seconds_to_move_away: r.seconds_to_move_away === '' ? null : Number(r.seconds_to_move_away),
        state_votes: s.n, quiescent: s.votes.quiescent || 0, alert: s.votes.alert || 0, moving: s.votes.moving || 0,
        state_call: s.call, state_level: s.level,
        eating_votes: e.n, eating: e.votes.eating || 0, not_eating: e.votes.not_eating || 0,
        eating_cant_tell: first.filter((x) => x.eating === 'cant_tell').length,
        eating_call: e.call, eating_level: e.level,
      };
    }).sort((a, b) => a.clip.localeCompare(b.clip));
  },
});

dash.calc('levels', {
  title: 'Clips by agreement level',
  description: 'How many clips have every first-viewing answer the same, most the same, or a tie, for each question.',
  inputs: ['clips'],
  fn: (clips) => ['All agree', 'Most agree', 'Split', 'One answer', 'No answers'].map((level) => ({
    level,
    state: clips.filter((c) => c.state_level === level).length,
    eating: clips.filter((c) => c.eating_level === level).length,
  })),
});

dash.calc('clip_table', {
  title: 'Clip table',
  description: 'The per-clip votes and calls with readable names, for the clip table.',
  inputs: ['clips'],
  fn: (clips) => {
    const word = {quiescent: 'Quiescent', alert: 'Alert', moving: 'Moving', eating: 'Eating', not_eating: 'Not eating', tie: 'Split', '': '—'};
    return clips.map((c) => ({
      clip: c.clip, week: c.week, tank: c.tank, camera: c.camera, quiescent: c.quiescent, alert: c.alert, moving: c.moving,
      group_call: word[c.state_call], agreement: c.state_level, live_call: word[c.live_state],
      eating_call: word[c.eating_call], outcome: c.outcome, seconds_to_move_away: c.seconds_to_move_away,
    }));
  },
});

dash.calc('agreement', {
  title: 'Agreement between answers',
  description: "Cohen's kappa and raw agreement for each pair of annotators (pair), each annotator's two viewings of a clip (repeat), and each annotator and the group call against the poker's live call (live). First-viewing answers; can't tell left out.",
  inputs: ['answers', 'clips'],
  fn: (answers, clips) => {
    const valid = {state: ['quiescent', 'alert', 'moving'], eating: ['eating', 'not_eating']};
    const kappa = (pairs) => {
      const n = pairs.length;
      if (!n) return null;
      const a = {}, b = {};
      pairs.forEach(([x, y]) => { a[x] = (a[x] || 0) + 1; b[y] = (b[y] || 0) + 1; });
      const po = pairs.filter(([x, y]) => x === y).length / n;
      const pe = Object.keys({...a, ...b}).reduce((s, k) => s + (a[k] || 0) * (b[k] || 0), 0) / (n * n);
      return pe >= 1 ? null : (po - pe) / (1 - pe);
    };
    const out = [];
    const add = (kind, question, a, b, pairs) => out.push({kind, question, a, b, n: pairs.length,
      agreement: pairs.length ? pairs.filter(([x, y]) => x === y).length / pairs.length : null, kappa: kappa(pairs)});
    const people = [...new Set(answers.map((r) => r.annotator))];
    const live = Object.fromEntries(clips.filter((c) => valid.state.includes(c.live_state)).map((c) => [c.clip, c.live_state]));
    for (const question of ['state', 'eating']) {
      const seen = {};  // seen[showing][clip][annotator] = answer
      for (const r of answers) {
        if (valid[question].includes(r[question])) ((seen[r.showing] ??= {})[r.clip] ??= {})[r.annotator] = r[question];
      }
      const first = seen['1'] || {}, second = seen['2'] || {};
      for (const a of people) {
        for (const b of people) {
          if (a !== b) add('pair', question, a, b, Object.values(first).filter((v) => v[a] && v[b]).map((v) => [v[a], v[b]]));
        }
        add('repeat', question, a, a, Object.keys(first).filter((c) => first[c][a] && second[c]?.[a]).map((c) => [first[c][a], second[c][a]]));
        if (question === 'state') add('live', question, a, 'Live call', Object.keys(first).filter((c) => first[c][a] && live[c]).map((c) => [first[c][a], live[c]]));
      }
    }
    add('live', 'state', 'Group call', 'Live call', clips.filter((c) => valid.state.includes(c.state_call) && live[c.clip]).map((c) => [c.state_call, live[c.clip]]));
    return out;
  },
});

dash.calc('alpha', {
  title: "Krippendorff's alpha",
  description: "Agreement across all annotators at once (nominal), from first-viewing answers; can't tell left out. Clips counts those with two or more answers.",
  inputs: ['answers'],
  fn: (answers) => ['state', 'eating'].map((question) => {
    const valid = question === 'state' ? ['quiescent', 'alert', 'moving'] : ['eating', 'not_eating'];
    const units = {};
    answers.filter((r) => r.showing === '1' && valid.includes(r[question])).forEach((r) => (units[r.clip] ??= []).push(r[question]));
    const pairs = {};  // coincidences between answers on the same clip
    for (const values of Object.values(units)) {
      if (values.length < 2) continue;
      values.forEach((c, i) => values.forEach((k, j) => {
        if (i !== j) pairs[`${c}|${k}`] = (pairs[`${c}|${k}`] || 0) + 1 / (values.length - 1);
      }));
    }
    const marginal = {};
    Object.entries(pairs).forEach(([key, v]) => (marginal[key.split('|')[0]] = (marginal[key.split('|')[0]] || 0) + v));
    const n = Object.values(marginal).reduce((s, v) => s + v, 0);
    const observed = Object.entries(pairs).filter(([key]) => key.split('|')[0] !== key.split('|')[1]).reduce((s, [, v]) => s + v, 0);
    let expected = 0;
    for (const c in marginal) for (const k in marginal) if (c !== k) expected += marginal[c] * marginal[k];
    return {question, alpha: n > 1 && expected ? 1 - ((n - 1) * observed) / expected : null,
      clips: Object.values(units).filter((v) => v.length >= 2).length};
  }),
});

dash.calc('outcome', {
  title: 'Poke outcome by call',
  description: "What the star did when poked, for clips grouped by the group call from video and, separately, by the poker's live call.",
  inputs: ['clips'],
  fn: (clips) => {
    const out = [];
    for (const [basis, field, states] of [
      ['Group call', 'state_call', ['quiescent', 'alert', 'moving', 'tie']],
      ['Live call', 'live_state', ['quiescent', 'alert', 'moving']],
    ]) {
      for (const state of states) {
        const group = clips.filter((c) => c[field] === state);
        for (const outcome of ['Moved away', "Moved, didn't leave", 'No movement']) {
          const n = group.filter((c) => c.outcome === outcome).length;
          out.push({basis, state, outcome, clips: n, of: group.length, share: group.length ? n / group.length : null});
        }
      }
    }
    return out;
  },
});

dash.calc('confusion', {
  title: 'Group call vs live call',
  description: "Clips counted by the group's call from video and the poker's live call.",
  inputs: ['clips'],
  fn: (clips) => {
    const out = [];
    for (const group_call of ['quiescent', 'alert', 'moving', 'tie']) {
      for (const live of ['quiescent', 'alert', 'moving', '']) {
        out.push({group_call, live_call: live || 'not recorded',
          clips: clips.filter((c) => c.state_call === group_call && c.live_state === live).length});
      }
    }
    return out;
  },
});

dash.calc('own', {
  title: 'Own trials vs others',
  description: "For annotators who also poked: how often their first-viewing state matches the live call, and the other annotators' majority, on trials they poked versus trials someone else poked.",
  inputs: ['answers'],
  fn: (answers) => {
    const valid = ['quiescent', 'alert', 'moving'];
    const first = answers.filter((r) => r.showing === '1' && valid.includes(r.state));
    const majority = (clip, except) => {
      const votes = {};
      first.filter((o) => o.clip === clip && o.annotator !== except).forEach((o) => (votes[o.state] = (votes[o.state] || 0) + 1));
      const top = Object.entries(votes).sort((a, b) => b[1] - a[1]);
      return top.length && (top.length === 1 || top[0][1] > top[1][1]) ? top[0][0] : null;
    };
    const out = [];
    for (const annotator of [...new Set(first.filter((r) => r.annotator_poked === 'true').map((r) => r.annotator))].sort()) {
      for (const own of [true, false]) {
        const mine = first.filter((r) => r.annotator === annotator && (r.annotator_poked === 'true') === own);
        const live = mine.filter((r) => valid.includes(r.live_state));
        const peers = mine.map((r) => [r.state, majority(r.clip, annotator)]).filter(([, m]) => m);
        const liveMatched = live.filter((r) => r.state === r.live_state).length;
        const peerMatched = peers.filter(([a, b]) => a === b).length;
        out.push({annotator, trials: own ? 'Own trials' : "Others' trials",
          live_clips: live.length, live_matched: liveMatched, live_match: live.length ? liveMatched / live.length : null,
          peer_clips: peers.length, peer_matched: peerMatched, peer_match: peers.length ? peerMatched / peers.length : null});
      }
    }
    return out;
  },
});

dash.calc('trial_steps', {
  title: 'Typical trial timing',
  description: 'Median seconds for each step of a poke trial, over the trials where that step happened.',
  inputs: ['trials'],
  fn: (trials) => {
    const median = (values) => {
      const s = values.filter((v) => v !== '').map(Number).sort((a, b) => a - b);
      const m = s.length / 2;
      return !s.length ? null : s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2;
    };
    return [
      ['entry_to_poke', 'Entry to first poke', 'entry_to_poke_s'],
      ['poke_to_first_movement', 'First poke to first movement', 'poke_to_first_movement_s'],
      ['poke_to_move_away', 'First poke to moving away', 'poke_to_move_away_s'],
      ['poke_to_exit', 'First poke to exit', 'poke_to_exit_s'],
    ].map(([step, label, field]) => ({step, label, seconds: median(trials.map((t) => t[field])),
      trials: trials.filter((t) => t[field] !== '').length}));
  },
});

dash.calc('trial_groups', {
  title: 'Response by tank, poker and week',
  description: 'For each tank, poker and week: trials, how many stars moved at all and moved away, and the median seconds from first poke to moving away.',
  inputs: ['trials'],
  fn: (trials) => {
    const median = (values) => {
      const s = values.filter((v) => v !== '').map(Number).sort((a, b) => a - b);
      const m = s.length / 2;
      return !s.length ? null : s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2;
    };
    const summary = (group, by, list) => {
      const away = list.filter((t) => t.outcome === 'Moved away');
      return {group, by, trials: list.length, moved: list.filter((t) => t.outcome !== 'No movement').length,
        moved_away: away.length, share_moved_away: list.length ? away.length / list.length : null,
        median_to_move_away_s: median(away.map((t) => t.poke_to_move_away_s))};
    };
    const out = [summary('All trials', 'All', trials)];
    for (const [by, field] of [['Tank', 'tank'], ['Poker', 'poker']]) {
      for (const value of [...new Set(trials.map((t) => t[field]))].sort()) out.push(summary(value, by, trials.filter((t) => t[field] === value)));
    }
    for (const week of [...new Set(trials.map((t) => Number(t.week)))].sort((a, b) => a - b)) {
      out.push(summary(`Week ${week}`, 'Week', trials.filter((t) => Number(t.week) === week)));
    }
    return out;
  },
});

dash.calc('clip_notes', {
  title: "Poker's notes per clip",
  description: "The poker's free-text note for each reviewed clip's trial, and whether it mentions eating.",
  inputs: ['trials'],
  fn: (trials) => trials.filter((t) => t.clip).map((t) => ({clip: t.clip, notes: t.notes, notes_say_eating: /\beat/i.test(t.notes)})),
});

dash.calc('star_days', {
  title: 'Each star through the day',
  description: "For every poke, the mean and spread of all annotator answers for its clip (both viewings; quiescent 0, alert 1, moving 2; can't tell left out), beside the live call and the outcome. A star is one week's animal in one container.",
  inputs: ['answers', 'trials'],
  fn: (answers, trials) => {
    const states = ['quiescent', 'alert', 'moving'];
    return trials.map((t) => {
      const given = answers.filter((a) => t.clip && a.clip === t.clip).map((a) => states.indexOf(a.state)).filter((v) => v >= 0);
      const n = given.length;
      const mean = n ? given.reduce((s, v) => s + v, 0) / n : null;
      const variance = n > 1 ? given.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : null;
      return {
        trial: t.trial, week: Number(t.week), round: t.round, star: t.star, tank: t.tank, camera: t.camera,
        entry_time: t.entry_time, clip: t.clip,
        answers: n, quiescent: given.filter((v) => v === 0).length, alert: given.filter((v) => v === 1).length,
        moving: given.filter((v) => v === 2).length, mean_score: mean, variance, sd: variance == null ? null : Math.sqrt(variance),
        live_state: t.live_state, live_score: states.includes(t.live_state) ? states.indexOf(t.live_state) : null,
        outcome: t.outcome, review: t.review,
      };
    });
  },
});

dash.calc('annotator_outcome', {
  title: "Poke outcome by each annotator's call",
  description: "What the star did when poked, for clips grouped by each annotator's first-viewing state, beside the group call and the poker's live call (reviewed clips only).",
  inputs: ['answers', 'clips'],
  fn: (answers, clips) => {
    const states = ['quiescent', 'alert', 'moving'];
    const callers = [...new Set(answers.map((a) => a.annotator))].sort().map((who) => ({who, kind: 'Annotator',
      calls: answers.filter((a) => a.annotator === who && a.showing === '1' && states.includes(a.state))
        .map((a) => ({state: a.state, outcome: a.outcome}))}));
    callers.push({who: 'Group call', kind: 'Group', calls: clips.filter((c) => states.includes(c.state_call)).map((c) => ({state: c.state_call, outcome: c.outcome}))});
    callers.push({who: 'Live call', kind: 'Live', calls: clips.filter((c) => states.includes(c.live_state)).map((c) => ({state: c.live_state, outcome: c.outcome}))});
    const out = [];
    for (const {who, kind, calls} of callers) {
      for (const state of states) {
        const mine = calls.filter((c) => c.state === state);
        for (const outcome of ['Moved away', "Moved, didn't leave", 'No movement']) {
          const n = mine.filter((c) => c.outcome === outcome).length;
          out.push({who, kind, state, outcome, clips: n, of: mine.length, share: mine.length ? n / mine.length : null});
        }
      }
    }
    return out;
  },
});

dash.calc('annotator_split', {
  title: 'Moved-away rate by call',
  description: 'For each caller, the share of clips whose star moved away after each state call, and the gap between alert and quiescent calls (left out when either call has fewer than 3 clips).',
  inputs: ['annotator_outcome'],
  fn: (annotator_outcome) => [...new Set(annotator_outcome.map((r) => r.who))].map((who) => {
    const away = (state) => annotator_outcome.find((r) => r.who === who && r.state === state && r.outcome === 'Moved away');
    const q = away('quiescent'), a = away('alert'), m = away('moving');
    return {who, kind: q.kind, quiescent: q.share, alert: a.share, moving: m.share,
      quiescent_clips: q.of, alert_clips: a.of, moving_clips: m.of,
      quiescent_away: q.clips, alert_away: a.clips, moving_away: m.clips,
      gap: q.of >= 3 && a.of >= 3 ? a.share - q.share : null};
  }),
});

dash.calc('day_cycles', {
  title: 'All stars, poke by poke',
  description: "Each round of pokes through each poking day (every star's first poke, second poke, and so on), per week: the mean and spread of all annotator answers across the stars (quiescent 0, alert 1, moving 2), the mean live call, and how many stars moved away.",
  inputs: ['star_days'],
  fn: (star_days) => {
    const byStar = {};
    star_days.forEach((r) => (byStar[r.star] ??= []).push(r));
    const cycle = {};
    for (const list of Object.values(byStar)) {
      list.sort((a, b) => a.entry_time.localeCompare(b.entry_time)).forEach((r, i) => (cycle[r.trial] = i + 1));
    }
    const keys = [...new Set(star_days.map((r) => `${r.week}|${cycle[r.trial]}`))]
      .map((k) => k.split('|').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return keys.map(([week, k]) => {
      const rows = star_days.filter((r) => r.week === week && cycle[r.trial] === k);
      const q = rows.reduce((s, r) => s + r.quiescent, 0), a = rows.reduce((s, r) => s + r.alert, 0), m = rows.reduce((s, r) => s + r.moving, 0);
      const n = q + a + m;
      const mean = n ? (a + 2 * m) / n : null;
      const variance = n > 1 ? (q * mean ** 2 + a * (1 - mean) ** 2 + m * (2 - mean) ** 2) / (n - 1) : null;
      const times = rows.map((r) => r.entry_time).sort();
      const live = rows.filter((r) => r.live_score != null);
      return {
        week, poke: k, time: times[Math.floor(times.length / 2)], first_entry: times[0], last_entry: times[times.length - 1],
        stars: rows.length, clips: rows.filter((r) => r.answers).length, answers: n,
        mean_score: mean, variance, sd: variance == null ? null : Math.sqrt(variance),
        live_mean: live.length ? live.reduce((s, r) => s + r.live_score, 0) / live.length : null, live_calls: live.length,
        moved_away: rows.filter((r) => r.outcome === 'Moved away').length,
      };
    });
  },
});

dash.calc('stat_summary', {
  title: 'Statistical summary',
  description: "Tests for the page's main questions, pooling every week. 95% intervals are bootstrap percentiles over clips (1,000 resamples, fixed seed so figures don't change between loads). p-values are two-sided: Fisher's exact test for differences in rates, 2,000-shuffle permutation tests otherwise. Not adjusted for multiple comparisons. AUC is the chance that a clip whose star moved away got a more active call than one whose star didn't (0.5 = no link).",
  inputs: ['answers', 'clips', 'star_days'],
  fn: (answers, clips, star_days) => {
    let seed = 20261015;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const B = 1000, P = 2000;
    const pick = (xs) => xs.map(() => xs[Math.floor(rand() * xs.length)]);
    const shuffle = (xs) => {
      const a = xs.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    };
    const quantile = (xs, q) => {
      const s = xs.filter((v) => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
      return s.length ? s[Math.round(q * (s.length - 1))] : null;
    };
    const boot = (stat, units) => {
      const reps = [];
      for (let i = 0; i < B; i++) reps.push(stat(pick(units)));
      return [quantile(reps, 0.025), quantile(reps, 0.975)];
    };
    const kappa = (pairs) => {
      const n = pairs.length;
      if (!n) return null;
      const a = {}, b = {};
      pairs.forEach(([x, y]) => { a[x] = (a[x] || 0) + 1; b[y] = (b[y] || 0) + 1; });
      const po = pairs.filter(([x, y]) => x === y).length / n;
      const pe = Object.keys({...a, ...b}).reduce((s, k) => s + (a[k] || 0) * (b[k] || 0), 0) / (n * n);
      return pe >= 1 ? null : (po - pe) / (1 - pe);
    };
    // Krippendorff's α (nominal) from each clip's answer counts (rows: {c: count per category, m: answers})
    const toCounts = (units, cats) => units.filter((v) => v.length >= 2)
      .map((v) => ({c: cats.map((k) => v.filter((x) => x === k).length), m: v.length}));
    const alpha = (rows) => {
      if (!rows.length) return null;
      const k = rows[0].c.length, o = Array.from({length: k}, () => Array(k).fill(0));
      for (const {c, m} of rows) {
        for (let a = 0; a < k; a++) if (c[a]) for (let b = 0; b < k; b++) o[a][b] += (c[a] * (c[b] - (a === b ? 1 : 0))) / (m - 1);
      }
      const nc = o.map((r) => r.reduce((x, y) => x + y, 0)), n = nc.reduce((x, y) => x + y, 0);
      let obs = 0, exp = 0;
      for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) if (a !== b) { obs += o[a][b]; exp += nc[a] * nc[b]; }
      return n > 1 && exp ? 1 - ((n - 1) * obs) / exp : null;
    };
    // AUC from the rank sum of the stars that moved away (Mann–Whitney), so it stays quick as weeks pile up
    const aucFromRanks = (r, ys) => {
      let pos = 0, sum = 0;
      ys.forEach((y, i) => { if (y) { pos++; sum += r[i]; } });
      const neg = ys.length - pos;
      return pos && neg ? (sum - (pos * (pos + 1)) / 2) / (pos * neg) : null;
    };
    const auc = (pairs) => aucFromRanks(ranks(pairs.map((p) => p[0])), pairs.map((p) => p[1]));  // pairs: [score, moved away]
    const aucPermute = (pairs) => {
      const r = ranks(pairs.map((p) => p[0])), ys = pairs.map((p) => p[1]);
      const obs = aucFromRanks(r, ys);
      if (obs == null) return null;
      let hit = 0;
      for (let i = 0; i < P; i++) if (Math.abs(aucFromRanks(r, shuffle(ys)) - 0.5) >= Math.abs(obs - 0.5) - 1e-12) hit++;
      return (hit + 1) / (P + 1);
    };
    const enough = (pairs) => pairs.filter((p) => p[1]).length >= 3 && pairs.filter((p) => !p[1]).length >= 3;
    const aucBoot = (pairs) => {
      const pos = pairs.filter((p) => p[1]), neg = pairs.filter((p) => !p[1]);
      if (!enough(pairs)) return [null, null];
      const reps = [];
      for (let i = 0; i < B; i++) reps.push(auc([...pick(pos), ...pick(neg)]));
      return [quantile(reps, 0.025), quantile(reps, 0.975)];
    };
    const lf = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
    const fisher = (a, b, c, d) => {  // [a moved, b not] vs [c moved, d not]
      const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
      const p = (x) => Math.exp(lf(r1) + lf(r2) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(r2 - c1 + x));
      const obs = p(a);
      let total = 0;
      for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) if (p(x) <= obs * (1 + 1e-7)) total += p(x);
      return Math.min(1, total);
    };
    const rate = (g) => g.filter(Boolean).length / g.length;
    const ranks = (xs) => {
      const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
      const r = [];
      for (let i = 0; i < idx.length;) {
        let j = i;
        while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
        for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
        i = j + 1;
      }
      return r;
    };
    const pearson = (a, b) => {
      const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
      let num = 0, da = 0, db = 0;
      for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
      return da && db ? num / Math.sqrt(da * db) : null;
    };
    const spearman = (pairs) => pearson(ranks(pairs.map((p) => p[0])), ranks(pairs.map((p) => Number(p[1]))));
    const spearmanPermute = (pairs) => {  // ranks once, then shuffle one side
      const a = ranks(pairs.map((p) => p[0])), r = ranks(pairs.map((p) => Number(p[1])));
      const obs = pearson(a, r);
      if (obs == null) return null;
      let hit = 0;
      for (let i = 0; i < P; i++) if (Math.abs(pearson(a, shuffle(r))) >= Math.abs(obs) - 1e-12) hit++;
      return (hit + 1) / (P + 1);
    };

    const f2 = (v) => (v == null ? '—' : v.toFixed(2).replace('-', '−'));
    const pts = (v) => {
      const r = v == null ? null : Math.round(v * 100);
      return r == null ? '—' : `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)} pts`;
    };
    const pText = (p) => (p == null ? '—' : p < 0.001 ? '<0.001' : p.toFixed(3));
    const band = (v) => (v == null ? 'Not enough answers' : v < 0 ? 'Below chance' : v <= 0.2 ? 'Slight agreement' : v <= 0.4 ? 'Fair agreement'
      : v <= 0.6 ? 'Moderate agreement' : v <= 0.8 ? 'Substantial agreement' : 'Almost perfect agreement');
    // readings follow the p-value, so they never disagree with it
    const read = (p, est, centre, yes, no) => (p == null ? 'Too few clips in one group to tell'
      : p < 0.05 ? (est > centre ? yes : no) : p < 0.1 ? `A hint, not conclusive: ${(est > centre ? yes : no).toLowerCase()}` : 'No clear link at this sample size');
    const readAuc = (p, est) => read(p, est, 0.5, 'More active calls went with moving away', 'More active calls went with not moving away');
    const readDiff = (p, est, yes) => read(p, est, 0, yes, 'The opposite: fewer moved away');
    const rows = [];
    const add = (topic, question, measure, est, [lo, hi], p, n, reading, unit = 'stat', label = '') => rows.push({
      id: `s${rows.length + 1}`, topic, label, question, measure, estimate: est, ci_low: lo, ci_high: hi, p, n, reading,
      estimate_text: unit === 'pts' ? pts(est) : f2(est),
      interval: lo == null ? '—' : unit === 'pts' ? `${pts(lo)} to ${pts(hi)}` : `${f2(lo)} to ${f2(hi)}`, p_text: pText(p)});

    const states = ['quiescent', 'alert', 'moving'];
    const moved = Object.fromEntries(clips.map((c) => [c.clip, c.outcome === 'Moved away']));
    const people = [...new Set(answers.map((a) => a.annotator))].sort();
    const first = answers.filter((a) => a.showing === '1');

    // Agreement
    for (const [q, valid] of [['state', states], ['eating', ['eating', 'not_eating']]]) {
      const units = {};
      first.filter((a) => valid.includes(a[q])).forEach((a) => (units[a.clip] ??= []).push(a[q]));
      const list = toCounts(Object.values(units), valid);
      const est = alpha(list);
      add('Agreement', `Do annotators agree on ${q === 'state' ? 'the state' : 'eating'}?`, "Krippendorff's α", est, boot(alpha, list), null, list.length, band(est));
    }
    const gl = clips.filter((c) => states.includes(c.state_call) && states.includes(c.live_state)).map((c) => [c.state_call, c.live_state]);
    const kgl = kappa(gl);
    add('Agreement', 'Does the group call from video match the live call?', "Cohen's κ", kgl, boot(kappa, gl), null, gl.length, band(kgl));

    // Prediction: does the state go with moving away?
    const scored = star_days.filter((r) => r.clip && r.mean_score != null).map((r) => [r.mean_score, moved[r.clip]]);
    const aAll = auc(scored), pAll = aucPermute(scored);
    add('Predicting the response', "Does the annotators' mean score predict moving away?", 'AUC', aAll, aucBoot(scored), pAll, scored.length,
      readAuc(pAll, aAll), 'stat', 'All annotators, mean score');
    for (const who of people) {
      const mine = first.filter((a) => a.annotator === who && states.includes(a.state)).map((a) => [states.indexOf(a.state), moved[a.clip]]);
      const est = auc(mine), p = enough(mine) ? aucPermute(mine) : null;
      add('Predicting the response', `Does ${who}'s call predict moving away?`, 'AUC', est, aucBoot(mine), p, mine.length, readAuc(p, est), 'stat', who);
    }
    const live = clips.filter((c) => states.includes(c.live_state)).map((c) => [states.indexOf(c.live_state), moved[c.clip]]);
    const aLive = auc(live), pLive = aucPermute(live);
    add('Predicting the response', "Does the poker's live call predict moving away?", 'AUC', aLive, aucBoot(live), pLive, live.length,
      readAuc(pLive, aLive), 'stat', 'Live call');
    for (const [label, field] of [['group call', 'state_call'], ['live call', 'live_state']]) {
      const al = clips.filter((c) => c[field] === 'alert').map((c) => moved[c.clip]);
      const qu = clips.filter((c) => c[field] === 'quiescent').map((c) => moved[c.clip]);
      if (!al.length || !qu.length) continue;
      const p = fisher(al.filter(Boolean).length, al.filter((x) => !x).length, qu.filter(Boolean).length, qu.filter((x) => !x).length);
      const reps = [];
      for (let i = 0; i < B; i++) reps.push(rate(pick(al)) - rate(pick(qu)));
      add('Predicting the response', `Alert vs quiescent ${label}: do more alert stars move away?`, 'Difference in share moved away',
        rate(al) - rate(qu), [quantile(reps, 0.025), quantile(reps, 0.975)], p, al.length + qu.length,
        readDiff(p, rate(al) - rate(qu), 'Alert stars moved away more often'), 'pts');
    }

    // Context: tank and time of day
    const byTank = {};
    star_days.forEach((r) => (byTank[r.tank] ??= []).push(r.outcome === 'Moved away'));
    const tanks = Object.keys(byTank).sort();
    if (tanks.length === 2) {
      const [t1, t2] = tanks.map((t) => byTank[t]);
      const p = fisher(t1.filter(Boolean).length, t1.filter((x) => !x).length, t2.filter(Boolean).length, t2.filter((x) => !x).length);
      const reps = [];
      for (let i = 0; i < B; i++) reps.push(rate(pick(t1)) - rate(pick(t2)));
      add('Context', `Do more stars move away in ${tanks[0]} than in ${tanks[1]}?`, 'Difference in share moved away', rate(t1) - rate(t2),
        [quantile(reps, 0.025), quantile(reps, 0.975)], p, t1.length + t2.length,
        readDiff(p, rate(t1) - rate(t2), `More stars moved away in ${tanks[0]}: compare states within each tank`), 'pts');
    }
    for (const t of tanks) {
      const within = star_days.filter((r) => r.tank === t && r.clip && r.mean_score != null).map((r) => [r.mean_score, moved[r.clip]]);
      const est = auc(within), p = enough(within) ? aucPermute(within) : null;
      add('Context', `Within ${t}, does the mean score still predict moving away?`, 'AUC', est, aucBoot(within), p, within.length,
        readAuc(p, est), 'stat', `Within ${t}`);
    }
    const order = {};
    const byStar = {};
    star_days.forEach((r) => (byStar[r.star] ??= []).push(r));
    Object.values(byStar).forEach((list) => list.sort((a, b) => a.entry_time.localeCompare(b.entry_time)).forEach((r, i) => (order[r.trial] = i + 1)));
    const trend = star_days.filter((r) => r.mean_score != null).map((r) => [order[r.trial], r.mean_score]);
    const rho1 = spearman(trend), p1 = spearmanPermute(trend);
    add('Context', "Does the annotated state change with each star's poke number through the day?", "Spearman's ρ", rho1, boot(spearman, trend), p1,
      trend.length, p1 < 0.1 ? read(p1, rho1, 0, 'Stars looked more active as the day went on', 'Stars looked less active as the day went on') : 'No clear trend through the day');
    const trendAway = star_days.map((r) => [order[r.trial], r.outcome === 'Moved away' ? 1 : 0]);
    const rho2 = spearman(trendAway), p2 = spearmanPermute(trendAway);
    add('Context', 'Does moving away change with poke number through the day?', "Spearman's ρ", rho2, boot(spearman, trendAway), p2,
      trendAway.length, p2 < 0.1 ? read(p2, rho2, 0, 'Stars moved away more as the day went on', 'Stars moved away less as the day went on') : 'No clear trend through the day');
    // Across weeks, once there is more than one
    if (new Set(star_days.map((r) => r.week)).size > 1) {
      const wk = star_days.filter((r) => r.mean_score != null).map((r) => [r.week, r.mean_score]);
      const rho3 = spearman(wk), p3 = spearmanPermute(wk);
      add('Context', 'Does the annotated state change from week to week?', "Spearman's ρ", rho3, boot(spearman, wk), p3, wk.length,
        p3 < 0.1 ? read(p3, rho3, 0, 'Later weeks looked more active', 'Later weeks looked less active') : 'No clear trend across weeks');
      const wa = star_days.map((r) => [r.week, r.outcome === 'Moved away' ? 1 : 0]);
      const rho4 = spearman(wa), p4 = spearmanPermute(wa);
      add('Context', 'Does moving away change from week to week?', "Spearman's ρ", rho4, boot(spearman, wa), p4, wa.length,
        p4 < 0.1 ? read(p4, rho4, 0, 'Stars moved away more in later weeks', 'Stars moved away less in later weeks') : 'No clear trend across weeks');
    }
    return rows;
  },
});

dash.calc('tank_tests', {
  title: 'Starbase vs starbot',
  description: "Each measure for the two tanks with the most trials, their difference, a 95% bootstrap interval for it (1,000 resamples within each tank, fixed seed) and a two-sided p-value: Fisher's exact test for shares, a 1,000-shuffle permutation of tank labels otherwise. Not adjusted for multiple comparisons.",
  inputs: ['answers', 'clips', 'star_days', 'trials'],
  fn: (answers, clips, star_days, trials) => {
    let seed = 20261016;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const B = 1000, P = 1000;
    const pick = (xs) => xs.map(() => xs[Math.floor(rand() * xs.length)]);
    const shuffle = (xs) => {
      const a = xs.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    };
    const quantile = (xs, q) => {
      const s = xs.filter((v) => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
      return s.length ? s[Math.round(q * (s.length - 1))] : null;
    };
    const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
    const median = (xs) => {
      const s = xs.slice().sort((a, b) => a - b), m = s.length / 2;
      return !s.length ? null : s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2;
    };
    const rate = (xs) => (xs.length ? xs.filter(Boolean).length / xs.length : null);
    const kappa = (pairs) => {
      const n = pairs.length;
      if (!n) return null;
      const a = {}, b = {};
      pairs.forEach(([x, y]) => { a[x] = (a[x] || 0) + 1; b[y] = (b[y] || 0) + 1; });
      const po = pairs.filter(([x, y]) => x === y).length / n;
      const pe = Object.keys({...a, ...b}).reduce((s, k) => s + (a[k] || 0) * (b[k] || 0), 0) / (n * n);
      return pe >= 1 ? null : (po - pe) / (1 - pe);
    };
    // Krippendorff's α (nominal) from each clip's answer counts (rows: {c: count per category, m: answers})
    const toCounts = (units, cats) => units.filter((v) => v.length >= 2)
      .map((v) => ({c: cats.map((k) => v.filter((x) => x === k).length), m: v.length}));
    const alpha = (rows) => {
      if (!rows.length) return null;
      const k = rows[0].c.length, o = Array.from({length: k}, () => Array(k).fill(0));
      for (const {c, m} of rows) {
        for (let a = 0; a < k; a++) if (c[a]) for (let b = 0; b < k; b++) o[a][b] += (c[a] * (c[b] - (a === b ? 1 : 0))) / (m - 1);
      }
      const nc = o.map((r) => r.reduce((x, y) => x + y, 0)), n = nc.reduce((x, y) => x + y, 0);
      let obs = 0, exp = 0;
      for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) if (a !== b) { obs += o[a][b]; exp += nc[a] * nc[b]; }
      return n > 1 && exp ? 1 - ((n - 1) * obs) / exp : null;
    };
    const lf = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
    const fisher = (xs, ys) => {
      const a = xs.filter(Boolean).length, b = xs.length - a, c = ys.filter(Boolean).length, d = ys.length - c;
      const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
      const p = (x) => Math.exp(lf(r1) + lf(r2) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(r2 - c1 + x));
      let total = 0;
      for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) if (p(x) <= p(a) * (1 + 1e-7)) total += p(x);
      return Math.min(1, total);
    };
    const bootDiff = (xs, ys, stat) => {
      const reps = [];
      for (let i = 0; i < B; i++) { const a = stat(pick(xs)), b = stat(pick(ys)); reps.push(a == null || b == null ? null : a - b); }
      return [quantile(reps, 0.025), quantile(reps, 0.975)];
    };
    const permDiff = (xs, ys, stat) => {
      const obs = stat(xs) - stat(ys);
      const all = [...xs, ...ys];
      let hit = 0;
      for (let i = 0; i < P; i++) {
        const sh = shuffle(all);
        const a = stat(sh.slice(0, xs.length)), b = stat(sh.slice(xs.length));
        if (a != null && b != null && Math.abs(a - b) >= Math.abs(obs) - 1e-12) hit++;
      }
      return (hit + 1) / (P + 1);
    };

    const count = {};
    star_days.forEach((r) => (count[r.tank] = (count[r.tank] || 0) + 1));
    const [A, Bt] = Object.keys(count).sort((x, y) => count[y] - count[x] || x.localeCompare(y)).slice(0, 2).sort();
    if (!Bt) return [];
    const states = ['quiescent', 'alert', 'moving'];
    const fmt = {
      share: (v) => (v == null ? '—' : `${Math.round(v * 100)}%`),
      pts: (v) => (v == null ? '—' : signed(Math.round(v * 100), ' pts')),
      s: (v) => (v == null ? '—' : `${Math.round(v)} s`),
      ds: (v) => (v == null ? '—' : signed(Math.round(v), ' s')),
      stat: (v) => (v == null ? '—' : v.toFixed(2).replace('-', '−')),
      dstat: (v) => (v == null ? '—' : signed(Number(v.toFixed(2)), '', 2)),
      n: (v) => (v == null ? '—' : String(v)),
    };
    // a sign only on values that don't round to zero
    function signed(v, unit, digits = 0) {
      return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}${unit}`;
    }
    const pText = (p) => (p == null ? '—' : p < 0.001 ? '<0.001' : p.toFixed(3));
    const rows = [];
    const add = (topic, measure, unit, xs, ys, stat, test, higher) => {
      const a = stat(xs), b = stat(ys);
      const diff = a == null || b == null ? null : a - b;
      const enough = xs.length >= 3 && ys.length >= 3 && diff != null;
      const p = !test || !enough ? null : test === 'fisher' ? fisher(xs, ys) : permDiff(xs, ys, stat);
      const [lo, hi] = test && enough ? bootDiff(xs, ys, stat) : [null, null];
      const [v, d] = unit === 'share' ? [fmt.share, fmt.pts] : unit === 's' ? [fmt.s, fmt.ds] : unit === 'n' ? [fmt.n, fmt.n] : [fmt.stat, fmt.dstat];
      const which = diff > 0 ? A : Bt;
      const reading = !test ? '' : p == null ? 'Too few in one tank to test'
        : p < 0.05 ? `${higher} in ${which}` : p < 0.1 ? `A hint, not conclusive: ${higher.toLowerCase()} in ${which}` : 'No clear difference at this sample size';
      rows.push({id: `t${rows.length + 1}`, topic, measure, tank_a: A, tank_b: Bt, a: a, b: b, n_a: xs.length, n_b: ys.length,
        difference: diff, ci_low: lo, ci_high: hi, p, a_text: v(a), b_text: v(b), difference_text: test ? d(diff) : '—',
        interval: lo == null ? '—' : `${d(lo)} to ${d(hi)}`, p_text: pText(p), reading});
    };
    const of = (tank) => star_days.filter((r) => r.tank === tank);
    const clipsOf = (tank) => clips.filter((c) => c.tank === tank);
    const num = (v) => (v === '' || v == null ? null : Number(v));
    const ident = (xs) => xs.length;
    add('Design', 'Stars (one per container per week)', 'n', [...new Set(of(A).map((r) => r.star))], [...new Set(of(Bt).map((r) => r.star))], ident);
    add('Design', 'Trials logged', 'n', of(A), of(Bt), ident);
    add('Design', 'Clips reviewed', 'n', clipsOf(A), clipsOf(Bt), ident);
    add('Response', 'Moved at all', 'share', of(A).map((r) => r.outcome !== 'No movement'), of(Bt).map((r) => r.outcome !== 'No movement'), rate, 'fisher', 'More stars moved');
    add('Response', 'Moved away', 'share', of(A).map((r) => r.outcome === 'Moved away'), of(Bt).map((r) => r.outcome === 'Moved away'), rate, 'fisher', 'More stars moved away');
    add('Response', 'First poke to first movement (median, stars that moved)', 's', trialsSeconds(A, 'poke_to_first_movement_s'), trialsSeconds(Bt, 'poke_to_first_movement_s'), median, 'perm', 'Slower to move');
    add('Response', 'First poke to moving away (median, stars that left)', 's', trialsSeconds(A, 'poke_to_move_away_s'), trialsSeconds(Bt, 'poke_to_move_away_s'), median, 'perm', 'Slower to move away');
    add('Procedure', 'Entry to first poke (median)', 's', trialsSeconds(A, 'entry_to_poke_s'), trialsSeconds(Bt, 'entry_to_poke_s'), median, 'perm', 'Longer before the first poke');
    add('State', 'Live call alert or moving', 'share', of(A).filter((r) => r.live_score != null).map((r) => r.live_score > 0),
      of(Bt).filter((r) => r.live_score != null).map((r) => r.live_score > 0), rate, 'fisher', 'More often called active live');
    add('State', 'Group call from video alert or moving', 'share', clipsOf(A).filter((c) => states.includes(c.state_call)).map((c) => c.state_call !== 'quiescent'),
      clipsOf(Bt).filter((c) => states.includes(c.state_call)).map((c) => c.state_call !== 'quiescent'), rate, 'fisher', 'More often called active on video');
    const scores = (tank) => of(tank).filter((r) => r.mean_score != null);
    add('State', "Annotators' mean score per clip (0 quiescent – 2 moving)", 'stat', scores(A).map((r) => r.mean_score), scores(Bt).map((r) => r.mean_score), mean, 'perm', 'Looked more active');
    add('Agreement', 'Spread of answers within a clip (mean SD)', 'stat', scores(A).filter((r) => r.sd != null).map((r) => r.sd),
      scores(Bt).filter((r) => r.sd != null).map((r) => r.sd), mean, 'perm', 'Annotators disagreed more');
    const units = (tank, q, valid) => {
      const u = {};
      answers.filter((a) => a.tank === tank && a.showing === '1' && valid.includes(a[q])).forEach((a) => (u[a.clip] ??= []).push(a[q]));
      return toCounts(Object.values(u), valid);
    };
    add('Agreement', "Agreement on state (Krippendorff's α)", 'stat', units(A, 'state', states), units(Bt, 'state', states), alpha, 'perm', 'Annotators agreed more');
    add('Agreement', "Agreement on eating (Krippendorff's α)", 'stat', units(A, 'eating', ['eating', 'not_eating']), units(Bt, 'eating', ['eating', 'not_eating']), alpha, 'perm', 'Annotators agreed more');
    const gl = (tank) => clipsOf(tank).filter((c) => states.includes(c.state_call) && states.includes(c.live_state)).map((c) => [c.state_call, c.live_state]);
    add('Agreement', "Group call matches live call (Cohen's κ)", 'stat', gl(A), gl(Bt), kappa, 'perm', 'Video and live calls agreed more');
    const ate = (tank) => clipsOf(tank).filter((c) => ['eating', 'not_eating'].includes(c.eating_call)).map((c) => c.eating_call === 'eating');
    add('Eating', 'Group call from video: eating', 'share', ate(A), ate(Bt), rate, 'fisher', 'More often called eating');
    return rows;

    function trialsSeconds(tank, field) {
      return trials.filter((t) => t.tank === tank).map((t) => num(t[field])).filter((v) => v != null);
    }
  },
});

dash.calc('tank_mix', {
  title: 'State calls by tank',
  description: "How often each state was called in each tank: by the poker live, by the group from video, and across every annotator answer (both viewings).",
  inputs: ['answers', 'clips', 'star_days'],
  fn: (answers, clips, star_days) => {
    const states = ['quiescent', 'alert', 'moving'];
    const out = [];
    const tanks = [...new Set(star_days.map((r) => r.tank))].sort();
    const sources = [
      ['Live call', (t) => star_days.filter((r) => r.tank === t).map((r) => r.live_state)],
      ['Group call from video', (t) => clips.filter((c) => c.tank === t).map((c) => c.state_call)],
      ['All annotator answers', (t) => answers.filter((a) => a.tank === t).map((a) => a.state)],
    ];
    for (const [source, get] of sources) {
      for (const tank of tanks) {
        const list = get(tank).filter((s) => states.includes(s));
        for (const state of states) {
          const n = list.filter((s) => s === state).length;
          out.push({source, tank, state, count: n, of: list.length, share: list.length ? n / list.length : null});
        }
      }
    }
    return out;
  },
});

dash.calc('tank_outcome', {
  title: 'Outcome after each call, by tank',
  description: 'What the star did when poked, by the group call from video and by the live call, separately for each tank.',
  inputs: ['clips', 'star_days'],
  fn: (clips, star_days) => {
    const out = [];
    const tanks = [...new Set(star_days.map((r) => r.tank))].sort();
    for (const tank of tanks) {
      for (const [basis, list, field] of [
        ['Group call from video', clips.filter((c) => c.tank === tank), 'state_call'],
        ['Live call', star_days.filter((r) => r.tank === tank), 'live_state'],
      ]) {
        for (const state of ['quiescent', 'alert', 'moving']) {
          const mine = list.filter((r) => r[field] === state);
          for (const outcome of ['Moved away', "Moved, didn't leave", 'No movement']) {
            out.push({tank, basis, state, outcome, clips: mine.filter((r) => r.outcome === outcome).length, of: mine.length});
          }
        }
      }
    }
    return out;
  },
});

dash.calc('week_summary', {
  title: 'Week by week',
  description: "One row per week: how many stars, trials and clips, the share of stars that moved away, how often quiescent was called on video and live, the annotators' mean score, agreement (Krippendorff's α on first viewings), group call vs live call (Cohen's κ), and how well the mean score separates stars that moved away (AUC).",
  inputs: ['answers', 'clips', 'star_days'],
  fn: (answers, clips, star_days) => {
    const states = ['quiescent', 'alert', 'moving'];
    const kappa = (pairs) => {
      const n = pairs.length;
      if (!n) return null;
      const a = {}, b = {};
      pairs.forEach(([x, y]) => { a[x] = (a[x] || 0) + 1; b[y] = (b[y] || 0) + 1; });
      const po = pairs.filter(([x, y]) => x === y).length / n;
      const pe = Object.keys({...a, ...b}).reduce((s, k) => s + (a[k] || 0) * (b[k] || 0), 0) / (n * n);
      return pe >= 1 ? null : (po - pe) / (1 - pe);
    };
    const alpha = (units) => {
      const o = {};
      for (const v of units) {
        if (v.length < 2) continue;
        v.forEach((c, i) => v.forEach((k, j) => { if (i !== j) o[`${c}|${k}`] = (o[`${c}|${k}`] || 0) + 1 / (v.length - 1); }));
      }
      const nc = {};
      Object.entries(o).forEach(([key, x]) => (nc[key.split('|')[0]] = (nc[key.split('|')[0]] || 0) + x));
      const n = Object.values(nc).reduce((s, x) => s + x, 0);
      const obs = Object.entries(o).filter(([key]) => key.split('|')[0] !== key.split('|')[1]).reduce((s, [, x]) => s + x, 0);
      let exp = 0;
      for (const c in nc) for (const k in nc) if (c !== k) exp += nc[c] * nc[k];
      return n > 1 && exp ? 1 - ((n - 1) * obs) / exp : null;
    };
    const auc = (pairs) => {
      const pos = pairs.filter((p) => p[1]).map((p) => p[0]), neg = pairs.filter((p) => !p[1]).map((p) => p[0]);
      if (!pos.length || !neg.length) return null;
      let w = 0;
      for (const a of pos) for (const b of neg) w += a > b ? 1 : a === b ? 0.5 : 0;
      return w / (pos.length * neg.length);
    };
    const share = (xs) => (xs.length ? xs.filter(Boolean).length / xs.length : null);
    return [...new Set(star_days.map((r) => r.week))].sort((a, b) => a - b).map((week) => {
      const days = star_days.filter((r) => r.week === week);
      const mine = answers.filter((a) => Number(a.week) === week && states.includes(a.state));
      const units = (q, valid) => {
        const u = {};
        answers.filter((a) => Number(a.week) === week && a.showing === '1' && valid.includes(a[q])).forEach((a) => (u[a.clip] ??= []).push(a[q]));
        return Object.values(u);
      };
      const wc = clips.filter((c) => Number(c.week) === week);
      const scored = days.filter((r) => r.mean_score != null);
      return {
        week, round: days[0]?.round ?? '', stars: new Set(days.map((r) => r.star)).size, trials: days.length, clips: wc.length,
        answers: mine.length, moved_away: share(days.map((r) => r.outcome === 'Moved away')),
        quiescent_video: share(mine.map((a) => a.state === 'quiescent')),
        quiescent_live: share(days.filter((r) => r.live_score != null).map((r) => r.live_state === 'quiescent')),
        mean_score: scored.length ? scored.reduce((s, r) => s + r.mean_score, 0) / scored.length : null,
        alpha_state: alpha(units('state', states)), alpha_eating: alpha(units('eating', ['eating', 'not_eating'])),
        kappa_group_live: kappa(wc.filter((c) => states.includes(c.state_call) && states.includes(c.live_state)).map((c) => [c.state_call, c.live_state])),
        auc_score: auc(scored.map((r) => [r.mean_score, r.outcome === 'Moved away'])),
      };
    });
  },
});

dash.calc('response_times', {
  title: 'Time to respond, per trial and call',
  description: "One row per poked trial and per way of calling its state (live call, group call from video, each annotator's first viewing): seconds from the first poke to first movement and to moving away. A star that hadn't responded when the poker left is censored at the exit time (event false). The mean score is the annotators' mean for that clip.",
  inputs: ['trials', 'clips', 'answers', 'star_days'],
  fn: (trials, clips, answers, star_days) => {
    const states = ['quiescent', 'alert', 'moving'];
    const num = (v) => (v === '' || v == null ? null : Number(v));
    const groupCall = Object.fromEntries(clips.map((c) => [c.clip, c.state_call]));
    const score = Object.fromEntries(star_days.map((r) => [r.trial, r.mean_score]));
    const first = {};
    answers.filter((a) => a.showing === '1' && states.includes(a.state)).forEach((a) => ((first[a.clip] ??= {})[a.annotator] = a.state));
    const people = [...new Set(answers.map((a) => a.annotator))].sort();
    const out = [];
    for (const t of trials) {
      const end = num(t.poke_to_exit_s), move = num(t.poke_to_first_movement_s), away = num(t.poke_to_move_away_s);
      if (num(t.entry_to_poke_s) == null || (end == null && away == null)) continue;  // not poked, or no end time
      const base = {trial: t.trial, week: Number(t.week), star: t.star, tank: t.tank, clip: t.clip, score: score[t.trial] ?? null,
        move_s: move ?? end, move_event: move != null, away_s: away ?? end, away_event: away != null};
      const calls = [['Group call', t.clip ? groupCall[t.clip] : null], ['Live call', t.live_state],
        ...people.map((p) => [p, t.clip ? first[t.clip]?.[p] : null])];
      for (const [basis, state] of calls) if (states.includes(state)) out.push({basis, state, ...base});
    }
    return out;
  },
});

dash.calc('km', {
  title: 'Kaplan–Meier curves',
  description: 'For each way of calling the state, each response (first movement, moving away) and each tank (and all tanks), the share of stars that had responded by each second after the first poke, allowing for stars still waiting when the poker left (censored).',
  inputs: ['response_times'],
  fn: (response_times) => {
    const out = [];
    const bases = [...new Set(response_times.map((r) => r.basis))];
    const scopes = ['All tanks', ...new Set(response_times.map((r) => r.tank))].sort((a, b) => (a === 'All tanks' ? -1 : b === 'All tanks' ? 1 : a.localeCompare(b)));
    for (const basis of bases) {
      for (const [endpoint, tk, ek] of [['Moved away', 'away_s', 'away_event'], ['First movement', 'move_s', 'move_event']]) {
        for (const scope of scopes) {
          for (const state of ['quiescent', 'alert', 'moving']) {
            const list = response_times.filter((r) => r.basis === basis && r.state === state && (scope === 'All tanks' || r.tank === scope));
            if (!list.length) continue;
            let surviving = 1;
            out.push({basis, endpoint, scope, state, kind: 'step', t: 0, responded: 0, at_risk: list.length, n: list.length});
            const times = [...new Set(list.map((r) => r[tk]))].sort((a, b) => a - b);
            for (const t of times) {
              const atRisk = list.filter((r) => r[tk] >= t).length;
              const d = list.filter((r) => r[ek] && r[tk] === t).length;
              const c = list.filter((r) => !r[ek] && r[tk] === t).length;
              if (d) {
                surviving *= 1 - d / atRisk;
                out.push({basis, endpoint, scope, state, kind: 'step', t, responded: 1 - surviving, at_risk: atRisk, n: list.length});
              }
              if (c) out.push({basis, endpoint, scope, state, kind: 'censor', t, responded: 1 - surviving, at_risk: atRisk, n: list.length});
            }
          }
        }
      }
    }
    return out;
  },
});

dash.calc('km_tests', {
  title: 'Does the state change the time to respond?',
  description: "For each way of calling the state and each response: median seconds to respond by state (Kaplan–Meier; '>' when fewer than half responded), the log-rank test across states overall and stratified by tank, and alert vs quiescent alone; plus Harrell's concordance (C) between the annotators' mean score and the time to respond (0.5 = no link, above 0.5 = more active clips responded sooner), with permutation p-values (1,000 shuffles, within tank for the stratified one). Chi-square p-values for the log-rank tests.",
  inputs: ['response_times'],
  fn: (response_times) => {
    let seed = 20261017;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const shuffle = (xs) => {
      const a = xs.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    };
    const sum = (xs) => xs.reduce((s, v) => s + v, 0);
    const erfc = (z) => {
      const t = 1 / (1 + 0.3275911 * z);
      return t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z);
    };
    const chiP = (x, df) => (df === 1 ? erfc(Math.sqrt(x / 2)) : df === 2 ? Math.exp(-x / 2) : null);
    const solve = (A, b) => {
      const n = b.length, M = A.map((row, i) => [...row, b[i]]);
      for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
        if (Math.abs(M[piv][c]) < 1e-12) return null;
        [M[c], M[piv]] = [M[piv], M[c]];
        for (let r = 0; r < n; r++) {
          if (r === c) continue;
          const f = M[r][c] / M[c][c];
          for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
        }
      }
      return M.map((row, i) => row[n] / row[i]);
    };
    // log-rank test across groups, optionally stratified (rows: {g, t, e, s})
    const logrank = (list, stratified) => {
      const groups = [...new Set(list.map((r) => r.g))];
      if (groups.length < 2 || !list.some((r) => r.e)) return null;
      const k = groups.length, O = Array(k).fill(0), E = Array(k).fill(0), V = groups.map(() => Array(k).fill(0));
      for (const st of stratified ? [...new Set(list.map((r) => r.s))] : [null]) {
        const L = stratified ? list.filter((r) => r.s === st) : list;
        for (const t of [...new Set(L.filter((r) => r.e).map((r) => r.t))].sort((a, b) => a - b)) {
          const n = groups.map((g) => L.filter((r) => r.g === g && r.t >= t).length);
          const d = groups.map((g) => L.filter((r) => r.g === g && r.e && r.t === t).length);
          const N = sum(n), D = sum(d);
          for (let j = 0; j < k; j++) {
            O[j] += d[j];
            E[j] += (D * n[j]) / N;
            if (N > 1) for (let l = 0; l < k; l++) V[j][l] += (D * (n[j] / N) * ((j === l ? 1 : 0) - n[l] / N) * (N - D)) / (N - 1);
          }
        }
      }
      const x = O.slice(0, k - 1).map((o, j) => o - E[j]);
      const sol = solve(V.slice(0, k - 1).map((row) => row.slice(0, k - 1)), x);
      if (!sol) return null;
      const chi = sum(x.map((v, j) => v * sol[j]));
      return chiP(chi, k - 1);
    };
    const median = (list) => {  // Kaplan–Meier median of {t, e}
      let s = 1;
      for (const t of [...new Set(list.map((r) => r.t))].sort((a, b) => a - b)) {
        const atRisk = list.filter((r) => r.t >= t).length, d = list.filter((r) => r.e && r.t === t).length;
        s *= 1 - d / atRisk;
        if (s <= 0.5) return t;
      }
      return null;
    };
    // Harrell's C: over pairs where one star responded before the other was last seen, how often the sooner one
    // had the higher score. The pairs are found once, so shuffling scores is quick.
    const pairsOf = (rows, stratified) => {
      const out = [];
      rows.forEach((a, i) => {
        if (!a.e) return;
        rows.forEach((b, j) => { if (b.t > a.t && (!stratified || a.s === b.s)) out.push(i, j); });
      });
      return out;
    };
    const cFrom = (pairs, x) => {
      if (!pairs.length) return null;
      let conc = 0;
      for (let k = 0; k < pairs.length; k += 2) { const a = x[pairs[k]], b = x[pairs[k + 1]]; conc += a > b ? 1 : a === b ? 0.5 : 0; }
      return conc / (pairs.length / 2);
    };
    const cTest = (rows, stratified) => {
      const pairs = pairsOf(rows, stratified), x = rows.map((r) => r.x);
      const obs = cFrom(pairs, x);
      if (obs == null) return [null, null];
      const groups = stratified ? [...new Set(rows.map((r) => r.s))].map((st) => rows.map((r, i) => (r.s === st ? i : -1)).filter((i) => i >= 0)) : [rows.map((r, i) => i)];
      let hit = 0;
      const P = 1000;
      for (let n = 0; n < P; n++) {
        const xs = x.slice();
        for (const idx of groups) { const sh = shuffle(idx.map((i) => x[i])); idx.forEach((i, k) => (xs[i] = sh[k])); }
        if (Math.abs(cFrom(pairs, xs) - 0.5) >= Math.abs(obs - 0.5) - 1e-12) hit++;
      }
      return [obs, (hit + 1) / (P + 1)];
    };
    const secs = (v, list) => (v != null ? `${Math.round(v)} s` : list.length ? `>${Math.round(Math.max(...list.map((r) => r.t)))} s` : '—');
    const pText = (p) => (p == null ? '—' : p < 0.001 ? '<0.001' : p.toFixed(3));
    const read = (p, pTank, fastest) => {
      if (p == null && pTank == null) return 'Too few stars in some states to test';
      const best = pTank ?? p;
      if (best < 0.05) return `Response time differs by state${pTank != null ? ', even within tanks' : ''}: ${fastest}`;
      if ((p ?? 1) < 0.05) return 'Differs overall but not clearly within tanks, so the tank may explain it';
      if (best < 0.1) return `A hint, not conclusive: ${fastest}`;
      return 'No clear difference in response time at this sample size';
    };
    const out = [];
    const bases = [...new Set(response_times.map((r) => r.basis))];
    for (const [endpoint, tk, ek] of [['First movement', 'move_s', 'move_event'], ['Moved away', 'away_s', 'away_event']]) {
      for (const basis of bases) {
        const list = response_times.filter((r) => r.basis === basis).map((r) => ({g: r.state, t: r[tk], e: r[ek], s: r.tank}));
        const by = Object.fromEntries(['quiescent', 'alert', 'moving'].map((st) => [st, list.filter((r) => r.g === st)]));
        const med = Object.fromEntries(Object.entries(by).map(([st, l]) => [st, l.length ? median(l) : null]));
        const ranked = Object.entries(by).filter(([, l]) => l.length >= 3).map(([st, l]) => [st, med[st] ?? Infinity]).sort((a, b) => a[1] - b[1]);
        const fastest = ranked.length ? `${ranked[0][0]} stars responded soonest` : '';
        const testable = list.filter((r) => by[r.g].length >= 3);
        const pAll = logrank(testable, false), pTank = logrank(testable, true);
        const aq = list.filter((r) => (r.g === 'alert' || r.g === 'quiescent') && by[r.g].length >= 3);
        out.push({
          id: `${endpoint}|${basis}`, endpoint, basis, test: 'Log-rank across states',
          quiescent_n: by.quiescent.length, alert_n: by.alert.length, moving_n: by.moving.length,
          quiescent_median: med.quiescent, alert_median: med.alert, moving_median: med.moving,
          medians: `Q ${secs(med.quiescent, by.quiescent)} · A ${secs(med.alert, by.alert)} · M ${secs(med.moving, by.moving)}`,
          stars: `Q ${by.quiescent.length} · A ${by.alert.length} · M ${by.moving.length}`,
          p: pAll, p_within_tank: pTank, p_alert_vs_quiescent: logrank(aq, false),
          p_text: pText(pAll), p_within_tank_text: pText(pTank), p_alert_vs_quiescent_text: pText(logrank(aq, false)),
          reading: read(pAll, pTank, fastest),
        });
      }
      const scored = response_times.filter((r) => r.basis === 'Group call' || r.basis === 'Live call')
        .filter((r, i, all) => r.score != null && all.findIndex((o) => o.trial === r.trial) === i)
        .map((r) => ({x: r.score, t: r[tk], e: r[ek], s: r.tank}));
      const [c, pc] = cTest(scored, false), [cT, pcT] = cTest(scored, true);
      out.push({
        id: `${endpoint}|score`, endpoint, basis: "Annotators' mean score", test: 'Concordance (C)',
        medians: `C = ${c == null ? '—' : c.toFixed(2)} overall, ${cT == null ? '—' : cT.toFixed(2)} within tanks`, stars: `n = ${scored.length}`,
        concordance: c, concordance_within_tank: cT, p: pc, p_within_tank: pcT, p_alert_vs_quiescent: null,
        p_text: pText(pc), p_within_tank_text: pText(pcT), p_alert_vs_quiescent_text: '—',
        reading: (pcT ?? pc) == null ? 'Too few stars to test' : (pcT ?? 1) < 0.05
          ? `${(cT ?? c) > 0.5 ? 'More' : 'Less'} active clips responded sooner, even within tanks`
          : (pc ?? 1) < 0.05 ? 'Linked overall but not clearly within tanks, so the tank may explain it'
          : Math.min(pc ?? 1, pcT ?? 1) < 0.1 ? 'A hint, not conclusive' : 'No clear link with response time at this sample size',
      });
    }
    return out;
  },
});
