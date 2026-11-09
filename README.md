# Kasatria Assignment: 3D People Table

A 3D visualisation of 200 people, adapted from the three.js
[periodic table demo](https://threejs.org/examples/#css3d_periodictable).
Users sign in with Google, and the page loads its data from a Google Sheet.

**Live demo:** https://zychan1222.github.io/kasatria-assignment/

## Features

- Sign in with Google
- Data loaded from a Google Sheet through the Google Sheets API
- Each tile shows country, age, photo, name and interest
- Tile colour by net worth: red (up to $100K), orange (above $100K), green (above $200K)
- Four layouts: Table (20x10), Sphere, Double Helix, Grid (5x4x10)

## Tech stack

- three.js (CSS3DRenderer) and tween.js
- Google Identity Services and Google Sheets API
- HTML, CSS and JavaScript, hosted on GitHub Pages

## Files

| File | Purpose |
|---|---|
| `index.html` | Page and login card |
| `style.css` | Styling |
| `config.js` | Client ID, API key, sheet ID and range |
| `main.js` | Login, data loading, tiles and layouts |

## Notes

The API key in `config.js` is visible to anyone, since the site has no backend.
It is restricted to the Google Sheets API and this site's address.