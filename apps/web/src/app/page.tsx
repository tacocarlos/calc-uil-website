import { Desktop } from "@/components/xp/desktop";
import { NavButton } from "@/components/xp/nav-button";
import { XpWindow } from "@/components/xp/window";

const WINDOWS = [{ id: "welcome", title: "Welcome" }];

export default function Home() {
  return (
    <Desktop windows={WINDOWS}>
      <main className="grid min-h-full place-items-center p-4">
        <XpWindow
          id="welcome"
          title="Welcome to Number Crunchers Practice"
          className="w-[min(30rem,100%)]"
          bodyClassName="flex flex-col gap-3"
        >
          <p className="text-sm">
            Practice UIL Number Crunchers with your own TI-84 Plus CE as the
            keypad. Plug it in, install the KEYPAD program once, and every key
            you press shows up here.
          </p>
          <fieldset>
            <legend>Requirements</legend>
            <p>Chrome or Edge on a computer or Chromebook.</p>
            <p>
              No calculator? The on-screen keypad and your keyboard work too.
            </p>
            <p>
              Answers are written as X.YZ × 10<sup>k</sup> (3 significant
              digits).
            </p>
          </fieldset>
          <div className="flex justify-end">
            <NavButton href="/practice" className="default">
              Start practicing
            </NavButton>
          </div>
        </XpWindow>
      </main>
    </Desktop>
  );
}
