import * as _tr from "../../src/game-state/tournament-scheduler";
import tms from "../../src/asset/team-names.json";

const teamsJson = tms.eng.names;
const teams = ["a", "b", "c", "d", "e", "f", "g", "h"];

describe("rotateTeams()", () => {
  test("should move all values by one spot except teams[0] and the last at team[1]", () => {
    expect(_tr.rotate(teams)).toEqual(["a", "h", "b", "c", "d", "e", "f", "g"]);
  });
});

describe("createRound()", () => {
  test("should pair the first half with the second half moving from the two end", () => {
    expect(_tr.createRound(teams)).toEqual([
      ["a", "h"],
      ["b", "g"],
      ["c", "f"],
      ["d", "e"],
    ]);
  });
});

describe("createTournamentRounds()", () => {
  const rounds = _tr.createTournamentRounds(teamsJson);

  test("should create (teams - 1) rounds", () => {
    expect(rounds.length).toBe(teamsJson.length - 1);
  });

  test("for every round each team play once", () => {
    rounds.forEach((round) => {
      expect(new Set(round.flat()).size).toBe(teamsJson.length);
    });
  });

  test("shouldn't return duplicate matches", () => {
    const matchCounter = new Set<string>();

    rounds.forEach((round) => {
      round.forEach(([team1, team2]) => {
        const match1 = `${team1}-$${team2}`;
        const match2 = `${team2}-$${team1}`;
        expect(matchCounter.has(match1)).toBe(false);
        expect(matchCounter.has(match2)).toBe(false);
        matchCounter.add(match1);
        matchCounter.add(match2);
      });
    });
  });
});

describe("createDoubleRoundsTournament()", () => {
  const rounds = _tr.createDoubleRoundsTournament(teamsJson);

  test("should create 2 * (teams - 1) rounds", () => {
    expect(rounds.length).toBe(2 * (teamsJson.length - 1));
  });

  test("for every round each team play once", () => {
    rounds.forEach((round) => {
      expect(new Set(round.flat()).size).toBe(teamsJson.length);
    });
  });

  test("shouldn't return duplicate matches except for inverted home and away", () => {
    const matchCounter = new Set<string>();

    rounds.forEach((round) => {
      round.forEach(([home, away]) => {
        const match = `${home}-${away}`;
        expect(matchCounter.has(match)).toBe(false);
        matchCounter.add(match);
      });
    });
  });
});

describe("Schedule", () => {
  const schedule = new _tr.Schedule(teamsJson, new Date(2010, 8, 1));

  test("every match has an unique id", () => {
    const matchIds = new Set();
    schedule.rounds.forEach((round) =>
      round.matches.forEach((mt) => {
        expect(matchIds.has(mt.id)).toBe(false);
        matchIds.add(mt.id);
      })
    );
  });

  test("rounds should be one week apart", () => {
    for (let i = 0; i < schedule.rounds.length - 1; i++) {
      const d = new Date(schedule.rounds[i].date);
      d.setDate(d.getDate() + 7);
      expect(d.toDateString()).toBe(schedule.rounds[i + 1].date.toDateString());
    }
  });
});
