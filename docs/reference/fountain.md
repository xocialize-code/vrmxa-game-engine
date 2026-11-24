---
title: "The Fountain subset"
description: "The screenplay syntax a VRMXG script is written in: elements, tags, parenthetical words and timing defaults."
order: 60
---

# The Fountain subset

> Generated from `@vrmxg/script` (`src/vocab.js`, its README) and the sample script by `scripts/docs-reference.mjs`. Don't edit it: change the code and run `npm run docs:reference`.

A VRMXG script is plain text in a subset of [Fountain](https://fountain.io), the screenplay format. `@vrmxg/script`
reads it with its own parser and builds a sequence from it: shots, the cast on their marks, dialogue, looks, a
default performance and cameras. Errors point at script lines.

## The subset

From the package's own README (`engine/packages/script/README.md`):

| Element | Written as | Notes |
|---|---|---|
| Title page | `Key: value` lines at the top, indented continuation lines | Starts only on a known key (Fountain's Title, Credit, Author, Source, Draft date, Contact … or ours), so a script opening `FADE IN:` keeps that line. Our keys: `Set` (the set's file), `Cast` (`HANA = hana-1`), `Marks` (`HANA = behind-counter`), `fps`. Others are kept |
| Scene heading | `INT.` / `EXT.` / `EST.` / `INT./EXT.` / `I/E`, or forced with `.`; `#10#` scene number | A duplicate scene number is an error |
| Action | Any other paragraph; forced with `!`; `>centred<` | |
| Character cue | All capitals, then dialogue on the next line; forced with `@`; `(V.O.)`, `(O.S.)`; `^` for dual dialogue | `(CONT'D)` is ignored. A `^` line must come straight after the line it overlaps |
| Parenthetical | `(…)` inside a dialogue block | Read for performance (below) |
| Dialogue | The lines under a cue, until a blank line | A line of exactly two spaces keeps the block going |
| Transition | `… TO:` or `FADE OUT.` alone between blank lines, or forced with `>` | |
| Notes | `[[…]]` on one line | Tags when they read as one (below); otherwise a writer's note, ignored |
| Boneyard, sections, synopses, page breaks | `/* … */`, `#`, `=`, `===` | Read and ignored; a line the boneyard takes whole is gone, not blank, so it doesn't end a dialogue block |
| Not in the subset | Lyrics (`~`), notes over several lines, an unclosed boneyard | Errors at their lines |

**Tags** are notes that read as one. Typing `[[nod]]` gives a gesture (VRMXA slots: greet, nod, shrug, point, laugh,
cheer, sip, use, sit, stand), and `[[happy]]` an expression (happy, angry, sad, relaxed, surprised, neutral). Three
tags take a value: `[[look: MIRA]]` (a cast name, `camera` or a mark), `[[at: counter]]` (a mark) and `[[hold: 3]]` (an
action's seconds). In dialogue, a tag acts at its word, for the speaker. In action, it names who first
(`[[HANA happy]]`) and acts from the start of the sentence it follows. An unknown one-word tag is an error, because it
is far more likely a typo than a note. `vocab` narrows the lists, as casting (W6) will to a persona's allowed
expressions.

**Parentheticals** are read word by word:
- *smiling*, *grins* and *warmly* raise an expression;
- *nods*, *shrugs*, *waves* and *laughs* play a gesture;
- *beat* (0.5 s) and *pause* (1 s) add silence;
- *to Mira* points the speaker's look.

The full list is `PAREN_WORDS` in `src/vocab.js`. Its tables have no prototype, so a word such as `constructor` looks up nothing.

## Vocabulary

What tags and parentheticals may ask for. Casting narrows the expressions to what a character's persona allows.

| Kind | Written as | Values |
|---|---|---|
| Gesture tag | `[[nod]]` | `greet`, `nod`, `shrug`, `point`, `laugh`, `cheer`, `sip`, `use`, `sit`, `stand` |
| Expression tag | `[[happy]]` | `happy`, `angry`, `sad`, `relaxed`, `surprised`, `neutral` |
| Tag with a value | `[[look: MIRA]]` | `look`, `at`, `hold` |

**Words in a parenthetical**, matched as whole words in lower case:

| Word | Raises the expression |
|---|---|
| `smiling` | `happy` |
| `smiles` | `happy` |
| `smile` | `happy` |
| `grinning` | `happy` |
| `grins` | `happy` |
| `happily` | `happy` |
| `cheerful` | `happy` |
| `cheerfully` | `happy` |
| `brightly` | `happy` |
| `beaming` | `happy` |
| `laughs` | `happy` |
| `laughing` | `happy` |
| `sad` | `sad` |
| `sadly` | `sad` |
| `sighs` | `sad` |
| `sighing` | `sad` |
| `tearful` | `sad` |
| `angry` | `angry` |
| `angrily` | `angry` |
| `annoyed` | `angry` |
| `frowning` | `angry` |
| `frowns` | `angry` |
| `surprised` | `surprised` |
| `startled` | `surprised` |
| `gasps` | `surprised` |
| `shocked` | `surprised` |
| `relaxed` | `relaxed` |
| `calm` | `relaxed` |
| `calmly` | `relaxed` |
| `warmly` | `relaxed` |
| `softly` | `relaxed` |
| `gently` | `relaxed` |

| Word | Plays the gesture |
|---|---|
| `nods` | `nod` |
| `nodding` | `nod` |
| `nod` | `nod` |
| `shrugs` | `shrug` |
| `shrugging` | `shrug` |
| `shrug` | `shrug` |
| `waves` | `greet` |
| `waving` | `greet` |
| `wave` | `greet` |
| `points` | `point` |
| `pointing` | `point` |
| `laughs` | `laugh` |
| `laughing` | `laugh` |
| `laugh` | `laugh` |
| `cheers` | `cheer` |
| `sips` | `sip` |
| `sipping` | `sip` |

| Word | Adds silence |
|---|---|
| `beat` | 0.5 s |
| `pause` | 1 s |

## Timing defaults

How long the build gives each element before a line is voiced. A voiced line takes its clip's length instead.

| What | Value |
|---|---|
| A scene heading's establishing shot | 2 s |
| Action | 0.3 s a word, between 1.5 and 8 s |
| A line of dialogue | 0.4 s, plus 0.32 s a word, between 1 and 12 s |
| Silence after each line | 0.25 s |
| Silence after the last beat | 1 s |
| A gesture | 1.5 s |
| An expression | rises over 8 frames to a weight of 0.7, falls over 16 frames |
| A dissolve | 12 frames |

## An example

The sample project's "The Order" (`content/sample/scripts/cafe-order.fountain`). It parses into 13 beats with no errors.

```text
Title: The Order
Credit: A sample script for VRMXG (M4 W4)
Set: cafe.vrmxs
Cast:
    HANA = hana-1
    MIRA = mira
Marks:
    HANA = behind-counter
    MIRA = counter-front

INT. CAFE - MORNING

Sun through the front window. Hana wipes the counter as Mira steps up to it.

HANA
(smiling)
Good morning! [[greet]] What can I get you?

MIRA
Hmm. [[point]] A latte, please. And one of those croissants.

HANA
(nods)
Coming right up!

Hana turns to the espresso machine. Steam hisses. [[MIRA look: HANA]]

MIRA
(to Hana)
Is it always this quiet in the morning?

HANA
(beat)
Only until the students wake up. [[laugh]]

> DISSOLVE TO:

Hana sets the cup and the croissant on the counter. [[HANA happy]]

HANA
Here you go. Enjoy!

MIRA
(warmly)
Thank you! [[sip]]

FADE OUT.
```
