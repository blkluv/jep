import { MOCK_GAME } from "~/models/mock.server";
import type { Action, Player, State } from "./engine";
import {
  ActionType,
  CLUE_TIMEOUT_MS,
  createInitialState,
  gameEngine,
  GameState,
} from "./engine";

const PLAYER1: Player = {
  name: "Player 1",
  userId: "1",
  score: 0,
};

const PLAYER2: Player = {
  name: "Player 2",
  userId: "2",
  score: 0,
};

const PLAYER1_JOIN_ACTION: Action = {
  type: ActionType.Join,
  payload: { name: PLAYER1.name, userId: PLAYER1.userId },
};

const PLAYER2_JOIN_ACTION: Action = {
  type: ActionType.Join,
  payload: { name: PLAYER2.name, userId: PLAYER2.userId },
};

const TWO_PLAYERS_ROUND_0: Action[] = [
  PLAYER1_JOIN_ACTION,
  PLAYER2_JOIN_ACTION,
  {
    type: ActionType.StartRound,
    payload: { round: 0 },
  },
];

describe("gameEngine", () => {
  interface TestCase {
    name: string;
    state: State;
    actions: Action[];
    expectedState: State;
  }

  const initialState = createInitialState(MOCK_GAME);

  const testCases: TestCase[] = [
    {
      name: "Player joins",
      state: initialState,
      actions: [PLAYER1_JOIN_ACTION],
      expectedState: {
        ...initialState,
        boardControl: PLAYER1.userId,
        players: new Map([[PLAYER1.userId, PLAYER1]]),
      },
    },
    {
      name: "Player joins, chooses name",
      state: initialState,
      actions: [
        PLAYER1_JOIN_ACTION,
        {
          type: ActionType.ChangeName,
          payload: { name: "Player New Name", userId: PLAYER1.userId },
        },
      ],
      expectedState: {
        ...initialState,
        boardControl: PLAYER1.userId,
        players: new Map([
          [PLAYER1.userId, { ...PLAYER1, name: "Player New Name" }],
        ]),
      },
    },
    {
      name: "Two players join, first gets board control",
      state: initialState,
      actions: [PLAYER1_JOIN_ACTION, PLAYER2_JOIN_ACTION],
      expectedState: {
        ...initialState,
        boardControl: PLAYER1.userId,
        players: new Map([
          [PLAYER1.userId, PLAYER1],
          [PLAYER2.userId, PLAYER2],
        ]),
      },
    },
    {
      name: "Round start",
      state: initialState,
      actions: [
        PLAYER1_JOIN_ACTION,
        {
          type: ActionType.StartRound,
          payload: { round: 0 },
        },
      ],
      expectedState: {
        ...initialState,
        type: GameState.WaitForClueChoice,
        boardControl: PLAYER1.userId,
        players: new Map([[PLAYER1.userId, PLAYER1]]),
      },
    },
    {
      name: "Choose clue",
      state: initialState,
      actions: [
        PLAYER1_JOIN_ACTION,
        {
          type: ActionType.StartRound,
          payload: { round: 0 },
        },
        {
          type: ActionType.ChooseClue,
          payload: { userId: PLAYER1.userId, i: 0, j: 0 },
        },
      ],
      expectedState: {
        ...initialState,
        type: GameState.ReadClue,
        activeClue: [0, 0],
        boardControl: PLAYER1.userId,
        players: new Map([[PLAYER1.userId, PLAYER1]]),
      },
    },
    {
      name: "If the only player in the game buzzes in for clue, show them the answer",
      state: initialState,
      actions: [
        PLAYER1_JOIN_ACTION,
        {
          type: ActionType.StartRound,
          payload: { round: 0 },
        },
        {
          type: ActionType.ChooseClue,
          payload: { userId: PLAYER1.userId, i: 0, j: 0 },
        },
        {
          type: ActionType.Buzz,
          payload: { userId: PLAYER1.userId, i: 0, j: 0, deltaMs: 123 },
        },
      ],
      expectedState: {
        ...initialState,
        type: GameState.RevealAnswerToBuzzer,
        activeClue: [0, 0],
        boardControl: PLAYER1.userId,
        buzzes: new Map([[PLAYER1.userId, 123]]),
        players: new Map([[PLAYER1.userId, PLAYER1]]),
      },
    },
    {
      name: "If one of multiple players in the game buzzes in for clue, wait for more buzzes",
      state: initialState,
      actions: [
        ...TWO_PLAYERS_ROUND_0,
        {
          type: ActionType.ChooseClue,
          payload: { userId: PLAYER1.userId, i: 0, j: 0 },
        },
        {
          type: ActionType.Buzz,
          payload: { userId: PLAYER1.userId, i: 0, j: 0, deltaMs: 123 },
        },
      ],
      expectedState: {
        ...initialState,
        type: GameState.ReadClue,
        activeClue: [0, 0],
        boardControl: PLAYER1.userId,
        buzzes: new Map([[PLAYER1.userId, 123]]),
        players: new Map([
          [PLAYER1.userId, PLAYER1],
          [PLAYER2.userId, PLAYER2],
        ]),
      },
    },
    {
      name: "If all players buzz in, reveal answer to winner",
      state: initialState,
      actions: [
        ...TWO_PLAYERS_ROUND_0,
        {
          type: ActionType.ChooseClue,
          payload: { userId: PLAYER1.userId, i: 0, j: 0 },
        },
        {
          type: ActionType.Buzz,
          payload: { userId: PLAYER1.userId, i: 0, j: 0, deltaMs: 123 },
        },
        {
          type: ActionType.Buzz,
          payload: { userId: PLAYER2.userId, i: 0, j: 0, deltaMs: 456 },
        },
      ],
      expectedState: {
        ...initialState,
        type: GameState.RevealAnswerToBuzzer,
        activeClue: [0, 0],
        boardControl: PLAYER1.userId,
        buzzes: new Map([
          [PLAYER1.userId, 123],
          [PLAYER2.userId, 456],
        ]),
        players: new Map([
          [PLAYER1.userId, PLAYER1],
          [PLAYER2.userId, PLAYER2],
        ]),
      },
    },
    {
      name: "If one player buzzes in and the rest time out, reveal answer to buzzer",
      state: initialState,
      actions: [
        ...TWO_PLAYERS_ROUND_0,
        {
          type: ActionType.ChooseClue,
          payload: { userId: PLAYER1.userId, i: 0, j: 0 },
        },
        {
          type: ActionType.Buzz,
          payload: { userId: PLAYER1.userId, i: 0, j: 0, deltaMs: 123 },
        },
        {
          type: ActionType.Buzz,
          payload: {
            userId: PLAYER2.userId,
            i: 0,
            j: 0,
            deltaMs: CLUE_TIMEOUT_MS,
          },
        },
      ],
      expectedState: {
        ...initialState,
        type: GameState.RevealAnswerToBuzzer,
        activeClue: [0, 0],
        boardControl: PLAYER1.userId,
        buzzes: new Map([
          [PLAYER1.userId, 123],
          [PLAYER2.userId, CLUE_TIMEOUT_MS],
        ]),
        players: new Map([
          [PLAYER1.userId, PLAYER1],
          [PLAYER2.userId, PLAYER2],
        ]),
      },
    },
    {
      name: "If one player times out, ignore further buzzes",
      state: initialState,
      actions: [
        ...TWO_PLAYERS_ROUND_0,
        {
          type: ActionType.ChooseClue,
          payload: { userId: PLAYER1.userId, i: 0, j: 0 },
        },
        {
          type: ActionType.Buzz,
          payload: {
            userId: PLAYER1.userId,
            i: 0,
            j: 0,
            deltaMs: CLUE_TIMEOUT_MS + 1,
          },
        },
        {
          type: ActionType.Buzz,
          payload: {
            userId: PLAYER2.userId,
            i: 0,
            j: 0,
            deltaMs: 123,
          },
        },
      ],
      expectedState: {
        ...initialState,
        type: GameState.RevealAnswerToAll,
        activeClue: [0, 0],
        boardControl: PLAYER1.userId,
        buzzes: new Map([[PLAYER1.userId, CLUE_TIMEOUT_MS + 1]]),
        isAnswered: [[{ isAnswered: true, answeredBy: undefined }]],
        numAnswered: 1,
        players: new Map([
          [PLAYER1.userId, PLAYER1],
          [PLAYER2.userId, PLAYER2],
        ]),
      },
    },
  ];

  for (const tc of testCases) {
    it(tc.name, () => {
      let state = tc.state;
      for (const action of tc.actions) {
        state = gameEngine(state, action);
      }
      expect(tc.state).toStrictEqual(initialState);
      expect(state).toStrictEqual(tc.expectedState);
    });
  }
});
