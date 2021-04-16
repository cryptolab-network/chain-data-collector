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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cache = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
class Cache {
    constructor(folder) {
        this.folder = folder;
        if (!fs_1.default.existsSync(folder)) {
            fs_1.default.mkdirSync(folder);
        }
    }
    fetch(type) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const filePath = path_1.default.join(this.folder, type + '.json');
                fs_1.default.readFile(filePath, 'utf8', (err, data) => {
                    if (err !== undefined) {
                        reject(err);
                    }
                    else {
                        resolve(JSON.parse(data));
                    }
                });
            });
        });
    }
    update(type, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const filePath = path_1.default.join(this.folder, type + '.json');
                fs_1.default.writeFile(filePath, JSON.stringify(data), (err) => {
                    if (err !== undefined) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });
        });
    }
}
exports.Cache = Cache;
;
