"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { langPref } from "@/lib/prefs";
import type { Lang } from "@/lib/i18n";
import { ghost } from "@/lib/ui";

// The privacy policy (App Store Connect needs its URL; Swiss data protection law asks for one). Plain facts about
// what this app does with data, kept next to the code that does it: change one, change the other.
const CONTACT = "info@zettelispiil.ch";
const UPDATED = "27.09.2026";

type Section = { h: string; p: string[] };
const TEXT: Record<Lang, { title: string; intro: string; updated: string; back: string; sections: Section[] }> = {
  de: {
    title: "Datenschutz",
    intro: "Zettelispiil ist ein kostenloses Partyspiel ohne Werbung und ohne Tracking. Hier steht, welche Daten dabei anfallen, wo sie liegen und wie lange.",
    updated: `Stand: ${UPDATED}`,
    back: "Zurück",
    sections: [
      { h: "Verantwortlich", p: [`Dominik Peter, Schweiz. Kontakt: ${CONTACT}`] },
      { h: "Ohne Konto, auf deinem Handy", p: ["Spielen geht ohne Konto. Einstellungen (Sprache, Farben), die Spielernamen und ein Spiel mit einem Handy bleiben im Speicher deines Browsers bzw. der App (localStorage) und verlassen das Gerät nicht, ausser du lässt mit dem Funkel-Knopf einen lustigen Namen erfinden (siehe KI-Hilfe). Du löschst sie, indem du die Website-Daten oder die App löschst.", "Es gibt keine Analyse- oder Werbe-Cookies und keine Tracker."] },
      { h: "Spielen mit mehreren Handys", p: ["Für einen Raum speichert der Server die Namen der Mitspielenden, die Teams, die Zetteli, die Zeichnungen und den Spielstand. Das ist nötig, damit alle Handys dasselbe Spiel sehen. Ein Raum wird einen Tag nach der letzten Aktivität automatisch gelöscht."] },
      { h: "Anmelden (freiwillig, nur für die KI-Hilfe)", p: ["Wer sich anmeldet, tut das mit Apple, Google, GitHub, Microsoft oder einem Code per E-Mail. Wir erhalten dabei Name, E-Mail-Adresse und (falls vorhanden) das Profilbild. Die Anmeldung liegt in einem verschlüsselten Cookie und auf dem Server; es gibt keine Benutzerdatenbank. Den Code per E-Mail verschickt der Dienst Resend.", "Für die Übersicht der Nutzung zählen wir pro Tag, wie oft gespielt und angemeldet wurde, und pro Konto die Anzahl Anmeldungen und KI-Anfragen. Diese Zahlen werden nach etwa einem Jahr gelöscht. Was jemand schreibt, gehört nicht dazu."] },
      { h: "KI-Hilfe", p: ["Ist die KI-Hilfe an, werden die geschriebenen Begriffe (bzw. ein gewähltes Thema) an einen KI-Dienst geschickt: OpenAI oder, als Ersatz, OpenRouter. Sie prüfen Rechtschreibung, schlagen Hinweise, Ideen und Namen vor. Kontodaten werden nie mitgeschickt. Nur wenn du mit dem Funkel-Knopf einen lustigen Namen erfinden lässt, geht ein bereits getippter Name mit (aus «Beni» wird so «Alphorn-Beni»). Antworten werden ohne Bezug zu einer Person bis zu 30 Tage zwischengespeichert, damit gleiche Begriffe nicht zweimal abgefragt werden."] },
      { h: "Kaffee spendieren", p: ["Wer einen Kaffee spendiert, bezahlt direkt bei Stripe. Zahlungsdaten wie Kartennummern sehen wir nie; Stripe bearbeitet sie nach eigenen Datenschutzbestimmungen. In der iPhone-App läuft der Kaffee über den In-App-Kauf von Apple; auch da sehen wir keine Zahlungsdaten."] },
      { h: "Dienste und Serverstandorte", p: ["Die Website läuft bei Vercel (USA), die Räume und Zwischenspeicher bei Upstash, E-Mails bei Resend, die KI bei OpenAI bzw. OpenRouter (USA), Zahlungen bei Stripe. Diese Dienste bearbeiten Daten zum Teil in den USA. Beim Aufruf der Seite fallen bei Vercel technische Protokolle an (z. B. IP-Adresse, Zeitpunkt), die kurz aufbewahrt werden."] },
      { h: "Deine Rechte", p: [`Dein Konto löschst du selbst in den Einstellungen («Konto löschen»): Anmeldung und Zähler sind sofort weg, 30 Tage lang merken wir uns nur noch, dass es gelöscht ist (damit offene Räume keine KI mehr darüber nutzen); wer sich in der iPhone-App mit Apple angemeldet hat, dessen Anmeldung bei Apple wird dabei auch aufgehoben. Du kannst jederzeit Auskunft über deine Daten verlangen, sie berichtigen oder löschen lassen. Schreib dafür an ${CONTACT}. Du kannst dich ausserdem beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) beschweren.`] },
    ],
  },
  en: {
    title: "Privacy",
    intro: "Zettelispiil is a free party game with no ads and no tracking. This is what data comes up while you play, where it's kept and for how long.",
    updated: `Last updated: ${UPDATED}`,
    back: "Back",
    sections: [
      { h: "Who is responsible", p: [`Dominik Peter, Switzerland. Contact: ${CONTACT}`] },
      { h: "No account, on your phone", p: ["You can play without an account. Settings (language, colours), player names and a one-phone game stay in your browser's or the app's storage (localStorage) and never leave the device, unless you let the sparkle button invent a funny name (see AI help). Clearing the site data or deleting the app removes them.", "There are no analytics or advertising cookies and no trackers."] },
      { h: "Playing on several phones", p: ["For a room, the server stores the players' names, the teams, the slips, the drawings and the score, so every phone sees the same game. A room is deleted automatically one day after its last activity."] },
      { h: "Signing in (optional, only for AI help)", p: ["You can sign in with Apple, Google, GitHub, Microsoft or a code by e-mail. We then receive your name, e-mail address and (if there is one) profile picture. The sign-in lives in an encrypted cookie and on the server; there is no user database. Codes by e-mail are sent through Resend.", "For a usage overview we count per day how often people played and signed in, and per account the number of sign-ins and AI requests. These numbers are deleted after about a year. What anyone writes is not part of them."] },
      { h: "AI help", p: ["With AI help on, the words you write (or a chosen topic) are sent to an AI service: OpenAI or, as a fallback, OpenRouter. They check spelling and suggest hints, ideas and names. Account data is never sent. Only when you let the sparkle button invent a funny name does a name you already typed go along (so «Beni» can become «Alphorn-Beni»). Answers are cached for up to 30 days without any link to a person, so the same word isn't asked twice."] },
      { h: "Buying a coffee", p: ["A coffee is paid directly at Stripe. We never see payment details such as card numbers; Stripe handles them under its own privacy policy. In the iPhone app a coffee is an In-App Purchase through Apple; there too we never see payment details."] },
      { h: "Services and server locations", p: ["The website runs on Vercel (USA), rooms and caches on Upstash, e-mail on Resend, AI on OpenAI or OpenRouter (USA), payments on Stripe. These services partly process data in the USA. Visiting the site creates technical logs at Vercel (e.g. IP address, time), kept for a short time."] },
      { h: "Your rights", p: [`You can delete your account yourself in the settings (“Delete account”): the sign-in and counters are gone at once, and for 30 days we only keep a note that it was deleted (so open rooms stop using AI through it); if you signed in with Apple in the iPhone app, the sign-in is revoked at Apple too. You can ask at any time what data we have about you, and have it corrected or deleted: write to ${CONTACT}. You may also complain to the Swiss Federal Data Protection and Information Commissioner (FDPIC).`] },
    ],
  },
  fr: {
    title: "Protection des données",
    intro: "Zettelispiil est un jeu de soirée gratuit, sans publicité et sans suivi. Voici les données qui apparaissent en jouant, où elles sont gardées et combien de temps.",
    updated: `Mise à jour : ${UPDATED}`,
    back: "Retour",
    sections: [
      { h: "Responsable", p: [`Dominik Peter, Suisse. Contact : ${CONTACT}`] },
      { h: "Sans compte, sur ton téléphone", p: ["On peut jouer sans compte. Les réglages (langue, couleurs), les noms des joueurs et une partie sur un seul téléphone restent dans le stockage du navigateur ou de l'app (localStorage) et ne quittent pas l'appareil, sauf si tu laisses le bouton étincelle inventer un nom drôle (voir Aide IA). Effacer les données du site ou supprimer l'app les supprime.", "Il n'y a ni cookies d'analyse ou de publicité, ni traceurs."] },
      { h: "Jouer sur plusieurs téléphones", p: ["Pour une salle, le serveur garde les noms des joueurs, les équipes, les papiers, les dessins et le score, afin que tous les téléphones voient la même partie. Une salle est supprimée automatiquement un jour après sa dernière activité."] },
      { h: "Se connecter (facultatif, seulement pour l'aide IA)", p: ["On se connecte avec Apple, Google, GitHub, Microsoft ou un code par e-mail. Nous recevons alors le nom, l'adresse e-mail et (s'il y en a une) la photo de profil. La connexion est gardée dans un cookie chiffré et sur le serveur ; il n'y a pas de base de données d'utilisateurs. Les codes par e-mail sont envoyés par Resend.", "Pour un aperçu de l'utilisation, nous comptons par jour combien de fois on a joué et s'est connecté, et par compte le nombre de connexions et de requêtes IA. Ces chiffres sont supprimés après environ un an. Ce que quelqu'un écrit n'en fait pas partie."] },
      { h: "Aide IA", p: ["Avec l'aide IA, les mots écrits (ou un thème choisi) sont envoyés à un service d'IA : OpenAI ou, en remplacement, OpenRouter. Ils vérifient l'orthographe et proposent des indices, des idées et des noms. Les données de compte ne sont jamais envoyées. Seulement quand tu laisses le bouton étincelle inventer un nom drôle, un nom déjà tapé est envoyé (« Beni » devient ainsi « Alphorn-Beni »). Les réponses sont gardées jusqu'à 30 jours sans lien avec une personne, pour ne pas redemander le même mot."] },
      { h: "Offrir un café", p: ["Un café se paie directement chez Stripe. Nous ne voyons jamais les données de paiement comme les numéros de carte ; Stripe les traite selon sa propre politique. Dans l'app iPhone, le café passe par l'achat intégré d'Apple ; là non plus, nous ne voyons aucune donnée de paiement."] },
      { h: "Services et lieux des serveurs", p: ["Le site tourne chez Vercel (États-Unis), les salles et caches chez Upstash, les e-mails chez Resend, l'IA chez OpenAI ou OpenRouter (États-Unis), les paiements chez Stripe. Ces services traitent en partie des données aux États-Unis. La visite du site crée chez Vercel des journaux techniques (p. ex. adresse IP, heure), gardés peu de temps."] },
      { h: "Tes droits", p: [`Tu supprimes ton compte toi-même dans les réglages (« Supprimer le compte ») : la connexion et les compteurs disparaissent aussitôt, et pendant 30 jours nous gardons seulement une note qu'il a été supprimé (pour que les salles ouvertes n'utilisent plus l'IA par lui) ; si tu t'es connecté·e avec Apple dans l'app iPhone, la connexion est aussi révoquée chez Apple. Tu peux demander à tout moment quelles données nous avons sur toi, les faire corriger ou supprimer : écris à ${CONTACT}. Tu peux aussi porter plainte auprès du Préposé fédéral à la protection des données et à la transparence (PFPDT).`] },
    ],
  },
};

export default function Privacy() {
  const c = TEXT[langPref.use()];
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-3 pb-12">
      <header className="mb-4 flex min-h-[calc(2.75rem+2px)] items-center">
        <Link href="/" className={`${ghost} -ml-3 inline-flex items-center gap-1.5`}>
          <ArrowLeft className="size-5" aria-hidden /> {c.back}
        </Link>
      </header>
      <h1 className=" text-4xl font-extrabold tracking-tight">{c.title}</h1>
      <p className="mt-3 text-lg text-muted">{c.intro}</p>
      {c.sections.map((s) => (
        <section key={s.h} className="mt-8">
          <h2 className="text-xl font-bold">{s.h}</h2>
          {s.p.map((p) => (
            <p key={p} className="mt-2 leading-relaxed">
              {p}
            </p>
          ))}
        </section>
      ))}
      <p className="mt-10 text-sm text-muted">{c.updated}</p>
    </main>
  );
}
