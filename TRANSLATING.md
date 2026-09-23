# Translating the app

🇪🇸 The app was written in Spanish and is fully available in English. This page explains how to fix a translation or add a missing one, **whether or not you code**.

## The easy way: tell us

If you see Spanish in the English app, or an English text that reads oddly, [open a translation issue](https://github.com/Ssebv/maraton-marvel/issues/new?template=5-traduccion.yml). Say where you saw it (a screenshot helps a lot) and, if you like, how you'd word it. That's all.

## Editing it yourself

You can make the change right on GitHub, with no setup: open the file, click the pencil ✏️, edit, and choose *Propose changes*. GitHub opens a pull request for review.

Where each text lives:

| What you see | File | How it's written |
|---|---|---|
| Buttons, menus, messages, Settings | [`src/App.jsx`](src/App.jsx) | `tr('Spanish', 'English')`: change only the **second** text |
| Synopses, notes, guides, eras, when a title takes place, the multiverse | [`src/en-textos.js`](src/en-textos.js) | `"Spanish": "English",`: change only the text **after** the colon |
| Movie and series titles | [`src/titulos-en.js`](src/titulos-en.js) | Generated from TMDB (en-US); only titles that differ from the Spanish one |
| Episode titles | [`src/episodios-en.js`](src/episodios-en.js) | Generated from TMDB (en-US) |
| Posters | [`src/posters-en.js`](src/posters-en.js) | Generated from TMDB: the best-rated English poster (`npm run posters-en`) |

A few rules:

- **Don't touch the Spanish text.** In `src/en-textos.js` it's the key the app looks up: if it changes, the English stops showing.
- **Keep it short.** Many texts live on buttons and cards on a phone screen: aim for about the same length as the Spanish.
- **Plain, friendly English**, US spelling (*theater*, *fall*, *favorite*), and the official US title for each movie or series.
- **No spoilers** in anything shown before a title is watched.

Titles and episodes are generated: if one is wrong on TMDB, it's best fixed on [TMDB](https://www.themoviedb.org/) itself. Otherwise, open an issue and we'll pin the right one.

## Checks (for people who code)

```bash
npm install
npm test                             # lists any synopsis, note or guide with no English entry
npm run build && node scripts/sondas/ingles.mjs   # walks the whole app in English and lists lines that look Spanish
```

`npm test` flags texts added to `src/data.js` without their entry in `src/en-textos.js`. The `ingles` probe opens every view, the Filters, More and Settings sheets, the multiverse and several title pages in English and lists anything that still looks Spanish; proper names (people, *Español* in the language picker) also show up there, and that's fine.

Thanks for helping the marathon reach more people! 🍿
