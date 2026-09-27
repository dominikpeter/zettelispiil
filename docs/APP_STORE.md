# App Store listing

What goes into App Store Connect for Zettelispiil (app 6816618404, bundle `ch.zettelispiil.app`). Copy the fields as
they are; the limits in brackets are Apple's.

## Version page (iOS App → <version> Prepare for Submission)

**Promotional Text** (170)

> Das Schweizer Partyspiel mit Zetteli: schreiben, falten, erraten. Mit einem Handy zum Herumreichen oder jede:r mit dem eigenen. Gratis und ohne Werbung.

**Description** (4000)

> Zettelispiil ist das Partyspiel mit Zetteli, direkt im Handy. Alle schreiben Begriffe auf Zetteli: Personen, Orte, Dinge, Filme, alles, was sich erklären lässt. Zwei bis vier Teams erraten sie in bis zu fünf Runden, und jede Runde wird es schwieriger.
>
> SO GEHT'S
> • Umschreiben: Erklär den Begriff mit so vielen Worten, wie du willst.
> • Pantomime: Kein Wort, kein Laut, nur Hände, Füsse und Mimik.
> • Ein Wort: Genau ein Wort als Hinweis.
> • Geräusch: Nur Töne und Geräusche.
> • Zeichnen: Live auf dem Handy, die anderen schauen zu.
> Es bleiben immer dieselben Begriffe, aber die Regeln werden strenger. Wer sich merkt, was gekommen ist, hat einen Vorteil.
>
> MIT EINEM ODER MIT MEHREREN HANDYS
> • Ein Handy: Ihr reicht es herum. Wer schreibt, schreibt heimlich, wer erklärt, wischt: nach rechts erraten, nach links passen.
> • Mehrere Handys: Einer erstellt einen Raum, alle anderen kommen per Code, QR oder Link dazu. Jede:r schreibt auf dem eigenen Handy, gezeichnet wird live.
>
> ALLES DABEI
> • Teams mit lustigen Namen, per Fingertipp oder Ziehen zusammengestellt
> • Sekunden pro Zug, Passen pro Zug, Runden und Reihenfolge nach Lust
> • Stören: Die anderen Teams dürfen die Erklärerin ablenken (mit mehreren Handys)
> • Statistik am Schluss: Auszeichnungen, wer am schnellsten erklärt hat, welche Zetteli am schwierigsten waren, zum Antippen für jede Person und jedes Zetteli
> • Auf Wunsch KI-Hilfe: Rechtschreibung, Hinweise für die Erklärerin, Ideen, wenn niemandem etwas einfällt, oder gleich alle Zetteli von der KI
> • Deutsch, Englisch und Französisch, Schweizer Schreibweise
> • Hell, dunkel und neun Farbwelten
>
> Gratis, ohne Werbung, ohne Tracking. Spielen geht ohne Konto.

**Keywords** (100, comma-separated, no spaces needed)

> partyspiel,zettel,begriffe,erraten,pantomime,activity,tabu,gruppenspiel,familie,schweiz,trinkspiel,team

**Support URL**: `https://github.com/dominikpeter/zettelispiil/issues`
**Marketing URL**: `https://zettelispiil.ch`
**Copyright**: `2026 Dominik Peter`
**Version**: the version in `package.json` (e.g. `1.16.1`). CI stamps it into the build as `MARKETING_VERSION`, and
App Store Connect only accepts a build whose version matches the version record, so create the record with that number.

**Screenshots**: `assets/app-store/iphone` (6.5" iPhone, 1284 × 2778) and `assets/app-store/ipad` (13" iPad,
2048 × 2732, needed because the app also runs on iPad). JPEG, since Apple rejects images with transparency. Upload them in file-name order; the first three show on the
install sheet. `just store-shots` makes both sets again (with `just dev` running).

## App Review Information

- **Sign-in required**: no. Everything can be tried without an account; sign-in only unlocks the optional AI help.
- **Notes** (4000):

> Zettelispiil is a party game (salad bowl / fishbowl) for a group in one room. To try it alone: tap "Neues Spiel" (one phone), then "Spiel starten", write a word for each player ("Ich bin …" → type → "In die Schüssel"), then "Los, Zetteli ziehen" and swipe the word right (guessed) or left (skip). The game runs through up to five rounds and ends with statistics.
> "Mehrere Handys" lets several phones play together in a room (6-character code, QR code or link).
> AI help is optional and needs a sign-in (Sign in with Apple, or a code sent by e-mail); playing never needs an account. Optional tips ("Spendier mir einen Kaffee" in the settings) are consumable In-App Purchases; they unlock nothing. No ads.

- **Contact**: Dominik Peter, info@zettelispiil.ch

## App Information

- **Subtitle** (30): `Das Partyspiel mit Zetteli`
- **Category**: Games → Word (secondary: Games → Family)
- **Privacy Policy URL**: `https://zettelispiil.ch/datenschutz`
- **Age Rating**: all "None" / "No"; no unrestricted web access (the app shows only zettelispiil.ch), no user-generated
  content shared publicly (Zetteli stay in the game's room and are deleted after a day). Result: 4+.
- **Content Rights**: no third-party content.

## App Privacy (Trust & Safety → App Privacy)

- **Data collection**: yes. Two cases, answer both:
  - **Playing on several phones (no account needed)**: the room keeps what the players enter so every phone sees the
    same game, deleted a day after the last activity.
    - **User Content → Gameplay Content**: player names (nicknames), the Zetteli, drawings, scores. App Functionality,
      not used for tracking. **Linked** to the user: when the host is signed in, the room keeps the host's account id
      (so AI help runs on that account), which ties the room's content to that account. Without sign-in nothing
      identifies anyone, but Apple asks for the strictest case.
  - **Signing in for AI help (optional)**:
    - **Contact Info → Email Address** and **Name**: App Functionality (sign-in), linked to the user, not used for
      tracking.
    - **User Content → Photos or Videos**: the profile picture a Google, GitHub or Microsoft sign-in brings along, kept
      with the sign-in (the app itself shows only the name). App Functionality, linked, not used for tracking. (The iOS app offers only Sign in with Apple and the e-mail code, so there it never comes up, but the declaration covers
      the website sign-in to the same account too.)
    - **Identifiers → User ID**: App Functionality, linked, not used for tracking.
    - **Usage Data → Product Interaction**: counts of sign-ins and AI requests per account, App Functionality / Analytics,
      linked, not used for tracking.
  - With AI help on, the words written for a game (and, for the funny-name button, a name already typed) go to the AI
    service; that is the same **Gameplay Content** as above, nothing extra to declare.
- **Tracking**: no. No data is used to track people across apps or websites.
- A one-phone game without sign-in keeps everything on the phone.

## Pricing and Availability

Free, all countries (or Switzerland, Germany, Austria, France, … if you prefer to start small).

## Sign in with Apple (one-time setup)

At developer.apple.com → Certificates, Identifiers & Profiles:

1. **Identifiers** → `ch.zettelispiil.app` → tick **Sign In with Apple** (Enable as a primary App ID) → Save. The iPhone
   app signs in natively with it (`ios/App/App/AppleSignIn.swift`, entitlement in `App.entitlements`).
2. **Identifiers** → **+** → **Services IDs** → Identifier `ch.zettelispiil.signin`, description "Zettelispiil Web" →
   Register. Open it, tick **Sign In with Apple** → Configure: primary App ID `ch.zettelispiil.app`, Domains
   `zettelispiil.ch`, Return URLs `https://zettelispiil.ch/api/auth/callback/apple` → Save. The website signs in with it.
3. **Keys** → **+** → name "Zettelispiil Sign in with Apple", tick **Sign in with Apple** → Configure: primary App ID
   `ch.zettelispiil.app` → Register → download `AuthKey_<KEYID>.p8` (only once possible).
4. `just apple-signin-setup ~/Downloads/AuthKey_<KEYID>.p8`: stores it in `.env.local` and Vercel. The server makes the
   client secret from it at start, so nothing expires after Apple's six months.

## Coffee as In-App Purchase (one-time setup)

In the iPhone app the coffee is an In-App Purchase (App Review 3.1.1: tips inside apps go through Apple). The website
keeps Stripe. `ios/App/App/Coffee.swift` sells them; the settings show them once Apple has approved the products.

1. App Store Connect → **Business**: sign the **Paid Apps Agreement**, add bank account and tax forms. Optionally join
   the **Small Business Program** (Apple keeps 15% instead of 30%).
2. App → **Monetization → In-App Purchases** → **+**, type **Consumable**, three times:

   | Reference name | Product ID | Price | Display name (DE) | Description (DE) |
   | --- | --- | --- | --- | --- |
   | Kleiner Kaffee | `ch.zettelispiil.coffee.small` | CHF 1.00 | Kleiner Kaffee | Ein kleiner Kaffee für Zettelispiil |
   | Grosser Kaffee | `ch.zettelispiil.coffee.big` | CHF 5.00 | Grosser Kaffee | Ein grosser Kaffee für Zettelispiil |
   | Deluxe-Kaffee | `ch.zettelispiil.coffee.deluxe` | CHF 10.00 | Deluxe-Kaffee | Ein Deluxe-Kaffee für Zettelispiil |

   Each needs a review screenshot (the coffee section in the app's settings) and availability in all countries.
3. The first In-App Purchases go to review together with an app version: on the version page, under
   **In-App Purchases and Subscriptions**, add all three before **Add for Review**.
