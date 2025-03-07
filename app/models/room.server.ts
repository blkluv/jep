import type { Database } from "~/models/database.types";
import { db } from "~/supabase.server";
import { getRandomWord } from "~/utils/utils";

type RoomTable = Database["public"]["Tables"]["rooms"];
type Room = RoomTable["Row"];

/* Reads */

export async function getRoom(nameAndId: string): Promise<Room | null> {
  const id = nameAndId.split("-")[0];

  const { data, error } = await db
    .from<"rooms", RoomTable>("rooms")
    .select("*")
    .eq("id", id);

  if (error !== null) {
    throw new Error(error.message);
  }

  if (data.length === 0) {
    return null;
  }

  return data[0];
}

/* Writes */

export async function createRoom(gameId: string) {
  const word = getRandomWord();

  const { data, error } = await db
    .from<"rooms", RoomTable>("rooms")
    .insert<RoomTable["Insert"]>({ name: word, game_id: gameId })
    .select();

  if (error !== null) {
    throw new Error(error.message);
  }

  return data[0].id + "-" + word;
}
