import { CalcKeypadProvider } from "@calc-uil/keypad/react";

// One provider for everything under /practice: a calculator can only be
// connected once, so all components share this keypad and connection.
// The installer downloads files from /calc-keypad/ti84ce/ (see scripts/copy-calc-assets.mjs).
export default function PracticeLayout({ children }: LayoutProps<"/practice">) {
  return <CalcKeypadProvider>{children}</CalcKeypadProvider>;
}
