"use strict";
(() => {
  const key = "harvestwindow-journal-v1";
  const form = document.getElementById("journal-form");
  const message = document.getElementById("journal-message");
  let entries = [];
  const valid = row => row && typeof row.id === "string" && typeof row.room === "string" &&
    typeof row.task === "string" && typeof row.owner === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    ["Open", "Done"].includes(row.status) && [row.pots, row.revenue, row.cost].every(value => Number.isFinite(value) && value >= 0);
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    if (Array.isArray(saved) && saved.every(valid)) entries = saved;
    else message.textContent = "Saved data could not be read. Import a valid backup.";
  } catch { message.textContent = "Browser storage unavailable. Export a backup before closing this page."; }
  for (const name of Object.keys(window.harvestReplay.rooms)) form.elements.room.add(new Option(name, name));
  function render() {
    const body = document.querySelector("#journal-table tbody"); body.replaceChildren();
    for (const entry of [...entries].sort((a,b) => a.date.localeCompare(b.date))) {
      const row = body.insertRow();
      for (const value of [entry.date, entry.room, entry.owner, entry.task, entry.pots, entry.revenue.toFixed(2), entry.cost.toFixed(2)]) row.insertCell().textContent = value;
      const button = document.createElement("button"); button.type = "button"; button.textContent = entry.status;
      button.setAttribute("aria-label", `Toggle status for ${entry.task}`);
      button.addEventListener("click", () => { entry.status = entry.status === "Open" ? "Done" : "Open"; save(); });
      row.insertCell().append(button);
    }
    const done = entries.filter(row => row.status === "Done");
    document.getElementById("journal-summary").textContent = `${entries.filter(row => row.status === "Open").length} open tasks. ` +
      `Completed entries: ${done.reduce((sum,row) => sum + row.pots, 0)} pots; entered revenue less entered costs €${done.reduce((sum,row) => sum + row.revenue - row.cost, 0).toFixed(2)}. These are your entries, not dataset outcomes.`;
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(entries)); message.textContent = "Saved in this browser. Export backups for transfer to another device."; }
    catch { message.textContent = "Storage unavailable or full. Export now to preserve your entries."; }
    render();
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const fields = new FormData(form);
    entries.push({ id: crypto.randomUUID(), date: fields.get("date"), room: fields.get("room"),
      owner: fields.get("owner").trim(), task: fields.get("task").trim(), status: "Open",
      pots: Number(fields.get("pots")), revenue: Number(fields.get("revenue")), cost: Number(fields.get("cost")) });
    save(); form.elements.task.value = "";
  });
  document.getElementById("export-journal").addEventListener("click", () => downloadJSON("harvestwindow-journal.json", {version: 1, entries}));
  document.getElementById("import-journal").addEventListener("change", async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 2000000) throw Error("Backup exceeds 2 MB.");
      const backup = JSON.parse(await file.text());
      if (backup.version !== 1 || !Array.isArray(backup.entries) || !backup.entries.every(valid)) throw Error("Invalid journal backup.");
      const ids = new Set(entries.map(row => row.id));
      for (const row of backup.entries) if (!ids.has(row.id)) { entries.push(row); ids.add(row.id); }
      save();
    } catch (error) { message.textContent = error.message; }
    event.target.value = "";
  });
  render();
})();
