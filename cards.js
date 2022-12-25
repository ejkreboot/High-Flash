import * as dotenv from 'dotenv' 
dotenv.config()
import { Sequelize, Op, DataTypes } from 'sequelize';
import mysql from 'mysql2/promise';
import { nanoid } from 'nanoid'
import pkg from 'csvtojson';
const { csv } = pkg;

export function Cards() {
    let config = {
        username: process.env.HIGHFLASH_DB_USERNAME || "admin",
        password: process.env.HIGHFLASH_DB_PASSWORD || "",
        database: process.env.HIGHFLASH_DB_DATABASE || "test",
        host: process.env.HIGHFLASH_DB_HOST || "localhost",
        dialect: process.env.HIGHFLASH_DB_DIALECT || "mysql",
        logging: false
    }
    console.log(config)
    let sequelize = new Sequelize(config);

    async function close_db() {
        await sequelize.close();
        return;
    }

    async function check_db() {
        let ok = true;
        const {host, username, password, database} = config;
        var connection;
        try{
            connection = await mysql.createConnection({
                host:  host,
                user: username,
                password: password,
                database: database
            });
            await connection.query('SELECT * FROM Cards LIMIT 1');
            connection.end();
        } catch(e) {
            if(connection.end) {
                connection.end()
            }
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
            init_db();
        }
    }

    async function init_db() {
        const ok = await check_db();
        if(!ok) {
            const {host, username, password, database} = config;
            const connection = await mysql.createConnection({
                host:  host,
                user: username,
                password: password
            });
            const res = await connection.query('CREATE DATABASE IF NOT EXISTS ' + config.database);
            await Card.sync();
            await Progress.sync();
            connection.end();
        }
        return(true);
    }

    const Card = sequelize.define('Card', 
        {
            uuid: {
                type: DataTypes.UUID,
                primaryKey: true
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
     * of each card so that repetition intervals may be 
     * adjusted accordingly.
     */
    const Progress = sequelize.define('Progress', 
        {
            uuid: {
                type: DataTypes.UUID,
                primaryKey: true
            },
            card: DataTypes.UUID,
            user: DataTypes.UUID,
            n: DataTypes.INTEGER,
            efactor: DataTypes.FLOAT,
            interval: DataTypes.INTEGER,
            category: DataTypes.STRING(100)
        },
        {
            indexes: [
                {
                    unique: true,
                    fields: ['card']
                },
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
        const cards = await Card.findAll( { where });
        return cards;
    }

    async function get_card(uuid) {
        let card = await Card.findByPk(uuid);
        return card;
    }

    async function delete_card(uuid) {
        await Card.destroy({
            where: { uuid: uuid },
        });
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
                interval: { [Op.gt]: -1}
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
                interval: { [Op.gt]: 10}
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
        let cards = await Card.findAll({
            attributes: ['uuid', 'category'],
            where: {
                category: category
            }
        })
        let progress = await Progress.findAll({
            attributes: ['uuid', 'card', 'category'],
            where: {
                user: user_id,
                category: category
            }
        })

        if(cards.length > progress.length) {
            let cards_to_init = []
            let ids = progress.map(p => p.card);
            for (const c of cards) {
                if(ids.indexOf(c.uuid) < 0) {
                    cards_to_init.push({user_id: user_id, card_id: c.uuid, category: c.category})
                }
            }
            await initialize_cards(cards_to_init);

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
    async function initialize_cards(cards) {
        const rows = cards.map(o => {return {uuid: nanoid(), 
                                             card: o.card_id, 
                                             user: o.user_id, 
                                             n: 0.0, 
                                             efactor: 2.5, 
                                             interval: -1, 
                                             category: o.category}})
        await Progress.bulkCreate(rows);
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

        const ids = inactive.map(i => i.uuid);
        await Progress.update(
            { 
                interval: 1
            },
            { 
                where: { 
                    uuid: ids
                }
            }
        );
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
     * 
     */
    
    async function import_from_csv(path) {
        const cards=await(csv().fromFile(path));
        for(let a of cards) {
            await this.add_card(a.Front, a.Back, a.Category);
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