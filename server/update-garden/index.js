/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable */
const mysql2 = require('mysql2');

const CONNECTION_CONFIG = {
	host: process.env.proxyEndPoint,
	user: process.env.user,
	database: process.env.database,
	ssl: { rejectUnauthorized: false },
	password: process.env.password,
};
/* eslint-enable */

// eslint-disable-next-line no-undef
exports.handler = async (event) => {
	const params = JSON.parse(event.body);
	const promise = new Promise(function (resolve, reject) {
		let connection = null;
		const connect = () => {
			connection = mysql2.createConnection(CONNECTION_CONFIG);
			connection.connect(function (err) {
				if (err) {
					connection = null;
					reject('ERROR: Unable to connect');
				} else {
					console.log(`connected as id ${connection.threadId}`);
				}
			});
		};

		const disconnect = () => {
			connection.end(function (err) {
				if (err) {
					reject('ERROR: Unable to safely disconnect');
				} else {
					console.log(`Connection ended`);
				}
			});
		};

		connect();

		if (connection) {
			const playerToken = params['token'];
			const gardenId = params['gardenId'];
			const gardenData = params['gardenData'];

			connection.query(
				`SELECT id FROM players WHERE token = '${playerToken}';`,
				function (error, results, _fields) {
					if (error) {
						reject('ERROR ' + error);
						disconnect();
					} else if (results.length == 0) {
						reject('ERROR: No such user');
						disconnect();
					} else if (results.length > 1) {
						reject('ERROR: Duplicate user in database');
						disconnect();
					} else {
						const playerId = results[0]['id'];
						connection.query(
							`UPDATE gardens
              SET garden_data_json = ?
              WHERE player_id = ? AND id = ?;`,
							[gardenData, playerId, gardenId],
							function (error, _results, _fields) {
								if (error) {
									reject('ERROR ' + error);
									disconnect();
								}

								connection.query(
									`SELECT last_modified FROM gardens
                  WHERE player_id = ? AND id = ?;`,
									[playerId, gardenId],
									function (error, results, _fields) {
										if (error) {
											reject('ERROR ' + error);
											disconnect();
										} else if (results.length != 1) {
											// rejecting here because if update command will fail
											// silently if no matching garden is found
											reject('ERROR: No such garden / No garden access');
											disconnect();
										} else {
											const response = {
												statusCode: 200,
												statusDescription: '200 OK',
												isBase64Encoded: false,
												headers: {
													'Content-Type': 'text/html',
												},
												body: { last_modified: results[0]['last_modified'] },
											};

											resolve(response);
											disconnect();
										}
									},
								);
							},
						);
					}
				},
			);
		}
	});
	return promise;
};
