import { initGameState, GameStateHandle } from "./game-state/game-state";

const gs = new GameStateHandle(initGameState());
const pre = document.createElement("pre");
pre.textContent = JSON.stringify(gs.state, null, 4);
document.body.append(pre);
