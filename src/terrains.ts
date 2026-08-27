// The four selectable worlds. Each is data only: palette, road geometry and the
// difficulty knobs the spawner reads.

export interface TerrainPalette {
  ground: string;
  groundAlt: string;
  detail: string;
  detailAlt: string;
  road: string;
  roadEdge: string;
  laneMark: string;
  barrier: string;
  barrierAlt: string;
}

export type SceneryKind = "tree" | "house" | "girder" | "palm" | "pine" | "rock" | "wave";

export interface Terrain {
  id: string;
  name: string;
  blurb: string;
  palette: TerrainPalette;
  /** Road width in world units at the start of a run. */
  roadWidth: number;
  /** How much the road center may wander, in world units. */
  curveAmount: number;
  /** Multipliers applied on top of the global difficulty ramp. */
  trafficDensity: number;
  truckBias: number;
  oilBias: number;
  rockBias: number;
  puddleBias: number;
  aggressiveBias: number;
  scenery: SceneryKind[];
  /** Optional strip painted between road edge and scenery (water, sand...). */
  shoulder?: string;
}

export const TERRAINS: Terrain[] = [
  {
    id: "grassland",
    name: "GRASSLAND",
    blurb: "WIDE ROAD · GENTLE TRAFFIC",
    palette: {
      ground: "#00b800",
      groundAlt: "#00a000",
      detail: "#008800",
      detailAlt: "#f87858",
      road: "#7c7c7c",
      roadEdge: "#bcbcbc",
      laneMark: "#ffffff",
      barrier: "#00e800",
      barrierAlt: "#ffffff",
    },
    roadWidth: 116,
    curveAmount: 10,
    trafficDensity: 1.0,
    truckBias: 0.7,
    oilBias: 0.6,
    rockBias: 0.4,
    puddleBias: 0.8,
    aggressiveBias: 0.7,
    scenery: ["tree", "house", "tree"],
  },
  {
    id: "bridge",
    name: "BRIDGE",
    blurb: "NARROW · TRUCK COUNTRY",
    palette: {
      ground: "#0058f8",
      groundAlt: "#0040c0",
      detail: "#3cbcfc",
      detailAlt: "#bcbcbc",
      road: "#8c8c8c",
      roadEdge: "#e4e4e4",
      laneMark: "#ffffff",
      barrier: "#d82800",
      barrierAlt: "#ffffff",
    },
    roadWidth: 96,
    curveAmount: 4,
    trafficDensity: 1.05,
    truckBias: 1.8,
    oilBias: 0.7,
    rockBias: 0.5,
    puddleBias: 1.4,
    aggressiveBias: 0.9,
    scenery: ["girder", "wave", "girder"],
    shoulder: "#3cbcfc",
  },
  {
    id: "coast",
    name: "COAST",
    blurb: "SLIPPERY · OIL EVERYWHERE",
    palette: {
      ground: "#f8d878",
      groundAlt: "#e8c060",
      detail: "#00a800",
      detailAlt: "#f87858",
      road: "#787878",
      roadEdge: "#d8d8d8",
      laneMark: "#ffffff",
      barrier: "#f8f8f8",
      barrierAlt: "#d82800",
    },
    roadWidth: 106,
    curveAmount: 16,
    trafficDensity: 1.15,
    truckBias: 0.9,
    oilBias: 2.0,
    rockBias: 0.8,
    puddleBias: 1.2,
    aggressiveBias: 1.0,
    scenery: ["palm", "rock", "palm"],
    shoulder: "#00a8f8",
  },
  {
    id: "forest",
    name: "FOREST",
    blurb: "TIGHT · RUTHLESS RIVALS",
    palette: {
      ground: "#004000",
      groundAlt: "#003000",
      detail: "#008000",
      detailAlt: "#503000",
      road: "#6c6c6c",
      roadEdge: "#a8a8a8",
      laneMark: "#ffffff",
      barrier: "#503000",
      barrierAlt: "#f8d800",
    },
    roadWidth: 92,
    curveAmount: 20,
    trafficDensity: 1.3,
    truckBias: 1.0,
    oilBias: 1.1,
    rockBias: 1.6,
    puddleBias: 0.7,
    aggressiveBias: 1.6,
    scenery: ["pine", "pine", "rock"],
  },
];

export function terrainById(id: string): Terrain {
  return TERRAINS.find((t) => t.id === id) ?? TERRAINS[0];
}
