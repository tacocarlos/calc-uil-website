# Number Crunchers Practice: calculator keypad

Students use a real calculator as the keypad for a practice website.

| Path | What |
|---|---|
| [apps/web](apps/web) | The Next.js site |
| [packages/keypad](packages/keypad) | `@calc-uil/keypad`: the reusable module, with React hooks. See its README. |
| [demo](demo) | Plain HTML/JS demo built on the package, with no framework |
| [calc/ti84ce](calc/ti84ce) | Source of the KEYPAD calculator program (CE C toolchain) |

## Run it

```sh
npm install
npm run dev       # Next.js site at http://localhost:3000 (builds the package first)
./start.sh        # or: the plain demo at http://localhost:8000/demo/
npm test          # package tests
```

Use Chrome or Edge. Without a calculator, the on-screen keypad and computer keyboard work too.

## TI-84 Plus CE

Click **Install KEYPAD on calculator** with the calculator on the home screen. This sends KEYPAD and the
LIBLOAD, KEYPADC, USBDRVCE and SRLDRVCE libraries from
[CE-Programming/libraries v15.0](https://github.com/CE-Programming/libraries/releases/tag/v15.0) over WebUSB,
using the package's own DUSB link (`packages/keypad/src/dusb.ts`), tested on a real TI-84 Plus CE (OS 5.8.3).
Then run `prgmKEYPAD` and click **Connect calculator**. Press [on] to quit.

To rebuild the program (needs the [CE C toolchain](https://ce-programming.github.io/toolchain/)):

```sh
cd calc/ti84ce && make site   # builds KEYPAD.8xp and copies it into packages/keypad/assets/ti84ce/
```

> OS 5.5 and later block C/assembly programs, so most calculators need the [arTIfiCE](https://yvantt.github.io/arTIfiCE/)
> jailbreak first. Click **Set up arTIfiCE…**, enter the calculator's OS version, and the site sends the right release
> (v2.1 for OS 5.5–5.8.4, v3 for 5.8.5) and walks through the steps. arTIfiCE is GPL-3.0, by YvanTT; its files are in
> `packages/keypad/assets/ti84ce/artifice/`.
>
> **Windows:** if TI Connect CE is installed, its driver may claim the calculator and block WebUSB.

## USB protocol

Newline-terminated ASCII lines, so any calculator program can speak it:

| Calculator → site | Meaning |
|---|---|
| `HELLO <model> <version>` | Handshake (`HELLO TI84CE 1`). Sent on connect and whenever the site writes anything. |
| `D <key>` / `U <key>` | Key down / up. Key ids are in `packages/keypad/src/keys.ts`. |
| `BYE` | Program exited. |
