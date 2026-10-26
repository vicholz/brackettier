/** localStorage persistence for Brackettier */

export const STORAGE_KEY = "brackettier:v1";
export const STATE_VERSION = 1;

export function createEmptyState() {
  return {
    version: STATE_VERSION,
    people: [],
    brackets: [],
    activeBracketId: null,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyState();
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return createEmptyState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function normalizeState(input) {
  const base = createEmptyState();
  if (!input || typeof input !== "object") return base;

  const people = Array.isArray(input.people)
    ? input.people
        .filter((p) => p && typeof p === "object")
        .map((p) => ({
          id: String(p.id || uid()),
          name: String(p.name || "").trim() || "Unnamed",
        }))
    : [];
  sortPeopleAlphabetically(people);

  const brackets = Array.isArray(input.brackets)
    ? input.brackets
        .filter((b) => b && typeof b === "object")
        .map(normalizeBracket)
    : [];

  let activeBracketId = input.activeBracketId ? String(input.activeBracketId) : null;
  if (activeBracketId && !brackets.some((b) => b.id === activeBracketId)) {
    activeBracketId = brackets[0]?.id ?? null;
  }
  if (!activeBracketId && brackets.length) activeBracketId = brackets[0].id;

  return {
    version: STATE_VERSION,
    people,
    brackets,
    activeBracketId,
  };
}

/** Case-insensitive A–Z by name (mutates and returns the array). */
export function sortPeopleAlphabetically(people) {
  if (!Array.isArray(people)) return people;
  people.sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
      sensitivity: "base",
      numeric: true,
    })
  );
  return people;
}

function normalizeBracket(b) {
  const teamSize = clampInt(b.teamSize, 1, 5, 1);
  const rounds = Array.isArray(b.rounds)
    ? b.rounds.map((round) =>
        (Array.isArray(round) ? round : []).map((m) => normalizeMatch(m, teamSize))
      )
    : [];

  return {
    id: String(b.id || uid()),
    name: String(b.name || "").trim() || "Untitled bracket",
    teamSize,
    rounds,
  };
}

function normalizeMatch(m, teamSize) {
  const sides = [0, 1].map((i) => {
    const side = Array.isArray(m?.sides) ? m.sides[i] : null;
    const slots = Array.isArray(side?.slots)
      ? side.slots.slice(0, teamSize).map((s) => (s == null || s === "" ? null : String(s)))
      : [];
    while (slots.length < teamSize) slots.push(null);
    return { slots };
  });

  let winner = m?.winner;
  if (winner !== 0 && winner !== 1) winner = null;

  return {
    id: String(m?.id || uid()),
    sides,
    winner,
    bye: Boolean(m?.bye),
  };
}

export function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Merge imported state into current.
 * People/brackets with matching ids are updated; new ids are appended.
 */
export function mergeStates(current, incoming) {
  const next = {
    version: STATE_VERSION,
    people: [...current.people],
    brackets: [...current.brackets],
    activeBracketId: current.activeBracketId,
  };

  for (const person of incoming.people) {
    const idx = next.people.findIndex((p) => p.id === person.id);
    if (idx >= 0) next.people[idx] = person;
    else next.people.push(person);
  }

  for (const bracket of incoming.brackets) {
    const idx = next.brackets.findIndex((b) => b.id === bracket.id);
    if (idx >= 0) next.brackets[idx] = bracket;
    else next.brackets.push(bracket);
  }

  if (incoming.activeBracketId) {
    next.activeBracketId = incoming.activeBracketId;
  } else if (!next.activeBracketId && next.brackets.length) {
    next.activeBracketId = next.brackets[0].id;
  }

  return normalizeState(next);
}
