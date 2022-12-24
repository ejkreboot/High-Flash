import * as dotenv from 'dotenv';
dotenv.config();

const env = process.env.NODE_ENV; // 'dev' or 'test'

const test = {
        db: {
                username: process.env.AWS_DBS_USERNAME || "admin",
                password: process.env.AWS_DBS_PASSWORD || "",
                database: "test",
                host: process.env.AWS_DBS_HOST || "localhost",
                dialect: "mysql",
                logging: false
        }
};

const dev = {
        db: {
                username: process.env.AWS_DBS_USERNAME || "admin",
                password: process.env.AWS_DBS_PASSWORD || "",
                database: "highflash",
                host: process.env.AWS_DBS_HOST || "localhost",
                dialect: "mysql",
                logging: false
        }
};

const production = dev;

const config = {
 production,
 dev,
 test
};

export default config[env];
