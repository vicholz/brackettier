/** Single-elimination bracket helpers */

import { uid } from "./storage.js";

export function emptySide(teamSize) {
  return { slots: Array.from({ length: teamSize }, () => null) };
}

export function createMatch(teamSize, options = {}) {
  const sides = options.sides
    ? options.sides.map((s) => ({ slots: padSlots(s?.slots, teamSize) }))
    : [emptySide(teamSize), emptySide(teamSize)];
  while (sides.length < 2) sides.push(emptySide(teamSize));

  return {
    id: options.id || uid(),
    sides: sides.slice(0, 2),
    winner: options.winner === 0 || options.winner === 1 ? options.winner : null,
    bye: Boolean(options.bye),
  };
}

function padSlots(slots, teamSize) {
  const out = Array.isArray(slots) ? slots.slice(0, teamSize).map((s) => s ?? null) : [];
  while (out.length < teamSize) out.push(null);
  return out;
}

export function sideFilled(side) {
  return side.slots.every((s) => s != null && s !== "");
}

export function sideHasAnyone(side) {
  return side.slots.some((s) => s != null && s !== "");
}

export function sideLabel(side, peopleById) {
  const names = side.slots
    .map((id) => (id ? peopleById.get(id)?.name : null))
    .filter(Boolean);
  if (!names.length) return "—";
  return names.join(" / ");
}

export function cloneSide(side) {
  return { slots: [...side.slots] };
}

/**
 * Ensure rounds[1+] exist and are sized for single-elim from round 0.
 * Propagates winners into the next round; clears dependents when winners change.
 */
export function rebuildLaterRounds(bracket) {
  const teamSize = bracket.teamSize;
  const first = bracket.rounds[0] || [];
  if (!first.length) {
    bracket.rounds = [[]];
    return bracket;
  }

  const rounds = [first.map((m) => ({ ...m, sides: m.sides.map(cloneSide) }))];
  let prev = rounds[0];

  while (prev.length > 1) {
    const nextCount = Math.ceil(prev.length / 2);
    const next = [];
    for (let i = 0; i < nextCount; i++) {
      const existing = bracket.rounds[rounds.length]?.[i];
      const match = existing
        ? {
            id: existing.id,
            sides: [emptySide(teamSize), emptySide(teamSize)],
            winner: existing.winner,
            bye: false,
          }
        : createMatch(teamSize);

      const left = prev[i * 2];
      const right = prev[i * 2 + 1];

      if (left?.winner != null) {
        match.sides[0] = cloneSide(left.sides[left.winner]);
      }
      if (right?.winner != null) {
        match.sides[1] = cloneSide(right.sides[right.winner]);
      } else if (!right && left?.winner != null) {
        // Odd match count: bye into next round
        match.sides[1] = emptySide(teamSize);
        match.bye = true;
        if (match.winner == null) match.winner = 0;
      }

      // Invalidate winner if selected side no longer matches prior choice
      if (match.winner != null && !sideHasAnyone(match.sides[match.winner])) {
        match.winner = null;
      }

      next.push(match);
    }
    rounds.push(next);
    prev = next;
  }

  bracket.rounds = rounds;
  return bracket;
}

export function setWinner(bracket, roundIndex, matchIndex, sideIndex) {
  const match = bracket.rounds[roundIndex]?.[matchIndex];
  if (!match) return bracket;
  if (sideIndex !== 0 && sideIndex !== 1) return bracket;

  if (match.winner === sideIndex) {
    match.winner = null;
  } else {
    match.winner = sideIndex;
  }

  // Clear winners downstream from this point
  for (let r = roundIndex + 1; r < bracket.rounds.length; r++) {
    for (const m of bracket.rounds[r]) {
      m.winner = null;
    }
  }

  return rebuildLaterRounds(bracket);
}

/**
 * First-round match count so the pool can fill: ceil(people / (2 * teamSize)).
 * Two sides × teamSize slots per match. Empty pool → 1 match (UI not empty).
 */
export function firstRoundMatchCountForPeople(peopleCount, teamSize) {
  const size = Math.max(1, Number(teamSize) || 1);
  const n = Math.max(0, Number(peopleCount) || 0);
  if (n === 0) return 1;
  return Math.ceil(n / (2 * size));
}

export function addFirstRoundMatch(bracket) {
  if (!bracket.rounds.length) bracket.rounds = [[]];
  bracket.rounds[0].push(createMatch(bracket.teamSize));
  return rebuildLaterRounds(bracket);
}

export function removeFirstRoundMatch(bracket, matchId) {
  if (!bracket.rounds[0]) return bracket;
  bracket.rounds[0] = bracket.rounds[0].filter((m) => m.id !== matchId);
  return rebuildLaterRounds(bracket);
}

/** True when neither side has anyone assigned. */
export function matchIsEmpty(match) {
  return !match?.sides?.some((side) => sideHasAnyone(side));
}

/**
 * Drop first-round matches with no people on either side, then rebuild.
 * Used after top-down auto-assign so unused lower matches disappear.
 */
export function pruneEmptyFirstRoundMatches(bracket) {
  if (!bracket.rounds[0]?.length) return { bracket, removed: 0 };
  const before = bracket.rounds[0].length;
  bracket.rounds[0] = bracket.rounds[0].filter((m) => !matchIsEmpty(m));
  const removed = before - bracket.rounds[0].length;
  rebuildLaterRounds(bracket);
  return { bracket, removed };
}

export function resizeBracketTeams(bracket, teamSize) {
  bracket.teamSize = teamSize;
  for (const round of bracket.rounds) {
    for (const match of round) {
      for (const side of match.sides) {
        side.slots = padSlots(side.slots, teamSize);
      }
    }
  }
  return rebuildLaterRounds(bracket);
}

export function getChampion(bracket) {
  if (!bracket.rounds.length) return null;
  const last = bracket.rounds[bracket.rounds.length - 1];
  if (!last?.length) return null;
  const final = last[0];
  if (!final || final.winner == null) return null;
  return final.sides[final.winner];
}

export function roundName(roundIndex, totalRounds) {
  const fromEnd = totalRounds - roundIndex;
  if (fromEnd === 1) return "Final";
  if (fromEnd === 2) return "Semifinals";
  if (fromEnd === 3) return "Quarterfinals";
  return `Round ${roundIndex + 1}`;
}

export function canPickWinner(match, sideIndex) {
  const side = match.sides[sideIndex];
  if (!sideHasAnyone(side)) return false;
  return true;
}

/** Person ids already placed in first-round slots. */
export function firstRoundAssignedIds(bracket) {
  const used = new Set();
  for (const match of bracket.rounds[0] || []) {
    for (const side of match.sides) {
      for (const id of side.slots) {
        if (id != null && id !== "") used.add(id);
      }
    }
  }
  return used;
}

/** True if this person id appears in any match slot in the bracket. */
export function personAssignedInBracket(bracket, personId) {
  if (!personId) return false;
  for (const round of bracket.rounds || []) {
    for (const match of round) {
      for (const side of match.sides || []) {
        if (side.slots?.some((id) => id === personId)) return true;
      }
    }
  }
  return false;
}

/**
 * Remove a person from every slot, drop winners whose side is now empty,
 * then rebuild later rounds so advances stay consistent (no ghost ids).
 */
export function removePersonFromBracket(bracket, personId) {
  let cleared = 0;
  for (const round of bracket.rounds || []) {
    for (const match of round) {
      for (const side of match.sides || []) {
        side.slots = side.slots.map((id) => {
          if (id !== personId) return id;
          cleared += 1;
          return null;
        });
      }
      if (match.winner != null && !sideHasAnyone(match.sides[match.winner])) {
        match.winner = null;
        match.bye = false;
      }
    }
  }
  rebuildLaterRounds(bracket);
  return { cleared };
}

export function countEmptyFirstRoundSlots(bracket) {
  let empty = 0;
  for (const match of bracket.rounds[0] || []) {
    for (const side of match.sides) {
      for (const id of side.slots) {
        if (id == null || id === "") empty += 1;
      }
    }
  }
  return empty;
}

/**
 * Clear first-round people and all winners so the bracket is unassigned.
 */
export function clearBracketAssignments(bracket) {
  for (const match of bracket.rounds[0] || []) {
    for (const side of match.sides) {
      side.slots = side.slots.map(() => null);
    }
    match.winner = null;
    match.bye = false;
  }
  for (let r = 1; r < (bracket.rounds?.length || 0); r++) {
    for (const m of bracket.rounds[r]) m.winner = null;
  }
  return rebuildLaterRounds(bracket);
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Fill empty first-round slots from the people pool (top-down).
 * Never assigns the same person twice in a bracket. Does not overwrite
 * existing slots unless `reshuffle` is true. After filling, removes
 * first-round matches that still have nobody on either side.
 *
 * @returns {{ filled: number, remainingEmpty: number, removedMatches: number, skipped: boolean, message: string }}
 */
export function autoAssignPeople(bracket, people, { reshuffle = false } = {}) {
  if (!Array.isArray(people) || !people.length) {
    return {
      filled: 0,
      remainingEmpty: countEmptyFirstRoundSlots(bracket),
      removedMatches: 0,
      skipped: true,
      message: "No people in the pool. Add names on the People tab.",
    };
  }

  if (reshuffle) {
    clearBracketAssignments(bracket);
  }

  // Re-read after clear/rebuild so we don’t fill a stale rounds[0] array
  const first = bracket.rounds[0];
  if (!first?.length) {
    return {
      filled: 0,
      remainingEmpty: 0,
      removedMatches: 0,
      skipped: true,
      message: "Add a first-round match before auto-assigning.",
    };
  }

  const emptyBefore = countEmptyFirstRoundSlots(bracket);
  if (!emptyBefore) {
    return {
      filled: 0,
      remainingEmpty: 0,
      removedMatches: 0,
      skipped: true,
      message: "All slots are already filled. Use Reshuffle to re-assign.",
    };
  }

  const used = firstRoundAssignedIds(bracket);
  // Shuffle who; where they land is always top-down (stable bracket order).
  const available = shuffleInPlace(
    people.filter((p) => p?.id && !used.has(p.id)).map((p) => String(p.id))
  );

  // Empty slots in visual order: match top→bottom, side A then B, slots top→bottom.
  const empties = [];
  for (const match of first) {
    for (let si = 0; si < match.sides.length; si++) {
      match.sides[si].slots.forEach((id, slotIndex) => {
        if (id == null || id === "") {
          empties.push({ match, sideIndex: si, slotIndex });
        }
      });
    }
  }

  let filled = 0;
  const n = Math.min(available.length, empties.length);
  for (let i = 0; i < n; i++) {
    const { match, sideIndex, slotIndex } = empties[i];
    match.sides[sideIndex].slots[slotIndex] = available[i];
    filled += 1;
  }

  const { removed: removedMatches } = pruneEmptyFirstRoundMatches(bracket);
  const remainingEmpty = countEmptyFirstRoundSlots(bracket);

  let message;
  if (filled === 0) {
    message = "No free people left to assign (everyone is already in this bracket).";
  } else if (remainingEmpty > 0) {
    message = `Assigned ${filled} slot${filled === 1 ? "" : "s"}; ${remainingEmpty} still empty (not enough people).`;
  } else {
    message = reshuffle
      ? `Reshuffled — assigned ${filled} slot${filled === 1 ? "" : "s"}.`
      : `Assigned ${filled} slot${filled === 1 ? "" : "s"}.`;
  }
  if (removedMatches > 0) {
    message += ` Removed ${removedMatches} empty match${removedMatches === 1 ? "" : "es"}.`;
  }

  return { filled, remainingEmpty, removedMatches, skipped: false, message };
}
