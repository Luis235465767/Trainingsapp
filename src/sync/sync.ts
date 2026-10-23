// Synchronisierung über ein privates GitHub-Gist.
//
// Jedes Gerät schreibt nur seine eigene Datei „geraet-<Kennung>.json“ mit seinem ganzen Stand und
// liest beim Abgleich alle Dateien. So kann kein Gerät die Änderungen eines anderen überschreiben.
// Zusammengeführt wird pro Eintrag nach der jüngsten Änderung (siehe logic/zusammenfuehren.ts).
// Lokal ist immer zuerst gespeichert; die Synchronisierung ist eine zusätzliche Kopie.
import type { Stand } from "../model/types";
import { fuehreZusammen, pruefeStand, zumHochladen } from "../logic/zusammenfuehren";
import { gistApi, SyncFehler, type FetchFn } from "./gist";

export type SyncZustand = "aus" | "laeuft" | "ok" | "fehler";
export interface SyncStatus {
  zustand: SyncZustand;
  text: string;
  zuletzt: number | null;
  tokenFehler: boolean;
}

export interface Konfig {
  lies: (k: string) => string | null;
  schreib: (k: string, v: string | null) => void;
}

const VERZOEGERUNG = 3000;
const WIEDERHOLUNG = [5000, 15000, 60000, 300000];
const KEEPALIVE_GRENZE = 60000; // Browser erlauben bei keepalive höchstens 64 KB
const K = { token: "trainingstagebuch.sync.token", gist: "trainingstagebuch.sync.gist", geraet: "trainingstagebuch.geraet" };

const zufallsId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, "0")).join("");
const uhr = (ms: number) => new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

export function erzeugeSync({ holeStand, uebernimm, konfig, fetchFn = (u, i) => fetch(u, i), jetzt = Date.now, timer = { setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) as unknown as number, clearTimeout: (id: number | null) => { if (id !== null) clearTimeout(id); } } }: {
  holeStand: () => Promise<Stand>;
  /** Fremden Stand lokal einarbeiten; gibt die Zahl der Änderungen zurück. */
  uebernimm: (fremd: Stand) => Promise<number>;
  konfig: Konfig;
  fetchFn?: FetchFn;
  jetzt?: () => number;
  timer?: { setTimeout: (f: () => void, ms: number) => number; clearTimeout: (id: number | null) => void };
}) {
  let token = konfig.lies(K.token);
  let gistId = konfig.lies(K.gist);
  let geraet = konfig.lies(K.geraet);
  if (!geraet) { geraet = zufallsId(); konfig.schreib(K.geraet, geraet); }
  const dateiname = `geraet-${geraet}.json`;

  let laeuft: Promise<void> | null = null, nochmal = false;
  let verzoegert: number | null = null, wiederholung: number | null = null, versuche = 0;
  let zuletztGeschrieben: string | null = null;
  let ungesichert = false;
  const beobachter = new Set<(s: SyncStatus) => void>();
  let status: SyncStatus = { zustand: "aus", text: "", zuletzt: null, tokenFehler: false };

  const verbunden = () => !!(token && gistId);
  const setze = (s: Partial<SyncStatus>) => {
    status = { ...status, ...s };
    beobachter.forEach(f => f(status));
  };

  const dateiInhalt = async () => JSON.stringify({ app: "trainingstagebuch", version: 1, geraet, stand: zumHochladen(await holeStand()) });

  async function abgleichen() {
    const api = gistApi(token!, fetchFn);
    const dateien = await api.ladeDateien(gistId!);
    const fremde: Stand[] = [];
    let unlesbar = 0;
    for (const [name, text] of Object.entries(dateien)) {
      if (name === dateiname && text === zuletztGeschrieben) continue; // eigene, unveränderte Datei
      let daten: unknown;
      try { daten = JSON.parse(text); } catch { unlesbar++; continue; }
      const r = pruefeStand(daten); // gültige Einträge einer teilweise defekten Datei trotzdem nutzen
      if (!r) { unlesbar++; continue; }
      fremde.push(r.stand);
    }
    if (fremde.length) await uebernimm(fuehreZusammen(...fremde));
    const inhalt = await dateiInhalt();
    if (dateien[dateiname] !== inhalt) await api.schreibeDatei(gistId!, dateiname, inhalt);
    zuletztGeschrieben = inhalt;
    ungesichert = false;
    return unlesbar;
  }

  async function synchronisiere(): Promise<void> {
    if (!verbunden()) return;
    if (laeuft) { nochmal = true; return laeuft; }
    timer.clearTimeout(verzoegert); verzoegert = null;
    timer.clearTimeout(wiederholung); wiederholung = null;
    setze({ zustand: "laeuft", text: "Synchronisiere …" });
    laeuft = (async () => {
      try {
        const unlesbar = await abgleichen();
        versuche = 0;
        const t = jetzt();
        setze({ zustand: "ok", zuletzt: t, tokenFehler: false,
          text: `Synchronisiert um ${uhr(t)} Uhr` + (unlesbar ? ` (${unlesbar} Datei im Gist unlesbar)` : "") });
      } catch (e) {
        const art = e instanceof SyncFehler ? e.art : "api";
        const text = e instanceof SyncFehler ? e.message : "unerwarteter Fehler";
        if (art === "token") {
          setze({ zustand: "fehler", tokenFehler: true, text: `Nicht synchronisiert: ${text}. Bitte neu verbinden.` });
        } else {
          const warte = WIEDERHOLUNG[Math.min(versuche++, WIEDERHOLUNG.length - 1)];
          setze({ zustand: "fehler", tokenFehler: false,
            text: art === "netz" ? "Offline – auf diesem Gerät ist alles gespeichert, wird später synchronisiert." : `Nicht synchronisiert: ${text}. Neuer Versuch läuft.` });
          wiederholung = timer.setTimeout(() => { void synchronisiere(); }, warte);
        }
      } finally {
        laeuft = null;
      }
      if (nochmal) { nochmal = false; await synchronisiere(); }
    })();
    return laeuft;
  }

  if (verbunden()) setze({ zustand: "ok", text: "Verbunden" });

  return {
    verbunden,
    geraet: () => geraet!,
    status: () => status,
    abonniere(f: (s: SyncStatus) => void) { beobachter.add(f); return () => { beobachter.delete(f); }; },
    start() { return verbunden() ? synchronisiere() : Promise.resolve(); },
    synchronisiere,
    /** Nach jeder lokalen Änderung: kurz warten, damit schnelle Eingaben gebündelt werden. */
    geaendert() {
      if (!verbunden()) return;
      ungesichert = true;
      timer.clearTimeout(verzoegert);
      verzoegert = timer.setTimeout(() => { void synchronisiere(); }, VERZOEGERUNG);
    },
    /** Beim Schließen oder Wechsel der App: eigene Datei sofort schreiben, ohne auf eine Antwort zu warten. */
    async sofort() {
      if (!verbunden() || !ungesichert || laeuft) return;
      const inhalt = await dateiInhalt();
      if (inhalt === zuletztGeschrieben) return;
      timer.clearTimeout(verzoegert); verzoegert = null;
      gistApi(token!, fetchFn).schreibeDatei(gistId!, dateiname, inhalt, inhalt.length < KEEPALIVE_GRENZE)
        .then(() => { zuletztGeschrieben = inhalt; ungesichert = false; })
        .catch(() => { /* beim nächsten Öffnen wird erneut abgeglichen */ });
    },
    /** Token prüfen, vorhandenes Gist suchen oder anlegen, dann abgleichen. */
    async verbinde(neuesToken: string) {
      const t = neuesToken.trim();
      const api = gistApi(t, fetchFn);
      let id = await api.findeGist();
      if (!id) id = await api.erstelleGist(dateiname, await dateiInhalt());
      token = t; gistId = id;
      konfig.schreib(K.token, token);
      konfig.schreib(K.gist, gistId);
      zuletztGeschrieben = null;
      await synchronisiere();
      if (status.zustand === "fehler") throw new SyncFehler(status.text, status.tokenFehler ? "token" : "netz");
    },
    /** Entfernt Token und Gist-Verknüpfung nur auf diesem Gerät; Daten und Gist bleiben erhalten. */
    trenne() {
      token = gistId = null;
      konfig.schreib(K.token, null);
      konfig.schreib(K.gist, null);
      timer.clearTimeout(verzoegert); timer.clearTimeout(wiederholung);
      setze({ zustand: "aus", text: "", zuletzt: null, tokenFehler: false });
    },
    gistUrl: () => (gistId ? `https://gist.github.com/${gistId}` : null),
  };
}

export type Sync = ReturnType<typeof erzeugeSync>;
