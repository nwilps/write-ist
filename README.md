# Write-ist

**A free, lightweight desktop app for writing screenplays — on your own computer, in your own
files.**

Write-ist is for screenwriters who want a calm, fast place to write that they actually own. There
is no account to make, no subscription, and no cloud. Your script is a plain
[Fountain](https://fountain.io) text file sitting in a folder on your disk, and it stays readable
in any text editor even if Write-ist disappears tomorrow.

Today Write-ist writes **screenplays**. Novels are planned for later, but they are not in the app
yet. It runs on **Linux** first; Windows and macOS are meant to follow.

![The Write-ist home screen](docs/images/home.png)

![A screenplay open in the Write-ist editor](docs/images/editor.png)

*The editor, showing the public sample screenplay* Brick & Steel *by Stu Maschwitz.*

## Philosophy

Write-ist is meant as the punk rock middle finger to our current cyberpunk tech overlords — the
ones who use terms like "industry standard" to force us into tools that are out of date, poorly
maintained, slow, buggy, inflexible, grossly overpriced, and designed to squeeze every bit of
ownership away from their users, treating us more like data cattle than a user base.

So, in plain terms:

- **It's free.** Not a trial, not freemium. Free.
- **It's open source**, under the MIT license.
- **Your files are plain files you own.** A project is an ordinary folder, and the script inside
  it is a Fountain text file. No proprietary format, no lock-in.
- **No account.** Nothing to sign up for or log in to.
- **No cloud.** Nothing you write is sent anywhere.
- **It works offline**, all of it, all the time.

## What it does today

Everything below is in the app now.

**Writing**

- **A screenplay editor laid out in industry format.** You write directly on the paper — sheets
  set in Courier Prime with standard margins, scene headings, action, character cues, dialogue,
  parentheticals, transitions and dual dialogue all in their proper places. The paper is drawn
  as separate sheets with page numbers, and (MORE) / (CONT'D) where a speech runs onto the next
  page.
- **The keys you expect.** Enter and Tab move between element types, character cues capitalise
  themselves, (CONT'D) is added when a character keeps talking, and bold, italic, underline,
  undo/redo, cut, copy and paste all work.
- **It saves itself.** A couple of seconds after you stop typing, when you switch to another
  app, and when you close the project. If another program changes your script while it's open,
  Write-ist won't write over that change.
- **Autocomplete** for character cues and scene headings, from the names and locations already
  in your script.
- **Character and location lists**, built from your script. **Confirm** a name or location and
  autocomplete offers it and spellcheck knows it.
- **Spellcheck, on demand.** Off until you turn it on (View ▸ Spellcheck). Right-click a flagged
  word for suggestions or to add it to your dictionary. It runs entirely on your computer.
- **Search** through the script, and jump to any match.
- **Page and word counts** along the bottom of the window, kept up to date as you type.
- **Writing goals.** A daily word goal with a streak, one-off sprints, and a thirty-day chart.

**Title page**

- **Edit Title Page** to fill in the title, credit, author, contact and the rest.
- **View Title Page** to preview it as it will print.

**Getting scripts in and out**

- **Import a Fountain file** to start a project from a script you already have.
- **Export as PDF**, laid out to industry format, with your title page in front.
- **Save a Copy as Fountain** — a clean copy to hand to someone else, with your private notes
  and cut material left out.

**Projects**

- A **Home** screen and an **Open Project** screen listing your projects.
- **Rename** or **delete** a project from its right-click menu. Deleting is recoverable: the
  project is moved to a `Deleted Projects` folder, never erased, and moving it back restores it.

**Not working yet:** the **Metrics** and **Settings** rows on the Home screen are there but do
nothing yet, and the **Notes** and **Plan** tabs above the editor are temporary placeholders.

## Ways to use it

- **Write a screenplay from scratch** — create a project and start typing.
- **Bring in a script you already have** — import a Fountain file and keep going.
- **Hand your script to someone else** — export a PDF, or save a clean Fountain copy.

All of it works fully offline.

## Running it yourself

There are **no packaged releases yet**, so for now Write-ist runs from source.

You need:

- a [Rust toolchain](https://www.rust-lang.org/tools/install)
- WebKitGTK 4.1 (on Debian or Ubuntu, `libwebkit2gtk-4.1-dev` and its companions — the full list
  is in [`.github/workflows/ci.yml`](.github/workflows/ci.yml))
- Node.js and npm

Then, from this folder:

```
npm install
npm run app          # build and launch Write-ist
```

To check your copy:

```
npm test             # the test suite
npm run typecheck    # the TypeScript type check
```

Some tests need a local corpus path (`$WRITE_IST_CORPUS`) and skip when it is absent.

## Status and what's next

The core screenplay features are built: you can write a whole screenplay in Write-ist and send
out a PDF. The remaining focused work is:

- a full start-to-finish test of the app ([#103](https://github.com/nwilps/write-ist/issues/103));
- a check, on Linux, of the text cursor where one sheet of paper meets the next
  ([#92](https://github.com/nwilps/write-ist/issues/92)).

Later work includes drafts, a registry of projects, novels, and Write-ist drawing its own
right-click menus everywhere ([#105](https://github.com/nwilps/write-ist/issues/105)).

The detailed, up-to-date record of what is built and what is not is
[`SETUP-CHECKLIST.md`](SETUP-CHECKLIST.md). The design decisions behind the app, each with its
reasons, are in [`docs/adr/`](docs/adr/).

## License

[MIT](LICENSE) © Noah Wilps
