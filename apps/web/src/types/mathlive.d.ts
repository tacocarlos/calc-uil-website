import type { MathfieldElement } from "mathlive";
import type { DetailedHTMLProps, HTMLAttributes } from "react";

// MathLive ships no JSX types for its <math-field> custom element.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": DetailedHTMLProps<
        HTMLAttributes<MathfieldElement>,
        MathfieldElement
      >;
    }
  }
}
