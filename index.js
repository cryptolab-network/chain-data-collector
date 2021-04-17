"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const chainData_1 = require("./src/chainData");
const cacheData_1 = require("./src/cacheData");
const database_1 = require("./src/db/database");
const scheduler_1 = require("./src/scheduler");
const polkadotScheduler_1 = require("./src/polkadotScheduler");
const keys = require('./config/keys');
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        initKusama();
        initPolkadot();
    }
    catch (err) {
        console.error(err);
    }
}))();
function initKusama() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const chainData = new chainData_1.ChainData('wss://kusama-rpc.polkadot.io');
            yield chainData.connect();
            const cacheData = new cacheData_1.Cache('./cache/kusama');
            const db = new database_1.DatabaseHandler();
            yield db.connect(keys.MONGO_ACCOUNT, keys.MONGO_PASSWORD, keys.MONGO_URL, keys.MONGO_PORT, keys.MONGO_DBNAME);
            const scheduler = new scheduler_1.Scheduler(chainData, db, cacheData);
            scheduler.start();
        }
        catch (err) {
            console.error(err);
        }
    });
}
function initPolkadot() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const chainData = new chainData_1.ChainData('wss://rpc.polkadot.io');
            yield chainData.connect();
            const cacheData = new cacheData_1.Cache('./cache/polkadot');
            const db = new database_1.DatabaseHandler();
            yield db.connect(keys.MONGO_ACCOUNT, keys.MONGO_PASSWORD, keys.MONGO_URL, keys.MONGO_PORT, keys.MONGO_DBNAME_POLKADOT);
            const polkadotScheduler = new polkadotScheduler_1.Scheduler(chainData, db, cacheData);
            polkadotScheduler.start();
        }
        catch (err) {
            console.error(err);
        }
    });
}
