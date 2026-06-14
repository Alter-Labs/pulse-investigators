// Integration with the Schoolynq platform.
//
// When this mission is launched from a Schoolynq classroom, the platform opens
// it with a `?launchToken=...` query parameter. We exchange that token for the
// launch context (school, teacher, class, subject and the present students),
// run the mission with that real roster, and POST the results back when the
// mission ends so they show up on the Schoolynq dashboard.
//
// When opened directly (no launch token) the mission behaves as a standalone
// demo and none of this code runs.

const API_BASE =
  (import.meta.env.VITE_SCHOOLYNQ_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:5000";

export interface LaunchContextStudent {
  id: string;
  name: string;
}

export interface LaunchContext {
  launchSessionId: string;
  school: { id: string; name: string };
  teacher: { id: string; name: string };
  class: { id: string; name: string };
  subject: { id: string; name: string };
  mission: { id: string; providerMissionId: string; title: string };
  students: LaunchContextStudent[];
}

export interface MissionResult {
  students: { id: string; name: string; answered: number; correct: number }[];
  responses: {
    studentId: string | null;
    questionId: string;
    questionType: string;
    isCorrect: boolean;
  }[];
  startedAt: string | null;
  endedAt: string;
}

/** Reads the Schoolynq launch token from the current URL, if present. */
export function getLaunchToken(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("launchToken");
}

/** Exchanges a launch token for the mission's launch context. */
export async function fetchLaunchContext(token: string): Promise<LaunchContext> {
  const response = await fetch(
    `${API_BASE}/mission-launch-context?token=${encodeURIComponent(token)}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to load launch context (${response.status})`);
  }

  return (await response.json()) as LaunchContext;
}

/** Reports the completed mission's results back to Schoolynq. */
export async function sendMissionCallback(
  token: string,
  context: LaunchContext,
  result: MissionResult,
): Promise<void> {
  const totalAnswered = result.students.reduce((sum, s) => sum + s.answered, 0);
  const totalCorrect = result.students.reduce((sum, s) => sum + s.correct, 0);

  const body = {
    launchToken: token,
    launchSessionId: context.launchSessionId,
    // Unique per run (a launch can be replayed), but stable within a run so a
    // retried callback for the same run is de-duplicated server side.
    providerSessionId:
      `${context.mission.providerMissionId}:${context.launchSessionId}:${result.startedAt ?? "run"}`.slice(
        0,
        255,
      ),
    schoolId: context.school.id,
    teacherId: context.teacher.id,
    classId: context.class.id,
    subjectId: context.subject.id,
    missionId: context.mission.id,
    sessionStartedAt: result.startedAt ?? undefined,
    sessionEndedAt: result.endedAt,
    // Per-student totals — the platform reads student ids from this shape.
    students: result.students.map((s) => ({
      id: s.id,
      name: s.name,
      totalAnswered: s.answered,
      totalCorrect: s.correct,
    })),
    // One record per answered question, for student participation analytics.
    responses: result.responses
      .filter((response) => response.studentId)
      .map((response) => ({
        studentId: response.studentId,
        questionId: response.questionId,
        questionType: response.questionType,
        answer: response.isCorrect ? "correct" : "incorrect",
        isCorrect: response.isCorrect,
      })),
    summary: { totalAnswered, totalCorrect },
  };

  const response = await fetch(`${API_BASE}/mission-callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to report mission results (${response.status})`);
  }
}
