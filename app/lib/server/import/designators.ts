import built from "../carriers.json";

// ICAO designators of the airlines people fly most, with their IATA codes.
// Exports from Flighty and similar apps use ICAO; flight numbers on screen use
// IATA. These pairs are checked by hand and win over the ones read from
// Wikidata (scripts/build-airlines.mjs); anything else is mapped while
// naming, when the model is on.
const PAIRS = `
CPA CX HDA KA CRK HX HKE UO AMU NX CCA CA CES MU CSN CZ CHH HU CSZ ZH CXA MF CSC 3U CDG SC CQH 9C DKH HO CSH FM GCR GS LKE 8L CBJ JD OKA BK CHB PN CQN OQ HBH NS
EVA BR CAL CI TTW IT SJX JX MDA AE UIA B7
JAL JL ANA NH APJ MM JJP GK SKY BC ADO HD SNJ 6J JTA NU TZP ZG SFJ 7G
KAL KE AAR OZ JNA LJ JJA 7C TWB TW ABL BX ASV RS ESR ZE
SIA SQ TGW TR MAS MH AXM AK XAX D7 THA TG AIQ FD TLM SL NOK DD BKP PG VJC VJ HVN VN PAL PR CEB 5J GIA GA LNI JT AWQ QZ RBA BI MXD OD
AIC AI IGO 6E AXB IX VTI UK SEJ SG ALK UL
UAE EK ETD EY QTR QR SVA SV GFA GF OMA WY FDB FZ ABY G9 ELY LY RJA RJ MEA ME KAC KU THY TK PGT PC
BAW BA VIR VS DLH LH AFR AF KLM KL SWR LX AUA OS SAS SK FIN AY IBE IB VLG VY TAP TP ITY AZ EIN EI RYR FR EZY U2 WZZ W6 NAX DY BEL SN LOT LO CSA OK AEE A3 TRA HV EWG EW CFG DE ICE FI AFL SU VOE V7 BTI BT
AAL AA UAL UA DAL DL ASA AS JBU B6 SWA WN ACA AC WJA WS HAL HA NKS NK FFT F9 AMX AM VOI Y4 AVA AV LAN LA GLO G3 AZU AD CMP CM ARG AR
QFA QF JST JQ VOZ VA ANZ NZ FJI FJ ANG PX
ETH ET SAA SA MSR MS RAM AT KQA KQ
`.trim().split(/\s+/);

export const DESIGNATORS = new Map<string, string>([
  ...Object.entries(built.icao as Record<string, string>),
  ...Array.from({ length: PAIRS.length / 2 }, (_, index): [string, string] => [PAIRS[index * 2], PAIRS[index * 2 + 1]]),
]);
