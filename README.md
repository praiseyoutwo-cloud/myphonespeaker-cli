# myphonespeaker

Command-line companion to [MyPhoneSpeaker](https://myphonespeaker.com/): the water eject tone as a WAV file you can play on your phone, a speaker check sweep, wet phone first aid with sources, and a drying timer.

No dependencies. Node.js 18 or newer.

```bash
npx myphonespeaker eject
```

## Commands

| Command | What it does |
|---|---|
| `eject [--out file.wav] [--resonance]` | Writes the water eject tone as a WAV file (about 92 s). Add `--resonance` for the experimental 450-900 Hz sweep at the end. |
| `check [--out file.wav]` | Writes a 200-4000 Hz listening sweep for a before/after check. |
| `first-aid [--sources]` | Prints what to do when a phone gets wet, in order, with source numbers. `--sources` lists the links (Apple, Google, Samsung, Xiaomi, iFixit). |
| `timer [minutes]` | Counts down the drying time before cable charging. Default: 300 minutes (Apple's 5-hour rule for a wet iPhone). |
| `tools` | Lists the free browser tools on myphonespeaker.com. |
| `open [tool-id]` | Opens a tool in your browser. Default: the water eject tone. |

## What the tone is

Three cycles of ten sine pulses. The pulses step from 150 Hz to 300 Hz, 1.5 s on and 0.75 s off, with a 12 s pause between cycles. The parameters are the same as on the website and come from one file, `data/protocol.json`. The method and the measurements of other speaker cleaner sounds are on [How we measured](https://myphonespeaker.com/how-we-measured/).

## How to use the WAV file

1. Send the file to your phone and play it there. The tone works only through the phone's own speaker. Laptop speakers do not help a phone.
2. Take off the case. Set the volume to full. Hold the phone speaker side down.
3. In the pauses, let water drip out and wipe the grille gently with a dry cloth.

> **Note:** The tone helps only with a muffled speaker after a splash. It does not dry the inside of a phone. If the phone was under water, does not turn on, or got salt water or a sugary drink on it, run `npx myphonespeaker first-aid` first. See [Does the water eject sound work?](https://myphonespeaker.com/does-water-eject-sound-work/) for what independent tests found.

The guided browser version, with a before/after check and a drying timer, is at [myphonespeaker.com](https://myphonespeaker.com/).

## License

MIT
