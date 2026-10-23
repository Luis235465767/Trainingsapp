// Kleiner Client für die GitHub-Gist-API. `fetchFn` ist in Tests ersetzbar.
export const GIST_BESCHREIBUNG = "Trainingstagebuch: Daten (automatisch gepflegt, bitte nicht umbenennen)";
export const DATEI_MUSTER = /^geraet-[\w-]+\.json$/;
const API = "https://api.github.com";

export type FehlerArt = "token" | "netz" | "daten" | "api";
export class SyncFehler extends Error {
  constructor(text: string, public art: FehlerArt) { super(text); }
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export function gistApi(token: string, fetchFn: FetchFn) {
  async function anfrage(pfad: string, { methode = "GET", koerper, keepalive = false }: { methode?: string; koerper?: unknown; keepalive?: boolean } = {}) {
    let r: Response;
    try {
      r = await fetchFn(API + pfad, {
        method: methode, keepalive, cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
          ...(koerper ? { "Content-Type": "application/json" } : {}),
        },
        body: koerper ? JSON.stringify(koerper) : undefined,
      });
    } catch {
      throw new SyncFehler("keine Verbindung zu GitHub", "netz");
    }
    if (r.status === 401) throw new SyncFehler("Token ungültig oder abgelaufen", "token");
    if (r.status === 403 || r.status === 404) {
      if (r.status === 403 && r.headers.get("x-ratelimit-remaining") === "0") throw new SyncFehler("GitHub-Anfragelimit erreicht, später erneut", "netz");
      if (r.status === 404 && pfad.startsWith("/gists/")) throw new SyncFehler("Gist nicht gefunden", "api");
      throw new SyncFehler("Token hat keine Berechtigung für Gists", "token");
    }
    if (!r.ok) throw new SyncFehler(`GitHub antwortet mit Fehler ${r.status}`, r.status >= 500 ? "netz" : "api");
    return r.status === 204 ? null : r.json();
  }

  return {
    async findeGist(): Promise<string | null> {
      for (let seite = 1; seite <= 10; seite++) {
        const liste = (await anfrage(`/gists?per_page=100&page=${seite}`)) as { id: string; description: string | null }[];
        const treffer = liste.find(g => g.description === GIST_BESCHREIBUNG);
        if (treffer) return treffer.id;
        if (liste.length < 100) return null;
      }
      return null;
    },
    async erstelleGist(dateiname: string, inhalt: string): Promise<string> {
      const g = (await anfrage("/gists", { methode: "POST", koerper: { description: GIST_BESCHREIBUNG, public: false, files: { [dateiname]: { content: inhalt } } } })) as { id: string };
      return g.id;
    },
    /** Alle Gerätedateien des Gists. Große Dateien kürzt die API, dann wird der Inhalt einzeln geladen. */
    async ladeDateien(gistId: string): Promise<Record<string, string>> {
      const g = (await anfrage(`/gists/${gistId}`)) as { files?: Record<string, { content?: string; truncated?: boolean; raw_url: string }> };
      const out: Record<string, string> = {};
      for (const [name, f] of Object.entries(g.files ?? {})) {
        if (!DATEI_MUSTER.test(name)) continue;
        if (f.truncated || f.content === undefined) {
          try {
            const r = await fetchFn(f.raw_url, { cache: "no-store" });
            if (!r.ok) throw new Error();
            out[name] = await r.text();
          } catch {
            throw new SyncFehler("keine Verbindung zu GitHub", "netz");
          }
        } else out[name] = f.content;
      }
      return out;
    },
    schreibeDatei(gistId: string, dateiname: string, inhalt: string, keepalive = false) {
      return anfrage(`/gists/${gistId}`, { methode: "PATCH", koerper: { files: { [dateiname]: { content: inhalt } } }, keepalive });
    },
  };
}
