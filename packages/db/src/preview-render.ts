const HISTORICAL_SOURCE_TITLE = /(?:historical|legacy)/i;

export interface PreviewProvenance {
  capturedAt: Date;
  evidenceId: string;
  kind: "external_source" | "operator_report";
  sourceExcerpt?: string;
  sourceUri: string;
  title: string;
}

export interface PreviewDesignOptions {
  design?: "editorial" | "atelier" | "modern";
  headline?: string;
  introduction?: string;
}

export interface PreviewInput extends PreviewDesignOptions {
  design?: "editorial" | "atelier" | "modern";
  designVersion?: number;
  headline?: string;
  introduction?: string;
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: explicit provenance and safe display branches are intentionally visible to audit.
export function renderProspectPreview(input: PreviewInput): string {
  const name = escapeHtml(input.name);
  const direction =
    input.design ??
    (["editorial", "atelier", "modern"][
      (Math.max(1, input.designVersion ?? 1) - 1) % 3
    ] as "editorial" | "atelier" | "modern");
  const directionStyles = {
    atelier: {
      accent: "#f1bd9b",
      base: "#201a18",
      muted: "#c1aea3",
      panel: "#e4cabb",
      title: "Atelier",
    },
    editorial: {
      accent: "#c8d6a6",
      base: "#101617",
      muted: "#aebdb4",
      panel: "#d4d9b8",
      title: "Editorial",
    },
    modern: {
      accent: "#b7dff4",
      base: "#111c27",
      muted: "#a8b9c6",
      panel: "#c4def0",
      title: "Modern",
    },
  }[direction];
  const mainHeadline = escapeHtml(input.headline?.trim() || input.name);
  const introCopy = input.introduction?.trim()
    ? escapeHtml(input.introduction.trim())
    : null;
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
  const historical = external && HISTORICAL_SOURCE_TITLE.test(source.title);
  let narrative =
    "A private visual concept based only on information supplied by an operator. Business details and messaging require verification before publication.";
  if (external) {
    narrative =
      "A private concept based on an external source report. Business details have not been independently verified and require approval before publication.";
  }
  if (historical) {
    narrative =
      "A private concept based on a historical public record. This business information and any licensing or operating status are not verified as current.";
  }
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
  let provenanceLabel = "Operator-reported information";
  if (external) {
    provenanceLabel = "External source report · Not independently verified";
  }
  if (historical) {
    provenanceLabel = "Historical registry report · Not independently verified";
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${name} | Private Draft Preview</title>
<style>
:root{--draft-accent:${directionStyles.accent};--draft-base:${directionStyles.base};--draft-panel:${directionStyles.panel};--draft-muted:${directionStyles.muted}}
*{box-sizing:border-box}body{margin:0;background:var(--draft-base);color:#eef2e7;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;line-height:1.5}
header{display:flex;align-items:center;justify-content:space-between;padding:27px clamp(20px,6vw,90px);border-bottom:1px solid #32413d}
.brand{display:flex;gap:12px;align-items:center;font-weight:800;letter-spacing:-.04em;font-size:20px}.mark{display:grid;place-items:center;background:var(--draft-accent);color:#0e1915;border-radius:10px;width:38px;height:38px;font-size:23px}
.flag{font-size:11px;text-transform:uppercase;letter-spacing:.11em;color:#c7d7bd;border:1px solid #475a4d;border-radius:100px;padding:8px 13px}
.hero{max-width:1240px;min-height:65vh;margin:0 auto;display:grid;grid-template-columns:1.3fr .7fr;align-items:center;padding:80px clamp(20px,6vw,90px);gap:50px}
.kicker{text-transform:uppercase;color:var(--draft-accent);font-size:12px;font-weight:700;letter-spacing:.2em}.hero h1{font-size:clamp(52px,8vw,100px);line-height:.98;letter-spacing:-.06em;overflow-wrap:anywhere;margin:26px 0;font-weight:600}.sub{max-width:600px;font-size:clamp(17px,2vw,22px);color:var(--draft-muted)}
.card{min-height:350px;border-radius:24px;background:linear-gradient(145deg,var(--draft-panel),#859e89 75%,#31564e);color:#0f2219;display:flex;flex-direction:column;justify-content:space-between;padding:35px;box-shadow:0 25px 80px #0004}
.card strong{font-size:90px;font-weight:500;line-height:1}.card p{font-size:13px;text-transform:uppercase;letter-spacing:.12em}
.details{padding:38px clamp(20px,6vw,90px) 70px;border-top:1px solid #30453b;max-width:1240px;margin:auto;display:grid;grid-template-columns:1fr 1fr;gap:40px}
.details h2{font-size:24px;letter-spacing:-.03em}.muted{color:#95a59c}.address{font-size:20px}.action{display:inline-block;margin-top:5px;border:1px solid var(--draft-accent);padding:14px 18px;border-radius:9px;color:#d7efbc;text-decoration:none}
.provenance{max-width:1240px;margin:auto;padding:28px clamp(20px,6vw,90px);border-top:1px solid #30453b;color:#b7c7bb;font-size:13px}.provenance h2{font-size:19px;color:#eef2e7}.provenance a{color:#d7efbc}
footer{font-size:11px;letter-spacing:.02em;color:#81978a;padding:26px clamp(20px,6vw,90px);border-top:1px solid #30453b}
@media(max-width:720px){.hero{grid-template-columns:1fr;padding-top:50px;padding-bottom:50px}.card{min-height:240px}.details{grid-template-columns:1fr;gap:10px}.flag{font-size:9px}}
.section-kicker{text-transform:uppercase;letter-spacing:.17em;font-size:11px;font-weight:700;color:var(--draft-accent)}
.story{padding:95px clamp(20px,6vw,90px);border-top:1px solid #30453b;background:color-mix(in srgb,var(--draft-base),#fff 3%)}
.story-inner{max-width:1200px;margin:auto}.story h2{font-size:clamp(38px,5vw,74px);font-weight:500;letter-spacing:-.055em;max-width:780px;line-height:1.05;margin:22px 0 45px}
.story-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.story-card{border:1px solid #53615966;border-radius:16px;padding:30px;min-height:225px;background:color-mix(in srgb,var(--draft-base),#fff 5%)}
.story-card small{font-size:11px;color:var(--draft-accent);letter-spacing:.12em}
.story-card h3{font-size:26px;font-weight:500;letter-spacing:-.04em;margin:25px 0 12px}
.story-card p{font-size:14px;color:var(--draft-muted);line-height:1.7}
.proof{display:grid;grid-template-columns:1fr 1fr;max-width:1200px;margin:auto;padding:95px clamp(20px,6vw,90px);gap:80px}
.proof h2{font-size:clamp(36px,4vw,60px);letter-spacing:-.05em;margin:18px 0}
.proof p{font-size:16px;line-height:1.7;color:var(--draft-muted)}
.proof-panel{border:1px solid #657c7266;border-radius:16px;padding:32px;display:flex;flex-direction:column;gap:14px;justify-content:center}
.proof-panel b{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--draft-accent)}
.proof-panel strong{font-size:24px;font-weight:500;overflow-wrap:anywhere}
.cta-band{padding:70px clamp(20px,6vw,90px);background:var(--draft-accent);color:#12231d;text-align:center}
.cta-band h2{font-size:clamp(34px,5vw,64px);letter-spacing:-.055em;max-width:850px;margin:12px auto 25px}
.cta-band p{max-width:650px;margin:auto;font-size:14px}
.direction-label{font-size:10px;text-transform:uppercase;letter-spacing:.2em;color:var(--draft-accent)}
@media(max-width:720px){.story{padding-block:55px}.story-grid{grid-template-columns:1fr}.story-card{min-height:unset}.proof{grid-template-columns:1fr;gap:18px;padding-block:55px}.cta-band{padding-block:54px}}
</style>
</head>
<body>
<header><div class="brand"><span class="mark">${mark}</span><span>${name}</span></div><span class="flag">Draft preview</span></header>
<main>
<section class="hero"><div><p class="kicker">A considered digital presence · ${directionStyles.title}</p><h1>${mainHeadline}</h1><p class="sub">${introCopy ?? narrative}</p><p class="direction-label">Concept direction ${input.designVersion ?? 1} · Not live</p></div>
<div class="card"><strong>${mark}</strong><p>${name}<br>Concept / Unpublished</p></div></section>
<section class="details"><div><h2>Location</h2>${where}</div><div><h2>Online presence</h2>${visit}</div></section>
<section class="story"><div class="story-inner"><span class="section-kicker">Website structure / Editorial draft</span><h2>Make it simple to understand the work, the value, and the next step.</h2>
<div class="story-grid">
<article class="story-card"><small>01 / EXPLORE</small><h3>Services</h3><p>Service categories and specific offerings need confirmation from the business before publication.</p></article>
<article class="story-card"><small>02 / TRUST</small><h3>Work &amp; proof</h3><p>Introduce authentic projects, credentials and customer feedback only when permission and source evidence are available.</p></article>
<article class="story-card"><small>03 / CONNECT</small><h3>Get in touch</h3><p>Contact details and request forms remain inactive until verified and approved by the operator.</p></article>
</div></div></section>
<section class="proof"><div><span class="section-kicker">The facts behind the concept</span><h2>A clear identity, grounded in recorded information.</h2><p>${narrative}</p></div>
<div class="proof-panel"><b>Reported business name</b><strong>${name}</strong>
<b>Reported location</b><strong>${address ?? "Location unverified"}</strong>
<b>Online presence</b><div>${visit}</div></div></section>
${attribution}
<section class="cta-band"><span class="section-kicker" style="color:#315147">Next steps / Before launch</span><h2>Ready for real business content.</h2>
<p>This is an editable design direction, not an operating website. Verify services, work examples, claims, contact details, and owner approval before any public release or outreach.</p></section>
</main>
<footer>${provenanceLabel} · Private Draft preview · Not approved for publication or outreach.</footer>
</body>
</html>`;
}
