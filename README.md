# Threeline

A bass transcription editor built on three rows: how long the note is, where it
sits on the neck, and what it is called.

**→ https://ubrowz.github.io/threeline/**

The two files that get served:

- `index.html` — the landing page
- `bass-notation.html` — the editor itself, 153 KB

The editor is self-contained and works offline. Transcriptions are saved as
plain `.json` on your own machine; nothing is uploaded anywhere.

## Working on it

`bass-notation.html` is the editor and is edited directly — it has no build step
and no dependencies. Open it in a browser and it runs.

`index.html` is generated. It embeds its images and notation so that it is a
single file with no external requests, which makes the built page unreadable, so
edit the source and rebuild:

    # change the words, the layout, the styling
    $EDITOR src/landing.html
    python3 build.py

    python3 build.py --check     # report only, write nothing

    src/landing.html        the page: copy, styling, the audio player
    src/assets/             the photograph and the screenshot
    src/demo/               the notation shown on the page

The built `index.html` is committed because GitHub Pages serves it straight from
the repository. The editor's size is measured during the build and stamped into
both the download button and this file, so it cannot fall out of date.

The notation on the page is the editor's own output rather than a drawing of it.
When the editor's rendering or playback changes, regenerate it — this drives the
real editor in headless Chrome and keeps what it produces:

    node src/demo/make-demos.mjs
    python3 build.py

## Licence

MIT — see [LICENSE](LICENSE). Use it, change it, pass it on.
