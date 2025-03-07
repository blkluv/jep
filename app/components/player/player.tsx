import classNames from "classnames";

import type { Player } from "~/engine";
import { useEngineContext } from "~/engine";
import { stringToHslColor } from "~/utils/utils";

const formatter = Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0, // Round to whole dollars.
});

function PlayerScore({
  player,
  hasBoardControl,
  winning,
}: {
  player: Player;
  hasBoardControl: boolean;
  winning: boolean;
}) {
  const color = stringToHslColor(player.userId);
  return (
    <div
      className={classNames(
        "flex sm:flex-col items-center gap-2 p-2 sm:p-3 border-2 bg-blue-1000 bg-gradient-to-b from-blue-800",
        {
          "border-slate-200": !hasBoardControl,
          "border-yellow-400": hasBoardControl,
        }
      )}
    >
      <div
        className="w-2/3 sm:w-auto grow flex flex-wrap gap-2 font-handwriting text-2xl font-bold"
        style={{ color: color }}
      >
        {player.name}
        {winning && <div>👑</div>}
      </div>
      <div className="w-1/3 sm:w-auto grow text-white text-xl font-impact text-shadow-md">
        {formatter.format(player.score)}
      </div>
    </div>
  );
}

export function PlayerIcon({ player }: { player: Player }) {
  const color = stringToHslColor(player.userId);
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center"
      style={{ backgroundColor: color }}
      title={player.name}
    >
      <div className="text-white text-md font-mono font-bold">
        {player.name[0]}
      </div>
    </div>
  );
}

export function PlayerScores() {
  const { players, boardControl } = useEngineContext();

  const maxScore = Math.max(
    ...Array.from(players.values()).map((p) => p.score)
  );

  return (
    <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2">
      {Array.from(players.values()).map((p, i) => (
        <PlayerScore
          key={i}
          player={p}
          hasBoardControl={p.userId === boardControl}
          winning={p.score === maxScore}
        />
      ))}
    </div>
  );
}
