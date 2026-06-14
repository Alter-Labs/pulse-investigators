import { createFileRoute } from "@tanstack/react-router";
import PulseMission from "@/components/mission/PulseMission";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inside the Human Body: The Pulse Signal — Year 5 Classroom Mission" },
      { name: "description", content: "A teacher-led classroom mission for Year 5 Cambridge Primary Science. Investigate how exercise changes pulse rate." },
      { property: "og:title", content: "Inside the Human Body: The Pulse Signal" },
      { property: "og:description", content: "Teacher-operated science mission with timers, pulse data, fair-test skill and printable handout." },
    ],
  }),
  component: Index,
});

function Index() {
  return <PulseMission />;
}
