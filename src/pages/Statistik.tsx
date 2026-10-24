import { useMemo, useState } from "react";
import { useHandballEinheiten, useKraftEinheiten, useUebungen, useUebungsMap } from "../db/hooks";
import { formatKurz, formatMittel, heute, plusTage, tageZwischen, wochenStart } from "../logic/datum";
import { bestleistungen, fmt, fmtSek, kalender, runde, satzText, sessionRpe, verlauf, wochenBelastung, wochenVolumen, type Bestleistung, type VerlaufsPunkt } from "../logic/metriken";
import type { Satz, UebungsArt } from "../model/types";
import { Abschnitt, Inhalt, Karte, Leer, Segmente, Seitenkopf, eingabeKlasse } from "../components/ui";
import { BeispielHinweis } from "../components/BeispielHinweis";
import { VerlaufChart, type Punkt } from "../charts/VerlaufChart";
import { WochenChart } from "../charts/WochenChart";
import { Kalender } from "../charts/Kalender";
import { Legende } from "../charts/ChartTooltip";
import { useFarben } from "../charts/farben";
import { empfehlung, tageslasten, wochenGesamt } from "../logic/belastung";

type Zeitraum = "12" | "26" | "52" | "alle";

/** Markiert Punkte, die den bisherigen Bestwert übertreffen (ab dem zweiten Punkt). */
function mitRekorden(punkte: VerlaufsPunkt[], wert: (p: VerlaufsPunkt) => number, info: (p: VerlaufsPunkt) => string): Punkt[] {
  let best = -Infinity;
  return punkte.map((p, i) => {
    const w = wert(p);
    const rekord = i > 0 && w > best + 1e-9;
    best = Math.max(best, w);
    return { datum: p.datum, wert: Math.round(w * 10) / 10, info: info(p), rekord };
  });
}

function Kachel({ titel, wert, unter }: { titel: string; wert: string; unter?: string }) {
  return (
    <Karte className="!p-3">
      <p className="text-xs text-text2">{titel}</p>
      <p className="text-xl font-semibold leading-tight">{wert}</p>
      {unter && <p className="text-xs text-muted">{unter}</p>}
    </Karte>
  );
}

const zusatz = (kg: number) => (kg > 0 ? ` (+${fmt(kg)} kg)` : "");

interface Kurve { titel: string; untertitel: string; einheit: string; hinweis?: string; wert: (p: VerlaufsPunkt) => number; info: (p: VerlaufsPunkt) => string }
interface Ansicht {
  kacheln: { titel: string; wert: string; unter?: string }[];
  kurven: Kurve[];
  woche: { titel: string; untertitel: string; label: string; einheit: string; wert: (s: Satz) => number };
}

/** Kennzahlen und Kurven je nach Übungsart. */
function ansichtFuer(art: UebungsArt, punkte: VerlaufsPunkt[], b: Bestleistung): Ansicht {
  const maxProEinheit = (f: (p: VerlaufsPunkt) => number) => punkte.reduce<VerlaufsPunkt | null>((m, p) => (!m || f(p) > f(m) ? p : m), null);
  if (art === "koerpergewicht") {
    const mitZusatz = punkte.some(p => p.maxKg > 0);
    const summe = maxProEinheit(p => p.summeWdh);
    return {
      kacheln: [
        { titel: "Meiste Wdh. (Satz)", wert: b.maxWdh ? `${b.maxWdh.wdh}` : "–", unter: b.maxWdh && `${zusatz(b.maxWdh.kg).trim() || "ohne Zusatz"} · ${formatKurz(b.maxWdh.datum)}` },
        { titel: "Höchstes Zusatzgewicht", wert: b.maxKg && b.maxKg.kg > 0 ? `${fmt(b.maxKg.kg)} kg` : "–", unter: b.maxKg && b.maxKg.kg > 0 ? `${b.maxKg.wdh} Wdh. · ${formatKurz(b.maxKg.datum)}` : undefined },
        { titel: "Meiste Wdh. (Einheit)", wert: summe ? `${summe.summeWdh}` : "–", unter: summe ? formatKurz(summe.datum) : undefined },
      ],
      kurven: [
        { titel: "Wiederholungen", untertitel: "bester Satz pro Einheit", einheit: "Wdh.", wert: p => p.maxWdh, info: p => `Wdh. gesamt: ${p.summeWdh}` },
        mitZusatz
          ? { titel: "Zusatzgewicht", untertitel: "schwerster Satz pro Einheit", einheit: "kg", wert: p => p.maxKg, info: p => `${p.wdhBeiMax} Wdh. mit +${fmt(p.maxKg)} kg` }
          : { titel: "Wiederholungen gesamt", untertitel: "pro Einheit", einheit: "Wdh.", wert: p => p.summeWdh, info: p => `Bester Satz: ${p.maxWdh} Wdh.` },
      ],
      woche: { titel: "Wiederholungen pro Woche", untertitel: "Summe aller Sätze", label: "Wiederholungen", einheit: "Wdh.", wert: s => s.wdh },
    };
  }
  if (art === "zeit") {
    const summe = maxProEinheit(p => p.summeSek);
    return {
      kacheln: [
        { titel: "Längste Dauer", wert: b.maxSek ? fmtSek(b.maxSek.sek) : "–", unter: b.maxSek && `${zusatz(b.maxSek.kg).trim() || "ohne Zusatz"} · ${formatKurz(b.maxSek.datum)}` },
        { titel: "Höchstes Zusatzgewicht", wert: b.maxKg && b.maxKg.kg > 0 ? `${fmt(b.maxKg.kg)} kg` : "–", unter: b.maxKg && b.maxKg.kg > 0 ? formatKurz(b.maxKg.datum) : undefined },
        { titel: "Längste Gesamtdauer", wert: summe ? fmtSek(summe.summeSek) : "–", unter: summe ? formatKurz(summe.datum) : undefined },
      ],
      kurven: [
        { titel: "Dauer", untertitel: "längster Satz pro Einheit", einheit: "s", wert: p => p.maxSek, info: p => `Gesamt: ${fmtSek(p.summeSek)}` },
        { titel: "Gesamtdauer", untertitel: "pro Einheit", einheit: "s", wert: p => p.summeSek, info: p => `Längster Satz: ${fmtSek(p.maxSek)}` },
      ],
      woche: { titel: "Dauer pro Woche", untertitel: "Summe aller Sätze", label: "Dauer", einheit: "s", wert: s => s.sek ?? 0 },
    };
  }
  return {
    kacheln: [
      { titel: "Schwerster Satz", wert: b.maxKg ? `${fmt(b.maxKg.kg)} kg` : "–", unter: b.maxKg && `${b.maxKg.wdh} Wdh. · ${formatKurz(b.maxKg.datum)}` },
      { titel: "Bestes 1RM (geschätzt)", wert: b.e1rm ? `${fmt(runde(b.e1rm.wert))} kg` : "–", unter: b.e1rm && `${b.e1rm.wdh} × ${fmt(b.e1rm.kg)} kg · ${formatKurz(b.e1rm.datum)}` },
      { titel: "Bestes Volumen", wert: b.volumen ? `${fmt(b.volumen.wert)} kg` : "–", unter: b.volumen && formatKurz(b.volumen.datum) },
    ],
    kurven: [
      { titel: "Gewichtsverlauf", untertitel: "schwerster Satz pro Einheit", einheit: "kg", wert: p => p.maxKg, info: p => `Schwerster Satz: ${p.wdhBeiMax} × ${fmt(p.maxKg)} kg` },
      { titel: "Geschätztes 1RM", untertitel: "Epley", einheit: "kg", hinweis: "Gewicht × (1 + Wdh./30), bester Satz pro Einheit.", wert: p => p.e1rm, info: p => `Volumen ${fmt(p.volumen)} kg` },
    ],
    woche: { titel: "Wochenvolumen", untertitel: "Wdh. × Gewicht", label: "Volumen", einheit: "kg", wert: s => s.wdh * s.kg },
  };
}

function besterSatz(art: UebungsArt | undefined, b: Bestleistung) {
  if (art === "koerpergewicht") return b.maxWdh ? satzText({ wdh: b.maxWdh.wdh, kg: b.maxWdh.kg }, art) : "–";
  if (art === "zeit") return b.maxSek ? satzText({ wdh: 0, kg: b.maxSek.kg, sek: b.maxSek.sek }, art) : "–";
  return b.maxKg ? `${b.maxKg.wdh} × ${fmt(b.maxKg.kg)} kg` : "–";
}
function besterSatzDatum(art: UebungsArt | undefined, b: Bestleistung) {
  const d = art === "koerpergewicht" ? b.maxWdh?.datum : art === "zeit" ? b.maxSek?.datum : b.maxKg?.datum;
  return d ? formatMittel(d) : "";
}

export default function Statistik() {
  const kraft = useKraftEinheiten();
  const handball = useHandballEinheiten();
  const uebungen = useUebungen();
  const map = useUebungsMap();
  const f = useFarben();
  const [zeitraum, setZeitraum] = useState<Zeitraum>("12");
  const [gewaehlteUebung, setUebung] = useState<string>("");
  const [volumenFilter, setVolumenFilter] = useState<"gesamt" | "uebung">("gesamt");

  // Übungen nach Häufigkeit, die meistgenutzte ist vorausgewählt
  const haeufig = useMemo(() => {
    const n = new Map<string, number>();
    kraft?.forEach(e => new Set(e.eintraege.filter(x => x.saetze.length).map(x => x.uebungId)).forEach(id => n.set(id, (n.get(id) ?? 0) + 1)));
    return n;
  }, [kraft]);

  if (!kraft || !handball || !uebungen || !map) return <Seitenkopf titel="Statistik" />;

  const h = heute();
  const erstes = [...kraft, ...handball].reduce((m, e) => (e.datum < m ? e.datum : m), h);
  const wochen = zeitraum === "alle" ? Math.max(1, tageZwischen(wochenStart(erstes), wochenStart(h)) / 7 + 1) : Number(zeitraum);
  const von = wochenStart(plusTage(h, -7 * (wochen - 1)));

  const mitDaten = uebungen.filter(u => haeufig.has(u.id)).sort((a, b) => (haeufig.get(b.id) ?? 0) - (haeufig.get(a.id) ?? 0));
  const uebungId = gewaehlteUebung && haeufig.has(gewaehlteUebung) ? gewaehlteUebung : mitDaten[0]?.id ?? "";
  const uebung = map.get(uebungId);

  const kraftImZeitraum = kraft.filter(e => e.datum >= von);
  const punkte = verlauf(kraft, uebungId); // Rekorde über die ganze Historie bestimmen, dann zuschneiden
  const art: UebungsArt = uebung?.art ?? "gewicht";
  const best = bestleistungen(kraft, uebungId);
  const ansicht = ansichtFuer(art, punkte, best);
  const kurven = ansicht.kurven.map(k => ({ ...k, daten: mitRekorden(punkte, k.wert, k.info).filter(p => p.datum >= von) }));

  const proUebung = volumenFilter === "uebung";
  const volumen = wochenVolumen(kraft, proUebung ? uebungId : null, h, wochen, proUebung ? ansicht.woche.wert : undefined).map(w => ({ ...w }));
  const wocheEinheit = proUebung ? ansicht.woche.einheit : "kg";
  const belastung = wochenBelastung(handball, h, wochen).map(w => ({ ...w }));
  const hbImZeitraum = handball.filter(x => x.datum >= von);
  const schnittLast = belastung.reduce((s, w) => s + w.gesamt, 0) / belastung.length;
  const dieseWoche = belastung.at(-1)?.gesamt ?? 0;

  const lasten = tageslasten(kraft, handball);
  const gesamt = wochenGesamt(lasten, h, wochen).map(w => ({ ...w }));
  const emp = empfehlung(lasten, h);
  const schnittGesamt = gesamt.reduce((a, w) => a + w.gesamt, 0) / gesamt.length;
  const geschaetzt = kraftImZeitraum.filter(e => !(e.dauerMin && e.rpe)).length;

  const tage = kalender(kraftImZeitraum, hbImZeitraum);
  const details = (tag: string) => [
    ...kraft.filter(e => e.datum === tag).map(e => `Kraft: ${e.eintraege.map(x => map.get(x.uebungId)?.name ?? "?").join(", ")}`),
    ...handball.filter(x => x.datum === tag).map(x => `Handball ${x.art}: ${x.dauerMin} min, RPE ${x.rpe} (Belastung ${fmt(sessionRpe(x))})`),
  ];

  const alleBest = mitDaten.map(u => ({ u, b: bestleistungen(kraft, u.id) }));

  return (
    <>
      <Seitenkopf titel="Statistik" />
      <Inhalt>
        <BeispielHinweis />
        <Segmente label="Zeitraum" wert={zeitraum} onChange={setZeitraum}
          werte={[{ wert: "12", label: "12 Wo." }, { wert: "26", label: "6 Mon." }, { wert: "52", label: "1 Jahr" }, { wert: "alle", label: "Alles" }]} />

        {!kraft.length && !handball.length && <Leer titel="Noch keine Daten" text="Sobald du Einheiten einträgst, erscheinen hier deine Diagramme." />}

        {mitDaten.length > 0 && (
          <Abschnitt titel="Krafttraining">
            <select aria-label="Übung wählen" className={eingabeKlasse} value={uebungId} onChange={e => setUebung(e.target.value)}>
              {mitDaten.map(u => <option key={u.id} value={u.id}>{u.name} ({haeufig.get(u.id)}×){u.art === "zeit" ? " · Zeit" : u.art === "koerpergewicht" ? " · Körpergewicht" : ""}</option>)}
            </select>

            <div className="grid grid-cols-2 gap-2">
              {ansicht.kacheln.map(k => <Kachel key={k.titel} {...k} />)}
              <Kachel titel="Einheiten gesamt" wert={String(best.einheiten)} />
            </div>

            {kurven.map((k, i) => (
              <Karte key={k.titel} className="space-y-2">
                <h3 className="font-semibold">{k.titel} <span className="font-normal text-text2">· {k.untertitel}</span></h3>
                <VerlaufChart daten={k.daten} label={`${k.titel} ${uebung?.name ?? ""}`} einheit={k.einheit} />
                {i === 0
                  ? <Legende eintraege={[{ farbe: f.kraft, label: k.titel, form: "linie" }, { farbe: f.rekord, label: "Neue Bestleistung" }]} />
                  : k.hinweis && <p className="text-xs text-muted">{k.hinweis}</p>}
              </Karte>
            ))}
          </Abschnitt>
        )}

        {kraft.length > 0 && (
          <Karte className="space-y-3">
            <h3 className="font-semibold">{proUebung && art !== "gewicht" ? ansicht.woche.titel : "Wochenvolumen"} <span className="font-normal text-text2">· {proUebung && art !== "gewicht" ? ansicht.woche.untertitel : "Wdh. × Gewicht"}</span></h3>
            <Segmente label="Volumen-Filter" wert={volumenFilter} onChange={setVolumenFilter}
              werte={[{ wert: "gesamt", label: "Alle Übungen" }, { wert: "uebung", label: uebung?.name ?? "Übung" }]} />
            <WochenChart daten={volumen} einheit={wocheEinheit} serien={[{ schluessel: "volumen", label: proUebung ? ansicht.woche.label : "Volumen", farbe: f.kraft }]} />
            {!proUebung && <p className="text-xs text-muted">Bei Körpergewicht-Übungen zählt nur das Zusatzgewicht, Zeitübungen zählen nicht mit.</p>}
          </Karte>
        )}

        {(kraft.length > 0 || handball.length > 0) && (
          <Abschnitt titel="Gesamtbelastung">
            <div className="grid grid-cols-3 gap-2">
              <Kachel titel="Letzte 7 Tage" wert={fmt(Math.round(emp.akut))} />
              <Kachel titel="Ø pro Woche" wert={fmt(Math.round(schnittGesamt))} unter="im Zeitraum" />
              <Kachel titel="Akut : chronisch" wert={emp.acwr !== null ? emp.acwr.toFixed(2).replace(".", ",") : "–"} unter="ideal 0,8–1,3" />
            </div>
            <Karte className="space-y-2">
              <h3 className="font-semibold">Belastung pro Woche <span className="font-normal text-text2">· Dauer × RPE</span></h3>
              <WochenChart daten={gesamt} einheit=""
                serien={[{ schluessel: "kraft", label: "Kraft", farbe: f.kraft }, { schluessel: "handball", label: "Handball", farbe: f.handball }]} />
              <Legende eintraege={[{ farbe: f.kraft, label: "Kraft" }, { farbe: f.handball, label: "Handball" }]} />
              {geschaetzt > 0 && <p className="text-xs text-muted">{geschaetzt} Krafttraining{geschaetzt === 1 ? "" : "s"} im Zeitraum ohne Dauer/RPE – Belastung geschätzt (3 min pro Satz, RPE 6). Nachtragen im Verlauf.</p>}
            </Karte>
          </Abschnitt>
        )}

        {(kraft.length > 0 || handball.length > 0) && (
          <Abschnitt titel="Trainingskalender">
            <Karte><Kalender tage={tage} von={von} details={details} /></Karte>
          </Abschnitt>
        )}

        {handball.length > 0 && (
          <Abschnitt titel="Handball-Belastung">
            <div className="grid grid-cols-2 gap-2">
              <Kachel titel="Diese Woche" wert={fmt(dieseWoche)} unter="Session-RPE" />
              <Kachel titel="Ø pro Woche" wert={fmt(Math.round(schnittLast))} unter={`im Zeitraum, ${hbImZeitraum.length} Einheiten`} />
            </div>
            <Karte className="space-y-2">
              <h3 className="font-semibold">Wöchentliche Belastung <span className="font-normal text-text2">· Summe Dauer × RPE</span></h3>
              <WochenChart daten={belastung} einheit=""
                serien={[{ schluessel: "training", label: "Training", farbe: f.handball }, { schluessel: "spiel", label: "Spiel", farbe: f.spiel }]} />
              <Legende eintraege={[{ farbe: f.handball, label: "Training" }, { farbe: f.spiel, label: "Spiel" }]} />
            </Karte>
          </Abschnitt>
        )}

        {alleBest.length > 0 && (
          <Abschnitt titel="Bestleistungen aller Übungen">
            <Karte className="!p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-text2 text-left">
                  <tr className="border-b border-linie"><th className="p-3 font-medium">Übung</th><th className="p-3 font-medium text-right">Bester Satz</th><th className="p-3 font-medium text-right">1RM</th></tr>
                </thead>
                <tbody className="tabular">
                  {alleBest.map(({ u, b }) => (
                    <tr key={u.id} className="border-b border-linie last:border-0">
                      <td className="p-3">{u.name}</td>
                      <td className="p-3 text-right whitespace-nowrap">{besterSatz(u.art, b)}<span className="block text-xs text-muted">{besterSatzDatum(u.art, b)}</span></td>
                      <td className="p-3 text-right font-semibold whitespace-nowrap">{(u.art ?? "gewicht") === "gewicht" && b.e1rm ? `${fmt(runde(b.e1rm.wert))} kg` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Karte>
          </Abschnitt>
        )}
      </Inhalt>
    </>
  );
}
