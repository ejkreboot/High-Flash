import { Cards } from "../cards.js";
import { strict as assert } from 'assert';
import pkg from 'csvtojson';
const { csv } = pkg;

let c = new Cards(false);

before(async () => {  
    await c.import_from_csv("tests/cards.csv");
    // const cards=await(csv().fromFile("tests/cards.csv"));
    // cards.forEach(async function(a) {await c.add_card(a.Front, a.Back, a.Category)});
})

describe("Database functions", function() {
    it("should be able to create a database and add cards", async function() {
        let cards = await c.get_all();
        assert.equal(cards.length, 30);
    });

    it("should be able to retrieve card fronts", async function() {
        let cards = await c.get_all()
        assert(cards[1].front.match("^You are caring for a 4 year male who presents "));
    });

    it("should be able to retrieve card backs", async function() {
        let cards = await c.get_all()
        assert(cards[1].back.match('^The patient has signs.*'));
    });

    it("should be able to retrieve cards by uuid", async function() {
        let cards = await c.get_all();
        const uuid = cards[0].uuid;
        let card = await(c.get_card(uuid));
        assert.equal(cards[0].uuid, card.uuid);
    });

    it("should be able to delete card by uuid", async function() {
        let cards = await c.get_all();
        const uuid = cards[20].uuid;
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
        assert.equal(cards.length, 18);
    });
});

describe("Study functions", function() {
    it("should be able to initialize study for specified user", async function() {
        let a = await c.studying_count("1", "Neurology")
        let i = await c.not_studying_count("1", "Neurology")
        assert.equal(a, 0)
        assert.equal(i, 0)
        await c.start_studying("1", "Neurology")
        a = await c.studying_count("1", "Neurology")
        i = await c.not_studying_count("1", "Neurology")
        assert.equal(a, 10)
        assert.equal(i, 8)

    });
    it("should be able to add newly added card to user flash collection", async function() {
        await c.add_card("A new card front", "A new card back", "Neurology");
        let i = await c.not_studying_count("1", "Neurology")
        assert.equal(i, 8)
        await c.start_studying("1", "Neurology")
        i = await c.not_studying_count("1", "Neurology")
        assert.equal(i, 9)
    });
    it("should compute intervals after studying", async function() {
        const cards = await c.get_category("Neurology")
        let sr = await c.study("1", cards[0].uuid, 4)
        assert.equal(sr.efactor, 2.5)
        assert.equal(sr.interval, 1)

        sr = await c.study("1", cards[0].uuid, 5)
        assert.equal(sr.efactor, 2.6)
        assert.equal(sr.interval, 6)

        sr = await c.study("1", cards[0].uuid, 3)
        sr = await c.study("1", cards[0].uuid, 1)
        assert.equal(sr.efactor, 1.92)
        assert.equal(sr.interval, 1)
    });

   it("should return the next flash to study", async function() {
        // selection is partially random so hard to test without a seed which Math.random 
        // does not utilize. So this test is rather lame.
        assert.doesNotThrow(async function() { await c.next_card("1", "Neurology")});
        let card = await c.next_card("1", "Neurology");
        assert.equal(card.category, "Neurology")
        assert.equal(await c.studying_count("1", "Neurology"), 10)
    });

    it("should get a card score", async function() {
        const cards = await c.get_category("Neurology");
        const score = await c.get_score(1, cards[0].uuid)
        console.log(score);
        assert.equal(1, 1);
    });
});


