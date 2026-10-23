// Datenmodell der App. Datumswerte sind lokale Kalendertage im Format JJJJ-MM-TT.

export type Id = string;

export interface Uebung {
  id: Id;
  name: string;
  kategorie: string;
  notiz?: string;
  beispiel?: boolean;
  /** Zeitpunkt der letzten Änderung (ms), für die Synchronisierung. Fehlt bei unveränderten Beispieldaten. */
  geaendert?: number;
}

export interface Satz {
  wdh: number;
  kg: number;
}

export interface UebungsEintrag {
  uebungId: Id;
  saetze: Satz[];
}

export interface KraftEinheit {
  id: Id;
  datum: string;
  vorlageId?: Id;
  notiz?: string;
  eintraege: UebungsEintrag[];
  beispiel?: boolean;
  /** Zeitpunkt der letzten Änderung (ms), für die Synchronisierung. Fehlt bei unveränderten Beispieldaten. */
  geaendert?: number;
}

export interface VorlagenUebung {
  uebungId: Id;
  zielSaetze?: number;
  zielWdh?: number;
}

export interface Vorlage {
  id: Id;
  name: string;
  uebungen: VorlagenUebung[];
  beispiel?: boolean;
  /** Zeitpunkt der letzten Änderung (ms), für die Synchronisierung. Fehlt bei unveränderten Beispieldaten. */
  geaendert?: number;
}

export type HandballArt = "Training" | "Spiel";

export interface HandballEinheit {
  id: Id;
  datum: string;
  art: HandballArt;
  dauerMin: number;
  rpe: number;
  notiz?: string;
  beispiel?: boolean;
  /** Zeitpunkt der letzten Änderung (ms), für die Synchronisierung. Fehlt bei unveränderten Beispieldaten. */
  geaendert?: number;
}

export const KATEGORIEN = [
  "Brust",
  "Rücken",
  "Schultern",
  "Beine",
  "Gesäß",
  "Bizeps",
  "Trizeps",
  "Core",
  "Ganzkörper",
  "Sonstiges",
] as const;

/** Inhalt eines vollständigen Backups. */
export interface Backup {
  app: "trainingstagebuch";
  version: 1;
  erstellt: string;
  uebungen: Uebung[];
  kraftEinheiten: KraftEinheit[];
  vorlagen: Vorlage[];
  handballEinheiten: HandballEinheit[];
}

export type Tabelle = "uebungen" | "kraftEinheiten" | "vorlagen" | "handballEinheiten";
export const TABELLEN: Tabelle[] = ["uebungen", "kraftEinheiten", "vorlagen", "handballEinheiten"];

/** Merkt sich eine Löschung, damit der Eintrag auf anderen Geräten nicht wieder auftaucht. */
export interface Loeschmarke {
  id: Id;
  tabelle: Tabelle;
  zeit: number;
}

/** Gesamter Datenstand eines Geräts, wie er synchronisiert wird. */
export interface Stand {
  uebungen: Uebung[];
  kraftEinheiten: KraftEinheit[];
  vorlagen: Vorlage[];
  handballEinheiten: HandballEinheit[];
  geloescht: Loeschmarke[];
}
