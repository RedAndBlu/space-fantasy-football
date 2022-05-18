import { Player, PositionArea, pickBest } from "../character/player";
import { Team, Contract } from "../character/team";
import { Schedule, Match } from "./tournament-scheduler";
import {
  GameEvent,
  enqueueSimRoundEvent,
  enqueueSkillUpdateEvent,
  enqueueSeasonEndEvent,
  newSeasonSchedule,
} from "./game-simulation";
import teams from "../asset/team-names.json";

const INIT_MONTH = 7; // august
const INIT_DATE = 1;
const INIT_HOUR = 10;
type ScheduleRound = { date: Date; matchIds: string[] };

// instances of this inferface are saved as JSON on the user machine, this is
// the game save
class GameState {
  date: Date;
  // sorted by dates, use enqueueGameEvents when adding events to preserve the order
  eventQueue: GameEvent[] = [];
  players: { [id: string]: Player } = {};
  teams: { [name: string]: Team } = {};
  contracts: { [playerId: string]: Contract } = {};
  schedules: { [year: string]: ScheduleRound[] } = {};
  matches: { [id: string]: Match } = {};

  constructor(date: Date) {
    this.date = new Date(date.getTime());
  }

  // init a new game state filling it with players, team and all the necessary for a new game
  static init(): GameState {
    const state = new GameState(
      new Date(new Date().getFullYear(), INIT_MONTH, INIT_DATE, INIT_HOUR)
    );
    newSeasonSchedule(state, teams.eng.names); // TODO: select the location
    initTeams(state, teams.eng.names); // TODO: select the location
    initGameEvents(state);
    return state;
  }

  // add a new game event preserving the order by date of the queue
  static enqueueGameEvent(s: GameState, e: GameEvent): void {
    // TODO: use binary search or a priority queue...
    const findOlder = (evt: GameEvent) => evt.date.getTime() > e.date.getTime();
    const i = s.eventQueue.findIndex(findOlder);
    i !== -1 ? s.eventQueue.splice(i, 0, e) : s.eventQueue.push(e);
  }

  // get all team players or an empty array when the then doesn't exist
  static getTeamPlayers(s: GameState, team: string): Player[] {
    return s.teams[team]?.playerIds.map((id) => s.players[id]) ?? [];
  }

  static saveContract(s: GameState, c: Contract): void {
    s.contracts[c.playerId] = c;
  }

  static deleteContract(s: GameState, c: Contract): void {
    delete s.contracts[c.playerId];
  }

  static getContract(s: GameState, p: Player): Contract | void {
    return s.contracts[p.id];
  }

  // overrides the old player contract
  static savePlayer(s: GameState, p: Player): void {
    s.players[p.id] = p;
  }

  static saveTeam(s: GameState, t: Team): void {
    s.teams[t.name] = t;
  }

  /**
   * the saved schedule is flatten in two object schedules and matches
   * key is used as index for the schedule, for the current season use the "now" as key
   */
  static saveSchedule(s: GameState, schd: Schedule, key: string): void {
    s.schedules[key] = [];

    schd.rounds.forEach((round) => {
      s.schedules[key].push({
        date: round.date,
        matchIds: round.matches.map((m) => m.id),
      });

      round.matches.forEach((m) => {
        s.matches[m.id] = m;
      });
    });
  }
}

interface GameStateObserver {
  gameStateUpdated: () => void;
}

class GameStateHandle {
  private observers: Set<GameStateObserver> = new Set();
  private _state: GameState;

  constructor(state: GameState) {
    this._state = structuredClone(state);
  }

  // the gameState returned is a deep copy
  get state(): GameState {
    return structuredClone(this._state);
  }

  // the saved gameState is a copy of updated
  set state(updated: GameState) {
    this._state = structuredClone(updated);
    this.notifyObservers();
  }

  // if an object depended on the GameState should add itself as an observer
  // every GameStateObserver will be notified when the gameState change
  addObserver(ob: GameStateObserver): void {
    this.observers.add(ob);
  }

  removeObserver(ob: GameStateObserver): void {
    this.observers.delete(ob);
  }

  private notifyObservers(): void {
    this.observers.forEach((ob) => ob.gameStateUpdated());
  }

  // get the gamseState as a json url
  getStateAsJsonUrl(): string {
    return URL.createObjectURL(
      new Blob([JSON.stringify(this._state)], { type: "application/json" })
    );
  }
}

// create n new players at the given position area and add to the given gameState
// returns the players created
function initPlayers(s: GameState, at: PositionArea, n: number): Player[] {
  return Array.from({ length: n }, () => {
    const p = Player.createPlayerAt(s.date, at);
    GameState.savePlayer(s, p);
    return p;
  });
}

// create new teams with the given names fill them with some new created players
// add everything to the given gameState and returns created teams
function initTeams(s: GameState, names: string[]): Team[] {
  return names.map((name) => {
    const team = new Team(name);
    GameState.saveTeam(s, team);
    const signPlayers = (plrs: Player[]) =>
      plrs.forEach((p) => Team.signPlayer(s, team, p));

    signPlayers(pickBest(initPlayers(s, "goolkeeper", 4), 3));
    signPlayers(pickBest(initPlayers(s, "defender", 10), 8));
    signPlayers(pickBest(initPlayers(s, "midfielder", 10), 8));
    signPlayers(pickBest(initPlayers(s, "forward", 8), 6));
    return team;
  });
}

// save the starting events for the game in te gameState.eventQueue as
// skillUpdate and simRound for the first round (when the current season schedule exists)
function initGameEvents(gs: GameState): void {
  enqueueSimRoundEvent(gs, 0);
  enqueueSkillUpdateEvent(gs);
  enqueueSeasonEndEvent(gs);
}

export {
  GameState,
  GameStateObserver,
  GameStateHandle,
  initPlayers,
  initTeams,
  initGameEvents,
};
