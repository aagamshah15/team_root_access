/* Conditional decision analysis. Scenario weights are explicit modelling assumptions. */
function economicDecision(source, options) {
  const input = source.forecastInputs;
  const count = Math.max(1, options.area * input.density);
  const curves = source.scenarioCurves;
  const paths = [];
  const states = [];
  const sigmoid = x => 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, x))));
  for (const curve of curves) {
    for (const rate of [0.9, 1, 1.1]) {
      const path = [];
      for (let day = 0; day <= 21; day++) {
        let revenue = 0;
        let eligible = 0;
        for (let plant = 0; plant < 41; plant++) {
          const red = sigmoid(curve.slope * (input.heat + input.daily_heat * rate * day - curve.midpoint) +
            (-1.9 + plant * 3.8 / 40) * 0.55);
          const grams = options.weight * red;
          if (red >= 1 / 3 && grams >= 50) {
            revenue += options.price * Math.min(grams / 150, 1) / 41;
            eligible += 1 / 41;
          }
        }
        const operating = day * input.daily_cost * options.cost * count;
        const opportunity = day * options.opportunity * options.area;
        path.push({ date: source.prior.points[day].date, revenue: revenue * count,
          operating, opportunity, net: revenue * count - operating - opportunity, eligible });
      }
      paths.push(path);
      states.push(sigmoid(curve.slope * (input.heat - curve.midpoint)) * 100);
    }
  }
  const average = array => array.reduce((a, b) => a + b, 0) / array.length;
  const expectations = paths[0].map((point, day) => ({
    date: point.date,
    revenue: average(paths.map(path => path[day].revenue)),
    operating: average(paths.map(path => path[day].operating)),
    opportunity: average(paths.map(path => path[day].opportunity)),
    net: average(paths.map(path => path[day].net)),
    low: Math.min(...paths.map(path => path[day].net)),
    high: Math.max(...paths.map(path => path[day].net)),
    eligible: average(paths.map(path => path[day].eligible)),
  }));
  const pick = scores => scores.indexOf(Math.max(...scores));
  const best = pick(expectations.map(point => point.net));
  const worstRegret = expectations.map((point, day) => Math.max(...paths.map(path =>
    Math.max(...path.map(item => item.net)) - path[day].net)));
  const robust = worstRegret.indexOf(Math.min(...worstRegret));
  const perfect = average(paths.map(path => Math.max(...path.map(point => point.net)))) - expectations[best].net;
  // Numerically integrate possible noisy sample outcomes on a bounded percentage grid.
  // A fixed 15pp plant SD is a sensitivity assumption, not estimated coverage.
  const noise = Math.sqrt(15 ** 2 / options.samples + 3 ** 2);
  let probabilityMass = 0;
  let informedValue = 0;
  for (let observation = 0; observation <= 100; observation += 1) {
    const likelihood = states.map(state => Math.exp(-0.5 * ((observation - state) / noise) ** 2));
    const mass = average(likelihood);
    if (mass < 1e-12) continue;
    const total = likelihood.reduce((a, b) => a + b, 0);
    const posterior = expectations.map((_, day) => paths.reduce((sum, path, i) =>
      sum + path[day].net * likelihood[i] / total, 0));
    informedValue += mass * Math.max(...posterior);
    probabilityMass += mass;
  }
  const sampleValue = Math.max(0, Math.min(perfect, informedValue / probabilityMass - expectations[best].net));
  const sampleCost = options.labor + options.samples * options.price;
  return { expectations, best, robust, worstRegret, perfect, sampleValue, sampleCost,
    sampleNet: sampleValue - sampleCost, count };
}

function renderEconomics(source) {
  const form = document.getElementById("economics-form");
  const values = Object.fromEntries(new FormData(form));
  const options = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
  if (!form.checkValidity()) return;
  const fallback = document.getElementById("camera-fallback").checked;
  const selectedSource = fallback ? {
    ...source,
    scenarioCurves: source.warmthCurves,
  } : source;
  const result = economicDecision(selectedSource, options);
  const euro = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR",
    maximumFractionDigits: 0 }).format(value);
  const best = result.expectations[result.best];
  const today = result.expectations[0];
  document.getElementById("economic-summary").textContent =
    "Expected best date " + best.date + ". Waiting adds " + euro(best.revenue - today.revenue) +
    " in sales, costs " + euro(best.operating) + " to operate, and " + euro(best.opportunity) +
    " in greenhouse time. Net value of waiting " + euro(best.net - today.net) + ".";
  document.getElementById("risk-summary").textContent =
    "The date with the smallest worst-case missed opportunity is " + result.expectations[result.robust].date +
    ". Maximum missed opportunity across scenarios " + euro(result.worstRegret[result.robust]) + ".";
  document.getElementById("sample-value").textContent =
    "Modelled value of a " + options.samples + "-plant sample " + euro(result.sampleValue) +
    ". Labour and sacrificed pots " + euro(result.sampleCost) + ". " +
    (result.sampleNet > 0 ? "Sampling is worthwhile under these assumptions." : "Sampling costs exceed its estimated benefit.") +
    " Perfect crop-state information is worth at most " + euro(result.perfect) + " in these scenarios.";
  const body = document.querySelector("#economics-table tbody");
  body.replaceChildren();
  for (const [index, point] of result.expectations.entries()) {
    const row = body.insertRow();
    if (index === result.best) row.className = "emphasis";
    for (const value of [point.date, euro(point.revenue), euro(point.operating), euro(point.opportunity),
      euro(point.net - today.net), Math.round(point.eligible * 100) + "%"]) row.insertCell().textContent = value;
  }
  window.latestEconomicDecision = result;
}
