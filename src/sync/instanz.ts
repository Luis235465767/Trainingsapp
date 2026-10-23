// Die eine Synchronisierung der App, verdrahtet mit Datenbank und lokalem Speicher.
import { useEffect, useState } from "react";
import { db } from "../db/schema";
import { leseStand, uebernimmStand } from "../db/stand";
import { beiAenderung } from "../db/repo";
import { erzeugeSync, type SyncStatus } from "./sync";

const konfig = {
  lies: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  schreib: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* privat-Modus */ } },
};

export const sync = erzeugeSync({ holeStand: () => leseStand(db), uebernimm: s => uebernimmStand(db, s), konfig });

/** Startet den Abgleich und hält ihn aktuell, solange die App offen ist. */
export function starteSynchronisierung() {
  beiAenderung(() => sync.geaendert());
  void sync.start();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sync.synchronisiere();
    else void sync.sofort();
  });
  window.addEventListener("pagehide", () => { void sync.sofort(); });
  window.addEventListener("online", () => { void sync.synchronisiere(); });
  // Solange die App sichtbar ist, alle 2 Minuten nach Änderungen anderer Geräte schauen
  setInterval(() => { if (document.visibilityState === "visible") void sync.synchronisiere(); }, 120000);
}

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState(sync.status());
  useEffect(() => sync.abonniere(setS), []);
  return s;
}
