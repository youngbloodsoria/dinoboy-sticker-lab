# Updates Data

The website reads `data/updates.json`.

The easiest way to edit Brighton updates is **not** to edit this JSON directly.
Use the text files in `update-drafts/` instead.

## Recommended workflow

1. Put photos in `assets/updates/`.
2. Create or edit one `.md` file in `update-drafts/`.
3. Paste the full GoFundMe update under the `---` line.
4. Run:

```bash
node scripts/update-drafts-to-json.js
```

That rebuilds `data/updates.json` for the site.

The older spreadsheet files are still here as an optional backup, but the draft-file workflow is better for long updates.

