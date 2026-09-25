// topics the AI writes Zetteli about when the host lets it ("KI schreibt"). Only these ids ever reach a prompt.
import type { Lang } from "./i18n.ts";

export type TopicIcon =
  | "PawPrint" | "UtensilsCrossed" | "Star" | "Clapperboard" | "Globe" | "Mountain" | "Trophy" | "Briefcase"
  | "Sofa" | "Music" | "Castle" | "Trees" | "Car" | "Palette" | "PartyPopper" | "PersonStanding";
/** `en` also tells the model what the topic is about */
export type Topic = { id: string; icon: TopicIcon; name: Record<Lang, string> };

export const TOPICS = [
  { id: "animals", icon: "PawPrint", name: { de: "Tiere", en: "Animals", fr: "Animaux" } },
  { id: "food", icon: "UtensilsCrossed", name: { de: "Essen & Trinken", en: "Food & drink", fr: "Manger & boire" } },
  { id: "people", icon: "Star", name: { de: "Promis", en: "Famous people", fr: "Célébrités" } },
  { id: "films", icon: "Clapperboard", name: { de: "Filme & Serien", en: "Films & series", fr: "Films & séries" } },
  { id: "places", icon: "Globe", name: { de: "Orte & Länder", en: "Places & countries", fr: "Lieux & pays" } },
  { id: "switzerland", icon: "Mountain", name: { de: "Schwiiz", en: "Switzerland", fr: "Suisse" } },
  { id: "sports", icon: "Trophy", name: { de: "Sport", en: "Sports", fr: "Sport" } },
  { id: "jobs", icon: "Briefcase", name: { de: "Berufe", en: "Jobs", fr: "Métiers" } },
  { id: "household", icon: "Sofa", name: { de: "Sachen im Huus", en: "Household things", fr: "Objets de la maison" } },
  { id: "music", icon: "Music", name: { de: "Musik", en: "Music", fr: "Musique" } },
  { id: "fairytales", icon: "Castle", name: { de: "Märli & Figuren", en: "Fairy tales & characters", fr: "Contes & personnages" } },
  { id: "nature", icon: "Trees", name: { de: "Natur", en: "Nature", fr: "Nature" } },
  { id: "vehicles", icon: "Car", name: { de: "Fahrzeuge", en: "Vehicles", fr: "Véhicules" } },
  { id: "hobbies", icon: "Palette", name: { de: "Hobbys", en: "Hobbies", fr: "Loisirs" } },
  { id: "celebrations", icon: "PartyPopper", name: { de: "Feste & Fiirtage", en: "Holidays & celebrations", fr: "Fêtes & célébrations" } },
  { id: "body", icon: "PersonStanding", name: { de: "Körper", en: "Body", fr: "Corps" } },
] as const satisfies readonly Topic[];

export const TOPIC_IDS: string[] = TOPICS.map((t) => t.id);
export const topicById = (id: string): Topic | undefined => TOPICS.find((t) => t.id === id);
