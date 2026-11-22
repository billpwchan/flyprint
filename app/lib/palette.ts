// Colour on the stage comes only from who flew: each person has a muted tone
// of their own, and flights two linked people took together share one warm
// accent that no person's tone uses.
export const palette = {
  space: "#08090b",
  ocean: "#0a0d11",
  land: "#1a2028",
  // Coastlines and the graticule: faint instrument lines over the ground.
  coast: "rgba(150,182,224,0.2)",
  graticule: "rgba(170,196,230,0.05)",
  border: "rgba(255,255,255,0.07)",
  photoCoast: "rgba(140,168,230,0.16)",
  airport: "#eef0f2",
  airportStroke: "#08090b",
  tones: ["#87aedd", "#dfa58b", "#9ccba3", "#b9a5e4", "#e59cb5", "#79c6cf"],
  together: "#f3cf7f",
} as const;

export const TONES = palette.tones.length;
export const toneColor = (tone: number) => palette.tones[((tone % TONES) + TONES) % TONES];
// Two people side by side never wear the same colour: the other moves to the next tone.
export const toneBeside = (own: number, other: number) => other % TONES === own % TONES ? (own + 1) % TONES : other % TONES;
