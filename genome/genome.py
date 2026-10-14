# /// script
# requires-python = ">=3.12"
# dependencies = ["pysam>=0.23", "httpx>=0.28", "pydantic>=2.9", "cyclopts>=3"]
# ///
import gzip, html, json, random, re
from collections import Counter
from pathlib import Path

import cyclopts, httpx, pysam
from pydantic import BaseModel

app = cyclopts.App(help="Personal WGS pipeline: ClinVar screen, ACMG genes, traits, couple + virtual-kid analysis.")
REF = Path.home() / ".genome-ref"
CLINVAR_URL = "https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/clinvar.vcf.gz"

# Subset of ACMG SF v3.3 (2025). AR = only matters for kids if both parents carry (or homozygous self).
ACMG = {
    "BRCA1": "AD", "BRCA2": "AD", "PALB2": "AD", "TP53": "AD", "MLH1": "AD", "MSH2": "AD", "MSH6": "AD",
    "PMS2": "AD", "APC": "AD", "MUTYH": "AR", "PTEN": "AD", "STK11": "AD", "MEN1": "AD", "RET": "AD",
    "VHL": "AD", "LDLR": "AD", "APOB": "AD", "PCSK9": "AD", "MYH7": "AD", "MYBPC3": "AD", "KCNQ1": "AD",
    "KCNH2": "AD", "SCN5A": "AD", "RYR1": "AD", "CACNA1S": "AD", "TTR": "AD", "HFE": "AR",
    "ATP7B": "AR", "BTD": "AR", "GAA": "AR", "ABCD1": "XL", "CYP27A1": "AR", "PLN": "AD",
}
TRAITS = {
    "rs429358": ("APOE", "APOE allele call, pairs with rs7412"),
    "rs7412": ("APOE", "APOE allele call, pairs with rs429358"),
    "rs4988235": ("MCM6/LCT", "lactase persistence"),
    "rs1815739": ("ACTN3", "R577X sprint vs endurance muscle fiber"),
    "rs671": ("ALDH2", "alcohol flush"),
    "rs762551": ("CYP1A2", "caffeine metabolism speed"),
    "rs1801133": ("MTHFR", "C677T folate metabolism"),
    "rs12913832": ("HERC2", "blue vs brown eyes"),
    "rs9939609": ("FTO", "weight / appetite"),
    "rs713598": ("TAS2R38", "bitter taste (cilantro/broccoli)"),
    "rs1800562": ("HFE", "C282Y hemochromatosis"),
    "rs6025": ("F5", "factor V Leiden clotting"),
    "rs1799963": ("F2", "prothrombin G20210A clotting"),
    "rs4680": ("COMT", "Val158Met dopamine clearance"),
    "rs1042713": ("ADRB2", "beta-2 receptor"),
    "rs17822931": ("ABCC11", "earwax type / body odor"),
}


class Hit(BaseModel):
    chrom: str
    pos: int
    ref: str
    alt: str
    gene: str
    sig: str
    disease: str
    stars: str
    gt: str
    acmg: str = ""


def norm(c: str) -> str:
    return c.removeprefix("chr").replace("MT", "M")


def zyg(gt: tuple) -> str:
    a = [x for x in gt if x is not None]
    return "hom" if a and all(x > 0 for x in a) else "het" if any(x > 0 for x in a) else "ref"


@app.command
def setup():
    """Download ClinVar GRCh38 and resolve trait rsIDs to GRCh38 positions via Ensembl."""
    REF.mkdir(exist_ok=True)
    cv = REF / "clinvar.vcf.gz"
    with httpx.stream("GET", CLINVAR_URL, follow_redirects=True, timeout=None) as r, cv.open("wb") as f:
        for b in r.iter_bytes(): f.write(b)
    pos = {}
    for rs in TRAITS:
        j = httpx.get(f"https://rest.ensembl.org/variation/human/{rs}", headers={"content-type": "application/json"}, timeout=30).json()
        m = next(m for m in j["mappings"] if m["assembly_name"] == "GRCh38" and re.fullmatch(r"\w{1,2}", m["seq_region_name"]))
        pos[rs] = {"chrom": m["seq_region_name"], "pos": m["start"], "alleles": m["allele_string"]}
    (REF / "traits.json").write_text(json.dumps(pos, indent=1))
    print(f"ok: {cv} ({cv.stat().st_size >> 20} MB), {len(pos)} trait sites")


def load_clinvar(path: Path) -> dict:
    db = {}
    for line in gzip.open(path, "rt"):
        if line[0] == "#": continue
        c, p, _, r, a, _, _, info = line.rstrip("\n").split("\t")[:8]
        d = dict(kv.split("=", 1) for kv in info.split(";") if "=" in kv)
        s = d.get("CLNSIG", "")
        if "athogenic" not in s or "Conflicting" in s: continue
        db[(norm(c), int(p), r, a)] = (d.get("GENEINFO", "?").split(":")[0], s, d.get("CLNDN", "").replace("_", " "), d.get("CLNREVSTAT", "").replace("_", " "))
    return db


def scan(vcf: Path, db: dict, traits: dict) -> tuple[list[Hit], dict]:
    tpos = {(norm(v["chrom"]), v["pos"]): rs for rs, v in traits.items()}
    hits, tg = [], {}
    for rec in pysam.VariantFile(str(vcf)):
        gt = next(iter(rec.samples.values()))["GT"]
        z = zyg(gt)
        if z == "ref": continue
        c = norm(rec.chrom)
        if (c, rec.pos) in tpos:
            tg[tpos[(c, rec.pos)]] = "/".join(rec.alleles[i] if i is not None else "." for i in gt)
        for i, alt in enumerate(rec.alts or (), 1):
            if i not in gt: continue
            if k := db.get((c, rec.pos, rec.ref, alt)):
                hits.append(Hit(chrom=c, pos=rec.pos, ref=rec.ref, alt=alt, gene=k[0], sig=k[1], disease=k[2], stars=k[3], gt=z, acmg=ACMG.get(k[0], "")))
    for rs, v in traits.items():
        r = v["alleles"].split("/")[0]
        tg.setdefault(rs, f"{r}/{r}")
    return hits, tg


def apoe(tg: dict) -> str:
    a, b = tg.get("rs429358", ""), tg.get("rs7412", "")
    c4, t2 = a.count("C"), b.count("T")
    alle = ["e4"] * c4 + ["e2"] * t2
    return "/".join(sorted(alle + ["e3"] * (2 - len(alle)))) if len(alle) <= 2 else f"ambiguous ({a} | {b})"


def page(title: str, body: str) -> str:
    return f"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>{title}</title>
<style>html,body{{overflow-x:hidden}}body{{font:16px/1.6 system-ui;max-width:900px;margin:auto;padding:1rem;background:#FBF6EC;color:#24170F}}
h1,h2{{font-family:Georgia,serif}}table{{border-collapse:collapse;width:100%;font-size:.9rem}}td,th{{border-bottom:1px solid #e5dccb;padding:6px;text-align:left}}
.w{{overflow-x:auto}}.acmg{{background:#f7e3dd}}.tag{{font-size:.75rem;padding:1px 6px;border-radius:9px;background:#C9A24B;color:#fff}}</style>
<h1>{title}</h1>{body}"""


def table(rows: list[list], head: list[str]) -> str:
    th = "".join(f"<th>{h}</th>" for h in head)
    tr = "".join("<tr" + (' class=acmg' if r and str(r[0]).startswith("★") else "") + ">" + "".join(f"<td>{html.escape(str(x))}</td>" for x in r) + "</tr>" for r in rows)
    return f"<div class=w><table><tr>{th}</tr>{tr}</table></div>"


@app.command
def report(vcf: Path, name: str = "me", out: Path = Path("out")):
    """Screen one genome: ClinVar P/LP hits, ACMG genes first, trait panel, APOE. Writes HTML + an LLM brief."""
    out.mkdir(exist_ok=True)
    hits, tg = scan(vcf, load_clinvar(REF / "clinvar.vcf.gz"), json.loads((REF / "traits.json").read_text()))
    hits.sort(key=lambda h: (not h.acmg, h.gene))
    (out / f"{name}.hits.json").write_text(json.dumps({"hits": [h.model_dump() for h in hits], "traits": tg}, indent=1))
    rows = [[("★ " if h.acmg else "") + h.gene, h.gt, h.sig, h.disease[:90], h.stars, f"{h.chrom}:{h.pos} {h.ref}>{h.alt}"] for h in hits]
    tr = [[rs, *TRAITS[rs], g] for rs, g in tg.items()]
    body = (f"<p><b>{len(hits)}</b> ClinVar pathogenic/likely-pathogenic alleles, <b>{sum(1 for h in hits if h.acmg)}</b> in ACMG genes. APOE: <b>{apoe(tg)}</b></p>"
            "<h2>ClinVar hits</h2>" + table(rows, ["gene", "zyg", "ClinVar", "condition", "review", "variant"])
            + "<h2>Trait panel</h2>" + table(tr, ["rsID", "gene", "what", "genotype"]))
    (out / f"{name}.html").write_text(page(f"Genome report: {name}", body))
    brief = [f"# Genome brief: {name}", f"APOE {apoe(tg)}", "## ClinVar P/LP (ACMG genes starred)"]
    brief += [f"- {'★' if h.acmg else ''}{h.gene} {h.gt} {h.chrom}:{h.pos} {h.ref}>{h.alt} | {h.sig} | {h.disease} | {h.stars}" for h in hits]
    brief += ["## Traits (GRCh38 forward strand)"] + [f"- {rs} {TRAITS[rs][0]} ({TRAITS[rs][1]}): {g}" for rs, g in tg.items()]
    brief += ["", "Explain each finding in plain English: what the gene does, what this genotype means, how strong the evidence is (review stars), and whether it is worth confirming with a clinical test. Flag anything that is a known ClinVar false-positive pattern or a common low-penetrance variant."]
    (out / f"{name}.brief.md").write_text("\n".join(brief))
    print(f"{len(hits)} hits -> {out}/{name}.html, {name}.brief.md")


def child_gt(a: str, b: str) -> dict[str, float]:
    p = lambda z: {"ref": 0, "het": 0.5, "hom": 1}[z]
    pa, pb = p(a), p(b)
    return {"hom": pa * pb, "het": pa * (1 - pb) + pb * (1 - pa), "ref": (1 - pa) * (1 - pb)}


@app.command
def couple(a: Path, b: Path, na: str = "Benny", nb: str = "Bekah", kids: int = 10000, out: Path = Path("out")):
    """Combine two `report` outputs (*.hits.json): per-variant odds for a kid, recessive gene matches, virtual-kid sim."""
    A, B = json.loads(a.read_text()), json.loads(b.read_text())
    key = lambda h: (h["chrom"], h["pos"], h["ref"], h["alt"])
    va, vb = {key(h): h for h in A["hits"]}, {key(h): h for h in B["hits"]}
    loci = []
    for k in va.keys() | vb.keys():
        h = va.get(k) or vb.get(k)
        za, zb = va.get(k, {}).get("gt", "ref"), vb.get(k, {}).get("gt", "ref")
        loci.append((h, za, zb, child_gt(za, zb)))
    ga = {h["gene"] for h in A["hits"]}
    gb = {h["gene"] for h in B["hits"]}
    shared = sorted(ga & gb)
    rows = []
    for h, za, zb, c in sorted(loci, key=lambda x: (-x[3]["hom"], x[0]["gene"])):
        inh = h.get("acmg") or "?"
        rows.append([("★ " if h.get("acmg") else "") + h["gene"], inh, za, zb, f"{c['het'] + c['hom']:.0%}", f"{c['hom']:.0%}", h["disease"][:70]])
    rng = random.Random(1)
    sim = Counter()
    for _ in range(kids):
        ad = dbl = carrier = 0
        genes = Counter()
        for h, za, zb, _c in loci:
            n = (rng.random() < {"ref": 0, "het": .5, "hom": 1}[za]) + (rng.random() < {"ref": 0, "het": .5, "hom": 1}[zb])
            if n: carrier = 1
            if n and h.get("acmg") == "AD": ad = 1
            if n == 2: dbl = 1
            genes[h["gene"]] += n
        if any(v >= 2 for g, v in genes.items() if ACMG.get(g) != "AD" and g in shared): sim["compound/hom in a shared gene"] += 1
        sim["carries ≥1 P/LP allele"] += carrier
        sim["gets a dominant ACMG variant"] += ad
        sim["gets two copies of the same variant"] += dbl
    ta, tb = A["traits"], B["traits"]
    pa, pb = apoe(ta).split("/"), apoe(tb).split("/")
    apo = Counter("/".join(sorted((rng.choice(pa), rng.choice(pb)))) for _ in range(kids))
    body = (f"<p>{na}: {len(A['hits'])} P/LP alleles. {nb}: {len(B['hits'])}. Genes where you both carry something: <b>{', '.join(shared) or 'none'}</b>.</p>"
            "<h2>Per-variant odds for each kid</h2><p>Exact Mendelian odds. A shared recessive gene with different variants (compound het) is 25% too.</p>"
            + table(rows, ["gene", "inheritance", na, nb, "kid gets ≥1 copy", "kid gets 2", "condition"])
            + f"<h2>{kids:,} virtual kids</h2><p>Unlinked-loci Monte Carlo. For real crossover modeling use ped-sim with a genetic map.</p>"
            + table([[k, f"{v / kids:.1%}"] for k, v in sim.items()], ["outcome", "share of kids"])
            + "<h2>Kid APOE distribution</h2>" + table([[k, f"{v / kids:.1%}"] for k, v in apo.most_common()], ["APOE", "share"]))
    (out / "couple.html").write_text(page(f"{na} + {nb}: what a kid inherits", body))
    print(f"shared genes: {shared or 'none'} -> {out}/couple.html")


if __name__ == "__main__":
    app()
