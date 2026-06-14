export type Student = {
  id: string;
  name: string;
  color: string;
  score: number;
  participation: number;
};

export const FRAGMENTS = [
  "Heart Pump",
  "Blood Pathway",
  "Pulse Signal",
  "Resting Data",
  "Exercise Data",
  "Graph Badge",
  "Fair Test Badge",
  "Conclusion Badge",
] as const;
export type Fragment = (typeof FRAGMENTS)[number];

export type MissionState = {
  screen: number;
  students: Student[];
  spotlightId: string | null;
  unlocked: Fragment[];
  classPrediction: string | null;
  restingSamples: (number | null)[];
  exerciseSamples: (number | null)[];
  callsCount: number;
  questionsAnswered: number;
  exitVerdict: null | "got" | "almost" | "needs";
};

export const STUDENT_COLORS = [
  "oklch(0.7 0.18 25)",
  "oklch(0.7 0.18 245)",
  "oklch(0.78 0.16 145)",
  "oklch(0.82 0.16 80)",
  "oklch(0.7 0.2 305)",
  "oklch(0.75 0.18 200)",
  "oklch(0.72 0.18 60)",
  "oklch(0.7 0.18 340)",
];
