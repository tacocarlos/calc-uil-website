import type { Metadata } from "next";
import { ConnectionLight } from "@/components/calc/connection";
import { KeyLog } from "@/components/calc/key-log";
import { OnScreenKeypad } from "@/components/calc/on-screen-keypad";
import { PracticeSession } from "@/components/calc/practice-session";
import { Desktop } from "@/components/xp/desktop";

export const metadata: Metadata = {
  title: "Practice · Number Crunchers",
};

const WINDOWS = [
  { id: "practice", title: "Number Crunchers Practice" },
  { id: "keypad", title: "TI-84 Plus CE" },
  { id: "log", title: "Key Events" },
];

export default function PracticePage() {
  return (
    <Desktop windows={WINDOWS} tray={<ConnectionLight />}>
      <main className="mx-auto grid max-w-6xl items-start gap-4 p-4 md:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 flex-col gap-4">
          <PracticeSession />
          <KeyLog />
        </div>
        <OnScreenKeypad />
      </main>
    </Desktop>
  );
}
