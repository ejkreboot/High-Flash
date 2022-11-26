import { Cards } from "../cards.js";
import { strict as assert } from 'assert';

describe("Database functions", function() {
    let c = new Cards(false);
    it("should be able to create a database and add cards", async function() {
        await c.add_card("a", "b", "category 1") ;
        await c.add_card("c", "d", "category 1") ;
        await c.add_card("d", "e", "category 2") ;
        await c.add_card("f", "g", "category 2") ;
        await c.add_card("h", "i", "category 3") ;
        let cards = await c.get_all();
        assert.equal(cards.length, 5);
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
        let card = await(c.get_card(uuid));
        assert.equal(cards[0].uuid, card.uuid);
    });

    it("should be able to delete card by uuid", async function() {
        let cards = await c.get_all();
        const uuid = cards[0].uuid;
        await(c.delete_card(uuid));
        cards = await c.get_all();
        assert.equal(cards.length, 4);
    });

    it("should be able to retrieve categories", async function() {
        let cats = await c.get_categories();
        assert.equal(cats.length, 3);
        assert.equal(cats[1], "category 2");
    });

    it("should be able to retrieve cards in a category", async function() {
        let cards = await c.get_category("category 2");
        assert.equal(cards.length, 2);
    });
});
