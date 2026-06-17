"use strict";

const SIZE = 5;
const MAX_TURNS = 10;
const PLAYERS = ["blue", "red"];
const MOVES = {
  up: { label: "Up", icon: "↑", dr: -1, dc: 0 },
  left: { label: "Left", icon: "←", dr: 0, dc: -1 },
  stay: { label: "Stay", icon: "•", dr: 0, dc: 0 },
  right: { label: "Right", icon: "→", dr: 0, dc: 1 },
  down: { label: "Down", icon: "↓", dr: 1, dc: 0 }
};

const state = {
  turn: 1,
  gameOver: false,
  cpuRed: true,
  goldIndex: 12,
  lastClashIndex: null,
  log: [],
  cells: [],
  players: {
    blue: makePlayer("blue", "Blue", { r: 0, c: 0 }, "stay"),
    red: makePlayer("red", "Red", { r: SIZE - 1, c: SIZE - 1 }, "stay")
  }
};

const boardEl = document.getElementById("board");
const logEl = document.getElementById("log");
const modalEl = document.getElementById("resultModal");

function makePlayer(id, name, pos, move) {
  return {
    id,
    name,
    pos: { ...pos },
    move
  };
}

function cellIndex(pos) {
  return pos.r * SIZE + pos.c;
}

function posFromIndex(index) {
  return { r: Math.floor(index / SIZE), c: index % SIZE };
}

function samePos(a, b) {
  return a.r === b.r && a.c === b.c;
}

function inBounds(pos) {
  return pos.r >= 0 && pos.c >= 0 && pos.r < SIZE && pos.c < SIZE;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function roll() {
  return randomInt(6) + 1;
}

function resetGame() {
  state.turn = 1;
  state.gameOver = false;
  state.lastClashIndex = null;
  state.log = [];
  state.cells = Array.from({ length: SIZE * SIZE }, () => ({ owner: null }));
  state.players.blue = makePlayer("blue", "Blue", { r: 0, c: 0 }, "stay");
  state.players.red = makePlayer("red", "Red", { r: SIZE - 1, c: SIZE - 1 }, "stay");
  state.cells[cellIndex(state.players.blue.pos)].owner = "blue";
  state.cells[cellIndex(state.players.red.pos)].owner = "red";
  placeGold();
  modalEl.hidden = true;
  addLog("New game.", "clash");
  render();
}

function setup() {
  createControls("blue");
  createControls("red");
  document.getElementById("cpuToggle").addEventListener("change", (event) => {
    state.cpuRed = event.target.checked;
    addLog(state.cpuRed ? "Red set to CPU." : "Red set to human.", "clash");
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

function createControls(playerId) {
  const container = document.getElementById(`${playerId}Controls`);
  Object.entries(MOVES).forEach(([moveId, move]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `move-button move-${moveId}`;
    button.dataset.player = playerId;
    button.dataset.move = moveId;
    button.textContent = move.icon;
    button.title = move.label;
    button.addEventListener("click", () => chooseMove(playerId, moveId));
    container.appendChild(button);
  });
}

function chooseMove(playerId, moveId) {
  if (state.gameOver) return;
  if (playerId === "red" && state.cpuRed) return;
  state.players[playerId].move = moveId;
  renderControls();
}

function playTurn() {
  if (state.gameOver) return;
  if (state.cpuRed) {
    state.players.red.move = chooseCpuMove();
  }

  const blue = state.players.blue;
  const red = state.players.red;
  const blueStart = { ...blue.pos };
  const redStart = { ...red.pos };
  const blueTarget = targetFor(blue.pos, blue.move);
  const redTarget = targetFor(red.pos, red.move);
  state.lastClashIndex = null;

  if (samePos(blueTarget, redTarget)) {
    resolveClash(blueTarget, blueStart, redStart);
  } else {
    blue.pos = blueTarget;
    red.pos = redTarget;
    claim("blue", blue.pos);
    claim("red", red.pos);
    addLog(`Blue ${MOVES[blue.move].label}. Red ${MOVES[red.move].label}.`, "clash");
  }

  if (state.turn >= MAX_TURNS) {
    finishGame();
  } else {
    state.turn += 1;
    placeGold();
  }

  render();
}

function targetFor(pos, moveId) {
  const move = MOVES[moveId];
  const next = { r: pos.r + move.dr, c: pos.c + move.dc };
  return inBounds(next) ? next : { ...pos };
}

function resolveClash(target, blueStart, redStart) {
  const blueRoll = roll();
  const redRoll = roll();
  state.lastClashIndex = cellIndex(target);

  if (blueRoll > redRoll) {
    state.players.blue.pos = target;
    state.players.red.pos = redStart;
    claim("blue", target);
    claim("red", redStart);
    addLog(`Clash: Blue ${blueRoll}, Red ${redRoll}. Blue wins.`, "blue");
  } else if (redRoll > blueRoll) {
    state.players.blue.pos = blueStart;
    state.players.red.pos = target;
    claim("blue", blueStart);
    claim("red", target);
    addLog(`Clash: Blue ${blueRoll}, Red ${redRoll}. Red wins.`, "red");
  } else {
    state.players.blue.pos = blueStart;
    state.players.red.pos = redStart;
    claim("blue", blueStart);
    claim("red", redStart);
    addLog(`Clash: ${blueRoll}-${redRoll}. Both bounce.`, "clash");
  }
}

function claim(playerId, pos) {
  state.cells[cellIndex(pos)].owner = playerId;
}

function chooseCpuMove() {
  const red = state.players.red;
  const blue = state.players.blue;
  const scores = calculateScores();
  const target = scores.red < scores.blue ? posFromIndex(state.goldIndex) : blue.pos;
  const options = Object.keys(MOVES).map((moveId) => {
    const next = targetFor(red.pos, moveId);
    const distance = Math.abs(next.r - target.r) + Math.abs(next.c - target.c);
    const ownPenalty = state.cells[cellIndex(next)].owner === "red" ? 0.45 : 0;
    return { moveId, rank: distance + ownPenalty + Math.random() * 0.9 };
  });
  options.sort((a, b) => a.rank - b.rank);
  return options[0].moveId;
}

function placeGold() {
  const occupied = new Set(PLAYERS.map((id) => cellIndex(state.players[id].pos)));
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
  addLog(`${title}.`, "clash");
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
    if (index === state.lastClashIndex) tile.classList.add("last-clash");
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
    const isCpu = playerId === "red" && state.cpuRed;
    document.querySelectorAll(`[data-player="${playerId}"][data-move]`).forEach((button) => {
      const selected = button.dataset.move === player.move;
      button.classList.toggle("selected", selected && !isCpu);
      button.classList.toggle("cpu-disabled", isCpu);
      button.disabled = state.gameOver || isCpu;
    });
  });

  document.getElementById("blueChoiceLabel").textContent = MOVES[state.players.blue.move].label;
  document.getElementById("redChoiceLabel").textContent = state.cpuRed ? "CPU" : MOVES[state.players.red.move].label;
  document.getElementById("playTurnButton").disabled = state.gameOver;
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
