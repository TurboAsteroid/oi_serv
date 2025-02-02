let DataBase = require('../routes/db');

module.exports = function(app, config, firebase_admin) {
    const schedule = require('node-schedule');
    const mysql = require('mysql2/promise');
    const helper = require('../routes/helper');

    async function createNotification (incidentGroup_id, row_id, user_id, group_id, incident_id, type, calendar_id = null) {
        try {
            //const connection = await DataBase.GetDB();// const connection = await mysql.createConnection(config.dbConfig);
            // const [rows, fields] = await DataBase.Execute('select MAX(row_number) as max_row from grouprows where group_id = ? group by group_id', [group_id]);

            const [user_rows, user_fields] = await DataBase.Execute('select users.*, tokens.token from users left join tokens on tokens.user_id = users.id where users.id = ?', [user_id]);
            const [incident_rows, incident_fields] = await DataBase.Execute('select * from incident where id = ?', [incident_id]);
            const [rows, fields] = await DataBase.Execute("insert into notification (incidentGroup_id, row_id, user_id, user_type, calendar_id) values (?,?,?,?,?)", [incidentGroup_id, row_id, user_id, type, calendar_id]);
            let payload = {
                data: {
                    title: incident_rows[0].title,
                    body: incident_rows[0].description,
                    notification_id: rows.insertId.toString(),
                    incedent_id: incident_id.toString(),
                    incedentGroup_id: incidentGroup_id.toString(),
                    group_id: group_id.toString(),
                    row_id: row_id.toString(),
                    user_id: user_id.toString()
                }
            };
            let options = {
                priority: "normal",
                timeToLive: 60 * 60
            };
            for (let i in user_rows) {
                if (user_rows[i].token) {
                    let result = await firebase_admin.messaging().sendToDevice(user_rows[i].token, payload, options);
                }
            }
            connection.end()
        } catch (e) {
            console.log(new Date() + ' !::::: ' + e)
        }
        // console.warn("!!!!!!", conn);

    }

    async function getNotificationList() {
        try {
            //const connection = await DataBase.GetDB();// const connection = await mysql.createConnection(config.dbConfig);
            // Новые уведомления / первой линии
            const [rows1, fields1] = await DataBase.Execute('select * from incidentgroups where complete = 0 AND (time_sent IS NULL)', []);
            // console.log("rows1", rows1);
            for (let i in rows1) {
                let [rows, fields] = await DataBase.Execute('select * from grouprows left join grouprowusers on grouprowusers.row_id = grouprows.id left join users on grouprowusers.user_id = users.id where grouprows.group_id = ? and row_number = ?', [rows1[i].group_id, rows1[i].current_row]);
                for (let j in rows) {
                    await createNotification(rows1[i].id, rows[j].row_id, rows[j].user_id, rows1[i].group_id, rows1[i].incident_id, "user");
                }

                let [rows_x, fields2] = await DataBase.Execute(`select * from grouprows
                left join grouprowcalendars
                    on grouprowcalendars.row_id = grouprows.id
                where grouprows.group_id = ? and row_number = ?`, [rows1[i].group_id, rows1[i].current_row]);
                for (let j in rows_x) {
                    let [calendar_u, calendar_f] = await DataBase.Execute(`select user_id from calendars_events
                    where calendar_id = ? AND start < NOW() AND end > now()`, [rows_x[j].calendar_id]);
                    for (let l in calendar_u) {
                        await createNotification(rows1[i].id, rows_x[j].row_id, calendar_u[l].user_id, rows1[i].group_id, rows1[i].incident_id, "group", rows_x[j].calendar_id);
                    }
                }
                // console.log("rows1[i].incidentGroup_id, rows1[i].group_id, rows1[i].current_row", rows1[i].id, rows1[i].group_id, rows1[i].current_row);
                let [upd_rows, upd_fields] = await DataBase.Execute('update incidentgroups  SET time_sent = NOW() where id = ? and group_id = ? and current_row = ?', [rows1[i].id, rows1[i].group_id, rows1[i].current_row]);
            }

            const [rows2, fields2] = await DataBase.Execute('select incidentgroups.*, grouprows.row_number, grouprows.delay, group_max_row.max_row ' +
                'from incidentgroups ' +
                'left join grouprows ' +
                'on incidentgroups.group_id = grouprows.group_id ' +
                'and grouprows.row_number = incidentgroups.current_row ' +
                'left join (select group_id, max(row_number) as max_row from grouprows group by group_id) as group_max_row ' +
                'on group_max_row.group_id = incidentgroups.group_id ' +
                // 'where complete = 0 and TIMESTAMPDIFF(MINUTE, time_sent, NOW()) >= grouprows.delay and group_max_row.max_row > grouprows.row_number', []);
                'where complete = 0 and TIMESTAMPDIFF(MINUTE, time_sent, NOW()) >= grouprows.delay', []);
            // console.log("rows2", rows2);
            for (let i in rows2) {
                let current_row = (rows2[i].max_row == rows2[i].current_row ? 1 : (rows2[i].current_row + 1));
                let [rows, fields] = await DataBase.Execute('select * from grouprows left join grouprowusers on grouprowusers.row_id = grouprows.id left join users on grouprowusers.user_id = users.id where grouprows.group_id = ? and row_number = ?', [rows2[i].group_id, current_row]);
                for (let j in rows) {
                    await createNotification(rows2[i].id, rows[j].row_id, rows[j].user_id, rows2[i].group_id, rows2[i].incident_id, "user",);
                }

                let [rows_x, fields_x] = await DataBase.Execute(`select * from grouprows
                left join grouprowcalendars
                    on grouprowcalendars.row_id = grouprows.id
                where grouprows.group_id = ? and row_number = ?`, [rows2[i].group_id, current_row]);
                for (let j in rows_x) {

                    let [calendar_u, calendar_f] = await DataBase.Execute(`select user_id from calendars_events
                    where calendar_id = ? AND start < NOW() AND end > now()`, [rows_x[j].calendar_id]);
                    for (let l in calendar_u) {
                        await createNotification(rows2[i].id, rows_x[j].row_id, calendar_u[l].user_id, rows2[i].group_id, rows2[i].incident_id, "group", rows_x[j].calendar_id);
                    }
                }

                let [upd_rows, upd_fields] = await DataBase.Execute('update incidentgroups SET current_row = ? ,time_sent = NOW() where id = ? and group_id = ? and current_row = ?', [current_row, rows2[i].id, rows2[i].group_id, rows2[i].current_row]);
            }
            //connection.end();

            app.get('io').emit('incidents', await helper.getAllIncidents());
        } catch (e) {
            console.log(new Date() + ' :!:::: ' + e)
        }
    }

    schedule.scheduleJob('0 * * * * *', async function() {
        getNotificationList();
    });
};