/* Country flags, cut from a sprite sheet.

   Every flag is a window onto one 1024x112 PNG (public/flags.png), addressed by
   ISO 3166-1 alpha-2 code. The sheet is BitOfGold/countries-css-sprite, MIT, and
   it is a 4-bit image -- sixteen colours, which is why it upscales into the same
   chunky look as the rest of the game rather than going soft at the edges.

   This replaced eight hand-written CSS gradients. The feed names some 155
   countries and the World Cup alone fields 48, so hand-drawing them was never
   going to keep up; the sheet covers 249. */

/** Where a flag sits on the sheet: [x, y, width]. Height is always 16. */
const SPRITE: Record<string, [number, number, number]> = {
  AD: [0, 0, 23],
  AE: [-23, 0, 32],
  AF: [-55, 0, 24],
  AG: [-79, 0, 24],
  AI: [-103, 0, 32],
  AL: [-135, 0, 22],
  AM: [-157, 0, 32],
  AO: [-189, 0, 24],
  AQ: [-213, 0, 27],
  AR: [-240, 0, 26],
  AS: [-266, 0, 32],
  AT: [-298, 0, 24],
  AU: [-322, 0, 32],
  AW: [-354, 0, 24],
  AX: [-378, 0, 24],
  AZ: [-402, 0, 32],
  BA: [-434, 0, 32],
  BB: [-466, 0, 24],
  BD: [-490, 0, 27],
  BE: [-517, 0, 24],
  BF: [-541, 0, 24],
  BG: [-565, 0, 27],
  BH: [-592, 0, 27],
  BI: [-619, 0, 27],
  BJ: [-646, 0, 24],
  BL: [-670, 0, 24],
  BM: [-694, 0, 32],
  BN: [-726, 0, 32],
  BO: [-758, 0, 23],
  BQ: [-781, 0, 24],
  BR: [-805, 0, 23],
  BS: [-828, 0, 32],
  BT: [-860, 0, 24],
  BV: [-884, 0, 22],
  BW: [-906, 0, 24],
  BY: [-930, 0, 32],
  BZ: [-962, 0, 27],
  CA: [-989, 0, 32],
  CC: [0, -16, 32],
  CD: [-32, -16, 21],
  CF: [-53, -16, 24],
  CG: [-77, -16, 24],
  CH: [-101, -16, 16],
  CI: [-117, -16, 24],
  CK: [-141, -16, 32],
  CL: [-173, -16, 24],
  CM: [-197, -16, 24],
  CN: [-221, -16, 24],
  CO: [-245, -16, 24],
  CR: [-269, -16, 27],
  CU: [-296, -16, 32],
  CV: [-328, -16, 27],
  CW: [-355, -16, 24],
  CX: [-379, -16, 32],
  CY: [-411, -16, 24],
  CZ: [-435, -16, 24],
  DE: [-459, -16, 27],
  DJ: [-486, -16, 24],
  DK: [-510, -16, 21],
  DM: [-531, -16, 32],
  DO: [-563, -16, 24],
  DZ: [-587, -16, 24],
  EC: [-611, -16, 24],
  EE: [-635, -16, 25],
  EG: [-660, -16, 24],
  EH: [-684, -16, 32],
  ER: [-716, -16, 32],
  ES: [-748, -16, 24],
  ET: [-772, -16, 32],
  FI: [-804, -16, 26],
  FJ: [-830, -16, 32],
  FK: [-862, -16, 32],
  FM: [-894, -16, 30],
  FO: [-924, -16, 22],
  FR: [-946, -16, 24],
  GA: [-970, -16, 21],
  GB: [-991, -16, 32],
  GD: [0, -32, 27],
  GE: [-27, -32, 24],
  GF: [-51, -32, 24],
  GG: [-75, -32, 24],
  GH: [-99, -32, 24],
  GI: [-123, -32, 32],
  GL: [-155, -32, 24],
  GM: [-179, -32, 24],
  GN: [-203, -32, 24],
  GP: [-227, -32, 24],
  GQ: [-251, -32, 24],
  GR: [-275, -32, 24],
  GS: [-299, -32, 32],
  GT: [-331, -32, 26],
  GU: [-357, -32, 30],
  GW: [-387, -32, 32],
  GY: [-419, -32, 27],
  HK: [-446, -32, 24],
  HM: [-470, -32, 32],
  HN: [-502, -32, 32],
  HR: [-534, -32, 32],
  HT: [-566, -32, 27],
  HU: [-593, -32, 32],
  ID: [-625, -32, 24],
  IE: [-649, -32, 32],
  IL: [-681, -32, 22],
  IM: [-703, -32, 32],
  IN: [-735, -32, 24],
  IO: [-759, -32, 32],
  IQ: [-791, -32, 24],
  IR: [-815, -32, 28],
  IS: [-843, -32, 22],
  IT: [-865, -32, 24],
  JE: [-889, -32, 27],
  JM: [-916, -32, 32],
  JO: [-948, -32, 32],
  JP: [-980, -32, 24],
  KE: [0, -48, 24],
  KG: [-24, -48, 27],
  KH: [-51, -48, 25],
  KI: [-76, -48, 32],
  KM: [-108, -48, 27],
  KN: [-135, -48, 24],
  KP: [-159, -48, 32],
  KR: [-191, -48, 24],
  KW: [-215, -48, 32],
  KY: [-247, -48, 32],
  KZ: [-279, -48, 32],
  LA: [-311, -48, 24],
  LB: [-335, -48, 24],
  LC: [-359, -48, 32],
  LI: [-391, -48, 27],
  LK: [-418, -48, 32],
  LR: [-450, -48, 30],
  LS: [-480, -48, 24],
  LT: [-504, -48, 27],
  LU: [-531, -48, 27],
  LV: [-558, -48, 32],
  LY: [-590, -48, 32],
  MA: [-622, -48, 24],
  MC: [-646, -48, 20],
  MD: [-666, -48, 32],
  ME: [-698, -48, 32],
  MF: [-730, -48, 24],
  MG: [-754, -48, 24],
  MH: [-778, -48, 30],
  MK: [-808, -48, 32],
  ML: [-840, -48, 24],
  MM: [-864, -48, 24],
  MN: [-888, -48, 32],
  MO: [-920, -48, 24],
  MP: [-944, -48, 32],
  MQ: [-976, -48, 24],
  MR: [-1000, -48, 24],
  MS: [0, -64, 32],
  MT: [-32, -64, 24],
  MU: [-56, -64, 24],
  MV: [-80, -64, 24],
  MW: [-104, -64, 24],
  MX: [-128, -64, 28],
  MY: [-156, -64, 32],
  MZ: [-188, -64, 24],
  NA: [-212, -64, 24],
  NC: [-236, -64, 32],
  NE: [-268, -64, 19],
  NF: [-287, -64, 32],
  NG: [-319, -64, 32],
  NI: [-351, -64, 27],
  NL: [-378, -64, 24],
  NO: [-402, -64, 22],
  NP: [-424, -64, 13],
  NR: [-437, -64, 32],
  NU: [-469, -64, 32],
  NZ: [-501, -64, 32],
  OM: [-533, -64, 28],
  PA: [-561, -64, 24],
  PE: [-585, -64, 24],
  PF: [-609, -64, 24],
  PG: [-633, -64, 21],
  PH: [-654, -64, 32],
  PK: [-686, -64, 24],
  PL: [-710, -64, 26],
  PM: [-736, -64, 24],
  PN: [-760, -64, 32],
  PR: [-792, -64, 24],
  PS: [-816, -64, 32],
  PT: [-848, -64, 24],
  PW: [-872, -64, 26],
  PY: [-898, -64, 29],
  QA: [-927, -64, 41],
  RE: [-968, -64, 24],
  RO: [-992, -64, 24],
  RS: [0, -80, 24],
  RU: [-24, -80, 24],
  RW: [-48, -80, 24],
  SA: [-72, -80, 24],
  SB: [-96, -80, 32],
  SC: [-128, -80, 32],
  SD: [-160, -80, 32],
  SE: [-192, -80, 26],
  SG: [-218, -80, 24],
  SH: [-242, -80, 32],
  SI: [-274, -80, 32],
  SJ: [-306, -80, 22],
  SK: [-328, -80, 24],
  SL: [-352, -80, 24],
  SM: [-376, -80, 21],
  SN: [-397, -80, 24],
  SO: [-421, -80, 24],
  SR: [-445, -80, 24],
  SS: [-469, -80, 32],
  ST: [-501, -80, 32],
  SV: [-533, -80, 28],
  SX: [-561, -80, 24],
  SY: [-585, -80, 24],
  SZ: [-609, -80, 24],
  TC: [-633, -80, 32],
  TD: [-665, -80, 24],
  TF: [-689, -80, 24],
  TG: [-713, -80, 24],
  TH: [-737, -80, 24],
  TJ: [-761, -80, 32],
  TK: [-793, -80, 32],
  TL: [-825, -80, 32],
  TM: [-857, -80, 24],
  TN: [-881, -80, 24],
  TO: [-905, -80, 32],
  TR: [-937, -80, 24],
  TT: [-961, -80, 27],
  TV: [-988, -80, 32],
  TW: [0, -96, 24],
  TZ: [-24, -96, 24],
  UA: [-48, -96, 24],
  UG: [-72, -96, 24],
  UM: [-96, -96, 30],
  US: [-126, -96, 30],
  UY: [-156, -96, 24],
  UZ: [-180, -96, 32],
  VA: [-212, -96, 16],
  VC: [-228, -96, 24],
  VE: [-252, -96, 24],
  VG: [-276, -96, 32],
  VI: [-308, -96, 24],
  VN: [-332, -96, 24],
  VU: [-356, -96, 27],
  WF: [-383, -96, 24],
  WS: [-407, -96, 32],
  YE: [-439, -96, 24],
  YT: [-463, -96, 24],
  ZA: [-487, -96, 24],
  ZM: [-511, -96, 24],
  ZW: [-535, -96, 32],
};

/** The sheet is 16px tall. Everything else is derived from that. */
export const FLAG_H = 16;

export const FLAG_SHEET = "/flags.png";

/**
 * The feed's name for a team, in its own words. Not an ISO code, not a closed
 * union -- it is whatever string TxLINE sent, and it reaches the pitch through a
 * query string, so it has to survive a round trip as text.
 */
export type Country = string;

/**
 * Team names the ISO registry does not answer to.
 *
 * `Intl.DisplayNames` resolves most of the feed on its own, so this table is
 * only the names it gets wrong or has never heard of: the feed's own spellings
 * ("Congo DR", "USA"), the home nations -- four teams with one ISO code between
 * them -- and Kosovo, which has no code at all and borrows one by convention.
 */
const NAME_TO_ISO: Record<string, string> = {
  ENGLAND: "GB",
  SCOTLAND: "GB",
  WALES: "GB",
  "NORTHERN IRELAND": "GB",
  USA: "US",
  "SOUTH KOREA": "KR",
  "NORTH KOREA": "KP",
  "IVORY COAST": "CI",
  "CONGO DR": "CD",
  "CAPE VERDE": "CV",
  "CZECH REPUBLIC": "CZ",
  "BOSNIA & HERZEGOVINA": "BA",
  "TRINIDAD & TOBAGO": "TT",
  RUSSIA: "RU",
  SYRIA: "SY",
  IRAN: "IR",
  LAOS: "LA",
  MOLDOVA: "MD",
  TANZANIA: "TZ",
  VIETNAM: "VN",
  PALESTINE: "PS",
  // Intl qualifies or renames these; the feed does not. The keys are the feed's
  // spelling, since that is the side actually being looked up.
  TURKEY: "TR", // Intl calls it Turkiye.
  TURKIYE: "TR",
  "HONG KONG": "HK",
  MYANMAR: "MM",
  "CARIBBEAN NETHERLANDS": "BQ",
  BONAIRE: "BQ",
  ZANZIBAR: "TZ", // Not a country, but it plays under Tanzania.
};

/**
 * A-Z and ampersand only, upper case: the shape the table is keyed in.
 *
 * The decomposition matters. `Intl.DisplayNames` answers "T\u00fcrkiye" and
 * "Cura\u00e7ao", and dropping every non-A-Z character outright would leave
 * TRKIYE and CURAAO -- names that match nothing. Splitting each accent off its
 * letter first turns them into TURKIYE and CURACAO, which is what the feed calls
 * them.
 */
function normalise(name: string): string {
  return name
    .normalize("NFD") // \u00e9 becomes e + a combining acute
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z& ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every ISO region name the runtime knows, indexed by name rather than by code.
 *
 * Built once, from the codes the sheet actually carries -- so a hit here is
 * guaranteed to have a flag to show for it. This is what spares us hand-writing
 * 150 countries: `Intl.DisplayNames` already knows that Iceland is IS and that
 * Haiti is HT, and it is right far more often than any rule of thumb.
 */
const ISO_BY_NAME: Map<string, string> = (() => {
  const names = new Map<string, string>();
  const display = new Intl.DisplayNames(["en"], { type: "region" });

  for (const code of Object.keys(SPRITE)) {
    let name: string | undefined;
    try {
      name = display.of(code);
    } catch {
      continue; // Not a region code the runtime recognises.
    }
    // `of()` echoes the code back when it knows nothing; that is not a name.
    if (!name || name === code) continue;
    names.set(normalise(name), code);
  }

  return names;
})();

/**
 * The ISO code for a team, or undefined when the sheet has no flag for it.
 *
 * Undefined is a real answer rather than a failure: the feed carries "World XI",
 * "England XI" and under-23 sides, and none of those is a country. The caller
 * decides what to show instead.
 *
 * There is deliberately no fuzzy fallback. An earlier version guessed at the
 * first two letters of the name, which is right for Brazil and France and wrong
 * for Haiti, Japan, Portugal and Turkey -- and a wrong flag is worse than none,
 * because nothing about it looks like a bug.
 */
export function isoCode(name: string): string | undefined {
  const key = normalise(name);

  const known = NAME_TO_ISO[key];
  if (known) return known;

  const resolved = ISO_BY_NAME.get(key);
  if (resolved) return resolved;

  // A U23 or U21 side flies its country's flag. So does an "XI".
  const stripped = key.replace(/ (?:U\d+|XI)$/, "");
  if (stripped !== key) return isoCode(stripped);

  return undefined;
}

/** Where a team's flag sits on the sheet, if it has one. */
export function flagSprite(
  name: string,
): { x: number; y: number; w: number } | undefined {
  const iso = isoCode(name);
  if (!iso) return undefined;

  const cell = SPRITE[iso];
  return cell ? { x: cell[0], y: cell[1], w: cell[2] } : undefined;
}

/** The one the run is played in when the URL says nothing useful. */
export const DEFAULT_COUNTRY: Country = "Brazil";

/**
 * Read a country back off a URL. The game is reachable directly and the query
 * string is a user's to mangle, so a name with no flag falls back rather than
 * leaving the pitch with no colours at all.
 */
export function toCountry(name: string | null | undefined): Country {
  if (!name) return DEFAULT_COUNTRY;
  return flagSprite(name) ? name : DEFAULT_COUNTRY;
}
