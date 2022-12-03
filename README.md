# HFP-CARDS

## Summary

Module providing sqlite backed flash card collections combined with spaced repetition cueing of cards for users.

The flashcard store is straightforward. Cards have "front", "back", and "category" attributes. 

The study functions are a little more nuanced. Here is an overview:

1. When a new user is initialized (via the `start_studying` method--see below), all cards are initialized to an 
interval of -1, indicating they are not being actively studied (i.e. they are "inactive").
2. When `next_card` is called the first time, the library activates 10 cards (assuming there are that many). These 
cards have their interval set to "1" (theoretically 1 day, but given the realities of studying the actual time units 
are arbitrary). Subsequent calls to `next_card` will verify that there are at least 10 cards being actively studied 
with an interval of 1 (until there are no more cards to add to the active studying collection).
3. When `study` is called for a specific card, the interval is updated based on the user's self-reported mastery 
(on a 1-5 scale) combined on a difficulty score that the library calculates based on the user's past performance on 
that card (if any). This is done using a variation of [version 2 of the supermemo algorithm](https://super-memory.com/english/ol/sm2.htm). 
4. Rinse and repeat.

## Usage
```js

// initialize database and create some cards
import { Cards } from "../cards.js";
let c = new Cards(false); // in-memory
// let c = new Cards(true, "path/to/db.sqlite); // save to disk
await c.add("A card front", "A card back", "Neurology") ;
await c.add("Another card front", "Another card back") ;
let cards = await c.get_all();

// intialize for a given user. Note that 'User1' can be any 
// arbitray ID that is meaningful to the rest of your application
await c.start_studying("User1", "Neurology")

// update interval based on self-reported mastery (on a 1-5 scale)
let sr = await c.study("User1", cards[0].uuid, 4)

// get the next card to study, with cards with less mastery being 
// more likely to be presented. 
await c.next_card("User1", "Neurology")}

```