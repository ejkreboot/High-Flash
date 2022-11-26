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
        uuid: {
            type: DataTypes.UUID,
            primaryKey: true
        }
    });

    async function add_card(front, back) {
        await Card.sync();
        let uuid = nanoid();
        await Card.create({
            front: front,
            back: back,
            uuid: uuid 
        });
        return uuid;
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

    return {
      add: add_card,
      delete: delete_card,
      get: get_card,
      get_all: get_cards
    }
}
