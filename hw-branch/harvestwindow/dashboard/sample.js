/* Browser-side projection for a what-if sample using the replay's fitted curves. */
function projectSample(source, redPercent, fruitGrams) {
  const inputs = source.forecastInputs;
  const observed = Math.max(0.01, Math.min(0.99, redPercent / 100));
  const logOdds = Math.log(observed / (1 - observed));
  const redFraction = (value) => 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, value))));
  const days = source.prior.points;

  function trajectory(curve, heatFactor, costFactor, price) {
    const measuredMidpoint = inputs.heat - logOdds / curve.slope;
    const midpoint = 0.35 * curve.midpoint + 0.65 * measuredMidpoint;
    return days.map((point, day) => {
      const ripenessOdds = curve.slope * (inputs.heat + inputs.daily_heat * heatFactor * day - midpoint);
      let sellable = 0;
      let revenue = 0;
      for (let i = 0; i < 41; i += 1) {
        const fraction = redFraction(ripenessOdds + (-1.9 + i * 3.8 / 40) * 0.55);
        const grams = fraction * fruitGrams;
        if (fraction >= 1 / 3 && grams >= 50) {
          sellable += 1;
          revenue += price * Math.min(grams / 150, 1);
        }
      }
      return {
        date: point.date,
        red: redFraction(ripenessOdds) * 100,
        sellable: sellable / 41 * 100,
        profit: (revenue / 41 - 0.75 - inputs.cost - day * inputs.daily_cost * costFactor) /
          (inputs.area + day / inputs.density),
      };
    });
  }

  function bestDay(path) {
    const eligible = path.filter((point) => point.sellable >= 85);
    if (!eligible.length) return null;
    const best = Math.max(...eligible.map((point) => point.profit));
    return path.findIndex((point) => point.sellable >= 85 && point.profit >= best - 0.005);
  }

  const central = trajectory(source.centralCurve, 1, 1, 2.15);
  const paths = [central];
  for (const curve of source.scenarioCurves) {
    for (const [heat, cost] of [[0.9, 1.25], [1, 1], [1.1, 0.75]]) {
      for (const price of [1.75, 2.15, 2.50]) paths.push(trajectory(curve, heat, cost, price));
    }
  }
  const choices = paths.map(bestDay);
  const eligible = choices.filter((choice) => choice !== null);
  const near = choices.filter((choice) => choice === 0).length;
  const later = choices.length - near;
  return {
    action: near && later ? "sample" : (near ? "harvest" : "wait"),
    near, later, selected: bestDay(central),
    window: eligible.length ? [Math.min(...eligible), Math.max(...eligible)] : null,
    points: central.map((point, day) => {
      const range = (key) => paths.map((path) => path[day][key]);
      return { ...point, low: Math.min(...range("red")), high: Math.max(...range("red")),
        sellableLow: Math.min(...range("sellable")), sellableHigh: Math.max(...range("sellable")),
        profitLow: Math.min(...range("profit")), profitHigh: Math.max(...range("profit")) };
    }),
  };
}
