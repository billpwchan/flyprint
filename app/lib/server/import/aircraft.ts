import type { Aircraft } from "../../data";

// A type as an export or a document writes it ("Boeing 777-300ER", "77W",
// "空客A330-300", "A21N") to the model name, ICAO designator and body the
// flight page uses. Unknown types are dropped rather than guessed.

type Type = [pattern: RegExp, model: string, icao: string, body: Aircraft["body"]];
const W = "widebody", N = "narrowbody";
const TYPES: Type[] = [
  [/a ?350.?1000|a35k|351/, "Airbus A350-1000", "A35K", W],
  [/a ?350|a359|359/, "Airbus A350-900", "A359", W],
  [/a ?380|a388|388/, "Airbus A380-800", "A388", W],
  [/a ?330.?900|a339|339/, "Airbus A330-900neo", "A339", W],
  [/a ?330.?200|a332|332/, "Airbus A330-200", "A332", W],
  [/a ?330|a333|333/, "Airbus A330-300", "A333", W],
  [/a ?340.?600|a346|346/, "Airbus A340-600", "A346", W],
  [/a ?340|a343|343/, "Airbus A340-300", "A343", W],
  [/a ?321.?(neo|lr|xlr)|a21n|32q/, "Airbus A321neo", "A21N", N],
  [/a ?321|321/, "Airbus A321", "A321", N],
  [/a ?320.?neo|a20n|32n/, "Airbus A320neo", "A20N", N],
  [/a ?320|320/, "Airbus A320", "A320", N],
  [/a ?319|319/, "Airbus A319", "A319", N],
  [/a ?220.?300|bcs3|cs300|223/, "Airbus A220-300", "BCS3", N],
  [/a ?220|bcs1|cs100|221/, "Airbus A220-100", "BCS1", N],
  [/777.?300\s*er|77w|b77w/, "Boeing 777-300ER", "B77W", W],
  [/777.?300|b773|773/, "Boeing 777-300", "B773", W],
  [/777.?9|b779/, "Boeing 777-9", "B779", W],
  [/777.?(200\s*lr|f)|77l|b77l/, "Boeing 777-200LR", "B77L", W],
  [/777|b772|772/, "Boeing 777-200", "B772", W],
  [/787.?10|78x|b78x|781/, "Boeing 787-10", "B78X", W],
  [/787.?9|b789|789/, "Boeing 787-9", "B789", W],
  [/787|b788|788/, "Boeing 787-8", "B788", W],
  [/747.?8|b748|74h/, "Boeing 747-8", "B748", W],
  [/747|b744|744/, "Boeing 747-400", "B744", W],
  [/767.?400|b764/, "Boeing 767-400ER", "B764", W],
  [/767|b763|763/, "Boeing 767-300", "B763", W],
  [/757.?300|b753/, "Boeing 757-300", "B753", N],
  [/757|b752|752/, "Boeing 757-200", "B752", N],
  [/737.?max.?9|b39m|7m9/, "Boeing 737 MAX 9", "B39M", N],
  [/737.?max|b38m|7m8/, "Boeing 737 MAX 8", "B38M", N],
  [/737.?900|b739|739/, "Boeing 737-900", "B739", N],
  [/737.?800|b738|738/, "Boeing 737-800", "B738", N],
  [/737.?700|b737|73g/, "Boeing 737-700", "B737", N],
  [/737.?300|b733|733/, "Boeing 737-300", "B733", N],
  [/c ?919/, "COMAC C919", "C919", N],
  [/arj ?21|c909|aj27/, "COMAC ARJ21", "AJ27", N],
  [/e ?195|e195|e95/, "Embraer E195", "E195", N],
  [/e ?190|e190|e90/, "Embraer E190", "E190", N],
  [/e ?175|e175|e75/, "Embraer E175", "E75L", N],
  [/atr ?72|at7[2-6]/, "ATR 72", "AT76", N],
  [/dash ?8|q400|dh8d/, "De Havilland Dash 8-400", "DH8D", N],
  [/crj ?900|crj9/, "Bombardier CRJ900", "CRJ9", N],
];

export function aircraftFor(text: string, registration = "", operated = true): Aircraft | undefined {
  const value = text.toLowerCase().replace(/boeing|airbus|空客|空中客车|波音|商飞|comac|embraer|巴航工业/g, (word) => /波音|boeing/.test(word) ? " " : " a").replace(/\s+/g, " ").trim();
  if (!value) return undefined;
  for (const [pattern, model, icao, body] of TYPES) {
    if (pattern.test(value)) {
      const aircraft: Aircraft = { model, icao, source: operated ? "operated" : "scheduled", body };
      const tail = registration.trim().toUpperCase();
      if (/^[A-Z0-9]{1,2}-?[A-Z0-9]{2,5}$/.test(tail)) aircraft.registration = tail;
      return aircraft;
    }
  }
  return undefined;
}
