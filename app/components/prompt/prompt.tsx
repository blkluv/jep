import { useFetcher } from "@remix-run/react";
import classNames from "classnames";
import * as React from "react";
import { use100vh } from "react-div-100vh";
import useFitText from "use-fit-text";

import type { Action } from "~/engine";
import {
  CANT_BUZZ_FLAG,
  CLUE_TIMEOUT_MS,
  GameState,
  useEngineContext,
} from "~/engine";
import useKeyPress from "~/utils/use-key-press";
import { useSoloAction } from "~/utils/use-solo-action";
import useGameSound from "~/utils/use-sound";
import { useTimeout } from "~/utils/use-timeout";

import { ConnectedAnswerForm as AnswerForm } from "./answer-form";
import { Buzzes } from "./buzz";
import { ConnectedCheckForm as CheckForm } from "./check-form";
import { Countdown } from "./countdown";
import { Fade } from "./fade";
import { Kbd } from "./kbd";
import { Lockout } from "./lockout";
import { ConnectedNextClueForm as NextClueForm } from "./next-clue-form";
import { ReadClueTimer } from "./read-clue-timer";
import ShinyText from "./shiny-text";
import { ConnectedWagerForm as WagerForm } from "./wager-form";

/** MS_PER_CHARACTER is a heuristic value to scale the amount of time per clue by
 * its length.
 */
const MS_PER_CHARACTER = 70;

/** CLUE_READ_OFFSET is the base amount of time it takes to read a clue. */
const CLUE_READ_OFFSET = 500;

/** REOPENED_CLUE_READ_MS is the amount of time to "re-read" the clue after a
 * failed buzz before re-opening the buzzers.
 */
const REOPENED_CLUE_READ_MS = 1000;

/** LOCKOUT_MS applies a 250ms lockout if a contestant buzzes before the clue is
 * read.
 */
const LOCKOUT_MS = 250;

const LONG_FORM_CLUE_DURATION_SEC = 30;
const TIMES_UP_SFX = "/sounds/times-up.mp3";

interface Props {
  roomName: string;
  userId: string;
}

function ClueText({
  answer,
  canBuzz,
  clue,
  focusOnBuzz,
  onBuzz,
  showAnswer,
}: {
  answer?: string;
  canBuzz: boolean;
  clue?: string;
  focusOnBuzz: boolean;
  onBuzz: (buzzedAt: number) => void;
  showAnswer: boolean;
}) {
  const { fontSize, ref } = useFitText({ minFontSize: 20, maxFontSize: 400 });

  return (
    <button
      type="button"
      disabled={!canBuzz}
      onClick={() => onBuzz(Date.now())}
      className={
        "p-4 w-screen flex flex-col justify-center grow " +
        "uppercase text-shadow-lg font-korinna font-bold"
      }
      autoFocus={focusOnBuzz}
    >
      <p
        className="max-h-96 max-w-screen-lg mx-auto text-white word-spacing-1 leading-normal w-full"
        ref={ref}
        style={{ fontSize }}
      >
        {clue}
        <br />
        <span
          className={classNames("text-cyan-300", {
            "opacity-0": !showAnswer,
          })}
        >
          {answer}
        </span>
      </p>
    </button>
  );
}

/** WagerCluePrompt handles all frontend behavior while the game state is
 * GameState.WagerClue.
 */
function WagerCluePrompt({ roomName, userId }: Props) {
  const { clue, boardControl, buzzes, category, players } = useEngineContext();
  const { ref, fontSize } = useFitText({ minFontSize: 20, maxFontSize: 600 });

  const canWager = buzzes.get(userId) !== CANT_BUZZ_FLAG;
  const wagererName = boardControl
    ? players.get(boardControl)?.name ?? "winning buzzer"
    : "winning buzzer";
  const longForm = clue?.longForm ?? false;

  return (
    <>
      <ReadClueTimer clueDurationMs={0} shouldAnimate={false} />
      {longForm ? null : <p className="p-4 text-white font-bold">{category}</p>}
      <div
        className="w-screen flex items-center justify-center grow"
        ref={ref}
        style={{ fontSize }}
      >
        {longForm ? (
          <div className="p-4 flex flex-col max-h-96 max-w-screen-lg mx-auto">
            <ShinyText text="final clue" />
            <p className="text-white font-bold text-center uppercase font-korinna text-shadow-md break-words">
              {category}
            </p>
          </div>
        ) : (
          <div className="p-4 relative">
            <ShinyText text="double down" />
            {/* Hidden absolute element keeps shiny text from overflowing its grid */}
            <p className="p-4 absolute top-0 left-0 opacity-0 text-center font-black text-white uppercase">
              double down
            </p>
          </div>
        )}
      </div>
      {canWager ? (
        <WagerForm roomName={roomName} userId={userId} />
      ) : longForm ? (
        <div className="p-2 flex flex-col items-center gap-2">
          <p className="text-white font-bold">
            You do not have enough money to wager on this clue.
          </p>
          <p className="text-slate-300 text-sm">
            Waiting for others to submit wagers...
          </p>
        </div>
      ) : (
        <p className="p-2 text-center text-white font-bold">
          Waiting for response from {wagererName}...
        </p>
      )}
      <Countdown startTime={undefined} />
      <Buzzes showWinner={false} />
    </>
  );
}

/** ReadCluePrompt handles all frontend behavior while the game state is
 * GameState.ReadClue.
 */
function ReadCluePrompt({ roomName, userId }: Props) {
  const { activeClue, buzzes, category, clue, getClueValue, soloDispatch } =
    useEngineContext();

  const [optimisticBuzzes, setOptimisticBuzzes] = React.useState(buzzes);
  const myBuzzDurationMs = optimisticBuzzes.get(userId);

  const [clueShownAt, setClueShownAt] = React.useState<number | undefined>(
    myBuzzDurationMs !== undefined ? 0 : undefined
  );
  const [clueIdx, setClueIdx] = React.useState(activeClue);

  const [buzzerOpenAt, setBuzzerOpenAt] = React.useState<number | undefined>(
    myBuzzDurationMs !== undefined ? 0 : undefined
  );
  const [lockout, setLockout] = React.useState(false);

  const fetcher = useFetcher<Action>();
  useSoloAction(fetcher, soloDispatch);
  const submit = fetcher.submit;

  const numCharactersInClue = clue?.clue.length ?? 0;

  // If we are reopening the buzzers after a wrong answer, delay a fixed amount
  // of time before re-opening the buzzers.
  const hasLockedOutBuzzers = Array.from(optimisticBuzzes.values()).some(
    (b) => b === CANT_BUZZ_FLAG
  );
  const clueDurationMs = hasLockedOutBuzzers
    ? REOPENED_CLUE_READ_MS
    : CLUE_READ_OFFSET + MS_PER_CHARACTER * numCharactersInClue;

  // Keep activeClue set to the last valid clue index.
  React.useEffect(() => {
    if (activeClue) {
      setClueShownAt(Date.now());
      setClueIdx(activeClue);
      setBuzzerOpenAt(myBuzzDurationMs !== undefined ? 0 : undefined);
    } else {
      setClueShownAt(undefined);
      setBuzzerOpenAt(undefined);
    }
  }, [activeClue, myBuzzDurationMs]);

  /** submitTimeoutBuzz submits a buzz of CLUE_TIMEOUT_MS + 1 to the server. */
  const submitTimeoutBuzz = React.useCallback(() => {
    const deltaMs = CLUE_TIMEOUT_MS + 1;
    const [i, j] = clueIdx ?? [-1, -1];
    return submit(
      {
        i: i.toString(),
        j: j.toString(),
        userId,
        deltaMs: deltaMs.toString(),
      },
      { method: "post", action: `/room/${roomName}/buzz` }
    );
  }, [submit, roomName, userId, clueIdx]);

  // Update optimisticBuzzes once buzzes come in from the server.
  React.useEffect(() => {
    // If a new buzz comes in that's less than the current deltaMs, submit a
    // timeout buzz.
    if (buzzerOpenAt) {
      const currentDeltaMs = Date.now() - buzzerOpenAt;
      for (const [buzzUserId, buzz] of buzzes) {
        if (
          buzzUserId !== userId &&
          buzz !== CANT_BUZZ_FLAG &&
          buzz < currentDeltaMs
        ) {
          submitTimeoutBuzz();
        }
      }
    }
    setOptimisticBuzzes(buzzes);
  }, [buzzes, buzzerOpenAt, userId, submitTimeoutBuzz]);

  // Open the buzzer after the clue is done being "read".
  const delayMs = myBuzzDurationMs === undefined ? clueDurationMs : null;
  useTimeout(() => setBuzzerOpenAt(Date.now()), delayMs);

  // Remove the lockout after 500ms.
  useTimeout(() => setLockout(false), lockout ? LOCKOUT_MS : null);

  // If the contestant doesn't buzz for 5 seconds, close the buzzer and send a
  // 5-second "non-buzz" buzz to the server.
  useTimeout(
    () => {
      setOptimisticBuzzes((old) => {
        if (old.has(userId)) {
          return old;
        }
        return new Map([...old, [userId, CLUE_TIMEOUT_MS + 1]]);
      });
      submitTimeoutBuzz();
    },
    buzzerOpenAt !== undefined && myBuzzDurationMs === undefined && clueIdx
      ? CLUE_TIMEOUT_MS
      : null
  );

  // Play the "time's up" sound after 5 seconds if no one buzzed in.
  const [playTimesUpSfx] = useGameSound(TIMES_UP_SFX);
  useTimeout(
    playTimesUpSfx,
    buzzerOpenAt !== undefined &&
      !Array.from(optimisticBuzzes.values()).some(
        (v) => v !== CANT_BUZZ_FLAG && v < CLUE_TIMEOUT_MS
      )
      ? CLUE_TIMEOUT_MS
      : null
  );

  const handleClick = (clickedAtMs: number) => {
    if (
      clueShownAt === undefined ||
      lockout ||
      myBuzzDurationMs !== undefined
    ) {
      return;
    }

    const lockoutDeltaMs = clickedAtMs - clueShownAt;
    if (lockoutDeltaMs < clueDurationMs) {
      return setLockout(true);
    }

    if (buzzerOpenAt === undefined || !clueIdx) {
      return;
    }

    // Contestant buzzed, so submit their buzz time
    const [i, j] = clueIdx;
    const clueDeltaMs = clickedAtMs - buzzerOpenAt;

    setOptimisticBuzzes((old) => old.set(userId, clueDeltaMs));

    return fetcher.submit(
      {
        i: i.toString(),
        j: j.toString(),
        userId,
        deltaMs: clueDeltaMs.toString(),
      },
      { method: "post", action: `/room/${roomName}/buzz` }
    );
  };

  useKeyPress("Enter", () => handleClick(Date.now()));

  const clueValue = clueIdx ? getClueValue(clueIdx, userId) : 0;

  return (
    <>
      <ReadClueTimer
        clueDurationMs={clueDurationMs}
        shouldAnimate={myBuzzDurationMs === undefined}
      />
      <div className="flex justify-between p-4">
        <div className="text-white">
          <span className="font-bold">{category}</span> for{" "}
          <span className="font-bold">${clueValue}</span>
        </div>
        <span className="text-sm text-slate-300">
          Click or press <Kbd>Enter</Kbd> to buzz in
        </span>
      </div>
      <ClueText
        clue={clue?.clue}
        canBuzz={!lockout && myBuzzDurationMs === undefined}
        onBuzz={() => handleClick(Date.now())}
        focusOnBuzz
        showAnswer={false}
        answer={undefined}
      />
      <Lockout active={lockout} />
      <Countdown startTime={buzzerOpenAt} />
      <Buzzes buzzes={optimisticBuzzes} showWinner={false} />
    </>
  );
}

/** ReadLongFormCluePrompt handles all frontend behavior while the game state is
 * GameState.ReadLongFormClue.
 */
function ReadLongFormCluePrompt({ roomName, userId }: Props) {
  const { activeClue, buzzes, category, clue, getClueValue, soloDispatch } =
    useEngineContext();

  const fetcher = useFetcher<Action>();
  useSoloAction(fetcher, soloDispatch);

  const myBuzzDurationMs = buzzes.get(userId);
  const canAnswer = myBuzzDurationMs !== CANT_BUZZ_FLAG;

  const [countdownStartedAt] = React.useState(
    myBuzzDurationMs === undefined ? Date.now() : undefined
  );

  const clueValue = activeClue ? getClueValue(activeClue, userId) : 0;

  return (
    <>
      <ReadClueTimer clueDurationMs={0} shouldAnimate={false} />
      <div className="flex justify-between p-4">
        <div className="text-white">
          <span className="font-bold">{category}</span> for{" "}
          <span className="font-bold">${clueValue}</span>
        </div>
      </div>
      <ClueText
        clue={clue?.clue}
        canBuzz={false}
        onBuzz={() => null}
        focusOnBuzz={false}
        showAnswer={false}
        answer={undefined}
      />
      {canAnswer ? (
        <AnswerForm roomName={roomName} userId={userId} />
      ) : (
        <div className="p-2 flex flex-col items-center gap-2">
          <p className="text-slate-300 text-sm">
            Waiting for others to answer...
          </p>
        </div>
      )}
      <Countdown
        startTime={countdownStartedAt}
        durationSec={LONG_FORM_CLUE_DURATION_SEC}
      />
      <Buzzes showWinner={false} />
    </>
  );
}

/** RevealAnswerToBuzzerPrompt handles all frontend behavior while the game state
 * is GameState.RevealAnswerToBuzzer.
 */
function RevealAnswerToBuzzerPrompt({ roomName, userId }: Props) {
  const { activeClue, category, clue, getClueValue, players, winningBuzzer } =
    useEngineContext();

  const clueValue = activeClue ? getClueValue(activeClue, userId) : 0;

  const canShowAnswer = winningBuzzer === userId;
  const [showAnswer, setShowAnswer] = React.useState(false);

  // Play the "time's up" sound after 5 seconds if the contestant can reveal the
  // answer but hasn't yet.
  const [playTimesUpSfx] = useGameSound(TIMES_UP_SFX);
  useTimeout(
    playTimesUpSfx,
    canShowAnswer && !showAnswer ? CLUE_TIMEOUT_MS : null
  );
  const [countdownStartedAt] = React.useState(
    canShowAnswer && !showAnswer ? Date.now() : undefined
  );

  const winningPlayerName = winningBuzzer
    ? players.get(winningBuzzer)?.name ?? "winning buzzer"
    : "winning buzzer";

  return (
    <>
      <ReadClueTimer clueDurationMs={0} shouldAnimate={false} />
      <div className="flex justify-between p-4">
        <div className="text-white">
          <span className="font-bold">{category}</span> for{" "}
          <span className="font-bold">${clueValue}</span>
        </div>
        <span className="text-sm text-slate-300">
          Click or press <Kbd>Enter</Kbd> to buzz in
        </span>
      </div>
      <ClueText
        answer={clue?.answer}
        canBuzz={false}
        clue={clue?.clue}
        focusOnBuzz={false}
        onBuzz={() => null}
        showAnswer={canShowAnswer && showAnswer}
      />
      {canShowAnswer ? (
        <CheckForm
          roomName={roomName}
          userId={userId}
          showAnswer={canShowAnswer && showAnswer}
          onClickShowAnswer={
            canShowAnswer ? () => setShowAnswer(true) : () => null
          }
        />
      ) : (
        <p className="p-2 text-center text-white font-bold">
          Waiting for response from {winningPlayerName}...
        </p>
      )}
      <Countdown startTime={countdownStartedAt} />
      <Buzzes showWinner={false} />
    </>
  );
}

function RevealAnswerLongFormPrompt({ roomName, userId }: Props) {
  const { activeClue, buzzes, category, clue, getClueValue } =
    useEngineContext();

  const clueValue = activeClue ? getClueValue(activeClue, userId) : 0;
  const buzzDurationMs = buzzes.get(userId);
  const canCheckAnswer =
    buzzDurationMs !== undefined && buzzDurationMs !== CANT_BUZZ_FLAG;

  return (
    <>
      <ReadClueTimer clueDurationMs={0} shouldAnimate={false} />
      <div className="flex justify-between p-4">
        <div className="text-white">
          <span className="font-bold">{category}</span> for{" "}
          <span className="font-bold">${clueValue}</span>
        </div>
        <span className="text-sm text-slate-300">
          Click or press <Kbd>Enter</Kbd> to buzz in
        </span>
      </div>
      <ClueText
        answer={clue?.answer}
        canBuzz={false}
        clue={clue?.clue}
        focusOnBuzz={false}
        onBuzz={() => null}
        showAnswer
      />
      {canCheckAnswer ? (
        <CheckForm
          roomName={roomName}
          userId={userId}
          showAnswer
          answerHiddenFromOthers={false}
          onClickShowAnswer={() => null}
        />
      ) : (
        <p className="p-2 text-center text-slate-300 text-sm">
          {/* TODO: which players? */}
          Waiting for checks from other players...
        </p>
      )}
      <Countdown
        startTime={undefined}
        durationSec={LONG_FORM_CLUE_DURATION_SEC}
      />
      <Buzzes showWinner={false} />
    </>
  );
}

/** RevealAnswerToAllPrompt handles all frontend behavior while the game state is
 * GameState.ReadAnswerToAll.
 */
function RevealAnswerToAllPrompt({ roomName, userId }: Props) {
  const { activeClue, category, clue, getClueValue } = useEngineContext();

  const clueValue = activeClue ? getClueValue(activeClue, userId) : 0;

  return (
    <>
      <ReadClueTimer clueDurationMs={0} shouldAnimate={false} />
      <div className="flex justify-between p-4">
        <div className="text-white">
          <span className="font-bold">{category}</span> for{" "}
          <span className="font-bold">${clueValue}</span>
        </div>
        <span className="text-sm text-slate-300">
          Click or press <Kbd>Enter</Kbd> to buzz in
        </span>
      </div>

      <ClueText
        clue={clue?.clue}
        canBuzz={false}
        onBuzz={() => null}
        focusOnBuzz={false}
        showAnswer
        answer={clue?.answer}
      />
      <NextClueForm roomName={roomName} userId={userId} />
      <Countdown startTime={undefined} />
      <Buzzes showWinner />
    </>
  );
}

export function ConnectedPrompt({ roomName, userId }: Props) {
  const { type } = useEngineContext();

  const isOpen =
    type === GameState.WagerClue ||
    type === GameState.ReadClue ||
    type === GameState.ReadLongFormClue ||
    type === GameState.RevealAnswerToBuzzer ||
    type === GameState.RevealAnswerLongForm ||
    type === GameState.RevealAnswerToAll;

  const height = use100vh();

  function getPromptContent() {
    switch (type) {
      case GameState.WagerClue:
        return <WagerCluePrompt roomName={roomName} userId={userId} />;
      case GameState.ReadClue:
        return <ReadCluePrompt roomName={roomName} userId={userId} />;
      case GameState.ReadLongFormClue:
        return <ReadLongFormCluePrompt roomName={roomName} userId={userId} />;
      case GameState.RevealAnswerToBuzzer:
        return (
          <RevealAnswerToBuzzerPrompt roomName={roomName} userId={userId} />
        );
      case GameState.RevealAnswerLongForm:
        return (
          <RevealAnswerLongFormPrompt roomName={roomName} userId={userId} />
        );
      case GameState.RevealAnswerToAll:
        return <RevealAnswerToAllPrompt roomName={roomName} userId={userId} />;
      default:
        return null;
    }
  }

  return (
    <Fade show={isOpen}>
      <div
        className="w-screen bg-blue-1000 flex flex-col justify-between"
        style={{ height: height ? `${height}px` : "100vh" }}
      >
        {getPromptContent()}
      </div>
    </Fade>
  );
}
