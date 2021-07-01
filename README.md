# chain-data-collector

## Build and Setup

0. Setup your own MongoDB Server. (We use MongoDB Community Server V4.4.4)
0. Setup your own Redis Server.

Ref. https://redis.io/topics/quickstart

1. ```npm install```
2. ```npm run build```
3. Create ```dev.js``` in ```/config``` folder
and paste the following content to the .js file

```js=
module.exports = {
  PORT: 3000,
  KUSAMA_WSS: 'wss://kusama.api.onfinality.io/public-ws',
  POLKADOT_WSS: 'wss://polkadot.api.onfinality.io/public-ws',
  API_1KV_KUSAMA: 'https://kusama.w3f.community',
  API_1KV_POLKADOT: 'https://polkadot.w3f.community',
  MONGO_ACCOUNT: '',
  MONGO_PASSWORD: '',
  MONGO_URL: '127.0.0.1',
  MONGO_PORT: 27017,
  MONGO_DBNAME: 'kusama',
  MONGO_DBNAME_POLKADOT: 'polkadot',
  PAGE_SIZE: 1500,
  REDIS_URL: '127.0.0.1',
  REDIS_PORT: 6379,
}
```

`KUSAMA_WSS` and `POLKADOT_WSS` indicate the Polkadot/Kusama websocket server address

`API_1KV_KUSAMA` and `API_1KV_POLKADOT` indicate the HTTP server used for hosting One Thousand Validator Program

`MONGO_ACCOUNT` and `MONGO_PASSWORD` can be ignored in dev version.

`MONGO_URL` and `MONGO_PORT` indicate the address of your MongoDB server.

`MONGO_DBNAME` and `MONGO_DBNAME_POLKADOT` indicate the DB name used for either chain.

`REDIS_URL` and `REDIS_PORT` indicate the redis server address.

`PAGE_SIZE` is deprecated.

`PORT` is deprecated.

## Run

1. Start MongoDB server

2. Run `npm run startPolkadot` and `npm run startPolkadot` to start collecting chain data from both chains.
