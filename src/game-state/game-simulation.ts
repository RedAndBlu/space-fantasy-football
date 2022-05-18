import { GameStateHandle, GameState } from "./game-state";
import { Schedule } from "./tournament-scheduler";
import { Player } from "../character/player";
import { Team } from "../character/team";

const NEXT_HOURS = 12;
const SEASON_START_MONTH = 8; // september
const SEASON_START_DATE = 1;
const SEASON_END_MONTH = 5; // june, the distance is enough for 38 games every week from the start of the season
const SEASON_END_DATE = 1;
type GameEventTypes =
  | "simRound"
  | "skillUpdate"
  | "seasonEnd"
  | "seasonStart"
  | "updateContract";
type SimRound = { round: number };

interface GameEvent {
  date: Date;
  type: GameEventTypes;
  detail?: SimRound;
}

// when the simulation is running no other piece of code should mutate the
// gameState set up some modal page to prevent any interaction until it's stopped
class GameSimulation {
  gsh: GameStateHandle;
  stopped = true;

  constructor(gsh: GameStateHandle) {
    this.gsh = gsh;
  }

  // start the game simulation, it can be stopped by the stopped flag or by
  // the occurrence of some particular event
  run(): void {
    this.stopped = false;
    const gState = this.gsh.state;
    const runSim = () => {
      this.stopped = process(gState);
      this.stopped ? (this.gsh.state = gState) : requestAnimationFrame(runSim);
    };

    window.requestAnimationFrame(runSim);
  }
}

/**
 * it is the main function that drives the simulation moving the game clock ahead
 * handling gameEvent and enqueuing new ones, it runs until a signle event is
 * handleed or for a max cycle of 24 hours (game time)
 * it doesn't run if there isn't any event on the event queue
 * @returns true when the simulation should momentarily stop
 */
function process(gs: GameState): boolean {
  for (let t = 0; t < 24 && gs.eventQueue.length !== 0; t += NEXT_HOURS) {
    if (gs.date.getTime() >= gs.eventQueue[0]?.date.getTime()) {
      return handleGameEvent(gs, gs.eventQueue.shift()!);
    } else {
      gs.date.setHours(gs.date.getHours() + NEXT_HOURS);
    }
  }

  return gs.eventQueue.length === 0;
}

// returns true when a particular event handling require to momentarily stop the simulation
function handleGameEvent(gs: GameState, evt: GameEvent): boolean {
  if (evt.type === "simRound") {
    return handleSimRound(gs, evt.detail as SimRound);
  } else if (evt.type === "skillUpdate") {
    return handleSkillUpdate(gs);
  } else if (evt.type === "seasonEnd") {
    return handleSeasonEnd(gs, evt);
  } else if (evt.type === "seasonStart") {
    return handleSeasonStart(gs);
  } else if (evt.type === "updateContract") {
    return handleUpdateContracts(gs);
  }

  return false;
}

function handleSimRound(gs: GameState, r: SimRound): boolean {
  simulateRound(gs, r.round);
  enqueueSimRoundEvent(gs, r.round + 1);
  return false;
}

function handleSkillUpdate(gs: GameState): boolean {
  updateSkills(gs);
  enqueueSkillUpdateEvent(gs);
  return true;
}

function handleSeasonEnd(gs: GameState, e: GameEvent): boolean {
  storeEndedSeasonSchedule(gs);
  enqueueSeasonStartEvent(gs);
  enqueueUpdateContractEvent(gs, e.date);
  return true;
}

function handleSeasonStart(gs: GameState): boolean {
  newSeasonSchedule(gs, Object.keys(gs.teams));
  enqueueSimRoundEvent(gs, 0);
  enqueueSeasonEndEvent(gs);
  return true;
}

function handleUpdateContracts(gs: GameState): boolean {
  updateContracts(gs);
  renewExipiringContracts(gs);
  removeExpiredContracts(gs);
  return false;
}

function updateContracts(gs: GameState): void {
  Object.values(gs.contracts).forEach((c) => c.duration--);
}

// every team try to resign most exipiring players according to their needs
function renewExipiringContracts(gs: GameState): void {
  Object.keys(gs.teams).forEach((team) => {
    Team.renewExipiringContracts(gs, team);
  });
}

function removeExpiredContracts(gs: GameState): void {
  Object.values(gs.contracts).forEach((c) => {
    if (c.duration === 0) {
      Team.unsignPlayer(gs, c);
    }
  });
}

// simulate all the match for the given round of this season schedule
// every results is saved on the gameState
function simulateRound(gs: GameState, round: number): void {
  gs.schedules.now?.[round]?.matchIds.forEach((id) => simulateMatch(gs, id));
}

// enqueue in the gameState a new gameEvent for the given current season round if it exists
function enqueueSimRoundEvent(gs: GameState, round: number): void {
  if (gs.schedules.now?.[round]) {
    GameState.enqueueGameEvent(gs, {
      date: gs.schedules.now[round].date,
      type: "simRound",
      detail: { round },
    });
  }
}

// TODO: implement a real one
function simulateMatch(gs: GameState, matchId: string): void {
  const match = gs.matches[matchId];
  const goals = () => Math.floor(Math.random() * 6);
  match.result = { home: goals(), away: goals() };
}

// applies the monthly growth and degrowth for every player stored in gs
function updateSkills(gs: GameState): void {
  for (const id in gs.players) {
    Player.applyMonthlyGrowth(gs.players[id], gs.date);
    Player.applyMonthlyDegrowth(gs.players[id], gs.date);
  }
}

// enqueues a skillUpdate type GameEvent on gs.eventQueue for the first day of next month
function enqueueSkillUpdateEvent(gs: GameState): void {
  const d = gs.date;
  const date = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  GameState.enqueueGameEvent(gs, { date, type: "skillUpdate" });
}

// enqueues a seasonEnd type GameEvent on gs.eventQueue for june first of next year
function enqueueSeasonEndEvent(gs: GameState): void {
  const year = gs.date.getFullYear() + 1;
  const date = new Date(year, SEASON_END_MONTH, SEASON_END_DATE);
  GameState.enqueueGameEvent(gs, { date, type: "seasonEnd" });
}

// enqueues a seasonStart type GameEvent on gs.eventQueue for september first of this year
function enqueueSeasonStartEvent(gs: GameState): void {
  const y = gs.date.getFullYear();
  const date = new Date(y, SEASON_START_MONTH, SEASON_START_DATE);
  GameState.enqueueGameEvent(gs, { date, type: "seasonStart" });
}

// enqueues a updateContract type GameEvent on gs.eventQueue for the next day of the given date
function enqueueUpdateContractEvent(gs: GameState, d: Date): void {
  const date = new Date(d);
  date.setDate(date.getDate() + 1);
  GameState.enqueueGameEvent(gs, { date, type: "updateContract" });
}

// save a new schedule for the current season to the gamestate, should be called
// before SEASON_END_MONTH and SEASON_START_DATE + 1 of the same year
function newSeasonSchedule(gs: GameState, teams: string[]): void {
  const start = new Date(
    gs.date.getFullYear(),
    SEASON_START_MONTH,
    SEASON_START_DATE + 1
  );

  if (start.getTime() <= gs.date.getTime()) {
    throw new Error("should be called before september second");
  }

  const daysToSunday = (7 - start.getDay()) % 7;
  start.setDate(start.getDate() + daysToSunday);
  GameState.saveSchedule(gs, new Schedule(teams, start), "now");
}

// store the current season on the gameState.schedules with key {startYear}-{endYear}
// only if the current season (as gs.schedules.now) exists
function storeEndedSeasonSchedule(gs: GameState): void {
  const schd = gs.schedules.now;

  if (schd) {
    const startY = schd[0].date.getFullYear();
    const endY = schd[schd.length - 1].date.getFullYear();
    gs.schedules[`${startY}-${endY}`] = gs.schedules.now;
  }
}

export {
  SEASON_START_MONTH,
  SEASON_START_DATE,
  SEASON_END_MONTH,
  SEASON_END_DATE,
  SimRound,
  GameEvent,
  GameSimulation,
  process,
  handleGameEvent,
  handleSimRound,
  handleSkillUpdate,
  handleSeasonEnd,
  handleSeasonStart,
  handleUpdateContracts,
  simulateRound,
  updateSkills,
  updateContracts,
  renewExipiringContracts,
  removeExpiredContracts,
  enqueueSimRoundEvent,
  enqueueSkillUpdateEvent,
  enqueueSeasonEndEvent,
  enqueueSeasonStartEvent,
  enqueueUpdateContractEvent,
  storeEndedSeasonSchedule,
  newSeasonSchedule,
};
