"use strict";

const SIZE = 5;
const MAX_TURNS = 12;
const PLAYERS = ["blue", "red"];

const ACTIONS = {
  move: { label: "Move", steps: 1 },
  dash: { label: "Dash", steps: 2 },
  strike: { label: "Strike", steps: 0 }
};

const DIRECTIONS = {
  north: { label: "N", dr: -1, dc: 0 },
  west: { label: "W", dr: 0, dc: -1 },
  center: { label: "C", dr: 0, dc: 0 },
  east: { label: "E", dr: 0, dc: 1 },
  south: { label: "S", dr: 1, dc: 0 }
};

const state = {
  turn: 1,
  gameOver: false,
  cpuRed: true,
  goldIndex: 12,
  marks: { strike: [], clash: null },
  log: [],
  cells: [],
  players: {
    blue: makePlayer("blue", "Blue", { r: 0, c: 0 }),
    red: makePlayer("red", "Red", { r: SIZE - 1, c: SIZE - 1 })
  }
};

const boardEl = document.getElementById("board");
const logEl = document.getElementById("log");
const modalEl = document.getElementById("resultModal");

function makePlayer(id, name, pos) {
  return {
    id,
    name,
    pos: { ...pos },
    action: "move",
    direction: "center"
  };
}

function setup() {
  createActionControls("blue");
  createDirectionControls("blue");
  createActionControls("red");
  createDirectionControls("red");

  document.getElementById("cpuToggle").addEventListener("change", (event) => {
    state.cpuRed = event.target.checked;
    addLog(state.cpuRed ? "Red is CPU." : "Red is human.", "hot");
    render();
  });
  document.getElementById("newGameButton").addEventListener("click", resetGame);
  document.getElementById("modalNewGameButton").addEventListener("click", resetGame);
  document.getElementById("playTurnButton").addEventListener("click", playTurn);
  document.getElementById("clearLogButton").addEventListener("click", () => {
    state.log = [];
    renderLog();
  });

  resetGame();
}

function createActionControls(playerId) {
  const container = document.getElementById(`${playerId}Actions`);
  Object.entries(ACTIONS).forEach(([actionId, action]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.dataset.player = playerId;
    button.dataset.action = actionId;
    button.textContent = action.label;
    button.title = action.label;
    button.addEventListener("click", () => chooseAction(playerId, actionId));
    container.appendChild(button);
  });
}

function createDirectionControls(playerId) {
  const container = document.getElementById(`${playerId}Directions`);
  Object.entries(DIRECTIONS).forEach(([directionId, direction]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `choice-button dir-${directionId}`;
    button.dataset.player = playerId;
    button.dataset.direction = directionId;
    button.textContent = direction.label;
    button.title = directionId;
    button.addEventListener("click", () => chooseDirection(playerId, directionId));
    container.appendChild(button);
  });
}

function resetGame() {
  state.turn = 1;
  state.gameOver = false;
  state.marks = { strike: [], clash: null };
  state.log = [];
  state.cells = Array.from({ length: SIZE * SIZE }, () => ({ owner: null }));
  state.players.blue = makePlayer("blue", "Blue", { r: 0, c: 0 });
  state.players.red = makePlayer("red", "Red", { r: SIZE - 1, c: SIZE - 1 });
  state.cells[indexOf(state.players.blue.pos)].owner = "blue";
  state.cells[indexOf(state.players.red.pos)].owner = "red";
  placeGold();
  modalEl.hidden = true;
  addLog("New duel.", "hot");
  render();
}

function chooseAction(playerId, actionId) {
  if (state.gameOver || isCpu(playerId)) return;
  state.players[playerId].action = actionId;
  renderControls();
}

function chooseDirection(playerId, directionId) {
  if (state.gameOver || isCpu(playerId)) return;
  state.players[playerId].direction = directionId;
  renderControls();
}

function isCpu(playerId) {
  return playerId === "red" && state.cpuRed;
}

function playTurn() {
  if (state.gameOver) return;
  if (state.cpuRed) chooseCpuPlan();

  state.marks = { strike: [], clash: null };
  const bluePlan = makePlan("blue");
  const redPlan = makePlan("red");
  const strikeHits = resolveStrikes(bluePlan, redPlan);

  applyMovement("blue", bluePlan, strikeHits.blue);
  applyMovement("red", redPlan, strikeHits.red);
  resolveEndClash(bluePlan, redPlan, strikeHits);

  addTurnSummary(bluePlan, redPlan, strikeHits);

  if (state.turn >= MAX_TURNS) {
    finishGame();
  } else {
    state.turn += 1;
    placeGold();
  }

  render();
}

function makePlan(playerId) {
  const player = state.players[playerId];
  const path = pathFor(player.pos, player.direction, ACTIONS[player.action].steps);
  const strikeTarget = player.action === "strike" ? targetFor(player.pos, player.direction, 1) : null;
  return {
    playerId,
    start: { ...player.pos },
    action: player.action,
    direction: player.direction,
    path,
    end: path.length ? path[path.length - 1] : { ...player.pos },
    strikeTarget
  };
}

function resolveStrikes(bluePlan, redPlan) {
  const hits = { blue: null, red: null };
  evaluateStrike(bluePlan, redPlan, hits);
  evaluateStrike(redPlan, bluePlan, hits);
  return hits;
}

function evaluateStrike(attacker, defender, hits) {
  if (attacker.action !== "strike" || !attacker.strikeTarget) return;
  const targetIndex = indexOf(attacker.strikeTarget);
  state.marks.strike.push(targetIndex);
  claim(attacker.playerId, attacker.strikeTarget);

  const defenderCrossed = defender.path.some((pos) => samePos(pos, attacker.strikeTarget));
  if (!defenderCrossed) return;

  const chance = defender.action === "dash" ? 5 : 4;
  const rollValue = roll();
  const defenderId = defender.playerId;
  if (rollValue <= chance) {
    hits[defenderId] = { attackerId: attacker.playerId, roll: rollValue };
    state.marks.clash = targetIndex;
  }
}

function applyMovement(playerId, plan, hit) {
  const player = state.players[playerId];
  if (plan.action === "strike") {
    player.pos = { ...plan.start };
    claim(playerId, player.pos);
    return;
  }

  if (hit) {
    player.pos = { ...plan.start };
    claim(playerId, player.pos);
    return;
  }

  player.pos = { ...plan.end };
  plan.path.forEach((pos) => claim(playerId, pos));
  if (!plan.path.length) claim(playerId, player.pos);
}

function resolveEndClash(bluePlan, redPlan, hits) {
  if (hits.blue || hits.red) return;
  if (!samePos(state.players.blue.pos, state.players.red.pos)) return;

  const blueRoll = roll() + clashBonus(bluePlan.action);
  const redRoll = roll() + clashBonus(redPlan.action);
  const clashPos = { ...state.players.blue.pos };
  state.marks.clash = indexOf(clashPos);

  if (blueRoll > redRoll) {
    state.players.red.pos = { ...redPlan.start };
    claim("blue", clashPos);
    claim("red", redPlan.start);
    addLog(`Clash: Blue ${blueRoll}, Red ${redRoll}. Blue holds.`, "blue");
  } else if (redRoll > blueRoll) {
    state.players.blue.pos = { ...bluePlan.start };
    claim("red", clashPos);
    claim("blue", bluePlan.start);
    addLog(`Clash: Blue ${blueRoll}, Red ${redRoll}. Red holds.`, "red");
  } else {
    state.players.blue.pos = { ...bluePlan.start };
    state.players.red.pos = { ...redPlan.start };
    claim("blue", bluePlan.start);
    claim("red", redPlan.start);
    addLog(`Clash: ${blueRoll}-${redRoll}. Both bounce.`, "hot");
  }
}

function clashBonus(actionId) {
  if (actionId === "move") return 2;
  if (actionId === "strike") return 1;
  return 0;
}

function addTurnSummary(bluePlan, redPlan, hits) {
  const blueText = formatPlan(bluePlan);
  const redText = formatPlan(redPlan);

  if (hits.blue) {
    addLog(`Red Strike catches Blue. Roll ${hits.blue.roll}.`, "red");
  }
  if (hits.red) {
    addLog(`Blue Strike catches Red. Roll ${hits.red.roll}.`, "blue");
  }
  if (!hits.blue && !hits.red) {
    addLog(`Blue ${blueText}. Red ${redText}.`, "hot");
  }
}

function formatPlan(plan) {
  return `${ACTIONS[plan.action].label}/${DIRECTIONS[plan.direction].label}`;
}

function chooseCpuPlan() {
  const red = state.players.red;
  const blue = state.players.blue;
  const scores = calculateScores();
  const close = distance(red.pos, blue.pos) <= 2;
  const gold = posFromIndex(state.goldIndex);

  if (close && Math.random() < 0.36) {
    red.action = "strike";
    red.direction = bestDirectionToward(red.pos, blue.pos);
    return;
  }

  if (scores.red < scores.blue || Math.random() < 0.38) {
    red.action = Math.random() < 0.62 ? "dash" : "move";
    red.direction = bestDirectionToward(red.pos, gold);
    return;
  }

  red.action = Math.random() < 0.28 ? "strike" : "move";
  red.direction = bestDirectionToward(red.pos, blue.pos);
}

function bestDirectionToward(from, target) {
  return Object.keys(DIRECTIONS)
    .map((directionId) => {
      const next = targetFor(from, directionId, 1);
      return {
        directionId,
        rank: distance(next, target) + Math.random() * 0.5
      };
    })
    .sort((a, b) => a.rank - b.rank)[0].directionId;
}

function pathFor(start, directionId, steps) {
  const path = [];
  let cursor = { ...start };
  for (let i = 0; i < steps; i += 1) {
    const next = targetFor(cursor, directionId, 1);
    if (samePos(next, cursor)) break;
    path.push(next);
    cursor = next;
  }
  return path;
}

function targetFor(start, directionId, steps) {
  let cursor = { ...start };
  for (let i = 0; i < steps; i += 1) {
    const direction = DIRECTIONS[directionId];
    const next = { r: cursor.r + direction.dr, c: cursor.c + direction.dc };
    if (!inside(next)) return cursor;
    cursor = next;
  }
  return cursor;
}

function inside(pos) {
  return pos.r >= 0 && pos.c >= 0 && pos.r < SIZE && pos.c < SIZE;
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

function distance(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

function roll() {
  return randomInt(6) + 1;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function claim(playerId, pos) {
  state.cells[indexOf(pos)].owner = playerId;
}

function placeGold() {
  const occupied = new Set(PLAYERS.map((id) => indexOf(state.players[id].pos)));
  const candidates = state.cells
    .map((_, index) => index)
    .filter((index) => !occupied.has(index));
  state.goldIndex = candidates[randomInt(candidates.length)];
}

function calculateScores() {
  const scores = { blue: 0, red: 0 };
  state.cells.forEach((cell, index) => {
    if (!cell.owner) return;
    scores[cell.owner] += index === state.goldIndex ? 3 : 1;
  });
  return scores;
}

function finishGame() {
  state.gameOver = true;
  const scores = calculateScores();
  const title = scores.blue === scores.red
    ? "Draw"
    : scores.blue > scores.red
      ? "Blue Wins"
      : "Red Wins";
  document.getElementById("resultTitle").textContent = title;
  document.getElementById("resultCopy").textContent = `Blue ${scores.blue} - Red ${scores.red}`;
  modalEl.hidden = false;
  addLog(`${title}.`, "hot");
}

function addLog(message, type) {
  state.log.unshift({ message, type });
  state.log = state.log.slice(0, 12);
}

function render() {
  renderScore();
  renderBoard();
  renderControls();
  renderLog();
}

function renderScore() {
  const scores = calculateScores();
  document.getElementById("blueScore").textContent = scores.blue;
  document.getElementById("redScore").textContent = scores.red;
  document.getElementById("turnNumber").textContent = state.turn;
  document.getElementById("turnLimit").textContent = MAX_TURNS;
  document.getElementById("leadLabel").textContent = leadText(scores);

  const goldOwner = state.cells[state.goldIndex].owner;
  document.getElementById("goldLabel").textContent = goldOwner ? `Gold: ${capitalize(goldOwner)}` : "Gold: open";
}

function leadText(scores) {
  if (scores.blue === scores.red) return "Even";
  const leader = scores.blue > scores.red ? "Blue" : "Red";
  return `${leader} +${Math.abs(scores.blue - scores.red)}`;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function renderBoard() {
  boardEl.innerHTML = "";
  state.cells.forEach((cell, index) => {
    const tile = document.createElement("div");
    tile.className = "cell";
    if (cell.owner) tile.classList.add(`${cell.owner}-owned`);
    if (index === state.goldIndex) tile.classList.add("gold-cell");
    if (state.marks.strike.includes(index)) tile.classList.add("strike-cell");
    if (state.marks.clash === index) tile.classList.add("clash-cell");
    tile.setAttribute("aria-label", labelForCell(index, cell));

    const pos = posFromIndex(index);
    const occupants = PLAYERS.filter((id) => samePos(state.players[id].pos, pos));
    if (occupants.length) {
      const stack = document.createElement("div");
      stack.className = "token-stack";
      occupants.forEach((id) => {
        const token = document.createElement("span");
        token.className = `token ${id}`;
        token.textContent = id === "blue" ? "B" : "R";
        stack.appendChild(token);
      });
      tile.appendChild(stack);
    }

    boardEl.appendChild(tile);
  });
}

function labelForCell(index, cell) {
  const pos = posFromIndex(index);
  const parts = [`Row ${pos.r + 1}`, `Column ${pos.c + 1}`];
  if (cell.owner) parts.push(`${cell.owner} tile`);
  if (index === state.goldIndex) parts.push("gold tile");
  return parts.join(", ");
}

function renderControls() {
  PLAYERS.forEach((playerId) => {
    const player = state.players[playerId];
    const cpu = isCpu(playerId);
    document.querySelectorAll(`[data-player="${playerId}"][data-action]`).forEach((button) => {
      const selected = button.dataset.action === player.action;
      button.classList.toggle("selected", selected && !cpu);
      button.classList.toggle("cpu-disabled", cpu);
      button.disabled = state.gameOver || cpu;
    });
    document.querySelectorAll(`[data-player="${playerId}"][data-direction]`).forEach((button) => {
      const selected = button.dataset.direction === player.direction;
      button.classList.toggle("selected", selected && !cpu);
      button.classList.toggle("cpu-disabled", cpu);
      button.disabled = state.gameOver || cpu;
    });
  });

  document.getElementById("bluePlanLabel").textContent = planLabel("blue");
  document.getElementById("redPlanLabel").textContent = state.cpuRed ? "CPU" : planLabel("red");
  document.getElementById("playTurnButton").disabled = state.gameOver;
}

function planLabel(playerId) {
  const player = state.players[playerId];
  return `${ACTIONS[player.action].label} / ${DIRECTIONS[player.direction].label}`;
}

function renderLog() {
  logEl.innerHTML = "";
  state.log.forEach((entry) => {
    const item = document.createElement("li");
    item.className = `${entry.type}-entry`;
    item.textContent = entry.message;
    logEl.appendChild(item);
  });
}

setup();
