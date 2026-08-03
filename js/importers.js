/* RIS / BibTeX の読み書き。ネットワークも DOM も使わない */
import { blank } from "./types.js";
import { isCJK, stripTags } from "./util.js";

const person = n => {
  const t = (n || "").trim().replace(/\.$/, "");
  if(!t) return null;
  if(isCJK(t)) return {family: t, given: ""};
  if(t.includes(",")){
    const [f, ...r] = t.split(",");
    return {family: f.trim(), given: r.join(",").trim()};
  }
  const p = t.split(/\s+/);
  if(p.length === 1) return {family: t, given: ""};
  return {family: p.pop(), given: p.join(" ")};
};

/* ---------------- RIS ---------------- */
const RIS_TYPE = {
  JOUR:"journal", EJOUR:"journal", MGZN:"magazine", NEWS:"newspaper",
  BOOK:"book", EDBOOK:"editedbook", CHAP:"chapter", ENCYC:"encyclopedia",
  CONF:"conference", CPAPER:"conference", RPRT:"report", GOVDOC:"report",
  THES:"thesis", DATA:"dataset", COMP:"software", ELEC:"webpage",
  BLOG:"blog", VIDEO:"video", MAP:"map", STAND:"standard", STAT:"law",
  UNPB:"manuscript", GEN:"other"
};

export function parseRIS(text){
  const out = [];
  let e = null;
  const flush = () => { if(e && (e.title || e.authors.length)) out.push(e); e = null; };
  String(text).split(/\r?\n/).forEach(line => {
    const m = line.match(/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/);
    if(!m){
      /* 折り返し行は直前の項目に足す */
      if(e && e._last && line.trim()) e[e._last] += " " + line.trim();
      return;
    }
    const [, tag, valRaw] = m;
    const val = valRaw.trim();
    if(tag === "TY"){ flush(); e = blank(); e.source = "RIS"; e.type = RIS_TYPE[val] || "other"; return; }
    if(!e){ e = blank(); e.source = "RIS"; }
    e._last = null;
    switch(tag){
      case "AU": case "A1": { const p = person(val); if(p) e.authors.push(p); break; }
      case "A2": case "ED": { const p = person(val); if(p) e.editors.push(p); break; }
      case "TI": case "T1": case "CT": e.title = val; e._last = "title"; break;
      case "BT": if(e.type === "chapter") e.container = val; else if(!e.title) e.title = val; break;
      case "T2": case "JO": case "JF": case "J2": if(!e.container) e.container = val; break;
      case "PY": case "Y1": case "DA": if(!e.year){ const y = val.match(/\d{4}/); if(y) e.year = y[0]; } break;
      case "VL": e.volume = val; break;
      case "IS": case "CP": e.issue = val; break;
      case "SP": e.pages = val + (e.pages ? "-" + e.pages : ""); break;
      case "EP": e.pages = (e.pages ? e.pages + "-" : "") + val; break;
      case "PB": e.publisher = val; break;
      case "ET": e.edition = val; break;
      case "DO": e.doi = val.startsWith("http") ? val : "https://doi.org/" + val; break;
      case "UR": if(!e.doi) e.doi = val; break;
      case "CY": e.location = val; break;
      case "ER": flush(); break;
      default: break;
    }
  });
  flush();
  out.forEach(x => { delete x._last; });
  return out;
}

/* ---------------- BibTeX ---------------- */
const BIB_TYPE = {
  article:"journal", book:"book", booklet:"book", inbook:"chapter",
  incollection:"chapter", inproceedings:"conference", conference:"conference",
  proceedings:"conference", techreport:"report", phdthesis:"thesis",
  mastersthesis:"thesis", misc:"other", online:"webpage", electronic:"webpage",
  dataset:"dataset", software:"software", unpublished:"manuscript"
};

/* { } の対応を数えながら値を切り出す */
function bibFields(body){
  const f = {};
  let i = 0;
  while(i < body.length){
    const eq = body.indexOf("=", i);
    if(eq < 0) break;
    const key = body.slice(i, eq).replace(/[,\s]/g, "").toLowerCase();
    let j = eq + 1;
    while(j < body.length && /\s/.test(body[j])) j++;
    let val = "";
    if(body[j] === "{"){
      let depth = 0;
      const start = j;
      for(; j < body.length; j++){
        if(body[j] === "{") depth++;
        else if(body[j] === "}"){ depth--; if(!depth){ j++; break; } }
      }
      val = body.slice(start + 1, j - 1);
    }else if(body[j] === '"'){
      const start = ++j;
      for(; j < body.length && body[j] !== '"'; j++){}
      val = body.slice(start, j++);
    }else{
      const start = j;
      while(j < body.length && body[j] !== ",") j++;
      val = body.slice(start, j);
    }
    if(key) f[key] = val.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
    const comma = body.indexOf(",", j);
    i = comma < 0 ? body.length : comma + 1;
  }
  return f;
}

export function parseBibTeX(text){
  const out = [];
  const re = /@(\w+)\s*\{([^,]*),([\s\S]*?)\n\s*\}\s*(?=@|$)/g;
  let m;
  while((m = re.exec(String(text)))){
    const kind = m[1].toLowerCase();
    if(kind === "comment" || kind === "string" || kind === "preamble") continue;
    const f = bibFields(m[3]);
    const e = blank();
    e.source = "BibTeX";
    e.type = BIB_TYPE[kind] || "other";
    e.title = f.title || "";
    e.authors = (f.author || "").split(/\s+and\s+/).map(person).filter(Boolean);
    e.editors = (f.editor || "").split(/\s+and\s+/).map(person).filter(Boolean);
    e.year = (f.year || f.date || "").match(/\d{4}/) ? (f.year || f.date).match(/\d{4}/)[0] : "";
    e.container = f.journal || f.booktitle || f.series || f.howpublished || "";
    e.volume = f.volume || "";
    e.issue = f.number && e.type === "journal" ? f.number : "";
    e.number = f.number && e.type !== "journal" ? f.number : "";
    e.pages = (f.pages || "").replace(/--/g, "-");
    e.publisher = f.publisher || f.institution || f.school || f.organization || "";
    e.edition = f.edition || f.version || "";
    e.location = f.address || "";
    e.doi = f.doi ? (f.doi.startsWith("http") ? f.doi : "https://doi.org/" + f.doi) : (f.url || "");
    if(e.title || e.authors.length) out.push(e);
  }
  return out;
}

export function parseAny(text){
  const t = String(text || "");
  if(/^\s*@\w+\s*\{/m.test(t)) return parseBibTeX(t);
  if(/^\s*TY\s{2}-/m.test(t) || /^\s*[A-Z][A-Z0-9]\s{2}-\s/m.test(t)) return parseRIS(t);
  return [];
}

/* ---------------- BibTeX 書き出し ---------------- */
const OUT_TYPE = {
  journal:"article", magazine:"article", newspaper:"article", book:"book",
  editedbook:"book", chapter:"incollection", encyclopedia:"incollection",
  conference:"inproceedings", presentation:"misc", report:"techreport",
  preprint:"misc", thesis:"phdthesis", dataset:"misc", statistics:"misc",
  software:"misc", video:"misc", podcast:"misc", social:"misc", press:"misc",
  standard:"misc", map:"misc", law:"misc", manuscript:"unpublished",
  webpage:"online", blog:"online", news_web:"online", other:"misc"
};

const bibName = a => a.given ? `${a.family}, ${a.given}` : a.family;

export function toBibTeX(e, i){
  const first = (e.authors[0] && e.authors[0].family) || "ref";
  const yr = (e.year || "").match(/\d{4}/);
  const key = (first.replace(/[^A-Za-z0-9]/g, "") || "ref") + (yr ? yr[0] : "") + (i != null ? String.fromCharCode(97 + (i % 26)) : "");
  const f = [];
  const add = (k, v) => { if(v && String(v).trim()) f.push(`  ${k} = {${String(v).trim()}}`); };
  add("title", stripTags(e.title) + (e.translated ? ` [${e.translated}]` : ""));
  add("author", e.authors.map(bibName).join(" and "));
  add("editor", e.editors.map(bibName).join(" and "));
  add("year", yr ? yr[0] : "");
  if(["chapter", "encyclopedia", "conference"].includes(e.type)) add("booktitle", e.container);
  else if(!["book", "editedbook", "report"].includes(e.type)) add("journal", e.container);
  add("volume", e.volume);
  add("number", e.issue || e.number);
  add("pages", (e.pages || "").replace(/-/g, "--"));
  add("publisher", e.publisher);
  add("edition", e.edition);
  add("address", e.location);
  const doi = (e.doi || "").match(/10\.\d{4,9}\/\S+/);
  add("doi", doi ? doi[0] : "");
  if(!doi) add("url", e.doi);
  add("note", e.original);
  return `@${OUT_TYPE[e.type] || "misc"}{${key},\n${f.join(",\n")}\n}`;
}
