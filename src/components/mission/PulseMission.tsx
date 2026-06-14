import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Heart, Activity, Users, Sparkles, Plus, Trash2, Pencil, Play, Pause, RotateCcw,
  Check, X, ChevronRight, BookOpen, Printer, Volume2, Trophy, AlertTriangle,
  Stethoscope, FlaskConical, BarChart3, Timer as TimerIcon, ArrowRight, Zap, Lock,
} from "lucide-react";
import { FRAGMENTS, STUDENT_COLORS, type Fragment, type MissionState, type Student } from "./types";
import { TEACHER_NOTES, LESSON_OBJECTIVE, COMMON_MISCONCEPTIONS, SAFETY_NOTES } from "./teacher-notes";
import {
  fetchLaunchContext,
  getLaunchToken,
  sendMissionCallback,
  type LaunchContext,
} from "@/lib/schoolynq";

// A single recorded spotlight answer, attributed to a student, for the
// Schoolynq dashboard.
type MissionResponse = {
  studentId: string;
  questionId: string;
  questionType: string;
  isCorrect: boolean;
};

const STORAGE_KEY = "pulse-mission-v1";

const DEFAULT_STUDENTS: Student[] = ["Aria", "Diego", "Mei", "Jonah", "Priya"].map((n, i) => ({
  id: crypto.randomUUID(),
  name: n,
  color: STUDENT_COLORS[i % STUDENT_COLORS.length],
  score: 0,
  participation: 0,
}));

const initialState: MissionState = {
  screen: 1,
  students: DEFAULT_STUDENTS,
  spotlightId: null,
  unlocked: [],
  classPrediction: null,
  restingSamples: [null, null, null, null, null],
  exerciseSamples: [null, null, null, null, null],
  callsCount: 0,
  questionsAnswered: 0,
  exitVerdict: null,
};

const TOTAL_SCREENS = 19;

function loadState(): MissionState {
  if (typeof window === "undefined") return initialState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw);
    return { ...initialState, ...parsed };
  } catch {
    return initialState;
  }
}

export default function PulseMission() {
  const [state, setState] = useState<MissionState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  // ----- Schoolynq launch integration (no-op when opened standalone) -----
  const launchTokenRef = useRef<string | null>(null);
  const [launchContext, setLaunchContext] = useState<LaunchContext | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const responsesRef = useRef<MissionResponse[]>([]);
  // Tracks which run (keyed by its start time) has already been reported.
  const reportedRunRef = useRef<string | null>(null);
  const prevScreenRef = useRef(state.screen);

  // Read the launch token after mount, then seed the real roster from
  // Schoolynq and start a clean session with it.
  useEffect(() => {
    const token = getLaunchToken();
    if (!token) return;
    launchTokenRef.current = token;
    let cancelled = false;

    fetchLaunchContext(token)
      .then((context) => {
        if (cancelled) return;
        setLaunchContext(context);
        startedAtRef.current = new Date().toISOString();
        responsesRef.current = [];
        reportedRunRef.current = null;
        setState({
          ...initialState,
          students: context.students.map((student, i) => ({
            id: student.id,
            name: student.name,
            color: STUDENT_COLORS[i % STUDENT_COLORS.length],
            score: 0,
            participation: 0,
          })),
        });
      })
      .catch(() => {
        // On failure, fall back to the standalone default roster.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Returning to the landing screen begins a fresh run, so the next completion
  // is reported as a new session rather than de-duplicated.
  useEffect(() => {
    const prev = prevScreenRef.current;
    prevScreenRef.current = state.screen;
    if (!launchContext) return;
    if (state.screen === 1 && prev !== 1) {
      startedAtRef.current = new Date().toISOString();
      responsesRef.current = [];
      reportedRunRef.current = null;
    }
  }, [state.screen, launchContext]);

  // Mission complete (screen 19) while launched from Schoolynq: report once.
  useEffect(() => {
    const token = launchTokenRef.current;
    if (state.screen !== 19 || !token || !launchContext) return;
    const startedAt = startedAtRef.current;
    if (!startedAt || reportedRunRef.current === startedAt) return;
    reportedRunRef.current = startedAt;

    // Only report students who belong to the launch (a teacher may have added
    // extra names on the roster screen), so the callback stays valid.
    const allowed = new Set(launchContext.students.map((s) => s.id));
    sendMissionCallback(token, launchContext, {
      students: state.students
        .filter((s) => allowed.has(s.id))
        .map((s) => ({ id: s.id, name: s.name, answered: s.participation, correct: s.score })),
      responses: responsesRef.current.filter((r) => allowed.has(r.studentId)),
      startedAt,
      endedAt: new Date().toISOString(),
    }).catch((error) => {
      console.error("Failed to report mission results to Schoolynq", error);
      reportedRunRef.current = null; // allow a retry
    });
  }, [state.screen, launchContext, state.students]);

  const setScreen = (n: number) => setState((s) => ({ ...s, screen: n }));
  const next = () => setScreen(Math.min(state.screen + 1, TOTAL_SCREENS));
  const unlock = (f: Fragment) =>
    setState((s) => (s.unlocked.includes(f) ? s : { ...s, unlocked: [...s.unlocked, f] }));

  const callRandomStudent = () => {
    const pool = state.students;
    if (pool.length === 0) return;
    const sorted = [...pool].sort((a, b) => a.participation - b.participation);
    const min = sorted[0].participation;
    const candidates = sorted.filter((s) => s.participation === min);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    setState((s) => ({
      ...s,
      spotlightId: chosen.id,
      callsCount: s.callsCount + 1,
      students: s.students.map((st) =>
        st.id === chosen.id ? { ...st, participation: st.participation + 1 } : st,
      ),
    }));
  };

  const awardPoint = (id: string) => {
    setState((s) => ({
      ...s,
      students: s.students.map((st) => (st.id === id ? { ...st, score: st.score + 1 } : st)),
      questionsAnswered: s.questionsAnswered + 1,
    }));
  };
  const noteAnswered = () => setState((s) => ({ ...s, questionsAnswered: s.questionsAnswered + 1 }));
  // Records a spotlight answer so it can be reported to Schoolynq on completion.
  const recordResponse = (response: MissionResponse) => { responsesRef.current.push(response); };

  const restingAvg = useMemo(() => {
    const v = state.restingSamples.filter((x): x is number => typeof x === "number" && x > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }, [state.restingSamples]);
  const exerciseAvg = useMemo(() => {
    const v = state.exerciseSamples.filter((x): x is number => typeof x === "number" && x > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }, [state.exerciseSamples]);

  const restingBpm = restingAvg ? Math.round(restingAvg * 2) : null;
  const exerciseBpm = exerciseAvg ? Math.round(exerciseAvg * 2) : null;

  const spotlightStudent = state.students.find((s) => s.id === state.spotlightId) ?? null;

  const reset = () => {
    if (!confirm("Reset the mission and clear all data?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setState({ ...initialState, students: DEFAULT_STUDENTS.map((s) => ({ ...s, id: crypto.randomUUID(), score: 0, participation: 0 })) });
  };

  const ctx: ScreenCtx = {
    state, setState, next, setScreen, unlock,
    callRandomStudent, awardPoint, noteAnswered, recordResponse,
    restingAvg, exerciseAvg, restingBpm, exerciseBpm,
    spotlightStudent,
  };

  return (
    <div className="min-h-screen text-foreground">
      {state.screen > 1 && state.screen < 19 && (
        <TopBar
          state={state}
          onNotes={() => setNotesOpen(true)}
          onPrint={() => setPrintOpen(true)}
          onHome={() => setScreen(1)}
        />
      )}
      <main className="px-6 pb-32 pt-6 md:px-10">
        {renderScreen(state.screen, ctx)}
      </main>

      {state.screen > 2 && state.screen < 19 && <DashboardWidget unlocked={state.unlocked} />}

      <TeacherNotesDrawer open={notesOpen} onClose={() => setNotesOpen(false)} screen={state.screen} />
      <PrintableHandout open={printOpen} onClose={() => setPrintOpen(false)} state={state} restingBpm={restingBpm} exerciseBpm={exerciseBpm} />

      <button
        onClick={reset}
        className="no-print fixed bottom-4 left-4 z-30 rounded-full bg-secondary/80 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        Reset mission
      </button>
    </div>
  );
}

type ScreenCtx = {
  state: MissionState;
  setState: React.Dispatch<React.SetStateAction<MissionState>>;
  next: () => void;
  setScreen: (n: number) => void;
  unlock: (f: Fragment) => void;
  callRandomStudent: () => void;
  awardPoint: (id: string) => void;
  noteAnswered: () => void;
  recordResponse: (response: MissionResponse) => void;
  restingAvg: number | null;
  exerciseAvg: number | null;
  restingBpm: number | null;
  exerciseBpm: number | null;
  spotlightStudent: Student | null;
};

function renderScreen(n: number, c: ScreenCtx) {
  switch (n) {
    case 1: return <Landing {...c} />;
    case 2: return <Roster {...c} />;
    case 3: return <Briefing {...c} />;
    case 4: return <Prediction {...c} />;
    case 5: return <MiniTeach {...c} />;
    case 6: return <SpotlightQuestion {...c} qIndex={1} />;
    case 7: return <FindPulseGuide {...c} />;
    case 8: return <PulseTimer {...c} kind="resting" />;
    case 9: return <DataEntry {...c} kind="resting" />;
    case 10: return <ExerciseGuide {...c} />;
    case 11: return <ExerciseTimer {...c} />;
    case 12: return <PulseTimer {...c} kind="exercise" />;
    case 13: return <DataEntry {...c} kind="exercise" />;
    case 14: return <GraphReveal {...c} />;
    case 15: return <FairTest {...c} />;
    case 16: return <SpotlightQuestion {...c} qIndex={2} />;
    case 17: return <BossChallenge {...c} />;
    case 18: return <ExitTicket {...c} />;
    case 19: return <MissionComplete {...c} />;
    default: return <Landing {...c} />;
  }
}

/* ============ TOP BAR ============ */
function TopBar({ state, onNotes, onPrint, onHome }: {
  state: MissionState; onNotes: () => void; onPrint: () => void; onHome: () => void;
}) {
  return (
    <div className="no-print sticky top-0 z-20 border-b border-border/50 bg-[oklch(0.16_0.05_275/0.7)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 md:px-10">
        <div className="flex items-center gap-3">
          <button onClick={onHome} className="flex items-center gap-2 text-left">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[var(--vessel-red)] to-[var(--vessel-blue)] shadow-[var(--shadow-vessel)]">
              <Heart className="h-4 w-4 text-white" fill="currentColor" />
            </div>
            <div className="leading-tight">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Now investigating</div>
              <div className="font-display text-base text-gold">The Pulse Signal</div>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_SCREENS }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i + 1 === state.screen
                  ? "w-6 bg-gold gold-glow"
                  : i + 1 < state.screen
                  ? "w-2 bg-gold/60"
                  : "w-2 bg-border"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden flex-wrap items-center gap-1.5 md:flex">
            {state.students.slice(0, 5).map((s) => (
              <ScoreBadge key={s.id} student={s} />
            ))}
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-secondary/60 text-muted-foreground hover:text-foreground" aria-label="Sound">
            <Volume2 className="h-4 w-4" />
          </button>
          <Button variant="ghost" onClick={onNotes} className="h-9 gap-1.5 bg-secondary/60 text-foreground hover:bg-secondary">
            <BookOpen className="h-4 w-4" /> Teacher Notes
          </Button>
          <Button variant="ghost" onClick={onPrint} className="h-9 gap-1.5 bg-secondary/60 text-foreground hover:bg-secondary">
            <Printer className="h-4 w-4" /> Handout
          </Button>
        </div>
      </div>
    </div>
  );
}

function ScoreBadge({ student }: { student: Student }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-secondary/60 py-1 pl-1 pr-2.5">
      <div className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-[oklch(0.15_0.05_275)]" style={{ background: student.color }}>
        {student.name[0]}
      </div>
      <span className="text-xs font-medium">{student.score}</span>
    </div>
  );
}

/* ============ DASHBOARD WIDGET ============ */
function DashboardWidget({ unlocked }: { unlocked: Fragment[] }) {
  return (
    <div className="no-print fixed bottom-4 right-4 z-30 w-64 glass-strong p-4 animate-rise">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Body Control Dashboard</div>
          <div className="font-display text-sm text-gold">{unlocked.length}/{FRAGMENTS.length} fragments</div>
        </div>
        <Activity className="h-4 w-4 text-vessel-red animate-pulse-beat" />
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {FRAGMENTS.map((f) => {
          const has = unlocked.includes(f);
          return (
            <div
              key={f}
              title={f}
              className={`aspect-square rounded-lg border text-[8px] grid place-items-center text-center px-0.5 transition-all ${
                has
                  ? "border-gold/60 bg-gold/15 text-gold gold-glow"
                  : "border-border/60 bg-secondary/30 text-muted-foreground/60"
              }`}
            >
              {has ? <Sparkles className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ HEART ART (reusable original SVG) ============ */
function HeartFigure({ size = 320 }: { size?: number }) {
  return (
    <svg viewBox="0 0 300 380" width={size} height={size} className="drop-shadow-[0_0_40px_rgba(220,40,60,0.35)]">
      <defs>
        <radialGradient id="bodyGlow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="oklch(0.4 0.1 285)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="oklch(0.18 0.05 275)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="vesselR" x1="0" x2="1">
          <stop offset="0%" stopColor="oklch(0.7 0.22 22)" />
          <stop offset="100%" stopColor="oklch(0.5 0.2 22)" />
        </linearGradient>
        <linearGradient id="vesselB" x1="0" x2="1">
          <stop offset="0%" stopColor="oklch(0.7 0.18 245)" />
          <stop offset="100%" stopColor="oklch(0.5 0.18 245)" />
        </linearGradient>
      </defs>
      <ellipse cx="150" cy="180" rx="140" ry="180" fill="url(#bodyGlow)" />
      {/* Body silhouette */}
      <path d="M150 30 c20 0 36 16 36 36 0 18 -10 28 -18 36 l28 18 c20 12 28 32 28 56 v110 c0 16 -8 28 -22 32 l-12 4 v40 c0 8 -6 14 -14 14 h-72 c-8 0 -14 -6 -14 -14 v-40 l-12 -4 c-14 -4 -22 -16 -22 -32 v-110 c0 -24 8 -44 28 -56 l28 -18 c-8 -8 -18 -18 -18 -36 0 -20 16 -36 36 -36 z"
        fill="oklch(0.22 0.06 275)" stroke="oklch(0.5 0.07 275 / 0.6)" strokeWidth="1.5" />
      {/* Veins (blue) */}
      <path d="M120 110 q-30 40 -20 90 q5 30 0 60" stroke="url(#vesselB)" strokeWidth="2.5" fill="none" className="animate-flow" />
      <path d="M180 110 q30 40 20 90 q-5 30 0 60" stroke="url(#vesselB)" strokeWidth="2.5" fill="none" className="animate-flow" />
      {/* Arteries (red) */}
      <path d="M150 175 q-40 30 -55 80 q-4 18 -2 40" stroke="url(#vesselR)" strokeWidth="2.5" fill="none" className="animate-flow" />
      <path d="M150 175 q40 30 55 80 q4 18 2 40" stroke="url(#vesselR)" strokeWidth="2.5" fill="none" className="animate-flow" />
      <path d="M150 175 q-20 -30 -40 -50" stroke="url(#vesselR)" strokeWidth="2" fill="none" />
      <path d="M150 175 q20 -30 40 -50" stroke="url(#vesselR)" strokeWidth="2" fill="none" />
      {/* Heart */}
      <g transform="translate(150 175)">
        <g className="animate-pulse-beat" style={{ transformOrigin: "center", transformBox: "fill-box" }}>
          <path d="M0 18 c-22 -28 -48 -10 -48 12 c0 24 32 38 48 56 c16 -18 48 -32 48 -56 c0 -22 -26 -40 -48 -12 z"
            fill="oklch(0.55 0.22 22)" stroke="oklch(0.85 0.18 25)" strokeWidth="1.5" />
        </g>
      </g>
    </svg>
  );
}

/* ============ SCREEN 1: LANDING ============ */
function Landing({ next, setScreen }: ScreenCtx) {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div className="animate-rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-gold">
            <Sparkles className="h-3 w-3" /> A Classroom Mission
          </div>
          <h1 className="mt-5 font-display text-6xl font-bold leading-[1.05] md:text-7xl">
            Inside the <span className="text-gradient-gold">Human Body</span>
          </h1>
          <h2 className="mt-3 font-display text-3xl text-vessel-red md:text-4xl">The Pulse Signal</h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Alex has just run across the playground. His heart is beating fast. The Body Control Dashboard
            has detected a strong pulse signal — but the team needs evidence. Your mission is to investigate
            what happens to pulse rate after exercise and explain why the heart changes speed.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <ObjectiveCard icon={<Heart className="h-4 w-4" />} label="Recover" value="Pulse Signal" />
            <ObjectiveCard icon={<FlaskConical className="h-4 w-4" />} label="Skill" value="Fair test + graphing" />
            <ObjectiveCard icon={<Activity className="h-4 w-4" />} label="Activity" value="Measure pulse" />
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <PrimaryButton onClick={() => setScreen(2)}>
              Prepare Crew <ArrowRight className="h-5 w-5" />
            </PrimaryButton>
            <span className="text-sm text-muted-foreground">Year 5 · Cambridge Primary Science · The Human Body</span>
          </div>
        </div>

        <div className="relative grid place-items-center">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[oklch(0.65_0.22_22/0.2)] to-[oklch(0.7_0.18_245/0.15)] blur-3xl" />
          <div className="relative">
            <HeartFigure size={420} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ObjectiveCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass p-4">
      <div className="flex items-center gap-2 text-gold">{icon}<span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span></div>
      <div className="mt-1 font-display text-lg">{value}</div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group inline-flex items-center gap-3 rounded-full gradient-gold px-7 py-4 text-base font-semibold text-[oklch(0.18_0.05_275)] shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_80px_-8px_var(--gold)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-5 py-3 text-sm font-medium hover:bg-secondary">
      {children}
    </button>
  );
}

/* ============ SCREEN 2: ROSTER ============ */
function Roster({ state, setState, next }: ScreenCtx) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const addStudent = () => {
    const name = `Student ${state.students.length + 1}`;
    setState((s) => ({
      ...s,
      students: [...s.students, {
        id: crypto.randomUUID(), name,
        color: STUDENT_COLORS[s.students.length % STUDENT_COLORS.length],
        score: 0, participation: 0,
      }],
    }));
  };
  const remove = (id: string) =>
    setState((s) => ({ ...s, students: s.students.filter((st) => st.id !== id) }));
  const rename = (id: string, name: string) =>
    setState((s) => ({ ...s, students: s.students.map((st) => st.id === id ? { ...st, name } : st) }));

  return (
    <div className="mx-auto max-w-4xl animate-rise">
      <div className="mb-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-gold">
          <Users className="h-3 w-3" /> Step 1 — Build the Crew
        </div>
        <h1 className="mt-4 font-display text-5xl">Crew Roster</h1>
        <p className="mt-2 text-muted-foreground">Add the students who will be called during the mission.</p>
      </div>

      <div className="glass-strong p-6">
        <div className="space-y-2">
          {state.students.map((st) => (
            <div key={st.id} className="flex items-center gap-3 rounded-xl bg-secondary/40 p-3">
              <div className="grid h-10 w-10 place-items-center rounded-full font-bold text-[oklch(0.15_0.05_275)]" style={{ background: st.color }}>
                {st.name[0]?.toUpperCase()}
              </div>
              {editingId === st.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => { rename(st.id, draft || st.name); setEditingId(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { rename(st.id, draft || st.name); setEditingId(null); } }}
                  className="flex-1 rounded-md border border-border bg-input px-3 py-1.5 text-base outline-none focus:border-gold"
                />
              ) : (
                <span className="flex-1 text-lg">{st.name}</span>
              )}
              <button onClick={() => { setEditingId(st.id); setDraft(st.name); }} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => remove(st.id)} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-destructive/20 hover:text-destructive" aria-label="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addStudent} className="mt-4 inline-flex items-center gap-2 rounded-full border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-gold hover:text-gold">
          <Plus className="h-4 w-4" /> Add student
        </button>
      </div>

      <div className="mt-8 flex justify-center">
        <PrimaryButton onClick={next}>Launch Mission <Zap className="h-5 w-5" /></PrimaryButton>
      </div>
    </div>
  );
}

/* ============ SCREEN 3: BRIEFING ============ */
function Briefing({ next, unlock }: ScreenCtx) {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div className="grid place-items-center">
          <HeartFigure size={380} />
        </div>
        <div className="animate-rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-gold">
            <Stethoscope className="h-3 w-3" /> Mission Briefing
          </div>
          <h1 className="mt-4 font-display text-5xl">The Pulse Signal</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            The heart is a pump. It pushes blood through blood vessels to carry oxygen and food
            around the body. When your muscles work harder, they need more oxygen. The question is:
            can we prove that exercise changes pulse rate?
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-vessel-red/40 bg-[oklch(0.65_0.22_22/0.1)] px-4 py-1.5 text-sm text-vessel-red">
            <Sparkles className="h-3 w-3" /> Fragment to recover: Pulse Signal
          </div>
          <ul className="mt-6 space-y-3">
            {[
              "The circulatory system has three main parts: heart, blood vessels, and blood.",
              "The heart pumps blood around the body.",
              "Pulse is the beat you feel when blood is pushed through blood vessels.",
              "During exercise, muscles need more oxygen and food.",
              "Scientists collect data before making conclusions.",
            ].map((b) => (
              <li key={b} className="flex gap-3 text-base">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <PrimaryButton onClick={() => { unlock("Pulse Signal"); unlock("Blood Pathway"); next(); }}>
              Begin Investigation <ArrowRight className="h-5 w-5" />
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ SCREEN 4: PREDICTION ============ */
function Prediction({ state, setState, next }: ScreenCtx) {
  const opts = [
    { k: "A", t: "It will become slower." },
    { k: "B", t: "It will stay the same." },
    { k: "C", t: "It will become faster." },
    { k: "D", t: "It will disappear." },
  ];
  const sel = state.classPrediction;
  return (
    <div className="mx-auto max-w-4xl text-center animate-rise">
      <Eyebrow>Prediction Poll</Eyebrow>
      <h1 className="mt-3 font-display text-5xl">Make Your Prediction</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        What do you think will happen to your pulse after 30 seconds of exercise?
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {opts.map((o) => (
          <button
            key={o.k}
            onClick={() => setState((s) => ({ ...s, classPrediction: o.k }))}
            className={`group flex items-center gap-4 rounded-2xl border p-5 text-left text-lg transition-all ${
              sel === o.k
                ? "border-gold bg-gold/15 gold-glow"
                : "border-border bg-secondary/40 hover:border-gold/60 hover:bg-secondary"
            }`}
          >
            <span className={`grid h-10 w-10 place-items-center rounded-full font-display text-lg ${sel === o.k ? "bg-gold text-[oklch(0.15_0.05_275)]" : "bg-secondary text-gold"}`}>{o.k}</span>
            <span>{o.t}</span>
          </button>
        ))}
      </div>
      {sel && <div className="mt-6 text-gold">Class prediction saved.</div>}
      <div className="mt-8">
        <PrimaryButton onClick={next} disabled={!sel}>Reveal the Science <ArrowRight className="h-5 w-5" /></PrimaryButton>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-gold">
      {children}
    </div>
  );
}

/* ============ SCREEN 5: MINI TEACH ============ */
function MiniTeach({ next, unlock }: ScreenCtx) {
  const [revealed, setRevealed] = useState<number[]>([]);
  const cards = [
    { icon: <Heart className="h-6 w-6" />, t: "Heart", d: "A pump that pushes blood." },
    { icon: <Activity className="h-6 w-6" />, t: "Blood", d: "The delivery fluid for oxygen and food." },
    { icon: <Zap className="h-6 w-6" />, t: "Blood vessels", d: "The pathways that carry blood everywhere." },
    { icon: <FlaskConical className="h-6 w-6" />, t: "Muscles", d: "Need more oxygen and food during exercise." },
  ];
  return (
    <div className="mx-auto max-w-6xl animate-rise">
      <div className="text-center">
        <Eyebrow>Concept Unlock</Eyebrow>
        <h1 className="mt-3 font-display text-5xl">Heart as a Pump</h1>
      </div>

      <div className="mt-10 glass-strong p-8">
        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8">
          <PathNode label="Heart" sub="pump" color="var(--vessel-red)" icon={<Heart className="h-7 w-7" />} />
          <PathArrow />
          <PathNode label="Blood vessels" sub="pathways" color="var(--vessel-blue)" icon={<Zap className="h-7 w-7" />} />
          <PathArrow />
          <PathNode label="Body muscles" sub="need oxygen" color="var(--gold)" icon={<FlaskConical className="h-7 w-7" />} />
        </div>
        <p className="mx-auto mt-6 max-w-3xl text-center text-lg text-muted-foreground">
          The heart pumps blood. Blood carries oxygen and food to body cells. When you exercise, your
          muscles need more oxygen and food, so the heart pumps faster. That faster pumping can be felt
          as a faster pulse.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => {
          const open = revealed.includes(i);
          return (
            <button
              key={c.t}
              onClick={() => setRevealed((r) => r.includes(i) ? r : [...r, i])}
              className={`relative overflow-hidden rounded-2xl border p-5 text-left transition-all ${
                open ? "border-gold/60 bg-gold/10 gold-glow" : "border-border bg-secondary/40 hover:border-gold/40"
              }`}
            >
              <div className={`mb-3 grid h-12 w-12 place-items-center rounded-full ${open ? "bg-gold text-[oklch(0.15_0.05_275)]" : "bg-secondary text-gold"}`}>
                {c.icon}
              </div>
              <div className="font-display text-xl">{c.t}</div>
              <div className={`mt-1 text-sm transition-opacity ${open ? "opacity-100 text-foreground" : "opacity-50 text-muted-foreground"}`}>
                {open ? c.d : "Tap to reveal"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-10 flex justify-center">
        <PrimaryButton onClick={() => { unlock("Blood Pathway"); next(); }}>
          Call on a Student <ArrowRight className="h-5 w-5" />
        </PrimaryButton>
      </div>
    </div>
  );
}

function PathNode({ label, sub, color, icon }: { label: string; sub: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="grid place-items-center text-center">
      <div className="grid h-20 w-20 place-items-center rounded-full text-[oklch(0.15_0.05_275)]" style={{ background: color, boxShadow: `0 0 30px ${color}` }}>
        {icon}
      </div>
      <div className="mt-2 font-display text-base">{label}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
function PathArrow() {
  return <ChevronRight className="h-8 w-8 text-gold/60" />;
}

/* ============ SCREEN 6 & 16: SPOTLIGHT QUESTION ============ */
function SpotlightQuestion({ qIndex, ...c }: ScreenCtx & { qIndex: 1 | 2 }) {
  const { state, callRandomStudent, spotlightStudent, awardPoint, noteAnswered, recordResponse, next, unlock } = c;
  const [phase, setPhase] = useState<"call" | "reveal" | "question" | "feedback">("call");
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  const Q = qIndex === 1 ? {
    text: "What does the heart pump around the body?",
    opts: [
      { k: "A", t: "Air" },
      { k: "B", t: "Blood" },
      { k: "C", t: "Water" },
      { k: "D", t: "Bones" },
    ],
    correct: "B",
    correctMsg: "Fragment recovered. The heart pumps blood through blood vessels.",
    wrongMsg: "Not quite. The heart pumps blood, not air or water.",
    fragment: "Heart Pump" as Fragment,
  } : {
    text: "Why does pulse rate usually increase after exercise?",
    opts: [
      { k: "A", t: "Muscles need more oxygen and food." },
      { k: "B", t: "Blood disappears during exercise." },
      { k: "C", t: "The lungs stop working." },
      { k: "D", t: "The heart becomes smaller." },
    ],
    correct: "A",
    correctMsg: "Yes. Working muscles need more oxygen and food, so the heart pumps blood faster.",
    wrongMsg: "Not quite. Exercise makes muscles work harder, so they need more oxygen and food from the blood.",
    fragment: null as Fragment | null,
  };

  if (phase === "call") {
    return (
      <div className="mx-auto grid max-w-3xl place-items-center pt-12 text-center animate-rise">
        <Eyebrow>Crew Spotlight</Eyebrow>
        <h1 className="mt-4 font-display text-4xl">Time to call on a crew member.</h1>
        <p className="mt-3 text-muted-foreground">The mission tracker will choose a student who has been called least.</p>
        <div className="mt-8">
          <PrimaryButton onClick={() => { callRandomStudent(); setPhase("reveal"); }}>
            Spin the Spotlight <Sparkles className="h-5 w-5" />
          </PrimaryButton>
        </div>
      </div>
    );
  }

  if (phase === "reveal" && spotlightStudent) {
    return (
      <button
        onClick={() => setPhase("question")}
        className="fixed inset-0 z-40 grid place-items-center bg-[oklch(0.13_0.05_275/0.96)] backdrop-blur-xl"
      >
        <div className="text-center animate-rise">
          <div className="mx-auto grid h-40 w-40 place-items-center rounded-full text-5xl font-bold text-[oklch(0.15_0.05_275)] gold-glow"
               style={{ background: spotlightStudent.color }}>
            {spotlightStudent.name[0]}
          </div>
          <div className="mt-6 text-sm uppercase tracking-[0.3em] text-gold">This one's for…</div>
          <div className="mt-2 font-display text-7xl">{spotlightStudent.name}</div>
          <div className="mt-8 text-sm text-muted-foreground">Tap anywhere to continue</div>
        </div>
      </button>
    );
  }

  if (phase === "question" && spotlightStudent) {
    return (
      <div className="mx-auto max-w-4xl animate-rise">
        <div className="text-center">
          <Eyebrow>Multiple Choice</Eyebrow>
          <div className="mt-2 text-sm text-muted-foreground">For: <span className="font-semibold" style={{ color: spotlightStudent.color }}>{spotlightStudent.name}</span></div>
          <h1 className="mt-3 font-display text-4xl">{Q.text}</h1>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {Q.opts.map((o) => (
            <button
              key={o.k}
              onClick={() => setPickedKey(o.k)}
              className={`flex items-center gap-4 rounded-2xl border p-5 text-left text-lg transition-all ${
                pickedKey === o.k
                  ? o.k === Q.correct ? "border-emerald-400 bg-emerald-400/10" : "border-red-400 bg-red-400/10"
                  : "border-border bg-secondary/40 hover:border-gold/60"
              }`}
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-secondary font-display text-lg text-gold">{o.k}</span>
              <span className="flex-1">{o.t}</span>
              {pickedKey === o.k && (o.k === Q.correct ? <Check className="h-5 w-5 text-emerald-400" /> : <X className="h-5 w-5 text-red-400" />)}
            </button>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <PrimaryButton
            disabled={!pickedKey}
            onClick={() => {
              const isCorrect = pickedKey === Q.correct;
              if (isCorrect) awardPoint(spotlightStudent.id);
              else noteAnswered();
              recordResponse({
                studentId: spotlightStudent.id,
                questionId: `pulse-q${qIndex}`,
                questionType: "mcq",
                isCorrect,
              });
              setPhase("feedback");
            }}
          >
            Check Answer
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // feedback
  const correct = pickedKey === Q.correct;
  return (
    <div className="mx-auto max-w-3xl text-center animate-rise pt-8">
      <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full ${correct ? "bg-emerald-400/20 text-emerald-300" : "bg-red-400/20 text-red-300"}`}>
        {correct ? <Check className="h-10 w-10" /> : <X className="h-10 w-10" />}
      </div>
      <h1 className="mt-5 font-display text-4xl">{correct ? "Fragment recovered" : "Keep investigating"}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{correct ? Q.correctMsg : Q.wrongMsg}</p>
      <div className="mt-2 text-sm text-muted-foreground">Correct answer: <span className="text-gold">{Q.correct}. {Q.opts.find(o => o.k === Q.correct)?.t}</span></div>
      <div className="mt-8">
        <PrimaryButton onClick={() => { if (Q.fragment) unlock(Q.fragment); next(); }}>
          {qIndex === 1 ? "Continue Mission" : "Continue to Boss Challenge"} <ArrowRight className="h-5 w-5" />
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ============ SCREEN 7: FIND PULSE GUIDE ============ */
function FindPulseGuide({ next }: ScreenCtx) {
  const steps = [
    "Sit still and quiet.",
    "Place two fingers on your wrist or the side of your neck.",
    "Do not use your thumb.",
    "When the timer starts, count each beat.",
    "Write the number on your handout.",
  ];
  return (
    <div className="mx-auto max-w-5xl animate-rise">
      <div className="text-center">
        <Eyebrow>Guided Activity</Eyebrow>
        <h1 className="mt-3 font-display text-5xl">Find Your Pulse</h1>
        <p className="mt-3 text-muted-foreground">Before we exercise, we need to measure resting pulse.</p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-5">
        {steps.map((s, i) => (
          <div key={i} className="glass p-5">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gold font-display text-base text-[oklch(0.15_0.05_275)]">{i + 1}</div>
            <p className="mt-3 text-sm leading-snug">{s}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 glass border-l-4 border-l-vessel-red p-5">
        <div className="flex items-center gap-2 text-vessel-red"><AlertTriangle className="h-4 w-4" /> Teacher note</div>
        <p className="mt-2 text-sm text-muted-foreground">Some students may not find their pulse immediately. Let them practise with a partner. Keep the room calm for resting pulse.</p>
      </div>
      <div className="mt-8 flex justify-center">
        <PrimaryButton onClick={next}>Start Resting Pulse Timer <TimerIcon className="h-5 w-5" /></PrimaryButton>
      </div>
    </div>
  );
}

/* ============ TIMER component ============ */
function CountdownTimer({ seconds, onDone, autoStart = false, label }: { seconds: number; onDone?: () => void; autoStart?: boolean; label: string }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(autoStart);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!running || done) return;
    if (remaining <= 0) {
      setDone(true);
      setRunning(false);
      onDone?.();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [running, remaining, done, onDone]);

  const pct = ((seconds - remaining) / seconds) * 100;
  return (
    <div className="grid place-items-center">
      <div className="relative">
        <svg viewBox="0 0 200 200" className="h-64 w-64 -rotate-90">
          <circle cx="100" cy="100" r="88" fill="none" stroke="oklch(0.3 0.06 275)" strokeWidth="10" />
          <circle cx="100" cy="100" r="88" fill="none" stroke="url(#timerGrad)" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${(pct / 100) * 553} 553`} />
          <defs>
            <linearGradient id="timerGrad" x1="0" x2="1">
              <stop offset="0%" stopColor="oklch(0.82 0.16 80)" />
              <stop offset="100%" stopColor="oklch(0.65 0.22 22)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="font-display text-7xl tabular-nums">{remaining}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground">{label}</div>
          </div>
        </div>
      </div>
      <div className="mt-6 flex gap-3">
        {!done && (
          <button onClick={() => setRunning((r) => !r)} className="inline-flex items-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-medium hover:bg-secondary/80">
            {running ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Start</>}
          </button>
        )}
        <button onClick={() => { setRemaining(seconds); setRunning(false); setDone(false); }} className="inline-flex items-center gap-2 rounded-full bg-secondary/60 px-5 py-2.5 text-sm font-medium hover:bg-secondary">
          <RotateCcw className="h-4 w-4" /> Reset
        </button>
        {!done && (
          <button onClick={() => { setDone(true); setRunning(false); onDone?.(); }} className="inline-flex items-center gap-2 rounded-full bg-gold/90 px-5 py-2.5 text-sm font-semibold text-[oklch(0.15_0.05_275)] hover:bg-gold">
            <Check className="h-4 w-4" /> Done Counting
          </button>
        )}
      </div>
    </div>
  );
}

/* ============ SCREEN 8 & 12: PULSE TIMER ============ */
function PulseTimer({ next, kind }: ScreenCtx & { kind: "resting" | "exercise" }) {
  const [done, setDone] = useState(false);
  const isResting = kind === "resting";
  return (
    <div className="mx-auto max-w-3xl text-center animate-rise">
      <Eyebrow>{isResting ? "Resting Pulse Timer" : "After-Exercise Pulse"}</Eyebrow>
      <h1 className="mt-3 font-display text-5xl">{isResting ? "Count Your Resting Pulse" : "Count Your Pulse Now"}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{isResting ? "Count your pulse beats now." : "Count your pulse beats again — quickly."}</p>
      <div className="mt-10 glass-strong p-10">
        <CountdownTimer seconds={30} label="seconds" onDone={() => setDone(true)} />
      </div>
      {done && (
        <div className="mt-6 text-gold">Write your number in the handout: Beats in 30 seconds.</div>
      )}
      <div className="mt-8">
        <PrimaryButton onClick={next} disabled={!done}>
          {isResting ? "Enter Resting Data" : "Enter Exercise Data"} <ArrowRight className="h-5 w-5" />
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ============ SCREEN 9 & 13: DATA ENTRY ============ */
function DataEntry(c: ScreenCtx & { kind: "resting" | "exercise" }) {
  const { state, setState, next, unlock, restingBpm, exerciseBpm, kind } = c;
  const isResting = kind === "resting";
  const samples = isResting ? state.restingSamples : state.exerciseSamples;

  const update = (idx: number, val: string) => {
    const v = val === "" ? null : Math.max(0, Math.min(200, parseInt(val) || 0));
    setState((s) => {
      const next = [...(isResting ? s.restingSamples : s.exerciseSamples)];
      next[idx] = v;
      return isResting ? { ...s, restingSamples: next } : { ...s, exerciseSamples: next };
    });
  };

  const filled = samples.filter((x): x is number => typeof x === "number" && x > 0);
  const avg = filled.length ? filled.reduce((a, b) => a + b, 0) / filled.length : null;
  const bpm = avg ? Math.round(avg * 2) : null;

  return (
    <div className="mx-auto max-w-5xl animate-rise">
      <div className="text-center">
        <Eyebrow>Record Evidence</Eyebrow>
        <h1 className="mt-3 font-display text-5xl">{isResting ? "Resting Pulse Data" : "After-Exercise Data"}</h1>
        <p className="mt-3 text-muted-foreground">Enter beats counted in 30 seconds for 3–5 students or use a class average.</p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-5">
        {samples.map((v, i) => (
          <div key={i} className="glass p-4 text-center">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Sample {i + 1}</div>
            <input
              type="number"
              inputMode="numeric"
              value={v ?? ""}
              onChange={(e) => update(i, e.target.value)}
              placeholder="—"
              className="mt-2 w-full rounded-lg border border-border bg-input px-3 py-3 text-center font-display text-3xl outline-none focus:border-gold"
            />
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">beats / 30s</div>
          </div>
        ))}
      </div>

      <div className="mt-8 glass-strong grid gap-6 p-6 md:grid-cols-3">
        <Stat label="Average beats / 30s" value={avg ? avg.toFixed(1) : "—"} />
        <Stat label={isResting ? "Resting pulse" : "After-exercise pulse"} value={bpm ? `${bpm} bpm` : "—"} highlight />
        {!isResting && restingBpm && bpm && (
          <Stat label="Change" value={`${bpm - restingBpm >= 0 ? "+" : ""}${bpm - restingBpm} bpm`} highlight />
        )}
        {isResting && <Stat label="Method" value="× 2 → per minute" />}
      </div>

      {!isResting && restingBpm && bpm && (
        <div className="mt-4 text-center text-muted-foreground">
          Resting average: <span className="text-foreground">{restingBpm} bpm</span> · After exercise: <span className="text-foreground">{bpm} bpm</span>
        </div>
      )}

      <div className="mt-8 flex justify-center">
        <PrimaryButton
          disabled={!bpm}
          onClick={() => {
            unlock(isResting ? "Resting Data" : "Exercise Data");
            next();
          }}
        >
          {isResting ? "Save Resting Data" : "Reveal Class Graph"} <ArrowRight className="h-5 w-5" />
        </PrimaryButton>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-4xl ${highlight ? "text-gold" : ""}`}>{value}</div>
    </div>
  );
}

/* ============ SCREEN 10: EXERCISE GUIDE ============ */
function ExerciseGuide({ next }: ScreenCtx) {
  return (
    <div className="mx-auto max-w-4xl animate-rise">
      <div className="text-center">
        <Eyebrow>Guided Activity</Eyebrow>
        <h1 className="mt-3 font-display text-5xl">Exercise Round</h1>
        <p className="mt-3 text-lg text-muted-foreground">Now we will safely make the muscles work harder.</p>
      </div>
      <div className="mt-8 glass-strong p-8 text-center">
        <div className="text-xs uppercase tracking-widest text-gold">The Activity</div>
        <div className="mt-2 font-display text-3xl">Jog on the spot for 30 seconds</div>
      </div>

      <div className="mt-6 glass border-l-4 border-l-vessel-red p-5">
        <div className="flex items-center gap-2 text-vessel-red"><AlertTriangle className="h-4 w-4" /> Safety</div>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li>• Stand beside your desk.</li>
          <li>• Keep space from others.</li>
          <li>• Stop if you feel unwell.</li>
          <li>• No pushing or racing.</li>
        </ul>
      </div>

      <div className="mt-6 glass p-5 text-center text-base italic text-muted-foreground">
        "Everyone ready? We are not competing. We are collecting evidence."
      </div>

      <div className="mt-8 flex justify-center">
        <PrimaryButton onClick={next}>Start Exercise Timer <Play className="h-5 w-5" /></PrimaryButton>
      </div>
    </div>
  );
}

/* ============ SCREEN 11: EXERCISE TIMER ============ */
function ExerciseTimer({ next }: ScreenCtx) {
  const [done, setDone] = useState(false);
  return (
    <div className="mx-auto max-w-3xl text-center animate-rise">
      <Eyebrow>Exercise Timer</Eyebrow>
      <h1 className="mt-3 font-display text-5xl">Jog Safely on the Spot</h1>
      <div className="mt-10 glass-strong p-10">
        <CountdownTimer seconds={30} label="seconds" onDone={() => setDone(true)} />
      </div>
      {done && (
        <div className="mt-6 text-gold">Sit down quickly and prepare to find your pulse again.</div>
      )}
      <div className="mt-8">
        <PrimaryButton onClick={next} disabled={!done}>Start After-Exercise Pulse Timer <ArrowRight className="h-5 w-5" /></PrimaryButton>
      </div>
    </div>
  );
}

/* ============ SCREEN 14: GRAPH REVEAL ============ */
function GraphReveal({ restingBpm, exerciseBpm, next, unlock }: ScreenCtx) {
  const r = restingBpm ?? 76;
  const e = exerciseBpm ?? 122;
  const max = Math.max(r, e, 100) + 20;
  const [revealed, setRevealed] = useState<number[]>([]);
  const observations = [
    "Pulse rate is lower at rest.",
    "Pulse rate is higher after exercise.",
    "Exercise made the heart pump faster.",
  ];
  return (
    <div className="mx-auto max-w-6xl animate-rise">
      <div className="text-center">
        <Eyebrow>Evidence Graph</Eyebrow>
        <h1 className="mt-3 font-display text-5xl">The Class Data</h1>
      </div>

      <div className="mt-8 glass-strong p-8">
        <div className="grid grid-cols-[60px_1fr] gap-4">
          <div className="flex flex-col-reverse justify-between text-right text-xs text-muted-foreground">
            {[0, 25, 50, 75, 100, 125, 150].map((n) => (
              <div key={n}>{n}</div>
            ))}
          </div>
          <div className="relative h-80 border-l border-b border-border">
            {[25, 50, 75, 100, 125, 150].map((n) => (
              <div key={n} className="absolute left-0 right-0 border-t border-dashed border-border/40" style={{ bottom: `${(n / max) * 100}%` }} />
            ))}
            <div className="absolute inset-0 grid grid-cols-2 items-end gap-16 px-12">
              <Bar value={r} max={max} color="var(--vessel-blue)" label="Resting" />
              <Bar value={e} max={max} color="var(--vessel-red)" label="After exercise" />
            </div>
          </div>
        </div>
        <div className="mt-3 text-center text-xs uppercase tracking-widest text-muted-foreground">Pulse rate (beats per minute)</div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {observations.map((o, i) => (
          <button
            key={i}
            onClick={() => setRevealed((r) => r.includes(i) ? r : [...r, i])}
            className={`rounded-2xl border p-5 text-left transition-all ${revealed.includes(i) ? "border-gold/60 bg-gold/10" : "border-border bg-secondary/40 hover:border-gold/40"}`}
          >
            <div className="text-xs uppercase tracking-wider text-gold">Observation {i + 1}</div>
            <div className="mt-2 text-lg">{revealed.includes(i) ? o : "Tap to reveal"}</div>
          </button>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <PrimaryButton onClick={() => { unlock("Graph Badge"); next(); }}>Unlock Scientist Skill <ArrowRight className="h-5 w-5" /></PrimaryButton>
      </div>
    </div>
  );
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const h = `${(value / max) * 100}%`;
  return (
    <div className="flex h-full flex-col items-center justify-end">
      <div className="font-display text-2xl text-foreground">{value}</div>
      <div className="mt-1 w-24 rounded-t-xl transition-all duration-700" style={{ height: h, background: `linear-gradient(180deg, ${color}, ${color} 60%, oklch(0.3 0.06 275))`, boxShadow: `0 -4px 30px ${color}` }} />
      <div className="mt-2 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

/* ============ SCREEN 15: FAIR TEST ============ */
function FairTest({ next, unlock, noteAnswered }: ScreenCtx) {
  const [picked, setPicked] = useState<string | null>(null);
  const opts = [
    { k: "A", t: "Pulse rate" },
    { k: "B", t: "Shoe colour" },
    { k: "C", t: "Classroom size" },
    { k: "D", t: "Student name" },
  ];
  return (
    <div className="mx-auto max-w-5xl animate-rise">
      <div className="text-center">
        <Eyebrow>Scientist Skill Unlocked</Eyebrow>
        <h1 className="mt-3 font-display text-5xl">Fair Testing</h1>
        <p className="mt-3 text-lg text-muted-foreground">A fair test changes one important thing and keeps other things the same.</p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <FairCard color="var(--gold)" label="We changed" value="Exercise / activity level" />
        <FairCard color="var(--vessel-red)" label="We measured" value="Pulse rate" />
        <FairCard color="var(--vessel-blue)" label="We kept the same" value="Counting time, method of counting, exercise time" />
      </div>

      <div className="mt-10 glass-strong p-6">
        <div className="text-sm uppercase tracking-widest text-gold">Quick check</div>
        <div className="mt-2 font-display text-2xl">Which variable did we measure?</div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {opts.map((o) => (
            <button
              key={o.k}
              onClick={() => { if (!picked) { setPicked(o.k); noteAnswered(); } }}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                picked === o.k
                  ? o.k === "A" ? "border-emerald-400 bg-emerald-400/10" : "border-red-400 bg-red-400/10"
                  : "border-border bg-secondary/40 hover:border-gold/60"
              }`}
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-gold">{o.k}</span>
              <span className="flex-1">{o.t}</span>
              {picked === o.k && (o.k === "A" ? <Check className="h-5 w-5 text-emerald-400" /> : <X className="h-5 w-5 text-red-400" />)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <PrimaryButton onClick={() => { unlock("Fair Test Badge"); next(); }} disabled={!picked}>
          Continue <ArrowRight className="h-5 w-5" />
        </PrimaryButton>
      </div>
    </div>
  );
}

function FairCard({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="glass p-5" style={{ borderColor: `${color}` }}>
      <div className="h-1 w-12 rounded-full" style={{ background: color }} />
      <div className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl">{value}</div>
    </div>
  );
}

/* ============ SCREEN 17: BOSS CHALLENGE ============ */
function BossChallenge({ next, unlock, noteAnswered }: ScreenCtx) {
  const data = [
    { a: "Sitting still", b: 72 },
    { a: "Walking slowly", b: 88 },
    { a: "Jogging", b: 118 },
    { a: "Running fast", b: 142 },
  ];
  const Qs = [
    {
      text: "Which activity caused the highest pulse rate?",
      opts: [{ k: "A", t: "Sitting still" }, { k: "B", t: "Walking slowly" }, { k: "C", t: "Jogging" }, { k: "D", t: "Running fast" }],
      correct: "D",
    },
    {
      text: "What is the best conclusion?",
      opts: [
        { k: "A", t: "More intense exercise usually increases pulse rate." },
        { k: "B", t: "Sitting makes the heart beat fastest." },
        { k: "C", t: "Pulse rate never changes." },
        { k: "D", t: "Exercise stops blood from moving." },
      ],
      correct: "A",
    },
    {
      text: "How could we make this a fairer test?",
      opts: [
        { k: "A", t: "Count pulse for the same time each round." },
        { k: "B", t: "Use different timers every round." },
        { k: "C", t: "Let some students run for 10 seconds and others for 2 minutes." },
        { k: "D", t: "Record only the result we like." },
      ],
      correct: "A",
    },
  ];
  const [picks, setPicks] = useState<(string | null)[]>([null, null, null]);
  const allDone = picks.every((p) => p !== null);
  const correctCount = picks.filter((p, i) => p === Qs[i].correct).length;

  return (
    <div className="mx-auto max-w-6xl animate-rise">
      <div className="text-center">
        <Eyebrow>Boss Challenge</Eyebrow>
        <h1 className="mt-3 font-display text-5xl">Read the Evidence</h1>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        <div className="glass-strong p-6">
          <div className="text-xs uppercase tracking-widest text-gold">Pulse data</div>
          <table className="mt-3 w-full text-left">
            <thead>
              <tr className="border-b border-border text-sm text-muted-foreground">
                <th className="py-2">Activity</th>
                <th className="py-2 text-right">Pulse rate (bpm)</th>
              </tr>
            </thead>
            <tbody className="font-display text-lg">
              {data.map((r) => (
                <tr key={r.a} className="border-b border-border/40">
                  <td className="py-3">{r.a}</td>
                  <td className="py-3 text-right text-gold">{r.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-6">
          {Qs.map((q, qi) => (
            <div key={qi} className="glass p-5">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Question {qi + 1}</div>
              <div className="mt-1 font-display text-xl">{q.text}</div>
              <div className="mt-4 grid gap-2">
                {q.opts.map((o) => {
                  const sel = picks[qi];
                  const showCorrect = sel !== null;
                  const isPicked = sel === o.k;
                  const isCorrect = o.k === q.correct;
                  return (
                    <button
                      key={o.k}
                      disabled={sel !== null}
                      onClick={() => {
                        const next = [...picks];
                        next[qi] = o.k;
                        setPicks(next);
                        noteAnswered();
                      }}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-left transition-all ${
                        showCorrect && isCorrect
                          ? "border-emerald-400 bg-emerald-400/10"
                          : isPicked && !isCorrect
                          ? "border-red-400 bg-red-400/10"
                          : "border-border bg-secondary/30 hover:border-gold/50"
                      }`}
                    >
                      <span className="text-sm font-display text-gold">{o.k}</span>
                      <span className="flex-1 text-sm">{o.t}</span>
                      {showCorrect && isCorrect && <Check className="h-4 w-4 text-emerald-400" />}
                      {isPicked && !isCorrect && <X className="h-4 w-4 text-red-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-8 flex flex-col items-center gap-3">
        {allDone && <div className="text-gold">Class score: {correctCount} / 3</div>}
        <PrimaryButton onClick={() => { unlock("Conclusion Badge"); next(); }} disabled={!allDone}>
          Continue to Exit Ticket <ArrowRight className="h-5 w-5" />
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ============ SCREEN 18: EXIT TICKET ============ */
function ExitTicket({ state, setState, next }: ScreenCtx) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="mx-auto max-w-3xl text-center animate-rise">
      <Eyebrow>Exit Ticket</Eyebrow>
      <h1 className="mt-3 font-display text-5xl">One Sentence Answer</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Why did pulse rate increase after exercise?
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {([
          ["got", "Got it", "bg-emerald-400/15 border-emerald-400/50 text-emerald-200"],
          ["almost", "Almost", "bg-yellow-400/15 border-yellow-400/50 text-yellow-200"],
          ["needs", "Needs help", "bg-red-400/15 border-red-400/50 text-red-200"],
        ] as const).map(([k, label, cls]) => (
          <button
            key={k}
            onClick={() => setState((s) => ({ ...s, exitVerdict: k }))}
            className={`rounded-2xl border-2 p-4 font-display text-xl transition-all ${cls} ${state.exitVerdict === k ? "ring-2 ring-gold" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>
      <button onClick={() => setRevealed(true)} className="mt-6 text-sm text-gold underline-offset-4 hover:underline">
        Reveal model answer
      </button>
      {revealed && (
        <div className="mt-4 glass p-5 text-left text-base text-muted-foreground animate-rise">
          "Pulse rate increased because the muscles needed more oxygen and food, so the heart pumped blood faster."
        </div>
      )}
      <div className="mt-10">
        <PrimaryButton onClick={next} disabled={!state.exitVerdict}>
          Complete Mission <Trophy className="h-5 w-5" />
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ============ SCREEN 19: MISSION COMPLETE ============ */
function MissionComplete({ state, restingBpm, exerciseBpm, setScreen }: ScreenCtx) {
  const change = restingBpm && exerciseBpm ? exerciseBpm - restingBpm : null;
  return (
    <div className="mx-auto max-w-6xl animate-rise pt-6">
      <div className="text-center">
        <div className="inline-grid h-20 w-20 place-items-center rounded-full gradient-gold gold-glow">
          <Trophy className="h-10 w-10 text-[oklch(0.15_0.05_275)]" />
        </div>
        <h1 className="mt-5 font-display text-6xl">Mission Complete</h1>
        <p className="mt-3 text-xl text-gold">Pulse Signal Recovered</p>
      </div>

      <div className="mt-10 glass-strong p-8">
        <div className="text-xs uppercase tracking-widest text-gold">Body Control Dashboard</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {FRAGMENTS.map((f) => {
            const has = state.unlocked.includes(f);
            return (
              <div key={f} className={`flex items-center gap-3 rounded-xl border p-3 ${has ? "border-gold/60 bg-gold/10" : "border-border bg-secondary/40 opacity-50"}`}>
                <div className={`grid h-9 w-9 place-items-center rounded-full ${has ? "bg-gold text-[oklch(0.15_0.05_275)]" : "bg-secondary text-muted-foreground"}`}>
                  {has ? <Sparkles className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                </div>
                <span className="text-sm">{f}</span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-8 text-center text-lg text-muted-foreground">
        Today the crew investigated pulse rate like scientists. They made a prediction, collected data,
        compared results, read a graph, and explained why the heart pumps faster after exercise.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Students called on" value={String(state.callsCount)} />
        <Stat label="Questions answered" value={String(state.questionsAnswered)} />
        <Stat label="Resting average" value={restingBpm ? `${restingBpm} bpm` : "—"} />
        <Stat label="After exercise avg" value={exerciseBpm ? `${exerciseBpm} bpm` : "—"} />
        <Stat label="Pulse change" value={change !== null ? `${change >= 0 ? "+" : ""}${change} bpm` : "—"} highlight />
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <PrimaryButton onClick={() => window.print()}>Print Handout <Printer className="h-5 w-5" /></PrimaryButton>
        <GhostButton onClick={() => setScreen(1)}><RotateCcw className="h-4 w-4" /> Restart Mission</GhostButton>
        <GhostButton onClick={() => setScreen(1)}>Back to Landing</GhostButton>
      </div>

      <div className="mt-12">
        <h3 className="text-center font-display text-2xl">Crew Scoreboard</h3>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[...state.students].sort((a, b) => b.score - a.score).map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 glass p-3">
              <div className="text-gold font-display text-lg w-6">{i + 1}.</div>
              <div className="grid h-9 w-9 place-items-center rounded-full font-bold text-[oklch(0.15_0.05_275)]" style={{ background: s.color }}>{s.name[0]}</div>
              <div className="flex-1">{s.name}</div>
              <div className="text-gold font-display">{s.score}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============ TEACHER NOTES DRAWER ============ */
function TeacherNotesDrawer({ open, onClose, screen }: { open: boolean; onClose: () => void; screen: number }) {
  const note = TEACHER_NOTES[screen];
  return (
    <>
      {open && <div className="no-print fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />}
      <aside className={`no-print fixed right-0 top-0 z-50 h-full w-full max-w-md transform overflow-y-auto bg-[oklch(0.15_0.05_275)] p-6 shadow-2xl transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-gold">Teacher Notes</div>
            <h2 className="mt-1 font-display text-2xl">Step {screen}: {note?.title ?? ""}</h2>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-secondary hover:bg-secondary/70"><X className="h-4 w-4" /></button>
        </div>

        <Section title="Lesson objective" body={LESSON_OBJECTIVE} />
        {note?.script && <Section title="Script for this step" body={note.script} />}
        {note?.misconceptions && <ListSection title="Watch for misconceptions" items={note.misconceptions} />}
        <ListSection title="Common misconceptions (whole lesson)" items={COMMON_MISCONCEPTIONS} />
        {note?.safety && <ListSection title="Safety this step" items={note.safety} />}
        <ListSection title="Safety notes (whole lesson)" items={SAFETY_NOTES} />
      </aside>
    </>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-6">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
      <p className="mt-2 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-6">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((it) => <li key={it} className="flex gap-2"><span className="text-gold">•</span>{it}</li>)}
      </ul>
    </div>
  );
}

/* ============ PRINTABLE HANDOUT ============ */
function PrintableHandout({ open, onClose, state, restingBpm, exerciseBpm }: {
  open: boolean; onClose: () => void; state: MissionState; restingBpm: number | null; exerciseBpm: number | null;
}) {
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl text-foreground">Printable Handout</h2>
          <div className="flex gap-2">
            <Button onClick={() => window.print()} className="bg-gold text-[oklch(0.15_0.05_275)] hover:bg-gold/90"><Printer className="h-4 w-4" /> Print</Button>
            <Button variant="ghost" onClick={onClose}><X className="h-4 w-4" /> Close</Button>
          </div>
        </div>
        <HandoutPage state={state} restingBpm={restingBpm} exerciseBpm={exerciseBpm} />
      </div>
    </div>
  );
}

function HandoutPage({ state, restingBpm, exerciseBpm }: { state: MissionState; restingBpm: number | null; exerciseBpm: number | null }) {
  return (
    <div className="print-page mx-auto bg-white p-10 text-black" style={{ fontFamily: "Georgia, serif", maxWidth: "8.5in" }}>
      <div className="border-b-2 border-black pb-3">
        <div className="text-xs uppercase tracking-widest">Year 5 · The Human Body</div>
        <h1 className="text-3xl font-bold">Mission: The Pulse Signal</h1>
        <div className="text-sm">Name: ____________________________   Date: ______________</div>
      </div>

      <Sec n={1} title="Mission Question">
        <p>Why does pulse rate change after exercise?</p>
      </Sec>

      <Sec n={2} title="Prediction">
        <div className="space-y-1">
          <label className="block">☐ My pulse will increase</label>
          <label className="block">☐ My pulse will decrease</label>
          <label className="block">☐ My pulse will stay the same</label>
        </div>
      </Sec>

      <Sec n={3} title="Results Table">
        <table className="w-full border-collapse border border-black text-sm">
          <thead>
            <tr>
              <th className="border border-black px-2 py-1 text-left">Measurement</th>
              <th className="border border-black px-2 py-1 text-left">Beats in 30 seconds</th>
              <th className="border border-black px-2 py-1 text-left">Pulse per minute</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="border border-black px-2 py-3">Resting</td><td className="border border-black px-2 py-3"></td><td className="border border-black px-2 py-3">{restingBpm ?? ""}</td></tr>
            <tr><td className="border border-black px-2 py-3">After exercise</td><td className="border border-black px-2 py-3"></td><td className="border border-black px-2 py-3">{exerciseBpm ?? ""}</td></tr>
            <tr><td className="border border-black px-2 py-3">After 2 minutes rest</td><td className="border border-black px-2 py-3"></td><td className="border border-black px-2 py-3"></td></tr>
          </tbody>
        </table>
      </Sec>

      <Sec n={4} title="Graph Space">
        <div className="border border-black" style={{ height: "180px", backgroundImage: "linear-gradient(to right, #ddd 1px, transparent 1px), linear-gradient(to bottom, #ddd 1px, transparent 1px)", backgroundSize: "40px 30px" }} />
        <div className="mt-1 text-xs">Draw bars: Resting vs After exercise (beats per minute)</div>
      </Sec>

      <Sec n={5} title="Fair Test">
        <div className="space-y-1.5 text-sm">
          <div>We changed: __________________________________________</div>
          <div>We measured: _________________________________________</div>
          <div>We kept the same: ____________________________________</div>
        </div>
      </Sec>

      <Sec n={6} title="Conclusion">
        <div className="text-sm">My pulse rate changed because ____________________________________________</div>
        <div className="mt-2 border-b border-black h-5" />
      </Sec>

      <Sec n={7} title="Exit Question">
        <div className="text-sm">The heart pumps __________________ around the body.</div>
      </Sec>
    </div>
  );
}
function Sec({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className="mb-1.5 text-base font-bold">{n}. {title}</h2>
      <div>{children}</div>
    </section>
  );
}

