# Canonical rules — version 1

Source baseline: https://www.pagat.com/inflation/getaway.html (reviewed 2026-10-17). These rules are fixed for a room; clients cannot supply variations.

## Setup

3–8 players begin; play continues with two. Deal all 52 unique cards clockwise, one at a time after the dealer, with hand sizes differing by at most one. A K Q J 10…2; no trump or suit ranking. Dealer rotates on rematch. The holder must lead AS.

## Transition table

| Situation | Resolution | Next leader |
|---|---|---|
| Opening | Everyone plays once, following spades if held; always discard all cards | AS holder |
| Ordinary play, same suit | Continue clockwise among this trick's participants | Unchanged until resolution |
| First off-suit after opening | Stop immediately; highest lead-suit card collects all played cards | Collector |
| All participants follow suit | Discard trick | Highest lead-suit card |
| Empty-handed player retains lead | Draw one random previous waste card before adding current trick to waste | Must lead the drawn card |
| Empty hand without lead after resolution | Escape permanently | Skip their seat |
| One active player remains | Finish, even if that player's hand is temporarily empty | Remaining player loses |

Players cannot escape mid-trick: a provisional empty hand may collect a Thulla. Trick participants are fixed when it starts; no player gets a second move in that trick.

## Examples and endgames

AH, 4H, KS: stop on KS; AH's player takes all three cards. Later seats do not play. During the opening AS, 4H, KS does not stop: everyone still plays and the pile is discarded.

AH versus 2H as both players' final cards: 2H's player escapes and AH's player loses. If the lower card's owner still has cards, the empty leader draws from old waste and must lead that card. A higher same-suit response lets the drawing player escape and the responder loses, even if the response was also their last card. A lower response repeats the normal process; if it was the responder's last card, the drawn-card leader loses. A Thulla response to a drawn lead immediately makes the drawn-card leader lose, per Pagat's shortcut.

## Hand-taking

After resolution there is a five-second window. Any active player can take the next clockwise active player's whole hand. That player escapes; if they held the lead, the taker inherits it and any forced drawn card. Taking does not extend the window. The server processes competing requests in arrival order against the current version. A stale request is rejected; the client must choose again. With two players, taking the opponent's hand immediately loses the game for the taker.

## Digital adaptations

Opening play follows strict seat order. Illegal actions are rejected without physical-game penalties. Thirty seconds per turn; bot covers a missed turn and disconnected seats. Human can reconnect and act before the automatic move. Previous waste draws use server randomness. Empty old waste when drawing is an invariant error: reject transition, preserve last snapshot, log room incident; operator investigation is required. No silent rule fallback.
