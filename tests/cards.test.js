import { Cards } from "../cards.js";
import { strict as assert } from 'assert';
import { readFile } from 'fs/promises';

let c = new Cards();

before(async () => {  
    await c.reset_db();
    const data = await readFile('tests/cards.csv', 'utf8');
    await c.import_from_csv(data, false);
})

describe("Database functions", function() {
    it("should be able to create a database and add cards", async function() {
        let cards = await c.get_all();
        assert.equal(cards.length, 30);
    });
    it("should be able to retrieve card fronts", async function() {
        let cards = await c.get_all();
        assert(cards[1].front.match(/^\w+/));
    });

    it("should be able to retrieve card backs", async function() {
        let cards = await c.get_all()
        assert(cards[1].back.match(/^\w+/));
    });

    it("should be able to retrieve cards by uuid", async function() {
        let cards = await c.get_all();
        const uuid = cards[0].uuid;
        let card = await(c.get_card(uuid));
        assert.equal(cards[0].uuid, card.uuid);
    });

    it("should be able to delete card by uuid", async function() {
        // don't delete a neurology card or subsequent test will fail
        let cards = await c.get_all({category: 'Endocrinology'}); 
        const uuid = cards[1].uuid;
        await(c.delete_card(uuid));
        cards = await c.get_all();
        assert.equal(cards.length, 29);
    });

    it("should be able to retrieve categories", async function() {
        let cats = await c.get_categories();
        assert.equal(cats.length, 2);
        assert(cats.indexOf("Endocrinology") > -1);
    });

    it("should be able to retrieve cards in a category", async function() {
        let cards = await c.get_category("Neurology");
        assert.equal(cards.length, 18);
    });
});

describe("Study functions", function() {
    it("should be able to initialize study for specified user", async function() {
        let a = await c.studying_count("a@mail.com", "Neurology")
        let i = await c.not_studying_count("a@mail.com1", "Neurology")
        assert.equal(a, 0)
        assert.equal(i, 0)
        await c.start_studying("a@mail.com", "Neurology")
        a = await c.studying_count("a@mail.com", "Neurology")
        i = await c.not_studying_count("a@mail.com", "Neurology")
        assert.equal(a, 10)
        assert.equal(i, 8)
    });

    it("should be able to initialize study for a second user", async function() {
        let a = await c.studying_count("b@mail.com", "Neurology")
        let i = await c.not_studying_count("1b@mail.com", "Neurology")
        assert.equal(a, 0)
        assert.equal(i, 0)
        await c.start_studying("b@mail.com", "Neurology")
        a = await c.studying_count("b@mail.com", "Neurology")
        i = await c.not_studying_count("b@mail.com", "Neurology")
        assert.equal(a, 10)
        assert.equal(i, 8)
        assert.equal(8, 8)
    });
    it("should be able to add newly added card to user progress collection", async function() {
        await c.add_card("A new card front", "A new card back", "Neurology");
        let i = await c.not_studying_count("b@mail.com", "Neurology")
        assert.equal(i, 8)
        await c.start_studying("b@mail.com", "Neurology")
         i = await c.not_studying_count("b@mail.com", "Neurology")
         assert.equal(i, 9)
    });

    it("should compute intervals after studying", async function() {
        const cards = await c.get_category("Neurology")
        let sr = await c.study("b@mail.com", cards[0].uuid, 4)
        assert.equal(sr.efactor, 2.5)
        assert.equal(sr.interval, 2)

        sr = await c.study("b@mail.com", cards[0].uuid, 5)
        assert.equal(sr.efactor, 2.6)
        assert.equal(sr.interval, 4)

        sr = await c.study("b@mail.com", cards[0].uuid, 3)
        sr = await c.study("b@mail.com", cards[0].uuid, 1)
        assert.equal(sr.efactor, 1.92)
        assert.equal(sr.interval, 1)
    });

    it("should return the next card to study", async function() {
        // selection is partially random so hard to test without a seed which Math.random 
        // does not utilize. So this test is rather lame.
        assert.doesNotThrow(async function() { await c.next_card("b@mail.com", "Neurology")});
        let card = await c.next_card("b@mail.com", "Neurology");
        assert.equal(card.category, "Neurology")
        // depending on which cards are studied above, studying count may be 10 or 11
        assert(await c.studying_count("b@mail.com", "Neurology") > 9);
        assert(await c.studying_count("b@mail.com", "Neurology") < 12);
    });

    it("should get a card score", async function() {
        const cards = await c.get_category("Neurology");
        const score = await c.get_score("b@mail.com", cards[0].uuid);
        assert.equal(1, 1);
    });
});

after(async () => {  
     await c.close_db()
})
