# Celebration refinement tests

Run `npm install --prefix tests/celebration-refinements`, then `npm run test:database --prefix tests/celebration-refinements`.

For browser tests serve the repository on port 8765 (`python3 -m http.server 8765 --bind 127.0.0.1`) and run `npm run test:browser --prefix tests/celebration-refinements`. Use Playwright Chromium or set `CHROME_PATH` to a Chrome executable. Screenshots are saved in the OS temporary directory. Browser services are mocked and database tests use isolated PGlite; neither test creates production content, sends updates, or charges a card.

Coverage includes stable randomized pin backfill, repeat migration, preserved existing media, immediate text, media approvals, authorized moderation, duplicate prevention, private data, remember/forget consent, returning guests, optional-story multi-file uploads, lost-response retry, clustered map targets, direct navigation, and mobile layout/video sizing. YouTube playback is a separate external integration check.
