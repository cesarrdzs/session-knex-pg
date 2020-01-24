const Store = require('express-session').Store
const oneDay = 86400

module.exports = class KnexStore extends Store {
    constructor (knex, options) {
        super()
        this.knex = knex

        this.options = Object.assign({
            schemaName: 'public',
            tableName: 'sessions',
            sync: false,
            syncTimeout: 3000,
            gcFrecuency: 10000,
            timestamps: false,
            browserSessionLifetime: oneDay * 1000
        }, options || {})

        this.synced = false

        if (this.options.sync) this.pgsqlSync()
        else this.synced = true
    }

    async pgsqlSync () {
        const exists = await this.knex.withSchema(this.options.schemaName).hasTable(this.options.tableName)
        if (!exists) {
            await this.knex.withSchema(this.options.schemaName).createTableIfNotExists(this.options.tableName, (table) => {
                table.string('id', 128).primary()
                table.bigInteger('time_updated')
                table.text('data')
                if (this.options.timestamps) {
                    table.timestamps()
                }
            })
        }
        this.synced = true
    }

    waitForSync () {
        if (this.synced) return Promise.resolve()

        return new Promise((resolve, reject) => {
            const end = Date.now() + this.options.syncTimeout
            const timerId = setInterval(() => {
                if (this.synced) {
                    clearInterval(timerId)
                    return resolve()
                }
                if (Date.now() > end) {
                    clearInterval(timerId)
                    const errMessage = `could not sync() the ${this.options.tableName} table`
                    return reject(errMessage)
                }
            }, 100)
        })
    }

    async get (sid, cb) {
        await this.waitForSync()

        if (this.options.gcFrecuency > 0) {
            if (getRandomInt(1, this.options.gcFrecuency) === 1) this.gc()
        }

        try {
            const rows = await this.knex(this.options.tableName).withSchema(this.options.schemaName)
                .where('id', sid)
                .andWhere('time_updated', '>=', currentTimestamp())
                .limit(1)
                .select({
                    sess: this.knex.raw("CONVERT_FROM(DECODE(data, 'BASE64'), 'UTF-8')")
                })

            if (!rows || rows.length === 0) return cb(null, null)
            const sess = JSON.parse(rows[0].sess)
            if (sess.cookie === undefined) return cb(null, null)
            return cb(null, sess)
        } catch (error) {
            return cb(error, null)
        }
    }

    async set (sid, sess, cb) {
        await this.waitForSync()

        const expires = getExpireTime(sess.cookie.maxAge)
        sess.cookie.expires = expires

        try {
            const rows = await this.knex(this.options.tableName).withSchema(this.options.schemaName)
                .where('id', sid)

            if (rows && rows.length > 0) {
                await this.knex(this.options.tableName).withSchema(this.options.schemaName)
                    .where('id', sid)
                    .update({
                        data: this.knex.raw("ENCODE(CONVERT_TO(?, 'UTF-8'), 'BASE64')", JSON.stringify(sess)),
                        time_updated: expires
                    })
                if (cb) return cb()
            } else {
                await this.knex(this.options.tableName).withSchema(this.options.schemaName)
                    .insert({
                        id: sid,
                        data: this.knex.raw("ENCODE(CONVERT_TO(?, 'UTF-8'), 'BASE64')", JSON.stringify(sess)),
                        time_updated: expires
                    })
                if (cb) return cb()
            }
        } catch (error) {
            if (cb) return cb(null, error)
        }
    }

    async destroy (sid, cb) {
        try {
            await this.waitForSync()

            this.knex(this.options.tableName).withSchema(this.options.schemaName)
                .where('id', sid)
                .del()

            if (cb) return cb(null)
        } catch (error) {
            throw new Error(error)
        }

        // this.waitForSync().then(() => {
        //     this.knex(this.options.tableName).withSchema(this.options.schemaName)
        //         .where('id', sid)
        //         .del().then(() => {
        //             if (cb) return cb(null)
        //         })
        // }).catch(err => {
        //     if (cb) return cb(err)
        // })
    }

    async gc () {
        try {
            await this.waitForSync()

            await this.knex(this.options.tableName).withSchema(this.options.schemaName)
                .where('time_updated', '<', currentTimestamp())
                .del()

            return true
        } catch (error) {
            throw new Error(error)
        }

        // return this.waitForSync().then(() => {
        //     return this.knex(this.options.tableName).withSchema(this.options.schemaName)
        //         .where('time_updated', '<', currentTimestamp())
        //         .del()
        // })
    }

    async touch (sid, sess, cb) {
        const expires = getExpireTime(sess.cookie.maxAge)

        await this.waitForSync()
        await this.knex(this.options.tableName).withSchema(this.options.schemaName)
            .where('id', sid)
            .update('time_updated', expires)

        if (cb) cb(null)

        // this.waitForSync().then(() => {
        //     this.knex(this.options.tableName).withSchema(this.options.schemaName)
        //         .where('id', sid)
        //         .update('time_updated', expires)
        //         .then(() => {
        //             if (cb) cb(null)
        //         })
        // }).catch(err => {
        //     if (cb) cb(err)
        // })
    }
}

function getRandomInt (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function currentTimestamp () {
    return Math.ceil(Date.now() / 1000)
}

function getExpireTime (maxAge) {
    let ttl = this.ttl
    ttl = ttl || (typeof maxAge === 'number' ? maxAge / 1000 : oneDay)
    ttl = Math.ceil(ttl + currentTimestamp())
    return ttl
}
