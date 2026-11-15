"use strict";

const replay = window.harvestReplay;
const $ = (id) => document.getElementById(id);
const dateText = (date) => new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
  month: "short", day: "numeric", timeZone: "UTC",
});
const percent = (number) => number.toFixed(1) + "%";
const money = (number) => "€" + number.toFixed(3);
const metadata = {
  red: { name: "red by weight", low: "low", high: "high", format: percent },
  sellable: { name: "sellable pots", low: "sellableLow", high: "sellableHigh", format: percent },
  profit: { name: "profit per m² per day", low: "profitLow", high: "profitHigh", format: money },
};
const canvas = document.createElement("canvas");
canvas.setAttribute("aria-hidden", "true");
$("chart").append(canvas);
const context = canvas.getContext("2d");
let room = "MuGrow";
let sampled = false;
let custom = null;
let metric = "red";
const currentPlan = (source) => $("camera-fallback").checked ? source.warmth : (custom?.plan || (sampled ? source.after : source.prior));

function drawChart() {
  const source = replay.rooms[room];
  const points = currentPlan(source).points;
  const index = Number($("forecast-day").value);
  const labels = metadata[metric];
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);
  const left = 57;
  const right = width - 20;
  const top = 12;
  const bottom = height - 32;
  const displayed = sampled ? [...points, ...source.prior.points] : points;
  const minimum = metric === "profit" ? Math.min(0, ...displayed.map((point) => point[labels.low])) : 0;
  const maximum = metric === "profit" ? Math.max(0.01, ...displayed.map((point) => point[labels.high])) : 100;
  const x = (day) => left + day * (right - left) / (points.length - 1);
  const y = (value) => bottom - (value - minimum) / (maximum - minimum) * (bottom - top);
  context.font = "11px system-ui";
  context.fillStyle = "#52645a";
  context.textAlign = "right";
  context.textBaseline = "middle";
  for (let tick = 0; tick <= 4; tick += 1) {
    const value = minimum + tick * (maximum - minimum) / 4;
    context.strokeStyle = "#dce4d9";
    context.beginPath();
    context.moveTo(left, y(value));
    context.lineTo(right, y(value));
    context.stroke();
    context.fillText(metric === "profit" ? "€" + value.toFixed(2) : value.toFixed(0) + "%", left - 7, y(value));
  }
  context.textAlign = "center";
  for (const day of width < 450 ? [0, 10, 21] : [0, 5, 10, 15, 21]) {
    context.fillText(dateText(points[day].date), x(day), bottom + 17);
  }
  context.beginPath();
  points.forEach((point, day) => context.lineTo(x(day), y(point[labels.high])));
  for (let day = points.length - 1; day >= 0; day -= 1) {
    context.lineTo(x(day), y(points[day][labels.low]));
  }
  context.closePath();
  context.fillStyle = "#dfedcf";
  context.fill();

  function line(values, color, dash) {
    context.beginPath();
    context.setLineDash(dash);
    context.strokeStyle = color;
    context.lineWidth = 2.5;
    values.forEach((point, day) => context.lineTo(x(day), y(point[metric])));
    context.stroke();
    context.setLineDash([]);
  }
  if (sampled) line(source.prior.points, "#8a9b8e", [5, 4]);
  line(points, "#266248", []);
  const point = points[index];
  context.beginPath();
  context.arc(x(index), y(point[metric]), 4.5, 0, Math.PI * 2);
  context.fillStyle = "#153c2b";
  context.fill();
  $("point-detail").textContent = dateText(point.date) + " · " + labels.format(point[metric]) + " " +
    labels.name + " · scenarios " + labels.format(point[labels.low]) + "–" + labels.format(point[labels.high]) +
    (sampled ? " · dashed line shows the initial forecast" : "");
}

function renderCamera(source) {
  const frames = room === "MuGrow" ? (window.cameraFrames || []) : [];
  $("camera-status").textContent = source.cameraOnset
    ? "The first three-day red signal began " + dateText(source.cameraOnset) + ". The chart uses the precomputed noon index."
    : "The three-day camera signal was still unconfirmed at the cutoff. This room uses the warmth-only model.";
  $("camera-frames").replaceChildren();
  for (const frame of frames) {
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.src = "camera/" + frame.file;
    image.loading = "lazy";
    image.alt = "MuGrow tomato canopy at " + frame.hour + ":00";
    const caption = document.createElement("figcaption");
    caption.textContent = dateText(frame.date) + " · " + frame.hour + ":00 · " + frame.red.toFixed(2) + "% visible red";
    figure.append(image, caption);
    $("camera-frames").append(figure);
  }
  if (frames.length) {
    const values = frames.map((frame) => frame.red);
    $("camera-status").textContent += " The same canopy registered " + Math.min(...values).toFixed(2) +
      "%–" + Math.max(...values).toFixed(2) + "% visible red across four captures on the same day.";
  }
}

function render() {
  const source = replay.rooms[room];
  const plan = currentPlan(source);
  const action = sampled && plan.action === "sample" ? "recheck" : plan.action;
  const titles = {
    sample: "Check the crop today",
    harvest: "Harvest today",
    wait: "Wait for more ripening",
    recheck: "Wait and reassess",
  };
  const explanations = {
    sample: "Some scenarios favor harvesting today and others favor waiting. A crop sample can help resolve the timing.",
    harvest: "All tested scenarios favor harvesting today under the current sellability target.",
    wait: "The tested scenarios favor a later day or need more time for the crop to meet the sellability target.",
    recheck: "The sample shifts the forecast and scenarios still disagree. Reassess tomorrow before committing the crop.",
  };
  $("as-of").dateTime = source.cutoff;
  $("as-of").textContent = dateText(source.cutoff) + " · end of day";
  $("decision-title").textContent = titles[action];
  $("reason").textContent = explanations[action];
  $("near-count").textContent = plan.near + " scenarios harvest today";
  $("late-count").textContent = plan.later + " defer";
  $("vote-bar").style.width = (100 * plan.near / (plan.near + plan.later)) + "%";
  const sampleControls = $("sample-controls");
  sampleControls.replaceChildren();
  const button = document.createElement("button");
  button.type = "button";
  button.className = sampled ? "reset" : "primary";
  button.textContent = sampled ? "Reset to initial forecast" : "Reveal recorded crop sample";
  button.disabled = $("camera-fallback").checked;
  button.addEventListener("click", () => {
    sampled = !sampled;
    custom = null;
    render();
    $("sample-controls").querySelector("button").focus();
  });
  if (sampled) {
    const measurement = document.createElement("p");
    measurement.className = "measurement";
    measurement.textContent = custom
      ? percent(custom.red) + " red by weight · " + custom.grams + " g per plant · entered scenario"
      : percent(source.sample.red) + " red by weight · " + source.sample.n + " sampled plants";
    sampleControls.append(measurement);
  }
  sampleControls.append(button);
  $("best-date").textContent = plan.selected === null ? "Beyond outlook" : dateText(plan.points[plan.selected].date);
  $("scenario-window").textContent = plan.window
    ? dateText(plan.points[plan.window[0]].date) + "–" + dateText(plan.points[plan.window[1]].date) + " across eligible scenarios"
    : "No scenario reaches the sellability target";
  $("sellable").textContent = percent(plan.points[0].sellable);
  $("ripeness").textContent = percent(plan.points[0].red);
  renderCamera(source);
  renderEconomics(source);
  drawChart();
}

function table(id, columns, rows) {
  const target = $(id);
  const header = target.createTHead().insertRow();
  for (const label of columns) {
    const heading = document.createElement("th");
    heading.scope = "col";
    heading.textContent = label;
    header.append(heading);
  }
  const body = target.createTBody();
  for (const { values, highlight } of rows) {
    const row = body.insertRow();
    if (highlight) row.classList.add("emphasis");
    for (const value of values) row.insertCell().textContent = value;
  }
}

const roomSelector = $("room");
for (const name of Object.keys(replay.rooms).sort()) roomSelector.add(new Option(name, name));
roomSelector.value = room;
roomSelector.addEventListener("change", () => {
  room = roomSelector.value;
  sampled = false;
  custom = null;
  $("sample-entry").open = false;
  $("forecast-day").value = 0;
  render();
});
$("sample-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const red = Number(fields.get("red"));
  const grams = Number(fields.get("grams"));
  custom = { red, grams, plan: projectSample(replay.rooms[room], red, grams) };
  sampled = true;
  render();
});
for (const tab of document.querySelectorAll("[data-metric]")) {
  tab.addEventListener("click", () => {
    metric = tab.dataset.metric;
    for (const button of document.querySelectorAll("[data-metric]")) {
      button.setAttribute("aria-pressed", String(button === tab));
    }
    drawChart();
  });
}
$("forecast-day").addEventListener("input", drawChart);
new ResizeObserver(drawChart).observe($("chart"));
const requests = replay.evaluation.filter((row) => row.requested).length;
const policies = [
  ["Mean final ripeness from training rooms", "mean", 0],
  ["Last recorded ripeness", "persistence", 0],
  ["Warmth only", "warmth", 0],
  ["Warmth + available camera", "never", 0],
  ["Sample when scenarios disagree", "selective", requests],
  ["Sample every room", "always", replay.evaluation.length],
];
table("metrics", ["Method", "Samples used", "Mean absolute error"], policies.map(([label, key, samples]) => ({
  values: [label, samples + " / " + replay.evaluation.length, replay.metrics[key].toFixed(2) + " pp"],
  highlight: key === "selective",
})));
table("room-results", ["Room", "Days ahead", "Observed", "Without sample", "Selective", "Always sample", "Requested"],
  replay.evaluation.map((row) => ({
    values: [row.room, row.horizon, percent(row.actual), percent(row.predictions.never), percent(row.predictions.selective),
      percent(row.predictions.always), row.requested ? "Yes" : "No"],
    highlight: row.requested,
  })));
render();

document.getElementById("economics-form").addEventListener("input", () => renderEconomics(replay.rooms[room]));
document.getElementById("camera-fallback").addEventListener("change", () => {
  sampled = false;
  custom = null;
  $("sample-entry").hidden = $("camera-fallback").checked;
  render();
});
