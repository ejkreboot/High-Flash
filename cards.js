import { Sequelize, Op, DataTypes } from 'sequelize';
import pg from 'pg';
import { v4 as uuid } from 'uuid'
import pkg from 'csvtojson';
const { csv } = pkg;

export function Cards(config = {}) {
    config.query = { raw: true };

    let sequelize = new Sequelize(config.postgres_url, config);

    async function close_db() {
        await sequelize.close();
        return;
    }

    async function check_db() {
        let ok = true;
        try {
            const card_count = await Card.count();
            const prog_count = await Progress.count();
        } catch(e) {
            ok = false;
        }
        return ok;
    }

    async function reset_db() {
        const ok = await check_db();
        if(ok) {
            await Card.destroy({ where: {} })
            await Progress.destroy({ where: {} })
            await Card.sync();
            await Progress.sync();        
        } else {
            // clean up corrupt table structure.
            await init_db();
            await Card.destroy({ where: {} })
            await Progress.destroy({ where: {} })
            await Card.sync();
            await Progress.sync();        
            await init_db();
        }
    }

    async function init_db() {
        const ok = await check_db();
        if(!ok) {
            await Card.sync();
            await Progress.sync();
        }
        return(true);
    }

    const Card = sequelize.define('Card', 
        {
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            uuid: {
                type: DataTypes.UUID,
                primaryKey: false
            },
            front: DataTypes.TEXT,
            back: DataTypes.TEXT,
            category: DataTypes.STRING(100)
        },
        {
            indexes: [
                {
                    unique: true,
                    fields: ['uuid']
                },
                {
                    fields: ['category']
                },

            ]
        }
        );

    /*
     * The Progress model keeps track of each users mastery 
     * of each card so that repetition weights may be 
     * adjusted accordingly.
     */
    const Progress = sequelize.define('Progress', 
        {
            uuid: {
                type: DataTypes.UUID,
                primaryKey: true
            },
            card: DataTypes.TEXT,
            user: DataTypes.STRING(100), // email
            n: DataTypes.INTEGER,
            weight: DataTypes.INTEGER,
            category: DataTypes.STRING(100)
        },
        {
            indexes: [
                {
                    fields: ['user']
                },
                {
                    fields: ['user', 'category']
                },
            ]
        }
    );

    async function add_card(front, back, category) {
        const card = {
            front: front,
            back: back,
            category: category,
            uuid: uuid()
        }
        await Card.create(card)
        return(card);
    }

    async function add_cards(cards) {
        const rows = cards.map(o => {return {uuid: uuid(), 
            front: o.front,
            back: o.back,
            category: o.category}});
        await Card.bulkCreate(rows);
        return;
    }

    async function get_categories() {
        let categories = await Card.findAll({
            attributes: ['category']
        })
        categories = categories.map(c => c.category);
        categories = categories.filter((x, i, a) => a.indexOf(x) == i);

        return categories;
    }

    async function get_category(category) {
        let cards = await Card.findAll({
            where: {
                category: category
            }
        })
        return cards;
    }

    async function get_cards(where = null) {
        let cards = await Card.findAll( { where });
        cards = cards.sort((a,b) => a.id - b.id)
        return cards;
    }

    async function get_card(uuid) {
        let card = await Card.findOne({ where: { uuid: uuid }} )
        return card;
    }

    async function delete_card(uuid) {
        const count = await Card.destroy({
            where: { uuid: uuid },
        });
        await Progress.destroy({
            where: { card: uuid },
        });
        return(count);
    }  

    async function update_card(card) {
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
        let cards = await Progress.findAll({
            attributes: ['uuid'],
            where: {
                user: user_id,
                category: category,
                weight: { [Op.gt]: -1}
            }
        })
        return(cards.length)
    }

    /*
    * count the cards actively being studied for the specified user_id and category
    */
    async function mastered_count(user_id, category) {
        let cards = await Progress.findAll({
            attributes: ['uuid'],
            where: {
                user: user_id,
                category: category,
                weight: { [Op.gt]: 10}
            }
        })
        return(cards.length)
    }

    /*
     * count the inactive cards for the specified user_id and category
     */
    async function not_studying_count(user_id, category) {
        let cards = await Progress.findAll({
            attributes: ['uuid'],
            where: {
                user: user_id,
                category: category,
                weight: -1
            }
        })
        return(cards.length)
    }

    function _prf(s, m = null) {
        let n = new Date().getTime();
        m = m || "";
        return(n)
    }
    /*
     * make sure all the cards for this category are in the user's progress library
     * creating new entries where needed
     */
    async function start_studying(user_id, category) {

        let cards = (await sequelize.query("SELECT uuid, category FROM \"" + config.schema + "\".\"Cards\" WHERE category = '" + 
                                          category + "' and uuid::text NOT IN " +
                                          "(SELECT card FROM \"" + config.schema + "\".\"Progresses\" where \"user\" = '" +
                                          user_id + "' AND \"category\" = '" + category + "')"))[0];
        if(cards.length > 0) {
            cards = cards.map((x) => {return({user_id: user_id, card_id: x.uuid, category: category})});
            await initialize_cards(cards);
        }  
        
        // make sure at least 10 cards are actively being studied (if 
        // there are that many cards).
        await activate_cards(user_id, category)
        return;
    }

    /*
     * Get card score. Returns null if uninitialized.
     */
    async function get_score(user_id, card_id) {
        let p = await Progress.findOne({
            attributes: ['n', 'weight'],
            where: {
                user: user_id,
                card: card_id
            }
        })
        if(p == null) {
            return(null);
        } else {
            return(p);
        }
    }

    /*
     * intialize a card for studying by this user. 
     * private function.
     */
    async function initialize_cards(cards) {
        const rows = cards.map(o => {return {uuid: uuid(), 
                                             card: o.card_id, 
                                             user: o.user_id, 
                                             n: 0.0, 
                                             weight: -1, 
                                             category: o.category}})
        await Progress.bulkCreate(rows);
        return;
    }

    /*
     * ensure at least 10 cards have weight of 0 if there are 
     * still inactive (never studied) cards.
     */
    async function activate_cards(user_id, category) {
        const weights = [-1, 0]
        const lt_one = await Progress.findAll({
            attributes: ['uuid', 'weight'],
            where: {
                user: user_id,
                category: category,
                weight: weights
            }
        })
        let weight_zero = lt_one.reduce((t, x) => t + (x.weight == 0), 0)

        if(weight_zero >= 10) {
            return 0;
        }

        let inactive = lt_one.filter((x) => x.weight == -1)

        if(inactive.length > (10 - weight_zero)) {
          inactive = inactive.slice(0, (10 - weight_zero))
        }

        const ids = inactive.map(i => i.uuid);
        await Progress.update(
            { 
                weight: 0
            },
            { 
                where: { 
                    uuid: ids
                }
            }
        );
        return(10 - weight_zero)
    }

    /*
     * Update weight and efactor based on study score 
     */
    async function study(user_id, card_id, score) {
        let sr = null;
        const p = await Progress.findOne({
            attributes: ['n', 'weight'],
            where: {
                user: user_id,
                card: card_id
            }
        })
        if(p == null) {
            throw Error ('cannot study unitialized card (cards.js line 279)')
        } else {
            const previous = { n: p.n, 
                               weight: p.weight };
            const evaluation = { score: score };

            sr = calc_weight(previous, evaluation);

            await Progress.update(
                { 
                    n: sr.n,
                    weight: sr.weight
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

    async function next_card(user_id, category, previous = null) {
        await start_studying(user_id, category);
        await activate_cards(user_id, category, 10);
        const weights = await Progress.findAll({
            attributes: ["uuid", "card", "weight"],
            where: {
                weight: { [Op.gt]: -1},
                user: user_id,
                category: category
            }
        })

        // need to invert the weight (11 - a) so that low weight are 
        // more likely to be reviewed
        let weightedArray = weights.flatMap((a, i) => Array(11 - (a.weight+1)).fill(a));
        weightedArray = weightedArray.filter(a => a.uuid != previous);
        const randomIndex = Math.floor(Math.random() * weightedArray.length);

        const next = await Card.findOne({
            where: {
                uuid: weightedArray[randomIndex].card
            }
        })

        const scores = await Progress.findOne({
            attributes: ["n", "weight"],
            where: {
                card: next.uuid,
                user: user_id
            }
        })
        return({...next, score: scores})
    }

    /* 
     * UTILITY FUNCTIONS
     *
     */
    
    /*
     * Import cards from csv file.
     * Must have columns "Front", "Back", and "Category"
     * 
     * x: path to csv file or csv as string
     * 
     */
    
    async function import_from_csv(x, file=true) {
        let cards;
        if(file) {
            cards=await(csv().fromFile(x));
            await add_cards(cards);    
        } else {
            cards=await(csv().fromString(x));
            await add_cards(cards);    
        }
    }

    return {
      init_db,
      close_db,
      check_db,
      reset_db,

      add_card,
      delete_card,
      get_card,
      get_all: get_cards,
      update_card,

      get_categories,
      get_category,

      start_studying,
      study,
      studying_count,
      not_studying_count,
      next_card,
      get_score,
      mastered_count,

      import_from_csv
    }
}

function _round (x, d=0) {
    return(Math.round(x * 10**d) / 10**d)
}

/*
 * Calculate weight for card based on prior weight and confidence in current answer
 */ 
function calc_weight(previous, evaluation) {
    if (previous == null) {
        previous = { n: 0, weight: 0.0 }
    }

    let weight = previous.weight;
    let n = previous.n;

    if(evaluation.score < 3) {
        n = 0;
        weight = 1;
    } else if (evaluation.score < 5) {
        n = n + 1;
        weight = Math.round(2 * Math.max(previous.weight,1));
        weight = Math.min(10, weight);
    } else {
        n = n + 1;
        weight = 4 * Math.max(previous.weight,1);
        weight = Math.min(10, weight);
    }
    return({n: n, weight: weight })
}

/**
 * DEPRECATED:
 * 
 * I found SM-2 to not be enirely applicable to situations where daily study was not
 * expected. Rather than an "interval", we need a weight such that failures increase 
 * the probability of repeating a card, and successes decrease that probability. The 
 * "interval" concept is not as applicable to the study behaviors I anticipate for users 
 * of this platform
 * 
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
            interval = 2
        } else if (previous.n == 1) {
            interval = 4
        } else {
            interval = Math.round(previous.interval * efactor)
        }
    }
    return {n: n, efactor: _round(efactor, 2), interval: _round(interval,2)}
}