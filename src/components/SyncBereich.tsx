import { useState } from "react";
import { sync, useSyncStatus } from "../sync/instanz";
import { Abschnitt, Button, Karte, eingabeKlasse } from "./ui";
import { Icon } from "./Icon";
import { useRueckmeldung } from "./Rueckmeldung";

const TOKEN_LINK = "https://github.com/settings/personal-access-tokens/new";

export function SyncAnzeige({ klein = false }: { klein?: boolean }) {
  const s = useSyncStatus();
  if (s.zustand === "aus") return null;
  const farbe = s.zustand === "fehler" ? "text-gefahr" : s.zustand === "ok" ? "text-gut" : "text-text2";
  return (
    <p className={`flex items-center gap-1.5 ${klein ? "text-xs" : "text-sm"} ${farbe}`} aria-live="polite">
      <span className={`size-2 rounded-full shrink-0 ${s.zustand === "fehler" ? "bg-gefahr" : s.zustand === "ok" ? "bg-gut" : "bg-muted animate-pulse"}`} />
      {s.text}
    </p>
  );
}

export function SyncBereich() {
  const s = useSyncStatus();
  const { melde, frage } = useRueckmeldung();
  const [token, setToken] = useState("");
  const [arbeitet, setArbeitet] = useState(false);

  const verbinden = async () => {
    setArbeitet(true);
    try {
      await sync.verbinde(token);
      setToken("");
      melde("Synchronisierung eingerichtet");
    } catch (e) {
      melde((e as Error).message, "fehler");
    } finally {
      setArbeitet(false);
    }
  };

  if (sync.verbunden() && !s.tokenFehler) {
    return (
      <Abschnitt titel="Synchronisierung">
        <Karte className="space-y-3 text-sm">
          <SyncAnzeige />
          <p className="text-text2">
            Dieses Gerät gleicht seine Daten mit deinem privaten Gist ab: beim Öffnen der App, kurz nach jeder Änderung und alle zwei Minuten.
            {" "}<a className="text-akzent underline" href={sync.gistUrl() ?? "#"} target="_blank" rel="noopener">Gist ansehen</a> · Gerät {sync.geraet()}
          </p>
          <Button className="w-full" disabled={s.zustand === "laeuft"} onClick={() => sync.synchronisiere()}><Icon name="verlauf" /> Jetzt synchronisieren</Button>
          <Button variante="leise" className="w-full" onClick={async () => {
            if (!(await frage({ titel: "Synchronisierung trennen?", text: "Die Daten bleiben auf diesem Gerät und im Gist erhalten. Andere Geräte synchronisieren weiter.", ja: "Trennen" }))) return;
            sync.trenne();
            melde("Synchronisierung getrennt");
          }}>Auf diesem Gerät trennen</Button>
        </Karte>
      </Abschnitt>
    );
  }

  return (
    <Abschnitt titel="Synchronisierung">
      <Karte className="space-y-3 text-sm">
        {s.tokenFehler && <SyncAnzeige />}
        <p className="text-text2">
          Gleicht deine Daten über ein <b className="text-text">privates Gist</b> in deinem GitHub-Konto zwischen Handy, Tablet und Computer ab. Einmal pro Gerät ein Token eintragen:
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-text2">
          <li><a className="text-akzent underline" href={TOKEN_LINK} target="_blank" rel="noopener">Token erstellen</a> (bei GitHub anmelden), Namen und Ablaufdatum wählen.</li>
          <li>Unter <b className="text-text">Permissions → Account permissions → Gists</b> „Read and write“ wählen. Sonst nichts.</li>
          <li>„Generate token“, Token kopieren und hier einfügen.</li>
        </ol>
        <p className="text-xs text-muted">Das Token deiner Karteikarten-App funktioniert auch. Es bleibt nur auf diesem Gerät gespeichert.</p>
        <input type="password" autoComplete="off" spellCheck={false} placeholder="github_pat_…" aria-label="GitHub-Token"
          className={eingabeKlasse} value={token} onChange={e => setToken(e.target.value)} />
        <Button variante="primaer" className="w-full" disabled={!token.trim() || arbeitet} onClick={verbinden}>
          {arbeitet ? "Verbinde …" : "Verbinden"}
        </Button>
      </Karte>
    </Abschnitt>
  );
}
