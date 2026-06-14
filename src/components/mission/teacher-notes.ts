export const TEACHER_NOTES: Record<number, { title: string; script: string; misconceptions?: string[]; safety?: string[] }> = {
  1: { title: "Landing", script: "Set the scene. Tell students they are joining a team of Body System Investigators today." },
  2: { title: "Crew Roster", script: "Add or edit student names. The app will randomly call on these students during the mission." },
  3: { title: "Mission Briefing", script: "Read the briefing aloud. Ask: 'What do you already know about the heart?'", misconceptions: ["Pulse is the blood itself", "Heart pumps air"] },
  4: { title: "Prediction Poll", script: "Take a show of hands, then select the most popular class prediction. Predictions are not right or wrong yet." },
  5: { title: "Mini Teach", script: "Use the four reveal cards. Pause after each. Ask: 'What do muscles need more of when they work?'" },
  6: { title: "Crew Spotlight 1", script: "Build suspense before revealing the spotlight student. Encourage the class to support the chosen student." },
  7: { title: "Find Your Pulse", script: "Demonstrate the two-finger technique on your own wrist. Remind students not to use the thumb.", safety: ["Stay seated", "Quiet room"] },
  8: { title: "Resting Pulse Timer", script: "Start the timer and count silently with the class. Use a calm voice." },
  9: { title: "Record Resting Data", script: "Collect 3-5 sample counts from volunteers. Average will calculate automatically." },
  10: { title: "Exercise Round", script: "Stress safety. We are not racing. Stand beside desks with space.", safety: ["No running around the room", "Students with asthma or injury observe instead", "Stop if unwell"] },
  11: { title: "Exercise Timer", script: "Lead the jogging on the spot. Count down the last 10 seconds aloud." },
  12: { title: "After-Exercise Pulse", script: "Students sit quickly and find their pulse fast. Start the timer immediately." },
  13: { title: "Record After-Exercise Data", script: "Collect samples from the same volunteers if possible for a fair comparison." },
  14: { title: "Graph Reveal", script: "Ask: 'What pattern do we see?' Reveal the science statements one by one." },
  15: { title: "Fair Test", script: "Emphasise: change one thing, measure one thing, keep everything else the same." },
  16: { title: "Crew Spotlight 2", script: "Prompt the chosen student to explain in their own words first." },
  17: { title: "Boss Challenge", script: "Read the data table together. Ask students to point at the largest number first." },
  18: { title: "Exit Ticket", script: "Listen for the words 'oxygen' and 'muscles' in the student answer." },
  19: { title: "Mission Complete", script: "Celebrate! Print the handout for students to take home." },
};

export const LESSON_OBJECTIVE =
  "Students will explain that the heart pumps blood, that pulse is linked to heartbeat, and that pulse rate usually increases after exercise because muscles need more oxygen and food.";

export const COMMON_MISCONCEPTIONS = [
  "Pulse is the blood itself, not the push of blood through vessels.",
  "The heart pumps air around the body.",
  "A faster pulse only means illness.",
  "One result is enough to prove a conclusion.",
  "Pulse rate and breathing rate are the same thing.",
];

export const SAFETY_NOTES = [
  "Keep exercise gentle. No racing or pushing.",
  "Students with asthma, injury, or feeling unwell should observe instead.",
  "Allow students to stop at any time.",
  "Stand beside desks with clear space around them.",
];
