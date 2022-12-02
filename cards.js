import { Sequelize, Op, DataTypes } from 'sequelize';
import { nanoid } from 'nanoid'

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
     * The Flash model keeps track of each users mastery 
     * of each card so that repetition intervals may be 
     * adjusted accordingly.
     */
    const Flash = sequelize.define('Flash', {
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
        await Flash.sync();
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
     * STUDY & SCORING FUNCTIONS
     */

    async function check_user(id, category) {
        await sync_all();
        let flashes = await Flash.findAll({
            attributes: ['uuid'],
            where: {
                user: id
            }
        })
        let cards = await Card.findAll({
            attributes: ['uuid'],
            where: {
                category: category
            }
        })

        if(flashes.length == 0 || flashes.length != cards.length) {
            return(false)
        } else {
            return(true)
        }
    }

    /*
     * count the active cards for the specified user_id and category
     */
    async function active_cards(user_id, category) {
        await sync_all();
        let flashes = await Flash.findAll({
            attributes: ['uuid'],
            where: {
                user: user_id,
                category: category,
                interval: { [Op.gt]: -1}
            }
        })
        return(flashes.length)
    }

    /*
     * count the active cards for the specified user_id and category
     */
    async function active_card_count(user_id, category) {
        await sync_all();
        let flashes = await Flash.findAll({
            attributes: ['uuid'],
            where: {
                user: user_id,
                category: category,
                interval: { [Op.gt]: -1}
            }
        })
        return(flashes.length)
    }

    /*
     * count the inactive cards for the specified user_id and category
     */
    async function inactive_card_count(user_id, category) {
        await sync_all();
        let flashes = await Flash.findAll({
            attributes: ['uuid'],
            where: {
                user: user_id,
                category: category,
                interval: -1
            }
        })
        return(flashes.length)
    }

    /*
     * make sure all the cards for this category are in the user's study history
     * creating new entries where needed
     */
    async function init_study(user_id, category) {
        await sync_all();
        let cards = await Card.findAll({
            attributes: ['uuid'],
            where: {
                category: category
            }
        })
        let flashes = await Flash.findAll({
            attributes: ['uuid'],
            where: {
                user: user_id,
                category: category
            }
        })

        if(cards.length > flashes.length) {
            for (const c of cards) {
                let flash = await Flash.findOne(
                {
                    attributes: ['uuid'],
                    where: {
                        user: user_id,
                        card: c.uuid
                    }
                })
                if(flash == null) {
                    await init_flash(user_id, c.uuid);
                }
            }
        }    
        return;
    }

    /*
     * intialize card for studying by this user. 
     * private function.
     */
    async function init_flash(user_id, card_id, score = null) {
        let interval = 0;
        let count = 0;
        let flash = await Flash.findOne({
            attributes: ['n', 'efactor', 'interval'],
            where: {
                user: user_id,
                card: card_id
            }
        })
        if(flash== null) {
            // this card is not yet setup for this user. Initialize.
            let uuid = nanoid();
            let card = await Card.findOne({
                attributes: ['category'],
                where: { 
                    uuid: card_id
                }
            })
            await Flash.create({
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
     * Update interval and efactor based on study score 
     */
    async function study(user_id, card_id, score) {
        let sr = null;
        const flash = await Flash.findOne({
            attributes: ['n', 'efactor', 'interval'],
            where: {
                user: user_id,
                card: card_id
            }
        })
        if(flash== null) {
            throw Error ('cannot study unitialized card (cards.js line 279)')
        } else {
            const previous = { n: flash.n, 
                               efactor: flash.efactor, 
                               interval: flash.interval };
            const evaluation = { score: score };
            sr = sm2(previous, evaluation);
            await Flash.update(
                { 
                    n: sr.n,
                    efactor: sr.factor,
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

    return {
      add_card: add_card,
      delete_card: delete_card,
      get_card: get_card,
      get_categories: get_categories,
      get_category: get_category,
      get_all: get_cards,
      init_study: init_study,
      update_card: update_card,
      study: study,
      active_card_count: active_card_count,
      inactive_card_count: inactive_card_count
    }
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
            interval = Math.ceil(previous.interval * efactor)
        }
    }
    return {n, efactor, interval}
}