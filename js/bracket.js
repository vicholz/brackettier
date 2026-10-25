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
 * Fill empty first-round slots from the people pool.
 * Round-robins across sides so shuffled people aren’t stacked on one team.
 * Never assigns the same person twice in a bracket. Does not overwrite
 * existing slots unless `reshuffle` is true.
 *
 * @returns {{ filled: number, remainingEmpty: number, skipped: boolean, message: string }}
 */
export function autoAssignPeople(bracket, people, { reshuffle = false } = {}) {
  if (!Array.isArray(people) || !people.length) {
    return {
      filled: 0,
      remainingEmpty: countEmptyFirstRoundSlots(bracket),
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
      skipped: true,
      message: "Add a first-round match before auto-assigning.",
    };
  }

  const emptyBefore = countEmptyFirstRoundSlots(bracket);
  if (!emptyBefore) {
    return {
      filled: 0,
      remainingEmpty: 0,
      skipped: true,
      message: "All slots are already filled. Use Reshuffle to re-assign.",
    };
  }

  const used = firstRoundAssignedIds(bracket);
  const available = shuffleInPlace(
    people.filter((p) => p?.id && !used.has(p.id)).map((p) => String(p.id))
  );

  // Sides with empty slots. Fill each side completely before the next so
  // 2v2/3v3 get full teams (not one person spread across every side).
  // Shuffle side order so consecutive pool names aren’t always Match 1 Side A.
  const buckets = [];
  for (const match of first) {
    for (let si = 0; si < match.sides.length; si++) {
      const empties = [];
      match.sides[si].slots.forEach((id, slotIndex) => {
        if (id == null || id === "") empties.push(slotIndex);
      });
      if (empties.length) buckets.push({ match, sideIndex: si, empties });
    }
  }
  shuffleInPlace(buckets);

  let filled = 0;
  let ai = 0;
  for (const bucket of buckets) {
    while (bucket.empties.length && ai < available.length) {
      const slotIndex = bucket.empties.shift();
      bucket.match.sides[bucket.sideIndex].slots[slotIndex] = available[ai];
      ai += 1;
      filled += 1;
    }
    if (ai >= available.length) break;
  }

  const remainingEmpty = countEmptyFirstRoundSlots(bracket);
  rebuildLaterRounds(bracket);

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

  return { filled, remainingEmpty, skipped: false, message };
}
