"use strict";
function renderOperations() {
  const roomName = document.getElementById("room").value.toLowerCase();
  const source = window.operationsData[roomName];
  const body = document.querySelector("#operations-table tbody");
  body.replaceChildren();
  for (const item of source.rows) {
    const row = body.insertRow();
    const quality = item.suspect ? `${item.suspect} suspect readings — inspect sensor` :
      item.coverage < 95 ? "Incomplete observations" : "No basic range flag";
    for (const value of [item.label, item.value ?? "Missing", item.aggregation,
      item.coverage + "%", quality]) row.insertCell().textContent = value;
  }
  document.getElementById("operations-summary").textContent =
    `${source.records.toLocaleString()} records from October 30–November 5. Raw summaries retain suspect readings; flagged channels need review before use.`;
}

function setupExplorer() {
  const sourceSelect = document.getElementById("data-source");
  const channelSelect = document.getElementById("data-channel");
  for (const name of Object.keys(window.operationsData)) sourceSelect.add(new Option(name, name));
  sourceSelect.value = "mugrow";
  function draw() {
    const source = window.operationsData[sourceSelect.value];
    const channel = source.channels.find(row => row.channel === channelSelect.value);
    const body = document.querySelector("#channel-table tbody");
    body.replaceChildren();
    if (!channel) { document.getElementById("channel-summary").textContent = "No matching channels."; return; }
    document.getElementById("channel-summary").textContent =
      `${channel.kind} · ${channel.unit} · ${channel.coverage}% numeric coverage · ${channel.suspect} basic range flags. ` +
      `${source.historyRecords.toLocaleString()} observations, ${source.start} through ${source.end}. ${channel.description}`;
    for (const day of channel.daily) {
      const row = body.insertRow();
      for (const value of [day.date, day.mean ?? "Missing", day.min ?? "Missing", day.max ?? "Missing",
        day.coverage + "%", day.suspect]) row.insertCell().textContent = value;
    }
  }
  function channels() {
    const previous = channelSelect.value;
    const query = document.getElementById("channel-search").value.toLowerCase();
    channelSelect.replaceChildren();
    for (const item of window.operationsData[sourceSelect.value].channels.filter(row => row.channel.toLowerCase().includes(query))) {
      channelSelect.add(new Option(item.channel, item.channel));
    }
    if ([...channelSelect.options].some(option => option.value === previous)) channelSelect.value = previous;
    draw();
  }
  sourceSelect.addEventListener("change", channels);
  channelSelect.addEventListener("change", draw);
  document.getElementById("channel-search").addEventListener("input", channels);
  document.getElementById("room").addEventListener("change", renderOperations);
  document.getElementById("export-data").addEventListener("click", () => downloadJSON("harvestwindow-observations.json", window.operationsData[sourceSelect.value]));
  channels(); renderOperations();
}
function downloadJSON(filename, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: "application/json"}));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
setupExplorer();
