import "fake-indexeddb/auto";
import Dexie from "dexie";
import { expect, it } from "vitest";
import { TrainingDB } from "../src/db/schema";

it("Update von Datenbank-Version 1 behält alle Daten", async () => {
  const alt = new Dexie("upgrade-test");
  alt.version(1).stores({ uebungen: "id, name, kategorie", kraftEinheiten: "id, datum", vorlagen: "id, name", handballEinheiten: "id, datum" });
  await alt.table("uebungen").put({ id: "u1", name: "Bank", kategorie: "Brust" });
  await alt.table("handballEinheiten").put({ id: "h1", datum: "2026-10-01", art: "Spiel", dauerMin: 60, rpe: 8 });
  alt.close();
  const neu = new TrainingDB("upgrade-test");
  expect(await neu.uebungen.count()).toBe(1);
  expect(await neu.handballEinheiten.get("h1")).toMatchObject({ rpe: 8 });
  expect(await neu.geloescht.count()).toBe(0);
});
