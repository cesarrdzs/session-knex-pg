A session store using Knex.js for PostgreSQL

## Installation

```sh
$ npm install -g session-knex-pg
```

## Usage

Simple example:

```javascript
const KnexStore = require('session-knex-pg');

app.use(session({
  store: new KnexStore(knexConnection, {
      schemaName: 'mySchema',
      tableName: 'sessions',
      gcFrecuency: 10000,
      browserSessionLifetime: 86400 * 1000
  }),
  secret: process.env.FOO_COOKIE_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));
```

## Advanced options

* **schemaName** - Name of the schema in the database (default: public).
* **tableName** - Name of the session table in the database (default: sessions).
* **sync** - Create the sessions table if it doesnt exist (default: false).
* **syncTimeout** - If **sync** is true, how long to wait, in ms, for the sync to complete (default: 3000)
* **gcFrecuency** - Do garbage collection after approximately this many requests. This deletes expired session data from the table. Set to 0 to never do garbage collection. (default: 10000, or approximately every 10,000 requests)
* **timestamps** - If true, the table will have updated_at and created_at columns. (default: false)
* **browserSessionLifetime** - How long, in ms, to remember sessions without a TTL: sessions that only last until the browser is closed. Some session managers, will ignore this and use a reasonable default. (default: 86400000)

## License

[MIT](LICENSE)
