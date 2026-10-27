// Vercel Serverless Function: risponde a /e/<id> con le anteprime (Open Graph)
// dell'evento, così WhatsApp/Telegram/Instagram mostrano la locandina.
// Chi apre il link con un browser viene subito portato su /?event=<id>.

const SUPABASE_URL = "https://ttnwhqpvwkihszxpbdbe.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_W4TDBUcZsTSKPe6fdt0HhQ_6t8KyjXO";
const SITE = "https://unievents.it";
const FALLBACK_IMAGE = SITE + "/social-preview.png";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// event_date può essere "senza fuso" (es. 2026-09-08T09:00:00): in quel caso
// l'orario è già quello locale e lo mostriamo così com'è.
function formatWhen(raw) {
  if (!raw) return "";
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
  const d = new Date(hasTz ? raw : raw + "Z");
  if (isNaN(d)) return "";
  const tz = hasTz ? "Europe/Rome" : "UTC";
  const day = d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: tz });
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  return `${day} · ${time}`;
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || "").trim();
  const valid = /^[A-Za-z0-9_-]{1,64}$/.test(id);

  let ev = null;
  if (valid) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/events?select=title,place,event_date,description,image_url&approved=eq.true&id=eq.${encodeURIComponent(id)}`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      if (r.ok) {
        const rows = await r.json();
        ev = rows[0] || null;
      }
    } catch (err) {
      // se Supabase non risponde, si cade sull'anteprima generica
    }
  }

  const pageUrl = valid ? `${SITE}/e/${encodeURIComponent(id)}` : SITE + "/";
  const target = valid ? `/?event=${encodeURIComponent(id)}` : "/";

  const title = ev ? stripTags(ev.title) : "Uni Events — Gli eventi dell'Unical";
  const when = ev ? formatWhen(ev.event_date) : "";
  const descParts = [];
  if (when) descParts.push("🗓️ " + when);
  if (ev && ev.place) descParts.push("📍 " + stripTags(ev.place));
  let desc = descParts.join("  ");
  if (ev && ev.description) {
    const text = stripTags(ev.description);
    desc += (desc ? " — " : "") + (text.length > 110 ? text.slice(0, 107) + "…" : text);
  }
  if (!desc) desc = "Quello che succede all'Unical, prima che finisca.";

  const image = ev && ev.image_url && /^https?:\/\//i.test(ev.image_url) ? ev.image_url : FALLBACK_IMAGE;

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Uni Events</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Uni Events">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
<p><a href="${esc(target)}">Apri su Uni Events</a></p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // piccola cache: l'anteprima si aggiorna entro pochi minuti se cambi titolo o locandina
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.status(200).send(html);
};
