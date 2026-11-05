// The current sprint for the iPhone's Today and Sprint tabs: 42 made-up backlog items, day 4 of 10.
const DAY = 86400000;
const midnight = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** The sprint started three working days before today, so today is day 4 of 10. */
function sprintStart(today) {
  let start = midnight(today);
  for (let working = 0; working < 3; ) {
    start = new Date(start.getTime() - DAY);
    if (![0, 6].includes(start.getUTCDay())) working += 1;
  }
  return start;
}

const workflow = ['New', 'Development In Progress', 'Code Review', 'Ready For QA', 'Done'];
const category = { New: 'Proposed', 'Development In Progress': 'InProgress', 'Code Review': 'Resolved', 'Ready For QA': 'Resolved', Done: 'Completed' };
const types = ['PBI', 'Bug', 'QI'];
const typeNames = { PBI: 'Product Backlog Item', Bug: 'Bug', QI: 'Quality Improvement' };
const people = [
  ['Koen van der Borght', 7, 1],
  ['Mara Visser', 9, 4],
  ['Ravi Patel', 8, 3],
  ['Lena Brandt', 10, 4],
  ['Sam Okafor', 6, 2],
  [null, 2, 0],
];
const titles = [
  'Order export for finance', 'Payment webhook times out on retry', 'Delivery slot picker shows the wrong day', 'Gift card balance in the app',
  'Inventory count drifts after a batch import', 'Flaky checkout end-to-end test', 'Returns: print a label at home', 'Search suggestions on a cold cache',
  'Basket survives going offline', 'Newsletter sign-up in the footer', 'Track and trace on the order page', 'Invoice PDF shows the old address',
];

function sprint() {
  const start = sprintStart(new Date());
  const finish = new Date(start.getTime() + 11 * DAY);
  const dayOf = (index, hour = 15) => new Date(Math.min(Date.now(), start.getTime() + index * DAY + hour * 3600000)).toISOString();
  // 14 done over the first four days, then QA 5, review 4, in progress 12, new 7.
  const finishedDays = [0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3];
  const states = [...Array(14).fill('Done'), ...Array(5).fill('Ready For QA'), ...Array(4).fill('Code Review'), ...Array(12).fill('Development In Progress'), ...Array(7).fill('New')];
  const owners = people.flatMap(([name, count, done]) => [...Array(done).fill(name), ...Array(count - done).fill({ open: name })]);
  const doneOwners = owners.filter((o) => typeof o !== 'object');
  const openOwners = owners.filter((o) => typeof o === 'object').map((o) => o.open);
  let reviewIndex = 0;
  const items = states.map((state, index) => {
    const id = 61000 + index;
    const type = types[index % 3];
    const assignedTo = state === 'Done' ? doneOwners[index] : openOwners[index - 14];
    const inReview = state === 'Code Review' ? reviewIndex++ : -1;
    const stateChangedAt = state === 'Done' ? dayOf(finishedDays[index]) : inReview >= 0 && inReview < 3 ? new Date(Date.now() - (3 + inReview) * DAY).toISOString() : dayOf(1, 10);
    return {
      id, type, typeName: typeNames[type], title: titles[index % titles.length], state, stateCategory: category[state], workflow,
      sprint: '5.2.8', dueDate: null, priority: 2, tags: index === 30 ? ['Blocked'] : [],
      assignedTo, assignedToMe: assignedTo === 'Koen van der Borght',
      url: `https://dev.azure.com/acme/Shop/_workitems/edit/${id}`,
      stateChangedAt, finishedAt: state === 'Done' ? stateChangedAt : null,
    };
  });
  return { name: '5.2.8', path: 'Shop\\5.2.8', startDate: start.toISOString(), finishDate: finish.toISOString(), items, generatedAt: new Date().toISOString() };
}

export function handle({ path }) {
  if (path === '/api/sprint') return sprint();
  return undefined;
}
