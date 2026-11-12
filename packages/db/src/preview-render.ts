export interface PreviewProvenance {
  capturedAt: Date;
  evidenceId: string;
  kind: "external_source" | "operator_report";
  sourceUri: string;
  title: string;
}

export interface PreviewInput {
  name: string;
  physicalAddress: string | null;
  provenance?: PreviewProvenance;
  websiteUrl: string | null;
}

/** Render a permanently attributable, script-free private prospect draft. */
function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = {
      "'": "&#39;",
      '"': "&quot;",
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
    };
    return map[ch] ?? ch;
  });
}

function safeWebsite(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  try {
    const uri = new URL(raw);
    if (
      !["https:", "http:"].includes(uri.protocol) ||
      uri.username ||
      uri.password
    ) {
      return null;
    }
    return escapeHtml(uri.toString());
  } catch {
    return null;
  }
}

export function renderProspectPreview(input: PreviewInput): string {
  const name = escapeHtml(input.name);
  const address = input.physicalAddress
    ? escapeHtml(input.physicalAddress)
    : null;
  const website = safeWebsite(input.websiteUrl);
  const mark = escapeHtml(input.name.trim().slice(0, 1).toUpperCase() || "P");
  const visit = website
    ? `<a class="action" href="${website}" target="_blank" rel="noopener noreferrer">Visit reported website ↗</a>`
    : '<span class="muted">No website URL reported</span>';
  const where = address
    ? `<p class="address">${address}</p>`
    : '<p class="muted">Location has not been provided.</p>';

  const source = input.provenance;
  const external = source?.kind === "external_source";
  const historical = external && /(?:historical|legacy)/i.test(source.title);
  const narrative = historical
    ? "A private concept based on a historical public record. This business information and any licensing or operating status are not verified as current."
    : external
      ? "A private concept based on an external source report. Business details have not been independently verified and require approval before publication."
      : "A private visual concept based only on information supplied by an operator. Business details and messaging require verification before publication.";
  const sourceUrl =
    external && source.sourceUri.startsWith("https://")
      ? safeWebsite(source.sourceUri)
      : null;
  const capturedAt =
    source?.capturedAt instanceof Date &&
    !Number.isNaN(source.capturedAt.getTime())
      ? escapeHtml(source.capturedAt.toISOString())
      : "unknown";
  const attribution =
    external && sourceUrl
      ? '<div class="provenance"><h2>Source of reported information</h2><p>' +
        (historical
          ? "Historical registry report; not evidence of current licensing."
          : "External source report; not independently verified.") +
        '</p><p><a href="' +
        sourceUrl +
        '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(source.title) +
        "</a></p><p>Retrieved " +
        capturedAt +
        " · Evidence " +
        escapeHtml(source.evidenceId) +
        "</p></div>"
      : "";
  const provenanceLabel = historical
    ? "Historical registry report · Not independently verified"
    : external
      ? "External source report · Not independently verified"
      : "Operator-reported information";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${name} | Private Draft Preview</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#101617;color:#eef2e7;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;line-height:1.5}
header{display:flex;align-items:center;justify-content:space-between;padding:27px clamp(20px,6vw,90px);border-bottom:1px solid #32413d}
.brand{display:flex;gap:12px;align-items:center;font-weight:800;letter-spacing:-.04em;font-size:20px}.mark{display:grid;place-items:center;background:#c8d6a6;color:#0e1915;border-radius:10px;width:38px;height:38px;font-size:23px}
.flag{font-size:11px;text-transform:uppercase;letter-spacing:.11em;color:#c7d7bd;border:1px solid #475a4d;border-radius:100px;padding:8px 13px}
.hero{max-width:1240px;min-height:65vh;margin:0 auto;display:grid;grid-template-columns:1.3fr .7fr;align-items:center;padding:80px clamp(20px,6vw,90px);gap:50px}
.kicker{text-transform:uppercase;color:#b5cb8c;font-size:12px;font-weight:700;letter-spacing:.2em}.hero h1{font-size:clamp(52px,8vw,100px);line-height:.98;letter-spacing:-.06em;overflow-wrap:anywhere;margin:26px 0;font-weight:600}.sub{max-width:600px;font-size:clamp(17px,2vw,22px);color:#aebdb4}
.card{min-height:350px;border-radius:24px;background:linear-gradient(145deg,#d4d9b8,#859e89 70%,#31564e);color:#0f2219;display:flex;flex-direction:column;justify-content:space-between;padding:35px;box-shadow:0 25px 80px #0004}
.card strong{font-size:90px;font-weight:500;line-height:1}.card p{font-size:13px;text-transform:uppercase;letter-spacing:.12em}
.details{padding:38px clamp(20px,6vw,90px) 70px;border-top:1px solid #30453b;max-width:1240px;margin:auto;display:grid;grid-template-columns:1fr 1fr;gap:40px}
.details h2{font-size:24px;letter-spacing:-.03em}.muted{color:#95a59c}.address{font-size:20px}.action{display:inline-block;margin-top:5px;border:1px solid #c3d3aa;padding:14px 18px;border-radius:9px;color:#d7efbc;text-decoration:none}
.provenance{max-width:1240px;margin:auto;padding:28px clamp(20px,6vw,90px);border-top:1px solid #30453b;color:#b7c7bb;font-size:13px}.provenance h2{font-size:19px;color:#eef2e7}.provenance a{color:#d7efbc}
footer{font-size:11px;letter-spacing:.02em;color:#81978a;padding:26px clamp(20px,6vw,90px);border-top:1px solid #30453b}
@media(max-width:720px){.hero{grid-template-columns:1fr;padding-top:50px;padding-bottom:50px}.card{min-height:240px}.details{grid-template-columns:1fr;gap:10px}.flag{font-size:9px}}
</style>
</head>
<body>
<header><div class="brand"><span class="mark">${mark}</span><span>${name}</span></div><span class="flag">Draft preview</span></header>
<main>
<section class="hero"><div><p class="kicker">A considered digital presence</p><h1>${name}</h1><p class="sub">${narrative}</p></div>
<div class="card"><strong>${mark}</strong><p>Concept / Unpublished</p></div></section>
<section class="details"><div><h2>Location</h2>${where}</div><div><h2>Online presence</h2>${visit}</div></section>
${attribution}
</main>
<footer>${provenanceLabel} · Private Draft preview · Not approved for publication or outreach.</footer>
</body>
</html>`;
}
