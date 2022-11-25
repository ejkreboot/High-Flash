# HFP-CARDS

Module providing simple sqlite backed CRUD operations for basic flash cards.

```js
import { Cards } from "../cards.js";
let c = new Cards(false); // in-memory
await c.add("A card front", "A card back") ;
await c.add("Another card front", "Another card back") ;
let cards = await c.get_all();
cards.forEach(c => console.log(c.front, c.back))
```