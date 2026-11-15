/* Order fulfilment replay. Each room supplies one harvest on one date. */
function allocateOrder(rooms, quantity, deadline, capacity, area, conservative, samples) {
  const dates = Object.values(rooms)[0].prior.points.map(point => point.date)
    .filter(day => day > "2024-11-05" && day <= deadline);
  const names = Object.keys(rooms);
  // Dynamic programming over the set of harvested rooms. For a fixed set,
  // more fulfilled pots always dominates fewer under these constraints.
  let states = new Map([[0, { fulfilled: 0, allocation: [] }]]);
  for (const day of dates) {
    const supplies = names.map(name => {
      const source = rooms[name];
      const forecast = samples ? source.after : source.prior;
      const point = forecast.points.find(point => point.date === day);
      const fraction = conservative ? point.sellableLow : point.sellable;
      return Math.max(0, Math.floor(area * source.forecastInputs.density * fraction / 100));
    });
    const next = new Map(states);
    for (const [mask, state] of states) {
      const remaining = ((1 << names.length) - 1) ^ mask;
      for (let subset = remaining; subset; subset = (subset - 1) & remaining) {
        let available = Math.min(capacity, quantity - state.fulfilled);
        let actualMask = mask;
        const added = [];
        for (let i = 0; i < names.length; i++) {
          if (!(subset & (1 << i))) continue;
          const amount = Math.min(available, supplies[i]);
          if (amount <= 0) continue;
          added.push({day, room: names[i], quantity: amount, forecastSupply: supplies[i]});
          actualMask |= 1 << i;
          available -= amount;
        }
        const fulfilled = state.fulfilled + added.reduce((sum, row) => sum + row.quantity, 0);
        if (fulfilled > (next.get(actualMask)?.fulfilled ?? -1)) {
          next.set(actualMask, { fulfilled, allocation: [...state.allocation, ...added] });
        }
      }
    }
    states = next;
  }
  const best = [...states.values()].sort((a,b) => b.fulfilled - a.fulfilled || a.allocation.length - b.allocation.length)[0];
  return {...best, remaining: quantity - best.fulfilled};
}

function setupOrders() {
  const form = document.getElementById("order-form");
  const output = document.getElementById("order-result");
  const body = document.querySelector("#order-table tbody");
  const rooms = window.harvestReplay.rooms;
  let current;
  function update() {
    document.getElementById("export-order").disabled = !form.checkValidity();
    if (!form.checkValidity()) { output.textContent = "Enter valid order inputs to calculate a plan."; body.replaceChildren(); return; }
    const fields = new FormData(form);
    const quantity = Number(fields.get("quantity"));
    const deadline = fields.get("deadline");
    const capacity = Number(fields.get("capacity"));
    const area = Number(fields.get("area"));
    const samples = fields.has("samples");
    const expected = allocateOrder(rooms, quantity, deadline, capacity, area, false, samples);
    const slower = allocateOrder(rooms, quantity, deadline, capacity, area, true, samples);
    current = { inputs: Object.fromEntries(fields), expected, slower };
    output.textContent = "Expected fulfilment " + expected.fulfilled + " / " + quantity +
      " pots. Expected shortfall " + expected.remaining + ". With the lower sellability envelope, shortfall is " +
      slower.remaining + " pots. " + (samples ? "Recorded samples from all six rooms are revealed." : "Samples are hidden.");
    body.replaceChildren();
    for (const item of expected.allocation) {
      const row = body.insertRow();
      for (const value of [item.day, item.room, item.quantity, item.forecastSupply]) row.insertCell().textContent = value;
    }
  }
  form.addEventListener("input", update);
  document.getElementById("export-order").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "harvestwindow-order-plan.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  update();
}
if (typeof document !== "undefined") setupOrders();
if (typeof module !== "undefined") module.exports = { allocateOrder };
