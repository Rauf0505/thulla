import { rank, suit } from "./engine";
export function botCard({
  choices,
  lead,
}: {
  choices: string[];
  lead?: string;
}) {
  if (!choices.length) throw Error("Bot has no legal move.");
  return [...choices].sort((a, b) =>
    lead && suit(a) !== suit(lead) ? rank(b) - rank(a) : rank(a) - rank(b),
  )[0];
}
