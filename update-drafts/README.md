# Update Drafts

This folder is the easy way to add Brighton updates.

Create one `.md` file per update. Use a simple filename like:

```text
2026-06-15-a-quick-announcement.md
```

Each file should look like this:

```text
date: June 15, 2026
sortDate: 2026-06-15
title: A Quick Announcement
category: Big Moments
image: assets/updates/dinoboysc-sticker-lab.jpeg
imageAlt: Brighton's Project Update
excerpt: Brighton's idea, dad is the tool to complete it.
hearts: 342
comments: 28
published: yes
---
Paste the full update here.

Blank lines become paragraph breaks.

No JSON formatting needed.
```

After adding or editing draft files, run:

```bash
node scripts/update-drafts-to-json.js
```

That rebuilds `data/updates.json`, which is what `updates.html` reads.

Use `published: draft` if you want to keep a file here without showing it on the website yet.

