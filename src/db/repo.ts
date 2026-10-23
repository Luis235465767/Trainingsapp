// Alle Schreib- und Lesezugriffe auf die Datenbank an einer Stelle.
// Jede Änderung bekommt einen Zeitstempel, jede Löschung eine Löschmarke (für die Synchronisierung),
// und alle Beobachter (die Synchronisierung) werden benachrichtigt.
import { db } from "./schema";
import { TABELLEN, type Backup, type HandballEinheit, type Id, type KraftEinheit, type Tabelle, type Uebung, type Vorlage } from "../model/types";

export const neueId = (): Id =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

// ---------- Änderungen melden ----------

const beobachter = new Set<() => void>();
export function beiAenderung(f: () => void) {
  beobachter.add(f);
  return () => { beobachter.delete(f); };
}
const gemeldet = () => beobachter.forEach(f => f());

/** Streng steigender Zeitstempel, damit zwei Änderungen in derselben Millisekunde unterscheidbar bleiben. */
let zuletzt = 0;
const jetzt = () => (zuletzt = Math.max(Date.now(), zuletzt + 1));
const stempel = <T extends object>(x: T, t = jetzt()) => ({ ...x, geaendert: t });
const alleTabellen = () => [db.uebungen, db.kraftEinheiten, db.vorlagen, db.handballEinheiten, db.geloescht];

async function markiereGeloescht(tabelle: Tabelle, ids: Id[], zeit = jetzt()) {
  if (ids.length) await db.geloescht.bulkPut(ids.map(id => ({ id, tabelle, zeit })));
}

/** Beispiel-Übungen, die in eigenen Einheiten oder Vorlagen landen, werden zu synchronisierten Übungen. */
async function uebernimmBeispielUebungen(ids: Id[]) {
  const us = (await db.uebungen.bulkGet([...new Set(ids)])).filter((u): u is Uebung => !!u && !!u.beispiel && !u.geaendert);
  if (us.length) await db.uebungen.bulkPut(us.map(u => stempel(u)));
}

// ---------- Übungen ----------

export async function speichereUebung(u: Uebung) {
  await db.uebungen.put(stempel(u));
  gemeldet();
}

/** Löscht eine Übung. Wird sie noch verwendet, wird das verhindert. */
export async function loescheUebung(id: Id): Promise<{ ok: true } | { ok: false; grund: string }> {
  const einheiten = await db.kraftEinheiten.filter(e => e.eintraege.some(x => x.uebungId === id)).count();
  const vorlagen = await db.vorlagen.filter(v => v.uebungen.some(x => x.uebungId === id)).count();
  if (einheiten || vorlagen) {
    const teile = [];
    if (einheiten) teile.push(`${einheiten} Einheit${einheiten === 1 ? "" : "en"}`);
    if (vorlagen) teile.push(`${vorlagen} Vorlage${vorlagen === 1 ? "" : "n"}`);
    return { ok: false, grund: `Die Übung wird noch in ${teile.join(" und ")} verwendet.` };
  }
  await db.transaction("rw", alleTabellen(), async () => {
    await db.uebungen.delete(id);
    await markiereGeloescht("uebungen", [id]);
  });
  gemeldet();
  return { ok: true };
}

// ---------- Einheiten und Vorlagen ----------

export async function speichereKraft(e: KraftEinheit) {
  await db.transaction("rw", alleTabellen(), async () => {
    await db.kraftEinheiten.put(stempel(e));
    await uebernimmBeispielUebungen(e.eintraege.map(x => x.uebungId));
  });
  gemeldet();
}

export async function speichereVorlage(v: Vorlage) {
  await db.transaction("rw", alleTabellen(), async () => {
    await db.vorlagen.put(stempel(v));
    await uebernimmBeispielUebungen(v.uebungen.map(x => x.uebungId));
  });
  gemeldet();
}

export async function speichereHandball(h: HandballEinheit) {
  await db.handballEinheiten.put(stempel(h));
  gemeldet();
}

async function loesche(tabelle: Tabelle, id: Id) {
  await db.transaction("rw", alleTabellen(), async () => {
    await db[tabelle].delete(id);
    await markiereGeloescht(tabelle, [id]);
  });
  gemeldet();
}
export const loescheKraft = (id: Id) => loesche("kraftEinheiten", id);
export const loescheVorlage = (id: Id) => loesche("vorlagen", id);
export const loescheHandball = (id: Id) => loesche("handballEinheiten", id);

// ---------- Backup ----------

export async function erstelleBackup(): Promise<Backup> {
  const [uebungen, kraftEinheiten, vorlagen, handballEinheiten] = await Promise.all([
    db.uebungen.toArray(),
    db.kraftEinheiten.toArray(),
    db.vorlagen.toArray(),
    db.handballEinheiten.toArray(),
  ]);
  return { app: "trainingstagebuch", version: 1, erstellt: new Date().toISOString(), uebungen, kraftEinheiten, vorlagen, handballEinheiten };
}

/**
 * Ersetzt alle Daten durch das Backup (in einer Transaktion: ganz oder gar nicht).
 * Was nicht im Backup ist, wird als gelöscht markiert, und das Backup gilt als neueste Änderung,
 * damit die Wiederherstellung auch auf synchronisierte Geräte übertragen wird.
 */
export async function stelleWiederHer(b: Backup) {
  await db.transaction("rw", alleTabellen(), async () => {
    const t = jetzt();
    for (const tabelle of TABELLEN) {
      const behalten = new Set((b[tabelle] as { id: Id }[]).map(x => x.id));
      const weg = ((await db[tabelle].toCollection().primaryKeys()) as Id[]).filter(id => !behalten.has(id));
      await markiereGeloescht(tabelle, weg, t);
      await db[tabelle].clear();
    }
    await db.uebungen.bulkPut(b.uebungen.map(x => stempel(x, t)));
    await db.kraftEinheiten.bulkPut(b.kraftEinheiten.map(x => stempel(x, t)));
    await db.vorlagen.bulkPut(b.vorlagen.map(x => stempel(x, t)));
    await db.handballEinheiten.bulkPut(b.handballEinheiten.map(x => stempel(x, t)));
  });
  gemeldet();
}

// ---------- Beispieldaten ----------

export async function hatBeispieldaten() {
  return (await db.uebungen.filter(u => !!u.beispiel).count()) > 0;
}

/**
 * Entfernt alle Beispieldaten. Eigene Einheiten, die Beispiel-Übungen verwenden, bleiben erhalten,
 * ebenso die Übungen, die sie brauchen (sie werden dann zu eigenen Übungen).
 */
export async function loescheBeispieldaten() {
  await db.transaction("rw", alleTabellen(), async () => {
    const t = jetzt();
    for (const tabelle of ["kraftEinheiten", "vorlagen", "handballEinheiten"] as const) {
      const ids = (await (db[tabelle] as typeof db.kraftEinheiten).filter(x => !!x.beispiel).primaryKeys()) as Id[];
      await db[tabelle].bulkDelete(ids);
      await markiereGeloescht(tabelle, ids, t);
    }
    const benutzt = new Set<Id>();
    (await db.kraftEinheiten.toArray()).forEach(e => e.eintraege.forEach(x => benutzt.add(x.uebungId)));
    (await db.vorlagen.toArray()).forEach(v => v.uebungen.forEach(x => benutzt.add(x.uebungId)));
    const beispiel = await db.uebungen.filter(u => !!u.beispiel).toArray();
    const weg = beispiel.filter(u => !benutzt.has(u.id)).map(u => u.id);
    await db.uebungen.bulkDelete(weg);
    await markiereGeloescht("uebungen", weg, t);
    await db.uebungen.bulkPut(beispiel.filter(u => benutzt.has(u.id)).map(u => stempel({ ...u, beispiel: undefined }, t)));
  });
  gemeldet();
}

/**
 * Legt die Beispieldaten an. Beim automatischen ersten Start ohne Zeitstempel: Sie bleiben dann
 * auf diesem Gerät und werden nicht an andere Geräte verteilt. Von Hand angelegt werden sie synchronisiert.
 */
export async function legeBeispieldatenAn({ automatisch = false } = {}) {
  const { erzeugeBeispieldaten } = await import("../seed/beispieldaten");
  const d = erzeugeBeispieldaten();
  const t = jetzt();
  const mit = <T extends object>(xs: T[]) => (automatisch ? xs : xs.map(x => stempel(x, t)));
  await db.transaction("rw", alleTabellen(), async () => {
    await db.uebungen.bulkPut(mit(d.uebungen));
    await db.vorlagen.bulkPut(mit(d.vorlagen));
    await db.kraftEinheiten.bulkPut(mit(d.kraftEinheiten));
    await db.handballEinheiten.bulkPut(mit(d.handballEinheiten));
  });
  if (!automatisch) gemeldet();
}
