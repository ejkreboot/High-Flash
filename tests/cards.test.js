import { Cards } from "../cards.js";
import { strict as assert } from 'assert';

describe("Database functions", function() {
    let c = new Cards(false);
    it("should be able to create a database and add cards", async function() {
        await c.add("a", "b") ;
        await c.add("c", "d") ;
        let cards = await c.get_all();
        assert.equal(cards.length, 2);
    });

    it("should be able to retrieve card fronts", async function() {
        let cards = await c.get_all()
        assert.equal(cards[1].front, "c");
    });

    it("should be able to retrieve card backs", async function() {
        let cards = await c.get_all()
        assert.equal(cards[1].back, "d");
    });

    it("should be able to retrieve cards by uuid", async function() {
        let cards = await c.get_all();
        const uuid = cards[0].uuid;
        let card = await(c.get(uuid));
        assert.equal(cards[0].uuid, card.uuid);
    });

    it("should be able to delete card uuid", async function() {
        let cards = await c.get_all();
        const uuid = cards[0].uuid;
        await(c.delete(uuid));
        cards = await c.get_all();
        assert.equal(cards.length, 1);
    });

});
