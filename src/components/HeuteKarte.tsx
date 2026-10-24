import { useState } from "react";
import type { HandballEinheit, KraftEinheit } from "../model/types";
import { empfehlung, tageslasten, type Ampel } from "../logic/belastung";
import { heute } from "../logic/datum";
import { fmt } from "../logic/metriken";
import { Karte } from "./ui";
import { Icon } from "./Icon";

const STIL: Record<Ampel, { farbe: string; rand: string; icon: string; label: string }> = {
  gruen: { farbe: "text-gut", rand: "border-l-gut", icon: "haken", label: "Grün" },
  gelb: { farbe: "text-warnung", rand: "border-l-warnung", icon: "warnung", label: "Gelb" },
  rot: { farbe: "text-gefahr", rand: "border-l-gefahr", icon: "mond", label: "Rot" },
};

/** Gesamtbelastung von heute und den letzten 7 Tagen mit Ruhetag-Empfehlung. */
export function HeuteKarte({ kraft, handball }: { kraft: KraftEinheit[]; handball: HandballEinheit[] }) {
  const [offen, setOffen] = useState(false);
  const e = empfehlung(tageslasten(kraft, handball), heute());
  const s = STIL[e.ampel];
  const hauptgrund = e.gruende[0];
  return (
    <Karte className={`!p-0 border-l-4 ${s.rand}`}>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Icon name={s.icon} className={`size-6 shrink-0 ${s.farbe}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted">Empfehlung · Ampel {s.label}</p>
            <h2 className="font-semibold text-lg leading-tight">{e.titel}</h2>
            {hauptgrund && <p className="text-sm text-text2 mt-1">{hauptgrund}</p>}
          </div>
        </div>
        <dl className="grid grid-cols-3 border border-linie rounded-md divide-x divide-linie text-center">
          <div className="py-2"><dt className="text-[11px] uppercase tracking-wider text-muted">Heute</dt><dd className="font-semibold tabular">{fmt(e.heute.gesamt)}</dd></div>
          <div className="py-2"><dt className="text-[11px] uppercase tracking-wider text-muted">7 Tage</dt><dd className="font-semibold tabular">{fmt(Math.round(e.akut))}</dd></div>
          <div className="py-2"><dt className="text-[11px] uppercase tracking-wider text-muted">Ø Woche</dt><dd className="font-semibold tabular">{e.genugDaten ? fmt(Math.round(e.chronisch)) : "–"}</dd></div>
        </dl>
        {e.heute.gesamt > 0 && (
          <p className="text-xs text-muted tabular">Heute: Kraft {fmt(e.heute.kraft)} · Handball {fmt(e.heute.handball)}</p>
        )}
      </div>
      <button type="button" onClick={() => setOffen(!offen)} aria-expanded={offen}
        className="w-full min-h-11 border-t border-linie text-sm font-medium text-akzent flex items-center justify-center gap-1">
        {offen ? "Weniger" : "Wie wird das berechnet?"}
      </button>
      {offen && (
        <div className="px-4 pb-4 space-y-2 text-sm text-text2">
          {e.gruende.length > 1 && <ul className="list-disc pl-5 space-y-1">{e.gruende.slice(1).map(g => <li key={g}>{g}</li>)}</ul>}
          <p>Belastung = Dauer (min) × Anstrengung (RPE), für Krafttraining und Handball gleich. Verglichen werden die letzten 7 Tage mit deinem Wochenschnitt der letzten 4 Wochen{e.acwr !== null ? ` (Verhältnis ${e.acwr.toFixed(2).replace(".", ",")})` : ""}, dazu Trainingstage in Folge ({e.tageInFolge}) und wie hart der letzte Tag war.</p>
          <p className="text-xs text-muted">Richtwert aus deinen eigenen Daten, kein medizinischer Rat. Bei Schmerzen, Krankheit oder schlechtem Schlaf lieber pausieren.</p>
        </div>
      )}
    </Karte>
  );
}
