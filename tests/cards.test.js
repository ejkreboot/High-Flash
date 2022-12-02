import { Cards } from "../cards.js";
import { strict as assert } from 'assert';
import pkg from 'csvtojson';
const { csv } = pkg;

async function load_cards() {
    const cards=await(csv().fromFile("tests/cards.csv"));
    return(cards);
}
let c = new Cards(false);

describe("Database functions", function() {
    it("should be able to create a database and add cards", async function() {
        let tc = await(load_cards());
        tc.forEach(async function(a) {await c.add_card(a.Front, a.Back, a.Category)});
        let cards = await c.get_all();
        assert.equal(cards.length, 30);
    });

    it("should be able to retrieve card fronts", async function() {
        let cards = await c.get_all()
        assert.equal(cards[1].front, "What MRI imaging modality is represented by this image:");
    });

    it("should be able to retrieve card backs", async function() {
        let cards = await c.get_all()
        assert(cards[1].back.match('^T2 FLAIR.*'));
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
        assert.equal(cards.length, 29);
    });

    it("should be able to retrieve categories", async function() {
        let cats = await c.get_categories();
        assert.equal(cats.length, 2);
        assert.equal(cats[1], "Endocrinology");
    });

    it("should be able to retrieve cards in a category", async function() {
        let cards = await c.get_category("Neurology");
        assert.equal(cards.length, 17);
    });
});

describe("Study functions", function() {
    it("should be able to initialize study for specified user", async function() {
        let a = await c.active_card_count("1", "Neurology")
        let i = await c.inactive_card_count("1", "Neurology")
        assert.equal(a, 0)
        assert.equal(i, 0)
        await c.init_study("1", "Neurology")
        a = await c.active_card_count("1", "Neurology")
        i = await c.inactive_card_count("1", "Neurology")
        assert.equal(a, 0)
        assert.equal(i, 17)

    });
    it("should be able to add newly added card to user flash collection", async function() {
        await c.add_card("A new card front", "A new card back", "Neurology");
        let i = await c.inactive_card_count("1", "Neurology")
        assert.equal(i, 17)
        await c.init_study("1", "Neurology")
        i = await c.inactive_card_count("1", "Neurology")
        assert.equal(i, 18)
    });
    it("should be compute intervals after studying", async function() {
        const cards = await c.get_category("Neurology")
        let sr = await c.study("1", cards[0].uuid, 4)
        assert.equal(sr.efactor, 2.5)
        assert.equal(sr.interval, 1)

        sr = await c.study("1", cards[0].uuid, 5)
        assert.equal(sr.efactor, 2.6)
        assert.equal(sr.interval, 6)

        sr = await c.study("1", cards[0].uuid, 3)
        sr = await c.study("1", cards[0].uuid, 1)
        assert.equal(sr.efactor, 1.96)
        assert.equal(sr.interval, 1)
    });

});


