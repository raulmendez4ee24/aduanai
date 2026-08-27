/**
 * Catálogo de países ISO 3166-1 alfa-2 (Operación 2026-08).
 *
 * "VIETNAM nunca más como texto libre": el selector de país del Pre-validador
 * y la Pre-Glosa es un combo sobre esta lista. El server normaliza ISO-2 y
 * nombres (compliance-lookup.normalizeCountry) y el motor del Cotizador
 * (server/lib/treaties.ts) evalúa T-MEC / TLCUEM / CPTPP por ISO-2 — aquí solo
 * se etiqueta la pertenencia a tratado para el usuario (la fuente de verdad
 * sigue en el server).
 */
export interface Pais { iso2: string; nombre: string; tratados?: ('TMEC' | 'TLCUEM' | 'CPTPP')[] }

const UE = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'])
const TMEC = new Set(['US', 'CA', 'MX'])
// Partes con CPTPP en vigor para México (etiqueta informativa; el Cotizador
// calcula solo JP/AU/VN hoy — ver quoter.getPreferentialRates).
const CPTPP = new Set(['AU', 'BN', 'CA', 'CL', 'JP', 'MY', 'NZ', 'PE', 'SG', 'VN', 'GB'])

const LISTA: [string, string][] = [
  ['AF', 'Afganistán'], ['AL', 'Albania'], ['DE', 'Alemania'], ['AD', 'Andorra'], ['AO', 'Angola'], ['AI', 'Anguila'], ['AQ', 'Antártida'], ['AG', 'Antigua y Barbuda'],
  ['SA', 'Arabia Saudita'], ['DZ', 'Argelia'], ['AR', 'Argentina'], ['AM', 'Armenia'], ['AW', 'Aruba'], ['AU', 'Australia'], ['AT', 'Austria'], ['AZ', 'Azerbaiyán'],
  ['BS', 'Bahamas'], ['BD', 'Bangladés'], ['BB', 'Barbados'], ['BH', 'Baréin'], ['BE', 'Bélgica'], ['BZ', 'Belice'], ['BJ', 'Benín'], ['BM', 'Bermudas'], ['BY', 'Bielorrusia'],
  ['BO', 'Bolivia'], ['BA', 'Bosnia y Herzegovina'], ['BW', 'Botsuana'], ['BR', 'Brasil'], ['BN', 'Brunéi'], ['BG', 'Bulgaria'], ['BF', 'Burkina Faso'], ['BI', 'Burundi'], ['BT', 'Bután'],
  ['CV', 'Cabo Verde'], ['KH', 'Camboya'], ['CM', 'Camerún'], ['CA', 'Canadá'], ['QA', 'Catar'], ['TD', 'Chad'], ['CL', 'Chile'], ['CN', 'China'], ['CY', 'Chipre'],
  ['CO', 'Colombia'], ['KM', 'Comoras'], ['CG', 'Congo'], ['CD', 'Congo (Rep. Democrática)'], ['KP', 'Corea del Norte'], ['KR', 'Corea del Sur'], ['CI', 'Costa de Marfil'], ['CR', 'Costa Rica'],
  ['HR', 'Croacia'], ['CU', 'Cuba'], ['CW', 'Curazao'], ['DK', 'Dinamarca'], ['DM', 'Dominica'], ['EC', 'Ecuador'], ['EG', 'Egipto'], ['SV', 'El Salvador'], ['AE', 'Emiratos Árabes Unidos'],
  ['ER', 'Eritrea'], ['SK', 'Eslovaquia'], ['SI', 'Eslovenia'], ['ES', 'España'], ['US', 'Estados Unidos'], ['EE', 'Estonia'], ['SZ', 'Esuatini'], ['ET', 'Etiopía'],
  ['PH', 'Filipinas'], ['FI', 'Finlandia'], ['FJ', 'Fiyi'], ['FR', 'Francia'], ['GA', 'Gabón'], ['GM', 'Gambia'], ['GE', 'Georgia'], ['GH', 'Ghana'], ['GI', 'Gibraltar'], ['GD', 'Granada'],
  ['GR', 'Grecia'], ['GL', 'Groenlandia'], ['GP', 'Guadalupe'], ['GU', 'Guam'], ['GT', 'Guatemala'], ['GF', 'Guayana Francesa'], ['GG', 'Guernsey'], ['GN', 'Guinea'], ['GQ', 'Guinea Ecuatorial'],
  ['GW', 'Guinea-Bisáu'], ['GY', 'Guyana'], ['HT', 'Haití'], ['HN', 'Honduras'], ['HK', 'Hong Kong'], ['HU', 'Hungría'], ['IN', 'India'], ['ID', 'Indonesia'], ['IQ', 'Irak'], ['IR', 'Irán'],
  ['IE', 'Irlanda'], ['IS', 'Islandia'], ['KY', 'Islas Caimán'], ['FO', 'Islas Feroe'], ['FK', 'Islas Malvinas'], ['MP', 'Islas Marianas del Norte'], ['MH', 'Islas Marshall'], ['SB', 'Islas Salomón'],
  ['TC', 'Islas Turcas y Caicos'], ['VG', 'Islas Vírgenes Británicas'], ['VI', 'Islas Vírgenes de EE. UU.'], ['IL', 'Israel'], ['IT', 'Italia'], ['JM', 'Jamaica'], ['JP', 'Japón'], ['JE', 'Jersey'],
  ['JO', 'Jordania'], ['KZ', 'Kazajistán'], ['KE', 'Kenia'], ['KG', 'Kirguistán'], ['KI', 'Kiribati'], ['KW', 'Kuwait'], ['LA', 'Laos'], ['LS', 'Lesoto'], ['LV', 'Letonia'], ['LB', 'Líbano'],
  ['LR', 'Liberia'], ['LY', 'Libia'], ['LI', 'Liechtenstein'], ['LT', 'Lituania'], ['LU', 'Luxemburgo'], ['MO', 'Macao'], ['MK', 'Macedonia del Norte'], ['MG', 'Madagascar'], ['MY', 'Malasia'],
  ['MW', 'Malaui'], ['MV', 'Maldivas'], ['ML', 'Malí'], ['MT', 'Malta'], ['MA', 'Marruecos'], ['MQ', 'Martinica'], ['MU', 'Mauricio'], ['MR', 'Mauritania'], ['YT', 'Mayotte'], ['MX', 'México'],
  ['FM', 'Micronesia'], ['MD', 'Moldavia'], ['MC', 'Mónaco'], ['MN', 'Mongolia'], ['ME', 'Montenegro'], ['MS', 'Montserrat'], ['MZ', 'Mozambique'], ['MM', 'Myanmar'], ['NA', 'Namibia'],
  ['NR', 'Nauru'], ['NP', 'Nepal'], ['NI', 'Nicaragua'], ['NE', 'Níger'], ['NG', 'Nigeria'], ['NU', 'Niue'], ['NO', 'Noruega'], ['NC', 'Nueva Caledonia'], ['NZ', 'Nueva Zelanda'], ['OM', 'Omán'],
  ['NL', 'Países Bajos'], ['PK', 'Pakistán'], ['PW', 'Palaos'], ['PS', 'Palestina'], ['PA', 'Panamá'], ['PG', 'Papúa Nueva Guinea'], ['PY', 'Paraguay'], ['PE', 'Perú'], ['PF', 'Polinesia Francesa'],
  ['PL', 'Polonia'], ['PT', 'Portugal'], ['PR', 'Puerto Rico'], ['GB', 'Reino Unido'], ['CF', 'República Centroafricana'], ['CZ', 'República Checa'], ['DO', 'República Dominicana'], ['RE', 'Reunión'],
  ['RW', 'Ruanda'], ['RO', 'Rumania'], ['RU', 'Rusia'], ['EH', 'Sahara Occidental'], ['WS', 'Samoa'], ['AS', 'Samoa Americana'], ['KN', 'San Cristóbal y Nieves'], ['SM', 'San Marino'],
  ['PM', 'San Pedro y Miquelón'], ['VC', 'San Vicente y las Granadinas'], ['SH', 'Santa Elena'], ['LC', 'Santa Lucía'], ['ST', 'Santo Tomé y Príncipe'], ['SN', 'Senegal'], ['RS', 'Serbia'],
  ['SC', 'Seychelles'], ['SL', 'Sierra Leona'], ['SG', 'Singapur'], ['SX', 'Sint Maarten'], ['SY', 'Siria'], ['SO', 'Somalia'], ['LK', 'Sri Lanka'], ['ZA', 'Sudáfrica'], ['SD', 'Sudán'],
  ['SS', 'Sudán del Sur'], ['SE', 'Suecia'], ['CH', 'Suiza'], ['SR', 'Surinam'], ['TH', 'Tailandia'], ['TW', 'Taiwán'], ['TZ', 'Tanzania'], ['TJ', 'Tayikistán'], ['TL', 'Timor Oriental'],
  ['TG', 'Togo'], ['TO', 'Tonga'], ['TT', 'Trinidad y Tobago'], ['TN', 'Túnez'], ['TM', 'Turkmenistán'], ['TR', 'Turquía'], ['TV', 'Tuvalu'], ['UA', 'Ucrania'], ['UG', 'Uganda'],
  ['UY', 'Uruguay'], ['UZ', 'Uzbekistán'], ['VU', 'Vanuatu'], ['VA', 'Vaticano'], ['VE', 'Venezuela'], ['VN', 'Vietnam'], ['YE', 'Yemen'], ['DJ', 'Yibuti'], ['ZM', 'Zambia'], ['ZW', 'Zimbabue'],
]

export const PAISES: Pais[] = LISTA.map(([iso2, nombre]) => {
  const tratados: Pais['tratados'] = []
  if (TMEC.has(iso2)) tratados.push('TMEC')
  if (UE.has(iso2)) tratados.push('TLCUEM')
  if (CPTPP.has(iso2)) tratados.push('CPTPP')
  return tratados.length ? { iso2, nombre, tratados } : { iso2, nombre }
}).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

const POR_ISO = new Map(PAISES.map(p => [p.iso2, p]))
export function paisPorIso(iso2: string | null | undefined): Pais | null {
  if (!iso2) return null
  return POR_ISO.get(iso2.trim().toUpperCase()) ?? null
}
export function etiquetaPais(iso2: string | null | undefined): string {
  const p = paisPorIso(iso2)
  return p ? `${p.iso2} — ${p.nombre}` : (iso2 ?? '')
}
/** ISO-3 frecuentes en archivos M3 (USA, CHN, MEX…) → ISO-2. */
const ISO3: Record<string, string> = { USA: 'US', CHN: 'CN', MEX: 'MX', CAN: 'CA', DEU: 'DE', JPN: 'JP', KOR: 'KR', VNM: 'VN', IND: 'IN', TWN: 'TW', ESP: 'ES', ITA: 'IT', FRA: 'FR', BRA: 'BR', GBR: 'GB', MYS: 'MY', THA: 'TH', IDN: 'ID', NLD: 'NL', AUS: 'AU' }
export function normalizarIso2(v: string | null | undefined): string {
  if (!v) return ''
  const u = v.trim().toUpperCase()
  if (u.length === 2 && POR_ISO.has(u)) return u
  if (u.length === 3 && ISO3[u]) return ISO3[u]
  const byName = PAISES.find(p => p.nombre.toUpperCase() === u)
  return byName ? byName.iso2 : u
}
