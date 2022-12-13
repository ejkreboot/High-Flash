import { Sequelize, Op, DataTypes } from 'sequelize';
import { nanoid } from 'nanoid'
import pkg from 'csvtojson';
const { csv } = pkg;

export function Cards(persist = true, path = "../database.sqlite") {
    let sequelize;
    if(persist) {
        sequelize = new Sequelize(
            {    
                "logging": false,
                "dialect": "sqlite",
                "storage": path
            }
        )    
    } else {
        sequelize = new Sequelize(
            'sqlite::memory:',
            {    
                "logging": false
            }
        )    
    }

    const Card = sequelize.define('Card', {
        uuid: {
            type: DataTypes.UUID,
            primaryKey: true
        },
        front: DataTypes.TEXT,
        back: DataTypes.TEXT,
        category: DataTypes.TEXT
    });

    /*
     * The Progress model keeps track of each users mastery 
     * of each card so that repetition intervals may be 
     * adjusted accordingly.
     */
    const Progress = sequelize.define('Progress', {
        uuid: {
            type: DataTypes.UUID,
            primaryKey: true
        },
        card: DataTypes.UUID,
        user: DataTypes.UUID,
        n: DataTypes.NUMBER,
        efactor: DataTypes.NUMBER,
        interval: DataTypes.NUMBER,
        category: DataTypes.TEXT
    });

    async function sync_all() {
        await Card.sync();
        await Progress.sync();
    }

    async function add_card(front, back, category) {
        await Card.sync();
        let uuid = nanoid();
        await Card.create({
            front: front,
            back: back,
            category: category,
            uuid: uuid 
        });
        return uuid;
    }

    async function get_categories() {
        await Card.sync();
        let categories = await Card.findAll({
            attributes: ['category']
        })
        categories = categories.map(c => c.category);
        categories = categories.filter((x, i, a) => a.indexOf(x) == i);
        return categories;
    }

    async function get_category(category) {
        await Card.sync();
        let cards = await Card.findAll({
            where: {
                category: category
            }
        })
        return cards;
    }

    async function get_cards() {
        await Card.sync();
        const cards = await Card.findAll();
        return cards;
    }

    async function get_card(uuid) {
        await Card.sync();
        let card = await Card.findByPk(uuid);
        return card;
    }

    async function delete_card(uuid) {
        await Card.sync();
        await Card.destroy({
            where: { uuid: uuid },
        });
    }  

    async function update_card(card) {
        await Card.sync();
        const res = await Card.update(
            { front: card.front,
              back: card.back,
              category: card.category }, 
            { where: { uuid: card.uuid }});
        return card;
    }  

    /*
     * STUDY PROGRESS & SCORING FUNCTIONS
     * 
     */


    /*
     * count the cards actively being studied for the specified user_id and category
     */
    async function studying_count(user_id, category) {
        await sync_all();
        let cards = await Progress.findAll({
            attributes: ['uuid'],
            where: {
                user: user_id,
                category: category,
                interval: { [Op.gt]: -1}
            }
        })
        return(cards.length)
    }

    /*
     * count the inactive cards for the specified user_id and category
     */
    async function not_studying_count(user_id, category) {
        await sync_all();
        let cards = await Progress.findAll({
            attributes: ['uuid'],
            where: {
                user: user_id,
                category: category,
                interval: -1
            }
        })
        return(cards.length)
    }

    /*
     * make sure all the cards for this category are in the user's progress library
     * creating new entries where needed
     */
    async function start_studying(user_id, category) {
        await sync_all();
        let cards = await Card.findAll({
            attributes: ['uuid'],
            where: {
                category: category
            }
        })
        let progress = await Progress.findAll({
            attributes: ['uuid'],
            where: {
                user: user_id,
                category: category
            }
        })

        if(cards.length > progress.length) {
            for (const c of cards) {
                let p = await Progress.findOne(
                {
                    attributes: ['uuid'],
                    where: {
                        user: user_id,
                        card: c.uuid
                    }
                })
                if(p == null) {
                    await initialize_card(user_id, c.uuid);
                }
            }
        }  
        
        // make sure at least 10 cards are actively being studied (if 
        // there are that many cards).)
        await activate_cards(user_id, category)
        return;
    }

    /*
     * Get card score. Returns null if uninitialized.
     */
    async function get_score(user_id, card_id) {
        let p = await Progress.findOne({
            attributes: ['n', 'efactor', 'interval'],
            where: {
                user: user_id,
                card: card_id
            }
        })
        if(p == null) {
            return(null);
        } else {
            return(p.dataValues);
        }
    }

    /*
     * intialize a card for studying by this user. 
     * private function.
     */
    async function initialize_card(user_id, card_id, score = null) {
        let interval = 0;
        let count = 0;
        let p = await Progress.findOne({
            attributes: ['n', 'efactor', 'interval'],
            where: {
                user: user_id,
                card: card_id
            }
        })
        if(p == null) {
            // this card is not yet setup for this user. Initialize.
            let uuid = nanoid();
            let card = await Card.findOne({
                attributes: ['category'],
                where: { 
                    uuid: card_id
                }
            })
            await Progress.create({
                uuid: uuid,
                card: card_id,
                user: user_id,
                n: 0.0,
                efactor: 2.5,
                interval: -1, // card is not active yet
                category: card.category               
            })
        } 
        return;
    }

    /*
     * ensure at least 10 cards have interval of 1 if there are 
     * still inactive (never studied) flashes.
     */
    async function activate_cards(user_id, category) {
        const interval_one = await Progress.findAll({
            attributes: ['uuid'],
            where: {
                user: user_id,
                category: category,
                interval: 1
            }
        })

        if(interval_one.length >= 10) {
            return 0;
        }
        const inactive = await Progress.findAll({
            attributes: ['uuid'],
            limit: 10 - interval_one.length,
            where: {
                user: user_id,
                category: category,
                interval: -1 // inactive
            }
        })

        for (const f of inactive){
            await Progress.update(
                { 
                    interval: 1
                },
                { 
                    where: { 
                        uuid: f.uuid
                    }
                }
            );
        }
        return(10 - interval_one.length)
    }

    /*
     * Update interval and efactor based on study score 
     */
    async function study(user_id, card_id, score) {
        let sr = null;
        const p = await Progress.findOne({
            attributes: ['n', 'efactor', 'interval'],
            where: {
                user: user_id,
                card: card_id
            }
        })
        if(p == null) {
            throw Error ('cannot study unitialized card (cards.js line 279)')
        } else {
            const previous = { n: p.n, 
                               efactor: p.efactor, 
                               interval: p.interval };
            const evaluation = { score: score };
            sr = sm2(previous, evaluation);
            await Progress.update(
                { 
                    n: sr.n,
                    efactor: sr.efactor,
                    interval: sr.interval
                },
                { 
                    where: { 
                        card: card_id,
                        user: user_id 
                    }
                });
        }
        return(sr);
    }

    async function next_card(user_id, category) {
        await start_studying(user_id, category);
        await activate_cards(user_id, category, 10);
        const intervals = await Progress.findAll({
            attributes: ["uuid", "card", "interval"],
            where: {
                interval: { [Op.gt]: -1},
                user: user_id,
                category: category
            }
        })

        // get a weighted random sample with interval as the inverse weight
        const ints = intervals.map(i => i.interval);
        const imax = Math.max(...ints);

        // negative log to inversely weight. 
        let logints = ints.map(a => Math.ceil(-Math.log(a/(imax+1))));
        // log attenuates the differences in intervals, so exponentiate
        logints = logints.map(a => a**2)

        // now construct our array of ids, with the number of copies of each 
        // id equal to its weight such that the more heavily weighted ids 
        // are more likely to be selected.
        let weighted = logints.map((l,i) => (Array(l).fill(intervals[i].card))).reduce((i,c) => i.concat(c));
        const ix = Math.floor(Math.random() * weighted.length);
        const next = weighted[ix];

        const card = await Card.findOne({
            where: {
                uuid: next
            }
        })
        return(card)
    }

    /* 
     * UTILITY FUNCTIONS
     *
     */
    
    /*
     * Import cards from csv file.
     * Must have columns "Front", "Back", and "Category"
     * 
     * path: path to csv file
     * db: path to sqlite db. If omitted will use memory.
     * 
     */
    
    async function import_from_csv(path, db = null) {
        if(db == null) {
            db = this.path;
        }
        const cards=await(csv().fromFile(path));
        for(let a of cards) {
            await this.add_card(a.Front, a.Back, a.Category);
        }
    }

    return {
      add_card: add_card,
      delete_card: delete_card,
      get_card: get_card,
      get_categories: get_categories,
      get_category: get_category,
      get_all: get_cards,
      start_studying: start_studying,
      update_card: update_card,
      study: study,
      studying_count: studying_count,
      not_studying_count: not_studying_count,
      next_card: next_card,
      import_from_csv: import_from_csv,
      get_score: get_score
    }
}

function _round (x, d=0) {
    return(Math.round(x * 10**d) / 10**d)
}

/**
 * This is the SM-2 algorithm from SuperMemo. 
 *
 * See https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 */
 function sm2(previous, evaluation) {
    var n, efactor, interval

    if (previous == null) {
        previous = { n: 0, efactor: 2.5, interval: 0.0 }
    }

    efactor = Math.max(1.3, previous.efactor + (0.1 - (5 - evaluation.score) * (0.08+(5 - evaluation.score)*0.02)))

    if (evaluation.score < 3) {
        n = 0
        interval = 1
    } else {
        n = previous.n + 1

        if (previous.n == 0) {
            interval = 1
        } else if (previous.n == 1) {
            interval = 6
        } else {
            interval = Math.round(previous.interval * efactor)
        }
    }
    return {n: n, efactor: _round(efactor, 2), interval: _round(interval,2)}
}