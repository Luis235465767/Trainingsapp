// Gesamten Datenstand lesen und einen zusammengeführten Stand übernehmen (für die Synchronisierung).
import type { TrainingDB } from "./schema";
import { TABELLEN, type Stand } from "../model/types";
import { fuehreZusammen } from "../logic/zusammenfuehren";

export async function leseStand(d: TrainingDB): Promise<Stand> {
  const [uebungen, kraftEinheiten, vorlagen, handballEinheiten, geloescht] = await Promise.all([
    d.uebungen.toArray(), d.kraftEinheiten.toArray(), d.vorlagen.toArray(), d.handballEinheiten.toArray(), d.geloescht.toArray(),
  ]);
  return { uebungen, kraftEinheiten, vorlagen, handballEinheiten, geloescht };
}

/**
 * Führt den fremden Stand mit dem lokalen zusammen und schreibt nur, was sich ändert.
 * Läuft in einer Transaktion und liest den lokalen Stand darin neu, damit gleichzeitige
 * Eingaben auf diesem Gerät nicht verloren gehen. Gibt die Zahl der Änderungen zurück.
 */
export async function uebernimmStand(d: TrainingDB, fremd: Stand): Promise<number> {
  return d.transaction("rw", [d.uebungen, d.kraftEinheiten, d.vorlagen, d.handballEinheiten, d.geloescht], async () => {
    const lokal = await leseStand(d);
    const neu = fuehreZusammen(lokal, fremd);
    let aenderungen = 0;
    for (const t of TABELLEN) {
      const alt = new Map((lokal[t] as { id: string }[]).map(x => [x.id, JSON.stringify(x)]));
      const behalten = new Set((neu[t] as { id: string }[]).map(x => x.id));
      const schreiben = (neu[t] as { id: string }[]).filter(x => alt.get(x.id) !== JSON.stringify(x));
      const loeschen = [...alt.keys()].filter(id => !behalten.has(id));
      if (schreiben.length) await (d[t] as unknown as { bulkPut: (x: unknown[]) => Promise<unknown> }).bulkPut(schreiben);
      if (loeschen.length) await d[t].bulkDelete(loeschen);
      aenderungen += schreiben.length + loeschen.length;
    }
    const alteMarken = new Map(lokal.geloescht.map(m => [m.id, m.zeit]));
    const neueMarken = neu.geloescht.filter(m => alteMarken.get(m.id) !== m.zeit);
    if (neueMarken.length) await d.geloescht.bulkPut(neueMarken);
    return aenderungen;
  });
}
