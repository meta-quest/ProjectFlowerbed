/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* eslint-disable */
const mysql2 = require('mysql2');
const { default: ShortUniqueId } = require('short-unique-id');

const CONNECTION_CONFIG = {
	host: process.env.proxyEndPoint,
	user: process.env.user,
	database: process.env.database,
	ssl: { rejectUnauthorized: false },
	password: process.env.password,
};
/* eslint-enable */

// eslint-disable-next-line no-undef
exports.handler = async (_event) => {
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
			const playerToken = new ShortUniqueId({
				length: 6,
				dictionary: 'alphanum_upper',
			})();

			connection.query(
				`INSERT INTO players (token) VALUES (?);`,
				[playerToken],
				function (error, _results, _fields) {
					if (error) {
						reject('ERROR ' + error);
						disconnect();
					} else {
						const response = {
							statusCode: 200,
							statusDescription: '200 OK',
							isBase64Encoded: false,
							headers: {
								'Content-Type': 'text/html',
							},
							body: { playerToken },
						};

						resolve(response);
						disconnect();
					}
				},
			);
		}
	});
	return promise;
};
