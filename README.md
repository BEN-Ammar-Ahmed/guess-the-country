# Guess the Country

A quiz game website for the African Students Association (ASA) at FGCU, run on one laptop at ASA events.

## How to play

Double-click `index.html` to open it in Chrome, then click **⛶ Full screen**. It needs internet for the flags, map and fonts.

1. Choose **Solo** or **1 vs 1** at the top of the home page.
2. Pick one of 6 games: Guess the Flag, Fun Fact Match, Find It on the Map, Capital Cities, Guess the Dish, Language Match.
3. Answer 10 random questions. Each one has a 15-second timer.
   - **Solo:** click or press 1–4. Get 7 right to win a sticker.
   - **1 vs 1:** players take turns, one question each, back and forth (5 each, 10 total). Most right answers wins. A tie gives each player one bonus question.
4. The Join ASA page with the QR codes shows next.

## Files

- `index.html`: the pages
- `style.css`: colors, layout and animations
- `app.js`: game logic
- `data.js`: countries, capitals, look-alike flags, fun facts, dishes and language phrases. Edit this to add or fix questions.
- `CREDITS.md`: who took each dish photo and its license
- `assets/`: ASA logo, QR codes and dish photos

## Settings

At the top of `app.js`: `QUESTIONS_PER_ROUND` (10), `DUEL_QUESTIONS_EACH` (5), `SCORE_TO_WIN` (7) and `SECONDS_PER_QUESTION` (15).
