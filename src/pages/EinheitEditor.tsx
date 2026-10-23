import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { KraftEinheit, Satz, Uebung, UebungsArt, VorlagenUebung } from "../model/types";
import { db } from "../db/schema";
import { loescheKraft, speichereKraft } from "../db/repo";
import { useKraftEinheiten, useUebungsMap } from "../db/hooks";
import { aktiveEinheit, setzeAktiveEinheit } from "../logic/aktiv";
import { formatKurz, formatTag } from "../logic/datum";
import { fmt, fmtSek, fruehereSaetze, gueltig, istRekord, letztesMal, pruefeRekord, rekordText, satzText, volumen, type Rekord } from "../logic/metriken";
import { Button, IconButton, Inhalt, Karte, Seitenkopf, ZahlFeld, eingabeKlasse } from "../components/ui";
import { Icon } from "../components/Icon";
import { UebungsAuswahl } from "../components/UebungsAuswahl";
import { UebungsFormular } from "../components/UebungsFormular";
import { useRueckmeldung } from "../components/Rueckmeldung";
import { navigiere } from "../router";

const artVon = (u?: Uebung): UebungsArt => u?.art ?? "gewicht";

export function EinheitEditor({ id }: { id: string }) {
  const [einheit, setEinheit] = useState<KraftEinheit | null | undefined>(undefined);
  const geladen = useRef(false);
  const alle = useKraftEinheiten();
  const map = useUebungsMap();
  const vorlage = useLiveQuery(async () => (einheit?.vorlageId ? (await db.vorlagen.get(einheit.vorlageId)) ?? null : null), [einheit?.vorlageId]);
  const { melde, frage } = useRueckmeldung();
  const [auswahl, setAuswahl] = useState(false);
  const [bearbeite, setBearbeite] = useState<Uebung | undefined>();
  const istAktiv = aktiveEinheit() === id;

  useEffect(() => {
    geladen.current = false;
    db.kraftEinheiten.get(id).then(e => setEinheit(e ?? null));
  }, [id]);

  // Jede Änderung wird sofort gespeichert, damit nichts verloren geht.
  useEffect(() => {
    if (!einheit) return;
    if (!geladen.current) { geladen.current = true; return; }
    speichereKraft(einheit);
  }, [einheit]);

  // Rekorde aller Sätze berechnen
  const rekorde = useMemo(() => {
    const r = new Map<string, Rekord>();
    if (!einheit || !alle || !map) return r;
    const bisher = new Map<string, Satz[]>();
    einheit.eintraege.forEach((x, i) => {
      const frueher = fruehereSaetze(alle, x.uebungId, einheit.id, einheit.datum);
      x.saetze.forEach((s, j) => {
        const vorher = bisher.get(x.uebungId) ?? [];
        r.set(`${i}-${j}`, pruefeRekord(s, frueher, vorher, artVon(map.get(x.uebungId))));
        bisher.set(x.uebungId, [...vorher, s]);
      });
    });
    return r;
  }, [einheit, alle, map]);

  // Neue Bestleistungen kurz hervorheben (mit Verzögerung, damit Zwischenstände beim Tippen nicht zählen)
  const bekannt = useRef<Set<string> | null>(null);
  const [blitz, setBlitz] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!einheit || !map || !alle) return;
    const schluessel = (k: string, r: Rekord) => {
      const [i, j] = k.split("-").map(Number);
      const s = einheit.eintraege[i]?.saetze[j];
      return s ? `${einheit.eintraege[i].uebungId}:${s.wdh}x${s.kg}x${s.sek ?? 0}:${rekordText(r)}` : k;
    };
    const jetzt = [...rekorde].filter(([, r]) => istRekord(r));
    if (bekannt.current === null) { bekannt.current = new Set(jetzt.map(([k, r]) => schluessel(k, r))); return; }
    const t = setTimeout(() => {
      const neu = jetzt.filter(([k, r]) => !bekannt.current!.has(schluessel(k, r)));
      if (!neu.length) return;
      neu.forEach(([k, r]) => bekannt.current!.add(schluessel(k, r)));
      const [k, r] = neu[neu.length - 1];
      const [i, j] = k.split("-").map(Number);
      const s = einheit.eintraege[i].saetze[j];
      const u = map.get(einheit.eintraege[i].uebungId);
      melde(`Neue Bestleistung! ${u?.name ?? ""}: ${satzText(s, artVon(u))} – ${rekordText(r, artVon(u))}`, "rekord");
      setBlitz(new Set(neu.map(([k]) => k)));
      setTimeout(() => setBlitz(new Set()), 1300);
    }, 700);
    return () => clearTimeout(t);
  }, [rekorde, einheit, map, alle, melde]);

  if (einheit === undefined || !map || !alle) return <Seitenkopf titel="Training" />;
  if (einheit === null) {
    return (
      <>
        <Seitenkopf titel="Training" zurueck={() => navigiere("/training", true)} />
        <Inhalt><p className="text-text2">Dieses Training gibt es nicht mehr.</p></Inhalt>
      </>
    );
  }

  const aendere = (f: (e: KraftEinheit) => KraftEinheit) => setEinheit(e => (e ? f(e) : e));
  const setzeSaetze = (i: number, saetze: Satz[]) =>
    aendere(e => ({ ...e, eintraege: e.eintraege.map((x, k) => (k === i ? { ...x, saetze } : x)) }));

  const satzHinzufuegen = (i: number) => {
    const x = einheit.eintraege[i];
    const letzter = x.saetze[x.saetze.length - 1];
    const vorher = letztesMal(alle, x.uebungId, einheit.id, einheit.datum);
    const ziel = vorlage?.uebungen.find(v => v.uebungId === x.uebungId);
    const art = artVon(map.get(x.uebungId));
    const leer: Satz = art === "zeit" ? { wdh: 0, kg: 0, sek: ziel?.zielSek ?? 30 } : { wdh: ziel?.zielWdh ?? (art === "koerpergewicht" ? 10 : 8), kg: 0 };
    const vorschlag: Satz = letzter ? { ...letzter } : vorher?.saetze[0] ? { ...vorher.saetze[0] } : leer;
    setzeSaetze(i, [...x.saetze, vorschlag]);
  };

  const verschiebe = (i: number, d: number) => aendere(e => {
    const u = [...e.eintraege];
    [u[i], u[i + d]] = [u[i + d], u[i]];
    return { ...e, eintraege: u };
  });

  const entferneUebung = async (i: number) => {
    const x = einheit.eintraege[i];
    if (x.saetze.length && !(await frage({ titel: `${map.get(x.uebungId)?.name ?? "Übung"} entfernen?`, text: `${x.saetze.length} Sätze gehen verloren.`, ja: "Entfernen", gefahr: true }))) return;
    aendere(e => ({ ...e, eintraege: e.eintraege.filter((_, k) => k !== i) }));
  };

  const beenden = async () => {
    const bereinigt: KraftEinheit = {
      ...einheit,
      eintraege: einheit.eintraege.map(x => ({ ...x, saetze: x.saetze.filter(gueltig) })).filter(x => x.saetze.length),
    };
    if (!bereinigt.eintraege.length) {
      if (!(await frage({ titel: "Keine Sätze eingetragen", text: "Das leere Training wird verworfen.", ja: "Verwerfen" }))) return;
      await loescheKraft(einheit.id);
      setzeAktiveEinheit(null);
      navigiere("/training", true);
      return;
    }
    geladen.current = false; // nicht doppelt speichern
    await speichereKraft(bereinigt);
    if (istAktiv) setzeAktiveEinheit(null);
    const saetze = bereinigt.eintraege.reduce((s, x) => s + x.saetze.length, 0);
    const vol = volumen(bereinigt.eintraege.flatMap(x => x.saetze));
    melde(`Gespeichert: ${saetze} ${saetze === 1 ? "Satz" : "Sätze"}${vol > 0 ? `, ${fmt(vol)} kg Volumen` : ""}`);
    navigiere(istAktiv ? "/training" : "/verlauf", true);
  };

  const loeschen = async () => {
    if (!(await frage({ titel: "Training löschen?", text: `${formatTag(einheit.datum)} – das lässt sich nicht rückgängig machen.`, ja: "Löschen", gefahr: true }))) return;
    await loescheKraft(einheit.id);
    if (istAktiv) setzeAktiveEinheit(null);
    melde("Training gelöscht");
    navigiere(istAktiv ? "/training" : "/verlauf", true);
  };

  return (
    <>
      <Seitenkopf titel={vorlage?.name ?? "Krafttraining"} zurueck={() => history.length > 1 ? history.back() : navigiere("/training")}
        rechts={<IconButton icon="loeschen" label="Training löschen" onClick={loeschen} />} />
      <Inhalt>
        <div className="flex gap-2 items-center">
          <input type="date" aria-label="Datum" className={`${eingabeKlasse} flex-1`} value={einheit.datum}
            onChange={e => e.target.value && aendere(x => ({ ...x, datum: e.target.value }))} />
        </div>

        {einheit.eintraege.map((x, i) => (
          <UebungsKarte key={`${x.uebungId}-${i}`} index={i} anzahl={einheit.eintraege.length}
            uebung={map.get(x.uebungId)} saetze={x.saetze}
            ziel={vorlage?.uebungen.find(v => v.uebungId === x.uebungId)}
            vorher={letztesMal(alle, x.uebungId, einheit.id, einheit.datum)}
            rekorde={rekorde} blitz={blitz}
            onSaetze={s => setzeSaetze(i, s)} onHinzu={() => satzHinzufuegen(i)}
            onHoch={() => verschiebe(i, -1)} onRunter={() => verschiebe(i, 1)} onEntfernen={() => entferneUebung(i)}
            onBearbeiten={() => setBearbeite(map.get(x.uebungId))} />
        ))}

        <Button className="w-full !min-h-14" onClick={() => setAuswahl(true)}><Icon name="plus" /> Übung hinzufügen</Button>

        <textarea className={`${eingabeKlasse} py-2`} rows={2} placeholder="Notiz zum Training (optional)" value={einheit.notiz ?? ""}
          onChange={e => aendere(x => ({ ...x, notiz: e.target.value || undefined }))} />

        <Button variante="primaer" className="w-full !min-h-14 text-lg" onClick={beenden}>
          <Icon name="haken" /> {istAktiv ? "Training beenden" : "Fertig"}
        </Button>
      </Inhalt>
      <UebungsAuswahl offen={auswahl} onClose={() => setAuswahl(false)} schonDrin={einheit.eintraege.map(x => x.uebungId)}
        onWahl={u => aendere(e => ({ ...e, eintraege: [...e.eintraege, { uebungId: u.id, saetze: [] }] }))} />
      <UebungsFormular offen={!!bearbeite} uebung={bearbeite} onClose={() => setBearbeite(undefined)} onGespeichert={() => melde("Übung gespeichert")} />
    </>
  );
}

function UebungsKarte({ index, anzahl, uebung, saetze, ziel, vorher, rekorde, blitz, onSaetze, onHinzu, onHoch, onRunter, onEntfernen, onBearbeiten }: {
  index: number; anzahl: number; uebung?: Uebung; saetze: Satz[]; ziel?: VorlagenUebung;
  vorher?: { datum: string; saetze: Satz[] }; rekorde: Map<string, Rekord>; blitz: Set<string>;
  onSaetze: (s: Satz[]) => void; onHinzu: () => void; onHoch: () => void; onRunter: () => void; onEntfernen: () => void; onBearbeiten: () => void;
}) {
  const art = artVon(uebung);
  const setze = (j: number, teil: Partial<Satz>) => onSaetze(saetze.map((s, k) => (k === j ? { ...s, ...teil } : s)));
  const zielText = ziel && (ziel.zielSaetze || ziel.zielWdh || ziel.zielSek)
    ? `${ziel.zielSaetze ?? "–"} Sätze × ${art === "zeit" ? (ziel.zielSek ? fmtSek(ziel.zielSek) : "–") : `${ziel.zielWdh ?? "–"} Wdh.`}`
    : null;
  return (
    <Karte className="!p-0 overflow-hidden">
      <div className="flex items-start gap-1 px-4 pt-3 pb-2">
        <button type="button" onClick={onBearbeiten} disabled={!uebung} className="flex-1 min-w-0 text-left min-h-10 group" aria-label={`${uebung?.name ?? "Übung"} bearbeiten`}>
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-base leading-tight">{uebung?.name ?? "Gelöschte Übung"}</span>
            {uebung && <Icon name="stift" className="size-3.5 text-muted shrink-0" />}
          </span>
          <span className="block text-xs text-muted">
            {uebung?.kategorie}{art !== "gewicht" && ` · ${art === "zeit" ? "Zeit" : "Körpergewicht"}`}{uebung?.notiz && ` · ${uebung.notiz}`}
          </span>
        </button>
        <IconButton icon="hoch" label="Nach oben" disabled={index === 0} onClick={onHoch} className="disabled:opacity-30 !size-10" />
        <IconButton icon="runter" label="Nach unten" disabled={index === anzahl - 1} onClick={onRunter} className="disabled:opacity-30 !size-10" />
        <IconButton icon="x" label="Übung entfernen" onClick={onEntfernen} className="!size-10" />
      </div>

      <dl className="border-y border-linie bg-karte2/50 px-4 py-2 text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-muted">Letztes Mal</dt>
        <dd className="tabular">{vorher ? <><span className="text-muted">{formatKurz(vorher.datum)} · </span>{vorher.saetze.map(x => satzText(x, art)).join(" · ")}</> : <span className="text-muted">noch keine Einträge</span>}</dd>
        {zielText && <><dt className="text-muted">Ziel</dt><dd>{zielText}</dd></>}
      </dl>

      <div className="px-4 py-3 space-y-2">
        {saetze.length > 0 && (
          <>
            <div className="flex text-[11px] uppercase tracking-wider text-muted gap-1.5">
              <span className="w-5">#</span>
              <span className="flex-1 text-center">{art === "zeit" ? "Sekunden" : "Wdh."}</span>
              <span className="flex-[1.25] text-center">{art === "gewicht" ? "Gewicht (kg)" : "Zusatz (kg)"}</span>
              <span className="w-8" />
            </div>
            {saetze.map((s, j) => {
              const r = rekorde.get(`${index}-${j}`);
              const pr = istRekord(r);
              return (
                <div key={j} className={`${pr ? "border-l-2 border-rekord pl-2 -ml-2.5" : ""} ${blitz.has(`${index}-${j}`) ? "rekord-blitz" : ""}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 text-center text-sm text-muted tabular">{j + 1}</span>
                    {art === "zeit"
                      ? <ZahlFeld label={`Satz ${j + 1} Sekunden`} wert={s.sek ?? 0} schritt={5} onChange={n => setze(j, { sek: Math.round(n), wdh: 0 })} />
                      : <ZahlFeld label={`Satz ${j + 1} Wiederholungen`} wert={s.wdh} schritt={1} onChange={n => setze(j, { wdh: Math.round(n) })} />}
                    <ZahlFeld label={`Satz ${j + 1} ${art === "gewicht" ? "Gewicht" : "Zusatzgewicht"}`} wert={s.kg} schritt={art === "gewicht" ? 2.5 : 1.25} dezimal
                      onChange={n => setze(j, { kg: n })} className="flex-[1.25]" />
                    <IconButton icon="x" label={`Satz ${j + 1} löschen`} className="!size-10 !w-8" onClick={() => onSaetze(saetze.filter((_, k) => k !== j))} />
                  </div>
                  {pr && r && (
                    <p className="text-xs font-medium text-rekord flex items-center gap-1 pl-7 pt-1">
                      <Icon name="pokal" className="size-3.5" /> Neue Bestleistung · {rekordText(r, art)}
                    </p>
                  )}
                </div>
              );
            })}
          </>
        )}
        <Button variante="leise" className="w-full border border-dashed border-akzent/40" onClick={onHinzu}><Icon name="plus" /> Satz hinzufügen</Button>
      </div>
    </Karte>
  );
}
