// Datenmodell der App. Datumswerte sind lokale Kalendertage im Format JJJJ-MM-TT.

export type Id = string;

/** Wie eine Übung gemessen wird. Fehlt das Feld, ist es eine Gewichtsübung. */
export type UebungsArt = "gewicht" | "koerpergewicht" | "zeit";
export const UEBUNGSARTEN: { wert: UebungsArt; label: string; text: string }[] = [
  { wert: "gewicht", label: "Gewicht", text: "Wiederholungen × Gewicht, z. B. Bankdrücken" },
  { wert: "koerpergewicht", label: "Körpergewicht", text: "Wiederholungen, optional mit Zusatzgewicht, z. B. Klimmzüge, Dips" },
  { wert: "zeit", label: "Zeit", text: "Dauer in Sekunden, optional mit Zusatzgewicht, z. B. Plank" },
];

export interface Uebung {
  id: Id;
  name: string;
  kategorie: string;
  art?: UebungsArt;
  notiz?: string;
  beispiel?: boolean;
  /** Zeitpunkt der letzten Änderung (ms), für die Synchronisierung. Fehlt bei unveränderten Beispieldaten. */
  geaendert?: number;
}

/**
 * Ein Satz. Bei Körpergewicht- und Zeitübungen ist `kg` das Zusatzgewicht (0 = ohne).
 * Bei Zeitübungen steht die Dauer in `sek`, `wdh` ist dann 0.
 */
export interface Satz {
  wdh: number;
  kg: number;
  sek?: number;
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
  /** Startzeitpunkt (ms), um die Dauer beim Beenden vorzuschlagen */
  gestartet?: number;
  /** Dauer in Minuten und Anstrengung (RPE 1–10), für die Belastung (Session-RPE) */
  dauerMin?: number;
  rpe?: number;
  eintraege: UebungsEintrag[];
  beispiel?: boolean;
  /** Zeitpunkt der letzten Änderung (ms), für die Synchronisierung. Fehlt bei unveränderten Beispieldaten. */
  geaendert?: number;
}

export interface VorlagenUebung {
  uebungId: Id;
  zielSaetze?: number;
  zielWdh?: number;
  /** Bei Zeitübungen: Ziel-Dauer pro Satz in Sekunden */
  zielSek?: number;
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
