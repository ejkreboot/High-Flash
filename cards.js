import { Sequelize, Model, DataTypes } from 'sequelize';
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
        front: DataTypes.TEXT,
        back: DataTypes.TEXT,
        category: DataTypes.TEXT,
        uuid: {
            type: DataTypes.UUID,
            primaryKey: true
        }
    });

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
        await User.update(
            { front: card.front,
              back: card.back,
              category: card.category }, 
            { where: { uuid: card.uuid }});
        return card;
    }  

    return {
      add_card: add_card,
      delete_card: delete_card,
      get_card: get_card,
      get_categories: get_categories,
      get_category: get_category,
      get_all: get_cards,
      update_card: update_card
    }
}
