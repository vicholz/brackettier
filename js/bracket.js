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
  const other = match.sides[sideIndex === 0 ? 1 : 0];
  if (!sideHasAnyone(side)) return false;
  // Allow pick if this side has people; other can be empty (bye) or filled
  if (!sideHasAnyone(other) && !match.bye) {
    // Still allow marking a winner when opponent empty (treat as bye)
    return true;
  }
  return true;
}
