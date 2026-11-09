# Guess the Country

A quiz game website for the African Students Association (ASA) at FGCU, run on one laptop at ASA events.

## How to play

Double-click `index.html` to open it in Chrome, then click **⛶ Full screen**. It needs internet for the flags, map and fonts.

1. Choose **Solo** or **1 vs 1** at the top of the home page.
2. Pick one of 4 games: Guess the Flag, Fun Fact Match, Find It on the Map, Capital Cities.
3. Answer 3 random questions. Each one has a 15-second timer.
   - **Solo:** click or press 1–4. Get 2 right to win a sticker.
   - **1 vs 1:** Player 1 presses A S D F, Player 2 presses H J K L. The first right answer gets the point; a wrong answer locks you out of that question. A tie goes to a bonus question.
4. The Join ASA page with the QR codes shows next.

## Files

- `index.html`: the pages
- `style.css`: colors, layout and animations
- `app.js`: game logic
- `data.js`: countries, capitals, look-alike flags and fun facts. Edit this to add or fix facts.
- `assets/`: ASA logo and QR codes

## Settings

At the top of `app.js`: `QUESTIONS_PER_ROUND` (3), `SCORE_TO_WIN` (2), `SECONDS_PER_QUESTION` (15), and the 1 vs 1 keys.
