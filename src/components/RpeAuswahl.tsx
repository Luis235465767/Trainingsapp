// Auswahl der Anstrengung (RPE 1–10) mit großen Tasten.
export const RPE_TEXT: Record<number, string> = {
  1: "sehr leicht", 2: "leicht", 3: "moderat", 4: "etwas schwer", 5: "schwer",
  6: "schwer", 7: "sehr schwer", 8: "sehr schwer", 9: "extrem schwer", 10: "maximal",
};

export function RpeAuswahl({ wert, onChange }: { wert: number | undefined; onChange: (n: number) => void }) {
  return (
    <div>
      <span className="block text-sm font-medium text-text2 mb-1">
        Anstrengung (RPE 1–10){wert ? <>: <b className="text-text">{wert} · {RPE_TEXT[wert]}</b></> : ""}
      </span>
      <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="RPE">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button key={n} type="button" role="radio" aria-checked={wert === n} aria-label={`RPE ${n}, ${RPE_TEXT[n]}`} onClick={() => onChange(n)}
            className={`h-12 rounded-md text-lg font-semibold border ${wert === n ? "bg-akzent text-akzent-text border-akzent" : "border-linie bg-karte"}`}>{n}</button>
        ))}
      </div>
    </div>
  );
}
