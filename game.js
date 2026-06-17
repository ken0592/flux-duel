"use strict";

const SIZE = 7;
const MAX_ROUNDS = 12;
const PLAYER_IDS = ["blue", "red"];
const DIRECTIONS = {
  N: { label: "N", dr: -1, dc: 0 },
  W: { label: "W", dr: 0, dc: -1 },
  C: { label: "Hold", dr: 0, dc: 0 },
  E: { label: "E", dr: 0, dc: 1 },
  S: { label: "S", dr: 1, dc: 0 }
};

const ACTIONS = {
  step: { label: "Step", power: 2, move: 1 },
  dash: { label: "Dash", power: 1, move: 2 },
  paint: { label: "Paint", power: 1, move: 0 },
  trap: { label: "Trap", power: 1, move: 0 },
  guard: { label: "Guard", power: 4, move: 0 },
  blast: { label: "Blast", power: 3, move: 0 }
};

const FLUX_TYPES = [
  { id: "bonus", mark: "2", label: "Bonus", count: 2 },
  { id: "bloom", mark: "B", label: "Bloom", count: 1 },
  { id: "slip", mark: "S", label: "Slip", count: 1 },
  { id: "rift", mark: "R", label: "Rift", count: 1 },
  { id: "static", mark: "X", label: "Static", count: 1 }
];

const state = {
  round: 1,
  gameOver: false,
  cpuRed: true,
  tiles: [],
  feed: [],
  claims: [],
  players: {
    blue: makePlayer("blue", "Blue", { r: 0, c: 0 }, { action: "step", dir: "E" }),
    red: makePlayer("red", "Red", { r: SIZE - 1, c: SIZE - 1 }, { action: "step", dir: "W" })
  }
};

const boardEl = document.getElementById("board");
const feedEl = document.getElementById("feed");
const resolveButton = document.getElementById("resolveButton");
const modal = document.getElementById("matchModal");

function makePlayer(id, name, pos, plan) {
  return {
    id,
    name,
    pos: { ...pos },
    start: { ...pos },
    plan: { ...plan },
    locked: false,
    skipNext: false
  };
}

function indexOf(pos) {
  return pos.r * SIZE + pos.c;
}

function posFromIndex(index) {
  return { r: Math.floor(index / SIZE), c: index % SIZE };
}

function samePos(a, b) {
  return a.r === b.r && a.c === b.c;
}

function isInside(pos) {
  return pos.r >= 0 && pos.c >= 0 && pos.r < SIZE && pos.c < SIZE;
}

function movePos(pos, dirKey) {
  const dir = DIRECTIONS[dirKey] || DIRECTIONS.C;
  return { r: pos.r + dir.dr, c: pos.c + dir.dc };
}

function clampStep(pos, dirKey) {
  const next = movePos(pos, dirKey);
  return isInside(next) ? next : { ...pos };
}

function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function setupControls() {
  PLAYER_IDS.forEach((id) => {
    const actionsEl = document.getElementById(`${id}Actions`);
    const dirsEl = document.getElementById(`${id}Directions`);

    Object.entries(ACTIONS).forEach(([actionId, action]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-button";
      button.dataset.player = id;
      button.dataset.action = actionId;
      button.textContent = action.label;
      button.title = `${action.label} power ${action.power}`;
      button.addEventListener("click", () => chooseAction(id, actionId));
      actionsEl.appendChild(button);
    });

    ["N", "W", "C", "E", "S"].forEach((dirId) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-button";
      button.dataset.player = id;
      button.dataset.dir = dirId;
      button.textContent = DIRECTIONS[dirId].label;
      button.title = `Direction ${DIRECTIONS[dirId].label}`;
      button.addEventListener("click", () => chooseDirection(id, dirId));
      dirsEl.appendChild(button);
    });
  });

  document.getElementById("blueLock").addEventListener("click", () => lockPlayer("blue"));
  document.getElementById("redLock").addEventListener("click", () => lockPlayer("red"));
  document.getElementById("cpuToggle").addEventListener("change", (event) => {
    state.cpuRed = event.target.checked;
    state.players.red.locked = false;
    addFeed(state.cpuRed ? "Red is now CPU controlled." : "Red is now human controlled.", "hot");
    render();
  });
  document.getElementById("newMatchButton").addEventListener("click", resetGame);
  document.getElementById("modalNewMatchButton").addEventListener("click", resetGame);
  document.getElementById("clearFeedButton").addEventListener("click", () => {
    state.feed = [];
    renderFeed();
  });
  resolveButton.addEventListener("click", tryResolve);
}

function resetGame() {
  state.round = 1;
  state.gameOver = false;
  state.feed = [];
  state.claims = [];
  state.tiles = makeTiles();
  state.players.blue = makePlayer("blue", "Blue", { r: 0, c: 0 }, { action: "step", dir: "E" });
  state.players.red = makePlayer("red", "Red", { r: SIZE - 1, c: SIZE - 1 }, { action: "step", dir: "W" });
  state.tiles[indexOf(state.players.blue.pos)].owner = "blue";
  state.tiles[indexOf(state.players.red.pos)].owner = "red";
  spawnFlux();
  modal.hidden = true;
  addFeed("New match started. Flux tiles are live.", "hot");
  render();
}

function makeTiles() {
  return Array.from({ length: SIZE * SIZE }, () => ({
    owner: null,
    flux: null,
    trap: null
  }));
}

function chooseAction(playerId, actionId) {
  const player = state.players[playerId];
  if (state.gameOver || player.locked || isCpuPlayer(playerId)) return;
  player.plan.action = actionId;
  renderControls();
}

function chooseDirection(playerId, dirId) {
  const player = state.players[playerId];
  if (state.gameOver || player.locked || isCpuPlayer(playerId)) return;
  player.plan.dir = dirId;
  renderControls();
}

function isCpuPlayer(playerId) {
  return playerId === "red" && state.cpuRed;
}

function lockPlayer(playerId) {
  if (state.gameOver) return;
  if (isCpuPlayer(playerId)) return;
  const player = state.players[playerId];
  player.locked = true;
  addFeed(`${player.name} locked in.`, playerId);
  if (state.cpuRed) {
    chooseCpuPlan();
    state.players.red.locked = true;
    addFeed("Red CPU locked in.", "red");
  }
  render();
  if (bothLocked()) {
    window.setTimeout(resolveTurn, 220);
  }
}

function bothLocked() {
  return state.players.blue.locked && state.players.red.locked;
}

function tryResolve() {
  if (state.gameOver) return;
  if (state.cpuRed && state.players.blue.locked && !state.players.red.locked) {
    chooseCpuPlan();
    state.players.red.locked = true;
  }
  if (!bothLocked()) {
    addFeed("Both sides must lock before the turn resolves.", "hot");
    render();
    return;
  }
  resolveTurn();
}

function chooseCpuPlan() {
  const red = state.players.red;
  const blue = state.players.blue;
  const distance = Math.abs(red.pos.r - blue.pos.r) + Math.abs(red.pos.c - blue.pos.c);
  const actionPool = distance <= 1
    ? ["blast", "guard", "paint", "trap", "step"]
    : ["step", "step", "dash", "paint", "trap"];

  const target = chooseCpuTarget(red);
  red.plan.action = actionPool[randomInt(actionPool.length)];
  red.plan.dir = bestDirectionToward(red.pos, target);

  if (red.skipNext) {
    red.plan.action = "paint";
    red.plan.dir = "C";
  }
}

function chooseCpuTarget(player) {
  const candidates = state.tiles
    .map((tile, index) => ({ tile, pos: posFromIndex(index) }))
    .filter(({ tile, pos }) => tile.owner !== player.id || tile.flux || tile.trap);

  if (!candidates.length) return state.players.blue.pos;

  candidates.sort((a, b) => {
    const aScore = cpuCellScore(player, a.tile, a.pos);
    const bScore = cpuCellScore(player, b.tile, b.pos);
    return bScore - aScore;
  });

  return candidates.slice(0, 7)[randomInt(Math.min(7, candidates.length))].pos;
}

function cpuCellScore(player, tile, pos) {
  const distance = Math.abs(player.pos.r - pos.r) + Math.abs(player.pos.c - pos.c);
  let score = 8 - distance;
  if (tile.owner && tile.owner !== player.id) score += 4;
  if (tile.flux === "bonus") score += 5;
  if (tile.flux && tile.flux !== "bonus") score += 2;
  if (tile.trap && tile.trap.owner !== player.id) score -= 5;
  return score + Math.random() * 2;
}

function bestDirectionToward(from, target) {
  const options = ["N", "W", "C", "E", "S"].map((dir) => {
    const next = clampStep(from, dir);
    const distance = Math.abs(next.r - target.r) + Math.abs(next.c - target.c);
    return { dir, distance: distance + Math.random() * 0.35 };
  });
  options.sort((a, b) => a.distance - b.distance);
  return options[0].dir;
}

function resolveTurn() {
  if (state.gameOver || !bothLocked()) return;

  state.claims = [];
  const consumedSkips = consumeSkips();
  const effectivePlans = {
    blue: getEffectivePlan("blue", consumedSkips.blue),
    red: getEffectivePlan("red", consumedSkips.red)
  };
  const blueMove = buildMovePlan(state.players.blue, effectivePlans.blue);
  const redMove = buildMovePlan(state.players.red, effectivePlans.red);

  addFeed(`Round ${state.round}: ${formatPlan("blue", effectivePlans.blue)} vs ${formatPlan("red", effectivePlans.red)}.`, "hot");
  resolveMovement(blueMove, redMove, effectivePlans);
  applyFluxAndTraps(effectivePlans);
  applyActions(effectivePlans);
  resolveClaims();
  ageTraps();
  cleanupLocks();

  if (state.round >= MAX_ROUNDS) {
    finishMatch();
  } else {
    state.round += 1;
    spawnFlux();
  }

  render();
}

function consumeSkips() {
  const consumed = {};
  PLAYER_IDS.forEach((playerId) => {
    consumed[playerId] = state.players[playerId].skipNext;
    state.players[playerId].skipNext = false;
  });
  return consumed;
}

function getEffectivePlan(playerId, wasSkipped) {
  const player = state.players[playerId];
  if (wasSkipped) {
    return { action: "paint", dir: "C", forced: true };
  }
  return { ...player.plan, forced: false };
}

function formatPlan(playerId, plan) {
  const player = state.players[playerId];
  const forced = plan.forced ? " forced" : "";
  return `${player.name}${forced} ${ACTIONS[plan.action].label}/${DIRECTIONS[plan.dir].label}`;
}

function buildMovePlan(player, plan) {
  const action = ACTIONS[plan.action];
  const path = [];
  let cursor = { ...player.pos };
  if (action.move > 0 && plan.dir !== "C") {
    for (let i = 0; i < action.move; i += 1) {
      const next = clampStep(cursor, plan.dir);
      if (samePos(next, cursor)) break;
      path.push(next);
      cursor = next;
    }
  }
  return {
    playerId: player.id,
    start: { ...player.pos },
    dest: { ...cursor },
    path,
    moved: path.length > 0
  };
}

function resolveMovement(blueMove, redMove, plans) {
  const blue = state.players.blue;
  const red = state.players.red;
  const sameDestination = samePos(blueMove.dest, redMove.dest);
  const swapped = samePos(blueMove.dest, redMove.start) && samePos(redMove.dest, blueMove.start);
  const collision = (sameDestination || swapped) && (blueMove.moved || redMove.moved);

  if (collision) {
    const result = resolveClash(blueMove, redMove, plans);
    if (result === "blue") {
      movePlayerWithPath(blue, blueMove);
      addMovementClaim("blue", blueMove, 2);
      claimTile("red", redMove.start, 1, "bounce");
      addFeed(`Blue won the clash and Red bounced.`, "blue");
    } else if (result === "red") {
      movePlayerWithPath(red, redMove);
      addMovementClaim("red", redMove, 2);
      claimTile("blue", blueMove.start, 1, "bounce");
      addFeed(`Red won the clash and Blue bounced.`, "red");
    } else {
      claimTile("blue", blueMove.start, 1, "tie");
      claimTile("red", redMove.start, 1, "tie");
      addFeed("The clash tied. Both sides held ground.", "hot");
    }
    return;
  }

  movePlayerWithPath(blue, blueMove);
  movePlayerWithPath(red, redMove);
  addMovementClaim("blue", blueMove, 1);
  addMovementClaim("red", redMove, 1);
}

function resolveClash(blueMove, redMove, plans) {
  const blueRoll = randomInt(3);
  const redRoll = randomInt(3);
  const blueTotal = ACTIONS[plans.blue.action].power + blueRoll;
  const redTotal = ACTIONS[plans.red.action].power + redRoll;
  addFeed(`Clash roll: Blue ${blueTotal} / Red ${redTotal}.`, "hot");
  if (blueTotal > redTotal) return "blue";
  if (redTotal > blueTotal) return "red";
  return "tie";
}

function movePlayerWithPath(player, movePlan) {
  player.pos = { ...movePlan.dest };
}

function addMovementClaim(playerId, movePlan, power) {
  if (!movePlan.path.length) {
    claimTile(playerId, movePlan.start, 1, "hold");
    return;
  }
  movePlan.path.forEach((pos) => claimTile(playerId, pos, power, "move"));
}

function applyFluxAndTraps(plans) {
  shuffle(PLAYER_IDS).forEach((playerId) => {
    const player = state.players[playerId];
    const tile = state.tiles[indexOf(player.pos)];
    const opponentId = playerId === "blue" ? "red" : "blue";

    if (tile.trap && tile.trap.owner === opponentId) {
      if (plans[playerId].action === "guard") {
        addFeed(`${player.name} guarded through a trap.`, playerId);
        tile.trap = null;
        claimTile(playerId, player.pos, 2, "guard");
      } else {
        addFeed(`${player.name} hit a trap and will lose tempo next round.`, opponentId);
        player.skipNext = true;
        claimTile(opponentId, player.pos, 3, "trap");
        tile.trap = null;
      }
    }

    if (tile.flux) {
      triggerFlux(playerId, tile.flux, plans[playerId]);
    }
  });
}

function triggerFlux(playerId, flux, plan) {
  const player = state.players[playerId];
  if (flux === "bonus") {
    claimTile(playerId, player.pos, 1, "bonus");
    return;
  }

  if (flux === "bloom") {
    addFeed(`${player.name} triggered Bloom.`, playerId);
    claimAround(playerId, player.pos, 2);
    return;
  }

  if (flux === "slip" && plan.dir !== "C") {
    const next = clampStep(player.pos, plan.dir);
    if (!samePos(next, player.pos) && !isOccupiedByOther(playerId, next)) {
      player.pos = next;
      claimTile(playerId, player.pos, 2, "slip");
      addFeed(`${player.name} slipped one more tile.`, playerId);
    }
    return;
  }

  if (flux === "rift") {
    const target = randomOpenCell();
    if (target) {
      player.pos = target;
      claimTile(playerId, player.pos, 2, "rift");
      addFeed(`${player.name} warped through a Rift.`, playerId);
    }
    return;
  }

  if (flux === "static") {
    if (plan.action === "guard") {
      claimTile(playerId, player.pos, 2, "guard");
      addFeed(`${player.name} grounded Static with Guard.`, playerId);
    } else {
      player.skipNext = true;
      claimTile(playerId, player.pos, 1, "static");
      addFeed(`${player.name} got shocked by Static.`, "hot");
    }
  }
}

function applyActions(plans) {
  shuffle(PLAYER_IDS).forEach((playerId) => {
    const player = state.players[playerId];
    const plan = plans[playerId];

    if (plan.action === "paint") {
      claimTile(playerId, player.pos, 2, "paint");
      claimTile(playerId, targetFor(player.pos, plan.dir), 2, "paint");
    }

    if (plan.action === "guard") {
      claimTile(playerId, player.pos, 3, "guard");
      claimTile(playerId, targetFor(player.pos, plan.dir), 1, "guard");
    }

    if (plan.action === "trap") {
      const target = targetFor(player.pos, plan.dir);
      state.tiles[indexOf(target)].trap = { owner: playerId, age: 0 };
      claimTile(playerId, player.pos, 1, "trap");
      claimTile(playerId, target, 1, "trap");
      addFeed(`${player.name} armed a trap.`, playerId);
    }

    if (plan.action === "blast") {
      resolveBlast(playerId, plan.dir);
    }
  });
}

function targetFor(pos, dirKey) {
  const next = clampStep(pos, dirKey);
  return next;
}

function resolveBlast(playerId, dirKey) {
  const player = state.players[playerId];
  const opponentId = playerId === "blue" ? "red" : "blue";
  const opponent = state.players[opponentId];
  const target = targetFor(player.pos, dirKey);
  claimTile(playerId, target, 3, "blast");
  claimTile(playerId, player.pos, 1, "blast");

  if (samePos(opponent.pos, target)) {
    const pushTo = clampStep(opponent.pos, dirKey);
    if (!samePos(pushTo, opponent.pos) && !samePos(pushTo, player.pos)) {
      opponent.pos = pushTo;
      claimTile(playerId, target, 3, "blast-hit");
      claimTile(playerId, pushTo, 1, "blast-hit");
      addFeed(`${player.name} blasted ${opponent.name} back.`, playerId);
    } else {
      opponent.skipNext = true;
      claimTile(playerId, opponent.pos, 3, "blast-pin");
      addFeed(`${player.name} pinned ${opponent.name} with Blast.`, playerId);
    }
  }
}

function claimAround(playerId, center, power) {
  ["C", "N", "E", "S", "W"].forEach((dir) => {
    claimTile(playerId, targetFor(center, dir), power, "bloom");
  });
}

function claimTile(playerId, pos, power, reason) {
  if (!isInside(pos)) return;
  state.claims.push({
    playerId,
    index: indexOf(pos),
    power,
    reason
  });
}

function resolveClaims() {
  const byIndex = new Map();
  state.claims.forEach((claim) => {
    if (!byIndex.has(claim.index)) byIndex.set(claim.index, []);
    byIndex.get(claim.index).push(claim);
  });

  byIndex.forEach((claims, index) => {
    const totals = { blue: 0, red: 0 };
    claims.forEach((claim) => {
      totals[claim.playerId] += claim.power;
    });

    if (totals.blue > 0 && totals.red > 0) {
      const blueTotal = totals.blue + randomInt(2);
      const redTotal = totals.red + randomInt(2);
      if (blueTotal > redTotal) {
        state.tiles[index].owner = "blue";
      } else if (redTotal > blueTotal) {
        state.tiles[index].owner = "red";
      } else {
        const oldOwner = state.tiles[index].owner;
        state.tiles[index].owner = oldOwner || null;
      }
    } else if (totals.blue > 0) {
      state.tiles[index].owner = "blue";
    } else if (totals.red > 0) {
      state.tiles[index].owner = "red";
    }
  });
}

function cleanupLocks() {
  PLAYER_IDS.forEach((playerId) => {
    const player = state.players[playerId];
    player.locked = false;
  });
}

function ageTraps() {
  state.tiles.forEach((tile) => {
    if (!tile.trap) return;
    tile.trap.age += 1;
    if (tile.trap.age > 2) {
      tile.trap = null;
    }
  });
}

function spawnFlux() {
  state.tiles.forEach((tile) => {
    tile.flux = null;
  });

  const occupied = new Set(PLAYER_IDS.map((id) => indexOf(state.players[id].pos)));
  const available = shuffle(
    state.tiles
      .map((_, index) => index)
      .filter((index) => !occupied.has(index))
  );

  const fluxStack = [];
  FLUX_TYPES.forEach((type) => {
    for (let i = 0; i < type.count; i += 1) {
      fluxStack.push(type.id);
    }
  });

  fluxStack.forEach((type, i) => {
    if (available[i] !== undefined) {
      state.tiles[available[i]].flux = type;
    }
  });
}

function randomOpenCell() {
  const occupied = new Set(PLAYER_IDS.map((id) => indexOf(state.players[id].pos)));
  const options = state.tiles
    .map((_, index) => index)
    .filter((index) => !occupied.has(index));
  if (!options.length) return null;
  return posFromIndex(options[randomInt(options.length)]);
}

function isOccupiedByOther(playerId, pos) {
  return PLAYER_IDS.some((id) => id !== playerId && samePos(state.players[id].pos, pos));
}

function calculateScores() {
  const scores = { blue: 0, red: 0 };
  state.tiles.forEach((tile) => {
    if (!tile.owner) return;
    scores[tile.owner] += tile.flux === "bonus" ? 2 : 1;
  });
  return scores;
}

function finishMatch() {
  state.gameOver = true;
  const scores = calculateScores();
  const winner = scores.blue === scores.red ? "Draw" : scores.blue > scores.red ? "Blue wins" : "Red wins";
  document.getElementById("resultTitle").textContent = winner;
  document.getElementById("resultCopy").textContent = `Blue ${scores.blue} - Red ${scores.red}`;
  modal.hidden = false;
  addFeed(`Match complete: ${winner}.`, "hot");
}

function addFeed(message, type = "hot") {
  state.feed.unshift({
    message,
    type,
    stamp: Date.now() + Math.random()
  });
  state.feed = state.feed.slice(0, 18);
}

function render() {
  renderScore();
  renderBoard();
  renderControls();
  renderFeed();
}

function renderScore() {
  const scores = calculateScores();
  document.getElementById("blueScore").textContent = scores.blue;
  document.getElementById("redScore").textContent = scores.red;
  document.getElementById("roundNumber").textContent = state.round;
  document.getElementById("roundLimit").textContent = MAX_ROUNDS;
  document.getElementById("neutralCount").textContent = state.tiles.filter((tile) => !tile.owner).length;
  document.getElementById("fluxCount").textContent = state.tiles.filter((tile) => tile.flux).length;
  document.getElementById("trapCount").textContent = state.tiles.filter((tile) => tile.trap).length;
  document.getElementById("leadText").textContent = scoreLead(scores);

  PLAYER_IDS.forEach((id) => {
    const player = state.players[id];
    const status = player.skipNext
      ? "Stunned"
      : player.locked
        ? "Locked"
        : isCpuPlayer(id)
          ? "CPU"
          : `${ACTIONS[player.plan.action].label}/${DIRECTIONS[player.plan.dir].label}`;
    document.getElementById(`${id}Status`).textContent = status;
    const badge = document.getElementById(`${id}LockBadge`);
    badge.textContent = player.locked ? "Locked" : isCpuPlayer(id) ? "CPU" : "Open";
    badge.classList.toggle("locked", player.locked || isCpuPlayer(id));
  });

  resolveButton.disabled = state.gameOver || !state.players.blue.locked || (!state.players.red.locked && !state.cpuRed);
}

function scoreLead(scores) {
  if (scores.blue === scores.red) return "Even";
  const leader = scores.blue > scores.red ? "Blue" : "Red";
  return `${leader} +${Math.abs(scores.blue - scores.red)}`;
}

function renderBoard() {
  boardEl.innerHTML = "";
  state.tiles.forEach((tile, index) => {
    const pos = posFromIndex(index);
    const cell = document.createElement("div");
    cell.className = "cell";
    if (tile.owner) cell.classList.add(`owner-${tile.owner}`);
    cell.setAttribute("aria-label", cellLabel(tile, pos));

    if (tile.flux) {
      const fluxType = FLUX_TYPES.find((type) => type.id === tile.flux);
      const mark = document.createElement("span");
      mark.className = `flux-mark flux-${tile.flux}`;
      mark.textContent = fluxType.mark;
      mark.title = fluxType.label;
      cell.appendChild(mark);
    }

    if (tile.trap) {
      const trap = document.createElement("span");
      trap.className = `trap-mark trap-${tile.trap.owner}`;
      trap.title = `${state.players[tile.trap.owner].name} trap`;
      cell.appendChild(trap);
    }

    const occupants = PLAYER_IDS.filter((id) => samePos(state.players[id].pos, pos));
    if (occupants.length) {
      const stack = document.createElement("div");
      stack.className = "token-stack";
      occupants.forEach((id) => {
        const token = document.createElement("span");
        token.className = `player-token ${id}`;
        token.textContent = id === "blue" ? "B" : "R";
        token.title = state.players[id].name;
        stack.appendChild(token);
      });
      cell.appendChild(stack);
    }

    boardEl.appendChild(cell);
  });
}

function cellLabel(tile, pos) {
  const parts = [`Row ${pos.r + 1}`, `Column ${pos.c + 1}`];
  if (tile.owner) parts.push(`${tile.owner} owner`);
  if (tile.flux) parts.push(`${tile.flux} flux`);
  if (tile.trap) parts.push(`${tile.trap.owner} trap`);
  return parts.join(", ");
}

function renderControls() {
  PLAYER_IDS.forEach((id) => {
    const player = state.players[id];
    const lockedOrCpu = player.locked || isCpuPlayer(id) || state.gameOver;
    const actions = document.querySelectorAll(`[data-player="${id}"][data-action]`);
    const dirs = document.querySelectorAll(`[data-player="${id}"][data-dir]`);

    actions.forEach((button) => {
      const selected = button.dataset.action === player.plan.action;
      button.classList.toggle("selected", selected && !player.locked && !isCpuPlayer(id));
      button.classList.toggle("locked-choice", selected && player.locked && !isCpuPlayer(id));
      button.classList.toggle("cpu-choice", isCpuPlayer(id));
      button.disabled = lockedOrCpu;
      button.textContent = player.locked && selected && !isCpuPlayer(id) ? "Locked" : ACTIONS[button.dataset.action].label;
    });

    dirs.forEach((button) => {
      const selected = button.dataset.dir === player.plan.dir;
      button.classList.toggle("selected", selected && !player.locked && !isCpuPlayer(id));
      button.classList.toggle("locked-choice", selected && player.locked && !isCpuPlayer(id));
      button.classList.toggle("cpu-choice", isCpuPlayer(id));
      button.disabled = lockedOrCpu;
      button.textContent = player.locked && selected && !isCpuPlayer(id) ? "Locked" : DIRECTIONS[button.dataset.dir].label;
    });

    const lockButton = document.getElementById(`${id}Lock`);
    lockButton.disabled = lockedOrCpu || (state.cpuRed && id === "red");
    lockButton.textContent = isCpuPlayer(id) ? "CPU Red" : player.locked ? "Locked" : `Lock ${player.name}`;
  });
}

function renderFeed() {
  feedEl.innerHTML = "";
  state.feed.forEach((entry) => {
    const item = document.createElement("li");
    item.className = `${entry.type}-entry`;
    item.textContent = entry.message;
    feedEl.appendChild(item);
  });
}

setupControls();
resetGame();
