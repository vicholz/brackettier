import {
  loadState,
  saveState,
  clearState,
  createEmptyState,
  normalizeState,
  mergeStates,
  uid,
} from "./storage.js";
import {
  addFirstRoundMatch,
  removeFirstRoundMatch,
  rebuildLaterRounds,
  resizeBracketTeams,
  setWinner,
  getChampion,
  roundName,
  sideLabel,
  sideHasAnyone,
  canPickWinner,
  autoAssignPeople,
  countEmptyFirstRoundSlots,
} from "./bracket.js";
import {
  stateToJson,
  parseStateJson,
  downloadJson,
  buildShareUrl,
  tryLoadFromHash,
  clearShareHash,
} from "./share.js";

let state = createEmptyState();
let slotContext = null;
let toastTimer = null;

const els = {
  views: {
    people: document.getElementById("view-people"),
    brackets: document.getElementById("view-brackets"),
    data: document.getElementById("view-data"),
  },
  navBtns: [...document.querySelectorAll(".nav-btn")],
  personForm: document.getElementById("person-form"),
  personName: document.getElementById("person-name"),
  peopleList: document.getElementById("people-list"),
  peopleEmpty: document.getElementById("people-empty"),
  bracketSelect: document.getElementById("bracket-select"),
  bracketWorkspace: document.getElementById("bracket-workspace"),
  bracketsEmpty: document.getElementById("brackets-empty"),
  teamSize: document.getElementById("team-size"),
  bracketBoard: document.getElementById("bracket-board"),
  championBanner: document.getElementById("champion-banner"),
  assignStatus: document.getElementById("assign-status"),
  toast: document.getElementById("toast"),
  dialogBracket: document.getElementById("dialog-bracket"),
  formNewBracket: document.getElementById("form-new-bracket"),
  newBracketName: document.getElementById("new-bracket-name"),
  newBracketSize: document.getElementById("new-bracket-size"),
  dialogSlot: document.getElementById("dialog-slot"),
  formSlot: document.getElementById("form-slot"),
  slotPerson: document.getElementById("slot-person"),
  slotDialogMeta: document.getElementById("slot-dialog-meta"),
  pasteJson: document.getElementById("paste-json"),
  importFile: document.getElementById("import-file"),
  shareStatus: document.getElementById("share-status"),
};

function persist() {
  saveState(state);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2600);
}

function peopleById() {
  return new Map(state.people.map((p) => [p.id, p]));
}

function activeBracket() {
  return state.brackets.find((b) => b.id === state.activeBracketId) || null;
}

function setView(name) {
  for (const [key, el] of Object.entries(els.views)) {
    const on = key === name;
    el.hidden = !on;
    el.classList.toggle("is-active", on);
  }
  for (const btn of els.navBtns) {
    btn.classList.toggle("is-active", btn.dataset.view === name);
  }
  if (name === "brackets") renderBrackets();
  if (name === "people") renderPeople();
}

/* —— People —— */

function renderPeople() {
  els.peopleList.innerHTML = "";
  els.peopleEmpty.hidden = state.people.length > 0;

  for (const person of state.people) {
    const li = document.createElement("li");
    li.className = "person-row";
    li.dataset.id = person.id;

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 80;
    input.value = person.name;
    input.setAttribute("aria-label", "Edit name");
    input.addEventListener("change", () => {
      const name = input.value.trim();
      if (!name) {
        input.value = person.name;
        return;
      }
      person.name = name;
      persist();
      toast("Saved name");
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-danger";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      if (!confirm(`Remove ${person.name}?`)) return;
      state.people = state.people.filter((p) => p.id !== person.id);
      // Clear references in brackets
      for (const bracket of state.brackets) {
        for (const round of bracket.rounds) {
          for (const match of round) {
            for (const side of match.sides) {
              side.slots = side.slots.map((id) => (id === person.id ? null : id));
            }
          }
        }
        rebuildLaterRounds(bracket);
      }
      persist();
      renderPeople();
      toast("Removed");
    });

    li.append(input, remove);
    els.peopleList.append(li);
  }
}

/* —— Brackets —— */

function renderBrackets() {
  const select = els.bracketSelect;
  select.innerHTML = "";
  if (els.assignStatus) els.assignStatus.textContent = "";

  if (!state.brackets.length) {
    els.bracketWorkspace.hidden = true;
    els.bracketsEmpty.hidden = false;
    return;
  }

  els.bracketsEmpty.hidden = true;
  els.bracketWorkspace.hidden = false;

  for (const b of state.brackets) {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.name;
    select.append(opt);
  }

  if (!state.activeBracketId || !state.brackets.some((b) => b.id === state.activeBracketId)) {
    state.activeBracketId = state.brackets[0].id;
    persist();
  }
  select.value = state.activeBracketId;

  const bracket = activeBracket();
  if (!bracket) return;

  els.teamSize.value = String(bracket.teamSize);
  renderBracketBoard(bracket);
}

function renderBracketBoard(bracket) {
  rebuildLaterRounds(bracket);
  const map = peopleById();
  const board = els.bracketBoard;
  board.innerHTML = "";

  const rounds = bracket.rounds;
  const total = rounds.length;

  rounds.forEach((round, ri) => {
    const col = document.createElement("div");
    col.className = "round-col";

    const title = document.createElement("h3");
    title.className = "round-title";
    title.textContent = roundName(ri, total);
    col.append(title);

    round.forEach((match, mi) => {
      col.append(renderMatch(bracket, ri, mi, match, map));
    });

    if (!round.length) {
      const empty = document.createElement("p");
      empty.className = "empty-hint";
      empty.textContent = "No matches";
      col.append(empty);
    }

    board.append(col);
  });

  const champ = getChampion(bracket);
  if (champ) {
    els.championBanner.hidden = false;
    els.championBanner.textContent = `Champion: ${sideLabel(champ, map)}`;
  } else {
    els.championBanner.hidden = true;
    els.championBanner.textContent = "";
  }
}

function renderMatch(bracket, roundIndex, matchIndex, match, map) {
  const card = document.createElement("article");
  card.className = "match-card";
  card.dataset.matchId = match.id;

  const isFirst = roundIndex === 0;

  match.sides.forEach((side, si) => {
    const sideEl = document.createElement("div");
    sideEl.className = "match-side";
    if (match.winner === si) sideEl.classList.add("is-winner");
    if (match.bye && si === 1 && !sideHasAnyone(side)) sideEl.classList.add("is-bye");

    const slots = document.createElement("div");
    slots.className = "side-slots";

    side.slots.forEach((personId, slotIndex) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot-btn";
      const person = personId ? map.get(personId) : null;
      if (person) {
        btn.classList.add("is-filled");
        btn.textContent = person.name;
      } else {
        btn.textContent = isFirst ? "Tap to assign…" : "Awaiting winner…";
      }

      if (isFirst) {
        btn.addEventListener("click", () => openSlotDialog(roundIndex, matchIndex, si, slotIndex));
      } else {
        btn.classList.add("is-locked");
        btn.disabled = true;
      }
      slots.append(btn);
    });

    const meta = document.createElement("div");
    meta.className = "side-meta";

    const label = document.createElement("span");
    label.className = "side-label";
    label.textContent = si === 0 ? "Side A" : match.bye && !sideHasAnyone(side) ? "Bye" : "Side B";

    const win = document.createElement("button");
    win.type = "button";
    win.className = "win-btn";
    win.textContent = match.winner === si ? "Winner" : "Set winner";
    if (match.winner === si) win.classList.add("is-selected");
    win.disabled = !canPickWinner(match, si) || !sideHasAnyone(side);
    win.addEventListener("click", () => {
      setWinner(bracket, roundIndex, matchIndex, si);
      persist();
      renderBracketBoard(bracket);
    });

    meta.append(label, win);
    sideEl.append(slots, meta);
    card.append(sideEl);
  });

  if (isFirst) {
    const footer = document.createElement("div");
    footer.className = "match-footer";
    footer.innerHTML = `<span>Match ${matchIndex + 1}</span>`;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-ghost";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      if (!confirm("Remove this match?")) return;
      removeFirstRoundMatch(bracket, match.id);
      persist();
      renderBracketBoard(bracket);
    });
    footer.append(del);
    card.append(footer);
  } else {
    const footer = document.createElement("div");
    footer.className = "match-footer";
    footer.innerHTML = `<span>Match ${matchIndex + 1}</span>`;
    card.append(footer);
  }

  return card;
}

function openSlotDialog(roundIndex, matchIndex, sideIndex, slotIndex) {
  const bracket = activeBracket();
  if (!bracket) return;
  slotContext = { roundIndex, matchIndex, sideIndex, slotIndex };

  const match = bracket.rounds[roundIndex][matchIndex];
  const current = match.sides[sideIndex].slots[slotIndex];

  els.slotDialogMeta.textContent = `${bracket.name} · Round ${roundIndex + 1} · Side ${
    sideIndex === 0 ? "A" : "B"
  } · Slot ${slotIndex + 1}`;

  els.slotPerson.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "— Select —";
  els.slotPerson.append(none);

  // Prefer unused people but still allow reuse (same person in multiple brackets OK;
  // within same bracket first round, warn via listing all)
  for (const person of state.people) {
    const opt = document.createElement("option");
    opt.value = person.id;
    opt.textContent = person.name;
    if (person.id === current) opt.selected = true;
    els.slotPerson.append(opt);
  }

  if (!state.people.length) {
    toast("Add people first");
    return;
  }

  els.dialogSlot.showModal();
}

function applySlotAssignment(personId) {
  const bracket = activeBracket();
  if (!bracket || !slotContext) return;
  const { roundIndex, matchIndex, sideIndex, slotIndex } = slotContext;
  const match = bracket.rounds[roundIndex]?.[matchIndex];
  if (!match) return;

  match.sides[sideIndex].slots[slotIndex] = personId || null;
  match.winner = null;
  for (let r = roundIndex + 1; r < bracket.rounds.length; r++) {
    for (const m of bracket.rounds[r]) m.winner = null;
  }
  rebuildLaterRounds(bracket);
  persist();
  renderBracketBoard(bracket);
}

function runAutoAssign({ reshuffle }) {
  const bracket = activeBracket();
  if (!bracket) return;
  const result = autoAssignPeople(bracket, state.people, { reshuffle });
  if (!result.skipped || result.filled > 0) {
    persist();
    renderBracketBoard(bracket);
  }
  if (els.assignStatus) els.assignStatus.textContent = result.message;
  toast(result.message);
}

const DEMO_NAMES = [
  "Captain Noodle",
  "Sir Quacksalot",
  "Princess Beanbag",
  "Professor Wiggle",
  "Duke Butterscotch",
  "Lady Marshmallow",
  "Baron Von Biscuit",
  "Countess Popcorn",
  "Admiral Sockpuppet",
  "Mayor Pickles",
  "Ziggy Moonbeam",
  "Fluffy McSnuggle",
];

/** Replace app state with a clean, repeatable 12-person 1v1 demo bracket. */
function loadDemo() {
  const people = DEMO_NAMES.map((name) => ({ id: uid(), name }));
  const bracket = {
    id: uid(),
    name: "Whimsy Cup",
    teamSize: 1,
    rounds: [[]],
  };
  // 12 people → 6 first-round matches
  for (let i = 0; i < 6; i++) addFirstRoundMatch(bracket);
  autoAssignPeople(bracket, people, { reshuffle: true });

  state = {
    version: state.version || 1,
    people,
    brackets: [bracket],
    activeBracketId: bracket.id,
  };
  persist();
  renderPeople();
  renderBrackets();
  setView("brackets");
  if (els.assignStatus) {
    els.assignStatus.textContent = "Demo loaded: 12 whimsical names in Whimsy Cup (1v1).";
  }
  toast("Demo loaded — 12 names, Whimsy Cup bracket");
}

/* —— Events —— */

function wireEvents() {
  for (const btn of els.navBtns) {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  }

  els.personForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = els.personName.value.trim();
    if (!name) return;
    state.people.push({ id: uid(), name });
    els.personName.value = "";
    persist();
    renderPeople();
    els.personName.focus();
  });

  document.getElementById("btn-new-bracket").addEventListener("click", () => {
    els.newBracketName.value = "";
    els.newBracketSize.value = "1";
    document.getElementById("dialog-bracket-title").textContent = "New bracket";
    els.dialogBracket.showModal();
    els.newBracketName.focus();
  });

  els.formNewBracket.addEventListener("submit", (e) => {
    const submitter = e.submitter;
    if (submitter?.value === "cancel") return;
    e.preventDefault();
    const name = els.newBracketName.value.trim();
    if (!name) return;
    const teamSize = Number.parseInt(els.newBracketSize.value, 10) || 1;
    const bracket = {
      id: uid(),
      name,
      teamSize,
      rounds: [[]],
    };
    addFirstRoundMatch(bracket);
    addFirstRoundMatch(bracket);
    state.brackets.push(bracket);
    state.activeBracketId = bracket.id;
    persist();
    els.dialogBracket.close();
    setView("brackets");
    toast(`Created “${name}”`);
  });

  // dialog form method=dialog still needs cancel to close without create
  els.formNewBracket.querySelector('[value="cancel"]').addEventListener("click", () => {
    els.dialogBracket.close();
  });

  document.getElementById("btn-rename-bracket").addEventListener("click", () => {
    const bracket = activeBracket();
    if (!bracket) return;
    const name = prompt("Rename bracket", bracket.name);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    bracket.name = trimmed;
    persist();
    renderBrackets();
  });

  document.getElementById("btn-delete-bracket").addEventListener("click", () => {
    const bracket = activeBracket();
    if (!bracket) return;
    if (!confirm(`Delete bracket “${bracket.name}”?`)) return;
    state.brackets = state.brackets.filter((b) => b.id !== bracket.id);
    state.activeBracketId = state.brackets[0]?.id ?? null;
    persist();
    renderBrackets();
    toast("Bracket deleted");
  });

  els.bracketSelect.addEventListener("change", () => {
    state.activeBracketId = els.bracketSelect.value;
    persist();
    renderBrackets();
  });

  els.teamSize.addEventListener("change", () => {
    const bracket = activeBracket();
    if (!bracket) return;
    const size = Number.parseInt(els.teamSize.value, 10) || 1;
    resizeBracketTeams(bracket, size);
    persist();
    renderBracketBoard(bracket);
    toast(`Team size set to ${size}v${size}`);
  });

  document.getElementById("btn-add-match").addEventListener("click", () => {
    const bracket = activeBracket();
    if (!bracket) return;
    addFirstRoundMatch(bracket);
    persist();
    renderBracketBoard(bracket);
  });

  document.getElementById("btn-auto-assign").addEventListener("click", () => {
    runAutoAssign({ reshuffle: false });
  });

  document.getElementById("btn-reshuffle").addEventListener("click", () => {
    const bracket = activeBracket();
    if (!bracket) return;
    const empty = countEmptyFirstRoundSlots(bracket);
    const msg =
      empty === 0
        ? "Clear all first-round assignments and reshuffle everyone into this bracket?"
        : "Clear existing first-round assignments and reshuffle from the people pool?";
    if (!confirm(msg)) return;
    runAutoAssign({ reshuffle: true });
  });

  document.getElementById("btn-rebuild").addEventListener("click", () => {
    const bracket = activeBracket();
    if (!bracket) return;
    rebuildLaterRounds(bracket);
    persist();
    renderBracketBoard(bracket);
    toast("Later rounds rebuilt");
  });

  els.formSlot.addEventListener("submit", (e) => {
    const submitter = e.submitter;
    if (submitter?.value === "cancel") {
      slotContext = null;
      return;
    }
    e.preventDefault();
    applySlotAssignment(els.slotPerson.value || null);
    slotContext = null;
    els.dialogSlot.close();
  });

  document.getElementById("btn-clear-slot").addEventListener("click", () => {
    applySlotAssignment(null);
    slotContext = null;
    els.dialogSlot.close();
  });

  document.getElementById("btn-demo").addEventListener("click", () => {
    const hasData = state.people.length > 0 || state.brackets.length > 0;
    if (hasData && !confirm("Replace all current data with the DEMO tournament?")) {
      return;
    }
    loadDemo();
  });

  document.getElementById("btn-print").addEventListener("click", () => {
    setView("brackets");
    window.print();
  });

  document.getElementById("btn-export").addEventListener("click", () => {
    downloadJson(state);
    toast("Downloaded JSON");
  });

  document.getElementById("btn-copy-json").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(stateToJson(state));
      toast("JSON copied");
    } catch {
      els.pasteJson.value = stateToJson(state);
      setView("data");
      toast("Copied into paste box — select & copy");
    }
  });

  document.getElementById("btn-import-file").addEventListener("click", () => {
    els.importFile.click();
  });

  els.importFile.addEventListener("change", async () => {
    const file = els.importFile.files?.[0];
    els.importFile.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      applyImport(parseStateJson(text));
    } catch (err) {
      console.error(err);
      toast("Import failed — invalid JSON");
    }
  });

  document.getElementById("btn-import-paste").addEventListener("click", () => {
    try {
      applyImport(parseStateJson(els.pasteJson.value));
      els.pasteJson.value = "";
    } catch (err) {
      console.error(err);
      toast("Import failed — invalid JSON");
    }
  });

  document.getElementById("btn-share-link").addEventListener("click", async () => {
    els.shareStatus.textContent = "Building link…";
    try {
      const { url, tooLarge } = await buildShareUrl(state);
      if (tooLarge) {
        els.shareStatus.textContent =
          "State is too large for a URL. Use Copy JSON / Download instead.";
        await navigator.clipboard.writeText(stateToJson(state));
        toast("Link too large — JSON copied instead");
        return;
      }
      await navigator.clipboard.writeText(url);
      els.shareStatus.textContent = "Share link copied. Opening it restores this exact state.";
      toast("Share link copied");
    } catch (err) {
      console.error(err);
      els.shareStatus.textContent = "Could not build share link. Use Copy JSON.";
      toast("Share failed");
    }
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    if (!confirm("Clear all people and brackets from this browser?")) return;
    clearState();
    state = createEmptyState();
    clearShareHash();
    renderPeople();
    renderBrackets();
    toast("Cleared");
  });
}

function applyImport(incoming) {
  const mode =
    document.querySelector('input[name="import-mode"]:checked')?.value || "replace";
  if (mode === "merge") {
    state = mergeStates(state, incoming);
    toast("Merged import");
  } else {
    state = normalizeState(incoming);
    toast("Replaced with import");
  }
  persist();
  renderPeople();
  renderBrackets();
  setView("brackets");
}

async function boot() {
  wireEvents();

  const fromHash = await tryLoadFromHash();
  if (fromHash) {
    state = fromHash;
    persist();
    clearShareHash();
    toast("Loaded shared bracket data");
  } else {
    state = loadState();
  }

  // Ensure structure
  for (const b of state.brackets) rebuildLaterRounds(b);

  renderPeople();
  renderBrackets();
  setView(state.brackets.length ? "brackets" : "people");
}

boot();
