// A small stand-in for the dashboard's data runtime, so the same page scripts run on a plain static site:
// it loads the CSV files, works out the calcs in the order they were declared, and redraws on resize.
window.dash = (() => {
  const SOURCES = {answers: 'data/answers.csv', activity: 'data/activity.csv', trials: 'data/trials.csv'};
  const store = {};
  const calcs = [];
  const listeners = [];
  for (const id of Object.keys(SOURCES)) store[id] = {status: 'loading', data: []};

  const redraw = () => listeners.forEach((fn) => {
    try { fn(); } catch (err) { console.error(err); }
  });

  function load() {
    return Promise.all(Object.entries(SOURCES).map(([id, url]) => d3.csv(url).then(
      (rows) => { store[id] = {status: 'ok', data: rows, columns: rows.columns}; },
      (err) => { store[id] = {status: 'error', data: [], message: String(err)}; },
    ))).then(() => {
      for (const c of calcs) {
        const inputs = c.inputs.map((i) => store[i]);
        if (inputs.some((d) => !d || d.status !== 'ok')) {
          store[c.id] = {status: 'error', data: []};
          continue;
        }
        try {
          store[c.id] = {status: 'ok', data: c.fn(...inputs.map((d) => d.data))};
        } catch (err) {
          console.error(`${c.id}:`, err);
          store[c.id] = {status: 'error', data: [], message: err.message};
        }
      }
      redraw();
    });
  }

  let width = 0;
  let timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        redraw();
      }
    }, 150);
  });
  document.addEventListener('DOMContentLoaded', () => {
    width = window.innerWidth;
    load();
  });

  return {
    colors: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `var(--series-${i})`),
    calc(id, spec) {
      calcs.push({id, ...spec});
      store[id] = {status: 'loading', data: []};
    },
    data: (id) => store[id] ?? {status: 'missing', data: []},
    onData(fn) {
      listeners.push(fn);
      fn();
    },
    params: () => ({}),
    setParams() {},
    resetParams() {},
    setLink() {},
    refresh() {},
  };
})();
